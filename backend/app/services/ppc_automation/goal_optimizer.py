"""Goal-based campaign optimizer with PID controller.

Goal modes:
  target_acos  — maintain specific ACoS (default)
  max_sales    — maximize sales while keeping ACoS below target
  efficiency   — minimize ACoS

PID controller:
  error = actual_acos - target_acos
  bid_adjustment = Kp * error + Ki * integral(error) + Kd * derivative(error)
  Clamp: max ±max_bid_adjustment_pct (default ±15%)

Positive error (actual > target) → ACoS too high → reduce bids (negative adjustment).
Negative error (actual < target) → ACoS below target → can raise bids (positive adjustment).
"""

from __future__ import annotations

from typing import Any

from sqlmodel import col, select, text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.ppc_automation import BidSuggestion, CampaignGoal

logger = get_logger(__name__)


async def run_goal_optimizer(session: AsyncSession) -> dict[str, int]:
    """Generate bid suggestions for all campaigns with goals.

    Returns count of suggestions created.
    """
    result = await session.exec(select(CampaignGoal))
    goals = result.all()

    if not goals:
        return {"created": 0}

    # Load recent ACoS per campaign from ad_metrics (last 7 days)
    rows = (await session.exec(text("""
        SELECT campaign_id,
               SUM(spend) / NULLIF(SUM(sales), 0) AS acos
        FROM ad_metrics
        WHERE date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY campaign_id
    """))).all()
    acos_map: dict[str, float] = {str(r[0]): float(r[1]) for r in rows if r[1] is not None}

    created = 0
    for goal in goals:
        actual_acos_raw = acos_map.get(goal.campaign_id)
        if actual_acos_raw is None:
            continue

        actual_acos = actual_acos_raw * 100  # store as %, e.g. 0.25 → 25.0
        target = goal.target_acos

        # PID calculation
        error = actual_acos - target
        new_integral = goal.pid_integral + error
        derivative = error - goal.pid_last_error

        raw_adjustment = (
            goal.kp * error
            + goal.ki * new_integral
            + goal.kd * derivative
        )

        # Convert to fractional bid adjustment: +1% error → adjust bid by -Kp%
        # We negate because high ACoS → reduce bids
        bid_adj = -raw_adjustment / 100.0

        # Clamp
        max_adj = goal.max_bid_adjustment_pct
        bid_adj = max(min(bid_adj, max_adj), -max_adj)

        # Persist updated PID state
        goal.pid_integral = new_integral
        goal.pid_last_error = error
        goal.updated_at = utcnow()
        session.add(goal)

        direction = "increase" if bid_adj > 0 else "decrease"
        reason = (
            f"goal={goal.goal_mode}, actual_acos={actual_acos:.1f}%, "
            f"target={target:.1f}%, error={error:+.1f}%, "
            f"suggested_bid_{direction}={abs(bid_adj)*100:.1f}%"
        )

        session.add(BidSuggestion(
            campaign_id=goal.campaign_id,
            campaign_name=goal.campaign_name,
            goal_mode=goal.goal_mode,
            actual_acos=actual_acos,
            target_acos=target,
            pid_error=error,
            bid_adjustment_pct=bid_adj,
            reason=reason,
            status="pending",
            created_at=utcnow(),
        ))
        created += 1

    await session.commit()
    logger.info("Goal optimizer: %d bid suggestions created", created)
    return {"created": created}
