"""Amazon SP-API and ads sync helpers for orders, inventory, and phase 3 domains."""

from __future__ import annotations

import asyncio
import json
import shlex
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from sqlalchemy import delete
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.time import utcnow
from app.models.amazon_orders import (
    AdMetric,
    AmazonOrder,
    AmazonOrderItem,
    Campaign,
    DailySales,
    FinancialEvent,
    InventorySnapshot,
    PricingSnapshot,
    ProductSales,
    ReturnEvent,
)

SP_API_SCRIPT = Path.home() / ".openclaw" / "skills" / "amazon-sp-api" / "index.js"
ADS_SCRIPT = Path.home() / ".openclaw" / "skills" / "amazon-advertising" / "guard.js"
SP_API_REPORTS = Path.home() / ".openclaw" / "skills" / "amazon-sp-api" / "reports"


@dataclass
class AmazonSyncResult:
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
    synced_at: datetime = utcnow()


def _clean_json_stdout(stdout: str) -> str:
    return "\n".join(
        line
        for line in stdout.splitlines()
        if line.strip() and not line.startswith("[dotenv") and not line.startswith("[Auth]")
    )


def _parse_json_stdout(stdout: str) -> dict[str, Any]:
    return json.loads(_clean_json_stdout(stdout))


async def _run_json_script(script: Path, *args: str) -> dict[str, Any]:
    command = ["node", str(script), *args]
    proc = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"amazon script failed ({proc.returncode}) for {shlex.join(command)}: {stderr.decode().strip()}"
        )
    return _parse_json_stdout(stdout.decode())


async def _run_sp_api(*args: str) -> dict[str, Any]:
    return await _run_json_script(SP_API_SCRIPT, *args)


async def _run_ads_api(*args: str) -> dict[str, Any]:
    return await _run_json_script(ADS_SCRIPT, *args)


def _to_decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    if isinstance(value, dict):
        value = value.get("amount") or value.get("value")
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _to_int(value: Any) -> int:
    if value in (None, ""):
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
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _to_date(value: Any) -> date | None:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        return date.fromisoformat(value[:10])
    return None


def inventory_status(total_supply: int) -> str:
    if total_supply <= 10:
        return "critical"
    if total_supply <= 50:
        return "lowStock"
    if total_supply > 500:
        return "overstock"
    return "healthy"


async def sync_orders_and_inventory(session: AsyncSession, *, days: int = 7) -> AmazonSyncResult:
    synced_at = utcnow()
    orders_payload = await _run_sp_api("orders", "--days", str(days))
    orders = list(orders_payload.get("orders") or [])
    order_items_total = 0

    for order_payload in orders:
        amazon_order_id = str(order_payload.get("orderId") or "").strip()
        if not amazon_order_id:
            continue
        existing = await session.exec(
            select(AmazonOrder).where(col(AmazonOrder.amazon_order_id) == amazon_order_id)
        )
        order = existing.one_or_none()
        if order is None:
            order = AmazonOrder(
                amazon_order_id=amazon_order_id,
                status=str(order_payload.get("status") or "unknown"),
                purchase_date=_to_datetime(order_payload.get("purchaseDate")),
            )
            session.add(order)
            await session.flush()

        order.status = str(order_payload.get("status") or order.status)
        order.purchase_date = _to_datetime(order_payload.get("purchaseDate"))
        order.amount = _to_decimal(order_payload.get("amount"))
        order.currency = order_payload.get("currency")
        order.item_count = _to_int(order_payload.get("itemCount"))
        order.fulfillment = order_payload.get("fulfillment")
        order.raw_payload = order_payload
        order.synced_at = synced_at
        order.updated_at = synced_at
        await session.exec(delete(AmazonOrderItem).where(col(AmazonOrderItem.order_id) == order.id))

        item_payload = await _run_sp_api("order-items", "--order-id", amazon_order_id)
        for item in list(item_payload.get("items") or []):
            session.add(
                AmazonOrderItem(
                    order_id=order.id,
                    asin=item.get("asin"),
                    sku=item.get("sku"),
                    title=item.get("title"),
                    quantity_ordered=_to_int(item.get("quantityOrdered")),
                    quantity_shipped=_to_int(item.get("quantityShipped")),
                    item_price=_to_decimal(item.get("itemPrice")),
                    item_tax=_to_decimal(item.get("itemTax")),
                    promo_discount=_to_decimal(item.get("promoDiscount")),
                    currency=item.get("currency"),
                    raw_payload=item,
                    synced_at=synced_at,
                    updated_at=synced_at,
                )
            )
            order_items_total += 1

    inventory_payload = await _run_sp_api("inventory")
    inventory_items = list(inventory_payload.get("items") or [])
    for item in inventory_items:
        sku = str(item.get("sku") or "").strip()
        if not sku:
            continue
        existing = await session.exec(
            select(InventorySnapshot).where(col(InventorySnapshot.sku) == sku)
        )
        snapshot = existing.one_or_none()
        if snapshot is None:
            snapshot = InventorySnapshot(sku=sku)
            session.add(snapshot)
        snapshot.asin = item.get("asin")
        snapshot.fn_sku = item.get("fnSku")
        snapshot.condition = item.get("condition")
        snapshot.available = _to_int(item.get("available"))
        snapshot.inbound = _to_int(item.get("inbound"))
        snapshot.reserved = _to_int(item.get("reserved"))
        snapshot.total_supply = _to_int(item.get("totalSupply"))
        snapshot.product_name = item.get("productName")
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


