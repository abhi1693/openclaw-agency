"""Amazon orders, inventory, and phase 3 domain persistence models."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, Numeric, UniqueConstraint
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel

RUNTIME_ANNOTATION_TYPES = (date, datetime, Decimal)


class AmazonOrder(QueryModel, table=True):
    """Persisted Amazon order summary synced from SP-API."""

    __tablename__ = "amazon_orders"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    amazon_order_id: str = Field(index=True, unique=True)
    status: str = Field(index=True)
    purchase_date: datetime = Field(index=True)
    amount: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    currency: str | None = None
    item_count: int = Field(default=0)
    fulfillment: str | None = None
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class AmazonOrderItem(QueryModel, table=True):
    """Persisted Amazon order item rows synced per order."""

    __tablename__ = "amazon_order_items"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint(
            "order_id",
            "sku",
            "asin",
            "title",
            name="uq_amazon_order_items_identity",
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    order_id: UUID = Field(foreign_key="amazon_orders.id", index=True)
    asin: str | None = Field(default=None, index=True)
    sku: str | None = Field(default=None, index=True)
    title: str | None = None
    quantity_ordered: int = Field(default=0)
    quantity_shipped: int = Field(default=0)
    item_price: Decimal | None = Field(
        default=None, sa_column=Column(Numeric(12, 2), nullable=True)
    )
    item_tax: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    promo_discount: Decimal | None = Field(
        default=None, sa_column=Column(Numeric(12, 2), nullable=True)
    )
    currency: str | None = None
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class InventorySnapshot(QueryModel, table=True):
    """Latest per-SKU Amazon inventory snapshot synced from SP-API."""

    __tablename__ = "inventory_snapshots"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    sku: str = Field(index=True, unique=True)
    asin: str | None = Field(default=None, index=True)
    fn_sku: str | None = None
    condition: str | None = None
    available: int = Field(default=0)
    inbound: int = Field(default=0)
    reserved: int = Field(default=0)
    total_supply: int = Field(default=0, index=True)
    product_name: str | None = None
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class DailySales(QueryModel, table=True):
    __tablename__ = "daily_sales"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    sales_date: date = Field(index=True)
    interval: str = Field(index=True, unique=True)
    order_count: int = Field(default=0)
    order_item_count: int = Field(default=0)
    unit_count: int = Field(default=0)
    average_unit_price: Decimal | None = Field(
        default=None, sa_column=Column(Numeric(12, 2), nullable=True)
    )
    total_sales: Decimal | None = Field(
        default=None, sa_column=Column(Numeric(12, 2), nullable=True)
    )
    currency: str | None = None
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ProductSales(QueryModel, table=True):
    __tablename__ = "product_sales"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (UniqueConstraint("identity_key", name="uq_product_sales_identity_key"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    identity_key: str = Field(index=True)
    period: str = Field(index=True)
    sku: str | None = Field(default=None, index=True)
    asin: str | None = Field(default=None, index=True)
    title: str | None = None
    quantity_sold: int = Field(default=0)
    order_count: int = Field(default=0)
    revenue: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    currency: str | None = None
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class FinancialEvent(QueryModel, table=True):
    __tablename__ = "financial_events"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (UniqueConstraint("identity_key", name="uq_financial_events_identity_key"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    identity_key: str = Field(index=True)
    period: str = Field(index=True)
    event_group: str = Field(index=True)
    reference_id: str | None = Field(default=None, index=True)
    posted_date: datetime | None = Field(default=None, index=True)
    sku: str | None = Field(default=None, index=True)
    amount: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    currency: str | None = None
    description: str | None = None
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Campaign(QueryModel, table=True):
    __tablename__ = "campaigns"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    campaign_id: str = Field(index=True, unique=True)
    campaign_type: str = Field(index=True)
    name: str = Field(index=True)
    state: str | None = Field(default=None, index=True)
    targeting_type: str | None = None
    budget_amount: Decimal | None = Field(
        default=None, sa_column=Column(Numeric(12, 2), nullable=True)
    )
    budget_type: str | None = None
    start_date: date | None = Field(default=None, index=True)
    end_date: date | None = Field(default=None, index=True)
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class AdMetric(QueryModel, table=True):
    __tablename__ = "ad_metrics"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (UniqueConstraint("identity_key", name="uq_ad_metrics_identity_key"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    identity_key: str = Field(index=True)
    campaign_id: str = Field(index=True)
    period: str = Field(index=True)
    report_date: date | None = Field(default=None, index=True)
    spend: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    sales: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    impressions: int = Field(default=0)
    clicks: int = Field(default=0)
    orders: int = Field(default=0)
    units: int = Field(default=0)
    ctr: Decimal | None = Field(default=None, sa_column=Column(Numeric(8, 4), nullable=True))
    cpc: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 4), nullable=True))
    acos: Decimal | None = Field(default=None, sa_column=Column(Numeric(8, 4), nullable=True))
    roas: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 4), nullable=True))
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PricingSnapshot(QueryModel, table=True):
    __tablename__ = "pricing_snapshots"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (UniqueConstraint("identity_key", name="uq_pricing_snapshots_identity_key"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    identity_key: str = Field(index=True)
    period: str = Field(index=True)
    asin: str | None = Field(default=None, index=True)
    sku: str | None = Field(default=None, index=True)
    status: str | None = Field(default=None, index=True)
    price: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    currency: str | None = None
    change_amount: Decimal | None = Field(
        default=None, sa_column=Column(Numeric(12, 2), nullable=True)
    )
    change_percent: Decimal | None = Field(
        default=None, sa_column=Column(Numeric(8, 2), nullable=True)
    )
    competitor_offers: int = Field(default=0)
    buy_box_winner: bool | None = None
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ReturnEvent(QueryModel, table=True):
    __tablename__ = "return_events"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (UniqueConstraint("identity_key", name="uq_return_events_identity_key"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    identity_key: str = Field(index=True)
    period: str = Field(index=True)
    order_id: str | None = Field(default=None, index=True)
    sku: str | None = Field(default=None, index=True)
    reason: str | None = Field(default=None, index=True)
    quantity: int = Field(default=0)
    status: str | None = Field(default=None, index=True)
    event_date: datetime | None = Field(default=None, index=True)
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class SearchTermReport(QueryModel, table=True):
    """PPC search term report rows synced from Amazon Advertising API."""

    __tablename__ = "search_term_reports"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint(
            "period",
            "search_term",
            "campaign_name",
            "match_type",
            "report_date",
            name="uq_search_term_reports_identity",
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    search_term: str = Field(index=True)
    campaign_id: str | None = Field(default=None, index=True)
    campaign_name: str | None = Field(default=None, index=True)
    ad_group_id: str | None = Field(default=None, index=True)
    ad_group_name: str | None = Field(default=None, index=True)
    keyword: str | None = None  # targeting field
    match_type: str | None = Field(default=None, index=True)
    impressions: int = Field(default=0)
    clicks: int = Field(default=0)
    spend: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 4), nullable=True))
    sales: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 4), nullable=True))
    orders: int = Field(default=0)
    units: int = Field(default=0)
    acos: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 6), nullable=True))
    roas: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 6), nullable=True))
    ctr: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 6), nullable=True))
    cpc: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 6), nullable=True))
    report_date: date | None = Field(default=None, index=True)
    period: str = Field(index=True)  # "startDate_endDate"
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PpcAnalysisSnapshot(QueryModel, table=True):
    """PPC analysis results snapshot (keyword/bid/campaign/weekly/ai-insights)."""

    __tablename__ = "ppc_analysis_snapshots"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint(
            "analysis_type",
            "report_date",
            name="uq_ppc_analysis_snapshots_type_date",
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    analysis_type: str = Field(index=True)  # keyword/bid/campaign/weekly/ai-insights
    report_date: date = Field(index=True)
    period: str | None = None  # date range from filename if applicable
    data: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    summary: str | None = None
    raw_payload: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
