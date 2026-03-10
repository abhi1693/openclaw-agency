"""Amazon orders and inventory read/sync endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.amazon_orders import AmazonOrder, AmazonOrderItem, InventorySnapshot
from app.schemas.amazon import (
    AmazonInventoryAlert,
    AmazonInventoryAlerts,
    AmazonInventoryItemRead,
    AmazonInventoryResponse,
    AmazonInventorySummary,
    AmazonOrderItemRead,
    AmazonOrderRead,
    AmazonOrdersResponse,
    AmazonSyncResponse,
)
from app.services.amazon_sync import inventory_status, sync_orders_and_inventory

router = APIRouter(prefix='/amazon', tags=['amazon'])
SESSION_DEP = Depends(get_session)


@router.post('/sync', response_model=AmazonSyncResponse)
async def sync_amazon_data(
    days: int = Query(default=7, ge=1, le=90),
    session: AsyncSession = SESSION_DEP,
) -> AmazonSyncResponse:
    result = await sync_orders_and_inventory(session, days=days)
    return AmazonSyncResponse(**result.__dict__)


@router.get('/orders', response_model=AmazonOrdersResponse)
async def list_amazon_orders(
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = SESSION_DEP,
) -> AmazonOrdersResponse:
    cutoff_rows = await session.exec(
        select(AmazonOrder)
        .order_by(col(AmazonOrder.purchase_date).desc())
        .limit(limit)
    )
    orders = list(cutoff_rows)
    order_ids = [order.id for order in orders]
    items_by_order: dict[object, list[AmazonOrderItemRead]] = {order.id: [] for order in orders}
    if order_ids:
        item_rows = await session.exec(
            select(AmazonOrderItem)
            .where(col(AmazonOrderItem.order_id).in_(order_ids))
            .order_by(col(AmazonOrderItem.created_at).asc())
        )
        for item in item_rows:
            items_by_order[item.order_id].append(
                AmazonOrderItemRead(
                    asin=item.asin,
                    sku=item.sku,
                    title=item.title,
                    quantity_ordered=item.quantity_ordered,
                    quantity_shipped=item.quantity_shipped,
                    item_price=item.item_price,
                    item_tax=item.item_tax,
                    promo_discount=item.promo_discount,
                    currency=item.currency,
                )
            )
    last_synced_at = max((order.synced_at for order in orders), default=None)
    return AmazonOrdersResponse(
        total=len(orders),
        period=f'Last {days} days',
        last_synced_at=last_synced_at,
        orders=[
            AmazonOrderRead(
                amazon_order_id=order.amazon_order_id,
                status=order.status,
                purchase_date=order.purchase_date,
                amount=order.amount,
                currency=order.currency,
                item_count=order.item_count,
                fulfillment=order.fulfillment,
                synced_at=order.synced_at,
                items=items_by_order.get(order.id, []),
            )
            for order in orders
        ],
    )


@router.get('/inventory', response_model=AmazonInventoryResponse)
async def get_amazon_inventory(
    include_all: bool = Query(default=False),
    session: AsyncSession = SESSION_DEP,
) -> AmazonInventoryResponse:
    rows = list(
        await session.exec(select(InventorySnapshot).order_by(col(InventorySnapshot.total_supply).asc()))
    )
    filtered = rows if include_all else [row for row in rows if row.sku.endswith('-FBA')]

    def build_alert(row: InventorySnapshot, *, priority: str | None = None, message: str | None = None) -> AmazonInventoryAlert:
        return AmazonInventoryAlert(
            sku=row.sku,
            asin=row.asin,
            product_name=row.product_name,
            total_supply=row.total_supply,
            priority=priority,
            message=message,
        )

    critical = [row for row in filtered if row.total_supply <= 10]
    low_stock = [row for row in filtered if 10 < row.total_supply <= 50]
    overstock = [row for row in filtered if row.total_supply > 500]
    healthy = [row for row in filtered if 50 < row.total_supply <= 500]
    last_synced_at = max((row.synced_at for row in filtered), default=None)

    return AmazonInventoryResponse(
        last_synced_at=last_synced_at,
        items=[
            AmazonInventoryItemRead(
                sku=row.sku,
                asin=row.asin,
                fn_sku=row.fn_sku,
                condition=row.condition,
                available=row.available,
                inbound=row.inbound,
                reserved=row.reserved,
                total_supply=row.total_supply,
                product_name=row.product_name,
                synced_at=row.synced_at,
                status=inventory_status(row.total_supply),
            )
            for row in filtered
        ],
        summary=AmazonInventorySummary(
            total=len(filtered),
            critical=len(critical),
            low_stock=len(low_stock),
            overstock=len(overstock),
            healthy=len(healthy),
        ),
        alerts=AmazonInventoryAlerts(
            critical=[build_alert(row, priority='high', message=f'{row.total_supply} units left') for row in critical[:10]],
            low_stock=[build_alert(row) for row in low_stock[:15]],
            overstock=[build_alert(row) for row in overstock[:10]],
            restock=[],
        ),
    )
