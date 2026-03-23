"""Keyword Discovery Service — Phase 3.

Analyzes search term reports to surface:
  - add_keyword: search terms from auto/manual campaigns with positive signals
  - add_negative: search terms with enough clicks and zero orders (waste)

Confidence scoring
------------------
  base = 0.30
  + 0.30  if orders > 0
  + 0.20  if observed CVR > category average CVR
  + 0.15  if CTR > 1.5× category average CTR
  + 0.10  if clicks > 50 (sufficient data volume)
  = max 1.05, clamped to 1.0

Confidence tiers → match type recommendation
  HIGH   ≥ 0.80  → exact
  MEDIUM ≥ 0.50  → phrase
  LOW    ≥ 0.30  → broad

Deduplication
-------------
  Skips any search_term that already appears as a targeted keyword in
  search_term_reports.keyword column (i.e. it is already being bid on).
  Also skips terms with an existing pending rec of the same action.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy import func, text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.amazon_orders import SearchTermReport
from app.models.ppc_automation import KeywordRecommendation

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_NEGATIVE_MIN_CLICKS = 10
_MAX_ROWS = 1000

_CONF_HIGH = 0.80
_CONF_MEDIUM = 0.50
_CONF_LOW = 0.30


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class KeywordCandidate:
    search_term: str
    campaign_id: str
    campaign_name: str
    ad_group_id: str | None
    match_type: str
    impressions: int
    clicks: int
    orders: int
    spend: Decimal
    sales: Decimal
    ctr: Decimal
    cvr: Decimal
    acos: Decimal | None
    confidence: float
    confidence_level: ConfidenceLevel
    match_type_recommendation: str
    source: str
    evidence: dict[str, Any]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_category_avg_ctr(session: AsyncSession) -> Decimal:
    result = await session.exec(
        select(
            func.sum(SearchTermReport.clicks).label("total_clicks"),
            func.sum(SearchTermReport.impressions).label("total_impressions"),
        )
    )
    row = result.first()
    if row and row.total_impressions and row.total_impressions > 0:
        return Decimal(str(round(row.total_clicks / row.total_impressions, 6)))
    return Decimal("0.003")


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


async def _get_active_keyword_targets(session: AsyncSession) -> set[str]:
    """Return the set of search terms already targeted as bid keywords."""
    stmt = text("""
        SELECT DISTINCT keyword
        FROM search_term_reports
        WHERE keyword IS NOT NULL AND keyword != ''
    """)
    result = (await session.exec(stmt)).all()  # type: ignore[arg-type]
    return {row.keyword.lower() for row in result}


async def _already_pending(session: AsyncSession, search_term: str, action: str) -> bool:
    result = await session.exec(
        select(KeywordRecommendation)
        .where(KeywordRecommendation.search_term == search_term)
        .where(KeywordRecommendation.action == action)
        .where(KeywordRecommendation.status == "pending")
    )
    return result.first() is not None


def _compute_confidence(
    *,
    orders: int,
    clicks: int,
    cvr: float,
    category_avg_cvr: float,
    ctr: float,
    category_avg_ctr: float,
) -> float:
    score = 0.30
    if orders > 0:
        score += 0.30
    if cvr > category_avg_cvr:
        score += 0.20
    if category_avg_ctr > 0 and ctr > category_avg_ctr * 1.5:
        score += 0.15
    if clicks > 50:
        score += 0.10
    return round(min(score, 1.0), 4)


def _match_type_from_confidence(confidence: float) -> str:
    if confidence >= _CONF_HIGH:
        return "exact"
    if confidence >= _CONF_MEDIUM:
        return "phrase"
    return "broad"


def _confidence_level(confidence: float) -> ConfidenceLevel:
    if confidence >= _CONF_HIGH:
        return ConfidenceLevel.HIGH
    if confidence >= _CONF_MEDIUM:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------


async def generate_keyword_recommendations(
    session: AsyncSession,
) -> list[dict[str, Any]]:
    """Analyze search term reports and generate keyword recommendations.

    Returns summary list of created recommendations.
    """
    category_avg_ctr = await _get_category_avg_ctr(session)
    category_avg_cvr = await _get_category_avg_cvr(session)
    active_targets = await _get_active_keyword_targets(session)

    logger.info(
        "keyword_discoverer: category_avg_ctr=%.6f category_avg_cvr=%.6f active_targets=%d",
        float(category_avg_ctr), category_avg_cvr, len(active_targets),
    )

    stmt = text("""
        SELECT
            search_term,
            campaign_id,
            campaign_name,
            ad_group_id,
            match_type,
            SUM(impressions)  AS total_impressions,
            SUM(clicks)       AS total_clicks,
            SUM(orders)       AS total_orders,
            SUM(spend)        AS total_spend,
            SUM(sales)        AS total_sales
        FROM search_term_reports
        WHERE search_term IS NOT NULL
          AND search_term != ''
        GROUP BY search_term, campaign_id, campaign_name, ad_group_id, match_type
        ORDER BY SUM(clicks) DESC
        LIMIT :max_rows
    """)
    rows = (await session.exec(stmt, params={"max_rows": _MAX_ROWS})).all()  # type: ignore[arg-type]

    created: list[dict[str, Any]] = []

    for row in rows:
        search_term = row.search_term
        campaign_id = row.campaign_id or ""
        campaign_name = row.campaign_name or ""
        ad_group_id = row.ad_group_id
        match_type = row.match_type or "broad"
        impressions = int(row.total_impressions or 0)
        clicks = int(row.total_clicks or 0)
        orders = int(row.total_orders or 0)
        spend = Decimal(str(row.total_spend or 0))
        sales = Decimal(str(row.total_sales or 0))

        ctr_float = clicks / impressions if impressions > 0 else 0.0
        cvr_float = orders / clicks if clicks > 0 else 0.0
        ctr = Decimal(str(round(ctr_float, 6)))
        cvr = Decimal(str(round(cvr_float, 6)))
        acos = (spend / sales).quantize(Decimal("0.0001")) if sales > 0 else None

        # ── Candidate: add_keyword ──────────────────────────────────────────
        is_auto = "auto" in campaign_name.lower()
        qualifies_add = is_auto and (orders > 0 or (impressions > 0 and ctr > category_avg_ctr))

        # Skip if already an active target
        is_active_target = search_term.lower() in active_targets

        if qualifies_add and not is_active_target and not await _already_pending(session, search_term, "add_keyword"):
            confidence = _compute_confidence(
                orders=orders,
                clicks=clicks,
                cvr=cvr_float,
                category_avg_cvr=category_avg_cvr,
                ctr=ctr_float,
                category_avg_ctr=float(category_avg_ctr),
            )
            conf_level = _confidence_level(confidence)
            match_rec = _match_type_from_confidence(confidence)
            source = "auto_campaign"
            evidence = {
                "campaign_name": campaign_name,
                "impressions": impressions,
                "clicks": clicks,
                "orders": orders,
                "spend": float(spend),
                "sales": float(sales),
                "ctr": round(ctr_float, 6),
                "cvr": round(cvr_float, 6),
                "category_avg_ctr": round(float(category_avg_ctr), 6),
                "category_avg_cvr": round(category_avg_cvr, 6),
                "already_targeted": False,
            }

            rec = KeywordRecommendation(
                source_campaign_id=campaign_id,
                search_term=search_term,
                match_type=match_rec,
                impressions=impressions,
                clicks=clicks,
                orders=orders,
                ctr=ctr if ctr > 0 else None,
                conversion_rate=cvr if cvr > 0 else None,
                acos=acos,
                action="add_keyword",
                target_campaign_id=None,
                status="pending",
                created_at=utcnow(),
                confidence=confidence,
                source=source,
                evidence=json.dumps(evidence),
                match_type_recommendation=match_rec,
                pattern_group=None,
            )
            session.add(rec)
            created.append({
                "action": "add_keyword",
                "search_term": search_term,
                "campaign": campaign_name,
                "clicks": clicks,
                "orders": orders,
                "confidence": confidence,
                "confidence_level": conf_level.value,
                "match_type_recommendation": match_rec,
            })

        # ── Candidate: add_negative ──────────────────────────────────────────
        qualifies_negative = clicks >= _NEGATIVE_MIN_CLICKS and orders == 0

        if qualifies_negative and not await _already_pending(session, search_term, "add_negative"):
            # Confidence for negatives: higher spend/clicks = more confident
            neg_confidence = min(0.30 + (clicks / 100) * 0.30 + (float(spend) / 50) * 0.20, 1.0)
            neg_confidence = round(neg_confidence, 4)
            evidence = {
                "campaign_name": campaign_name,
                "impressions": impressions,
                "clicks": clicks,
                "spend": float(spend),
                "ctr": round(ctr_float, 6),
                "zero_orders": True,
            }

            rec = KeywordRecommendation(
                source_campaign_id=campaign_id,
                search_term=search_term,
                match_type="exact",
                impressions=impressions,
                clicks=clicks,
                orders=0,
                ctr=ctr if ctr > 0 else None,
                conversion_rate=Decimal("0"),
                acos=None,
                action="add_negative",
                target_campaign_id=campaign_id,
                status="pending",
                created_at=utcnow(),
                confidence=neg_confidence,
                source="search_term_mining",
                evidence=json.dumps(evidence),
                match_type_recommendation="exact",
                pattern_group=None,
            )
            session.add(rec)
            created.append({
                "action": "add_negative",
                "search_term": search_term,
                "campaign": campaign_name,
                "clicks": clicks,
                "spend": float(spend),
                "confidence": neg_confidence,
            })

    await session.commit()
    logger.info(
        "keyword_discoverer: created %d recommendations (%d add, %d negative)",
        len(created),
        sum(1 for r in created if r["action"] == "add_keyword"),
        sum(1 for r in created if r["action"] == "add_negative"),
    )
    return created
