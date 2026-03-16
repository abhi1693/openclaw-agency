"""Schemas for Amazon orders/inventory API responses and phase 3 domains."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlmodel import SQLModel

RUNTIME_ANNOTATION_TYPES = (date, datetime, Decimal, UUID)


class AmazonOrderItemRead(SQLModel):
    asin: str | None = None
    sku: str | None = None
    title: str | None = None
    quantity_ordered: int
    quantity_shipped: int
    item_price: Decimal | None = None
    item_tax: Decimal | None = None
    promo_discount: Decimal | None = None
    currency: str | None = None


class AmazonOrderRead(SQLModel):
    amazon_order_id: str
    status: str
    purchase_date: datetime
    amount: Decimal | None = None
    currency: str | None = None
    item_count: int
    fulfillment: str | None = None
    synced_at: datetime
    items: list[AmazonOrderItemRead]


class AmazonOrdersResponse(SQLModel):
    total: int
    period: str
    last_synced_at: datetime | None = None
    orders: list[AmazonOrderRead]


class AmazonInventoryItemRead(SQLModel):
    sku: str
    asin: str | None = None
    fn_sku: str | None = None
    condition: str | None = None
    available: int
    inbound: int
    reserved: int
    total_supply: int
    product_name: str | None = None
    synced_at: datetime
    status: str


class AmazonInventorySummary(SQLModel):
    total: int
    critical: int
    low_stock: int
    overstock: int
    healthy: int
    restock: int = 0


class AmazonInventoryAlert(SQLModel):
    sku: str
    asin: str | None = None
    product_name: str | None = None
    total_supply: int
    priority: str | None = None
    message: str | None = None


class AmazonInventoryAlerts(SQLModel):
    critical: list[AmazonInventoryAlert]
    low_stock: list[AmazonInventoryAlert]
    overstock: list[AmazonInventoryAlert]
    restock: list[AmazonInventoryAlert]


class AmazonInventoryResponse(SQLModel):
    last_synced_at: datetime | None = None
    items: list[AmazonInventoryItemRead]
    summary: AmazonInventorySummary
    alerts: AmazonInventoryAlerts


class AmazonSyncResponse(SQLModel):
    orders_synced: int = 0
    order_items_synced: int = 0
    inventory_items_synced: int = 0
    daily_sales_synced: int = 0
    product_sales_synced: int = 0
    financial_events_synced: int = 0
    campaigns_synced: int = 0
    ad_metrics_synced: int = 0
    pricing_snapshots_synced: int = 0
    return_events_synced: int = 0
    synced_at: datetime


class DailySalesRead(SQLModel):
    sales_date: date
    interval: str
    order_count: int
    order_item_count: int
    unit_count: int
    average_unit_price: Decimal | None = None
    total_sales: Decimal | None = None
    currency: str | None = None
    synced_at: datetime


class SalesResponse(SQLModel):
    total: int
    period: str
    last_synced_at: datetime | None = None
    metrics: list[DailySalesRead]


class ProductSalesRead(SQLModel):
    period: str
    sku: str | None = None
    asin: str | None = None
    title: str | None = None
    quantity_sold: int
    order_count: int
    revenue: Decimal | None = None
    currency: str | None = None
    synced_at: datetime


class TopProductsResponse(SQLModel):
    total: int
    period: str
    last_synced_at: datetime | None = None
    products: list[ProductSalesRead]


class FinancialEventRead(SQLModel):
    period: str
    event_group: str
    reference_id: str | None = None
    posted_date: datetime | None = None
    sku: str | None = None
    amount: Decimal | None = None
    currency: str | None = None
    description: str | None = None
    synced_at: datetime


class FinanceResponse(SQLModel):
    total: int
    period: str
    last_synced_at: datetime | None = None
    events: list[FinancialEventRead]


class CampaignRead(SQLModel):
    campaign_id: str
    campaign_type: str
    name: str
    state: str | None = None
    targeting_type: str | None = None
    budget_amount: Decimal | None = None
    budget_type: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    synced_at: datetime


class CampaignsResponse(SQLModel):
    total: int
    campaign_type: str
    last_synced_at: datetime | None = None
    campaigns: list[CampaignRead]


class AdMetricRead(SQLModel):
    campaign_id: str
    period: str
    report_date: date | None = None
    spend: Decimal | None = None
    sales: Decimal | None = None
    impressions: int
    clicks: int
    orders: int
    units: int
    ctr: Decimal | None = None
    cpc: Decimal | None = None
    acos: Decimal | None = None
    roas: Decimal | None = None
    synced_at: datetime


class BudgetResponse(SQLModel):
    total: int
    period: str
    last_synced_at: datetime | None = None
    metrics: list[AdMetricRead]


class PricingSnapshotRead(SQLModel):
    period: str
    asin: str | None = None
    sku: str | None = None
    status: str | None = None
    price: Decimal | None = None
    currency: str | None = None
    change_amount: Decimal | None = None
    change_percent: Decimal | None = None
    competitor_offers: int
    buy_box_winner: bool | None = None
    synced_at: datetime


class PricingResponse(SQLModel):
    total: int
    period: str
    last_synced_at: datetime | None = None
    snapshots: list[PricingSnapshotRead]


class ReturnEventRead(SQLModel):
    period: str
    order_id: str | None = None
    sku: str | None = None
    reason: str | None = None
    quantity: int
    status: str | None = None
    event_date: datetime | None = None
    synced_at: datetime


class ReturnsResponse(SQLModel):
    total: int
    period: str
    last_synced_at: datetime | None = None
    events: list[ReturnEventRead]


class SearchTermReportRead(SQLModel):
    id: UUID
    search_term: str
    campaign_id: str | None = None
    campaign_name: str | None = None
    ad_group_id: str | None = None
    ad_group_name: str | None = None
    keyword: str | None = None
    match_type: str | None = None
    impressions: int
    clicks: int
    spend: Decimal | None = None
    sales: Decimal | None = None
    orders: int
    units: int
    acos: Decimal | None = None
    roas: Decimal | None = None
    ctr: Decimal | None = None
    cpc: Decimal | None = None
    report_date: date | None = None
    period: str
    synced_at: datetime


class SearchTermsResponse(SQLModel):
    total: int
    period: str
    last_synced_at: datetime | None = None
    terms: list[SearchTermReportRead]


class SearchTermsSyncResponse(SQLModel):
    search_terms_synced: int = 0
    synced_at: datetime


class PpcAnalysisSnapshotRead(SQLModel):
    id: UUID
    analysis_type: str
    report_date: date
    period: str | None = None
    data: dict | None = None
    summary: str | None = None
    synced_at: datetime


class PpcAnalysesResponse(SQLModel):
    total: int
    snapshots: list[PpcAnalysisSnapshotRead]


class PpcAnalysesSyncResponse(SQLModel):
    analyses_synced: int = 0
    synced_at: datetime


# ── Profit / COGS ─────────────────────────────────────────────────────────────

class ProductCostRead(SQLModel):
    id: int | None = None
    sku: str
    asin: str
    product_name: str
    unit_cost: Decimal
    shipping_to_port: Decimal
    freight: Decimal
    customs: Decimal
    duty_rate: Decimal
    last_mile: Decimal
    prep: Decimal
    other_cost: Decimal
    total_landed_cost: Decimal
    currency: str
    updated_at: datetime


class ProductCostUpsert(SQLModel):
    sku: str
    asin: str = ""
    product_name: str = ""
    unit_cost: Decimal = Decimal(0)
    shipping_to_port: Decimal = Decimal(0)
    freight: Decimal = Decimal(0)
    customs: Decimal = Decimal(0)
    duty_rate: Decimal = Decimal(0)
    last_mile: Decimal = Decimal(0)
    prep: Decimal = Decimal(0)
    other_cost: Decimal = Decimal(0)
    total_landed_cost: Decimal = Decimal(0)
    currency: str = "USD"


class CogsListResponse(SQLModel):
    items: list[ProductCostRead]
    total: int


class ProfitItemRead(SQLModel):
    sku: str
    asin: str
    product_name: str
    revenue: Decimal
    units_sold: int
    landed_cost: Decimal
    fba_fee: Decimal
    referral_fee: Decimal
    ad_spend: Decimal
    net_profit: Decimal
    profit_margin: Decimal


class ProfitSummaryRead(SQLModel):
    total_revenue: Decimal
    total_cost: Decimal
    total_profit: Decimal
    profit_margin: Decimal
    total_ad_spend: Decimal
    tacos: Decimal
    organic_ratio: Decimal


class ProfitResponse(SQLModel):
    summary: ProfitSummaryRead
    items: list[ProfitItemRead]
    warnings: list[str] = []
    synced_at: datetime | None = None


# ── Restock ───────────────────────────────────────────────────────────────────

class RestockConfigRead(SQLModel):
    id: int | None = None
    asin: str
    lead_time_days: int
    fba_prep_days: int
    safety_stock_days: int


class RestockConfigUpsert(SQLModel):
    asin: str
    lead_time_days: int = 30
    fba_prep_days: int = 7
    safety_stock_days: int = 14


class RestockItemRead(SQLModel):
    asin: str
    product_name: str
    current_stock: int
    daily_sales: float
    days_until_stockout: int
    reorder_qty: int
    urgency: str  # "critical" | "warning" | "ok"
    last_updated: datetime | None = None


class RestockSummaryRead(SQLModel):
    critical: int
    warning: int
    ok: int


class RestockResponse(SQLModel):
    items: list[RestockItemRead]
    summary: RestockSummaryRead
    last_synced_at: datetime | None = None


# ── Inventory Status ──────────────────────────────────────────────────────────

class InventoryStatusSummary(SQLModel):
    total_fulfillable: int = 0
    total_reserved: int = 0
    total_unsellable: int = 0
    total_inbound: int = 0
    total_warehouse: int = 0
    total_skus: int = 0


class InventoryStatusResponse(SQLModel):
    summary: InventoryStatusSummary
    items: list[AmazonInventoryItemRead]
    last_synced_at: datetime | None = None
