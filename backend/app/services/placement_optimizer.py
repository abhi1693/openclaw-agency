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
    cutoff = utcnow() - timedelta(hours=24)
    result = await session.exec(
        select(PlacementRecommendation)
        .where(PlacementRecommendation.campaign_id == campaign_id)
        .where(PlacementRecommendation.placement == placement)
        .where(PlacementRecommendation.status == "pending")
        .where(PlacementRecommendation.created_at > cutoff)
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

    # ── Primary: use AMS hourly_campaign_metrics with real placement data ──────
    # Map AMS placement values to our canonical placement names
    _AMS_PLACEMENT_MAP = {
        "TOP_OF_SEARCH": "top_of_search",
        "DETAIL_PAGE": "product_pages",
        "OTHER": "rest_of_search",
    }

    ams_stmt = text("""
        SELECT
            campaign_id,
            placement,
            SUM(impressions) AS total_impressions,
            SUM(clicks)      AS total_clicks,
            SUM(orders)      AS total_orders,
            SUM(cost)        AS total_spend,
            SUM(sales)       AS total_sales,
            COUNT(DISTINCT date) AS distinct_dates
        FROM hourly_campaign_metrics
        WHERE date >= :cutoff
          AND placement IS NOT NULL
        GROUP BY campaign_id, placement
        HAVING SUM(clicks) > 0
    """)
    ams_rows = (
        await session.exec(ams_stmt, params={"cutoff": cutoff})  # type: ignore[arg-type]
    ).all()

    # Build AMS placement data: {campaign_id: {placement: metrics}}
    ams_data: dict[str, dict[str, dict[str, Any]]] = {}
    for r in ams_rows:
        canonical = _AMS_PLACEMENT_MAP.get(str(r.placement or "").upper())
        if not canonical:
            continue
        if r.campaign_id not in ams_data:
            ams_data[r.campaign_id] = {}
        ams_data[r.campaign_id][canonical] = {
            "impressions": int(r.total_impressions or 0),
            "clicks": int(r.total_clicks or 0),
            "orders": int(r.total_orders or 0),
            "spend": float(r.total_spend or 0),
            "sales": float(r.total_sales or 0),
            "distinct_dates": int(r.distinct_dates or 0),
        }

    # Check minimum data depth for AMS path (need >= 3 distinct dates)
    all_distinct = [
        m["distinct_dates"]
        for camp in ams_data.values()
        for m in camp.values()
    ]
    ams_has_enough = len(all_distinct) > 0 and max(all_distinct, default=0) >= 3
    if ams_data and not ams_has_enough:
        logger.info(
            "placement_optimizer: AMS data present but < 3 distinct dates (max=%d) — "
            "falling back to estimates; will use real data once more accumulates",
            max(all_distinct, default=0),
        )

    # ── Fall back to ad_metrics + campaign estimates if AMS data insufficient ──
    fallback_stmt = text("""
        SELECT
            campaign_name    AS campaign_id,
            campaign_name,
            SUM(impressions) AS total_impressions,
            SUM(clicks)      AS total_clicks,
            SUM(orders)      AS total_orders,
            SUM(spend)       AS total_spend,
            SUM(sales)       AS total_sales
        FROM search_term_reports
        WHERE report_date >= :cutoff
        GROUP BY campaign_name
        HAVING SUM(clicks) >= :min_clicks
        ORDER BY SUM(spend) DESC
        LIMIT 200
    """)
    fallback_rows = (
        await session.exec(fallback_stmt, params={"cutoff": cutoff, "min_clicks": _MIN_CLICKS})
    ).all()  # type: ignore[arg-type]

    # Compute category average ROAS from fallback data
    all_roas = []
    for row in fallback_rows:
        spend = float(row.total_spend or 0)
        sales = float(row.total_sales or 0)
        if spend > 0:
            all_roas.append(sales / spend)
    category_avg_roas = sum(all_roas) / len(all_roas) if all_roas else 1.0

    # Merge campaign list: prefer AMS campaigns, supplement with fallback
    campaign_ids_from_ams = set(ams_data.keys()) if ams_has_enough else set()
    fallback_by_id = {str(r.campaign_id): r for r in fallback_rows}

    # Build unified campaign list
    all_campaign_ids: list[str] = list(campaign_ids_from_ams)
    for r in fallback_rows:
        if str(r.campaign_id) not in campaign_ids_from_ams:
            all_campaign_ids.append(str(r.campaign_id))

    logger.info(
        "placement_optimizer: %d AMS campaigns, %d fallback campaigns, category_avg_roas=%.3f",
        len(campaign_ids_from_ams), len(fallback_rows), category_avg_roas,
    )

    created: list[dict[str, Any]] = []

    for campaign_id in all_campaign_ids:
        # Determine campaign name
        fb = fallback_by_id.get(campaign_id)
        campaign_name = str(fb.campaign_name if fb else campaign_id)

        # Fallback campaign-level totals (for estimate path)
        if fb:
            total_clicks = int(fb.total_clicks or 0)
            total_orders = int(fb.total_orders or 0)
            total_spend = float(fb.total_spend or 0)
            total_sales = float(fb.total_sales or 0)
            total_impressions = int(fb.total_impressions or 0)
        else:
            # AMS-only campaign — sum across placements
            camp_ams = ams_data.get(campaign_id, {})
            total_clicks = sum(m["clicks"] for m in camp_ams.values())
            total_orders = sum(m["orders"] for m in camp_ams.values())
            total_spend = sum(m["spend"] for m in camp_ams.values())
            total_sales = sum(m["sales"] for m in camp_ams.values())
            total_impressions = sum(m["impressions"] for m in camp_ams.values())

        if total_clicks < _MIN_CLICKS:
            continue

        campaign_avg_roas = total_sales / total_spend if total_spend > 0 else 0.0
        campaign_cvr = total_orders / total_clicks if total_clicks > 0 else 0.0

        for placement in PLACEMENTS:
            if await _placement_already_pending(session, campaign_id, placement):
                continue

            # Use real AMS placement data if available, else estimate
            camp_ams = ams_data.get(campaign_id, {}) if ams_has_enough else {}
            ams_placement = camp_ams.get(placement)

            if ams_placement:
                est_impressions = ams_placement["impressions"]
                est_clicks = ams_placement["clicks"]
                est_orders = ams_placement["orders"]
                est_spend = ams_placement["spend"]
                est_sales = ams_placement["sales"]
                est_roas = est_sales / est_spend if est_spend > 0 else 0.0
                est_acos = est_spend / est_sales if est_sales > 0 else None
                est_ctr = est_clicks / est_impressions if est_impressions > 0 else None
                est_cvr = est_orders / est_clicks if est_clicks > 0 else 0.0
                data_source = "ams_hourly_actual"
            else:
                split = _PLACEMENT_TRAFFIC_SPLIT[placement]
                roas_factor = _PLACEMENT_ROAS_FACTOR[placement]
                est_impressions = round(total_impressions * split)
                est_clicks = round(total_clicks * split)
                est_orders = round(total_orders * split)
                est_roas = campaign_avg_roas * roas_factor
                est_acos = (1 / est_roas) if est_roas > 0 else None
                est_ctr = est_clicks / est_impressions if est_impressions > 0 else None
                est_cvr = campaign_cvr
                data_source = "campaign_level_estimate"

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
                "data_source": data_source,
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
