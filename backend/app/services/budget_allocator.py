"""Budget Allocation Service — Phase 5.

Calculates optimal budget distribution across SP/SB/SD/SBV ad types
for each parent ASIN based on 14-day performance history.

Algorithm
---------
1. Query last 14 days of search_term_reports, inferring ad type from campaign name.
2. Split into two 7-day windows to compute ROAS trend.
3. Pull last 14 days of budget_allocations rows to compute per-type utilization.
4. Build an efficiency score per active ad type:
     efficiency = (normalized_roas * 0.6) + (utilization * 0.4)
5. Starting from current (or default) allocation, shift budget toward higher efficiency
   types, capped at MAX_SHIFT_PER_CYCLE = 0.10 (10 percentage points).
6. Enforce MIN_ALLOC_PER_ACTIVE_TYPE = 0.10 floor for any type with spend > 0.
7. Inactive types (no spend in 14d) receive 0%.
8. Normalise final percentages to sum exactly to 1.0.
9. Persist one BudgetAllocation row per (parent_asin, today).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.ppc_automation import BudgetAllocation

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

AD_TYPES = ("sp", "sb", "sd", "sbv")

# Default seed allocation when no history exists at all
_DEFAULT_ALLOC: dict[str, float] = {"sp": 0.70, "sb": 0.15, "sd": 0.10, "sbv": 0.05}

_MIN_FLOOR = 0.10           # active types never drop below 10%
_MAX_SHIFT = 0.10           # max total reallocation shift per cycle (absolute pct pts)
_LOOKBACK_DAYS = 14
_DEFAULT_BUDGET = 50.0      # USD fallback when no prior row exists

# CASE expression used in SQL to infer ad type from campaign name
_AD_TYPE_CASE = """
    CASE
        WHEN LOWER(campaign_name) LIKE '%video%'
          OR LOWER(campaign_name) LIKE '%sbv%'
          OR LOWER(campaign_name) LIKE '%sb video%'   THEN 'sbv'
        WHEN LOWER(campaign_name) LIKE '%sponsored display%'
          OR LOWER(campaign_name) LIKE '%-sd-%'
          OR LOWER(campaign_name) LIKE '% sd %'
          OR LOWER(campaign_name) LIKE '%_sd_%'       THEN 'sd'
        WHEN LOWER(campaign_name) LIKE '%sponsored brand%'
          OR LOWER(campaign_name) LIKE '%headline%'
          OR LOWER(campaign_name) LIKE '%-sb-%'
          OR LOWER(campaign_name) LIKE '% sb %'       THEN 'sb'
        ELSE 'sp'
    END
