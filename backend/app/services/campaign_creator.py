"""Campaign Auto-Creation Service — Phase 6.

Generates a structured CampaignPlan for a parent ASIN:
  SP Auto       — automatic targeting, 4 strategies
  SP Exact      — manual exact-match keywords from discovery
  SP Phrase     — manual phrase-match keywords from discovery
  SP Broad      — manual broad-match keywords from discovery
  SB Brand      — Sponsored Brands headline search
  SD Retarget   — Sponsored Display audience retargeting

Seeds keywords from KeywordRecommendation(action='add_keyword', confidence >= 0.50).
Initial bid = avg CPC from AdMetric × 1.10, clamped to [min_bid, max_bid].
Budget split comes from latest BudgetAllocation.recommended_*_pct for the ASIN,
falling back to {SP:70%, SB:15%, SD:10%}.
Total daily budget defaults to last known BudgetAllocation.total_daily_budget or $50.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.ppc_automation import (
    BudgetAllocation,
    CampaignPlan,
    KeywordRecommendation,
    PpcAutomationSettings,
)

logger = get_logger(__name__)

_DEFAULT_MIN_BID = 0.10
_DEFAULT_MAX_BID = 3.00
_DEFAULT_BID = 0.50
_DEFAULT_BUDGET = 50.0
_DEFAULT_ALLOC = {"sp": 0.70, "sb": 0.15, "sd": 0.10}
_KW_CONFIDENCE_THRESHOLD = 0.50
_LOOKBACK_DAYS = 30
_BID_CPC_MULTIPLIER = 1.10  # start 10% above avg CPC for delivery


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------


async def _get_avg_cpc(session: AsyncSession) -> float:
    cutoff = date.today() - timedelta(days=_LOOKBACK_DAYS)
    stmt = text("""
        SELECT
            SUM(spend)  AS total_spend,
            SUM(clicks) AS total_clicks
        FROM ad_metrics
        WHERE report_date >= :cutoff
          AND clicks > 0
    """)
    row = (await session.exec(stmt, params={"cutoff": cutoff})).first()  # type: ignore[arg-type]
    if row and row.total_clicks and float(row.total_clicks) > 0:
        return round(float(row.total_spend or 0) / float(row.total_clicks), 4)
    return _DEFAULT_BID


async def _get_bid_bounds(session: AsyncSession, parent_asin: str) -> tuple[float, float]:
    result = await session.exec(
        select(PpcAutomationSettings).where(PpcAutomationSettings.parent_asin == parent_asin)
    )
    settings = result.first()
    if settings:
        return float(settings.min_bid), float(settings.max_bid)
    return _DEFAULT_MIN_BID, _DEFAULT_MAX_BID


async def _get_budget_split(
    session: AsyncSession, parent_asin: str
) -> tuple[float, dict[str, float]]:
    stmt = (
        select(BudgetAllocation)
        .where(BudgetAllocation.parent_asin == parent_asin)
        .order_by(col(BudgetAllocation.alloc_date).desc())
    )
    row = (await session.exec(stmt)).first()
    if row is None:
        return _DEFAULT_BUDGET, dict(_DEFAULT_ALLOC)
    total = float(row.total_daily_budget)
    alloc = {
        "sp": float(row.recommended_sp_pct or row.sp_pct or _DEFAULT_ALLOC["sp"]),
        "sb": float(row.recommended_sb_pct or row.sb_pct or _DEFAULT_ALLOC["sb"]),
        "sd": float(row.recommended_sd_pct or row.sd_pct or _DEFAULT_ALLOC["sd"]),
    }
    return total, alloc


async def _get_seed_keywords(session: AsyncSession) -> list[dict[str, Any]]:
    result = await session.exec(
        select(KeywordRecommendation)
        .where(KeywordRecommendation.action == "add_keyword")
        .where(KeywordRecommendation.confidence >= _KW_CONFIDENCE_THRESHOLD)
        .where(KeywordRecommendation.status == "pending")
        .order_by(col(KeywordRecommendation.confidence).desc())
        .limit(200)
    )
    return [
        {
            "keyword": r.search_term,
            "confidence": r.confidence,
            "match_type_recommendation": r.match_type_recommendation or "exact",
        }
        for r in result.all()
    ]


# ---------------------------------------------------------------------------
# Plan builder
# ---------------------------------------------------------------------------


def _kw_entry(kw: dict[str, Any], match: str, bid: float) -> dict[str, Any]:
    return {"keyword_text": kw["keyword"], "match_type": match, "bid": bid}


def _build_plan(
    parent_asin: str,
    keywords: list[dict[str, Any]],
    initial_bid: float,
    total_budget: float,
    alloc: dict[str, float],
) -> dict[str, Any]:
    sp_budget = round(total_budget * alloc.get("sp", 0.70), 2)
    sb_budget = round(total_budget * alloc.get("sb", 0.15), 2)
    sd_budget = round(total_budget * alloc.get("sd", 0.10), 2)

    # Split SP budget: Auto 30%, Exact 35%, Phrase 20%, Broad 15%
    sp_auto_budget   = round(sp_budget * 0.30, 2)
    sp_exact_budget  = round(sp_budget * 0.35, 2)
    sp_phrase_budget = round(sp_budget * 0.20, 2)
    sp_broad_budget  = round(sp_budget - sp_auto_budget - sp_exact_budget - sp_phrase_budget, 2)

    exact_kws  = [k for k in keywords if k["match_type_recommendation"] == "exact"][:50]
    phrase_kws = [k for k in keywords if k["match_type_recommendation"] == "phrase"][:50]
    broad_kws  = [k for k in keywords if k["match_type_recommendation"] == "broad"][:30]

    # If discovery produced no type-split, put all into exact
    if not exact_kws and not phrase_kws and not broad_kws:
        exact_kws = keywords[:50]

    broad_bid = round(initial_bid * 0.75, 4)   # broad starts lower
    sd_bid    = round(initial_bid * 0.50, 4)   # SD CPM/CPC typically lower

    campaigns = [
        {
            "campaign_type": "SP",
            "targeting_type": "auto",
            "campaign_name": f"{parent_asin} | SP Auto",
            "daily_budget": sp_auto_budget,
            "ad_groups": [
                {
                    "name": "Auto All",
                    "default_bid": initial_bid,
                    "targeting": [
                        {"strategy": "close_match"},
                        {"strategy": "loose_match"},
                        {"strategy": "substitutes"},
                        {"strategy": "complements"},
                    ],
                }
            ],
        },
        {
            "campaign_type": "SP",
            "targeting_type": "manual",
            "match_type": "exact",
            "campaign_name": f"{parent_asin} | SP Exact",
            "daily_budget": sp_exact_budget,
            "ad_groups": [
                {
                    "name": "Exact Match",
                    "default_bid": initial_bid,
                    "keywords": [_kw_entry(k, "exact", initial_bid) for k in exact_kws],
                }
            ],
        },
        {
            "campaign_type": "SP",
            "targeting_type": "manual",
            "match_type": "phrase",
            "campaign_name": f"{parent_asin} | SP Phrase",
            "daily_budget": sp_phrase_budget,
            "ad_groups": [
                {
                    "name": "Phrase Match",
                    "default_bid": initial_bid,
                    "keywords": [_kw_entry(k, "phrase", initial_bid) for k in phrase_kws],
                }
            ],
        },
        {
            "campaign_type": "SP",
            "targeting_type": "manual",
            "match_type": "broad",
            "campaign_name": f"{parent_asin} | SP Broad",
            "daily_budget": sp_broad_budget,
            "ad_groups": [
                {
                    "name": "Broad Match",
                    "default_bid": broad_bid,
                    "keywords": [_kw_entry(k, "broad", broad_bid) for k in broad_kws],
                }
            ],
        },
        {
            "campaign_type": "SB",
            "targeting_type": "keyword",
            "campaign_name": f"{parent_asin} | SB Brand",
            "daily_budget": sb_budget,
            "ad_groups": [
                {
                    "name": "Brand Headlines",
                    "default_bid": initial_bid,
                    "keywords": [_kw_entry(k, "exact", initial_bid) for k in exact_kws[:20]],
                }
            ],
        },
        {
            "campaign_type": "SD",
            "targeting_type": "audience",
            "campaign_name": f"{parent_asin} | SD Retarget",
            "daily_budget": sd_budget,
            "ad_groups": [
                {
                    "name": "Retargeting",
                    "default_bid": sd_bid,
                    "targeting": [
                        {
                            "tactic": "T00030",
                            "description": "Retarget shoppers who viewed product detail pages",
                        }
                    ],
                }
            ],
        },
    ]

    return {
        "parent_asin": parent_asin,
        "generated_date": date.today().isoformat(),
        "total_daily_budget": total_budget,
        "initial_bid": initial_bid,
        "campaigns": campaigns,
        "keyword_seed_count": len(keywords),
        "notes": (
            f"Keywords sourced from discovery engine (confidence >= {_KW_CONFIDENCE_THRESHOLD}). "
            "Bids are initial estimates — review carefully before applying."
        ),
    }


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


async def generate_campaign_plan(
    session: AsyncSession,
    parent_asin: str,
    total_daily_budget: float | None = None,
) -> dict[str, Any]:
    """Generate and persist a CampaignPlan for the given parent ASIN.

    Args:
        session: async DB session
        parent_asin: Amazon parent ASIN to build campaigns for
        total_daily_budget: optional total budget override (USD/day)

    Returns:
        Summary dict with plan_id, campaign_count, and budget details.
    """
    avg_cpc = await _get_avg_cpc(session)
    min_bid, max_bid = await _get_bid_bounds(session, parent_asin)
    budget, alloc = await _get_budget_split(session, parent_asin)
    keywords = await _get_seed_keywords(session)

    if total_daily_budget is not None:
        budget = total_daily_budget

    raw_bid = avg_cpc * _BID_CPC_MULTIPLIER
    initial_bid = round(max(min_bid, min(raw_bid, max_bid)), 4)

    plan_json = _build_plan(parent_asin, keywords, initial_bid, budget, alloc)
    campaign_count = len(plan_json["campaigns"])

    row = CampaignPlan(
        parent_asin=parent_asin,
        plan=json.dumps(plan_json),
        campaign_count=campaign_count,
        total_daily_budget=budget,
        status="draft",
        created_at=utcnow(),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)

    logger.info(
        "campaign_creator: plan %s — %s — %d campaigns, %d kw seeds, $%.2f/day",
        row.id, parent_asin, campaign_count, len(keywords), budget,
    )

    return {
        "plan_id": str(row.id),
        "parent_asin": parent_asin,
        "campaign_count": campaign_count,
        "total_daily_budget": budget,
        "initial_bid": initial_bid,
        "keyword_seed_count": len(keywords),
        "status": "draft",
    }
