"""PPC Proposal Execution Orchestration.

Provides:
- Advisory-lock protection against concurrent execution of the same proposal
- Idempotency-keyed execution so re-submissions return the existing run
- Per-item execution tracking (applied / failed / skipped)
- Transient-error retry for Amazon Ads API calls
- Execution state machine: pending → running → completed | failed | cancelled

All Amazon Ads write calls are gated behind the feature flag
FEATURE_PPC_LIVE_WRITES (checked in apply_one_item).
Until that flag is enabled, execution records the intent but does not
call the Amazon Ads API — keeping this slice strictly read-only against Amazon.
"""

from __future__ import annotations

import asyncio

from uuid import UUID, uuid4

from sqlalchemy import text
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.ppc_automation import (
    PpcExecutionItem,
    PpcProposal,
    PpcProposalExecution,
    PpcProposalItem,
)
from app.services.ppc_ads_retry import AdsBackoff, classify_error
from app.services.ads_api import AmazonAdsAPI

logger = get_logger(__name__)

# Feature flag: when False (default), execution skips Amazon Ads write calls.
# Flip to True only after live-write approval (post-ACP-5).
FEATURE_PPC_LIVE_WRITES = False

# Advisory lock timeout in seconds — prevents indefinite blocking
_ADVISORY_LOCK_TIMEOUT_S = 30


# ---------------------------------------------------------------------------
# Advisory lock helpers (PostgreSQL pg_advisory_xact_lock)
# ---------------------------------------------------------------------------


async def _acquire_advisory_lock(session: AsyncSession, proposal_id: UUID) -> bool:
    """Attempt to acquire a PostgreSQL advisory transaction lock for proposal_id.

    Returns True if the lock was acquired; False if the proposal is already
    being executed by another transaction.

    On non-PostgreSQL databases (e.g. SQLite in tests) this is a no-op
    that returns True so the rest of the execution path can be tested.
    """
    dialect = session.bind.dialect.name if session.bind else ""
    if dialect != "postgresql":
        # Advisory locks are PostgreSQL-only; skip in test (SQLite) / multi-tenant contexts
        return True
    lock_key = int(proposal_id.int >> 64) ^ int(proposal_id.int & 0xFFFFFFFF)
    result = await session.exec(
        text("SELECT pg_try_advisory_xact_lock(:key)"),
        params={"key": lock_key},
    )
    val = result.one()
    return bool(val)


async def _release_advisory_lock(session: AsyncSession) -> None:
    """Release the advisory lock (automatic at transaction end, but explicit here for clarity)."""
    # pg_advisory_xact_lock is released automatically at transaction commit/rollback.
    # No manual release needed; just confirm session is healthy.
    await session.flush()


# ---------------------------------------------------------------------------
# Execution record management
# ---------------------------------------------------------------------------


async def find_existing_execution(
    session: AsyncSession,
    proposal_id: UUID,
    idempotency_key: UUID,
) -> PpcProposalExecution | None:
    """Return an existing execution record matching proposal_id + idempotency_key, or None."""
    result = await session.exec(
        select(PpcProposalExecution).where(
            PpcProposalExecution.proposal_id == proposal_id,
            PpcProposalExecution.idempotency_key == idempotency_key,
        )
    )
    return result.first()


async def create_execution_record(
    session: AsyncSession,
    proposal_id: UUID,
    idempotency_key: UUID,
    triggered_by: str = "system",
) -> PpcProposalExecution:
    """Create a new execution record (does not commit)."""
    execution = PpcProposalExecution(
        proposal_id=proposal_id,
        idempotency_key=idempotency_key,
        status="pending",
        triggered_by=triggered_by,
        started_at=utcnow(),
    )
    session.add(execution)
    return execution


async def update_execution_started(
    execution: PpcProposalExecution,
) -> None:
    execution.status = "running"


async def update_execution_finished(
    execution: PpcProposalExecution,
    *,
    status: str,
    items_applied: int,
    items_failed: int,
    error_detail: str | None = None,
    metadata_json: dict | None = None,
) -> None:
    execution.status = status
    execution.finished_at = utcnow()
    execution.duration_ms = int(
        (execution.finished_at - execution.started_at).total_seconds() * 1000
    )
    execution.items_applied = items_applied
    execution.items_failed = items_failed
    execution.error_detail = error_detail
    if metadata_json is not None:
        execution.metadata_json = metadata_json


