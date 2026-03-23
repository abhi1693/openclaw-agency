"""TACoS Calculator — Phase 6.

TACoS (Total Advertising Cost of Sales) = Total Ad Spend / Total Revenue

Unlike ACoS (which uses only attributed ad sales as denominator), TACoS
uses all revenue — organic + paid — giving a true picture of how much
advertising costs relative to total business revenue.

Data sources
------------
  ad_spend:   SUM(ad_metrics.spend) for the period
  ad_sales:   SUM(ad_metrics.sales) for the period  (attributed)
  total_revenue: SUM(daily_sales.total_sales) for the period

  tacos = ad_spend / total_revenue
  acos  = ad_spend / ad_sales
  organic_revenue = total_revenue - ad_sales
  organic_pct = organic_revenue / total_revenue

Effective ACoS ceiling from TACoS target
-----------------------------------------
Given: TACoS target T, and organic contribution fraction P:
  T = ad_spend / total_revenue
  → ad_spend = T × total_revenue
  ACoS = ad_spend / ad_sales = (T × total_revenue) / ad_sales
  Since ad_sales = (1 - P) × total_revenue:
  → ACoS_ceiling = T / (1 - P)

Example: T=10%, P=60% → ACoS_ceiling = 10% / 40% = 25%
Products with high organic share can tolerate higher ACoS.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger

logger = get_logger(__name__)

_DEFAULT_ORGANIC_PCT = 0.30   # conservative estimate when data missing
_MIN_EFFECTIVE_ACOS = 0.05    # floor on effective ACoS ceiling (5%)
_MAX_EFFECTIVE_ACOS = 0.80    # ceiling on effective ACoS ceiling (80%)


@dataclass
class TACoSMetrics:
    period_days: int
    total_revenue: float
    ad_spend: float
    ad_sales: float
    organic_revenue: float
    tacos: float | None
    acos: float | None
    organic_pct: float
    effective_acos_ceiling: float | None  # when TACoS target is applied
    tacos_target: float | None
    trend_7d: float | None           # TACoS 7d ago
    trend_note: str


async def calculate_tacos(
    session: AsyncSession,
    days: int = 30,
    target_tacos: float | None = None,
) -> TACoSMetrics:
    """Calculate TACoS metrics and effective ACoS ceiling.

    Args:
        session: async DB session
        days: lookback window in days
        target_tacos: target TACoS fraction (e.g. 0.10 = 10%); if set, compute ACoS ceiling

    Returns:
        TACoSMetrics dataclass with all calculated fields.
    """
    today = date.today()
    cutoff = today - timedelta(days=days)
    cutoff_7d = today - timedelta(days=7)

    # ── Total ad spend + attributed sales ────────────────────────────────
    ad_stmt = text("""
        SELECT
            SUM(spend)  AS total_spend,
            SUM(sales)  AS total_sales,
            SUM(CASE WHEN report_date >= :cutoff_7d THEN spend ELSE 0 END) AS spend_7d,
            SUM(CASE WHEN report_date >= :cutoff_7d THEN sales ELSE 0 END) AS sales_7d
        FROM ad_metrics
        WHERE report_date >= :cutoff
    """)
    ad_row = (
        await session.exec(ad_stmt, params={"cutoff": cutoff, "cutoff_7d": cutoff_7d})
    ).first()  # type: ignore[arg-type]

    ad_spend = float(getattr(ad_row, "total_spend", 0) or 0)
    ad_sales = float(getattr(ad_row, "total_sales", 0) or 0)
    spend_7d = float(getattr(ad_row, "spend_7d", 0) or 0)
    sales_7d = float(getattr(ad_row, "sales_7d", 0) or 0)

    # ── Total revenue from daily_sales ────────────────────────────────────
    rev_stmt = text("""
        SELECT
            SUM(total_sales)  AS total_revenue,
            SUM(CASE WHEN sales_date >= :cutoff_7d THEN total_sales ELSE 0 END) AS revenue_7d
        FROM daily_sales
        WHERE sales_date >= :cutoff
          AND total_sales IS NOT NULL
    """)
    rev_row = (
        await session.exec(rev_stmt, params={"cutoff": cutoff, "cutoff_7d": cutoff_7d})
    ).first()  # type: ignore[arg-type]

    total_revenue = float(getattr(rev_row, "total_revenue", 0) or 0)
    revenue_7d = float(getattr(rev_row, "revenue_7d", 0) or 0)

    # ── Compute metrics ───────────────────────────────────────────────────
    organic_revenue = max(total_revenue - ad_sales, 0.0)
    organic_pct = organic_revenue / total_revenue if total_revenue > 0 else _DEFAULT_ORGANIC_PCT

    tacos: float | None = None
    if total_revenue > 0:
        tacos = round(ad_spend / total_revenue, 6)

    acos: float | None = None
    if ad_sales > 0:
        acos = round(ad_spend / ad_sales, 6)

    # 7d trend
    tacos_7d: float | None = None
    if revenue_7d > 0 and spend_7d > 0:
        tacos_7d = round(spend_7d / revenue_7d, 6)

    trend_note = "insufficient_data"
    if tacos is not None and tacos_7d is not None:
        delta = tacos_7d - tacos
        if abs(delta) < 0.005:
            trend_note = "stable"
        elif delta > 0:
            trend_note = "worsening (TACoS increasing)"
        else:
            trend_note = "improving (TACoS decreasing)"

    # ── Effective ACoS ceiling from TACoS target ──────────────────────────
    effective_ceiling: float | None = None
    if target_tacos and target_tacos > 0:
        non_organic_pct = 1.0 - organic_pct
        if non_organic_pct > 0.05:  # at least 5% ad-attributed revenue
            raw_ceiling = target_tacos / non_organic_pct
            effective_ceiling = round(
                max(_MIN_EFFECTIVE_ACOS, min(raw_ceiling, _MAX_EFFECTIVE_ACOS)),
                4,
            )
        else:
            # Nearly all organic — conservative ceiling
            effective_ceiling = round(_MIN_EFFECTIVE_ACOS, 4)

    logger.info(
        "tacos_calculator: tacos=%.4f acos=%.4f organic_pct=%.2f effective_ceiling=%s",
        tacos or 0, acos or 0, organic_pct,
        f"{(effective_ceiling or 0):.2%}" if effective_ceiling else "n/a",
    )

    return TACoSMetrics(
        period_days=days,
        total_revenue=round(total_revenue, 2),
        ad_spend=round(ad_spend, 2),
        ad_sales=round(ad_sales, 2),
        organic_revenue=round(organic_revenue, 2),
        tacos=tacos,
        acos=acos,
        organic_pct=round(organic_pct, 4),
        effective_acos_ceiling=effective_ceiling,
        tacos_target=target_tacos,
        trend_7d=tacos_7d,
        trend_note=trend_note,
    )


def metrics_to_dict(m: TACoSMetrics) -> dict[str, Any]:
    return {
        "period_days": m.period_days,
        "total_revenue": m.total_revenue,
        "ad_spend": m.ad_spend,
        "ad_sales": m.ad_sales,
        "organic_revenue": m.organic_revenue,
        "tacos": m.tacos,
        "acos": m.acos,
        "organic_pct": m.organic_pct,
        "effective_acos_ceiling": m.effective_acos_ceiling,
        "tacos_target": m.tacos_target,
        "trend_7d": m.trend_7d,
        "trend_note": m.trend_note,
    }
