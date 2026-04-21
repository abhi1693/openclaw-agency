"""PPC automation engine persistence models — Phase 1A."""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import JSON, Boolean, Column, Date, Float, Numeric, UniqueConstraint
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel


class HourlyCampaignMetric(QueryModel, table=True):
    """Hourly campaign performance data for AMS integration."""

    __tablename__ = "hourly_campaign_metrics"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    campaign_id: str = Field(index=True)
    ad_group_id: str | None = Field(default=None, index=True)
    keyword_id: str | None = Field(default=None, index=True)
    match_type: str | None = None
    report_date: date_type = Field(sa_column=Column("date", Date(), nullable=False, index=True))
    hour: int = Field(index=True)
    placement: str | None = Field(default=None, index=True)  # TOP_OF_SEARCH / DETAIL_PAGE / OTHER
    impressions: int = Field(default=0)
    clicks: int = Field(default=0)
    cost: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(14, 4), nullable=False, server_default="0"))
    sales: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(14, 2), nullable=False, server_default="0"))
    orders: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)


class PpcEntitySnapshot(QueryModel, table=True):
    """Canonical latest read-only Amazon Ads entity state snapshot."""

    __tablename__ = "ppc_entity_snapshots"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", name="uq_ppc_entity_snapshots_identity"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    entity_type: str = Field(index=True)  # campaign / ad_group / keyword / placement
    entity_id: str = Field(index=True)
    campaign_id: str | None = Field(default=None, index=True)
    ad_group_id: str | None = Field(default=None, index=True)
    parent_entity_id: str | None = Field(default=None, index=True)
    name: str | None = Field(default=None, index=True)
    state: str | None = Field(default=None, index=True)
    serving_status: str | None = Field(default=None, index=True)
    campaign_type: str | None = Field(default=None, index=True)
    targeting_type: str | None = Field(default=None)
    match_type: str | None = Field(default=None, index=True)
    bid: Decimal | None = Field(default=None, sa_column=Column(Numeric(10, 4), nullable=True))
    budget_amount: Decimal | None = Field(
        default=None, sa_column=Column(Numeric(12, 2), nullable=True)
    )
    budget_type: str | None = Field(default=None)
    placement: str | None = Field(default=None, index=True)
    placement_modifier_pct: Decimal | None = Field(
        default=None, sa_column=Column(Numeric(8, 4), nullable=True)
    )
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    observed_at: datetime = Field(default_factory=utcnow, index=True)
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PpcProposal(QueryModel, table=True):
    """A named, versioned set of PPC recommendations staged for review."""

    __tablename__ = "ppc_proposals"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str
    description: str | None = None
    status: str = Field(default="staged", index=True)  # staged | approved | rejected | applied
    created_by: str = "system"
    created_at: datetime = Field(default_factory=utcnow, index=True)
    approved_at: datetime | None = None
    approved_by: str | None = None
    applied_at: datetime | None = None
    applied_by: str | None = None


class PpcProposalItem(QueryModel, table=True):
    """A single recommendation attached to a proposal."""

    __tablename__ = "ppc_proposal_items"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    proposal_id: UUID = Field(index=True)
    recommendation_type: str = Field(index=True)  # bid | keyword | placement | budget
    recommendation_id: UUID = Field(index=True)
    readiness_check: str | None = Field(
        default=None,
        index=True,
        # One of: ready | missing_ad_group_id | missing_target_campaign_id |
        #           missing_keyword_id | unresolved | status_not_pending | unknown
        # Populated by the readiness-check endpoint; null means not yet checked.
    )
    readiness_detail: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class BidRecommendation(QueryModel, table=True):
    """Automated bid change recommendations pending approval."""

    __tablename__ = "bid_recommendations"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    campaign_id: str = Field(index=True)
    ad_group_id: str | None = Field(default=None, index=True)
    keyword_id: str | None = Field(default=None, index=True)
    match_type: str | None = None
    current_bid: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    recommended_bid: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    conversion_rate: Decimal | None = Field(default=None, sa_column=Column(Numeric(8, 6), nullable=True))
    target_acos: Decimal | None = Field(default=None, sa_column=Column(Numeric(6, 4), nullable=True))
    aov: Decimal | None = Field(default=None, sa_column=Column(Numeric(10, 2), nullable=True))
    reason: str | None = None
    status: str = Field(default="pending", index=True)  # pending/approved/rejected/applied
    created_at: datetime = Field(default_factory=utcnow, index=True)
    applied_at: datetime | None = None
    applied_by: str | None = None


