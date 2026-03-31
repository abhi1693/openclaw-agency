"""Dayparting service.

Reads hourly_campaign_metrics to compute per-hour CVR coefficients and generate
bid modifier recommendations.

CVR coefficient: hourly_cvr / avg_cvr
  > 1.0 → high-performing hour (raise bids)
  < 1.0 → low-performing hour (lower bids)
"""

from __future__ import annotations

import json
from typing import Any

from sqlmodel import select, text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.models.ppc_automation import DaypartingSchedule

logger = get_logger(__name__)


async def get_hourly_performance(
    session: AsyncSession,
    campaign_id: str,
    days: int = 30,
) -> list[dict[str, Any]]:
    """Return 24-hour aggregated performance data for a campaign.

    Returns a list of 24 dicts (one per hour 0–23) with:
      hour, impressions, clicks, orders, spend, sales,
      cvr, cpc, acos, cvr_coefficient
    """
    rows = (await session.exec(text(f"""
        SELECT
            hour,
            SUM(impressions)     AS impressions,
            SUM(clicks)          AS clicks,
            SUM(orders)          AS orders,
            SUM(cost)            AS spend,
            SUM(sales)           AS sales
        FROM hourly_campaign_metrics
        WHERE campaign_id = :campaign_id
          AND date >= CURRENT_DATE - INTERVAL '{days} days'
        GROUP BY hour
        ORDER BY hour
    """), {"campaign_id": campaign_id})).all()

    # Build hour → data map
    hour_map: dict[int, dict] = {}
    for r in rows:
        h = int(r[0])
        clicks = int(r[2] or 0)
        orders = int(r[3] or 0)
        spend = float(r[4] or 0)
        sales = float(r[5] or 0)
        cvr = orders / clicks if clicks > 0 else 0.0
        hour_map[h] = {
            "hour": h,
            "impressions": int(r[1] or 0),
            "clicks": clicks,
            "orders": orders,
            "spend": round(spend, 4),
            "sales": round(sales, 2),
            "cvr": round(cvr, 4),
            "cpc": round(spend / clicks, 4) if clicks > 0 else 0.0,
            "acos": round(spend / sales * 100, 2) if sales > 0 else None,
        }

    # Fill missing hours with zeros
    all_hours = []
    cvr_values = [v["cvr"] for v in hour_map.values() if v["cvr"] > 0]
    avg_cvr = sum(cvr_values) / len(cvr_values) if cvr_values else 1.0

    for h in range(24):
        entry = hour_map.get(h, {
            "hour": h, "impressions": 0, "clicks": 0, "orders": 0,
            "spend": 0.0, "sales": 0.0, "cvr": 0.0, "cpc": 0.0, "acos": None,
        })
        cvr_coeff = entry["cvr"] / avg_cvr if avg_cvr > 0 and entry["cvr"] > 0 else 0.0
        entry["cvr_coefficient"] = round(cvr_coeff, 3)
        entry["avg_cvr"] = round(avg_cvr, 4)
        all_hours.append(entry)

    return all_hours


async def get_dayparting_schedule(
    session: AsyncSession, campaign_id: str
) -> DaypartingSchedule | None:
    result = await session.exec(
        select(DaypartingSchedule).where(DaypartingSchedule.campaign_id == campaign_id)
    )
    return result.first()


def cvr_coefficients_to_multipliers(hourly_data: list[dict]) -> list[float]:
    """Convert CVR coefficients to bid multipliers, clamped to 0.5–2.0."""
    multipliers = []
    for entry in hourly_data:
        coeff = entry.get("cvr_coefficient", 0.0)
        if coeff == 0.0:
            multipliers.append(1.0)  # no data → neutral
        else:
            # Clamp to [0.5, 2.0]
            m = max(0.5, min(2.0, coeff))
            multipliers.append(round(m, 2))
    return multipliers