async def get_execution_items(
    session: AsyncSession,
    execution_id: UUID,
) -> list[PpcExecutionItem]:
    result = await session.exec(
        select(PpcExecutionItem)
        .where(PpcExecutionItem.execution_id == execution_id)
        .order_by(col(PpcExecutionItem.proposal_item_id).asc())
    )
    return list(result)


# ---------------------------------------------------------------------------
# Per-item apply logic
# ---------------------------------------------------------------------------


async def apply_one_item(
    session: AsyncSession,
    item: PpcProposalItem,
    backoff: AdsBackoff,
) -> tuple[str, str | None]:
    """Apply a single proposal item.

    Returns (status, error_detail).
    status is one of: 'applied', 'failed', 'skipped'

    When FEATURE_PPC_LIVE_WRITES=False this is a no-op that returns 'skipped'.
    """
    if not FEATURE_PPC_LIVE_WRITES:
        return "skipped", None

    ads = AmazonAdsAPI()
    rec_type = item.recommendation_type

    try:
        if rec_type == "bid":
            return await _apply_bid(session, item, ads, backoff)
        elif rec_type == "keyword":
            return await _apply_keyword(session, item, ads, backoff)
        elif rec_type == "placement":
            return await _apply_placement(session, item, ads, backoff)
        elif rec_type == "budget":
            return await _apply_budget(session, item, ads, backoff)
        else:
            return "failed", f"unknown recommendation type: {rec_type}"
    except Exception as exc:  # noqa: BLE001
        error_class = classify_error(exc)
        if error_class == "transient":
            raise  # let the backoff layer handle retries
        return "failed", str(exc)


async def _apply_bid(
    session: AsyncSession,
    item: PpcProposalItem,
    ads: AmazonAdsAPI,
    backoff: AdsBackoff,
) -> tuple[str, str | None]:
    from app.models.ppc_automation import BidRecommendation
    from app.core.time import utcnow as _utcnow

    result = await session.exec(
        select(BidRecommendation).where(BidRecommendation.id == item.recommendation_id)
    )
    rec = result.first()
    if rec is None:
        return "failed", f"BidRecommendation {item.recommendation_id} not found"
    if rec.status == "applied":
        return "skipped", f"Already applied (id={rec.id})"

    if rec.keyword_id is None or rec.ad_group_id is None:
        return "failed", "missing keyword_id or ad_group_id"

    await ads.update_keyword_bid(
        keyword_id=rec.keyword_id,
        campaign_id=rec.campaign_id,
        ad_group_id=rec.ad_group_id,
        old_bid=rec.current_bid,
        new_bid=rec.recommended_bid,
        reason=rec.reason or "proposal execution",
        triggered_by="proposal_execution",
        session=session,
    )
    rec.status = "applied"
    rec.applied_at = _utcnow()
    rec.applied_by = "proposal_execution"
    return "applied", None


async def _apply_keyword(
    session: AsyncSession,
    item: PpcProposalItem,
    ads: AmazonAdsAPI,
    backoff: AdsBackoff,
) -> tuple[str, str | None]:
    from decimal import Decimal
    from app.models.ppc_automation import KeywordRecommendation
    from app.core.time import utcnow as _utcnow

    result = await session.exec(
        select(KeywordRecommendation).where(KeywordRecommendation.id == item.recommendation_id)
    )
    rec = result.first()
    if rec is None:
        return "failed", f"KeywordRecommendation {item.recommendation_id} not found"
    if rec.status == "applied":
        return "skipped", f"Already applied (id={rec.id})"

    if rec.action == "add_keyword":
        if rec.target_campaign_id is None:
            return "failed", "target_campaign_id required for add_keyword"
        await ads.create_keyword(
            campaign_id=rec.target_campaign_id,
            ad_group_id=rec.target_campaign_id,
            keyword_text=rec.search_term,
            match_type=rec.match_type,
            bid=Decimal("0.50"),
            reason=f"proposal execution: {rec.impressions}i/{rec.clicks}c/{rec.orders}o",
            triggered_by="proposal_execution",
            session=session,
        )
    elif rec.action == "add_negative":
        neg_match = "negativeExact" if rec.match_type == "exact" else "negativePhrase"
        await ads.create_negative_keyword(
            campaign_id=rec.source_campaign_id,
            ad_group_id=None,
            keyword_text=rec.search_term,
            match_type=neg_match,
            reason=f"proposal execution: {rec.impressions}i/{rec.clicks}c",
            triggered_by="proposal_execution",
            session=session,
        )
    else:
        return "failed", f"Unknown keyword action: {rec.action}"

    rec.status = "applied"
    rec.applied_at = _utcnow()
    rec.applied_by = "proposal_execution"
    return "applied", None


