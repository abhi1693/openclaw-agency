"""PPC Automation Engine API — Phase 1A endpoints."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import col, select, text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_session
from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.ppc_automation import (
    BidRecommendation,
    BidSuggestion,
    BudgetAllocation,
    BudgetPacingTarget,
    CampaignGoal,
    CampaignPlan,
    DaypartingSchedule,
    KeywordHarvestSuggestion,
    KeywordRecommendation,
    PlacementRecommendation,
    PpcAutomationSettings,
    PpcChangeLog,
)
from app.schemas.ppc_automation import (
    PpcEntitySnapshotsResponse,
    PpcFreshnessResponse,
    PpcProposalResponse,
    ProposalDiffResponse,
    PpcSyncStatusResponse,
)
from app.services.ppc_entity_snapshots import (
    get_entity_freshness,
    get_sync_status,
    list_entity_snapshots,
    sync_campaign_entity_snapshots,
)
from app.services.ppc_run_history import (
    list_run_history,
    log_run_end,
    log_run_start,
)
from app.services.ppc_proposals import (
    approve_proposal as approve_ppc_proposal,
    compute_proposal_diff,
    create_proposal as create_ppc_proposal,
    get_proposal_with_items,
    list_proposals as list_ppc_proposals,
    reject_proposal as reject_ppc_proposal,
)
from app.services.ppc_execution import (
    execute_proposal,
    get_execution,
    get_latest_execution,
    get_execution_items,
    FEATURE_PPC_LIVE_WRITES,
)
from app.services.ads_api import AmazonAdsAPI
from app.services.budget_allocator import generate_budget_allocations
from app.services.ad_metrics_sync import sync_ad_metrics_from_api
from app.services.campaign_builder import (
    generate_v2_campaign_plan,
    get_campaign_structure,
    get_products_list,
)
from app.services.campaign_creator import generate_campaign_plan
from app.services.negative_pattern_detector import detect_negative_patterns
from app.services.placement_optimizer import generate_placement_recommendations
from app.services.ppc_scheduler import run_optimizer
from app.services.ppc_automation.budget_pacer import get_budget_pacing
from app.services.ppc_automation.dayparting import (
    get_dayparting_schedule,
    get_hourly_performance,
)
from app.services.tacos_calculator import calculate_tacos, metrics_to_dict

router = APIRouter(prefix="/ppc/automation", tags=["ppc-automation"])
logger = get_logger(__name__)

SESSION_DEP = Depends(get_session)

# ---------------------------------------------------------------------------
# Request / response schemas (inline — no separate schemas file needed yet)
# ---------------------------------------------------------------------------


class AutomationSettingsUpsert(BaseModel):
    target_acos: Decimal
    min_bid: Decimal
    max_bid: Decimal
    bid_change_limit_pct: Decimal = Decimal("0.2")
    dayparting_enabled: bool = False
    auto_negative_enabled: bool = False
    auto_keyword_enabled: bool = False
    # v2 bid engine fields
    damping_factor: float = 0.3
    max_step_down_pct: float = 0.15
    max_step_up_pct: float = 0.10
    launch_mode: bool = False
    launch_mode_until: date | None = None
    exploration_pct: float = 0.15
    # Phase 6: TACoS target mode
    target_mode: str = "acos"   # 'acos' | 'tacos'
    target_tacos: float | None = None
    # Safety: protected keywords (JSON array as string, e.g. '["sanitizer","wipes"]')
    protected_keywords: str | None = None


class ApplyBidRecsRequest(BaseModel):
    recommendation_ids: list[UUID]
    triggered_by: str = "manual"


class ApplyKeywordRecsRequest(BaseModel):
    recommendation_ids: list[UUID]
    triggered_by: str = "manual"


class RunOptimizerRequest(BaseModel):
    parent_asin: str | None = None
    run_bid: bool = True
    run_keywords: bool = True
    run_patterns: bool = True
    run_budget: bool = False
    run_placements: bool = False


class RunPlacementAnalysisRequest(BaseModel):
    pass


class GenerateCampaignPlanRequest(BaseModel):
    # v2 fields (strategy-based)
    asin: str | None = None
    daily_budget: float | None = None
    strategy: str = "launch"          # launch | grow | defend | harvest | test
    target_acos: float = 25.0
    competitor_asins: list[str] | None = None
    # legacy field (still accepted)
    parent_asin: str | None = None
    total_daily_budget: float | None = None


class ApproveCampaignPlanRequest(BaseModel):
    approved_by: str = "manual"


class ApplyPlacementRecsRequest(BaseModel):
    recommendation_ids: list[UUID]
    triggered_by: str = "manual"


class RunKeywordDiscoveryRequest(BaseModel):
    run_patterns: bool = True


class RunBudgetAllocationRequest(BaseModel):
    parent_asins: list[str] | None = None
    total_daily_budget: float | None = None


class ApplyBudgetAllocRequest(BaseModel):
    allocation_ids: list[UUID]
    triggered_by: str = "manual"


class CreateProposalRequest(BaseModel):
    name: str
    description: str | None = None
    bids: list[UUID] = []
    keywords: list[UUID] = []
    placements: list[UUID] = []
    budgets: list[UUID] = []
    created_by: str = "system"


class ApproveProposalRequest(BaseModel):
    approved_by: str = "system"


class ExecuteProposalRequest(BaseModel):
    idempotency_key: UUID | None = None
    triggered_by: str = "manual"
    max_item_retries: int = Field(default=2, ge=0, le=5)




# ---------------------------------------------------------------------------
# Automation settings
# ---------------------------------------------------------------------------


@router.get("/snapshots", response_model=PpcEntitySnapshotsResponse)
async def list_ppc_entity_snapshots(
    entity_type: str | None = Query(default=None),
    campaign_id: str | None = Query(default=None),
    state: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> PpcEntitySnapshotsResponse:
    return await list_entity_snapshots(
        session,
        entity_type=entity_type,
        campaign_id=campaign_id,
        state=state,
        limit=limit,
        offset=offset,
    )


@router.get("/freshness", response_model=PpcFreshnessResponse)
async def get_ppc_entity_freshness(
    stale_after_seconds: int = Query(default=3600, ge=60, le=604800),
    session: AsyncSession = SESSION_DEP,
) -> PpcFreshnessResponse:
    return await get_entity_freshness(session, stale_after_seconds=stale_after_seconds)


@router.post("/snapshots/sync")
async def sync_ppc_entity_snapshots(
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    run = await log_run_start(session, "snapshot_sync")
    try:
        return await sync_campaign_entity_snapshots(session, run_id=run.id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("sync_ppc_entity_snapshots: failed")
        await session.rollback()
        await log_run_end(
            session,
            run.id,
            status="failed",
            errors=1,
            error_detail=str(exc),
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/sync/status", response_model=PpcSyncStatusResponse)
async def get_ppc_sync_status(
    stale_after_seconds: int = Query(default=3600, ge=60, le=604800),
    session: AsyncSession = SESSION_DEP,
) -> PpcSyncStatusResponse:
    return await get_sync_status(session, stale_after_seconds=stale_after_seconds)


@router.get("/run-history")
async def get_run_history(
    run_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    rows, total = await list_run_history(
        session, run_type=run_type, status=status, limit=limit, offset=offset
    )
    return {
        "items": [
            {
                "id": str(r.id),
                "run_type": r.run_type,
                "status": r.status,
                "triggered_by": r.triggered_by,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                "duration_ms": r.duration_ms,
                "entities_scanned": r.entities_scanned,
                "entities_created": r.entities_created,
                "entities_updated": r.entities_updated,
                "errors": r.errors,
                "error_detail": r.error_detail,
                "metadata_json": r.metadata_json,
            }
            for r in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/proposals", response_model=PpcProposalResponse)
async def list_proposals(
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> PpcProposalResponse:
    rows, total = await list_ppc_proposals(
        session, status=status, limit=limit, offset=offset
    )
    return PpcProposalResponse(
        items=[row.model_dump() for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/proposals")
async def create_proposal(
    body: CreateProposalRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    proposal = await create_ppc_proposal(
        session,
        body.name,
        {
            "bid": body.bids,
            "keyword": body.keywords,
            "placement": body.placements,
            "budget": body.budgets,
        },
        created_by=body.created_by,
        description=body.description,
    )
    await session.commit()
    await session.refresh(proposal)
    _, items = await get_proposal_with_items(session, proposal.id)
    return {
        "id": str(proposal.id),
        "name": proposal.name,
        "description": proposal.description,
        "status": proposal.status,
        "created_by": proposal.created_by,
        "created_at": proposal.created_at.isoformat(),
        "item_count": len(items),
    }


@router.get("/proposals/{proposal_id}")
async def get_proposal(
    proposal_id: UUID,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    try:
        proposal, items = await get_proposal_with_items(session, proposal_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Proposal not found") from exc

    return {
        "proposal": proposal.model_dump(),
        "items": [item.model_dump() for item in items],
        "item_count": len(items),
    }


@router.get("/proposals/{proposal_id}/diff", response_model=ProposalDiffResponse)
async def get_proposal_diff(
    proposal_id: UUID,
    session: AsyncSession = SESSION_DEP,
) -> ProposalDiffResponse:
    try:
        return await compute_proposal_diff(session, proposal_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Proposal not found") from exc


@router.post("/proposals/{proposal_id}/approve")
async def approve_proposal(
    proposal_id: UUID,
    body: ApproveProposalRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    try:
        proposal = await approve_ppc_proposal(
            session, proposal_id, approved_by=body.approved_by
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Proposal not found") from exc

    await session.commit()
    await session.refresh(proposal)
    return proposal.model_dump()


@router.post("/proposals/{proposal_id}/reject")
async def reject_proposal(
    proposal_id: UUID,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    try:
        proposal = await reject_ppc_proposal(session, proposal_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Proposal not found") from exc

    await session.commit()
    await session.refresh(proposal)
    return proposal.model_dump()


# ---------------------------------------------------------------------------
# Proposal execution (locks + retries groundwork)
# ---------------------------------------------------------------------------


@router.get("/proposals/{proposal_id}/executions")
async def list_proposal_executions(
    proposal_id: UUID,
    limit: int = Query(default=10, ge=1, le=50),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Return execution history for a specific proposal."""
    rows = await get_execution(session, proposal_id, limit=limit)
    return {
        "items": [r.model_dump() for r in rows],
        "total": len(rows),
        "proposal_id": str(proposal_id),
    }