class KeywordRecommendation(QueryModel, table=True):
    """Search term mining results recommending keyword additions or negatives."""

    __tablename__ = "keyword_recommendations"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    source_campaign_id: str = Field(index=True)
    search_term: str = Field(index=True)
    match_type: str
    impressions: int = Field(default=0)
    clicks: int = Field(default=0)
    orders: int = Field(default=0)
    ctr: Decimal | None = Field(default=None, sa_column=Column(Numeric(8, 6), nullable=True))
    conversion_rate: Decimal | None = Field(default=None, sa_column=Column(Numeric(8, 6), nullable=True))
    acos: Decimal | None = Field(default=None, sa_column=Column(Numeric(8, 4), nullable=True))
    action: str = Field(index=True)  # add_keyword / add_negative
    target_campaign_id: str | None = Field(default=None, index=True)
    # target_ad_group_id is required for add_keyword; discoverer leaves it null because
    # search-term reports don't include ad group IDs — UI/execution must resolve it.
    target_ad_group_id: str | None = Field(default=None, index=True)
    status: str = Field(default="pending", index=True)  # pending/approved/rejected/applied
    created_at: datetime = Field(default_factory=utcnow, index=True)
    applied_at: datetime | None = None
    # ── Phase 3: Enhanced Discovery fields ────────────────────────────────
    confidence: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    source: str | None = Field(default=None)          # auto_campaign / manual_campaign / pattern_detector
    evidence: str | None = Field(default=None)        # JSON with supporting data
    match_type_recommendation: str | None = Field(default=None)  # exact / phrase / broad
    pattern_group: str | None = Field(default=None, index=True)  # root word for pattern negatives


class BudgetAllocation(QueryModel, table=True):
    """Daily budget split across ad types per parent ASIN."""

    __tablename__ = "budget_allocations"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    parent_asin: str = Field(index=True)
    total_daily_budget: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    sp_pct: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(5, 4), nullable=False, server_default="0"))
    sb_pct: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(5, 4), nullable=False, server_default="0"))
    sd_pct: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(5, 4), nullable=False, server_default="0"))
    sbv_pct: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(5, 4), nullable=False, server_default="0"))
    sp_actual_spend: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(10, 2), nullable=False, server_default="0"))
    sb_actual_spend: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(10, 2), nullable=False, server_default="0"))
    sd_actual_spend: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(10, 2), nullable=False, server_default="0"))
    sbv_actual_spend: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(10, 2), nullable=False, server_default="0"))
    alloc_date: date_type = Field(sa_column=Column("date", Date(), nullable=False, index=True))
    created_at: datetime = Field(default_factory=utcnow)
    # ── Phase 5: Intelligent Allocation fields ─────────────────────────────
    recommended_sp_pct: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    recommended_sb_pct: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    recommended_sd_pct: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    recommended_sbv_pct: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    sp_roas: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    sb_roas: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    sd_roas: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    sbv_roas: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    sp_utilization: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    sb_utilization: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    sd_utilization: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    sbv_utilization: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    reasoning: str | None = Field(default=None)   # JSON dict per ad type
    status: str = Field(default="pending", index=True)  # pending / applied / rejected


class PpcAutomationSettings(QueryModel, table=True):
    """Per-product automation configuration."""

    __tablename__ = "ppc_automation_settings"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    parent_asin: str = Field(index=True, unique=True)
    target_acos: Decimal = Field(sa_column=Column(Numeric(6, 4), nullable=False))
    min_bid: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    max_bid: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    bid_change_limit_pct: Decimal = Field(
        default=Decimal("0.2"), sa_column=Column(Numeric(5, 4), nullable=False, server_default="0.2")
    )
    dayparting_enabled: bool = Field(default=False)
    auto_negative_enabled: bool = Field(default=False)
    auto_keyword_enabled: bool = Field(default=False)
    # ── v2 Intelligent Bid Engine fields ──────────────────────────────────
    damping_factor: float = Field(
        default=0.3, sa_column=Column(Float, nullable=False, server_default="0.3")
    )
    max_step_down_pct: float = Field(
        default=0.15, sa_column=Column(Float, nullable=False, server_default="0.15")
    )
    max_step_up_pct: float = Field(
        default=0.10, sa_column=Column(Float, nullable=False, server_default="0.10")
    )
    launch_mode: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default="false")
    )
    launch_mode_until: date_type | None = Field(
        default=None, sa_column=Column("launch_mode_until", Date(), nullable=True)
    )
    exploration_pct: float = Field(
        default=0.15, sa_column=Column(Float, nullable=False, server_default="0.15")
    )
    # ── Phase 6: TACoS target mode ─────────────────────────────────────────
    target_mode: str = Field(default="acos")  # 'acos' or 'tacos'
    target_tacos: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    # ── Safety: words that must never be negated ───────────────────────────
    protected_keywords: str | None = Field(
        default=None,
        description="JSON array of keyword roots that pattern detector will never negate"
    )
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PpcChangeLog(QueryModel, table=True):
    """Immutable audit trail for all PPC automation actions."""

    __tablename__ = "ppc_change_log"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    change_type: str = Field(index=True)  # bid / keyword / negative / budget
    entity_type: str = Field(index=True)
    entity_id: str = Field(index=True)
    old_value: str | None = None
    new_value: str | None = None
    reason: str | None = None
    triggered_by: str = Field(default="system", index=True)  # system / manual
    created_at: datetime = Field(default_factory=utcnow, index=True)


