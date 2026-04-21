"""PPC proposal staging and read-only dry-run diffs."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from uuid import UUID

from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.time import utcnow
from app.models.ppc_automation import (
    BidRecommendation,
    BudgetAllocation,
    KeywordRecommendation,
    PlacementRecommendation,
    PpcEntitySnapshot,
    PpcProposal,
    PpcProposalItem,
)
from app.schemas.ppc_automation import ProposalDiffItem, ProposalDiffResponse

RECOMMENDATION_TYPES = ("bid", "keyword", "placement", "budget")


def _string_value(value: object | None) -> str | None:
    if value is None:
        return None
    return str(value)


def _change_pct(current: object | None, recommended: object | None) -> float | None:
    if current is None or recommended is None:
        return None
    try:
        current_decimal = Decimal(str(current))
        recommended_decimal = Decimal(str(recommended))
    except (InvalidOperation, ValueError):
        return None
    if current_decimal == 0:
        return None
    return round(float(((recommended_decimal - current_decimal) / current_decimal) * 100), 2)


async def create_proposal(
    session: AsyncSession,
    name: str,
    recommendation_ids_by_type: dict[str, list[UUID]],
    created_by: str = "system",
    description: str | None = None,
) -> PpcProposal:
    """Create a proposal and item rows without committing."""
    now = utcnow()
    proposal = PpcProposal(
        name=name,
        description=description,
        created_by=created_by,
        created_at=now,
    )
    session.add(proposal)

    for recommendation_type in RECOMMENDATION_TYPES:
        for recommendation_id in recommendation_ids_by_type.get(recommendation_type, []):
            session.add(
                PpcProposalItem(
                    proposal_id=proposal.id,
                    recommendation_type=recommendation_type,
                    recommendation_id=recommendation_id,
                    created_at=now,
                )
            )

    return proposal


async def list_proposals(
    session: AsyncSession,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[PpcProposal], int]:
    """Return paginated proposal rows with total count."""
    query = select(PpcProposal)
    count_query = select(func.count()).select_from(PpcProposal)

    if status:
        query = query.where(PpcProposal.status == status)
        count_query = count_query.where(PpcProposal.status == status)

    query = (
        query.order_by(col(PpcProposal.created_at).desc())
        .offset(offset)
        .limit(limit)
    )
    rows = list(await session.exec(query))
    total = (await session.exec(count_query)).one()
    return rows, int(total)


async def get_proposal_with_items(
    session: AsyncSession,
    proposal_id: UUID,
) -> tuple[PpcProposal, list[PpcProposalItem]]:
    """Fetch a proposal and its attached recommendation items."""
    result = await session.exec(
        select(PpcProposal).where(PpcProposal.id == proposal_id)
    )
    proposal = result.first()
    if proposal is None:
        raise ValueError("Proposal not found")

    items = list(
        await session.exec(
            select(PpcProposalItem)
            .where(PpcProposalItem.proposal_id == proposal_id)
            .order_by(col(PpcProposalItem.created_at).asc())
        )
    )
    return proposal, items


async def _snapshot_for_entity(
    session: AsyncSession,
    entity_type: str,
    entity_id: str,
) -> PpcEntitySnapshot | None:
    result = await session.exec(
        select(PpcEntitySnapshot)
        .where(PpcEntitySnapshot.entity_type == entity_type)
        .where(PpcEntitySnapshot.entity_id == entity_id)
    )
    return result.first()


async def _resolve_entity_name(
    session: AsyncSession,
    entity_type: str,
    entity_id: str,
) -> str | None:
    """Look up the canonical entity name from the latest PpcEntitySnapshot.

    Returns None when no snapshot exists -- callers must NOT fall back to
    a stale text name; the absence of a snapshot is itself an alert signal.
    """
    result = await session.exec(
        select(PpcEntitySnapshot.name).where(
            PpcEntitySnapshot.entity_type == entity_type,
            PpcEntitySnapshot.entity_id == entity_id,
        )
    )
    return result.first()


async def _placement_snapshot(
    session: AsyncSession,
    campaign_id: str,
    placement: str,
) -> PpcEntitySnapshot | None:
    result = await session.exec(
        select(PpcEntitySnapshot)
        .where(PpcEntitySnapshot.entity_type == "placement")
        .where(PpcEntitySnapshot.campaign_id == campaign_id)
        .where(PpcEntitySnapshot.placement == placement)
    )
    return result.first()


async def _bid_diff(
    session: AsyncSession,
    recommendation_id: UUID,
) -> ProposalDiffItem | None:
    rec = (await session.exec(select(BidRecommendation).where(BidRecommendation.id == recommendation_id))).first()
    if rec is None:
        return None

    entity_id = rec.keyword_id or rec.ad_group_id or rec.campaign_id
    entity_type = "keyword" if rec.keyword_id else "ad_group" if rec.ad_group_id else "campaign"
    snapshot = await _snapshot_for_entity(session, entity_type, entity_id)
    current_bid = snapshot.bid if snapshot else None
    current_value = _string_value(current_bid) if snapshot else "unknown"
    campaign_name = None
    if snapshot and snapshot.campaign_id:
        campaign_name = await _resolve_entity_name(session, "campaign", snapshot.campaign_id)

    return ProposalDiffItem(
        recommendation_type="bid",
        recommendation_id=rec.id,
        entity_name=snapshot.name if snapshot else None,
        resolved_campaign_name=campaign_name,
        entity_id=entity_id,
        field="bid",
        current_value=current_value,
        recommended_value=str(rec.recommended_bid),
        change_pct=_change_pct(current_bid, rec.recommended_bid),
    )


async def _keyword_diff(
    session: AsyncSession,
    recommendation_id: UUID,
) -> ProposalDiffItem | None:
    rec = (
        await session.exec(
            select(KeywordRecommendation).where(KeywordRecommendation.id == recommendation_id)
        )
    ).first()
    if rec is None:
        return None

    campaign_id = rec.target_campaign_id or rec.source_campaign_id
    snapshot = await _snapshot_for_entity(session, "campaign", campaign_id)
    current_value = snapshot.state if snapshot else "unknown"
    campaign_name = None
    if campaign_id:
        campaign_name = await _resolve_entity_name(session, "campaign", campaign_id)

    return ProposalDiffItem(
        recommendation_type="keyword",
        recommendation_id=rec.id,
        entity_name=snapshot.name if snapshot else None,
        resolved_campaign_name=campaign_name,
        entity_id=campaign_id,
        field="keyword_action",
        current_value=current_value,
        recommended_value=f"{rec.action}:{rec.search_term}:{rec.match_type}",
        change_pct=None,
    )


async def _placement_diff(
    session: AsyncSession,
    recommendation_id: UUID,
) -> ProposalDiffItem | None:
    rec = (
        await session.exec(
            select(PlacementRecommendation).where(PlacementRecommendation.id == recommendation_id)
        )
    ).first()
    if rec is None:
        return None

    snapshot = await _placement_snapshot(session, rec.campaign_id, rec.placement)
    current_modifier = snapshot.placement_modifier_pct if snapshot else None
    current_value = _string_value(current_modifier) if snapshot else "unknown"
    recommended = rec.recommended_modifier_pct

    return ProposalDiffItem(
        recommendation_type="placement",
        recommendation_id=rec.id,
        entity_name=snapshot.name if snapshot else None,
        resolved_campaign_name=snapshot.name if snapshot else None,
        entity_id=f"{rec.campaign_id}:{rec.placement}",
        field="placement_modifier_pct",
        current_value=current_value,
        recommended_value=str(recommended),
        change_pct=_change_pct(current_modifier, recommended),
    )


async def _budget_diffs(
    session: AsyncSession,
    recommendation_id: UUID,
) -> list[ProposalDiffItem]:
    rec = (
        await session.exec(
            select(BudgetAllocation).where(BudgetAllocation.id == recommendation_id)
        )
    ).first()
    if rec is None:
        return []

    fields = (
        ("sp_pct", rec.sp_pct, rec.recommended_sp_pct),
        ("sb_pct", rec.sb_pct, rec.recommended_sb_pct),
        ("sd_pct", rec.sd_pct, rec.recommended_sd_pct),
        ("sbv_pct", rec.sbv_pct, rec.recommended_sbv_pct),
    )
    return [
        ProposalDiffItem(
            recommendation_type="budget",
            recommendation_id=rec.id,
            entity_name=rec.parent_asin,
            entity_id=rec.parent_asin,
            field=field,
            current_value=_string_value(current),
            recommended_value=str(recommended),
            change_pct=_change_pct(current, recommended),
        )
        for field, current, recommended in fields
        if recommended is not None
    ]


async def compute_proposal_diff(
    session: AsyncSession,
    proposal_id: UUID,
) -> ProposalDiffResponse:
    """Return a read-only diff between snapshots/current rows and recommendations."""
    proposal, items = await get_proposal_with_items(session, proposal_id)
    diff_items: list[ProposalDiffItem] = []
    summary = {"bids": 0, "keywords": 0, "placements": 0, "budgets": 0}

    for item in items:
        if item.recommendation_type == "bid":
            summary["bids"] += 1
            diff = await _bid_diff(session, item.recommendation_id)
            if diff:
                diff_items.append(diff)
        elif item.recommendation_type == "keyword":
            summary["keywords"] += 1
            diff = await _keyword_diff(session, item.recommendation_id)
            if diff:
                diff_items.append(diff)
        elif item.recommendation_type == "placement":
            summary["placements"] += 1
            diff = await _placement_diff(session, item.recommendation_id)
            if diff:
                diff_items.append(diff)
        elif item.recommendation_type == "budget":
            summary["budgets"] += 1
            diff_items.extend(await _budget_diffs(session, item.recommendation_id))

    return ProposalDiffResponse(
        proposal_id=proposal.id,
        proposal_name=proposal.name,
        status=proposal.status,
        items=diff_items,
        summary=summary,
    )


async def approve_proposal(
    session: AsyncSession,
    proposal_id: UUID,
    approved_by: str = "system",
) -> PpcProposal:
    """Mark a staged proposal approved without applying any recommendation."""
    proposal, _ = await get_proposal_with_items(session, proposal_id)
    proposal.status = "approved"
    proposal.approved_by = approved_by
    proposal.approved_at = utcnow()
    return proposal


async def reject_proposal(
    session: AsyncSession,
    proposal_id: UUID,
) -> PpcProposal:
    """Mark a proposal rejected without applying any recommendation."""
    proposal, _ = await get_proposal_with_items(session, proposal_id)
    proposal.status = "rejected"
    return proposal


# ---------------------------------------------------------------------------
# Proposal-item readiness checks
# ---------------------------------------------------------------------------


async def check_item_readiness(
    session: AsyncSession,
    item: PpcProposalItem,
) -> tuple[str, str | None]:
    """Return (readiness_check, readiness_detail) for a proposal item.

    readiness_check is one of:
      ready                  — item can be executed as-is
      missing_ad_group_id    — bid/keyword needs ad_group_id
      missing_target_campaign_id — keyword (add_keyword) needs target_campaign_id
      missing_keyword_id     — bid needs keyword_id
      unresolved             — keyword add_keyword has no target_ad_group_id yet
      status_not_pending    — recommendation is not in pending status
      unknown               — recommendation type not recognised
    """
    rec_type = item.recommendation_type

    if rec_type == "bid":
        result = await session.exec(
            select(BidRecommendation).where(BidRecommendation.id == item.recommendation_id)
        )
        rec = result.first()
        if rec is None:
            return "unknown", f"BidRecommendation {item.recommendation_id} not found"
        if rec.status != "pending":
            return "status_not_pending", f"status is {rec.status}, must be pending"
        if rec.keyword_id is None:
            return "missing_keyword_id", "keyword_id is null"
        if rec.ad_group_id is None:
            return "missing_ad_group_id", "ad_group_id is null"
        return "ready", None

    elif rec_type == "keyword":
        result = await session.exec(
            select(KeywordRecommendation).where(KeywordRecommendation.id == item.recommendation_id)
        )
        rec = result.first()
        if rec is None:
            return "unknown", f"KeywordRecommendation {item.recommendation_id} not found"
        if rec.status != "pending":
            return "status_not_pending", f"status is {rec.status}, must be pending"
        if rec.action == "add_keyword":
            if rec.target_campaign_id is None:
                return "missing_target_campaign_id", "target_campaign_id is null"
            if rec.target_ad_group_id is None:
                return "unresolved", "target_ad_group_id not yet resolved"
            return "ready", None
        # add_negative does not need ad_group_id
        return "ready", None

    elif rec_type == "placement":
        result = await session.exec(
            select(PlacementRecommendation).where(PlacementRecommendation.id == item.recommendation_id)
        )
        rec = result.first()
        if rec is None:
            return "unknown", f"PlacementRecommendation {item.recommendation_id} not found"
        if rec.status != "pending":
            return "status_not_pending", f"status is {rec.status}, must be pending"
        return "ready", None

    elif rec_type == "budget":
        result = await session.exec(
            select(BudgetAllocation).where(BudgetAllocation.id == item.recommendation_id)
        )
        rec = result.first()
        if rec is None:
            return "unknown", f"BudgetAllocation {item.recommendation_id} not found"
        if rec.status != "pending":
            return "status_not_pending", f"status is {rec.status}, must be pending"
        return "ready", None

    return "unknown", f"unrecognised recommendation_type: {rec_type}"


async def run_readiness_check(
    session: AsyncSession,
    proposal_id: UUID,
    persist: bool = False,
) -> dict[str, object]:
    """Check readiness of every item in a proposal.

    Does NOT mutate any data unless persist=True, in which case the
    readiness_check and readiness_detail fields on each PpcProposalItem
    are written back so the UI can cache the result.

    Returns a dict with:
      proposal_id, total, ready, not_ready, by_type, items, all_ready
    """
    proposal, items = await get_proposal_with_items(session, proposal_id)

    ready_items: list[PpcProposalItem] = []
    not_ready_items: list[PpcProposalItem] = []

    for item in items:
        check, detail = await check_item_readiness(session, item)
        if persist:
            item.readiness_check = check
            item.readiness_detail = detail
        if check == "ready":
            ready_items.append(item)
        else:
            not_ready_items.append(item)

    if persist:
        await session.commit()

    by_type: dict[str, dict[str, int]] = {}
    for item in not_ready_items:
        by_type.setdefault(item.recommendation_type, {})
        by_type[item.recommendation_type][check] = by_type[item.recommendation_type].get(check, 0) + 1

    return {
        "proposal_id": str(proposal_id),
        "proposal_name": proposal.name,
        "proposal_status": proposal.status,
        "total": len(items),
        "ready": len(ready_items),
        "not_ready": len(not_ready_items),
        "all_ready": len(not_ready_items) == 0,
        "by_type": by_type,
        "items": [
            {
                "item_id": str(item.id),
                "recommendation_type": item.recommendation_type,
                "recommendation_id": str(item.recommendation_id),
                "readiness_check": item.readiness_check,
                "readiness_detail": item.readiness_detail,
            }
            for item in (*ready_items, *not_ready_items)
        ],
    }
