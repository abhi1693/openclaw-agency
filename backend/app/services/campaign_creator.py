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
import re
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

# Keyword max length — longer strings are likely product titles, not search queries
_KW_MAX_LEN = 80
_KW_MIN_LEN = 3
# ASIN-like pattern: B0 followed by 8+ alphanumeric chars
_ASIN_RE = re.compile(r"^[Bb]0[A-Za-z0-9]{8,}$")
_DEFAULT_BID = 0.50
_DEFAULT_BUDGET = 50.0
_DEFAULT_ALLOC = {"sp": 0.70, "sb": 0.15, "sd": 0.10}
_KW_CONFIDENCE_THRESHOLD = 0.50
_LOOKBACK_DAYS = 30
_BID_CPC_MULTIPLIER = 1.10  # start 10% above avg CPC for delivery


# ---------------------------------------------------------------------------
# Keyword quality filters
# ---------------------------------------------------------------------------


def _is_valid_keyword(kw: str) -> bool:
    """Return True if kw is a usable US-marketplace keyword (not garbage)."""
    kw = kw.strip()
    # Must be ASCII — non-ASCII (Chinese, Japanese, etc.) not useful for US marketplace
    if not kw.isascii():
        return False
    # Unicode replacement character (\ufffc and variants often appear in corrupted data)
    if "\ufffc" in kw or "\ufffd" in kw:
        return False
    # ASIN-like strings belong in product targeting, not keyword targeting
    if _ASIN_RE.match(kw):
        return False
    # Too long — likely a full product title that no one searches verbatim
    if len(kw) > _KW_MAX_LEN:
        return False
    # Too short — not a useful keyword
    if len(kw) < _KW_MIN_LEN:
        return False
    return True


def _extract_product_targets(keywords: list[dict[str, Any]]) -> list[str]:
    """Extract ASIN-like strings from keyword list for product targeting."""
    targets = []
    for k in keywords:
        kw = k["keyword"].strip()
        if _ASIN_RE.match(kw):
            targets.append(kw.upper())
    return list(dict.fromkeys(targets))  # dedupe preserving order


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
        .limit(500)  # fetch more, then filter down
    )
    raw = result.all()

    seen: set[str] = set()
    cleaned: list[dict[str, Any]] = []
    for r in raw:
        kw = r.search_term.strip().lower()
        if not _is_valid_keyword(kw):
            continue
        if kw in seen:
            continue
        seen.add(kw)
        cleaned.append({
            "keyword": kw,
            "confidence": r.confidence,
            "match_type_recommendation": r.match_type_recommendation or "exact",
        })
        if len(cleaned) >= 200:
            break

    skipped = len(raw) - len(cleaned)
    if skipped > 0:
        logger.info("campaign_creator: filtered out %d low-quality keywords (non-ASCII, ASIN, too long/short)", skipped)

    return cleaned


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
    product_targets: list[str] | None = None,
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

    # SP Product Targeting if we have ASIN targets from discovery
    if product_targets:
        # Use remaining budget from SP (fits within the broad bucket)
        sp_pt_budget = round(sp_broad_budget * 0.50, 2)
        campaigns.append({
            "campaign_type": "SP",
            "targeting_type": "product",
            "campaign_name": f"{parent_asin} | SP Product Target",
            "daily_budget": sp_pt_budget,
            "ad_groups": [
                {
                    "name": "Product Targets",
                    "default_bid": initial_bid,
                    "targets": [{"asin": a} for a in product_targets[:50]],
                }
            ],
        })

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

    # Fetch raw recommendations including ASIN-like terms (before sanitization)
    raw_result = await session.exec(
        select(KeywordRecommendation)
        .where(KeywordRecommendation.action == "add_keyword")
        .where(KeywordRecommendation.confidence >= _KW_CONFIDENCE_THRESHOLD)
        .where(KeywordRecommendation.status == "pending")
        .limit(500)
    )
    raw_recs = [{"keyword": r.search_term.strip(), "confidence": r.confidence, "match_type_recommendation": r.match_type_recommendation or "exact"} for r in raw_result.all()]
    product_targets = _extract_product_targets(raw_recs)

    keywords = await _get_seed_keywords(session)

    if total_daily_budget is not None:
        budget = total_daily_budget

    raw_bid = avg_cpc * _BID_CPC_MULTIPLIER
    initial_bid = round(max(min_bid, min(raw_bid, max_bid)), 4)

    plan_json = _build_plan(parent_asin, keywords, initial_bid, budget, alloc, product_targets)
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