class PlacementRecommendation(QueryModel, table=True):
    """Bid modifier recommendations per campaign × placement."""

    __tablename__ = "placement_recommendations"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    campaign_id: str = Field(index=True)
    campaign_name: str | None = None
    placement: str = Field(index=True)  # top_of_search / product_pages / rest_of_search
    current_modifier_pct: float = Field(default=0.0, sa_column=Column(Float, nullable=False, server_default="0"))
    recommended_modifier_pct: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    placement_impressions: int = Field(default=0)
    placement_clicks: int = Field(default=0)
    placement_orders: int = Field(default=0)
    placement_ctr: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    placement_cvr: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    placement_acos: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    placement_roas: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    campaign_avg_roas: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    reason: str | None = None  # JSON
    status: str = Field(default="pending", index=True)  # pending/applied/rejected
    created_at: datetime = Field(default_factory=utcnow, index=True)
    applied_at: datetime | None = None


class TrafficDaily(QueryModel, table=True):
    """Daily traffic/session metrics from SP API sales-traffic report."""

    __tablename__ = "traffic_daily"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    report_date: date_type = Field(sa_column=Column("report_date", Date(), nullable=False, index=True))
    asin: str | None = Field(default=None, index=True)  # NULL = store-level summary
    sessions: int = Field(default=0)
    page_views: int = Field(default=0)
    buy_box_pct: Decimal | None = Field(default=None, sa_column=Column(Numeric(5, 2), nullable=True))
    unit_session_pct: Decimal | None = Field(default=None, sa_column=Column(Numeric(5, 2), nullable=True))
    units_ordered: int = Field(default=0)
    ordered_product_sales: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    synced_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class DaypartingSchedule(QueryModel, table=True):
    """Dayparting bid modifier schedule per campaign (JSON array of 24 hourly multipliers)."""

    __tablename__ = "dayparting_schedules"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    campaign_id: str = Field(index=True, unique=True)
    campaign_name: str | None = Field(default=None)
    # JSON array of 24 floats: hourly bid multiplier (1.0 = no change, 0.5 = -50%, 1.5 = +50%)
    hourly_multipliers: str = Field(default="[]")
    enabled: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class CampaignGoal(QueryModel, table=True):
    """Per-campaign optimization goal configuration for PID-based bid optimization."""

    __tablename__ = "campaign_goals"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    campaign_id: str = Field(index=True, unique=True)
    campaign_name: str | None = Field(default=None)
    # goal_mode: target_acos / max_sales / efficiency
    goal_mode: str = Field(default="target_acos")
    target_acos: float = Field(default=25.0, sa_column=Column(Float, nullable=False, server_default="25.0"))
    # PID controller parameters
    kp: float = Field(default=0.3, sa_column=Column(Float, nullable=False, server_default="0.3"))
    ki: float = Field(default=0.05, sa_column=Column(Float, nullable=False, server_default="0.05"))
    kd: float = Field(default=0.1, sa_column=Column(Float, nullable=False, server_default="0.1"))
    max_bid_adjustment_pct: float = Field(default=0.15, sa_column=Column(Float, nullable=False, server_default="0.15"))
    # PID state (integral accumulator)
    pid_integral: float = Field(default=0.0, sa_column=Column(Float, nullable=False, server_default="0"))
    pid_last_error: float = Field(default=0.0, sa_column=Column(Float, nullable=False, server_default="0"))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class BidSuggestion(QueryModel, table=True):
    """PID-generated bid adjustment suggestions per campaign."""

    __tablename__ = "bid_suggestions"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    campaign_id: str = Field(index=True)
    campaign_name: str | None = Field(default=None)
    goal_mode: str = Field(default="target_acos")
    actual_acos: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    target_acos: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    pid_error: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    bid_adjustment_pct: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    reason: str | None = Field(default=None)
    status: str = Field(default="pending", index=True)  # pending / approved / rejected
    created_at: datetime = Field(default_factory=utcnow, index=True)
    resolved_at: datetime | None = None
    resolved_by: str | None = None


