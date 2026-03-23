"""Negative Pattern Detector — Phase 3.

Groups zero-conversion search terms by shared root word and identifies
high-spend patterns that warrant phrase-level negative keywords.

Algorithm
---------
1. Query all search terms with clicks >= MIN_CLICKS_PER_TERM and orders == 0.
2. Extract the "dominant token" for each term:
   - Split on whitespace, drop stop words (the/a/an/for/with/in/of/to/and/or)
   - Take the longest remaining token if len >= 4
   - Fallback: first 4 chars of the full term (lowercased)
3. Group by dominant token (pattern root).
4. Clusters with >= MIN_TERMS_IN_CLUSTER unique terms AND total wasted spend
   >= MIN_WASTED_SPEND → create one KeywordRecommendation with:
     - action = "add_negative"
     - match_type = "phrase"
     - source = "pattern_detector"
     - search_term = the pattern root
     - pattern_group = the pattern root
     - confidence = f(term_count, spend)
     - evidence = JSON with matched_terms, total_spend, total_clicks, term_count
5. Skip if a pending pattern_detector rec already exists for this pattern root.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.ppc_automation import KeywordRecommendation

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------

_MIN_CLICKS_PER_TERM = 5       # min clicks for a term to count toward a cluster
_MIN_TERMS_IN_CLUSTER = 3      # cluster must have at least this many unique terms
_MIN_WASTED_SPEND = 20.0       # USD — total wasted spend across the cluster
_MAX_TERMS_TO_SCAN = 2000

_STOP_WORDS = frozenset(
    "the a an for with in of to and or is are was be by on at".split()
)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class NegativePattern:
    pattern_root: str
    matched_terms: list[str]
    total_spend: float
    total_clicks: int
    term_count: int
    recommended_match_type: str = "phrase"
    confidence: float = 0.0
    evidence: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _dominant_token(search_term: str) -> str:
    """Extract the most representative token from a multi-word search term."""
    tokens = re.split(r"\s+", search_term.lower().strip())
    meaningful = [t for t in tokens if t not in _STOP_WORDS and len(t) >= 4]
    if meaningful:
        return max(meaningful, key=len)  # longest meaningful token
    if tokens:
        return tokens[0][:4]
    return search_term[:4]


def _compute_pattern_confidence(term_count: int, total_spend: float) -> float:
    """Higher confidence for larger clusters and more wasted spend."""
    base = 0.50
    term_bonus = min((term_count - _MIN_TERMS_IN_CLUSTER) * 0.05, 0.25)
    spend_bonus = min((total_spend - _MIN_WASTED_SPEND) / 100.0 * 0.25, 0.25)
    return round(min(base + term_bonus + spend_bonus, 1.0), 4)


async def _pattern_root_already_pending(session: AsyncSession, pattern_root: str) -> bool:
    result = await session.exec(
        select(KeywordRecommendation)
        .where(KeywordRecommendation.pattern_group == pattern_root)
        .where(KeywordRecommendation.source == "pattern_detector")
        .where(KeywordRecommendation.status == "pending")
    )
    return result.first() is not None


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------


async def detect_negative_patterns(
    session: AsyncSession,
) -> list[dict[str, Any]]:
    """Detect and store phrase-negative pattern recommendations.

    Returns summary list of created recommendations.
    """
    stmt = text("""
        SELECT
            search_term,
            campaign_id,
            SUM(clicks) AS total_clicks,
            SUM(spend)  AS total_spend
        FROM search_term_reports
        WHERE search_term IS NOT NULL
          AND search_term != ''
        GROUP BY search_term, campaign_id
        HAVING SUM(orders) = 0
           AND SUM(clicks) >= :min_clicks
        ORDER BY SUM(spend) DESC
        LIMIT :max_rows
    """)
    rows = (
        await session.exec(stmt, params={"min_clicks": _MIN_CLICKS_PER_TERM, "max_rows": _MAX_TERMS_TO_SCAN})
    ).all()  # type: ignore[arg-type]

    # Build cluster map: root → list of (search_term, campaign_id, clicks, spend)
    clusters: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        root = _dominant_token(row.search_term)
        clusters.setdefault(root, []).append({
            "term": row.search_term,
            "campaign_id": row.campaign_id or "",
            "clicks": int(row.total_clicks or 0),
            "spend": float(row.total_spend or 0),
        })

    created: list[dict[str, Any]] = []

    for root, members in clusters.items():
        unique_terms = list({m["term"] for m in members})
        if len(unique_terms) < _MIN_TERMS_IN_CLUSTER:
            continue

        total_spend = sum(m["spend"] for m in members)
        total_clicks = sum(m["clicks"] for m in members)
        if total_spend < _MIN_WASTED_SPEND:
            continue

        if await _pattern_root_already_pending(session, root):
            continue

        term_count = len(unique_terms)
        confidence = _compute_pattern_confidence(term_count, total_spend)

        # Pick the campaign_id with the most spend to associate
        top_campaign = max(members, key=lambda m: m["spend"])["campaign_id"]

        evidence: dict[str, Any] = {
            "pattern_root": root,
            "matched_terms": sorted(unique_terms),
            "term_count": term_count,
            "total_spend": round(total_spend, 2),
            "total_clicks": total_clicks,
            "rule": f">={_MIN_TERMS_IN_CLUSTER} terms, ${total_spend:.2f} wasted",
        }

        rec = KeywordRecommendation(
            source_campaign_id=top_campaign,
            search_term=root,
            match_type="phrase",
            impressions=0,
            clicks=total_clicks,
            orders=0,
            ctr=None,
            conversion_rate=Decimal("0"),
            acos=None,
            action="add_negative",
            target_campaign_id=top_campaign,
            status="pending",
            created_at=utcnow(),
            confidence=confidence,
            source="pattern_detector",
            evidence=json.dumps(evidence),
            match_type_recommendation="phrase",
            pattern_group=root,
        )
        session.add(rec)
        created.append({
            "pattern_root": root,
            "term_count": term_count,
            "total_spend": round(total_spend, 2),
            "total_clicks": total_clicks,
            "confidence": confidence,
        })

    await session.commit()
    logger.info(
        "negative_pattern_detector: created %d pattern-negative recs from %d clusters scanned",
        len(created), len(clusters),
    )
    return created
