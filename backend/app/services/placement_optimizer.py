"""Placement Optimizer — Phase 6.

Analyzes campaign-level performance from AdMetric and generates bid modifier
recommendations for the 3 Amazon placement types:
  - top_of_search   — highest intent, usually best conversion
  - product_pages   — medium intent, competitive discovery
  - rest_of_search  — lowest intent, brand awareness / spill

Data note
---------
Amazon does not expose placement-level splits via the standard SP report sync
that's currently in the DB. Recommendations are therefore derived from
campaign-level ROAS vs the category average, with placement-type-specific
multipliers reflecting typical Amazon traffic quality:
  top_of_search:  ROAS premium of +40% vs avg
  product_pages:  ROAS at avg
  rest_of_search: ROAS at -30% vs avg

Once the SP placement report is synced, swap the SQL to query actual
placement-level clicks/orders/ROAS and remove the distribution estimates.

Modifier logic
--------------
  If placement_roas / campaign_avg_roas > 1.2  → increase modifier (cap at +400%)
  If placement_roas / campaign_avg_roas < 0.5  → decrease modifier toward 0%
  Graduated: max ±50 percentage-point change per cycle
  Sparse guard: skip if estimated_clicks < MIN_CLICKS (20)
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.ppc_automation import PlacementRecommendation

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PLACEMENTS = ("top_of_search", "product_pages", "rest_of_search")

# Estimated ROAS multipliers per placement relative to campaign average
_PLACEMENT_ROAS_FACTOR = {
    "top_of_search": 1.40,
    "product_pages": 1.00,
    "rest_of_search": 0.70,
}

# Estimated traffic split per placement
_PLACEMENT_TRAFFIC_SPLIT = {
    "top_of_search": 0.40,
    "product_pages": 0.30,
    "rest_of_search": 0.30,
}

_MIN_CLICKS = 20             # minimum estimated clicks to generate recommendation
_MAX_MODIFIER = 400.0        # never recommend above 400%
_MAX_SHIFT = 50.0            # max change per cycle (pct pts)
_ROAS_UPPER_THRESHOLD = 1.2  # placement ROAS > avg × 1.2 → increase modifier
_ROAS_LOWER_THRESHOLD = 0.5  # placement ROAS < avg × 0.5 → decrease modifier
_LOOKBACK_DAYS = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _placement_already_pending(
    session: AsyncSession, campaign_id: str, placement: str
) -> bool:
    result = await session.exec(
        select(PlacementRecommendation)
        .where(PlacementRecommendation.campaign_id == campaign_id)
        .where(PlacementRecommendation.placement == placement)
        .where(PlacementRecommendation.status == "pending")
    )
    return result.first() is not None


def _recommend_modifier(
    placement_roas: float,
    campaign_avg_roas: float,
    current_modifier: float,
) -> tuple[float | None, str]:
    if campaign_avg_roas <= 0:
        return None, "insufficient_data: zero campaign ROAS"

    ratio = placement_roas / campaign_avg_roas

    if ratio >= _ROAS_UPPER_THRESHOLD:
        # Good placement — increase modifier
        target = min(current_modifier + _MAX_SHIFT, _MAX_MODIFIER)
        action = f"increase — placement ROAS {ratio:.2f}× campaign avg (>= {_ROAS_UPPER_THRESHOLD}×)"
    elif ratio <= _ROAS_LOWER_THRESHOLD:
        # Poor placement — reduce modifier
        target = max(current_modifier - _MAX_SHIFT, 0.0)
        action = f"decrease — placement ROAS {ratio:.2f}× campaign avg (<= {_ROAS_LOWER_THRESHOLD}×)"
    else:
        # Hold — within acceptable range
        return current_modifier, f"hold — placement ROAS {ratio:.2f}× campaign avg (within band)"

    return round(target, 1), action


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------


async def generate_placement_recommendations(
    session: AsyncSession,
) -> list[dict[str, Any]]:
    """Analyze campaigns and generate placement bid modifier recommendations.

    Returns summary list of created recommendations.
    """
    cutoff = date.today() - timedelta(days=_LOOKBACK_DAYS)

    # Query campaign-level metrics
    stmt = text("""
        SELECT
            c.campaign_id,
            c.name        AS campaign_name,
            SUM(m.impressions) AS total_impressions,
            SUM(m.clicks)      AS total_clicks,
            SUM(m.orders)      AS total_orders,
            SUM(m.spend)       AS total_spend,
            SUM(m.sales)       AS total_sales
        FROM campaigns c
        JOIN ad_metrics m ON c.campaign_id = m.campaign_id
        WHERE m.report_date >= :cutoff
          AND c.state = 'enabled'
        GROUP BY c.campaign_id, c.name
        HAVING SUM(m.clicks) >= :min_clicks
        ORDER BY SUM(m.spend) DESC
        LIMIT 200
    """)
    rows = (
        await session.exec(stmt, params={"cutoff": cutoff, "min_clicks": _MIN_CLICKS})
    ).all()  # type: ignore[arg-type]

    # Compute category average ROAS
    all_roas = []
    for row in rows:
        spend = float(row.total_spend or 0)
        sales = float(row.total_sales or 0)
        if spend > 0:
            all_roas.append(sales / spend)
    category_avg_roas = sum(all_roas) / len(all_roas) if all_roas else 1.0

    logger.info(
        "placement_optimizer: %d campaigns, category_avg_roas=%.3f",
        len(rows), category_avg_roas,
    )

    created: list[dict[str, Any]] = []

    for row in rows:
        campaign_id = row.campaign_id
        campaign_name = row.campaign_name
        total_clicks = int(row.total_clicks or 0)
        total_orders = int(row.total_orders or 0)
        total_spend = float(row.total_spend or 0)
        total_sales = float(row.total_sales or 0)
        total_impressions = int(row.total_impressions or 0)

        campaign_avg_roas = total_sales / total_spend if total_spend > 0 else 0.0
        campaign_avg_acos = total_spend / total_sales if total_sales > 0 else None
        campaign_cvr = total_orders / total_clicks if total_clicks > 0 else 0.0

        for placement in PLACEMENTS:
            if await _placement_already_pending(session, campaign_id, placement):
                continue

            split = _PLACEMENT_TRAFFIC_SPLIT[placement]
            roas_factor = _PLACEMENT_ROAS_FACTOR[placement]

            # Estimate placement-level metrics from campaign totals
            est_impressions = round(total_impressions * split)
            est_clicks = round(total_clicks * split)
            est_orders = round(total_orders * split)
            est_roas = campaign_avg_roas * roas_factor
            est_acos = (1 / est_roas) if est_roas > 0 else None
            est_ctr = est_clicks / est_impressions if est_impressions > 0 else None
            est_cvr = campaign_cvr  # assume same CVR

            if est_clicks < _MIN_CLICKS:
                continue

            rec_modifier, action = _recommend_modifier(
                placement_roas=est_roas,
                campaign_avg_roas=campaign_avg_roas,
                current_modifier=0.0,
            )

            reason = json.dumps({
                "placement": placement,
                "est_roas": round(est_roas, 3),
                "campaign_avg_roas": round(campaign_avg_roas, 3),
                "category_avg_roas": round(category_avg_roas, 3),
                "roas_ratio": round(est_roas / campaign_avg_roas, 3) if campaign_avg_roas > 0 else None,
                "data_source": "campaign_level_estimate",
                "action": action,
                "insufficient_data": est_clicks < _MIN_CLICKS,
            })

            rec = PlacementRecommendation(
                campaign_id=campaign_id,
                campaign_name=campaign_name,
                placement=placement,
                current_modifier_pct=0.0,
                recommended_modifier_pct=rec_modifier,
                placement_impressions=est_impressions,
                placement_clicks=est_clicks,
                placement_orders=est_orders,
                placement_ctr=round(est_ctr, 6) if est_ctr else None,
                placement_cvr=round(est_cvr, 6) if est_cvr else None,
                placement_acos=round(est_acos, 4) if est_acos else None,
                placement_roas=round(est_roas, 4),
                campaign_avg_roas=round(campaign_avg_roas, 4),
                reason=reason,
                status="pending",
                created_at=utcnow(),
            )
            session.add(rec)
            created.append({
                "campaign_id": campaign_id,
                "campaign_name": campaign_name,
                "placement": placement,
                "recommended_modifier_pct": rec_modifier,
                "action": action,
            })

    await session.commit()
    logger.info(
        "placement_optimizer: created %d placement recommendations for %d campaigns",
        len(created), len(rows),
    )
    return created
