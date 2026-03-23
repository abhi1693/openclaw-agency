"""Bid Optimization Engine v2 — Phase 2.

Multi-layer system:
  Layer 1: Keyword Tier Classification (keyword_scorer.py)
  Layer 2: Graduated Adjustment — only corrects a fraction of the ACoS gap per cycle
  Layer 3: Trend-informed signals fed into scorer (trend_analyzer.py)

Graduated adjustment formula
-----------------------------
    gap = (current_acos - target_acos) / target_acos

    if gap > 0:   # ACoS too high → decrease bid
        step = min(gap × damping_factor, max_step_down_pct)
        new_bid = current_bid × (1 − step)

    if gap < 0:   # ACoS below target → increase bid (more conservative)
        step = min(abs(gap) × damping_factor, max_step_up_pct)
        new_bid = current_bid × (1 + step)

Special handling
-----------------
- SPARSE keywords: never adjusted
- DRAIN keywords: use max_step_down_pct directly (skip gap formula)
- Launch mode: target ACoS relaxed ×1.5; max step-down capped at 5%
"""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.amazon_orders import AdMetric, SearchTermReport
from app.models.ppc_automation import BidRecommendation, PpcAutomationSettings
from app.services.keyword_scorer import KeywordTier, score_keyword
from app.services.tacos_calculator import calculate_tacos
from app.services.trend_analyzer import analyze_trends

logger = get_logger(__name__)

_ABSOLUTE_MIN_BID = Decimal("0.02")
_DEFAULT_AOV = Decimal("25.00")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _effective_target_acos(
    settings: PpcAutomationSettings,
    tacos_effective_ceiling: float | None = None,
) -> float:
    """Return effective target ACoS, factoring in launch mode and TACoS mode."""
    today = date.today()
    if settings.target_mode == "tacos" and tacos_effective_ceiling is not None:
        base = tacos_effective_ceiling
    else:
        base = float(settings.target_acos)
    if settings.launch_mode:
        if settings.launch_mode_until is None or today <= settings.launch_mode_until:
            return base * 1.5
    return base


def _compute_step(
    gap: float,
    direction: str,
    settings: PpcAutomationSettings,
    tier: KeywordTier,
) -> float:
    """Return signed fractional adjustment (+increase, −decrease). Returns 0 for no change."""
    today = date.today()
    in_launch = settings.launch_mode and (
        settings.launch_mode_until is None or today <= settings.launch_mode_until
    )

    if direction == "decrease" or gap > 0:
        if tier == KeywordTier.DRAIN:
            step = settings.max_step_down_pct
        else:
            step = min(abs(gap) * settings.damping_factor, settings.max_step_down_pct)
        if in_launch:
            step = min(step, 0.05)
        return -step
    elif direction == "increase" or gap < 0:
        step = min(abs(gap) * settings.damping_factor, settings.max_step_up_pct)
        return step
    return 0.0


def _apply_bounds(bid: Decimal, settings: PpcAutomationSettings) -> tuple[Decimal, str | None]:
    note: str | None = None
    if bid < settings.min_bid:
        bid = settings.min_bid
        note = f"min_bid floor ${float(settings.min_bid):.2f}"
    if bid > settings.max_bid:
        bid = settings.max_bid
        note = f"max_bid cap ${float(settings.max_bid):.2f}"
    bid = max(bid, _ABSOLUTE_MIN_BID)
    return bid.quantize(Decimal("0.0001")), note


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


async def _get_category_avg_cvr(session: AsyncSession) -> float:
    result = await session.exec(
        select(
            func.sum(SearchTermReport.orders).label("total_orders"),
            func.sum(SearchTermReport.clicks).label("total_clicks"),
        )
    )
    row = result.first()
    if row and row.total_clicks and row.total_clicks > 0:
        return round(row.total_orders / row.total_clicks, 6)
    return 0.08


async def _get_total_revenue(session: AsyncSession) -> float:
    result = await session.exec(select(func.sum(AdMetric.sales).label("total_sales")))
    row = result.first()
    return float(row.total_sales or 0) if row else 0.0


async def _get_aov(session: AsyncSession) -> Decimal:
    result = await session.exec(
        select(
            func.sum(AdMetric.sales).label("total_sales"),
            func.sum(AdMetric.orders).label("total_orders"),
        )
    )
    row = result.first()
    if row and row.total_orders and row.total_orders > 0 and row.total_sales:
        return (Decimal(str(row.total_sales)) / Decimal(str(row.total_orders))).quantize(Decimal("0.01"))
    return _DEFAULT_AOV


