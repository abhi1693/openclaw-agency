"""Schemas for PPC automation read-only inspection endpoints."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlmodel import SQLModel


class PpcEntitySnapshotRead(SQLModel):
    id: UUID
    entity_type: str
    entity_id: str
    campaign_id: str | None = None
    ad_group_id: str | None = None
    parent_entity_id: str | None = None
    name: str | None = None
    state: str | None = None
    serving_status: str | None = None
    campaign_type: str | None = None
    targeting_type: str | None = None
    match_type: str | None = None
    bid: Decimal | None = None
    budget_amount: Decimal | None = None
    budget_type: str | None = None
    placement: str | None = None
    placement_modifier_pct: Decimal | None = None
    raw_payload: dict[str, object] | None = None
    observed_at: datetime
    synced_at: datetime
    created_at: datetime
    updated_at: datetime


class PpcEntitySnapshotsResponse(SQLModel):
    items: list[PpcEntitySnapshotRead]
    total: int
    limit: int
    offset: int


class PpcEntityTypeFreshness(SQLModel):
    entity_type: str
    total: int
    last_synced_at: datetime | None = None
    last_observed_at: datetime | None = None
    age_seconds: int | None = None
    stale: bool


class PpcFreshnessResponse(SQLModel):
    snapshot_count: int = 0
    stale_after_seconds: int
    generated_at: datetime
    entity_types: list[PpcEntityTypeFreshness]


class PpcSyncStatusResponse(SQLModel):
    snapshot_count: int
    latest_synced_at: datetime | None = None
    latest_observed_at: datetime | None = None
    entity_types: list[PpcEntityTypeFreshness]
    read_only: bool = True

