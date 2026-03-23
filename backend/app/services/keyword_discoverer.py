"""Keyword Discovery Service — Phase 2.

Analyzes search term reports to surface:
  - Add as keyword: search terms from auto campaigns with orders > 0 OR CTR
    above category average
  - Add as negative: search terms with clicks > 10 and zero orders (waste)

Inserts KeywordRecommendation rows and returns a summary list.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import func, text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.amazon_orders import SearchTermReport
from app.models.ppc_automation import KeywordRecommendation

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Minimum clicks before flagging a zero-order term as negative candidate
_NEGATIVE_MIN_CLICKS = 10
# How many rows to analyze per run
_MAX_ROWS = 1000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_category_avg_ctr(session: AsyncSession) -> Decimal:
    result = await session.exec(
        select(
            func.sum(SearchTermReport.clicks).label("total_clicks"),
            func.sum(SearchTermReport.impressions).label("total_impressions"),
        )
    )
    row = result.first()
    if row and row.total_impressions and row.total_impressions > 0:
        return Decimal(str(round(row.total_clicks / row.total_impressions, 6)))
    return Decimal("0.003")  # 0.3% default


async def _already_pending(session: AsyncSession, search_term: str, action: str) -> bool:
    result = await session.exec(
        select(KeywordRecommendation)
        .where(KeywordRecommendation.search_term == search_term)
        .where(KeywordRecommendation.action == action)
        .where(KeywordRecommendation.status == "pending")
    )
    return result.first() is not None


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------


async def generate_keyword_recommendations(
    session: AsyncSession,
) -> list[dict[str, Any]]:
    """Analyze search term reports and generate keyword recommendations.

    Returns summary list of created recommendations.
    """
    category_avg_ctr = await _get_category_avg_ctr(session)
    logger.info("keyword_discoverer: category_avg_ctr=%.6f", float(category_avg_ctr))

    # Aggregate search terms across all periods
    stmt = text("""
        SELECT
            search_term,
            campaign_id,
            campaign_name,
            ad_group_id,
            match_type,
            SUM(impressions)  AS total_impressions,
            SUM(clicks)       AS total_clicks,
            SUM(orders)       AS total_orders,
            SUM(spend)        AS total_spend,
            SUM(sales)        AS total_sales
        FROM search_term_reports
        WHERE search_term IS NOT NULL
          AND search_term != ''
        GROUP BY search_term, campaign_id, campaign_name, ad_group_id, match_type
        ORDER BY SUM(clicks) DESC
        LIMIT :max_rows
    """)
    rows = (await session.exec(stmt, params={"max_rows": _MAX_ROWS})).all()  # type: ignore[arg-type]

    created: list[dict[str, Any]] = []

    for row in rows:
        search_term = row.search_term
        campaign_id = row.campaign_id or ""
        campaign_name = row.campaign_name or ""
        ad_group_id = row.ad_group_id
        match_type = row.match_type or "broad"
        impressions = int(row.total_impressions or 0)
        clicks = int(row.total_clicks or 0)
        orders = int(row.total_orders or 0)
        spend = Decimal(str(row.total_spend or 0))
        sales = Decimal(str(row.total_sales or 0))

        ctr = Decimal(str(round(clicks / impressions, 6))) if impressions > 0 else Decimal("0")
        conv_rate = Decimal(str(round(orders / clicks, 6))) if clicks > 0 else Decimal("0")
        acos = (spend / sales).quantize(Decimal("0.0001")) if sales > 0 else None

        # ── Candidate: add_keyword ──────────────────────────────────────────
        # From auto campaigns: has orders OR CTR above category average
        is_auto = "auto" in campaign_name.lower()
        qualifies_add = is_auto and (orders > 0 or (impressions > 0 and ctr > category_avg_ctr))

        if qualifies_add and not await _already_pending(session, search_term, "add_keyword"):
            rec = KeywordRecommendation(
                source_campaign_id=campaign_id,
                search_term=search_term,
                match_type="exact" if orders > 0 else "phrase",
                impressions=impressions,
                clicks=clicks,
                orders=orders,
                ctr=ctr if ctr > 0 else None,
                conversion_rate=conv_rate if conv_rate > 0 else None,
                acos=acos,
                action="add_keyword",
                target_campaign_id=None,  # operator fills in via UI
                status="pending",
                created_at=utcnow(),
            )
            session.add(rec)
            created.append({
                "action": "add_keyword",
                "search_term": search_term,
                "campaign": campaign_name,
                "clicks": clicks,
                "orders": orders,
            })

        # ── Candidate: add_negative ──────────────────────────────────────────
        # High spend, zero conversions, enough clicks to be statistically meaningful
        qualifies_negative = clicks >= _NEGATIVE_MIN_CLICKS and orders == 0

        if qualifies_negative and not await _already_pending(session, search_term, "add_negative"):
            rec = KeywordRecommendation(
                source_campaign_id=campaign_id,
                search_term=search_term,
                match_type="exact",
                impressions=impressions,
                clicks=clicks,
                orders=0,
                ctr=ctr if ctr > 0 else None,
                conversion_rate=Decimal("0"),
                acos=None,
                action="add_negative",
                target_campaign_id=campaign_id,
                status="pending",
                created_at=utcnow(),
            )
            session.add(rec)
            created.append({
                "action": "add_negative",
                "search_term": search_term,
                "campaign": campaign_name,
                "clicks": clicks,
                "spend": float(spend),
            })

    await session.commit()
    logger.info(
        "keyword_discoverer: created %d recommendations (%d add, %d negative)",
        len(created),
        sum(1 for r in created if r["action"] == "add_keyword"),
        sum(1 for r in created if r["action"] == "add_negative"),
    )
    return created
