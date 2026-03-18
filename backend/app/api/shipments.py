"""Ocean freight shipment tracking API endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_session
from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.shipments import Shipment, ShipmentEvent
from app.services.shipment_tracking import (
    refresh_all_active_shipments,
    refresh_shipment_from_shipmentlink,
)

router = APIRouter(prefix="/shipments", tags=["shipments"])
logger = get_logger(__name__)


# ── Static routes MUST come before /{shipment_id} ────────────────────────────


@router.get("/dashboard")
async def get_dashboard(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    """Summary stats: in_transit, arriving_soon, year total, total freight cost."""
    now = utcnow()
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    seven_days = now + timedelta(days=7)

    in_transit_result = await session.exec(
        select(func.count(Shipment.id)).where(
            col(Shipment.status).in_(["departed", "in_transit"])
        )
    )
    in_transit = in_transit_result.one()

    arriving_result = await session.exec(
        select(func.count(Shipment.id)).where(
            Shipment.eta.is_not(None),  # type: ignore[union-attr]
            Shipment.eta <= seven_days,
            Shipment.eta >= now,
            col(Shipment.status).in_(["booked", "departed", "in_transit"]),
        )
    )
    arriving_soon = arriving_result.one()

    year_total_result = await session.exec(
        select(func.count(Shipment.id)).where(Shipment.created_at >= year_start)
    )
    year_total = year_total_result.one()

    cost_result = await session.exec(
        select(func.sum(Shipment.freight_cost)).where(Shipment.created_at >= year_start)
    )
    total_cost = cost_result.one() or 0

    return {
        "in_transit": in_transit,
        "arriving_soon": arriving_soon,
        "year_total": year_total,
        "total_freight_cost": float(total_cost),
    }


@router.get("/history")
async def get_history(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    """All completed shipments for reporting."""
    result = await session.exec(
        select(Shipment)
        .where(col(Shipment.status).in_(["delivered", "picked_up"]))
        .order_by(col(Shipment.actual_arrival).desc())
    )
    shipments = result.all()
    return {"shipments": [s.model_dump() for s in shipments]}


@router.post("/cron/refresh-active")
async def cron_refresh_active(
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Cron endpoint: refresh all active (in_transit / departed / booked) shipments."""
    return await refresh_all_active_shipments(session)


# ── Collection endpoints ──────────────────────────────────────────────────────


@router.get("/")
async def list_shipments(
    status_filter: str | None = None,
    carrier: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """List all shipments sorted by ETA (nulls last)."""
    stmt = select(Shipment)
    if status_filter:
        stmt = stmt.where(Shipment.status == status_filter)
    if carrier:
        stmt = stmt.where(Shipment.carrier == carrier)
    stmt = stmt.order_by(col(Shipment.eta).asc().nulls_last())
    result = await session.exec(stmt)
    shipments = result.all()
    return {"shipments": [s.model_dump() for s in shipments]}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_shipment(
    payload: dict[str, Any],
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Create a new shipment. Source defaults to 'manual'; refresh populates tracking data."""
    booking_number = payload.get("booking_number", "").strip()
    if not booking_number:
        raise HTTPException(status_code=400, detail="booking_number is required")

    def _parse_dt(val: Any) -> datetime | None:
        if val is None:
            return None
        if isinstance(val, datetime):
            return val
        try:
            return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        except ValueError:
            return None

    shipment = Shipment(
        booking_number=booking_number,
        carrier=payload.get("carrier", "").strip(),
        carrier_scac=payload.get("carrier_scac", "").strip(),
        vessel_name=payload.get("vessel_name", ""),
        voyage_number=payload.get("voyage_number", ""),
        port_of_loading=payload.get("port_of_loading", ""),
        port_of_discharge=payload.get("port_of_discharge", ""),
        container_number=payload.get("container_number", ""),
        container_type=payload.get("container_type", ""),
        weight_kg=int(payload.get("weight_kg", 0)),
        etd=_parse_dt(payload.get("etd")),
        eta=_parse_dt(payload.get("eta")),
        description=payload.get("description", ""),
        supplier=payload.get("supplier", ""),
        reference=payload.get("reference", ""),
        notes=payload.get("notes", ""),
        freight_cost=payload.get("freight_cost", 0),
        customs_cost=payload.get("customs_cost", 0),
        other_cost=payload.get("other_cost", 0),
        tracking_source="manual",
        status="booked",
    )
    session.add(shipment)
    await session.commit()
    await session.refresh(shipment)
    return shipment.model_dump()


# ── Per-shipment endpoints (keep AFTER static routes) ────────────────────────


@router.get("/{shipment_id}")
async def get_shipment(
    shipment_id: int,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Single shipment detail with events timeline."""
    shipment = await session.get(Shipment, shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    events_result = await session.exec(
        select(ShipmentEvent)
        .where(ShipmentEvent.shipment_id == shipment_id)
        .order_by(col(ShipmentEvent.event_at).asc().nulls_last())
    )
    events = events_result.all()

    data = shipment.model_dump()
    data["events"] = [e.model_dump() for e in events]
    return data


@router.put("/{shipment_id}")
async def update_shipment(
    shipment_id: int,
    payload: dict[str, Any],
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Update shipment info (notes, costs, manual overrides)."""
    shipment = await session.get(Shipment, shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    updatable = [
        "vessel_name", "voyage_number", "port_of_loading", "port_of_discharge",
        "container_number", "container_type", "weight_kg", "etd", "eta",
        "actual_departure", "actual_arrival", "status", "last_event",
        "description", "supplier", "reference", "notes",
        "freight_cost", "customs_cost", "other_cost", "carrier", "carrier_scac",
    ]
    for field in updatable:
        if field in payload:
            setattr(shipment, field, payload[field])
    shipment.updated_at = utcnow()
    session.add(shipment)
    await session.commit()
    await session.refresh(shipment)
    return shipment.model_dump()


@router.delete("/{shipment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shipment(
    shipment_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a shipment and all its events."""
    shipment = await session.get(Shipment, shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    events_result = await session.exec(
        select(ShipmentEvent).where(ShipmentEvent.shipment_id == shipment_id)
    )
    for event in events_result.all():
        await session.delete(event)
    await session.delete(shipment)
    await session.commit()


@router.post("/{shipment_id}/refresh")
async def refresh_shipment(
    shipment_id: int,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Scrape ShipmentLink for the latest tracking data and update the shipment."""
    shipment = await session.get(Shipment, shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    try:
        result = await refresh_shipment_from_shipmentlink(shipment, session)
    except ImportError:
        return JSONResponse(
            status_code=503,
            content={
                "error": "Playwright not available — manual tracking update required",
                "playwright_missing": True,
            },
        )
    return result
