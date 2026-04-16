"""Campaign Builder v2 — Strategy-based campaign plan generation.

Generates CampaignPlan records based on:
  - Strategy: launch | grow | defend | harvest | test
  - ASIN-level keyword data from search_term_reports + H10 Cerebro exports
  - Product config from ~/.openclaw/workspace/config/zoviro-products.md
  - Competitor ASINs from H10 data
  - Average CPC from ad_metrics

Also provides:
  - get_products_list() — products from inventory_snapshots + campaign match
  - get_campaign_structure() — existing campaigns + optimization steps + budget transfer
"""

from __future__ import annotations

import glob
import json
import os
import re
from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.ppc_automation import CampaignPlan, PpcAutomationSettings
from app.services.campaign_optimizer import (
    classify_campaign_status,
    generate_optimization_steps,
)

logger = get_logger(__name__)

_DEFAULT_BID = 0.75
_DEFAULT_MIN_BID = 0.10
_DEFAULT_MAX_BID = 4.00
_LOOKBACK_DAYS = 30
_H10_BASE = os.path.expanduser("~/.openclaw/skills/h10-browser/data/by-asin")
_PRODUCTS_MD = os.path.expanduser("~/.openclaw/workspace/config/zoviro-products.md")


# ---------------------------------------------------------------------------
# Strategy definitions
# ---------------------------------------------------------------------------

STRATEGIES = {
    "launch": {
        "name": "🚀 Launch",
        "description": "新品上架, 高曝光, auto+broad 为主",
        # budget allocations as percentages of total daily budget
        "campaigns": [
            {"role": "auto_discovery", "pct": 0.25, "bidding": "dynamic_up_and_down",
             "placement_top_pct": 0},
            {"role": "exact_core", "pct": 0.30, "bidding": "dynamic_down_only",
             "placement_top_pct": 25},
            {"role": "phrase_expand", "pct": 0.15, "bidding": "dynamic_down_only",
             "placement_top_pct": 10},
            {"role": "broad_discover", "pct": 0.10, "bidding": "dynamic_up_and_down",
             "placement_top_pct": 0},
            {"role": "product_target", "pct": 0.10, "bidding": "fixed",
             "placement_top_pct": 0},
            {"role": "sb_brand", "pct": 0.05, "bidding": "fixed",
             "placement_top_pct": 0},
            {"role": "sd_retarget", "pct": 0.05, "bidding": "fixed",
             "placement_top_pct": 0},
        ],
        "bid_multiplier": 1.10,  # Launch premium
    },
    "grow": {
        "name": "📈 Grow",
        "description": "精准投放, exact+phrase 为主, 抢排名",
        "campaigns": [
            {"role": "exact_core", "pct": 0.40, "bidding": "dynamic_down_only",
             "placement_top_pct": 30},
            {"role": "phrase_expand", "pct": 0.20, "bidding": "dynamic_down_only",
             "placement_top_pct": 15},
            {"role": "product_target", "pct": 0.15, "bidding": "fixed",
             "placement_top_pct": 0},
            {"role": "sb_brand", "pct": 0.15, "bidding": "fixed",
             "placement_top_pct": 0},
            {"role": "auto_discovery", "pct": 0.10, "bidding": "dynamic_down_only",
             "placement_top_pct": 0},
        ],
        "bid_multiplier": 1.05,
    },
    "defend": {
        "name": "🛡️ Defend",
        "description": "品牌词+核心词防御",
        "campaigns": [
            {"role": "brand_defense", "pct": 0.30, "bidding": "fixed",
             "placement_top_pct": 50},
            {"role": "exact_core", "pct": 0.30, "bidding": "dynamic_down_only",
             "placement_top_pct": 20},
            {"role": "product_target", "pct": 0.20, "bidding": "fixed",
             "placement_top_pct": 0},
            {"role": "sd_retarget", "pct": 0.20, "bidding": "fixed",
             "placement_top_pct": 0},
        ],
        "bid_multiplier": 0.95,
    },
    "harvest": {
        "name": "💰 Harvest",
        "description": "降 ACoS, 只留高 ROI 词",
        "campaigns": [
            {"role": "exact_proven", "pct": 0.50, "bidding": "dynamic_down_only",
             "placement_top_pct": 10},
            {"role": "brand_defense", "pct": 0.30, "bidding": "fixed",
             "placement_top_pct": 20},
            {"role": "sd_retarget", "pct": 0.20, "bidding": "fixed",
             "placement_top_pct": 0},
        ],
        "bid_multiplier": 0.85,
    },
    "test": {
        "name": "🧪 Test",
        "description": "低预算试新品/新词",
        "campaigns": [
            {"role": "auto_discovery", "pct": 0.40, "bidding": "dynamic_up_and_down",
             "placement_top_pct": 0},
            {"role": "broad_discover", "pct": 0.30, "bidding": "dynamic_up_and_down",
             "placement_top_pct": 0},
            {"role": "phrase_expand", "pct": 0.30, "bidding": "dynamic_down_only",
             "placement_top_pct": 0},
        ],
        "bid_multiplier": 0.90,
    },
}