class BudgetPacingTarget(QueryModel, table=True):
    """Monthly budget target per campaign for pacing calculations."""

    __tablename__ = "budget_pacing_targets"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    campaign_id: str = Field(index=True, unique=True)
    campaign_name: str | None = Field(default=None)
    monthly_budget: Decimal = Field(sa_column=Column(Numeric(12, 2), nullable=False))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class KeywordHarvestSuggestion(QueryModel, table=True):
    """Threshold-based keyword harvest and negation suggestions."""

    __tablename__ = "keyword_harvest_suggestions"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    search_term: str = Field(index=True)
    campaign_id: str | None = Field(default=None, index=True)
    campaign_name: str | None = Field(default=None)
    impressions: int = Field(default=0)
    clicks: int = Field(default=0)
    orders: int = Field(default=0)
    spend: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 4), nullable=True))
    acos: Decimal | None = Field(default=None, sa_column=Column(Numeric(8, 4), nullable=True))
    # action: harvest = promote to exact keyword; negate = add as negative
    action: str = Field(index=True)  # harvest / negate
    # thresholds snapshot at generation time
    min_orders_threshold: int = Field(default=2)
    min_clicks_threshold: int = Field(default=15)
    max_acos_threshold: Decimal | None = Field(default=None, sa_column=Column(Numeric(8, 4), nullable=True))
    status: str = Field(default="pending", index=True)  # pending / approved / rejected
    created_at: datetime = Field(default_factory=utcnow, index=True)
    resolved_at: datetime | None = None
    resolved_by: str | None = None


class CampaignPlan(QueryModel, table=True):
    """Generated campaign structure plans for approval and execution."""

    __tablename__ = "campaign_plans"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    parent_asin: str = Field(index=True)
    plan: str  # JSON — full campaign structure
    campaign_count: int = Field(default=0)
    total_daily_budget: float = Field(default=0.0, sa_column=Column(Float, nullable=False, server_default="0"))
    status: str = Field(default="draft", index=True)  # draft/approved/applied/failed
    created_at: datetime = Field(default_factory=utcnow, index=True)
    approved_at: datetime | None = None
    applied_at: datetime | None = None
    applied_by: str | None = None


class PpcRunHistory(QueryModel, table=True):
    """Persisted log of PPC sync/optimizer run executions."""

    __tablename__ = "ppc_run_history"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    run_type: str = Field(index=True)  # snapshot_sync | ad_metrics_sync | search_terms_sync | optimizer | keyword_discovery | placement_analysis
    status: str = Field(index=True)    # started | completed | failed
    triggered_by: str = Field(default="system")
    started_at: datetime = Field(default_factory=utcnow, index=True)
    finished_at: datetime | None = Field(default=None)
    duration_ms: int | None = None
    entities_scanned: int | None = None
    entities_created: int | None = None
    entities_updated: int | None = None
    errors: int | None = None
    error_detail: str | None = None
    metadata_json: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )


class PpcProposalExecution(QueryModel, table=True):
    """Tracks a single execution attempt of a PPC proposal.

    Provides idempotency (via idempotency_key) and concurrency safety
    (via advisory lock) for the proposal apply path.
    """

    __tablename__ = "ppc_proposal_executions"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint("proposal_id", "idempotency_key", name="uq_ppc_proposal_executions_proposal_idempotency"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    proposal_id: UUID = Field(index=True)
    # Idempotency key passed by caller; re-submitting the same key returns the existing execution
    idempotency_key: UUID = Field(index=True)
    status: str = Field(
        default="pending",
        index=True,  # pending | running | completed | failed | cancelled
    )
    triggered_by: str = Field(default="system")
    started_at: datetime = Field(default_factory=utcnow, index=True)
    finished_at: datetime | None = Field(default=None)
    duration_ms: int | None = None
    items_total: int | None = None
    items_applied: int | None = None
    items_failed: int | None = None
    retry_count: int | None = None
    error_detail: str | None = None
    metadata_json: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )


class PpcExecutionItem(QueryModel, table=True):
    """Tracks per-recommendation execution outcome within a proposal execution."""

    __tablename__ = "ppc_execution_items"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    execution_id: UUID = Field(index=True)
    proposal_item_id: UUID = Field(index=True)
    recommendation_type: str = Field(index=True)  # bid | keyword | placement | budget
    recommendation_id: UUID = Field(index=True)
    status: str = Field(
        default="pending",
        index=True,  # pending | applied | failed | skipped
    )
    attempt: int = Field(default=0)
    error_detail: str | None = None
    applied_at: datetime | None = None
