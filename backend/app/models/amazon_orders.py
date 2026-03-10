"""Amazon order and inventory persistence models."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, Numeric, UniqueConstraint
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel

RUNTIME_ANNOTATION_TYPES = (datetime, Decimal)


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
    raw_payload: dict[str, object] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
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
    item_price: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    item_tax: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    promo_discount: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    currency: str | None = None
    raw_payload: dict[str, object] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
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
    raw_payload: dict[str, object] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    synced_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