ROLE_LABELS = {
    "auto_discovery": ("SP Auto Discovery", "SP", "auto"),
    "exact_core": ("SP Exact Core", "SP", "manual_exact"),
    "phrase_expand": ("SP Phrase Expand", "SP", "manual_phrase"),
    "broad_discover": ("SP Broad Discovery", "SP", "manual_broad"),
    "exact_proven": ("SP Exact Proven", "SP", "manual_exact"),
    "product_target": ("SP Product Target", "SP", "product"),
    "brand_defense": ("SP Brand Defense", "SP", "manual_exact"),
    "sb_brand": ("SB Brand Headlines", "SB", "keyword"),
    "sd_retarget": ("SD Retargeting", "SD", "audience"),
}

ROLE_PURPOSE = {
    "auto_discovery": "发现转化关键词，收集搜索词数据",
    "exact_core": "精准转化核心关键词，争取 organic 排名",
    "phrase_expand": "扩展流量，捕获长尾搜索词",
    "broad_discover": "低成本发现新关键词",
    "exact_proven": "已验证的高转化关键词，最大化 ROI",
    "product_target": "针对竞品 ASIN 投放，抢夺竞品流量",
    "brand_defense": "品牌词防御，防止竞品抢占品牌搜索",
    "sb_brand": "品牌展示广告，提升品牌认知度",
    "sd_retarget": "再营销已浏览用户，提高转化",
}


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

async def _get_avg_cpc(session: AsyncSession) -> float:
    cutoff = date.today() - timedelta(days=_LOOKBACK_DAYS)
    row = (await session.exec(  # type: ignore[call-overload]
        text("""
            SELECT SUM(spend::numeric) AS total_spend,
                   SUM(clicks::bigint) AS total_clicks
            FROM ad_metrics
            WHERE report_date >= :cutoff AND clicks > 0
        """),
        params={"cutoff": cutoff},
    )).first()
    if row and row.total_clicks and float(row.total_clicks) > 0:
        return round(float(row.total_spend or 0) / float(row.total_clicks), 4)
    return _DEFAULT_BID


async def _get_bid_bounds(session: AsyncSession, asin: str) -> tuple[float, float]:
    result = await session.exec(
        select(PpcAutomationSettings).where(PpcAutomationSettings.parent_asin == asin)
    )
    settings = result.first()
    if settings:
        return float(settings.min_bid), float(settings.max_bid)
    return _DEFAULT_MIN_BID, _DEFAULT_MAX_BID


def _load_h10_keywords(asin: str) -> list[dict[str, Any]]:
    """Load H10 Cerebro keyword data for this ASIN."""
    h10_dir = os.path.join(_H10_BASE, asin, "keywords")
    results: list[dict[str, Any]] = []
    if not os.path.exists(h10_dir):
        return results
    for fp in glob.glob(os.path.join(h10_dir, "*.json")):
        try:
            data = json.load(open(fp))
            if isinstance(data, list):
                results.extend(data)
            elif isinstance(data, dict):
                # Support current H10 object schema: { asin, updated, keywords: [...] }
                results.extend(data.get("keywords", []))
        except Exception:  # noqa: BLE001
            pass
    return results


def _load_h10_competitors(asin: str) -> list[str]:
    """Load competitor ASINs from H10 data."""
    competitors_file = os.path.join(_H10_BASE, asin, "competitors.json")
    if not os.path.exists(competitors_file):
        return []
    try:
        data = json.load(open(competitors_file))
        if isinstance(data, list):
            return [c["asin"] for c in data[:10] if isinstance(c, dict) and "asin" in c]
        elif isinstance(data, dict):
            # Support current H10 object schema: { updated, competitors: [...] }
            competitors = data.get("competitors", [])
            return [c["asin"] for c in competitors[:10] if isinstance(c, dict) and "asin" in c]
    except Exception:  # noqa: BLE001
        pass
    return []


