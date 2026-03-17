"""Ocean freight shipment tracking models."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Column, Numeric
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel


class Shipment(QueryModel, table=True):
    """Ocean freight container shipment tracking."""

    __tablename__ = "shipments"  # pyright: ignore[reportAssignmentType]

    id: int | None = Field(default=None, primary_key=True)

    # 基本信息（用户输入）
    booking_number: str = Field(index=True)
    container_number: str = Field(default="")
    bl_number: str = Field(default="")

    # 船公司信息
    carrier: str = Field(default="")
    carrier_scac: str = Field(default="")
    vessel_name: str = Field(default="")
    voyage_number: str = Field(default="")

    # 路线
    port_of_loading: str = Field(default="")
    port_of_discharge: str = Field(default="")

    # 货柜详情
    container_type: str = Field(default="")
    weight_kg: int = Field(default=0)

    # 时间节点
    etd: datetime | None = Field(default=None)
    eta: datetime | None = Field(default=None)
    actual_departure: datetime | None = Field(default=None)
    actual_arrival: datetime | None = Field(default=None)

    # 状态
    # booked | departed | in_transit | arrived | discharged | picked_up | delivered
    status: str = Field(default="booked")
    last_event: str = Field(default="")
    last_event_at: datetime | None = Field(default=None)

    # 追踪来源: "shipmentlink" | "manual"
    tracking_source: str = Field(default="manual")

    # 业务信息
    description: str = Field(default="")
    supplier: str = Field(default="")
    reference: str = Field(default="")
    notes: str = Field(default="")

    # 成本
    freight_cost: Decimal = Field(
        default=Decimal(0),
        sa_column=Column(Numeric(12, 2), nullable=False, server_default="0"),
    )
    customs_cost: Decimal = Field(
        default=Decimal(0),
        sa_column=Column(Numeric(12, 2), nullable=False, server_default="0"),
    )
    other_cost: Decimal = Field(
        default=Decimal(0),
        sa_column=Column(Numeric(12, 2), nullable=False, server_default="0"),
    )

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ShipmentEvent(QueryModel, table=True):
    """Individual tracking events for a shipment."""

    __tablename__ = "shipment_events"  # pyright: ignore[reportAssignmentType]

    id: int | None = Field(default=None, primary_key=True)
    shipment_id: int = Field(foreign_key="shipments.id", index=True)

    event_type: str = Field(default="")
    description: str = Field(default="")
    location: str = Field(default="")
    vessel_name: str = Field(default="")
    event_at: datetime | None = Field(default=None)
    source: str = Field(default="")
    raw_data: str = Field(default="")  # JSON of raw scraped data

    created_at: datetime = Field(default_factory=utcnow)
