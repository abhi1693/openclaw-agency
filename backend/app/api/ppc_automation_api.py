"""PPC Automation Engine API — Phase 1A endpoints."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_session
from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.ppc_automation import (
    BidRecommendation,
    BudgetAllocation,
    KeywordRecommendation,
    PpcAutomationSettings,
    PpcChangeLog,
)
from app.services.ads_api import AmazonAdsAPI
from app.services.ppc_scheduler import run_optimizer

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


# ---------------------------------------------------------------------------
# Automation settings
# ---------------------------------------------------------------------------


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
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    query = (
        select(KeywordRecommendation)
        .where(KeywordRecommendation.status == status_filter)
        .order_by(col(KeywordRecommendation.created_at).desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.exec(query)
    recs = result.all()
    return {"items": [r.model_dump() for r in recs], "total": len(recs), "offset": offset, "limit": limit}


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


# ---------------------------------------------------------------------------
# Optimizer runner (manual trigger)
# ---------------------------------------------------------------------------


@router.post("/run-optimizer")
async def run_optimizer_endpoint(
    body: RunOptimizerRequest,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Manually trigger bid optimization and/or keyword discovery."""
    result = await run_optimizer(
        session,
        parent_asin=body.parent_asin,
        run_bid=body.run_bid,
        run_keywords=body.run_keywords,
    )
    return result


# ---------------------------------------------------------------------------
# Budget allocations
# ---------------------------------------------------------------------------


@router.get("/budget-allocations/{parent_asin}")
async def get_budget_allocations(
    parent_asin: str,
    limit: int = Query(default=30, le=90),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    query = (
        select(BudgetAllocation)
        .where(BudgetAllocation.parent_asin == parent_asin)
        .order_by(col(BudgetAllocation.date).desc())
        .limit(limit)
    )
    result = await session.exec(query)
    allocations = result.all()
    return {"parent_asin": parent_asin, "items": [a.model_dump() for a in allocations]}
