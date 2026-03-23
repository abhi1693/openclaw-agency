"""Keyword Tier Classifier & Multi-Signal Scorer — Phase 2 v2.

Classifies every keyword into one of 5 tiers using 5 weighted signals,
then returns a composite 0-1 score that drives bid direction.

Tiers
-----
STAR   — Conv rate > category avg AND ACoS < target → increase bid
STABLE — ACoS within target ±20% → maintain/micro-adjust
WATCH  — ACoS > target but has conversions → gradually decrease
DRAIN  — High spend, zero conversions (clicks ≥ threshold) → cut more
SPARSE — Insufficient data (clicks < threshold) → hold

Signal weights
--------------
ACoS Efficiency      30%
Conversion Trend     25%
Revenue Contribution 20%
CPC Trend            15%
Impression Share     10%
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import auto
from enum import Enum as _Enum


# ---------------------------------------------------------------------------
# Enums & data classes
# ---------------------------------------------------------------------------


class KeywordTier(_Enum):
    STAR = "star"
    STABLE = "stable"
    WATCH = "watch"
    DRAIN = "drain"
    SPARSE = "sparse"


@dataclass
class SignalScores:
    acos_efficiency: float       # 0-1
    conversion_trend: float      # 0-1
    revenue_contribution: float  # 0-1
    cpc_trend: float             # 0-1
    impression_share: float      # 0-1

    @property
    def composite(self) -> float:
        return (
            self.acos_efficiency * 0.30
            + self.conversion_trend * 0.25
            + self.revenue_contribution * 0.20
            + self.cpc_trend * 0.15
            + self.impression_share * 0.10
        )


@dataclass
class ScoredKeyword:
    tier: KeywordTier
    score: float              # 0-1 composite
    signals: SignalScores
    direction: str            # "increase" | "hold" | "decrease"


# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

# Minimum clicks before a keyword leaves SPARSE status
SPARSE_CLICK_THRESHOLD = 15

# ACoS within ±20% of target is considered STABLE
STABLE_BAND_PCT = 0.20

# Tier score bands
INCREASE_THRESHOLD = 0.70
HOLD_UPPER = 0.70
HOLD_LOWER = 0.40
DECREASE_THRESHOLD = 0.40


# ---------------------------------------------------------------------------
# Signal calculators
# ---------------------------------------------------------------------------


def _acos_efficiency_score(
    current_acos: float | None,
    target_acos: float,
) -> float:
    """Score 0-1: 1.0 = perfect ACoS, 0.0 = 2× over target."""
    if current_acos is None or current_acos <= 0:
        return 0.50  # neutral when no ACoS data
    if target_acos <= 0:
        return 0.50
    # At current=target: score=0.5. At current=0: score=1.0. At current=2×target: score=0.0.
    raw = 1.0 - (current_acos / (2.0 * target_acos))
    return max(0.0, min(1.0, raw))


def _conversion_trend_score(
    cvr_recent: float | None,
    cvr_prior: float | None,
) -> float:
    """Score based on 7d vs prior-7d conversion rate ratio.

    trend_ratio = cvr_recent / cvr_prior
    0.5 → score 0  (declining 50%)
    1.0 → score 0.5 (flat)
    1.5 → score 1.0 (improving 50%)
    """
    if cvr_recent is None or cvr_prior is None or cvr_prior <= 0:
        return 0.50  # neutral when insufficient data
    ratio = cvr_recent / cvr_prior
    raw = (ratio - 0.5) / 1.0  # maps [0.5,1.5] → [0,1]
    return max(0.0, min(1.0, raw))


def _revenue_contribution_score(
    keyword_revenue: float,
    total_revenue: float,
    normalisation_pct: float = 0.20,
) -> float:
    """Score 0-1: 1.0 if keyword contributes ≥ normalisation_pct of total revenue."""
    if total_revenue <= 0:
        return 0.10
    pct = keyword_revenue / total_revenue
    return min(1.0, pct / normalisation_pct)


def _cpc_trend_score(
    cpc_recent: float | None,
    cpc_prior: float | None,
) -> float:
    """Score 0-1: 1.0 = CPC falling (less competition), 0.0 = CPC rising >40%.

    cpc_ratio = recent / prior.
    ratio < 0.9  → score 1.0 (CPC dropping: good)
    ratio = 1.0  → score 0.8 (stable: fine)
    ratio = 1.4  → score 0.0 (CPC up 40%: competition rising)
    """
    if cpc_recent is None or cpc_prior is None or cpc_prior <= 0:
        return 0.70  # slightly positive default
    ratio = cpc_recent / cpc_prior
    raw = 1.0 - max(0.0, (ratio - 0.9) / 0.5)
    return max(0.0, min(1.0, raw))


def _impression_share_score(
    impressions_recent: int,
    max_impressions_in_set: int,
) -> float:
    """Proxy for impression share: relative performance in the keyword set."""
    if max_impressions_in_set <= 0:
        return 0.50
    ratio = impressions_recent / max_impressions_in_set
    return min(1.0, ratio)


# ---------------------------------------------------------------------------
# Main classifier
# ---------------------------------------------------------------------------


def score_keyword(
    *,
    clicks: int,
    orders: int,
    spend: float,
    sales: float,
    target_acos: float,
    category_avg_cvr: float,
    total_revenue: float,
    cvr_recent: float | None = None,
    cvr_prior: float | None = None,
    cpc_recent: float | None = None,
    cpc_prior: float | None = None,
    impressions_recent: int = 0,
    max_impressions_in_set: int = 1,
) -> ScoredKeyword:
    """Classify a keyword and return its tier, composite score, and signal breakdown."""

    # ── Step 1: SPARSE check ──────────────────────────────────────────────
    if clicks < SPARSE_CLICK_THRESHOLD:
        signals = SignalScores(
            acos_efficiency=0.50,
            conversion_trend=0.50,
            revenue_contribution=0.10,
            cpc_trend=0.70,
            impression_share=0.50,
        )
        return ScoredKeyword(tier=KeywordTier.SPARSE, score=signals.composite, signals=signals, direction="hold")

    # ── Step 2: Derived metrics ───────────────────────────────────────────
    current_acos = (spend / sales) if sales > 0 else None
    cvr_observed = orders / clicks if clicks > 0 else 0.0

    # ── Step 3: Compute signals ───────────────────────────────────────────
    signals = SignalScores(
        acos_efficiency=_acos_efficiency_score(current_acos, target_acos),
        conversion_trend=_conversion_trend_score(cvr_recent, cvr_prior),
        revenue_contribution=_revenue_contribution_score(sales, total_revenue),
        cpc_trend=_cpc_trend_score(cpc_recent, cpc_prior),
        impression_share=_impression_share_score(impressions_recent, max_impressions_in_set),
    )
    score = signals.composite

    # ── Step 4: Tier classification ───────────────────────────────────────
    if orders == 0:
        # No conversions with enough clicks → DRAIN
        tier = KeywordTier.DRAIN
        direction = "decrease"
    elif current_acos is not None and current_acos < target_acos * (1 - STABLE_BAND_PCT) and cvr_observed > category_avg_cvr:
        # ACoS comfortably below target AND converting above average → STAR
        tier = KeywordTier.STAR
        direction = "increase"
    elif current_acos is not None and abs(current_acos - target_acos) <= target_acos * STABLE_BAND_PCT:
        # ACoS within ±20% of target → STABLE
        tier = KeywordTier.STABLE
        direction = "hold"
    elif current_acos is not None and current_acos > target_acos:
        # ACoS over target but has conversions → WATCH
        tier = KeywordTier.WATCH
        direction = "decrease"
    else:
        # ACoS below target without strong signal → STABLE
        tier = KeywordTier.STABLE
        direction = "hold"

    # Override direction with composite score bands
    if score >= INCREASE_THRESHOLD:
        direction = "increase"
    elif score < DECREASE_THRESHOLD:
        direction = "decrease"
    # else keep tier-driven direction

    return ScoredKeyword(tier=tier, score=round(score, 4), signals=signals, direction=direction)