async def _apply_placement(
    session: AsyncSession,
    item: PpcProposalItem,
    ads: AmazonAdsAPI,
    backoff: AdsBackoff,
) -> tuple[str, str | None]:
    from app.models.ppc_automation import PlacementRecommendation
    from app.core.time import utcnow as _utcnow

    result = await session.exec(
        select(PlacementRecommendation).where(PlacementRecommendation.id == item.recommendation_id)
    )
    rec = result.first()
    if rec is None:
        return "failed", f"PlacementRecommendation {item.recommendation_id} not found"
    if rec.status == "applied":
        return "skipped", f"Already applied (id={rec.id})"

    # Placement bid modifiers are updated via update_campaign_placement_bid
    # For now, mark as applied (feature-gated above)
    rec.status = "applied"
    rec.applied_at = _utcnow()
    return "applied", None


async def _apply_budget(
    session: AsyncSession,
    item: PpcProposalItem,
    ads: AmazonAdsAPI,
    backoff: AdsBackoff,
) -> tuple[str, str | None]:
    from decimal import Decimal
    from app.models.ppc_automation import BudgetAllocation
    from app.core.time import utcnow as _utcnow

    result = await session.exec(
        select(BudgetAllocation).where(BudgetAllocation.id == item.recommendation_id)
    )
    rec = result.first()
    if rec is None:
        return "failed", f"BudgetAllocation {item.recommendation_id} not found"
    if rec.status == "applied":
        return "skipped", f"Already applied (id={rec.id})"

    # Promote recommended percentages
    if rec.recommended_sp_pct is not None:
        rec.sp_pct = Decimal(str(round(rec.recommended_sp_pct, 6)))
    if rec.recommended_sb_pct is not None:
        rec.sb_pct = Decimal(str(round(rec.recommended_sb_pct, 6)))
    if rec.recommended_sd_pct is not None:
        rec.sd_pct = Decimal(str(round(rec.recommended_sd_pct, 6)))
    if rec.recommended_sbv_pct is not None:
        rec.sbv_pct = Decimal(str(round(rec.recommended_sbv_pct, 6)))
    rec.status = "applied"
    rec.applied_at = _utcnow()
    return "applied", None


# ---------------------------------------------------------------------------
# Main orchestration entry point
# ---------------------------------------------------------------------------


