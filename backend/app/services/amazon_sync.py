"""Amazon SP-API sync helpers for orders and inventory."""

from __future__ import annotations

import asyncio
import json
import shlex
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from sqlalchemy import delete
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.amazon_orders import AmazonOrder, AmazonOrderItem, InventorySnapshot

logger = get_logger(__name__)
SP_API_SCRIPT = Path.home() / '.openclaw' / 'skills' / 'amazon-sp-api' / 'index.js'


@dataclass
class AmazonSyncResult:
    orders_synced: int
    order_items_synced: int
    inventory_items_synced: int
    synced_at: datetime


def _clean_json_stdout(stdout: str) -> str:
    return "\n".join(
        line for line in stdout.splitlines() if line.strip() and not line.startswith("[dotenv")
    )


def _parse_json_stdout(stdout: str) -> dict[str, Any]:
    cleaned = _clean_json_stdout(stdout)
    return json.loads(cleaned)


async def _run_sp_api(*args: str) -> dict[str, Any]:
    command = ['node', str(SP_API_SCRIPT), *args]
    proc = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"amazon-sp-api failed ({proc.returncode}) for {shlex.join(command)}: {stderr.decode().strip()}"
        )
    return _parse_json_stdout(stdout.decode())


def _to_decimal(value: Any) -> Decimal | None:
    if value in (None, ''):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _to_int(value: Any) -> int:
    if value in (None, ''):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not value:
        return utcnow()
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def inventory_status(total_supply: int) -> str:
    if total_supply <= 10:
        return 'critical'
    if total_supply <= 50:
        return 'lowStock'
    if total_supply > 500:
        return 'overstock'
    return 'healthy'


async def sync_orders_and_inventory(session: AsyncSession, *, days: int = 7) -> AmazonSyncResult:
    synced_at = utcnow()
    orders_payload = await _run_sp_api('orders', '--days', str(days))
    orders = list(orders_payload.get('orders') or [])
    order_items_total = 0

    for order_payload in orders:
        amazon_order_id = str(order_payload.get('orderId') or '').strip()
        if not amazon_order_id:
            continue
        existing = await session.exec(
            select(AmazonOrder).where(col(AmazonOrder.amazon_order_id) == amazon_order_id)
        )
        order = existing.one_or_none()
        if order is None:
            order = AmazonOrder(
                amazon_order_id=amazon_order_id,
                status=str(order_payload.get('status') or 'unknown'),
                purchase_date=_to_datetime(order_payload.get('purchaseDate')),
            )
            session.add(order)
            await session.flush()

        order.status = str(order_payload.get('status') or order.status)
        order.purchase_date = _to_datetime(order_payload.get('purchaseDate'))
        order.amount = _to_decimal(order_payload.get('amount'))
        order.currency = order_payload.get('currency')
        order.item_count = _to_int(order_payload.get('itemCount'))
        order.fulfillment = order_payload.get('fulfillment')
        order.raw_payload = order_payload
        order.synced_at = synced_at
        order.updated_at = synced_at
        await session.exec(delete(AmazonOrderItem).where(col(AmazonOrderItem.order_id) == order.id))

        item_payload = await _run_sp_api('order-items', '--order-id', amazon_order_id)
        for item in list(item_payload.get('items') or []):
            session.add(
                AmazonOrderItem(
                    order_id=order.id,
                    asin=item.get('asin'),
                    sku=item.get('sku'),
                    title=item.get('title'),
                    quantity_ordered=_to_int(item.get('quantityOrdered')),
                    quantity_shipped=_to_int(item.get('quantityShipped')),
                    item_price=_to_decimal(item.get('itemPrice')),
                    item_tax=_to_decimal(item.get('itemTax')),
                    promo_discount=_to_decimal(item.get('promoDiscount')),
                    currency=item.get('currency'),
                    raw_payload=item,
                    synced_at=synced_at,
                    updated_at=synced_at,
                )
            )
            order_items_total += 1

    inventory_payload = await _run_sp_api('inventory')
    inventory_items = list(inventory_payload.get('items') or [])
    for item in inventory_items:
        sku = str(item.get('sku') or '').strip()
        if not sku:
            continue
        existing = await session.exec(select(InventorySnapshot).where(col(InventorySnapshot.sku) == sku))
        snapshot = existing.one_or_none()
        if snapshot is None:
            snapshot = InventorySnapshot(sku=sku)
            session.add(snapshot)
        snapshot.asin = item.get('asin')
        snapshot.fn_sku = item.get('fnSku')
        snapshot.condition = item.get('condition')
        snapshot.available = _to_int(item.get('available'))
        snapshot.inbound = _to_int(item.get('inbound'))
        snapshot.reserved = _to_int(item.get('reserved'))
        snapshot.total_supply = _to_int(item.get('totalSupply'))
        snapshot.product_name = item.get('productName')
        snapshot.raw_payload = item
        snapshot.synced_at = synced_at
        snapshot.updated_at = synced_at

    await session.commit()
    return AmazonSyncResult(
        orders_synced=len(orders),
        order_items_synced=order_items_total,
        inventory_items_synced=len(inventory_items),
        synced_at=synced_at,
    )
