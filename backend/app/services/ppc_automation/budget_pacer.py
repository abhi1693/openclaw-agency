"""Budget pacing service.

Calculates daily pacing status per campaign against monthly budget targets.

Pacing logic:
  daily_target = monthly_budget / days_remaining_in_month
  pacing_score = actual_daily_spend / daily_target
  over-pacing  (> 1.10): suggest reduce daily budget
  under-pacing (< 0.70): suggest increase daily budget
  on-track     (0.70–1.10): healthy
"""

from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal
from typing import Any

from sqlmodel import col, select, text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.ppc_automation import BudgetPacingTarget


def _days_remaining(today: date) -> int:
    """Days remaining in the current month, inclusive of today."""
    last_day = calendar.monthrange(today.year, today.month)[1]
    return max(1, last_day - today.day + 1)


def _pacing_status(score: float) -> str:
    if score > 1.10:
        return "over"
    if score < 0.70:
        return "under"
    return "on_track"


async def get_budget_pacing(session: AsyncSession) -> list[dict[str, Any]]:
    """Return pacing status for all campaigns that have a monthly target."""
    today = date.today()
    days_remaining = _days_remaining(today)

    # Load all targets
    result = await session.exec(select(BudgetPacingTarget))
    targets = result.all()

    if not targets:
        return []

    # Load today's actual spend per campaign from hourly_campaign_metrics
    spend_rows = (await session.exec(text("""
        SELECT campaign_id, SUM(cost) as today_spend
        FROM hourly_campaign_metrics
        WHERE date = CURRENT_DATE
        GROUP BY campaign_id
    """))).all()

    # Also load month-to-date spend from ad_metrics (last 30 days within this month)
    mtd_rows = (await session.exec(text("""
        SELECT campaign_id, SUM(spend) as mtd_spend
        FROM ad_metrics
        WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY campaign_id
    """))).all()

    today_spend_map: dict[str, float] = {str(r[0]): float(r[1] or 0) for r in spend_rows}
    mtd_spend_map: dict[str, float] = {str(r[0]): float(r[1] or 0) for r in mtd_rows}

    results = []
    for target in targets:
        campaign_id = target.campaign_id
        monthly_budget = float(target.monthly_budget)

        today_spend = today_spend_map.get(campaign_id, 0.0)
        mtd_spend = mtd_spend_map.get(campaign_id, 0.0)
        days_elapsed = max(1, today.day)
        daily_target = monthly_budget / max(1, days_elapsed + days_remaining - 1)  # days in month

        avg_daily_spend = mtd_spend / days_elapsed if days_elapsed > 0 else today_spend
        pacing_score = avg_daily_spend / daily_target if daily_target > 0 else 0.0
        status = _pacing_status(pacing_score)

        results.append({
            "campaign_id": campaign_id,
            "campaign_name": target.campaign_name,
            "monthly_budget": monthly_budget,
            "daily_target": round(daily_target, 2),
            "today_spend": round(today_spend, 2),
            "mtd_spend": round(mtd_spend, 2),
            "avg_daily_spend": round(avg_daily_spend, 2),
            "pacing_score": round(pacing_score, 3),
            "status": status,
            "days_remaining": days_remaining,
            "budget_remaining": round(monthly_budget - mtd_spend, 2),
        })

    results.sort(key=lambda x: x["pacing_score"], reverse=True)
    return results
