"""Read-only PPC entity snapshot materialization."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.time import utcnow
from app.models.amazon_orders import AdMetric, Campaign
from app.models.ppc_automation import PpcEntitySnapshot
from app.schemas.ppc_automation import (
    PpcEntitySnapshotsResponse,
    PpcEntitySnapshotRead,
    PpcFreshnessResponse,
    PpcEntityTypeFreshness,
    PpcSyncStatusResponse,
)

CAMPAIGN_ENTITY_TYPE = "campaign"


@dataclass(slots=True)
class PpcSnapshotSyncResult:
    source: str
    entity_type: str
    scanned: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    synced_at: datetime = field(default_factory=utcnow)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def sync_campaign_entity_snapshots(session: AsyncSession) -> PpcSnapshotSyncResult:
    """Materialize latest campaign entity state from persisted Amazon read tables."""
    synced_at = utcnow()
    result = PpcSnapshotSyncResult(
        source="campaigns",
        entity_type=CAMPAIGN_ENTITY_TYPE,
        synced_at=synced_at,
    )

    campaigns = list(
        await session.exec(select(Campaign).order_by(col(Campaign.synced_at).desc()))
    )
    result.scanned = len(campaigns)
    if not campaigns:
        await session.commit()
        return result

    existing_rows = list(
        await session.exec(
            select(PpcEntitySnapshot).where(
                PpcEntitySnapshot.entity_type == CAMPAIGN_ENTITY_TYPE
            )
        )
    )
    existing_by_entity_id = {row.entity_id: row for row in existing_rows}

    for campaign in campaigns:
        if not campaign.campaign_id:
            result.skipped += 1
            continue

        snapshot = existing_by_entity_id.get(campaign.campaign_id)
        payload = {
            "campaign_id": campaign.campaign_id,
            "campaign_type": campaign.campaign_type,
            "name": campaign.name,
            "state": campaign.state,
            "targeting_type": campaign.targeting_type,
            "budget_amount": str(campaign.budget_amount)
            if campaign.budget_amount is not None
            else None,
            "budget_type": campaign.budget_type,
            "start_date": campaign.start_date.isoformat() if campaign.start_date else None,
            "end_date": campaign.end_date.isoformat() if campaign.end_date else None,
            "source_synced_at": _as_utc(campaign.synced_at).isoformat()
            if campaign.synced_at
            else None,
            "source_raw_payload": campaign.raw_payload,
        }

        if snapshot is None:
            snapshot = PpcEntitySnapshot(
                entity_type=CAMPAIGN_ENTITY_TYPE,
                entity_id=campaign.campaign_id,
                campaign_id=campaign.campaign_id,
                name=campaign.name,
                state=campaign.state,
                campaign_type=campaign.campaign_type,
                targeting_type=campaign.targeting_type,
                budget_amount=campaign.budget_amount,
                budget_type=campaign.budget_type,
                raw_payload=payload,
                observed_at=campaign.synced_at or synced_at,
                synced_at=synced_at,
                created_at=synced_at,
                updated_at=synced_at,
            )
            session.add(snapshot)
            result.created += 1
        else:
            snapshot.campaign_id = campaign.campaign_id
            snapshot.name = campaign.name
            snapshot.state = campaign.state
            snapshot.campaign_type = campaign.campaign_type
            snapshot.targeting_type = campaign.targeting_type
            snapshot.budget_amount = campaign.budget_amount
            snapshot.budget_type = campaign.budget_type
            snapshot.raw_payload = payload
            snapshot.observed_at = campaign.synced_at or synced_at
            snapshot.synced_at = synced_at
            snapshot.updated_at = synced_at
            result.updated += 1

    await session.commit()
    return result


async def list_entity_snapshots(
    session: AsyncSession,
    *,
    entity_type: str | None = None,
    campaign_id: str | None = None,
    state: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> PpcEntitySnapshotsResponse:
    """List entity snapshots with optional filters, returning typed response."""
    query = select(PpcEntitySnapshot)
    count_query = select(func.count()).select_from(PpcEntitySnapshot)

    if entity_type:
        query = query.where(PpcEntitySnapshot.entity_type == entity_type)
        count_query = count_query.where(PpcEntitySnapshot.entity_type == entity_type)
    if campaign_id:
        query = query.where(PpcEntitySnapshot.campaign_id == campaign_id)
        count_query = count_query.where(PpcEntitySnapshot.campaign_id == campaign_id)
    if state:
        query = query.where(PpcEntitySnapshot.state == state)
        count_query = count_query.where(PpcEntitySnapshot.state == state)

    query = (
        query.order_by(col(PpcEntitySnapshot.synced_at).desc())
        .offset(offset)
        .limit(limit)
    )
    rows = list(await session.exec(query))
    total = (await session.exec(count_query)).one()

    items = [
        PpcEntitySnapshotRead(
            id=row.id,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            campaign_id=row.campaign_id,
            ad_group_id=row.ad_group_id,
            parent_entity_id=row.parent_entity_id,
            name=row.name,
            state=row.state,
            serving_status=row.serving_status,
            campaign_type=row.campaign_type,
            targeting_type=row.targeting_type,
            match_type=row.match_type,
            bid=row.bid,
            budget_amount=row.budget_amount,
            budget_type=row.budget_type,
            placement=row.placement,
            placement_modifier_pct=row.placement_modifier_pct,
            raw_payload=row.raw_payload,
            observed_at=row.observed_at,
            synced_at=row.synced_at,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]
    return PpcEntitySnapshotsResponse(
        items=items, total=int(total), limit=limit, offset=offset
    )


async def get_entity_freshness(
    session: AsyncSession,
    *,
    stale_after_seconds: int = 3600,
) -> PpcFreshnessResponse:
    """Return per-entity-type freshness summary as typed response."""
    snapshots = list(await session.exec(select(PpcEntitySnapshot)))
    campaigns_last = (await session.exec(select(func.max(Campaign.synced_at)))).one()
    ad_metrics_last = (await session.exec(select(func.max(AdMetric.synced_at)))).one()
    _ = (campaigns_last, ad_metrics_last)  # reserved for future source-table freshness
    now = _as_utc(utcnow())

    by_type = Counter(row.entity_type for row in snapshots)
    entity_types: list[PpcEntityTypeFreshness] = []

    for etype, total in sorted(by_type.items()):
        type_rows = [r for r in snapshots if r.entity_type == etype]
        last_synced = max(
            (_as_utc(r.synced_at) for r in type_rows), default=None
        )
        oldest_observed = min(
            (_as_utc(r.observed_at) for r in type_rows), default=None
        )
        age_seconds = (
            int((now - last_synced).total_seconds())
            if last_synced
            else None
        )
        entity_types.append(
            PpcEntityTypeFreshness(
                entity_type=etype,
                total=total,
                last_synced_at=last_synced,
                last_observed_at=oldest_observed,
                age_seconds=age_seconds,
                stale=(
                    age_seconds > stale_after_seconds
                    if age_seconds is not None
                    else True
                ),
            )
        )

    return PpcFreshnessResponse(
        snapshot_count=len(snapshots),
        stale_after_seconds=stale_after_seconds,
        generated_at=now,
        entity_types=entity_types,
    )


async def get_sync_status(
    session: AsyncSession,
    *,
    stale_after_seconds: int = 3600,
) -> PpcSyncStatusResponse:
    """Return overall snapshot sync status as typed response."""
    snapshots = list(await session.exec(select(PpcEntitySnapshot)))
    now = _as_utc(utcnow())

    if not snapshots:
        return PpcSyncStatusResponse(
            snapshot_count=0,
            latest_synced_at=None,
            latest_observed_at=None,
            entity_types=[],
            read_only=True,
        )

    last_synced = max((_as_utc(r.synced_at) for r in snapshots), default=None)
    last_observed = max(
        (_as_utc(r.observed_at) for r in snapshots), default=None
    )
    by_type_counter = Counter(row.entity_type for row in snapshots)

    entity_types: list[PpcEntityTypeFreshness] = []
    for etype, total in sorted(by_type_counter.items()):
        type_rows = [r for r in snapshots if r.entity_type == etype]
        type_last_synced = max(
            (_as_utc(r.synced_at) for r in type_rows), default=None
        )
        type_oldest_observed = min(
            (_as_utc(r.observed_at) for r in type_rows), default=None
        )
        age_seconds = (
            int((now - type_last_synced).total_seconds())
            if type_last_synced
            else None
        )
        entity_types.append(
            PpcEntityTypeFreshness(
                entity_type=etype,
                total=total,
                last_synced_at=type_last_synced,
                last_observed_at=type_oldest_observed,
                age_seconds=age_seconds,
                stale=(
                    age_seconds > stale_after_seconds
                    if age_seconds is not None
                    else True
                ),
            )
        )

    return PpcSyncStatusResponse(
        snapshot_count=len(snapshots),
        latest_synced_at=last_synced,
        latest_observed_at=last_observed,
        entity_types=entity_types,
        read_only=True,
    )