"""


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class AdTypeMetrics:
    ad_type: str
    spend_14d: float = 0.0
    sales_14d: float = 0.0
    spend_7d: float = 0.0
    sales_7d: float = 0.0
    spend_prev7d: float = 0.0
    sales_prev7d: float = 0.0
    utilization: float | None = None  # actual / allocated

    @property
    def roas_14d(self) -> float | None:
        if self.spend_14d <= 0:
            return None
        return round(self.sales_14d / self.spend_14d, 3)

    @property
    def roas_7d(self) -> float | None:
        if self.spend_7d <= 0:
            return None
        return round(self.sales_7d / self.spend_7d, 3)

    @property
    def roas_prev7d(self) -> float | None:
        if self.spend_prev7d <= 0:
            return None
        return round(self.sales_prev7d / self.spend_prev7d, 3)

    @property
    def trend(self) -> str:
        r7 = self.roas_7d
        rp = self.roas_prev7d
        if r7 is None or rp is None or rp == 0:
            return "unknown"
        ratio = r7 / rp
        if ratio >= 1.10:
            return "improving"
        if ratio <= 0.90:
            return "declining"
        return "stable"

    @property
    def active(self) -> bool:
        return self.spend_14d > 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalise(alloc: dict[str, float]) -> dict[str, float]:
    """Normalise allocation dict so values sum to 1.0."""
    total = sum(alloc.values())
    if total <= 0:
        return dict(_DEFAULT_ALLOC)
    return {k: round(v / total, 6) for k, v in alloc.items()}


def _clamp_shifts(current: dict[str, float], target: dict[str, float]) -> dict[str, float]:
    """Limit total reallocation to MAX_SHIFT percentage points per cycle."""
    total_shift = sum(abs(target[t] - current[t]) for t in AD_TYPES) / 2
    if total_shift <= _MAX_SHIFT:
        return dict(target)
    # Scale shifts proportionally
    scale = _MAX_SHIFT / total_shift
    return {
        t: current[t] + (target[t] - current[t]) * scale
        for t in AD_TYPES
    }


# ---------------------------------------------------------------------------
# Performance data queries
# ---------------------------------------------------------------------------


async def _fetch_performance(session: AsyncSession, today: date) -> dict[str, AdTypeMetrics]:
    cutoff_14d = today - timedelta(days=_LOOKBACK_DAYS)
    cutoff_7d = today - timedelta(days=7)

    stmt = text(f"""
        SELECT
            {_AD_TYPE_CASE} AS ad_type,
            SUM(CASE WHEN report_date >= :cutoff_7d  THEN spend ELSE 0 END) AS spend_7d,
            SUM(CASE WHEN report_date >= :cutoff_7d  THEN sales ELSE 0 END) AS sales_7d,
            SUM(CASE WHEN report_date <  :cutoff_7d  THEN spend ELSE 0 END) AS spend_prev7d,
            SUM(CASE WHEN report_date <  :cutoff_7d  THEN sales ELSE 0 END) AS sales_prev7d,
            SUM(spend)  AS spend_14d,
            SUM(sales)  AS sales_14d
        FROM search_term_reports
        WHERE report_date >= :cutoff_14d
        GROUP BY ad_type
    """)
    rows = (
        await session.exec(stmt, params={"cutoff_14d": cutoff_14d, "cutoff_7d": cutoff_7d})
    ).all()  # type: ignore[arg-type]

    metrics: dict[str, AdTypeMetrics] = {t: AdTypeMetrics(ad_type=t) for t in AD_TYPES}
    for row in rows:
        at = row.ad_type
        if at in metrics:
            metrics[at].spend_14d = float(row.spend_14d or 0)
            metrics[at].sales_14d = float(row.sales_14d or 0)
            metrics[at].spend_7d = float(row.spend_7d or 0)
            metrics[at].sales_7d = float(row.sales_7d or 0)
            metrics[at].spend_prev7d = float(row.spend_prev7d or 0)
            metrics[at].sales_prev7d = float(row.sales_prev7d or 0)
    return metrics


async def _fetch_utilization(
    session: AsyncSession, parent_asin: str, today: date
) -> dict[str, float]:
    """Compute average per-type utilization from recent budget_allocation rows."""
    cutoff = today - timedelta(days=_LOOKBACK_DAYS)
    stmt = (
        select(BudgetAllocation)
        .where(BudgetAllocation.parent_asin == parent_asin)
        .where(BudgetAllocation.alloc_date >= cutoff)
        .order_by(col(BudgetAllocation.alloc_date).desc())
    )
    rows = (await session.exec(stmt)).all()

    if not rows:
        return {}

    util: dict[str, list[float]] = {t: [] for t in AD_TYPES}
    for row in rows:
        for t in AD_TYPES:
            pct = float(getattr(row, f"{t}_pct", 0) or 0)
            spend = float(getattr(row, f"{t}_actual_spend", 0) or 0)
            allocated = float(row.total_daily_budget) * pct
            if allocated > 0:
                util[t].append(spend / allocated)

    return {t: round(sum(v) / len(v), 4) for t, v in util.items() if v}


async def _get_current_alloc(session: AsyncSession, parent_asin: str) -> dict[str, float] | None:
    """Get the most recent allocation row's percentages."""
    stmt = (
        select(BudgetAllocation)
        .where(BudgetAllocation.parent_asin == parent_asin)
        .order_by(col(BudgetAllocation.alloc_date).desc())
    )
    row = (await session.exec(stmt)).first()
    if row is None:
        return None
    return {t: float(getattr(row, f"{t}_pct", 0) or 0) for t in AD_TYPES}


async def _get_last_budget(session: AsyncSession, parent_asin: str) -> float:
    stmt = (
        select(BudgetAllocation)
        .where(BudgetAllocation.parent_asin == parent_asin)
        .order_by(col(BudgetAllocation.alloc_date).desc())
    )
    row = (await session.exec(stmt)).first()
    if row:
        return float(row.total_daily_budget)
    return _DEFAULT_BUDGET


# ---------------------------------------------------------------------------
# Core allocation logic
# ---------------------------------------------------------------------------