def _parse_product_config(asin: str) -> dict[str, str]:
    """Extract product name and key features from zoviro-products.md."""
    if not os.path.exists(_PRODUCTS_MD):
        return {"name": asin, "features": ""}
    try:
        content = open(_PRODUCTS_MD).read()
        # Find the section for this ASIN
        pattern = rf"### {re.escape(asin)} — (.+?)(?=\n###|\Z)"
        m = re.search(pattern, content, re.DOTALL)
        if not m:
            return {"name": asin, "features": ""}
        section = m.group(0)
        # Extract product name from first line
        name_m = re.search(r"### \w+ — (.+)", section)
        name = name_m.group(1).strip() if name_m else asin
        # Extract key bullet points
        features = re.findall(r"- \*\*主要卖点.*?:(.*?)(?=\n-|\n\n|\Z)", section, re.DOTALL)
        feature_text = " ".join(features).strip()
        return {"name": name, "features": feature_text}
    except Exception:  # noqa: BLE001
        return {"name": asin, "features": ""}


async def _get_search_term_keywords(session: AsyncSession) -> list[dict[str, Any]]:
    """Get validated keywords from search_term_reports (have conversion data)."""
    rows = (await session.exec(  # type: ignore[call-overload]
        text("""
            SELECT keyword,
                   SUM(clicks::bigint) AS clicks,
                   SUM(orders::bigint) AS orders,
                   SUM(sales::numeric) AS sales,
                   SUM(spend::numeric) AS spend,
                   SUM(impressions::bigint) AS impressions
            FROM search_term_reports
            WHERE keyword IS NOT NULL AND keyword != ''
            GROUP BY keyword
            HAVING SUM(impressions::bigint) > 50
            ORDER BY SUM(sales::numeric) DESC NULLS LAST
            LIMIT 200
        """),
    )).all()
    result = []
    for r in rows:
        kw = str(r[0]).strip()
        if not kw or not kw.isascii() or len(kw) < 3 or len(kw) > 80:
            continue
        clicks = int(r[1] or 0)
        orders = int(r[2] or 0)
        sales = float(r[3] or 0)
        spend = float(r[4] or 0)
        impressions = int(r[5] or 0)
        acos = round(spend / sales, 3) if sales > 0 else None
        result.append({
            "keyword": kw,
            "source": "search_term_reports",
            "clicks": clicks,
            "orders": orders,
            "sales": sales,
            "spend": spend,
            "impressions": impressions,
            "acos": acos,
            "search_volume": impressions,
            "competition": "low",  # we can't know from ST reports
        })
    return result


def _classify_keyword(kw: str, impressions: int, source: str) -> str:
    """Classify keyword into category."""
    kw_lower = kw.lower()
    if "zoviro" in kw_lower:
        return "brand"
    if source == "search_term_reports" and impressions > 0:
        return "core" if impressions > 1000 else "long_tail"
    if source == "h10_cerebro":
        return "core" if impressions > 1000 else "long_tail"
    return "discovery"


def _competition_level(impressions: int) -> str:
    if impressions > 10000:
        return "high"
    if impressions > 2000:
        return "medium"
    return "low"


def _build_keyword_entry(
    kw: str,
    match_type: str,
    bid: float,
    source: str,
    search_volume: int,
    competition: str,
    category: str,
    acos: float | None = None,
) -> dict[str, Any]:
    return {
        "keyword": kw,
        "match_type": match_type,
        "bid": round(bid, 2),
        "bid_rationale": f"avg CPC 溢价",
        "search_volume": search_volume,
        "competition": competition,
        "source": source,
        "category": category,
        "acos": acos,
    }


def _keyword_text(entry: dict[str, Any]) -> str:
    return str(entry.get("keyword") or entry.get("keyword_text") or entry.get("term") or "").strip()


def _keyword_search_volume(entry: dict[str, Any]) -> int:
    raw = (
        entry.get("search_volume")
        or entry.get("impressions")
        or entry.get("exact_monthly_searches")
        or entry.get("monthly_search_volume")
        or 0
    )
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


# ---------------------------------------------------------------------------
# Campaign plan builder
# ---------------------------------------------------------------------------

