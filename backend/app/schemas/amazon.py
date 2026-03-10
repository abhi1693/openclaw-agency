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