def _build_recommendation(
    metrics: dict[str, AdTypeMetrics],
    utilization: dict[str, float],
    current_alloc: dict[str, float],
) -> tuple[dict[str, float], dict[str, Any]]:
    """Compute recommended allocation and reasoning."""

    # Attach utilization to metrics
    for t in AD_TYPES:
        if t in utilization:
            metrics[t].utilization = utilization[t]

    active_types = [t for t in AD_TYPES if metrics[t].active]
    if not active_types:
        # No data — fall back to defaults
        return dict(_DEFAULT_ALLOC), {t: {"action": "default_no_data"} for t in AD_TYPES}

    # Build efficiency score: normalised_roas * 0.6 + normalised_utilization * 0.4
    roas_values = {t: (metrics[t].roas_14d or 0.0) for t in active_types}
    util_values = {t: (metrics[t].utilization or 0.5) for t in active_types}  # 0.5 default

    max_roas = max(roas_values.values()) or 1.0
    max_util = max(util_values.values()) or 1.0

    efficiency: dict[str, float] = {}
    for t in active_types:
        norm_roas = roas_values[t] / max_roas
        norm_util = util_values[t] / max_util
        efficiency[t] = round(norm_roas * 0.6 + norm_util * 0.4, 4)

    # Compute target allocation proportional to efficiency
    total_eff = sum(efficiency.values())
    raw_target = {t: (efficiency[t] / total_eff) for t in active_types}

    # Apply minimum floor
    floored: dict[str, float] = {}
    for t in AD_TYPES:
        if t not in active_types:
            floored[t] = 0.0
        else:
            floored[t] = max(raw_target[t], _MIN_FLOOR)

    target = _normalise(floored)

    # Clamp shifts from current allocation
    recommended = _clamp_shifts(current_alloc, target)
    # Re-floor after clamping
    for t in active_types:
        recommended[t] = max(recommended[t], _MIN_FLOOR)
    # Zero out inactive
    for t in AD_TYPES:
        if t not in active_types:
            recommended[t] = 0.0
    recommended = _normalise(recommended)

    # Build reasoning per type
    reasoning: dict[str, Any] = {}
    for t in AD_TYPES:
        m = metrics[t]
        roas = m.roas_14d
        util = m.utilization
        trend = m.trend
        rec_pct = recommended[t]
        cur_pct = current_alloc.get(t, 0.0)
        delta = rec_pct - cur_pct

        if not m.active:
            action = "inactive — no spend in last 14d"
        elif delta > 0.02:
            action = f"increase ({delta:+.0%}) — high efficiency ({efficiency.get(t, 0):.2f})"
        elif delta < -0.02:
            action = f"decrease ({delta:+.0%}) — lower efficiency ({efficiency.get(t, 0):.2f})"
        else:
            action = "hold — within tolerance"

        reasoning[t] = {
            "roas": roas,
            "utilization": util,
            "trend": trend,
            "efficiency_score": efficiency.get(t),
            "current_pct": round(cur_pct, 4),
            "recommended_pct": round(rec_pct, 4),
            "action": action,
        }

    return recommended, reasoning


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


async def generate_budget_allocations(
    session: AsyncSession,
    parent_asins: list[str] | None = None,
    total_daily_budget: float | None = None,
) -> list[dict[str, Any]]:
    """Calculate and persist budget allocation recommendations.

    Args:
        session: async DB session
        parent_asins: list of ASINs to process; if None, re-use all known ASINs
        total_daily_budget: override budget (applied to all ASINs); if None, uses last known

    Returns:
        List of summary dicts per allocation created.
    """
    today = date.today()

    # Determine which ASINs to process
    if parent_asins:
        asins = parent_asins
    else:
        # Find all ASINs that have budget allocation history
        stmt = text("SELECT DISTINCT parent_asin FROM budget_allocations")
        rows = (await session.exec(stmt)).all()  # type: ignore[arg-type]
        asins = [r.parent_asin for r in rows]
        if not asins:
            # If no history at all, we can't proceed without explicit ASINs
            logger.warning("budget_allocator: no known parent_asins, pass parent_asins explicitly")
            return []

    # Fetch global performance data (shared across all ASINs for now)
    metrics = await _fetch_performance(session, today)

    created: list[dict[str, Any]] = []

    for asin in asins:
        budget = total_daily_budget or await _get_last_budget(session, asin)
        current_alloc = await _get_current_alloc(session, asin) or dict(_DEFAULT_ALLOC)
        utilization = await _fetch_utilization(session, asin, today)

        # Ensure current_alloc has all keys
        for t in AD_TYPES:
            current_alloc.setdefault(t, _DEFAULT_ALLOC[t])

        recommended, reasoning = _build_recommendation(dict(metrics), utilization, current_alloc)

        row = BudgetAllocation(
            parent_asin=asin,
            total_daily_budget=Decimal(str(budget)),
            sp_pct=Decimal(str(round(current_alloc.get("sp", 0), 6))),
            sb_pct=Decimal(str(round(current_alloc.get("sb", 0), 6))),
            sd_pct=Decimal(str(round(current_alloc.get("sd", 0), 6))),
            sbv_pct=Decimal(str(round(current_alloc.get("sbv", 0), 6))),
            sp_actual_spend=Decimal("0"),
            sb_actual_spend=Decimal("0"),
            sd_actual_spend=Decimal("0"),
            sbv_actual_spend=Decimal("0"),
            alloc_date=today,
            created_at=utcnow(),
            # Phase 5 fields
            recommended_sp_pct=recommended.get("sp"),
            recommended_sb_pct=recommended.get("sb"),
            recommended_sd_pct=recommended.get("sd"),
            recommended_sbv_pct=recommended.get("sbv"),
            sp_roas=metrics["sp"].roas_14d,
            sb_roas=metrics["sb"].roas_14d,
            sd_roas=metrics["sd"].roas_14d,
            sbv_roas=metrics["sbv"].roas_14d,
            sp_utilization=utilization.get("sp"),
            sb_utilization=utilization.get("sb"),
            sd_utilization=utilization.get("sd"),
            sbv_utilization=utilization.get("sbv"),
            reasoning=json.dumps(reasoning),
            status="pending",
        )
        session.add(row)
        created.append({
            "parent_asin": asin,
            "total_daily_budget": budget,
            "current": {t: round(current_alloc[t], 4) for t in AD_TYPES},
            "recommended": {t: round(recommended[t], 4) for t in AD_TYPES},
            "reasoning": reasoning,
        })

    await session.commit()
    logger.info("budget_allocator: created %d allocation recs for %s", len(created), asins)
    return created