def _build_campaign_list(
    asin: str,
    strategy_key: str,
    daily_budget: float,
    avg_cpc: float,
    min_bid: float,
    max_bid: float,
    search_term_kws: list[dict[str, Any]],
    h10_kws: list[dict[str, Any]],
    competitor_asins: list[str],
    target_acos: float,
) -> list[dict[str, Any]]:
    strategy = STRATEGIES[strategy_key]
    bid_multiplier = strategy["bid_multiplier"]
    base_bid = round(max(min_bid, min(avg_cpc * bid_multiplier, max_bid)), 2)

    # Build keyword pools
    # Core: high-volume, proven (from search_term_reports with orders > 0 or h10 with sv > 1000)
    core_kws = [k for k in search_term_kws if k.get("orders", 0) > 0][:30]
    if len(core_kws) < 10:
        core_kws += [k for k in search_term_kws if k not in core_kws][:20 - len(core_kws)]

    # H10 keywords — sorted by search volume
    h10_sorted = sorted(h10_kws, key=_keyword_search_volume, reverse=True)
    h10_core = [k for k in h10_sorted if _keyword_search_volume(k) > 1000][:20]
    h10_longtail = [k for k in h10_sorted if _keyword_search_volume(k) <= 1000][:20]

    # Merge all keywords, dedup
    all_kw_texts: set[str] = set()
    merged_kws: list[dict[str, Any]] = []

    def add_kws(kws: list[dict[str, Any]], source_override: str | None = None) -> None:
        for k in kws:
            text_key = _keyword_text(k).lower()
            if text_key and text_key not in all_kw_texts:
                all_kw_texts.add(text_key)
                kw_copy = dict(k)
                if source_override:
                    kw_copy["source"] = source_override
                merged_kws.append(kw_copy)

    add_kws(core_kws)
    add_kws(h10_core, "h10_cerebro")
    add_kws(h10_longtail, "h10_cerebro")

    # Assign categories and bids
    def make_kw(k: dict[str, Any], match_type: str, bid: float) -> dict[str, Any]:
        keyword = _keyword_text(k)
        sv = _keyword_search_volume(k)
        src = k.get("source", "search_term_reports")
        cat = _classify_keyword(keyword, sv, src)
        comp = _competition_level(sv)
        return _build_keyword_entry(
            keyword, match_type, bid, src, sv, comp, cat, k.get("acos")
        )

    # Proven keywords (have conversion data)
    proven_kws = [k for k in merged_kws if k.get("orders", 0) > 0][:30]
    exact_kws = [make_kw(k, "exact", base_bid) for k in merged_kws[:30]]
    phrase_kws = [make_kw(k, "phrase", round(base_bid * 0.9, 2)) for k in merged_kws[:25]]
    broad_kws = [make_kw(k, "broad", round(base_bid * 0.75, 2)) for k in merged_kws[:20]]
    proven_exact = [make_kw(k, "exact", round(base_bid * 0.9, 2)) for k in proven_kws]

    # Brand keywords
    brand_kws = [
        make_kw({"keyword": "zoviro", "source": "brand", "search_volume": 500, "orders": 1},
                "exact", round(min_bid * 2, 2)),
        make_kw({"keyword": f"zoviro {asin[:6].lower()}", "source": "brand",
                 "search_volume": 200, "orders": 1},
                "exact", round(min_bid * 2, 2)),
    ]

    campaigns: list[dict[str, Any]] = []
    for slot in strategy["campaigns"]:
        role = slot["role"]
        budget = round(daily_budget * slot["pct"], 2)
        label, ad_type, targeting = ROLE_LABELS[role]
        purpose = ROLE_PURPOSE[role]
        campaign_name = f"{asin} | {label}"

        ad_groups: list[dict[str, Any]] = []

        if role == "auto_discovery":
            ad_groups = [{
                "name": "Auto All",
                "default_bid": base_bid,
                "strategies": ["close_match", "loose_match", "substitutes", "complements"],
            }]
        elif role == "exact_core":
            ad_groups = [{"name": "Core Keywords", "default_bid": base_bid,
                          "keywords": exact_kws}]
        elif role == "phrase_expand":
            ad_groups = [{"name": "Phrase Match", "default_bid": round(base_bid * 0.9, 2),
                          "keywords": phrase_kws}]
        elif role == "broad_discover":
            ad_groups = [{"name": "Broad Match", "default_bid": round(base_bid * 0.75, 2),
                          "keywords": broad_kws}]
        elif role == "exact_proven":
            ad_groups = [{"name": "Proven Keywords", "default_bid": round(base_bid * 0.9, 2),
                          "keywords": proven_exact or exact_kws[:15]}]
        elif role == "product_target":
            targets = competitor_asins[:8] if competitor_asins else []
            ad_groups = [{"name": "Competitor ASINs", "default_bid": round(base_bid * 0.8, 2),
                          "targets": [{"asin": a} for a in targets]}]
        elif role == "brand_defense":
            ad_groups = [{"name": "Brand Defense", "default_bid": round(min_bid * 1.5, 2),
                          "keywords": brand_kws + exact_kws[:5]}]
        elif role == "sb_brand":
            ad_groups = [{"name": "Brand Headlines", "default_bid": base_bid,
                          "keywords": exact_kws[:10]}]
        elif role == "sd_retarget":
            ad_groups = [{"name": "Retargeting", "default_bid": round(base_bid * 0.5, 2),
                          "targeting": [{"tactic": "T00030",
                                         "description": "再营销已浏览产品详情页用户"}]}]

        campaigns.append({
            "name": campaign_name,
            "type": ad_type,
            "targeting": targeting,
            "budget_pct": slot["pct"],
            "daily_budget": budget,
            "bidding_strategy": slot["bidding"],
            "placement_top_of_search_pct": slot["placement_top_pct"],
            "purpose": purpose,
            "ad_groups": ad_groups,
        })

    return campaigns