@router.get("/proposals/{proposal_id}/execution/latest")
async def get_latest_proposal_execution(
    proposal_id: UUID,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Return the most recent execution for a proposal with its item details."""
    execution = await get_latest_execution(session, proposal_id)
    if execution is None:
        raise HTTPException(status_code=404, detail="No execution found for this proposal")
    items = await get_execution_items(session, execution.id)
    return {
        "execution": execution.model_dump(),
        "items": [i.model_dump() for i in items],
        "feature_flag_live_writes": FEATURE_PPC_LIVE_WRITES,
    }


@router.post("/proposals/{proposal_id}/execute")
async def execute_proposal_endpoint(
    proposal_id: UUID,
    body: ExecuteProposalRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Execute an approved proposal with locking, idempotency, and retry.

    This endpoint:
    - Acquires an advisory lock so the same proposal cannot run concurrently
    - Uses the idempotency_key to return an existing execution if the same key is re-submitted
    - Retries transient Ads API failures per-item with exponential backoff
    - Is currently read-only against Amazon (FEATURE_PPC_LIVE_WRITES=False)
    """
    try:
        key = body.idempotency_key or uuid4()
        execution, items = await execute_proposal(
            session,
            proposal_id,
            idempotency_key=key,
            triggered_by=body.triggered_by,
            max_item_retries=body.max_item_retries,
        )
        return {
            "id": str(execution.id),
            "proposal_id": str(proposal_id),
            "idempotency_key": str(key),
            "status": execution.status,
            "items_total": execution.items_total,
            "items_applied": execution.items_applied,
            "items_failed": execution.items_failed,
            "started_at": execution.started_at.isoformat() if execution.started_at else None,
            "finished_at": execution.finished_at.isoformat() if execution.finished_at else None,
            "duration_ms": execution.duration_ms,
            "error_detail": execution.error_detail,
            "feature_flag_live_writes": FEATURE_PPC_LIVE_WRITES,
            "items": [i.model_dump() for i in items],
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/settings/{parent_asin}")
async def get_automation_settings(
    parent_asin: str,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    result = await session.exec(
        select(PpcAutomationSettings).where(PpcAutomationSettings.parent_asin == parent_asin)
    )
    settings = result.first()
    if not settings:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No settings found for this ASIN")
    return settings.model_dump()


@router.put("/settings/{parent_asin}")
async def upsert_automation_settings(
    parent_asin: str,
    body: AutomationSettingsUpsert,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    result = await session.exec(
        select(PpcAutomationSettings).where(PpcAutomationSettings.parent_asin == parent_asin)
    )
    settings = result.first()
    if settings is None:
        settings = PpcAutomationSettings(parent_asin=parent_asin, **body.model_dump())
        session.add(settings)
    else:
        for field, value in body.model_dump().items():
            setattr(settings, field, value)
        settings.updated_at = utcnow()
    await session.commit()
    await session.refresh(settings)
    return settings.model_dump()


# ---------------------------------------------------------------------------
# Bid recommendations
# ---------------------------------------------------------------------------


@router.get("/bid-recommendations")
async def list_bid_recommendations(
    status_filter: str = Query(default="pending", alias="status"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    query = (
        select(BidRecommendation)
        .where(BidRecommendation.status == status_filter)
        .order_by(col(BidRecommendation.created_at).desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.exec(query)
    recs = result.all()
    return {"items": [r.model_dump() for r in recs], "total": len(recs), "offset": offset, "limit": limit}


@router.post("/bid-recommendations/apply")
async def apply_bid_recommendations(
    body: ApplyBidRecsRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    ads = AmazonAdsAPI()
    applied: list[str] = []
    errors: list[dict[str, str]] = []

    for rec_id in body.recommendation_ids:
        result = await session.exec(
            select(BidRecommendation).where(BidRecommendation.id == rec_id)
        )
        rec = result.first()
        if rec is None:
            errors.append({"id": str(rec_id), "error": "not found"})
            continue
        if rec.status != "pending":
            errors.append({"id": str(rec_id), "error": f"status is already {rec.status}"})
            continue
        if rec.keyword_id is None or rec.ad_group_id is None:
            errors.append({"id": str(rec_id), "error": "missing keyword_id or ad_group_id"})
            continue

        try:
            await ads.update_keyword_bid(
                keyword_id=rec.keyword_id,
                campaign_id=rec.campaign_id,
                ad_group_id=rec.ad_group_id,
                old_bid=rec.current_bid,
                new_bid=rec.recommended_bid,
                reason=rec.reason or "automated bid optimisation",
                triggered_by=body.triggered_by,
                session=session,
            )
            rec.status = "applied"
            rec.applied_at = utcnow()
            rec.applied_by = body.triggered_by
            applied.append(str(rec_id))
        except Exception as exc:  # noqa: BLE001
            logger.exception("apply_bid_recommendations failed for %s", rec_id)
            errors.append({"id": str(rec_id), "error": str(exc)})

    await session.commit()
    return {"applied": applied, "errors": errors}


# ---------------------------------------------------------------------------
# Keyword recommendations
# ---------------------------------------------------------------------------


@router.get("/keyword-recommendations")
async def list_keyword_recommendations(
    status_filter: str = Query(default="pending", alias="status"),
    action: str | None = Query(default=None),
    confidence_min: float | None = Query(default=None, ge=0.0, le=1.0),
    pattern_group: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    query = (
        select(KeywordRecommendation)
        .where(KeywordRecommendation.status == status_filter)
        .order_by(col(KeywordRecommendation.created_at).desc())
    )
    if action:
        query = query.where(KeywordRecommendation.action == action)
    if confidence_min is not None:
        query = query.where(KeywordRecommendation.confidence >= confidence_min)
    if pattern_group is not None:
        query = query.where(KeywordRecommendation.pattern_group == pattern_group)
    query = query.offset(offset).limit(limit)
    result = await session.exec(query)
    recs = result.all()
    return {"items": [r.model_dump() for r in recs], "total": len(recs), "offset": offset, "limit": limit}


@router.get("/negative-patterns")
async def list_negative_patterns(
    status_filter: str = Query(default="pending", alias="status"),
    limit: int = Query(default=50, le=200),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """List pattern-detector generated negative recommendations, grouped by pattern root."""
    query = (
        select(KeywordRecommendation)
        .where(KeywordRecommendation.source == "pattern_detector")
        .where(KeywordRecommendation.status == status_filter)
        .order_by(col(KeywordRecommendation.confidence).desc())
        .limit(limit)
    )
    result = await session.exec(query)
    recs = result.all()
    return {"items": [r.model_dump() for r in recs], "total": len(recs)}


@router.post("/run-keyword-discovery")
async def run_keyword_discovery_endpoint(
    body: RunKeywordDiscoveryRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Manually trigger keyword discovery and optionally pattern detection."""
    from app.services.keyword_discoverer import generate_keyword_recommendations

    started_at = datetime.utcnow()
    result: dict[str, Any] = {
        "started_at": started_at.isoformat(),
        "keyword_recommendations_created": 0,
        "pattern_negatives_created": 0,
        "errors": [],
    }

    try:
        kw_recs = await generate_keyword_recommendations(session)
        result["keyword_recommendations_created"] = len(kw_recs)
    except Exception as exc:  # noqa: BLE001
        logger.exception("run_keyword_discovery: keyword discoverer failed")
        result["errors"].append({"step": "keyword_discoverer", "error": str(exc)})

    if body.run_patterns:
        try:
            patterns = await detect_negative_patterns(session)
            result["pattern_negatives_created"] = len(patterns)
        except Exception as exc:  # noqa: BLE001
            logger.exception("run_keyword_discovery: pattern detector failed")
            result["errors"].append({"step": "pattern_detector", "error": str(exc)})

    finished_at = datetime.utcnow()
    result["finished_at"] = finished_at.isoformat()
    result["duration_seconds"] = (finished_at - started_at).total_seconds()
    return result


@router.post("/keyword-recommendations/apply")
async def apply_keyword_recommendations(
    body: ApplyKeywordRecsRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    ads = AmazonAdsAPI()
    applied: list[str] = []
    errors: list[dict[str, str]] = []

    for rec_id in body.recommendation_ids:
        result = await session.exec(
            select(KeywordRecommendation).where(KeywordRecommendation.id == rec_id)
        )
        rec = result.first()
        if rec is None:
            errors.append({"id": str(rec_id), "error": "not found"})
            continue
        if rec.status != "pending":
            errors.append({"id": str(rec_id), "error": f"status is already {rec.status}"})
            continue

        try:
            if rec.action == "add_keyword":
                if rec.target_campaign_id is None:
                    raise ValueError("target_campaign_id required for add_keyword")
                # Default bid to $0.50 — real logic will derive from settings
                await ads.create_keyword(
                    campaign_id=rec.target_campaign_id,
                    ad_group_id=rec.target_campaign_id,  # placeholder; UI should supply
                    keyword_text=rec.search_term,
                    match_type=rec.match_type,
                    bid=Decimal("0.50"),
                    reason=f"search term mining: {rec.impressions}i/{rec.clicks}c/{rec.orders}o",
                    triggered_by=body.triggered_by,
                    session=session,
                )
            elif rec.action == "add_negative":
                neg_match = "negativeExact" if rec.match_type == "exact" else "negativePhrase"
                await ads.create_negative_keyword(
                    campaign_id=rec.source_campaign_id,
                    ad_group_id=None,
                    keyword_text=rec.search_term,
                    match_type=neg_match,
                    reason=f"high-spend zero-order term: {rec.impressions}i/{rec.clicks}c",
                    triggered_by=body.triggered_by,
                    session=session,
                )
            else:
                raise ValueError(f"Unknown action: {rec.action}")

            rec.status = "applied"
            rec.applied_at = utcnow()
            applied.append(str(rec_id))
        except Exception as exc:  # noqa: BLE001
            logger.exception("apply_keyword_recommendations failed for %s", rec_id)
            errors.append({"id": str(rec_id), "error": str(exc)})

    await session.commit()
    return {"applied": applied, "errors": errors}


# ---------------------------------------------------------------------------
# Change log (audit trail)
# ---------------------------------------------------------------------------


@router.get("/change-log")
async def get_change_log(
    change_type: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    query = select(PpcChangeLog).order_by(col(PpcChangeLog.created_at).desc())
    if change_type:
        query = query.where(PpcChangeLog.change_type == change_type)
    if entity_type:
        query = query.where(PpcChangeLog.entity_type == entity_type)
    query = query.offset(offset).limit(limit)

    result = await session.exec(query)
    entries = result.all()
    return {"items": [e.model_dump() for e in entries], "total": len(entries), "offset": offset, "limit": limit}


# (run-optimizer endpoint defined below with Phase 6 placement support)


# ---------------------------------------------------------------------------
# Budget allocations
# ---------------------------------------------------------------------------


@router.get("/budget-allocations")
async def list_budget_allocations(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """List all latest budget allocation recommendations across all ASINs."""
    query = select(BudgetAllocation).order_by(col(BudgetAllocation.alloc_date).desc())
    if status_filter:
        query = query.where(BudgetAllocation.status == status_filter)
    query = query.offset(offset).limit(limit)
    result = await session.exec(query)
    allocations = result.all()
    return {"items": [a.model_dump() for a in allocations], "total": len(allocations)}


@router.get("/budget-allocations/{parent_asin}")
async def get_budget_allocations_by_asin(
    parent_asin: str,
    limit: int = Query(default=30, le=90),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    query = (
        select(BudgetAllocation)
        .where(BudgetAllocation.parent_asin == parent_asin)
        .order_by(col(BudgetAllocation.alloc_date).desc())
        .limit(limit)
    )
    result = await session.exec(query)
    allocations = result.all()
    return {"parent_asin": parent_asin, "items": [a.model_dump() for a in allocations]}


@router.post("/budget-allocations/apply")
async def apply_budget_allocations(
    body: ApplyBudgetAllocRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Mark selected budget allocation rows as applied."""
    applied: list[str] = []
    errors: list[dict[str, str]] = []

    for alloc_id in body.allocation_ids:
        result = await session.exec(
            select(BudgetAllocation).where(BudgetAllocation.id == alloc_id)
        )
        alloc = result.first()
        if alloc is None:
            errors.append({"id": str(alloc_id), "error": "not found"})
            continue
        if alloc.status != "pending":
            errors.append({"id": str(alloc_id), "error": f"status is already {alloc.status}"})
            continue

        # Promote recommended percentages to current allocations
        if alloc.recommended_sp_pct is not None:
            alloc.sp_pct = Decimal(str(round(alloc.recommended_sp_pct, 6)))
        if alloc.recommended_sb_pct is not None:
            alloc.sb_pct = Decimal(str(round(alloc.recommended_sb_pct, 6)))
        if alloc.recommended_sd_pct is not None:
            alloc.sd_pct = Decimal(str(round(alloc.recommended_sd_pct, 6)))
        if alloc.recommended_sbv_pct is not None:
            alloc.sbv_pct = Decimal(str(round(alloc.recommended_sbv_pct, 6)))

        alloc.status = "applied"
        applied.append(str(alloc_id))

    await session.commit()
    return {"applied": applied, "errors": errors}


@router.post("/run-budget-allocation")
async def run_budget_allocation_endpoint(
    body: RunBudgetAllocationRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Trigger intelligent budget allocation calculation."""
    started_at = datetime.utcnow()
    try:
        results = await generate_budget_allocations(
            session,
            parent_asins=body.parent_asins,
            total_daily_budget=body.total_daily_budget,
        )
        finished_at = datetime.utcnow()
        return {
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": (finished_at - started_at).total_seconds(),
            "allocations_created": len(results),
            "results": results,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("run_budget_allocation: failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# TACoS metrics
# ---------------------------------------------------------------------------


@router.get("/tacos")
async def get_tacos_metrics(
    days: int = Query(default=30, ge=7, le=90),
    target_tacos: float | None = Query(default=None, ge=0.01, le=1.0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Calculate current TACoS, ACoS, and organic revenue metrics."""
    metrics = await calculate_tacos(session, days=days, target_tacos=target_tacos)
    return metrics_to_dict(metrics)


# ---------------------------------------------------------------------------
# Placement recommendations
# ---------------------------------------------------------------------------


@router.get("/placement-recommendations")
async def list_placement_recommendations(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    query = (
        select(PlacementRecommendation)
        .order_by(col(PlacementRecommendation.created_at).desc())
        .offset(offset)
        .limit(limit)
    )
    if status_filter:
        query = query.where(PlacementRecommendation.status == status_filter)
    result = await session.exec(query)
    recs = result.all()
    return {"items": [r.model_dump() for r in recs], "total": len(recs)}


@router.post("/placement-recommendations/apply")
async def apply_placement_recommendations(
    body: ApplyPlacementRecsRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Mark placement recommendations as applied."""
    applied: list[str] = []
    errors: list[dict[str, str]] = []

    for rec_id in body.recommendation_ids:
        result = await session.exec(
            select(PlacementRecommendation).where(PlacementRecommendation.id == rec_id)
        )
        rec = result.first()
        if rec is None:
            errors.append({"id": str(rec_id), "error": "not found"})
            continue
        if rec.status != "pending":
            errors.append({"id": str(rec_id), "error": f"status is already {rec.status}"})
            continue
        rec.status = "applied"
        rec.applied_at = utcnow()
        applied.append(str(rec_id))

    await session.commit()
    return {"applied": applied, "errors": errors}


@router.post("/run-placement-analysis")
async def run_placement_analysis_endpoint(
    body: RunPlacementAnalysisRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Trigger placement bid modifier analysis."""
    started_at = datetime.utcnow()
    try:
        results = await generate_placement_recommendations(session)
        finished_at = datetime.utcnow()
        return {
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": (finished_at - started_at).total_seconds(),
            "recommendations_created": len(results),
            "results": results,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("run_placement_analysis: failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Campaign plans
# ---------------------------------------------------------------------------


@router.get("/campaign-plans")
async def list_campaign_plans(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=20, le=100),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    query = (
        select(CampaignPlan)
        .order_by(col(CampaignPlan.created_at).desc())
        .limit(limit)
    )
    if status_filter:
        query = query.where(CampaignPlan.status == status_filter)
    result = await session.exec(query)
    plans = result.all()
    return {"items": [p.model_dump() for p in plans], "total": len(plans)}


@router.get("/campaign-plans/{plan_id}")
async def get_campaign_plan(
    plan_id: UUID,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    result = await session.exec(select(CampaignPlan).where(CampaignPlan.id == plan_id))
    plan = result.first()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    data = plan.model_dump()
    # Deserialize plan JSON for convenience
    try:
        data["plan_parsed"] = __import__("json").loads(plan.plan)
    except Exception:  # noqa: BLE001
        pass
    return data


@router.post("/campaign-plans/{plan_id}/approve")
async def approve_campaign_plan(
    plan_id: UUID,
    body: ApproveCampaignPlanRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    result = await session.exec(select(CampaignPlan).where(CampaignPlan.id == plan_id))
    plan = result.first()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    if plan.status not in ("draft",):
        raise HTTPException(status_code=400, detail=f"Plan status is '{plan.status}', cannot approve")
    plan.status = "approved"
    plan.approved_at = utcnow()
    plan.applied_by = body.approved_by
    await session.commit()
    await session.refresh(plan)
    return plan.model_dump()


@router.post("/campaign-plans/generate")
async def generate_campaign_plan_endpoint(
    body: GenerateCampaignPlanRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Generate a new campaign plan. Supports v2 strategy-based generation."""
    # v2 path: asin + strategy
    effective_asin = body.asin or body.parent_asin
    if not effective_asin:
        raise HTTPException(status_code=422, detail="asin or parent_asin is required")

    # If strategy is provided (v2), use new builder
    if body.asin or (body.strategy and body.strategy != "launch") or body.target_acos != 25.0:
        try:
            budget = body.daily_budget or body.total_daily_budget or 50.0
            result = await generate_v2_campaign_plan(
                session,
                asin=effective_asin,
                daily_budget=budget,
                strategy=body.strategy,
                target_acos=body.target_acos,
                competitor_asins=body.competitor_asins,
            )
            return result
        except Exception as exc:  # noqa: BLE001
            logger.exception("generate_v2_campaign_plan: failed")
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Legacy path
    try:
        result = await generate_campaign_plan(
            session,
            parent_asin=effective_asin,
            total_daily_budget=body.total_daily_budget,
        )
        return result
    except Exception as exc:  # noqa: BLE001
        logger.exception("generate_campaign_plan: failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/products")
async def list_ppc_products(session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    """Return products available for campaign building."""
    try:
        products = await get_products_list(session)
        return {"products": products}
    except Exception as exc:  # noqa: BLE001
        logger.exception("list_ppc_products: failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/campaign-structure/{asin}")
async def get_asin_campaign_structure(
    asin: str,
    target_acos: float = Query(default=25.0, ge=5.0, le=100.0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Return existing campaign structure + optimization recommendations for an ASIN."""
    try:
        return await get_campaign_structure(session, asin=asin, target_acos=target_acos)
    except Exception as exc:  # noqa: BLE001
        logger.exception("get_campaign_structure: failed for %s", asin)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Ad metrics sync
# ---------------------------------------------------------------------------


@router.post("/sync-ad-metrics")
async def sync_ad_metrics_endpoint(
    days: int = Query(default=30, ge=1, le=90),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Sync ad_metrics from Ads API (DAILY). Falls back to search_term aggregation."""
    started_at = datetime.utcnow()
    try:
        result = await sync_ad_metrics_from_api(session, days=days)
        finished_at = datetime.utcnow()
        return {
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": (finished_at - started_at).total_seconds(),
            **result,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("sync_ad_metrics: failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Snapshot sync (read-only, no Amazon writeback)
# ---------------------------------------------------------------------------


@router.post("/sync/snapshots", tags=["ppc-automation"])
async def trigger_snapshot_sync(
    session: AsyncSession = SESSION_DEP,
) -> dict[str, object]:
    """Manually trigger campaign entity snapshot materialization.

    This is a READ-ONLY operation — it snapshots state from already-synced
    Amazon Ads data into the ppc_entity_snapshots table.
    No Amazon writeback occurs.
    """
    run = await log_run_start(session, "snapshot_sync")
    try:
        result = await sync_campaign_entity_snapshots(session, run_id=run.id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("trigger_snapshot_sync: failed")
        await session.rollback()
        await log_run_end(
            session,
            run.id,
            status="failed",
            errors=1,
            error_detail=str(exc),
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "source": result.source,
        "entity_type": result.entity_type,
        "scanned": result.scanned,
        "created": result.created,
        "updated": result.updated,
        "skipped": result.skipped,
        "synced_at": result.synced_at.isoformat(),
        "read_only": True,
    }


# ---------------------------------------------------------------------------
# Backfill search terms (re-run SP search term sync for fresh data)
# ---------------------------------------------------------------------------


@router.post("/backfill-search-terms")
async def backfill_search_terms_endpoint(
    period: str = Query(default="last_30d", description="last_week | last_month | last_30d"),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Re-trigger search term report sync from Amazon Advertising API.

    This is a manual escape hatch for when the daily cron hasn't run
    or only has partial data. Calls sync_search_terms() for the specified
    calendar period. After syncing, automatically runs ad_metrics sync.
    """
    from app.services.amazon_sync import sync_search_terms

    started_at = datetime.utcnow()
    try:
        count, synced_at = await sync_search_terms(session, period=period)
        # Immediately sync ad_metrics (Ads API primary, fallback to search_term aggregation)
        metrics_result = await sync_ad_metrics_from_api(session)
        finished_at = datetime.utcnow()
        return {
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": (finished_at - started_at).total_seconds(),
            "search_terms_synced": count,
            "synced_at": synced_at.isoformat() if synced_at else None,
            "ad_metrics_sync": metrics_result,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("backfill_search_terms: failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# update run_optimizer to support run_placements
@router.post("/run-optimizer")
async def run_optimizer_endpoint_v2(
    body: RunOptimizerRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Manually trigger bid optimization, keyword discovery, and/or placement analysis."""
    result = await run_optimizer(
        session,
        parent_asin=body.parent_asin,
        run_bid=body.run_bid,
        run_keywords=body.run_keywords,
        run_patterns=body.run_patterns,
        run_budget=body.run_budget,
        run_placements=body.run_placements,
    )
    return result


# ---------------------------------------------------------------------------
# Traffic sync (SP API sales-traffic → traffic_daily)
# ---------------------------------------------------------------------------


@router.post("/sync-traffic")
async def sync_traffic_endpoint(
    days: int = Query(default=3, ge=1, le=30),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Sync traffic_daily from SP API sales-traffic report."""
    from app.services.traffic_sync import sync_traffic_from_api

    started_at = datetime.utcnow()
    try:
        result = await sync_traffic_from_api(session, days=days)
        finished_at = datetime.utcnow()
        return {
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": (finished_at - started_at).total_seconds(),
            **result,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("sync_traffic: failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/traffic")
async def get_traffic(
    days: int = Query(default=7, ge=1, le=90),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Return recent traffic/session data from traffic_daily."""
    from sqlalchemy import text as sqla_text

    summary_rows = await session.exec(  # type: ignore[call-overload]
        sqla_text("""
            SELECT report_date, sessions, page_views, buy_box_pct,
                   unit_session_pct, units_ordered, ordered_product_sales
            FROM traffic_daily
            WHERE asin IS NULL
              AND report_date >= CURRENT_DATE - :days
            ORDER BY report_date DESC
        """),
        params={"days": days},
    )
    daily_summary = [
        {
            "date": str(r[0]),
            "sessions": r[1],
            "page_views": r[2],
            "buy_box_pct": float(r[3]) if r[3] is not None else None,
            "unit_session_pct": float(r[4]) if r[4] is not None else None,
            "units_ordered": r[5],
            "ordered_product_sales": float(r[6]) if r[6] is not None else None,
        }
        for r in summary_rows.all()
    ]

    asin_rows = await session.exec(  # type: ignore[call-overload]
        sqla_text("""
            SELECT report_date, asin, sessions, page_views, unit_session_pct,
                   units_ordered, ordered_product_sales
            FROM traffic_daily
            WHERE asin IS NOT NULL
              AND report_date >= CURRENT_DATE - :days
            ORDER BY report_date DESC, sessions DESC
        """),
        params={"days": days},
    )
    by_asin = [
        {
            "date": str(r[0]),
            "asin": r[1],
            "sessions": r[2],
            "page_views": r[3],
            "unit_session_pct": float(r[4]) if r[4] is not None else None,
            "units_ordered": r[5],
            "ordered_product_sales": float(r[6]) if r[6] is not None else None,
        }
        for r in asin_rows.all()
    ]

    return {"daily_summary": daily_summary, "by_asin": by_asin, "days": days}


# ---------------------------------------------------------------------------
# Ad summary — daily aggregates from ad_metrics table
# ---------------------------------------------------------------------------


@router.get("/ad-summary")
async def get_ad_summary(
    days: int = Query(default=7, ge=1, le=90),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Daily ad performance summary from ad_metrics DB table."""
    from sqlalchemy import text as sqla_text

    daily_rows = await session.exec(  # type: ignore[call-overload]
        sqla_text("""
            SELECT report_date,
                   count(DISTINCT campaign_id) AS campaigns,
                   sum(impressions::bigint) AS impressions,
                   sum(clicks::bigint) AS clicks,
                   sum(orders::bigint) AS orders,
                   sum(spend::numeric) AS spend,
                   sum(sales::numeric) AS sales
            FROM ad_metrics
            WHERE report_date >= CURRENT_DATE - :days
            GROUP BY report_date
            ORDER BY report_date DESC
        """),
        params={"days": days},
    )
    items = []
    for r in daily_rows.all():
        spend = float(r[5] or 0)
        sales = float(r[6] or 0)
        items.append({
            "date": str(r[0]),
            "campaigns": int(r[1] or 0),
            "impressions": int(r[2] or 0),
            "clicks": int(r[3] or 0),
            "orders": int(r[4] or 0),
            "spend": round(spend, 2),
            "sales": round(sales, 2),
            "acos": round(spend / sales, 4) if sales > 0 else None,
            "roas": round(sales / spend, 2) if spend > 0 else None,
        })

    # Top campaigns by spend (most recent report date)
    top_rows = await session.exec(  # type: ignore[call-overload]
        sqla_text("""
            SELECT campaign_id,
                   sum(spend::numeric) AS spend,
                   sum(sales::numeric) AS sales,
                   sum(clicks::bigint) AS clicks,
                   sum(impressions::bigint) AS impressions,
                   sum(orders::bigint) AS orders
            FROM ad_metrics
            WHERE report_date = (SELECT MAX(report_date) FROM ad_metrics)
            GROUP BY campaign_id
            ORDER BY sum(spend::numeric) DESC
            LIMIT 10
        """),
    )
    top_campaigns = []
    for r in top_rows.all():
        spend = float(r[1] or 0)
        sales = float(r[2] or 0)
        top_campaigns.append({
            "campaign_id": r[0],
            "spend": round(spend, 2),
            "sales": round(sales, 2),
            "clicks": int(r[3] or 0),
            "impressions": int(r[4] or 0),
            "orders": int(r[5] or 0),
            "acos": round(spend / sales, 4) if sales > 0 else None,
        })

    return {"items": items, "top_campaigns": top_campaigns, "days": days}


# ---------------------------------------------------------------------------
# Pending summary — counts of all pending recommendations
# ---------------------------------------------------------------------------


@router.get("/pending-summary")
async def get_pending_summary(
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Return counts of all pending PPC recommendations by type."""
    from sqlalchemy import text as sqla_text

    bid_count = (await session.exec(sqla_text("SELECT count(*) FROM bid_recommendations WHERE status='pending'"))).scalar()  # type: ignore[call-overload]
    kw_count = (await session.exec(sqla_text("SELECT count(*) FROM keyword_recommendations WHERE status='pending'"))).scalar()  # type: ignore[call-overload]
    place_count = (await session.exec(sqla_text("SELECT count(*) FROM placement_recommendations WHERE status='pending'"))).scalar()  # type: ignore[call-overload]
    budget_count = (await session.exec(sqla_text("SELECT count(*) FROM budget_allocations WHERE status='pending'"))).scalar()  # type: ignore[call-overload]

    tier_rows = await session.exec(  # type: ignore[call-overload]
        sqla_text("""
            SELECT
                substring(reason from '"tier":\\s*"([^"]+)"') AS tier,
                count(*) AS cnt
            FROM bid_recommendations
            WHERE status = 'pending'
              AND reason IS NOT NULL
            GROUP BY tier
            ORDER BY cnt DESC
        """),
    )
    bid_tiers = {r[0]: int(r[1]) for r in tier_rows.all() if r[0]}

    return {
        "bid_recommendations": int(bid_count or 0),
        "keyword_recommendations": int(kw_count or 0),
        "placement_recommendations": int(place_count or 0),
        "budget_allocations": int(budget_count or 0),
        "bid_tiers": bid_tiers,
        "total_pending": int((bid_count or 0) + (kw_count or 0) + (place_count or 0) + (budget_count or 0)),
    }


# ---------------------------------------------------------------------------
# AMS Real-time endpoints — hourly_campaign_metrics
# ---------------------------------------------------------------------------


@router.get("/realtime/today")
async def realtime_today(session: AsyncSession = SESSION_DEP) -> dict:
    """AMS real-time: today's running totals from hourly_campaign_metrics."""
    r = (await session.exec(text("""
        SELECT SUM(impressions), SUM(clicks), SUM(orders), SUM(cost), SUM(sales),
               COUNT(DISTINCT campaign_id), MAX(hour)
        FROM hourly_campaign_metrics WHERE date = CURRENT_DATE
    """))).first()
    if not r or r[0] is None:
        return {
            "date": str(date.today()), "empty": True,
            "message": "今日暂无 AMS 实时数据",
            "impressions": 0, "clicks": 0, "orders": 0,
            "cost": 0.0, "sales": 0.0,
            "acos": None, "roas": None, "cpc": None, "ctr": None,
            "campaigns": 0, "latest_hour": None, "source": "ams_realtime",
        }
    impr = int(r[0] or 0)
    clicks = int(r[1] or 0)
    orders = int(r[2] or 0)
    cost = float(r[3] or 0)
    sales = float(r[4] or 0)
    return {
        "date": str(date.today()),
        "empty": False,
        "impressions": impr,
        "clicks": clicks,
        "orders": orders,
        "cost": round(cost, 2),
        "sales": round(sales, 2),
        "acos": round(cost / sales * 100, 1) if sales > 0 else None,
        "roas": round(sales / cost, 2) if cost > 0 else None,
        "cpc": round(cost / clicks, 2) if clicks > 0 else None,
        "ctr": round(clicks / impr * 100, 2) if impr > 0 else None,
        "campaigns": int(r[5] or 0),
        "latest_hour": int(r[6]) if r[6] is not None else None,
        "source": "ams_realtime",
    }


@router.get("/realtime/hourly")
async def realtime_hourly(session: AsyncSession = SESSION_DEP) -> dict:
    """AMS real-time: hourly breakdown for today."""
    rows = (await session.exec(text("""
        SELECT hour, SUM(impressions), SUM(clicks), SUM(orders), SUM(cost), SUM(sales)
        FROM hourly_campaign_metrics WHERE date = CURRENT_DATE
        GROUP BY hour ORDER BY hour
    """))).all()
    hours = []
    for r in rows:
        cost, sales = float(r[4] or 0), float(r[5] or 0)
        hours.append({
            "hour": int(r[0]),
            "impressions": int(r[1] or 0),
            "clicks": int(r[2] or 0),
            "orders": int(r[3] or 0),
            "cost": round(cost, 2),
            "sales": round(sales, 2),
            "acos": round(cost / sales * 100, 1) if sales > 0 else None,
        })
    return {"date": str(date.today()), "hours": hours}


@router.get("/realtime/campaigns")
async def realtime_campaigns(session: AsyncSession = SESSION_DEP) -> dict:
    """AMS real-time: campaign breakdown for today."""
    rows = (await session.exec(text("""
        SELECT hcm.campaign_id, c.name,
               SUM(hcm.impressions), SUM(hcm.clicks), SUM(hcm.orders),
               SUM(hcm.cost), SUM(hcm.sales)
        FROM hourly_campaign_metrics hcm
        LEFT JOIN campaigns c ON c.campaign_id = hcm.campaign_id
        WHERE hcm.date = CURRENT_DATE
        GROUP BY hcm.campaign_id, c.name
        ORDER BY SUM(hcm.cost) DESC
    """))).all()
    campaigns = []
    for r in rows:
        cost = float(r[5] or 0)
        sales = float(r[6] or 0)
        clicks = int(r[3] or 0)
        campaigns.append({
            "campaignId": r[0],
            "name": r[1] or r[0],
            "impressions": int(r[2] or 0),
            "clicks": clicks,
            "orders": int(r[4] or 0),
            "cost": round(cost, 2),
            "sales": round(sales, 2),
            "acos": round(cost / sales * 100, 1) if sales > 0 else None,
            "cpc": round(cost / clicks, 2) if clicks > 0 else None,
        })
    return {"date": str(date.today()), "campaigns": campaigns}


@router.get("/realtime/placements")
async def realtime_placements(session: AsyncSession = SESSION_DEP) -> dict:
    """AMS real-time: placement breakdown for today."""
    rows = (await session.exec(text("""
        SELECT COALESCE(placement, 'Unknown'),
               SUM(impressions), SUM(clicks), SUM(cost), SUM(sales)
        FROM hourly_campaign_metrics WHERE date = CURRENT_DATE
        GROUP BY placement ORDER BY SUM(cost) DESC
    """))).all()
    total_cost = sum(float(r[3] or 0) for r in rows)
    placements = []
    for r in rows:
        cost, sales = float(r[3] or 0), float(r[4] or 0)
        placements.append({
            "placement": r[0],
            "impressions": int(r[1] or 0),
            "clicks": int(r[2] or 0),
            "cost": round(cost, 2),
            "sales": round(sales, 2),
            "acos": round(cost / sales * 100, 1) if sales > 0 else None,
            "sharePct": round(cost / total_cost * 100, 1) if total_cost > 0 else 0,
        })
    return {"date": str(date.today()), "placements": placements}


# ---------------------------------------------------------------------------
# Keyword Harvest Suggestions
# ---------------------------------------------------------------------------


@router.get("/keyword-suggestions")
async def list_keyword_suggestions(
    status_filter: str = Query(default="pending", alias="status"),
    action: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    query = (
        select(KeywordHarvestSuggestion)
        .where(KeywordHarvestSuggestion.status == status_filter)
        .order_by(col(KeywordHarvestSuggestion.created_at).desc())
        .offset(offset)
        .limit(limit)
    )
    if action:
        query = query.where(KeywordHarvestSuggestion.action == action)
    result = await session.exec(query)
    items = result.all()
    return {"items": [i.model_dump() for i in items], "total": len(items), "offset": offset, "limit": limit}




# ---------------------------------------------------------------------------
# Budget Pacing
# ---------------------------------------------------------------------------


@router.get("/budget-pacing")
async def list_budget_pacing(session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    """Return pacing status for all campaigns with monthly budget targets."""
    items = await get_budget_pacing(session)
    return {"items": items, "total": len(items)}




# ---------------------------------------------------------------------------
# Campaign Goals & Bid Suggestions (Goal-Based Optimizer)
# ---------------------------------------------------------------------------


@router.get("/goals")
async def list_campaign_goals(
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    result = await session.exec(
        select(CampaignGoal).order_by(col(CampaignGoal.updated_at).desc()).offset(offset).limit(limit)
    )
    goals = result.all()
    return {"items": [g.model_dump() for g in goals], "total": len(goals)}


@router.get("/bid-suggestions")
async def list_bid_suggestions(
    status_filter: str = Query(default="pending", alias="status"),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    query = (
        select(BidSuggestion)
        .where(BidSuggestion.status == status_filter)
        .order_by(col(BidSuggestion.created_at).desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.exec(query)
    items = result.all()
    return {"items": [i.model_dump() for i in items], "total": len(items)}




# ---------------------------------------------------------------------------
# Dayparting
# ---------------------------------------------------------------------------


@router.get("/dayparting/{campaign_id}")
async def get_dayparting_heatmap(
    campaign_id: str,
    days: int = Query(default=30, ge=7, le=90),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Return 24-hour performance heatmap and dayparting schedule for a campaign."""
    hourly = await get_hourly_performance(session, campaign_id, days=days)
    schedule = await get_dayparting_schedule(session, campaign_id)
    recommended_multipliers = cvr_coefficients_to_multipliers(hourly)
    return {
        "campaign_id": campaign_id,
        "days_analyzed": days,
        "hourly": hourly,
        "recommended_multipliers": recommended_multipliers,
        "schedule": schedule.model_dump() if schedule else None,
    }