async def sync_sales(session: AsyncSession, *, days: int = 14) -> AmazonSyncResult:
    synced_at = utcnow()
    payload = await _run_sp_api("sales", "--days", str(days))
    metrics = list(payload.get("metrics") or [])
    await session.exec(delete(DailySales))
    count = 0
    for metric in metrics:
        interval = str(metric.get("interval") or "")
        if not interval:
            continue
        sales_date = _to_date(interval.split("--")[0])
        if sales_date is None:
            continue
        total_sales = metric.get("totalSales") or {}
        average_unit_price = metric.get("averageUnitPrice") or {}
        session.add(
            DailySales(
                sales_date=sales_date,
                interval=interval,
                order_count=_to_int(metric.get("orderCount")),
                order_item_count=_to_int(metric.get("orderItemCount")),
                unit_count=_to_int(metric.get("unitCount")),
                average_unit_price=_to_decimal(average_unit_price),
                total_sales=_to_decimal(total_sales),
                currency=total_sales.get("currencyCode") if isinstance(total_sales, dict) else None,
                raw_payload=metric,
                synced_at=synced_at,
                updated_at=synced_at,
            )
        )
        count += 1
    await session.commit()
    return AmazonSyncResult(daily_sales_synced=count, synced_at=synced_at)


async def sync_top_products(session: AsyncSession, *, days: int = 14) -> AmazonSyncResult:
    synced_at = utcnow()
    payload = await _run_sp_api("top-products", "--days", str(days))
    products = list(payload.get("products") or [])
    period = str(payload.get("period") or f"Last {days} days")
    await session.exec(delete(ProductSales))
    count = 0
    for product in products:
        session.add(
            ProductSales(
                period=period,
                sku=product.get("sku"),
                asin=product.get("asin"),
                title=product.get("title") or product.get("productName") or product.get("name"),
                quantity_sold=_to_int(
                    product.get("quantitySold")
                    or product.get("quantity")
                    or product.get("unitsSold")
                ),
                order_count=_to_int(product.get("orderCount")),
                revenue=_to_decimal(
                    product.get("revenue") or product.get("sales") or product.get("totalRevenue")
                ),
                currency=product.get("currency") or "USD",
                raw_payload=product,
                synced_at=synced_at,
                updated_at=synced_at,
            )
        )
        count += 1
    await session.commit()
    return AmazonSyncResult(product_sales_synced=count, synced_at=synced_at)


async def sync_finances(session: AsyncSession, *, days: int = 30) -> AmazonSyncResult:
    synced_at = utcnow()
    payload = await _run_sp_api("finances", "--days", str(days))
    period = str(payload.get("period") or f"Last {days} days")
    await session.exec(delete(FinancialEvent))
    count = 0

    for charge in list(payload.get("productCharges") or []):
        sku = charge.get("sku")
        for key, label in [
            ("sales", "Sales"),
            ("fees", "Fees"),
            ("promotions", "Promotions"),
            ("netRevenue", "Net Revenue"),
        ]:
            session.add(
                FinancialEvent(
                    period=period,
                    event_group="product_charge",
                    reference_id=sku,
                    sku=sku,
                    amount=_to_decimal(charge.get(key)),
                    currency="USD",
                    description=label,
                    raw_payload=charge,
                    synced_at=synced_at,
                    updated_at=synced_at,
                )
            )
            count += 1

    for refund in list(payload.get("refundSummary") or []):
        order_id = refund.get("orderId")
        posted_date = _to_datetime(refund.get("postedDate")) if refund.get("postedDate") else None
        for item in list(refund.get("items") or []):
            for adjustment in list(item.get("adjustments") or []):
                session.add(
                    FinancialEvent(
                        period=period,
                        event_group="refund",
                        reference_id=order_id,
                        posted_date=posted_date,
                        sku=item.get("sku"),
                        amount=_to_decimal(adjustment.get("amount")),
                        currency="USD",
                        description=str(adjustment.get("type") or "Adjustment"),
                        raw_payload={
                            "refund": refund,
                            "item": item,
                            "adjustment": adjustment,
                        },
                        synced_at=synced_at,
                        updated_at=synced_at,
                    )
                )
                count += 1

    await session.commit()
    return AmazonSyncResult(financial_events_synced=count, synced_at=synced_at)