# ---------------------------------------------------------------------------
# Budget allocation visual
# ---------------------------------------------------------------------------

def _build_budget_allocation(campaigns: list[dict[str, Any]], total: float) -> list[dict]:
    return [
        {
            "name": c["name"].split(" | ", 1)[1] if " | " in c["name"] else c["name"],
            "budget": c["daily_budget"],
            "pct": round(c["budget_pct"] * 100),
            "type": c["type"],
        }
        for c in campaigns
    ]


# ---------------------------------------------------------------------------
# Public: generate_v2_campaign_plan
# ---------------------------------------------------------------------------

async def generate_v2_campaign_plan(
    session: AsyncSession,
    asin: str,
    daily_budget: float,
    strategy: str,
    target_acos: float,
    competitor_asins: list[str] | None = None,
) -> dict[str, Any]:
    """Generate and persist a strategy-based CampaignPlan v2."""
    if strategy not in STRATEGIES:
        strategy = "launch"

    avg_cpc = await _get_avg_cpc(session)
    min_bid, max_bid = await _get_bid_bounds(session, asin)

    # Collect keywords
    search_term_kws = await _get_search_term_keywords(session)
    h10_kws = _load_h10_keywords(asin)

    # Competitor ASINs: passed in or from H10 data
    comp_asins = competitor_asins or []
    if not comp_asins:
        comp_asins = _load_h10_competitors(asin)

    product_info = _parse_product_config(asin)

    campaigns = _build_campaign_list(
        asin=asin,
        strategy_key=strategy,
        daily_budget=daily_budget,
        avg_cpc=avg_cpc,
        min_bid=min_bid,
        max_bid=max_bid,
        search_term_kws=search_term_kws,
        h10_kws=h10_kws,
        competitor_asins=comp_asins,
        target_acos=target_acos,
    )

    budget_allocation = _build_budget_allocation(campaigns, daily_budget)

    plan_json = {
        "asin": asin,
        "product_name": product_info["name"],
        "strategy": strategy,
        "strategy_label": STRATEGIES[strategy]["name"],
        "generated_date": date.today().isoformat(),
        "total_daily_budget": daily_budget,
        "target_acos": target_acos,
        "avg_cpc": avg_cpc,
        "campaigns": campaigns,
        "budget_allocation": budget_allocation,
        "keyword_sources": {
            "search_term_reports": len(search_term_kws),
            "h10_cerebro": len(h10_kws),
            "competitor_asins": len(comp_asins),
        },
        "notes": (
            f"Strategy: {STRATEGIES[strategy]['name']}. "
            f"Base bid: ${max(min_bid, min(avg_cpc * STRATEGIES[strategy]['bid_multiplier'], max_bid)):.2f}. "
            "Review all bids and keywords before publishing to Amazon Ads."
        ),
    }

    row = CampaignPlan(
        parent_asin=asin,
        plan=json.dumps(plan_json),
        campaign_count=len(campaigns),
        total_daily_budget=daily_budget,
        status="draft",
        created_at=utcnow(),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)

    logger.info(
        "campaign_builder: plan %s — %s — strategy=%s — %d campaigns, $%.2f/day",
        row.id, asin, strategy, len(campaigns), daily_budget,
    )

    return {
        "plan_id": str(row.id),
        "asin": asin,
        "product_name": product_info["name"],
        "strategy": strategy,
        "campaign_count": len(campaigns),
        "total_daily_budget": daily_budget,
        "target_acos": target_acos,
        "avg_cpc": avg_cpc,
        "status": "draft",
        "plan": plan_json,
    }