async def _get_settings(session: AsyncSession, parent_asin: str | None) -> PpcAutomationSettings | None:
    if parent_asin:
        result = await session.exec(
            select(PpcAutomationSettings).where(PpcAutomationSettings.parent_asin == parent_asin)
        )
        return result.first()
    result = await session.exec(select(PpcAutomationSettings).limit(1))
    return result.first()


async def _get_max_impressions(session: AsyncSession) -> int:
    stmt = text("""
        SELECT MAX(sub.ti) AS max_impr
        FROM (
            SELECT SUM(impressions) AS ti
            FROM search_term_reports
            WHERE keyword IS NOT NULL
            GROUP BY keyword
        ) sub
    """)
    result = (await session.exec(stmt)).first()  # type: ignore[arg-type]
    return int(result.max_impr or 1) if result and result.max_impr else 1


# ---------------------------------------------------------------------------
# Main public API
# ---------------------------------------------------------------------------


async def generate_bid_recommendations(
    session: AsyncSession,
    parent_asin: str | None = None,
) -> list[dict[str, Any]]:
    """Generate v2 BidRecommendation rows using tier scoring + graduated adjustment."""
    settings = await _get_settings(session, parent_asin)
    if settings is None:
        logger.warning("bid_optimizer_v2: no automation settings found, skipping")
        return []

    # TACoS mode: derive effective ACoS ceiling from TACoS target + organic fraction
    tacos_ceiling: float | None = None
    if settings.target_mode == "tacos" and settings.target_tacos:
        try:
            tacos_metrics = await calculate_tacos(
                session, days=30, target_tacos=settings.target_tacos
            )
            tacos_ceiling = tacos_metrics.effective_acos_ceiling
            logger.info(
                "bid_optimizer_v2: TACoS mode — target=%.2f%% organic=%.0f%% ceiling=%.2f%%",
                settings.target_tacos * 100,
                tacos_metrics.organic_pct * 100,
                (tacos_ceiling or 0) * 100,
            )
        except Exception:  # noqa: BLE001
            logger.exception("bid_optimizer_v2: failed to compute TACoS ceiling, falling back to ACoS mode")

    eff_target_acos = _effective_target_acos(settings, tacos_ceiling)
    category_avg_cvr = await _get_category_avg_cvr(session)
    total_revenue = await _get_total_revenue(session)
    max_impr = await _get_max_impressions(session)
    aov = await _get_aov(session)

    logger.info(
        "bid_optimizer_v2: target_acos=%.4f (eff=%.4f) damping=%.2f max_down=%.2f max_up=%.2f launch=%s",
        float(settings.target_acos), eff_target_acos,
        settings.damping_factor, settings.max_step_down_pct, settings.max_step_up_pct,
        settings.launch_mode,
    )

    stmt = text("""
        SELECT
            campaign_id,
            ad_group_id,
            keyword          AS keyword_text,
            match_type,
            SUM(clicks)      AS total_clicks,
            SUM(orders)      AS total_orders,
            SUM(impressions) AS total_impr,
            SUM(spend)       AS total_spend,
            SUM(sales)       AS total_sales
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

    for row in rows:
        campaign_id = row.campaign_id
        ad_group_id = row.ad_group_id
        keyword_text = row.keyword_text
        match_type = row.match_type or "broad"
        clicks = int(row.total_clicks or 0)
        orders = int(row.total_orders or 0)
        spend = float(row.total_spend or 0)
        sales = float(row.total_sales or 0)
        impressions = int(row.total_impr or 0)

        if clicks == 0:
            continue

        # Trend signals
        cvr_recent = cvr_prior = cpc_recent = cpc_prior = None
        cvr_trend_ratio = None
        try:
            trend = await analyze_trends(session, keyword_text, campaign_id=campaign_id)
            cvr_recent = trend.w7.cvr
            cvr_prior = trend.w14.cvr
            cpc_recent = trend.w7.cpc
            cpc_prior = trend.w14.cpc
            cvr_trend_ratio = trend.cvr_trend_7v14
        except Exception:  # noqa: BLE001
            pass

        # Score + tier
        scored = score_keyword(
            clicks=clicks,
            orders=orders,
            spend=spend,
            sales=sales,
            target_acos=eff_target_acos,
            category_avg_cvr=category_avg_cvr,
            total_revenue=total_revenue,
            cvr_recent=cvr_recent,
            cvr_prior=cvr_prior,
            cpc_recent=cpc_recent,
            cpc_prior=cpc_prior,
            impressions_recent=impressions,
            max_impressions_in_set=max_impr,
        )

        # SPARSE → skip (never adjust)
        if scored.tier == KeywordTier.SPARSE:
            continue

        # Current bid proxy
        current_bid = Decimal(str(round(spend / clicks, 4))) if clicks > 0 else Decimal("0.50")
        current_bid = max(current_bid, _ABSOLUTE_MIN_BID)

        # Gap (using effective target)
        current_acos: float | None = spend / sales if sales > 0 else None
        gap = (current_acos - eff_target_acos) / eff_target_acos if current_acos else (1.0 if orders == 0 else 0.0)

        step_frac = _compute_step(gap, scored.direction, settings, scored.tier)
        if step_frac == 0.0:
            continue

        raw_recommended = float(current_bid) * (1.0 + step_frac)
        recommended_bid = Decimal(str(round(raw_recommended, 4)))
        recommended_bid, bound_note = _apply_bounds(recommended_bid, settings)

        # Skip trivial changes < 1%
        if float(current_bid) > 0 and abs(float(recommended_bid - current_bid) / float(current_bid)) < 0.01:
            continue

        # Skip if pending rec exists for this keyword
        existing = await session.exec(
            select(BidRecommendation)
            .where(BidRecommendation.campaign_id == campaign_id)
            .where(BidRecommendation.match_type == match_type)
            .where(BidRecommendation.status == "pending")
        )
        if existing.first() is not None:
            continue

        # Rich reason JSON
        next_cycle_approx = float(recommended_bid) * (1.0 + step_frac)
        reason_data: dict[str, Any] = {
            "tier": scored.tier.value,
            "score": scored.score,
            "signals": {
                "acos_efficiency": round(scored.signals.acos_efficiency, 4),
                "conversion_trend": round(scored.signals.conversion_trend, 4),
                "revenue_contribution": round(scored.signals.revenue_contribution, 4),
                "cpc_trend": round(scored.signals.cpc_trend, 4),
                "impression_share": round(scored.signals.impression_share, 4),
            },
            "gap_pct": round(gap, 4),
            "damping_factor": settings.damping_factor,
            "raw_step_pct": round(abs(step_frac), 4),
            "applied_step_pct": round(abs(step_frac), 4),
            "current_acos": round(current_acos, 4) if current_acos is not None else None,
            "target_acos": round(eff_target_acos, 4),
            "trend_7d_vs_14d_cvr": round(cvr_trend_ratio, 4) if cvr_trend_ratio is not None else None,
            "next_cycle_approx": round(next_cycle_approx, 4),
        }
        if bound_note:
            reason_data["bound_note"] = bound_note

        rec = BidRecommendation(
            campaign_id=campaign_id,
            ad_group_id=ad_group_id,
            keyword_id=None,
            match_type=match_type,
            current_bid=current_bid,
            recommended_bid=recommended_bid,
            conversion_rate=Decimal(str(round(orders / clicks, 6))) if clicks > 0 else None,
            target_acos=settings.target_acos,
            aov=aov,
            reason=json.dumps(reason_data),
            status="pending",
            created_at=utcnow(),
        )
        session.add(rec)
        created.append({
            "campaign_id": campaign_id,
            "keyword": keyword_text,
            "match_type": match_type,
            "tier": scored.tier.value,
            "score": scored.score,
            "current_bid": float(current_bid),
            "recommended_bid": float(recommended_bid),
            "step_pct": round(step_frac * 100, 2),
        })

    await session.commit()
    logger.info(
        "bid_optimizer_v2: created %d recs (star=%d stable=%d watch=%d drain=%d)",
        len(created),
        sum(1 for r in created if r.get("tier") == "star"),
        sum(1 for r in created if r.get("tier") == "stable"),
        sum(1 for r in created if r.get("tier") == "watch"),
        sum(1 for r in created if r.get("tier") == "drain"),
    )
    return created