async def sync_campaigns_and_budget(
    session: AsyncSession,
    *,
    days: int = 7,
    campaign_type: str = "sp",
) -> AmazonSyncResult:
    synced_at = utcnow()
    campaigns_payload = await _run_ads_api("campaigns", "--type", campaign_type)
    campaigns = list(campaigns_payload.get("campaigns") or [])
    await session.exec(delete(Campaign))
    campaign_count = 0
    for item in campaigns:
        budget = item.get("budget") or {}
        session.add(
            Campaign(
                campaign_id=str(item.get("campaignId") or ""),
                campaign_type=str(campaigns_payload.get("campaignType") or campaign_type),
                name=str(item.get("name") or ""),
                state=item.get("state"),
                targeting_type=item.get("targetingType"),
                budget_amount=_to_decimal(budget.get("budget")),
                budget_type=budget.get("budgetType"),
                start_date=_to_date(item.get("startDate")),
                end_date=_to_date(item.get("endDate")),
                raw_payload=item,
                synced_at=synced_at,
                updated_at=synced_at,
            )
        )
        campaign_count += 1

    metrics_payload = await _run_ads_api("performance", "--days", str(days), "--campaigns")
    metrics = list(metrics_payload.get("records") or metrics_payload.get("campaigns") or [])
    await session.exec(delete(AdMetric))
    metric_count = 0
    period = str(metrics_payload.get("period") or f"Last {days} days")
    for item in metrics:
        session.add(
            AdMetric(
                campaign_id=str(item.get("campaignId") or item.get("campaignName") or ""),
                period=period,
                report_date=_to_date(item.get("date")),
                spend=_to_decimal(item.get("spend")),
                sales=_to_decimal(item.get("sales")),
                impressions=_to_int(item.get("impressions")),
                clicks=_to_int(item.get("clicks")),
                orders=_to_int(item.get("orders")),
                units=_to_int(item.get("units")),
                ctr=_to_decimal(item.get("ctr")),
                cpc=_to_decimal(item.get("cpc")),
                acos=_to_decimal(item.get("acos")),
                roas=_to_decimal(item.get("roas")),
                raw_payload=item,
                synced_at=synced_at,
                updated_at=synced_at,
            )
        )
        metric_count += 1

    await session.commit()
    return AmazonSyncResult(
        campaigns_synced=campaign_count,
        ad_metrics_synced=metric_count,
        synced_at=synced_at,
    )


async def sync_pricing(session: AsyncSession) -> AmazonSyncResult:
    synced_at = utcnow()
    latest_files = sorted(
        [path for path in SP_API_REPORTS.glob("pricing-*.json") if "history" not in path.name],
        reverse=True,
    )
    if not latest_files:
        raise FileNotFoundError("No pricing report found in amazon-sp-api reports directory")
    payload = json.loads(latest_files[0].read_text())
    period = str(payload.get("period") or synced_at.isoformat())
    records: list[dict[str, Any]] = []
    alerts = payload.get("alerts") or {}
    for status in ("priceDrops", "priceIncreases", "stable"):
        for item in list(alerts.get(status) or []):
            records.append({**item, "status": status})

    await session.exec(delete(PricingSnapshot))
    count = 0
    for item in records:
        session.add(
            PricingSnapshot(
                period=period,
                asin=item.get("asin"),
                sku=item.get("sku"),
                status=item.get("status"),
                price=_to_decimal(item.get("price") or item.get("currentPrice")),
                currency=item.get("currency") or "USD",
                change_amount=_to_decimal(item.get("changeAmount")),
                change_percent=_to_decimal(item.get("changePercent")),
                competitor_offers=_to_int(item.get("competitorOffers")),
                buy_box_winner=item.get("buyBoxWinner"),
                raw_payload=item,
                synced_at=synced_at,
                updated_at=synced_at,
            )
        )
        count += 1

    await session.commit()
    return AmazonSyncResult(pricing_snapshots_synced=count, synced_at=synced_at)


async def sync_returns(session: AsyncSession, *, days: int = 30) -> AmazonSyncResult:
    synced_at = utcnow()
    payload = await _run_sp_api("returns", "--days", str(days))
    period = str(payload.get("period") or f"Last {days} days")
    await session.exec(delete(ReturnEvent))
    count = 0
    for reason in list(payload.get("topReasons") or []):
        session.add(
            ReturnEvent(
                period=period,
                reason=reason.get("reason"),
                quantity=_to_int(reason.get("count")),
                status="aggregated",
                raw_payload=reason,
                synced_at=synced_at,
                updated_at=synced_at,
            )
        )
        count += 1
    await session.commit()
    return AmazonSyncResult(return_events_synced=count, synced_at=synced_at)