# ---------------------------------------------------------------------------
# Public: get_products_list
# ---------------------------------------------------------------------------

async def get_products_list(session: AsyncSession) -> list[dict[str, Any]]:
    """Return products from inventory_snapshots with campaign match info."""
    inv_rows = (await session.exec(  # type: ignore[call-overload]
        text("""
            SELECT DISTINCT ON (asin)
                asin, sku, product_name, available
            FROM inventory_snapshots
            WHERE asin IS NOT NULL
            ORDER BY asin, available DESC
        """),
    )).all()

    # Get all enabled campaign names for matching
    camp_rows = (await session.exec(  # type: ignore[call-overload]
        text("SELECT name, campaign_id FROM campaigns WHERE state = 'ENABLED'"),
    )).all()
    campaign_names = [(str(r[0]).lower(), str(r[0])) for r in camp_rows]

    products = []
    for r in inv_rows:
        asin = str(r[0])
        sku = str(r[1] or "")
        name = str(r[2] or asin)
        stock = int(r[3] or 0)

        # Match campaigns by checking if ASIN or product name keywords appear in campaign name
        name_keywords = [w.lower() for w in name.split() if len(w) > 3][:4]
        matching = [
            cn for cn_lower, cn in campaign_names
            if asin.lower() in cn_lower
            or any(kw in cn_lower for kw in name_keywords)
        ]

        products.append({
            "asin": asin,
            "sku": sku,
            "name": name,
            "stock": stock,
            "has_campaigns": len(matching) > 0,
            "campaign_count": len(matching),
        })

    # Also add products from zoviro-products.md that may not be in inventory yet
    products_in_inv = {p["asin"] for p in products}
    if os.path.exists(_PRODUCTS_MD):
        content = open(_PRODUCTS_MD).read()
        for m in re.finditer(r"### (B0\w+) — (.+)", content):
            asin_md = m.group(1)
            name_md = m.group(2).strip()
            if asin_md not in products_in_inv:
                products.append({
                    "asin": asin_md,
                    "sku": "",
                    "name": name_md,
                    "stock": 0,
                    "has_campaigns": False,
                    "campaign_count": 0,
                })

    return sorted(products, key=lambda p: (-p["campaign_count"], p["name"]))


# ---------------------------------------------------------------------------
# Public: get_campaign_structure
# ---------------------------------------------------------------------------

