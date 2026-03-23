"""Negative Pattern Detector — Phase 3 (safety-hardened).

Groups zero-conversion search terms by shared root word and identifies
high-spend patterns that warrant phrase-level negative keywords.

Safety guards added:
  1. MIN_DATA_DAYS gate: abort if < 7 distinct report dates (prevents
     single-day false positives like the "sanitizer" incident).
  2. Protected roots: never negate roots that appear as actively-targeted
     keywords OR are listed in PpcAutomationSettings.protected_keywords.
  3. Per-term spend threshold: each individual term must have >= $5 wasted.

Algorithm
---------
1. Safety gate: count distinct report_dates; abort if < MIN_DATA_DAYS.
2. Build protected roots set from targeted keywords + settings.
3. Query zero-conversion terms (clicks >= 5, orders == 0, spend >= $5).
4. Group by dominant token (longest word >= 4 chars, stop-words excluded).
5. Clusters >= 3 unique terms AND >= $20 total waste → KeywordRecommendation.
6. Skip protected roots and existing pending recs.
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
from app.models.ppc_automation import KeywordRecommendation, PpcAutomationSettings

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------

_MIN_CLICKS_PER_TERM = 5       # min clicks for a term to count toward a cluster
_MIN_SPEND_PER_TERM = 5.0      # USD — each term must have this much wasted spend
_MIN_TERMS_IN_CLUSTER = 3      # cluster must have at least this many unique terms
_MIN_WASTED_SPEND = 20.0       # USD — total wasted spend across the cluster
_MAX_TERMS_TO_SCAN = 2000
_MIN_DATA_DAYS = 7             # abort if fewer distinct report dates exist

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


async def _count_distinct_report_dates(session: AsyncSession) -> int:
    result = (await session.exec(  # type: ignore[arg-type]
        text("SELECT COUNT(DISTINCT report_date) AS n FROM search_term_reports WHERE report_date IS NOT NULL")
    )).first()
    return int(result.n or 0) if result else 0


async def _get_protected_roots(session: AsyncSession) -> frozenset[str]:
    """Build protected root set from active keywords + settings.protected_keywords."""
    protected: set[str] = set()

    # 1. Keywords we're actively bidding on (keyword column = targeting phrase)
    kw_rows = (await session.exec(  # type: ignore[arg-type]
        text("SELECT DISTINCT keyword FROM search_term_reports WHERE keyword IS NOT NULL AND keyword != '' LIMIT 5000")
    )).all()
    for row in kw_rows:
        kw = row.keyword.lower().strip()
        protected.add(kw)
        protected.add(_dominant_token(kw))

    # 2. User-defined protected keywords from settings
    settings_rows = (await session.exec(select(PpcAutomationSettings))).all()
    for s in settings_rows:
        raw = getattr(s, "protected_keywords", None)
        if raw:
            try:
                words = json.loads(raw)
                if isinstance(words, list):
                    for w in words:
                        if isinstance(w, str) and w.strip():
                            protected.add(w.lower().strip())
                            protected.add(_dominant_token(w))
            except (json.JSONDecodeError, TypeError):
                pass

    return frozenset(protected)


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------


async def detect_negative_patterns(
    session: AsyncSession,
) -> list[dict[str, Any]]:
    """Detect and store phrase-negative pattern recommendations.

    Safety guards:
    - Aborts if < 7 distinct report dates (single-day data unreliable).
    - Skips roots matching actively-targeted keywords or protected_keywords.
    - Each term must have >= $5 wasted spend before counting toward a cluster.

    Returns summary list of created recommendations.
    """
    # ── Safety gate: minimum data coverage ──────────────────────────────────
    distinct_dates = await _count_distinct_report_dates(session)
    if distinct_dates < _MIN_DATA_DAYS:
        logger.warning(
            "negative_pattern_detector: only %d distinct report_dates "
            "(need >= %d) — aborting to prevent false positives",
            distinct_dates, _MIN_DATA_DAYS,
        )
        return []

    # ── Protected roots ──────────────────────────────────────────────────────
    protected_roots = await _get_protected_roots(session)
    logger.info(
        "negative_pattern_detector: %d report_dates, %d protected roots",
        distinct_dates, len(protected_roots),
    )

    # ── Query zero-conversion terms (per-term spend threshold) ───────────────
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
           AND SUM(spend)  >= :min_spend
        ORDER BY SUM(spend) DESC
        LIMIT :max_rows
    """)
    rows = (
        await session.exec(
            stmt,
            params={
                "min_clicks": _MIN_CLICKS_PER_TERM,
                "min_spend": _MIN_SPEND_PER_TERM,
                "max_rows": _MAX_TERMS_TO_SCAN,
            },
        )
    ).all()  # type: ignore[arg-type]

    # ── Build cluster map ────────────────────────────────────────────────────
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
    skipped_protected = 0

    for root, members in clusters.items():
        # ── Protected root check ─────────────────────────────────────────────
        if root in protected_roots:
            skipped_protected += 1
            continue

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
            "rule": (
                f">={_MIN_TERMS_IN_CLUSTER} terms, ${total_spend:.2f} wasted, "
                f"{distinct_dates} report_dates in dataset"
            ),
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
        "negative_pattern_detector: created %d recs (%d clusters, %d protected skipped)",
        len(created), len(clusters), skipped_protected,
    )
    return created
