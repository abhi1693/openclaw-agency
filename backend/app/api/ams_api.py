"""Amazon Marketing Stream management API endpoints."""

from __future__ import annotations

from datetime import date as date_type
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_session
from app.config.ams_config import AMS_DATASETS, get_ams_profile_id, ams_sqs_arn
from app.core.logging import get_logger
from app.models.ppc_automation import HourlyCampaignMetric
from app.services.ams_consumer import CONSUMER_STATS
from app.services.ams_subscriptions import AMSSubscriptionManager, ensure_subscriptions

router = APIRouter(prefix="/ams", tags=["ams"])
logger = get_logger(__name__)

SESSION_DEP = Depends(get_session)


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class CreateSubscriptionRequest(BaseModel):
    profile_id: str
    dataset_id: str
    sqs_arn: str


# ---------------------------------------------------------------------------
# Config (datasets + ARNs for frontend auto-fill)
# ---------------------------------------------------------------------------


@router.get("/config")
async def get_ams_config() -> dict[str, Any]:
    """Return AMS profile_id and dataset list with auto-computed SQS ARNs."""
    datasets = [
        {
            "id": ds_id,
            "description": ds["description"],
            "queue_name": ds["queue_name"],
            "sqs_arn": ams_sqs_arn(ds["queue_name"], ds_id),
        }
        for ds_id, ds in AMS_DATASETS.items()
    ]
    return {"profile_id": get_ams_profile_id(), "datasets": datasets}


# ---------------------------------------------------------------------------
# Worker status
# ---------------------------------------------------------------------------


@router.get("/status")
async def get_ams_status() -> dict[str, Any]:
    """Return consumer health: last poll time, message counts, per-queue stats."""
    return {
        "configured_datasets": list(AMS_DATASETS.keys()),
        "consumer": CONSUMER_STATS.to_dict(),
    }


# ---------------------------------------------------------------------------
# Subscription management
# ---------------------------------------------------------------------------


@router.get("/subscriptions")
async def list_subscriptions(profile_id: str = Query(...)) -> dict[str, Any]:
    """List active AMS subscriptions for the given advertising profile."""
    mgr = AMSSubscriptionManager()
    try:
        subs = await mgr.list_subscriptions(profile_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ads API error: {exc}",
        ) from exc
    return {"profile_id": profile_id, "subscriptions": subs}


@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
async def create_subscription(body: CreateSubscriptionRequest) -> dict[str, Any]:
    """Create a new AMS stream subscription routing *dataset_id* to an SQS queue."""
    if body.dataset_id not in AMS_DATASETS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown dataset_id '{body.dataset_id}'. Valid: {list(AMS_DATASETS.keys())}",
        )
    mgr = AMSSubscriptionManager()
    try:
        result = await mgr.create_subscription(body.profile_id, body.dataset_id, body.sqs_arn)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ads API error: {exc}",
        ) from exc
    return result


@router.post("/subscriptions/ensure")
async def ensure_subscriptions_endpoint(
    profile_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """Ensure all 4 AMS stream subscriptions exist for the configured profile.

    Reads AMAZON_ADS_PROFILE_ID and per-dataset SQS ARNs from env. Creates any
    missing subscriptions. Safe to call repeatedly — skips existing ones.
    """
    try:
        result = await ensure_subscriptions(profile_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ensure_subscriptions failed: {exc}",
        ) from exc
    return result


@router.delete("/subscriptions/{subscription_id}")
async def delete_subscription(
    subscription_id: str,
    profile_id: str = Query(...),
) -> dict[str, Any]:
    """Remove an AMS stream subscription."""
    mgr = AMSSubscriptionManager()
    try:
        result = await mgr.delete_subscription(profile_id, subscription_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ads API error: {exc}",
        ) from exc
    return result


# ---------------------------------------------------------------------------
# Hourly metrics query
# ---------------------------------------------------------------------------


@router.get("/metrics/hourly")
async def get_hourly_metrics(
    campaign_id: str | None = Query(default=None),
    keyword_id: str | None = Query(default=None),
    date_from: date_type | None = Query(default=None),
    date_to: date_type | None = Query(default=None),
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Query hourly_campaign_metrics with optional filters."""
    query = (
        select(HourlyCampaignMetric)
        .order_by(col(HourlyCampaignMetric.report_date).desc(), col(HourlyCampaignMetric.hour).desc())
        .offset(offset)
        .limit(limit)
    )
    if campaign_id:
        query = query.where(HourlyCampaignMetric.campaign_id == campaign_id)
    if keyword_id:
        query = query.where(col(HourlyCampaignMetric.keyword_id) == keyword_id)
    if date_from:
        query = query.where(HourlyCampaignMetric.report_date >= date_from)
    if date_to:
        query = query.where(HourlyCampaignMetric.report_date <= date_to)

    result = await session.exec(query)
    rows = result.all()
    return {
        "items": [r.model_dump() for r in rows],
        "total": len(rows),
        "offset": offset,
        "limit": limit,
    }