async def get_campaign_structure(
    session: AsyncSession,
    asin: str,
    target_acos: float = 25.0,
) -> dict[str, Any]:
    """Return existing campaign structure for an ASIN + optimization suggestions."""

    product_info = _parse_product_config(asin)

    # Get all enabled campaigns
    all_campaigns = (await session.exec(  # type: ignore[call-overload]
        text("""
            SELECT c.campaign_id, c.name, c.campaign_type, c.targeting_type,
                   c.state, c.budget_amount::numeric
            FROM campaigns c
            WHERE c.state = 'ENABLED'
            ORDER BY c.name
        """),
    )).all()

    if not all_campaigns:
        return {
            "asin": asin,
            "product_name": product_info["name"],
            "is_new_product": True,
            "existing_campaigns": [],
            "optimization_steps": [],
            "budget_transfer_summary": None,
        }

    # Match campaigns to this ASIN (by ASIN or product name keywords in campaign name)
    name_keywords = [w.lower() for w in product_info["name"].split() if len(w) > 3][:5]
    matched: list[dict[str, Any]] = []
    for r in all_campaigns:
        cname_lower = str(r[1] or "").lower()
        if asin.lower() in cname_lower or any(kw in cname_lower for kw in name_keywords):
            matched.append({
                "campaign_id": str(r[0]),
                "name": str(r[1]),
                "type": str(r[2] or "SP"),
                "targeting": str(r[3] or ""),
                "state": str(r[4]),
                "budget": float(r[5] or 0),
            })

    is_new = len(matched) == 0

    if is_new:
        return {
            "asin": asin,
            "product_name": product_info["name"],
            "is_new_product": True,
            "existing_campaigns": [],
            "optimization_steps": [],
            "budget_transfer_summary": None,
        }

    # Get 30-day metrics for matched campaigns
    cutoff = date.today() - timedelta(days=30)
    campaign_ids = [c["campaign_id"] for c in matched]
    placeholders = ", ".join(f"'{cid}'" for cid in campaign_ids)

    metrics_rows = (await session.exec(  # type: ignore[call-overload]
        text(f"""
            SELECT campaign_id,
                   SUM(spend::numeric) AS spend,
                   SUM(sales::numeric) AS sales,
                   SUM(clicks::bigint) AS clicks,
                   SUM(impressions::bigint) AS impressions,
                   SUM(orders::bigint) AS orders
            FROM ad_metrics
            WHERE campaign_id IN ({placeholders})
              AND report_date >= :cutoff
            GROUP BY campaign_id
        """),
        params={"cutoff": cutoff},
    )).all()

    metrics_map: dict[str, dict] = {}
    for r in metrics_rows:
        spend = float(r[1] or 0)
        sales = float(r[2] or 0)
        metrics_map[str(r[0])] = {
            "spend": round(spend, 2),
            "sales": round(sales, 2),
            "clicks": int(r[3] or 0),
            "impressions": int(r[4] or 0),
            "orders": int(r[5] or 0),
            "acos": round(spend / sales, 3) if sales > 0 else None,
            "roas": round(sales / spend, 2) if spend > 0 else None,
        }

    # Get zero-conversion search terms per campaign
    zc_rows = (await session.exec(  # type: ignore[call-overload]
        text(f"""
            SELECT campaign_id, keyword
            FROM search_term_reports
            WHERE campaign_id IN ({placeholders})
              AND orders = 0
              AND clicks::bigint >= 5
            ORDER BY clicks::bigint DESC
            LIMIT 200
        """),
    )).all()
    zero_conv: dict[str, list[str]] = {}
    for r in zc_rows:
        cid = str(r[0])
        zero_conv.setdefault(cid, []).append(str(r[1]))

    # Build existing_campaigns list with status
    existing_campaigns: list[dict[str, Any]] = []
    critical: list[dict[str, Any]] = []
    healthy_with_capacity: list[dict[str, Any]] = []

    for c in matched:
        cid = c["campaign_id"]
        m = metrics_map.get(cid, {})
        acos_val = m.get("acos")
        roas_val = m.get("roas")
        budget = c["budget"]
        spend_30d = m.get("spend", 0)
        avg_daily_spend = spend_30d / 30 if spend_30d > 0 else 0

        status = classify_campaign_status(acos_val, m.get("spend", 0), target_acos)

        # Budget depletes early if avg daily spend >= 90% of budget
        depletes_early = avg_daily_spend >= budget * 0.9 and budget > 0

        campaign_entry = {
            "campaign_id": cid,
            "name": c["name"],
            "type": c["type"],
            "targeting": c["targeting"],
            "budget": budget,
            "spend_30d": spend_30d,
            "sales_30d": m.get("sales", 0),
            "clicks_30d": m.get("clicks", 0),
            "orders_30d": m.get("orders", 0),
            "acos": round(acos_val * 100, 1) if acos_val else None,
            "roas": roas_val,
            "status": status,
            "depletes_early": depletes_early,
            "zero_conv_terms": zero_conv.get(cid, [])[:10],
        }
        existing_campaigns.append(campaign_entry)

        if status == "critical" and spend_30d > 5:
            critical.append(campaign_entry)
        if status == "healthy" and depletes_early:
            healthy_with_capacity.append(campaign_entry)

    # Competitor ASINs for PT suggestion
    competitor_asins = _load_h10_competitors(asin)
    has_pt = any("product target" in c["name"].lower() or c["targeting"] == "TARGETING_TYPE_MANUAL_PRODUCT_ATTRIBUTE" for c in matched)

    # Build optimization steps
    optimization_steps: list[dict[str, Any]] = []
    priority = 1

    for source_c in critical:
        cid = source_c["campaign_id"]
        zc_terms = zero_conv.get(cid, [])[:15]
        spend_30d = source_c["spend_30d"]
        transferable = round(source_c["budget"] - 5.0, 2) if source_c["budget"] > 10 else 0.0
        acos_display = source_c["acos"] or 0

        # Find best transfer target
        same_product_targets = healthy_with_capacity  # all matched campaigns are same product
        transfer_target = same_product_targets[0] if same_product_targets else None
        to_same_product = True

        # If no same-product target, look at all healthy campaigns across all products
        if not transfer_target:
            all_metrics = (await session.exec(  # type: ignore[call-overload]
                text("""
                    SELECT c.campaign_id, c.name, c.budget_amount::numeric,
                           SUM(m.spend::numeric) AS spend, SUM(m.sales::numeric) AS sales
                    FROM campaigns c
                    JOIN ad_metrics m ON c.campaign_id = m.campaign_id
                    WHERE c.state = 'ENABLED' AND m.report_date >= :cutoff
                    GROUP BY c.campaign_id, c.name, c.budget_amount
                    HAVING SUM(m.sales::numeric) > 0
                    ORDER BY (SUM(m.spend::numeric) / NULLIF(SUM(m.sales::numeric), 0)) ASC
                    LIMIT 5
                """),
                params={"cutoff": cutoff},
            )).all()
            if all_metrics:
                best = all_metrics[0]
                transfer_target = {
                    "name": str(best[1]),
                    "budget": float(best[2] or 0),
                    "acos": round(float(best[3] or 0) / float(best[4] or 1) * 100, 1),
                }
                to_same_product = False

        steps = generate_optimization_steps(
            campaign=source_c,
            zero_conv_terms=zc_terms,
            target_acos=target_acos,
            transfer_amount=transferable,
            transfer_target_name=transfer_target["name"] if transfer_target else None,
        )

        optimization_steps.append({
            "priority": priority,
            "type": "budget_transfer",
            "title": f"优化: {source_c['name']} (ACoS {acos_display}%)",
            "from_campaign": source_c["name"],
            "to_campaign": transfer_target["name"] if transfer_target else None,
            "to_campaign_same_product": to_same_product,
            "transfer_amount": transferable,
            "steps": steps,
            "expected_impact": {
                "from_saved": f"${round(transferable * 7, 0)}/周减少亏损",
                "to_gained": f"+${round(transferable * 4 * 7, 0)}/周广告销售 (按 ROAS 4x)",
                "net_weekly_gain": f"${round(transferable * 5 * 7, 0)}",
            },
            "preserve_note": f"保留 $5/天, 该 campaign 可能仍有盈利关键词, 不完全暂停",
        })
        priority += 1

    # Check for missing campaign types
    has_sd = any("SD" in c["type"] or "sd" in c["name"].lower() for c in matched)
    has_sb = any("SB" in c["type"] or "sb" in c["name"].lower() or "brand" in c["name"].lower() for c in matched)

    if not has_pt and competitor_asins:
        optimization_steps.append({
            "priority": priority,
            "type": "missing_campaign",
            "title": "缺失: 无 Product Targeting Campaign",
            "recommendation": f"建议针对 {min(4, len(competitor_asins))} 个竞品 ASIN 投放",
            "competitor_asins": competitor_asins[:4],
            "suggested_budget": 8.0,
            "expected_acos": "20-30%",
        })
        priority += 1

    if not has_sb:
        optimization_steps.append({
            "priority": priority,
            "type": "missing_campaign",
            "title": "缺失: 无品牌 Headline Search Ad",
            "recommendation": "建议添加 SB 品牌广告, 提升品牌认知并防御竞品",
            "suggested_budget": 5.0,
            "expected_acos": "15-25%",
        })

    # Budget transfer summary
    total_transferable = sum(s.get("transfer_amount", 0) for s in optimization_steps
                             if s["type"] == "budget_transfer")
    same_product_targets = healthy_with_capacity
    budget_transfer_summary = {
        "total_transferable": round(total_transferable, 2),
        "same_product_targets": [
            {
                "campaign": c["name"],
                "reason": f"ACoS {c['acos']}%, 预算提前耗尽",
                "capacity": round(c["budget"] * 0.3, 2),
            }
            for c in same_product_targets
        ],
        "other_product_targets": [],
        "priority_note": "优先转移到同产品 Campaign，保持该产品流量稳定",
    }

    return {
        "asin": asin,
        "product_name": product_info["name"],
        "is_new_product": is_new,
        "existing_campaigns": existing_campaigns,
        "optimization_steps": optimization_steps,
        "budget_transfer_summary": budget_transfer_summary,
    }
