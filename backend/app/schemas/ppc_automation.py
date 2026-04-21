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
    last_run_id: UUID | None = None
    alert: str | None = None  # None means fresh; stale | critical


class PpcFreshnessResponse(SQLModel):
    snapshot_count: int = 0
    stale_after_seconds: int
    critical_threshold_seconds: int | None = None
    generated_at: datetime
    entity_types: list[PpcEntityTypeFreshness]
    alert: str | None = None  # overall alert: None | stale | critical


class PpcSyncStatusResponse(SQLModel):
    snapshot_count: int
    latest_synced_at: datetime | None = None
    latest_observed_at: datetime | None = None
    entity_types: list[PpcEntityTypeFreshness]
    alert: str | None = None
    critical_threshold_seconds: int | None = None
    read_only: bool = True


class PpcProposalRead(SQLModel):
    id: UUID
    name: str
    description: str | None = None
    status: str
    created_by: str
    created_at: datetime
    approved_at: datetime | None = None
    approved_by: str | None = None
    applied_at: datetime | None = None
    applied_by: str | None = None


class PpcProposalItemRead(SQLModel):
    id: UUID
    proposal_id: UUID
    recommendation_type: str
    recommendation_id: UUID
    created_at: datetime


class PpcProposalResponse(SQLModel):
    items: list[PpcProposalRead]
    total: int
    limit: int
    offset: int


class ProposalDiffItem(SQLModel):
    recommendation_type: str
    recommendation_id: UUID
    entity_name: str | None = None
    resolved_campaign_name: str | None = None
    entity_id: str
    field: str
    current_value: str | None = None
    recommended_value: str
    change_pct: float | None = None


class ProposalDiffResponse(SQLModel):
    proposal_id: UUID
    proposal_name: str
    status: str
    items: list[ProposalDiffItem]
    summary: dict[str, int]


# ── Ad-group resolution for keyword recommendations ────────────────────────────


class AdGroupCandidateRead(SQLModel):
    """An ad group entity from PpcEntitySnapshot, surfaced as a resolution candidate."""

    entity_id: str  # the ad_group_id
    name: str | None = None
    campaign_id: str | None = None
    state: str | None = None
    targeting_type: str | None = None
    bid: Decimal | None = None


class CampaignAdGroupsResponse(SQLModel):
    campaign_id: str
    ad_groups: list[AdGroupCandidateRead]
    total: int


class ResolveAdGroupIdRequest(SQLModel):
    """Request to set or update the resolved target_ad_group_id on a keyword recommendation."""

    ad_group_id: str
    # Explicitly confirm the target campaign — validated server-side.
    target_campaign_id: str | None = None


class BulkResolveAdGroupRequest(SQLModel):
    """Request to bulk-resolve target_ad_group_id for multiple add_keyword recommendations.

    All resolutions use the same ad_group_id. Only recommendations where
    target_campaign_id matches the provided campaign_id (or is null) are resolved.
    """

    campaign_id: str
    ad_group_id: str
    # Only resolve recommendations whose target_campaign_id equals this, or is null
    # (null means the recommendation's campaign was unknown at creation time)
    match_target_campaign_id: str


class BulkResolveAdGroupResponse(SQLModel):
    """Result of a bulk resolve operation."""

    resolved: list[KeywordRecommendationResolvedResponse]
    skipped: list[dict[str, str]]  # [{rec_id, reason}]


class KeywordRecommendationResolvedResponse(SQLModel):
    """Result of resolving target_ad_group_id on a KeywordRecommendation."""

    id: UUID
    target_campaign_id: str | None
    target_ad_group_id: str | None
    status: str
    action: str
