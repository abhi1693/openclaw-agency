"""Profit calculation service — reads ProductSales + FinancialEvents + AdMetrics + ProductCost from DB."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.models.amazon_orders import AdMetric, FinancialEvent, ProductCost, ProductSales

logger = get_logger(__name__)


@dataclass
class ProfitItem:
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


@dataclass
class ProfitSummary:
    total_revenue: Decimal
    total_cost: Decimal
    total_profit: Decimal
    profit_margin: Decimal
    total_ad_spend: Decimal
    tacos: Decimal
    organic_ratio: Decimal


@dataclass
class ProfitData:
    summary: ProfitSummary
    items: list[ProfitItem]
    warnings: list[str] = field(default_factory=list)


def _d(v: Any) -> Decimal:
    """Safe Decimal conversion."""
    if v is None:
        return Decimal(0)
    try:
        return Decimal(str(v))
    except Exception:
        return Decimal(0)


async def compute_profit(session: AsyncSession, *, days: int = 30) -> ProfitData:
    """Build profit breakdown from DB data."""
    warnings: list[str] = []

    # Load COGS map: sku → ProductCost
    cogs_rows = list(await session.exec(select(ProductCost)))
    cogs_map: dict[str, ProductCost] = {row.sku: row for row in cogs_rows}

    # Load ProductSales
    product_sales = list(
        await session.exec(
            select(ProductSales)
            .where(col(ProductSales.sku).is_not(None))
            .order_by(col(ProductSales.revenue).desc())
        )
    )

    if not product_sales:
        warnings.append("No product sales data in DB — run /amazon/sync first")

    # Build per-SKU aggregation from ProductSales
    sku_map: dict[str, dict[str, Any]] = {}
    for ps in product_sales:
        sku = (ps.sku or "").strip()
        if not sku:
            continue
        if sku not in sku_map:
            cogs = cogs_map.get(sku)
            sku_map[sku] = {
                "sku": sku,
                "asin": ps.asin or "",
                "product_name": ps.title or (cogs.product_name if cogs else "") or sku,
                "revenue": Decimal(0),
                "units_sold": 0,
                "landed_cost": Decimal(0),
                "fba_fee": Decimal(0),
                "referral_fee": Decimal(0),
                "ad_spend": Decimal(0),
            }
        entry = sku_map[sku]
        entry["revenue"] += _d(ps.revenue)
        entry["units_sold"] += ps.quantity_sold or 0

    # Apply COGS landed cost (per unit × units sold)
    for sku, entry in sku_map.items():
        cogs = cogs_map.get(sku)
        if cogs and cogs.total_landed_cost:
            entry["landed_cost"] = cogs.total_landed_cost * entry["units_sold"]

    # Extract fees from FinancialEvents (product_charge rows)
    fin_rows = list(
        await session.exec(
            select(FinancialEvent)
            .where(col(FinancialEvent.event_group) == "product_charge")
            .where(col(FinancialEvent.sku).is_not(None))
        )
    )

    if not fin_rows:
        warnings.append("No financial events in DB — fees not included")

    for fe in fin_rows:
        sku = (fe.sku or "").strip()
        if not sku or sku not in sku_map:
            continue
        entry = sku_map[sku]
        desc = (fe.description or "").lower()
        amt = abs(_d(fe.amount))
        # Map financial event descriptions to fee buckets
        if "fba" in desc or "fulfillment" in desc:
            entry["fba_fee"] += amt
        elif "referral" in desc or "commission" in desc:
            entry["referral_fee"] += amt
        elif "fees" in desc:
            # Generic "Fees" label — split between fba and referral heuristically
            entry["fba_fee"] += amt

    # Extract ad spend from AdMetrics
    ad_rows = list(
        await session.exec(
            select(AdMetric)
            .where(col(AdMetric.spend).is_not(None))
            .order_by(col(AdMetric.synced_at).desc())
            .limit(500)
        )
    )

    if not ad_rows:
        warnings.append("No ad metrics in DB — ad spend not included")

    # AdMetrics are campaign-level, not SKU-level. Distribute proportionally by revenue.
    total_ad_spend_raw = sum(_d(row.spend) for row in ad_rows)
    total_revenue_for_dist = sum(e["revenue"] for e in sku_map.values())
    if total_ad_spend_raw > 0 and total_revenue_for_dist > 0:
        for entry in sku_map.values():
            rev_share = entry["revenue"] / total_revenue_for_dist if total_revenue_for_dist else Decimal(0)
            entry["ad_spend"] = total_ad_spend_raw * rev_share

    # Final profit calculations
    items: list[ProfitItem] = []
    for entry in sku_map.values():
        revenue = entry["revenue"]
        landed_cost = entry["landed_cost"]
        fba_fee = entry["fba_fee"]
        referral_fee = entry["referral_fee"]
        ad_spend = entry["ad_spend"]
        net_profit = revenue - landed_cost - fba_fee - referral_fee - ad_spend
        profit_margin = (net_profit / revenue * 100) if revenue > 0 else Decimal(0)
        items.append(
            ProfitItem(
                sku=entry["sku"],
                asin=entry["asin"],
                product_name=entry["product_name"],
                revenue=revenue,
                units_sold=entry["units_sold"],
                landed_cost=landed_cost,
                fba_fee=fba_fee,
                referral_fee=referral_fee,
                ad_spend=ad_spend,
                net_profit=net_profit,
                profit_margin=profit_margin,
            )
        )

    # Build summary
    total_revenue = sum(i.revenue for i in items)
    total_cost = sum(i.landed_cost + i.fba_fee + i.referral_fee for i in items)
    total_profit = sum(i.net_profit for i in items)
    total_ad_spend = sum(i.ad_spend for i in items)
    profit_margin = (total_profit / total_revenue * 100) if total_revenue > 0 else Decimal(0)
    tacos = (total_ad_spend / total_revenue * 100) if total_revenue > 0 else Decimal(0)
    organic_rev = sum(max(Decimal(0), i.revenue - i.ad_spend) for i in items)
    organic_ratio = (organic_rev / total_revenue * 100) if total_revenue > 0 else Decimal(0)

    summary = ProfitSummary(
        total_revenue=total_revenue,
        total_cost=total_cost,
        total_profit=total_profit,
        profit_margin=profit_margin,
        total_ad_spend=total_ad_spend,
        tacos=tacos,
        organic_ratio=organic_ratio,
    )

    return ProfitData(summary=summary, items=items, warnings=warnings)