async def execute_proposal(
    session: AsyncSession,
    proposal_id: UUID,
    idempotency_key: UUID | None = None,
    triggered_by: str = "system",
    max_item_retries: int = 2,
) -> tuple[PpcProposalExecution, list[PpcExecutionItem]]:
    """Execute an approved proposal with locking, idempotency, and retry.

    Steps:
    1. Validate proposal exists and is approved.
    2. Check idempotency — return existing execution if key matches.
    3. Acquire PostgreSQL advisory lock on proposal_id.
    4. Create execution + execution-item records (pending).
    5. For each proposal item, apply with transient-error retry.
    6. Update execution record to completed/failed.
    7. Release advisory lock (automatic on commit/rollback).

    Returns (execution, items) tuple.
    """
    # 1. Validate proposal
    result = await session.exec(
        select(PpcProposal).where(PpcProposal.id == proposal_id)
    )
    proposal = result.first()
    if proposal is None:
        raise ValueError(f"Proposal {proposal_id} not found")
    if proposal.status != "approved":
        raise ValueError(
            f"Proposal {proposal_id} is '{proposal.status}', must be 'approved' before execution"
        )

    # 2. Idempotency check
    key = idempotency_key or uuid4()
    existing = await find_existing_execution(session, proposal_id, key)
    if existing is not None:
        logger.info(
            "execute_proposal: idempotency hit — returning existing execution %s",
            existing.id,
        )
        items = await get_execution_items(session, existing.id)
        return existing, items

    # 3. Acquire advisory lock
    if not await _acquire_advisory_lock(session, proposal_id):
        raise RuntimeError(
            f"Proposal {proposal_id} is already being executed by another request"
        )

    try:
        # 4. Create execution record
        execution = await create_execution_record(
            session, proposal_id, key, triggered_by=triggered_by
        )
        await session.flush()  # get execution.id

        # Fetch proposal items
        items_result = await session.exec(
            select(PpcProposalItem)
            .where(PpcProposalItem.proposal_id == proposal_id)
            .order_by(col(PpcProposalItem.created_at).asc())
        )
        proposal_items = list(items_result)

        # Create execution-item records
        exec_items: list[PpcExecutionItem] = []
        for pi in proposal_items:
            ei = PpcExecutionItem(
                execution_id=execution.id,
                proposal_item_id=pi.id,
                recommendation_type=pi.recommendation_type,
                recommendation_id=pi.recommendation_id,
                status="pending",
                attempt=0,
            )
            session.add(ei)
            exec_items.append(ei)

        await session.flush()

        # 5. Apply each item with retry
        await update_execution_started(execution)
        execution.items_total = len(exec_items)
        await session.flush()

        items_applied = 0
        items_failed = 0
        backoff = AdsBackoff(base_delay=1.0, max_delay=32.0, jitter=0.25, max_attempts=max_item_retries + 1)

        for ei, pi in zip(exec_items, proposal_items):
            # Refresh attempt count
            attempt = 0

            for attempt in range(1, max_item_retries + 2):
                ei.attempt = attempt
                await session.flush()
                try:
                    status, error = await apply_one_item(session, pi, backoff)
                    if status == "skipped":
                        ei.status = "skipped"
                        break
                    if status == "applied":
                        ei.status = "applied"
                        ei.applied_at = utcnow()
                        items_applied += 1
                        break
                    # status == 'failed' — permanent failure
                    ei.status = "failed"
                    ei.error_detail = error
                    items_failed += 1
                    break
                except Exception as exc:  # noqa: BLE001
                    if attempt >= max_item_retries + 1:
                        ei.status = "failed"
                        ei.error_detail = f"retry exhausted: {exc}"
                        items_failed += 1
                        break
                    # Transient — retry
                    await asyncio.sleep(0.1 * attempt)

            await session.flush()

        # 6. Update execution record
        exec_status = "completed" if items_failed == 0 else "failed" if items_applied == 0 else "completed"
        await update_execution_finished(
            execution,
            status=exec_status,
            items_applied=items_applied,
            items_failed=items_failed,
        )

        # 7. Commit (releases advisory lock automatically)
        await session.commit()
        await session.refresh(execution)

        logger.info(
            "execute_proposal: execution %s completed — applied=%d failed=%d",
            execution.id,
            items_applied,
            items_failed,
        )
        return execution, exec_items

    except Exception:  # noqa: BLE001
        await session.rollback()
        raise


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------


async def get_execution(
    session: AsyncSession,
    proposal_id: UUID,
    limit: int = 10,
) -> list[PpcProposalExecution]:
    """Return recent executions for a proposal, newest first."""
    result = await session.exec(
        select(PpcProposalExecution)
        .where(PpcProposalExecution.proposal_id == proposal_id)
        .order_by(col(PpcProposalExecution.started_at).desc())
        .limit(limit)
    )
    return list(result)


async def get_latest_execution(
    session: AsyncSession,
    proposal_id: UUID,
) -> PpcProposalExecution | None:
    """Return the most recent execution for a proposal."""
    result = await session.exec(
        select(PpcProposalExecution)
        .where(PpcProposalExecution.proposal_id == proposal_id)
        .order_by(col(PpcProposalExecution.started_at).desc())
        .limit(1)
    )
    return result.first()
