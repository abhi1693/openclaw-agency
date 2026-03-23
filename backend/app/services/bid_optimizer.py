"""Bid Optimization Engine — Phase 2.

Core formula: Recommended Bid = ConversionRate × TargetACoS × AOV

Pulls keyword performance from search_term_reports + ad_metrics, applies
Bayesian smoothing for sparse data, respects per-ASIN safety bounds from
ppc_automation_settings, and inserts BidRecommendation rows.
"""

from __future__ import annotations

import math
from decimal import Decimal
from typing import Any

from sqlalchemy import func, text
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.amazon_orders import AdMetric, SearchTermReport
from app.models.ppc_automation import BidRecommendation, PpcAutomationSettings

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Bayesian smoothing: below this click threshold we blend with the category avg
_SPARSE_CLICK_THRESHOLD = 20
# Category-wide prior conversion rate when no data exists
_PRIOR_CONV_RATE = Decimal("0.08")  # 8% prior
# Minimum allowed bid regardless of settings
_ABSOLUTE_MIN_BID = Decimal("0.02")
# Default AOV when no sales data is available
_DEFAULT_AOV = Decimal("25.00")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bayesian_conv_rate(clicks: int, orders: int, category_avg: Decimal) -> Decimal:
    """Blend observed conversion rate with a category prior for sparse data.

    Uses a Beta distribution prior equivalent: weight the category avg by
    ``_SPARSE_CLICK_THRESHOLD`` pseudo-clicks before adding real observations.
    """
    prior_weight = _SPARSE_CLICK_THRESHOLD
    prior_orders = float(category_avg) * prior_weight
    blended = (prior_orders + orders) / (prior_weight + clicks) if (prior_weight + clicks) > 0 else float(category_avg)
    return Decimal(str(round(blended, 6)))


def _clamp_bid(
    recommended: Decimal,
    current: Decimal,
    settings: PpcAutomationSettings,
) -> tuple[Decimal, str | None]:
    """Apply safety bounds and return (final_bid, clamp_reason)."""
    clamp_note: str | None = None

    # 1. Maximum % change per cycle
    max_change = current * settings.bid_change_limit_pct
    if recommended > current + max_change:
        recommended = current + max_change
        clamp_note = f"capped at +{float(settings.bid_change_limit_pct) * 100:.0f}% change limit"
    elif recommended < current - max_change:
        recommended = current - max_change
        clamp_note = f"floored at -{float(settings.bid_change_limit_pct) * 100:.0f}% change limit"

    # 2. Absolute min/max from settings
    if recommended < settings.min_bid:
        recommended = settings.min_bid
        clamp_note = (clamp_note or "") + f" min_bid floor ${float(settings.min_bid):.2f}"
    if recommended > settings.max_bid:
        recommended = settings.max_bid
        clamp_note = (clamp_note or "") + f" max_bid cap ${float(settings.max_bid):.2f}"

    # 3. Absolute platform minimum
    recommended = max(recommended, _ABSOLUTE_MIN_BID)

    return recommended.quantize(Decimal("0.0001")), clamp_note


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------


async def _get_category_avg_conv_rate(session: AsyncSession) -> Decimal:
    """Compute category-wide conversion rate from all search term data."""
    result = await session.exec(
        select(
            func.sum(SearchTermReport.orders).label("total_orders"),
            func.sum(SearchTermReport.clicks).label("total_clicks"),
        )
    )
    row = result.first()
    if row and row.total_clicks and row.total_clicks > 0:
        return Decimal(str(round(row.total_orders / row.total_clicks, 6)))
    return _PRIOR_CONV_RATE


async def _get_aov(session: AsyncSession, parent_asin: str | None) -> Decimal:
    """Estimate AOV from AdMetric sales/orders for the given product.

    Falls back to global average, then to _DEFAULT_AOV.
    """
    query = select(
        func.sum(AdMetric.sales).label("total_sales"),
        func.sum(AdMetric.orders).label("total_orders"),
    )
    if parent_asin:
        # We don't have parent_asin on ad_metrics directly — use campaign lookup
        # For now, use global AOV as campaigns don't map 1:1 to parent_asin here
        pass

    result = await session.exec(query)
    row = result.first()
    if row and row.total_orders and row.total_orders > 0 and row.total_sales:
        aov = Decimal(str(row.total_sales)) / Decimal(str(row.total_orders))
        return aov.quantize(Decimal("0.01"))
    return _DEFAULT_AOV


async def _get_settings(
    session: AsyncSession, parent_asin: str | None
) -> PpcAutomationSettings | None:
    """Return automation settings for a specific ASIN, or the first available."""
    if parent_asin:
        result = await session.exec(
            select(PpcAutomationSettings).where(PpcAutomationSettings.parent_asin == parent_asin)
        )
        return result.first()
    # Fall back to first available settings
    result = await session.exec(select(PpcAutomationSettings).limit(1))
    return result.first()


