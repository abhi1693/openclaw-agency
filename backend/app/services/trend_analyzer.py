"""Trend Analyzer — Phase 2 v2.

Computes 7d / 14d / 30d rolling metrics per keyword from search_term_reports.
Used by the bid optimizer to feed the conversion_trend and cpc_trend signals.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import func, text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class WindowMetrics:
    """Aggregated keyword metrics over a time window."""
    clicks: int = 0
    orders: int = 0
    impressions: int = 0
    spend: float = 0.0
    sales: float = 0.0
    cvr: float | None = None    # orders / clicks
    cpc: float | None = None    # spend / clicks
    acos: float | None = None   # spend / sales


@dataclass
class TrendData:
    """Full trend picture for one keyword."""
    keyword: str
    campaign_id: str | None

    # Rolling windows
    w7: WindowMetrics = field(default_factory=WindowMetrics)
    w14: WindowMetrics = field(default_factory=WindowMetrics)
    w30: WindowMetrics = field(default_factory=WindowMetrics)

    # Derived trend signals (recent vs prior period)
    cvr_trend_7v14: float | None = None   # w7.cvr / (w14-w7).cvr  — positive = improving
    cpc_trend_7v14: float | None = None   # w7.cpc / (w14-w7).cpc  — positive = CPC rising
    revenue_trend_7v14: float | None = None  # w7.sales vs prior-7d


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _window_metrics(rows: list) -> WindowMetrics:
    clicks = int(sum(r.total_clicks or 0 for r in rows))
    orders = int(sum(r.total_orders or 0 for r in rows))
    impressions = int(sum(r.total_impr or 0 for r in rows))
    spend = float(sum(r.total_spend or 0 for r in rows))
    sales = float(sum(r.total_sales or 0 for r in rows))
    return WindowMetrics(
        clicks=clicks,
        orders=orders,
        impressions=impressions,
        spend=spend,
        sales=sales,
        cvr=orders / clicks if clicks > 0 else None,
        cpc=spend / clicks if clicks > 0 else None,
        acos=spend / sales if sales > 0 else None,
    )


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------


async def analyze_trends(
    session: AsyncSession,
    keyword_text: str,
    campaign_id: str | None = None,
    lookback_days: int = 30,
    reference_date: date | None = None,
) -> TrendData:
    """Compute rolling metrics and trend signals for a single keyword.

    Args:
        session: async DB session
        keyword_text: the targeting keyword text (maps to `keyword` column)
        campaign_id: optional campaign filter
        lookback_days: total lookback (default 30 days)
        reference_date: treat this as today (default: today UTC)

    Returns:
        TrendData with populated window metrics and trend signals.
    """
    today = reference_date or date.today()
    cutoff_30 = today - timedelta(days=lookback_days)
    cutoff_14 = today - timedelta(days=14)
    cutoff_7 = today - timedelta(days=7)

    base_stmt = """
        SELECT
            SUM(clicks)      AS total_clicks,
            SUM(orders)      AS total_orders,
            SUM(impressions) AS total_impr,
            SUM(spend)       AS total_spend,
            SUM(sales)       AS total_sales
        FROM search_term_reports
        WHERE keyword = :keyword
          AND report_date >= :start_date
          AND report_date < :end_date
    """
    campaign_filter = " AND campaign_id = :campaign_id" if campaign_id else ""
    stmt_full = base_stmt + campaign_filter

    async def _query(start: date, end: date) -> list:
        params: dict = {"keyword": keyword_text, "start_date": start, "end_date": end}
        if campaign_id:
            params["campaign_id"] = campaign_id
        result = await session.exec(text(stmt_full), params=params)  # type: ignore[arg-type]
        return result.all()

    # 30-day window
    rows_30 = await _query(cutoff_30, today)
    # 14-day window
    rows_14 = await _query(cutoff_14, today)
    # 7-day window (recent)
    rows_7 = await _query(cutoff_7, today)
    # Prior 7-day window (day 14 to day 7 ago)
    rows_prior7 = await _query(cutoff_14, cutoff_7)

    w30 = _window_metrics(rows_30)
    w14 = _window_metrics(rows_14)
    w7 = _window_metrics(rows_7)
    w_prior7 = _window_metrics(rows_prior7)

    td = TrendData(keyword=keyword_text, campaign_id=campaign_id, w7=w7, w14=w14, w30=w30)

    # Trend signals
    if w7.cvr is not None and w_prior7.cvr is not None and w_prior7.cvr > 0:
        td.cvr_trend_7v14 = w7.cvr / w_prior7.cvr
    if w7.cpc is not None and w_prior7.cpc is not None and w_prior7.cpc > 0:
        td.cpc_trend_7v14 = w7.cpc / w_prior7.cpc
    if w_prior7.sales > 0:
        td.revenue_trend_7v14 = (w7.sales - w_prior7.sales) / w_prior7.sales

    return td


async def analyze_trends_bulk(
    session: AsyncSession,
    keywords: list[tuple[str, str | None]],  # list of (keyword_text, campaign_id)
    lookback_days: int = 30,
) -> dict[tuple[str, str | None], TrendData]:
    """Batch version: 4 SQL queries for all keywords instead of N×4 individual queries."""
    if not keywords:
        return {}

    today = date.today()
    cutoff_30 = today - timedelta(days=lookback_days)
    cutoff_14 = today - timedelta(days=14)
    cutoff_7 = today - timedelta(days=7)

    async def _batch_query(start: date, end: date) -> dict[tuple[str, str], WindowMetrics]:
        """One SQL for all keywords in a time window, keyed by (keyword, campaign_name)."""
        result = await session.exec(  # type: ignore[arg-type]
            text("""
                SELECT keyword, campaign_name,
                       SUM(clicks)      AS total_clicks,
                       SUM(orders)      AS total_orders,
                       SUM(impressions) AS total_impr,
                       SUM(spend)       AS total_spend,
                       SUM(sales)       AS total_sales
                FROM search_term_reports
                WHERE keyword IS NOT NULL
                  AND report_date >= :start_date
                  AND report_date < :end_date
                GROUP BY keyword, campaign_name
            """),
            params={"start_date": start, "end_date": end},
        )
        metrics: dict[tuple[str, str], WindowMetrics] = {}
        for row in result.all():
            kw, camp = row[0], row[1] or ""
            clicks = int(row[2] or 0)
            orders = int(row[3] or 0)
            impr = int(row[4] or 0)
            spend = float(row[5] or 0)
            sales = float(row[6] or 0)
            metrics[(kw, camp)] = WindowMetrics(
                clicks=clicks,
                orders=orders,
                impressions=impr,
                spend=spend,
                sales=sales,
                cvr=orders / clicks if clicks > 0 else None,
                cpc=spend / clicks if clicks > 0 else None,
                acos=spend / sales if sales > 0 else None,
            )
        return metrics

    # 4 batch queries instead of N×4 individual queries
    m30 = await _batch_query(cutoff_30, today)
    m14 = await _batch_query(cutoff_14, today)
    m7 = await _batch_query(cutoff_7, today)
    m_prior7 = await _batch_query(cutoff_14, cutoff_7)

    out: dict[tuple[str, str | None], TrendData] = {}
    for kw_text, camp_id in keywords:
        key = (kw_text, camp_id or "")
        w30 = m30.get(key, WindowMetrics())
        w14 = m14.get(key, WindowMetrics())
        w7 = m7.get(key, WindowMetrics())
        w_prior7 = m_prior7.get(key, WindowMetrics())

        td = TrendData(keyword=kw_text, campaign_id=camp_id, w7=w7, w14=w14, w30=w30)
        if w7.cvr is not None and w_prior7.cvr is not None and w_prior7.cvr > 0:
            td.cvr_trend_7v14 = w7.cvr / w_prior7.cvr
        if w7.cpc is not None and w_prior7.cpc is not None and w_prior7.cpc > 0:
            td.cpc_trend_7v14 = w7.cpc / w_prior7.cpc
        if w_prior7.sales > 0:
            td.revenue_trend_7v14 = (w7.sales - w_prior7.sales) / w_prior7.sales
        out[(kw_text, camp_id)] = td

    return out
