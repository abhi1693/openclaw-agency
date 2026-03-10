"""Schemas for Amazon orders/inventory API responses."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlmodel import SQLModel

RUNTIME_ANNOTATION_TYPES = (datetime, Decimal, UUID)


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
    orders_synced: int
    order_items_synced: int
    inventory_items_synced: int
    synced_at: datetime