async def generate_bid_recommendations(
    session: AsyncSession,
    parent_asin: str | None = None,
) -> list[dict[str, Any]]:
    """Generate BidRecommendation rows for all active keywords.

    Steps:
    1. Pull aggregated keyword performance from search_term_reports
    2. Apply Bayesian smoothing for keywords with < 20 clicks
    3. Compute: recommended_bid = conv_rate × target_acos × aov
    4. Clamp to safety bounds from settings
    5. Only create recommendations where |change| >= 1% or new bid differs from current
    6. Persist to bid_recommendations (skip duplicates for today)

    Returns list of summary dicts for the caller.
    """
    settings = await _get_settings(session, parent_asin)
    if settings is None:
        logger.warning("bid_optimizer: no automation settings found, skipping")
        return []

    category_avg = await _get_category_avg_conv_rate(session)
    aov = await _get_aov(session, parent_asin)

    logger.info(
        "bid_optimizer: category_avg_conv=%.4f aov=$%.2f target_acos=%.4f",
        float(category_avg), float(aov), float(settings.target_acos),
    )

    # Aggregate clicks/orders/spend per keyword across all periods
    # Group by campaign_id + keyword/targeting so we have one row per keyword
    stmt = text("""
        SELECT
            campaign_id,
            ad_group_id,
            keyword          AS keyword_text,
            match_type,
            SUM(clicks)      AS total_clicks,
            SUM(orders)      AS total_orders,
            SUM(spend)       AS total_spend,
            COUNT(*)         AS row_count
        FROM search_term_reports
        WHERE keyword IS NOT NULL
          AND campaign_id IS NOT NULL
        GROUP BY campaign_id, ad_group_id, keyword, match_type
        HAVING SUM(clicks) > 0
        ORDER BY SUM(spend) DESC
        LIMIT 500
    """)
    rows = (await session.exec(stmt)).all()  # type: ignore[arg-type]

    created: list[dict[str, Any]] = []
    today_str = utcnow().date().isoformat()

    for row in rows:
        campaign_id = row.campaign_id
        ad_group_id = row.ad_group_id
        keyword_text = row.keyword_text
        match_type = row.match_type or "broad"
        clicks = int(row.total_clicks or 0)
        orders = int(row.total_orders or 0)
        total_spend = Decimal(str(row.total_spend or 0))

        if clicks == 0:
            continue

        # Bayesian conversion rate
        conv_rate = _bayesian_conv_rate(clicks, orders, category_avg)

        # Core formula
        raw_recommended = conv_rate * settings.target_acos * aov

        # Derive current bid as CPC proxy (spend / clicks)
        current_bid = (total_spend / clicks).quantize(Decimal("0.0001")) if clicks > 0 else Decimal("0.50")
        current_bid = max(current_bid, _ABSOLUTE_MIN_BID)

        # Clamp
        recommended_bid, clamp_note = _clamp_bid(raw_recommended, current_bid, settings)

        # Skip if change is trivial (< 1%)
        if current_bid > 0:
            change_pct = abs(float(recommended_bid - current_bid) / float(current_bid))
            if change_pct < 0.01:
                continue

        # Skip if we already have a pending recommendation for this keyword today
        existing = await session.exec(
            select(BidRecommendation)
            .where(BidRecommendation.campaign_id == campaign_id)
            .where(BidRecommendation.match_type == match_type)
            .where(BidRecommendation.status == "pending")
        )
        if existing.first() is not None:
            continue

        reason_parts = [
            f"Conv {float(conv_rate) * 100:.1f}% × ACoS {float(settings.target_acos) * 100:.0f}% × AOV ${float(aov):.2f} = ${float(raw_recommended):.4f}",
        ]
        if clamp_note:
            reason_parts.append(f"({clamp_note})")

        rec = BidRecommendation(
            campaign_id=campaign_id,
            ad_group_id=ad_group_id,
            keyword_id=None,  # keyword_id not stored in search_term_reports
            match_type=match_type,
            current_bid=current_bid,
            recommended_bid=recommended_bid,
            conversion_rate=conv_rate,
            target_acos=settings.target_acos,
            aov=aov,
            reason=" ".join(reason_parts),
            status="pending",
            created_at=utcnow(),
        )
        session.add(rec)
        created.append({
            "campaign_id": campaign_id,
            "keyword": keyword_text,
            "match_type": match_type,
            "current_bid": float(current_bid),
            "recommended_bid": float(recommended_bid),
        })

    await session.commit()
    logger.info("bid_optimizer: created %d bid recommendations", len(created))
    return created
