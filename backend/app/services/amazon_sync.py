"""Amazon SP-API and ads sync helpers for orders, inventory, and phase 3 domains."""

from __future__ import annotations

import asyncio
import json
import shlex
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable, Sequence

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.amazon_orders import (
    AdMetric,
    AmazonOrder,
    AmazonOrderItem,
    Campaign,
    DailySales,
    FinancialEvent,
    InventorySnapshot,
    PpcAnalysisSnapshot,
    PricingSnapshot,
    ProductSales,
    ReturnEvent,
    SearchTermReport,
)

SP_API_SCRIPT = Path.home() / ".openclaw" / "skills" / "amazon-sp-api" / "index.js"
ADS_API_SCRIPT = Path.home() / ".openclaw" / "skills" / "amazon-advertising" / "index.js"
PRICING_BATCH_SIZE = 20
logger = get_logger(__name__)


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
    return await _run_json_script(ADS_API_SCRIPT, *args)


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


def _chunked(values: Sequence[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield list(values[index : index + size])


async def _get_existing_by_identity(
    session: AsyncSession, model: type[Any], identity_key: str
) -> Any | None:
    rows = await session.exec(select(model).where(col(model.identity_key) == identity_key))
    return rows.one_or_none()


def _pricing_status(item: dict[str, Any]) -> str | None:
    status = item.get("status")
    if status:
        return str(status)
    if item.get("competitivePrices"):
        return "competitive"
    return None


def _extract_competitor_offers(item: dict[str, Any]) -> int:
    offers = item.get("numberOfOffers") or []
    if isinstance(offers, int):
        return offers
    if not isinstance(offers, list):
        return 0
    total = 0
    for offer in offers:
        if isinstance(offer, dict):
            total += _to_int(offer.get("count") or offer.get("Count") or offer.get("quantity"))
        else:
            total += _to_int(offer)
    return total


def _extract_price(item: dict[str, Any]) -> tuple[Decimal | None, str | None]:
    for candidate in item.get("competitivePrices") or []:
        if not isinstance(candidate, dict):
            continue
        price = candidate.get("Price") or candidate.get("price") or {}
        landed = price.get("LandedPrice") or price.get("landedPrice") or {}
        listing = price.get("ListingPrice") or price.get("listingPrice") or {}
        shipping = price.get("Shipping") or price.get("shipping") or {}
        for node in (landed, listing, shipping, price):
            amount = _to_decimal(node)
            currency = node.get("CurrencyCode") or node.get("currencyCode") if isinstance(node, dict) else None
            if amount is not None:
                return amount, currency
    return None, None


def _identity_for_product_sales(period: str, product: dict[str, Any]) -> str:
    sku = str(product.get("sku") or "").strip()
    asin = str(product.get("asin") or "").strip()
    title = str(product.get("title") or product.get("productName") or product.get("name") or "").strip()
    return f"{period}|{sku or '-'}|{asin or '-'}|{title or '-'}"


def _identity_for_financial_event(
    period: str,
    event_group: str,
    reference_id: str | None,
    sku: str | None,
    description: str | None,
    posted_date: datetime | None,
    amount: Decimal | None,
) -> str:
    return "|".join(
        [
            period,
            event_group,
            reference_id or "-",
            sku or "-",
            description or "-",
            posted_date.isoformat() if posted_date else "-",
            str(amount) if amount is not None else "-",
        ]
    )


def _identity_for_ad_metric(period: str, item: dict[str, Any]) -> str:
    campaign_id = str(item.get("campaignId") or item.get("campaignName") or "").strip()
    report_date = str(item.get("date") or "").strip()
    return f"{period}|{campaign_id}|{report_date or '-'}"


def _identity_for_pricing(period: str, sku: str | None, asin: str | None) -> str:
    return f"{period}|{(sku or '-').strip()}|{(asin or '-').strip()}"


def _identity_for_return(item: dict[str, Any], period: str) -> str:
    return "|".join(
        [
            period,
            str(item.get("orderId") or "-").strip(),
            str(item.get("sku") or "-").strip(),
            str(item.get("asin") or "-").strip(),
            str(item.get("returnDate") or "-").strip(),
            str(item.get("reason") or "-").strip(),
            str(item.get("status") or "-").strip(),
        ]
    )


async def _collect_pricing_targets(session: AsyncSession) -> list[tuple[str, str | None]]:
    targets: list[tuple[str, str | None]] = []
    seen: set[str] = set()

    inventory_rows = list(await session.exec(select(InventorySnapshot).order_by(col(InventorySnapshot.updated_at).desc())))
    for row in inventory_rows:
        sku = (row.sku or "").strip()
        if sku and sku not in seen:
            targets.append((sku, row.asin))
            seen.add(sku)

    order_items = list(await session.exec(select(AmazonOrderItem).order_by(col(AmazonOrderItem.updated_at).desc())))
    for row in order_items:
        sku = (row.sku or "").strip()
        if sku and sku not in seen:
            targets.append((sku, row.asin))
            seen.add(sku)

    return targets


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

        item_payload = await _run_sp_api("order-items", "--order-id", amazon_order_id)
        for item in list(item_payload.get("items") or []):
            existing_item_rows = await session.exec(
                select(AmazonOrderItem).where(
                    col(AmazonOrderItem.order_id) == order.id,
                    col(AmazonOrderItem.sku) == (item.get("sku") if item.get("sku") is not None else None),
                    col(AmazonOrderItem.asin) == (item.get("asin") if item.get("asin") is not None else None),
                    col(AmazonOrderItem.title) == (item.get("title") if item.get("title") is not None else None),
                )
            )
            order_item = existing_item_rows.one_or_none()
            if order_item is None:
                order_item = AmazonOrderItem(order_id=order.id)
                session.add(order_item)
            order_item.asin = item.get("asin")
            order_item.sku = item.get("sku")
            order_item.title = item.get("title")
            order_item.quantity_ordered = _to_int(item.get("quantityOrdered"))
            order_item.quantity_shipped = _to_int(item.get("quantityShipped"))
            order_item.item_price = _to_decimal(item.get("itemPrice"))
            order_item.item_tax = _to_decimal(item.get("itemTax"))
            order_item.promo_discount = _to_decimal(item.get("promoDiscount"))
            order_item.currency = item.get("currency")
            order_item.raw_payload = item
            order_item.synced_at = synced_at
            order_item.updated_at = synced_at
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
    count = 0
    for metric in metrics:
        interval = str(metric.get("interval") or "")
        if not interval:
            continue
        sales_date = _to_date(interval.split("--")[0])
        if sales_date is None:
            continue
        existing = await session.exec(select(DailySales).where(col(DailySales.interval) == interval))
        row = existing.one_or_none()
        if row is None:
            row = DailySales(sales_date=sales_date, interval=interval)
            session.add(row)
        total_sales = metric.get("totalSales") or {}
        average_unit_price = metric.get("averageUnitPrice") or {}
        row.sales_date = sales_date
        row.interval = interval
        row.order_count = _to_int(metric.get("orderCount"))
        row.order_item_count = _to_int(metric.get("orderItemCount"))
        row.unit_count = _to_int(metric.get("unitCount"))
        row.average_unit_price = _to_decimal(average_unit_price)
        row.total_sales = _to_decimal(total_sales)
        row.currency = total_sales.get("currencyCode") if isinstance(total_sales, dict) else None
        row.raw_payload = metric
        row.synced_at = synced_at
        row.updated_at = synced_at
        count += 1
    await session.commit()
    return AmazonSyncResult(daily_sales_synced=count, synced_at=synced_at)


async def sync_top_products(session: AsyncSession, *, days: int = 14) -> AmazonSyncResult:
    synced_at = utcnow()
    payload = await _run_sp_api("top-products", "--days", str(days))
    products = list(payload.get("products") or [])
    period = str(payload.get("period") or f"Last {days} days")
    count = 0
    for product in products:
        identity_key = _identity_for_product_sales(period, product)
        row = await _get_existing_by_identity(session, ProductSales, identity_key)
        if row is None:
            row = ProductSales(identity_key=identity_key, period=period)
            session.add(row)
        row.identity_key = identity_key
        row.period = period
        row.sku = product.get("sku")
        row.asin = product.get("asin")
        row.title = product.get("title") or product.get("productName") or product.get("name")
        row.quantity_sold = _to_int(
            product.get("quantitySold") or product.get("quantity") or product.get("unitsSold")
        )
        row.order_count = _to_int(product.get("orderCount"))
        row.revenue = _to_decimal(product.get("revenue") or product.get("sales") or product.get("totalRevenue"))
        row.currency = product.get("currency") or "USD"
        row.raw_payload = product
        row.synced_at = synced_at
        row.updated_at = synced_at
        count += 1
    await session.commit()
    return AmazonSyncResult(product_sales_synced=count, synced_at=synced_at)


async def sync_finances(session: AsyncSession, *, days: int = 30) -> AmazonSyncResult:
    synced_at = utcnow()
    payload = await _run_sp_api("finances", "--days", str(days))
    period = str(payload.get("period") or f"Last {days} days")
    count = 0

    for charge in list(payload.get("productCharges") or []):
        sku = charge.get("sku")
        for key, label in [
            ("sales", "Sales"),
            ("fees", "Fees"),
            ("promotions", "Promotions"),
            ("netRevenue", "Net Revenue"),
        ]:
            amount = _to_decimal(charge.get(key))
            identity_key = _identity_for_financial_event(period, "product_charge", sku, sku, label, None, amount)
            row = await _get_existing_by_identity(session, FinancialEvent, identity_key)
            if row is None:
                row = FinancialEvent(identity_key=identity_key, period=period, event_group="product_charge")
                session.add(row)
            row.identity_key = identity_key
            row.period = period
            row.event_group = "product_charge"
            row.reference_id = sku
            row.sku = sku
            row.amount = amount
            row.currency = "USD"
            row.description = label
            row.raw_payload = charge
            row.synced_at = synced_at
            row.updated_at = synced_at
            count += 1

    for refund in list(payload.get("refundSummary") or []):
        order_id = refund.get("orderId")
        posted_date = _to_datetime(refund.get("postedDate")) if refund.get("postedDate") else None
        for item in list(refund.get("items") or []):
            for adjustment in list(item.get("adjustments") or []):
                amount = _to_decimal(adjustment.get("amount"))
                description = str(adjustment.get("type") or "Adjustment")
                identity_key = _identity_for_financial_event(
                    period,
                    "refund",
                    order_id,
                    item.get("sku"),
                    description,
                    posted_date,
                    amount,
                )
                row = await _get_existing_by_identity(session, FinancialEvent, identity_key)
                if row is None:
                    row = FinancialEvent(identity_key=identity_key, period=period, event_group="refund")
                    session.add(row)
                row.identity_key = identity_key
                row.period = period
                row.event_group = "refund"
                row.reference_id = order_id
                row.posted_date = posted_date
                row.sku = item.get("sku")
                row.amount = amount
                row.currency = "USD"
                row.description = description
                row.raw_payload = {
                    "refund": refund,
                    "item": item,
                    "adjustment": adjustment,
                }
                row.synced_at = synced_at
                row.updated_at = synced_at
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
    campaign_count = 0
    for item in campaigns:
        campaign_id = str(item.get("campaignId") or "").strip()
        if not campaign_id:
            continue
        existing = await session.exec(select(Campaign).where(col(Campaign.campaign_id) == campaign_id))
        row = existing.one_or_none()
        if row is None:
            row = Campaign(campaign_id=campaign_id, campaign_type=str(campaigns_payload.get("campaignType") or campaign_type), name=str(item.get("name") or ""))
            session.add(row)
        budget = item.get("budget") or {}
        row.campaign_id = campaign_id
        row.campaign_type = str(campaigns_payload.get("campaignType") or campaign_type)
        row.name = str(item.get("name") or row.name or "")
        row.state = item.get("state")
        row.targeting_type = item.get("targetingType")
        row.budget_amount = _to_decimal(budget.get("budget"))
        row.budget_type = budget.get("budgetType")
        row.start_date = _to_date(item.get("startDate"))
        row.end_date = _to_date(item.get("endDate"))
        row.raw_payload = item
        row.synced_at = synced_at
        row.updated_at = synced_at
        campaign_count += 1

    metric_count = 0
    period = f"Last {days} days"
    try:
        metrics_payload = await _run_ads_api("performance", "--days", str(days), "--campaigns")
        metrics = list(metrics_payload.get("records") or metrics_payload.get("campaigns") or [])
        period = str(metrics_payload.get("period") or period)
    except RuntimeError as exc:
        logger.warning("Ad performance fetch failed (skipping metrics): %s", exc)
        metrics = []
    for item in metrics:
        identity_key = _identity_for_ad_metric(period, item)
        row = await _get_existing_by_identity(session, AdMetric, identity_key)
        if row is None:
            row = AdMetric(identity_key=identity_key, campaign_id=str(item.get("campaignId") or item.get("campaignName") or ""), period=period)
            session.add(row)
        row.identity_key = identity_key
        row.campaign_id = str(item.get("campaignId") or item.get("campaignName") or "")
        row.period = period
        row.report_date = _to_date(item.get("date"))
        row.spend = _to_decimal(item.get("spend"))
        row.sales = _to_decimal(item.get("sales"))
        row.impressions = _to_int(item.get("impressions"))
        row.clicks = _to_int(item.get("clicks"))
        row.orders = _to_int(item.get("orders"))
        row.units = _to_int(item.get("units"))
        row.ctr = _to_decimal(item.get("ctr"))
        row.cpc = _to_decimal(item.get("cpc"))
        row.acos = _to_decimal(item.get("acos"))
        row.roas = _to_decimal(item.get("roas"))
        row.raw_payload = item
        row.synced_at = synced_at
        row.updated_at = synced_at
        metric_count += 1

    await session.commit()
    return AmazonSyncResult(
        campaigns_synced=campaign_count,
        ad_metrics_synced=metric_count,
        synced_at=synced_at,
    )


async def sync_pricing(session: AsyncSession) -> AmazonSyncResult:
    synced_at = utcnow()
    targets = await _collect_pricing_targets(session)
    if not targets:
        await session.commit()
        return AmazonSyncResult(pricing_snapshots_synced=0, synced_at=synced_at)

    records: list[tuple[str, str | None, dict[str, Any]]] = []
    for batch in _chunked([sku for sku, _asin in targets], PRICING_BATCH_SIZE):
        payload = await _run_sp_api("pricing", "--skus", ",".join(batch))
        pricing_rows = list(payload.get("pricing") or [])
        for index, sku in enumerate(batch):
            row = pricing_rows[index] if index < len(pricing_rows) and isinstance(pricing_rows[index], dict) else {}
            asin = next((target_asin for target_sku, target_asin in targets if target_sku == sku), None)
            records.append((sku, asin or row.get("asin"), row))

    period = synced_at.isoformat()
    count = 0
    for sku, asin, item in records:
        identity_key = _identity_for_pricing(period, sku, asin)
        row = await _get_existing_by_identity(session, PricingSnapshot, identity_key)
        if row is None:
            row = PricingSnapshot(identity_key=identity_key, period=period)
            session.add(row)
        price, currency = _extract_price(item)
        row.identity_key = identity_key
        row.period = period
        row.asin = asin
        row.sku = sku
        row.status = _pricing_status(item)
        row.price = price
        row.currency = currency or item.get("currency") or "USD"
        row.change_amount = _to_decimal(item.get("changeAmount"))
        row.change_percent = _to_decimal(item.get("changePercent"))
        row.competitor_offers = _extract_competitor_offers(item)
        row.buy_box_winner = item.get("buyBoxWinner")
        row.raw_payload = item
        row.synced_at = synced_at
        row.updated_at = synced_at
        count += 1

    await session.commit()
    return AmazonSyncResult(pricing_snapshots_synced=count, synced_at=synced_at)


async def sync_returns(session: AsyncSession, *, days: int = 30) -> AmazonSyncResult:
    synced_at = utcnow()
    payload = await _run_sp_api("returns", "--days", str(days))
    period = str(payload.get("period") or f"Last {days} days")
    detailed_returns = list(payload.get("returns") or [])
    if detailed_returns:
        count = 0
        for item in detailed_returns:
            identity_key = _identity_for_return(item, period)
            row = await _get_existing_by_identity(session, ReturnEvent, identity_key)
            if row is None:
                row = ReturnEvent(identity_key=identity_key, period=period)
                session.add(row)
            row.identity_key = identity_key
            row.period = period
            row.order_id = item.get("orderId")
            row.sku = item.get("sku")
            row.reason = item.get("reason")
            row.quantity = _to_int(item.get("quantity") or 1)
            row.status = item.get("status")
            row.event_date = _to_datetime(item.get("returnDate")) if item.get("returnDate") else None
            row.raw_payload = item
            row.synced_at = synced_at
            row.updated_at = synced_at
            count += 1
        await session.commit()
        return AmazonSyncResult(return_events_synced=count, synced_at=synced_at)

    count = 0
    for reason in list(payload.get("topReasons") or []):
        item = {
            "reason": reason.get("reason"),
            "status": "aggregated",
            "quantity": reason.get("count"),
        }
        identity_key = _identity_for_return(item, period)
        row = await _get_existing_by_identity(session, ReturnEvent, identity_key)
        if row is None:
            row = ReturnEvent(identity_key=identity_key, period=period)
            session.add(row)
        row.identity_key = identity_key
        row.period = period
        row.reason = reason.get("reason")
        row.quantity = _to_int(reason.get("count"))
        row.status = "aggregated"
        row.raw_payload = reason
        row.synced_at = synced_at
        row.updated_at = synced_at
        count += 1
    await session.commit()
    return AmazonSyncResult(return_events_synced=count, synced_at=synced_at)


async def sync_search_terms(session: AsyncSession) -> tuple[int, datetime]:
    """Sync search terms from Amazon Advertising API into DB.

    Returns (count_synced, synced_at).
    """
    GUARD = Path.home() / ".openclaw" / "skills" / "amazon-advertising" / "guard.js"

    proc = await asyncio.create_subprocess_exec(
        "node", str(GUARD), "search-terms", "--days", "30",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"search-terms script failed: {stderr.decode().strip()}")

    raw = _clean_json_stdout(stdout.decode())
    data = json.loads(raw)
    rows = data.get("rows", [])
    start_date = data.get("startDate", "")
    end_date = data.get("endDate", "")
    period = f"{start_date}_{end_date}"
    now = utcnow()
    synced = 0

    for row in rows:
        search_term = row.get("searchTerm") or ""
        if not search_term:
            continue

        campaign_name = row.get("campaignName") or None
        campaign_id_val = row.get("campaignId") or None
        ad_group_id_val = row.get("adGroupId") or None
        match_type = row.get("matchType") or None
        spend_val = _to_decimal(row.get("cost"))
        sales_val = _to_decimal(row.get("sales7d"))
        clicks_val = _to_int(row.get("clicks"))
        impressions_val = _to_int(row.get("impressions"))
        orders_val = _to_int(row.get("purchases7d"))
        units_val = _to_int(row.get("unitsSoldClicks7d"))
        cpc_val = _to_decimal(row.get("costPerClick"))
        acos_val = _to_decimal(row.get("acosClicks7d"))

        roas_val: Decimal | None = None
        if spend_val and spend_val > 0 and sales_val:
            try:
                roas_val = Decimal(str(float(sales_val) / float(spend_val)))
            except Exception:
                pass

        ctr_val: Decimal | None = None
        if impressions_val > 0:
            try:
                ctr_val = Decimal(str(clicks_val / impressions_val))
            except Exception:
                pass

        report_date_val: date | None = None
        if end_date:
            try:
                report_date_val = date.fromisoformat(end_date)
            except ValueError:
                pass

        existing = await session.exec(
            select(SearchTermReport).where(
                SearchTermReport.period == period,
                SearchTermReport.search_term == search_term,
                SearchTermReport.campaign_name == campaign_name,
                SearchTermReport.match_type == match_type,
                SearchTermReport.report_date == report_date_val,
            )
        )
        record = existing.first()
        if record is None:
            record = SearchTermReport(
                search_term=search_term,
                campaign_id=campaign_id_val,
                campaign_name=campaign_name,
                ad_group_id=ad_group_id_val,
                ad_group_name=row.get("adGroupName") or None,
                keyword=row.get("targeting") or None,
                match_type=match_type,
                impressions=impressions_val,
                clicks=clicks_val,
                spend=spend_val,
                sales=sales_val,
                orders=orders_val,
                units=units_val,
                acos=acos_val,
                roas=roas_val,
                ctr=ctr_val,
                cpc=cpc_val,
                report_date=report_date_val,
                period=period,
                raw_payload=dict(row),
                synced_at=now,
            )
            session.add(record)
        else:
            if campaign_id_val and not record.campaign_id:
                record.campaign_id = campaign_id_val
            if ad_group_id_val and not record.ad_group_id:
                record.ad_group_id = ad_group_id_val
            record.impressions = impressions_val
            record.clicks = clicks_val
            record.spend = spend_val
            record.sales = sales_val
            record.orders = orders_val
            record.units = units_val
            record.acos = acos_val
            record.roas = roas_val
            record.ctr = ctr_val
            record.cpc = cpc_val
            record.raw_payload = dict(row)
            record.synced_at = now
            record.updated_at = now

        synced += 1
        if synced % 500 == 0:
            await session.commit()

    await session.commit()
    return synced, now


async def sync_ppc_analyses(session: AsyncSession) -> tuple[int, datetime]:
    """Sync PPC analysis result files from ads skill cache into DB.

    Returns (count_synced, synced_at).
    """
    import re as _re

    CACHE_DIR = Path.home() / ".openclaw" / "skills" / "amazon-advertising" / "cache"

    PATTERNS: list[tuple[str, str]] = [
        ("keyword", "keyword-analysis-*.json"),
        ("bid", "bid-analysis-*.json"),
        ("campaign", "campaign-analysis-*.json"),
        ("weekly", "weekly-report-*.json"),
        ("ai-insights", "ai-insights-result-*.json"),
    ]

    now = utcnow()
    synced = 0

    for analysis_type, pattern in PATTERNS:
        files = sorted(CACHE_DIR.glob(pattern))
        for fpath in files:
            try:
                content: Any = json.loads(fpath.read_text(encoding="utf-8"))
            except Exception:
                continue

            stem = fpath.stem
            date_match = _re.search(r"(\d{4}-\d{2}-\d{2})", stem)
            if not date_match:
                continue
            report_date_str = date_match.group(1)
            try:
                report_date_val = date.fromisoformat(report_date_str)
            except ValueError:
                continue

            all_dates = _re.findall(r"\d{4}-\d{2}-\d{2}", stem)
            period_val = (
                f"{all_dates[0]}_{all_dates[-1]}" if len(all_dates) >= 2 else report_date_str
            )

            summary_val = f"{analysis_type} {report_date_str}"
            if isinstance(content, dict):
                for key in ("summary", "title", "period", "reportDate"):
                    if key in content and isinstance(content[key], str):
                        summary_val = str(content[key])[:200]
                        break

            existing = await session.exec(
                select(PpcAnalysisSnapshot).where(
                    PpcAnalysisSnapshot.analysis_type == analysis_type,
                    PpcAnalysisSnapshot.report_date == report_date_val,
                )
            )
            record = existing.first()
            data_val: dict[str, Any] = (
                content if isinstance(content, dict) else {"rows": content}
            )
            if record is None:
                record = PpcAnalysisSnapshot(
                    analysis_type=analysis_type,
                    report_date=report_date_val,
                    period=period_val,
                    data=data_val,
                    summary=summary_val,
                    raw_payload=data_val,
                    synced_at=now,
                )
                session.add(record)
            else:
                record.data = data_val
                record.summary = summary_val
                record.period = period_val
                record.raw_payload = data_val
                record.synced_at = now
                record.updated_at = now

            synced += 1

    await session.commit()
    return synced, now


async def sync_reimbursements(session: AsyncSession, *, days: int = 180) -> AmazonSyncResult:
    """Sync reimbursement data from SP-API into ReimbursementEvent table."""
    from app.models.amazon_orders import ReimbursementEvent

    synced_at = utcnow()
    payload = await _run_sp_api("reimbursements", "--days", str(days))
    reimbursements = list(payload.get("reimbursements") or [])
    count = 0

    for item in reimbursements:
        reimb_id = str(item.get("reimbursementId") or "").strip()
        if not reimb_id:
            continue
        existing = await session.exec(
            select(ReimbursementEvent).where(
                col(ReimbursementEvent.reimbursement_id) == reimb_id
            )
        )
        row = existing.one_or_none()
        if row is None:
            row = ReimbursementEvent(
                reimbursement_id=reimb_id,
                order_id=str(item.get("orderId") or ""),
            )
            session.add(row)

        row.reimbursement_id = reimb_id
        row.order_id = str(item.get("orderId") or "")
        row.sku = str(item.get("sku") or "")
        row.asin = str(item.get("asin") or "")
        row.fnsku = str(item.get("fnSku") or item.get("fnsku") or "")
        row.reason = str(item.get("reason") or "")
        row.amount_total = _to_decimal(item.get("amountTotal") or item.get("amount")) or Decimal(0)
        row.amount_cash = _to_decimal(item.get("amountCash") or item.get("cashAmount")) or Decimal(0)
        row.amount_inventory = _to_int(item.get("amountInventory") or item.get("inventoryAmount"))
        reimb_date = item.get("reimbursementDate") or item.get("date")
        row.reimbursement_date = _to_datetime(reimb_date) if reimb_date else None
        row.synced_at = synced_at
        row.updated_at = synced_at
        count += 1

    await session.commit()
    return AmazonSyncResult(synced_at=synced_at, return_events_synced=count)


async def sync_ledger(session: AsyncSession, *, days: int = 90) -> AmazonSyncResult:
    """Sync Inventory Ledger data from SP-API into InventoryLedgerEvent table."""
    from app.models.amazon_orders import InventoryLedgerEvent
    from datetime import date as date_type

    synced_at = utcnow()
    payload = await _run_sp_api("ledger", "--days", str(days))
    events = list(payload.get("ledgerEvents") or [])
    count = 0

    for item in events:
        event_date_str = str(item.get("date") or "").split("T")[0].split(" ")[0]
        if not event_date_str:
            continue
        try:
            event_date_val = date_type.fromisoformat(event_date_str)
        except ValueError:
            continue

        fnsku = str(item.get("fnsku") or "").strip()
        event_type = str(item.get("eventType") or "").strip()
        if not fnsku or not event_type:
            continue

        reference_id = str(item.get("referenceId") or "").strip()
        quantity = int(item.get("quantity") or 0)
        fc = str(item.get("fulfillmentCenter") or "").strip()

        existing = await session.exec(
            select(InventoryLedgerEvent).where(
                InventoryLedgerEvent.event_date == event_date_val,
                col(InventoryLedgerEvent.fnsku) == fnsku,
                col(InventoryLedgerEvent.event_type) == event_type,
                col(InventoryLedgerEvent.reference_id) == reference_id,
                InventoryLedgerEvent.quantity == quantity,
                col(InventoryLedgerEvent.fulfillment_center) == fc,
            )
        )
        row = existing.one_or_none()
        if row is None:
            row = InventoryLedgerEvent(
                event_date=event_date_val,
                fnsku=fnsku,
                event_type=event_type,
                reference_id=reference_id,
                quantity=quantity,
                fulfillment_center=fc,
                synced_at=synced_at,
                created_at=synced_at,
                updated_at=synced_at,
            )
            session.add(row)

        row.asin = str(item.get("asin") or "")
        row.sku = str(item.get("sku") or "")
        row.title = str(item.get("title") or "")[:500]
        row.disposition = str(item.get("disposition") or "")
        row.country = str(item.get("country") or "US")
        row.synced_at = synced_at
        row.updated_at = synced_at
        count += 1

    await session.commit()
    return AmazonSyncResult(synced_at=synced_at, return_events_synced=count)
