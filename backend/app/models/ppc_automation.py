"""PPC automation engine persistence models — Phase 1A."""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Column, Date, Float, Numeric
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
    impressions: int = Field(default=0)
    clicks: int = Field(default=0)
    cost: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(14, 4), nullable=False, server_default="0"))
    sales: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(14, 2), nullable=False, server_default="0"))
    orders: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)


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
