"""Campaign Optimizer — shared optimization engine.

Provides reusable helpers for classifying campaign health and generating
step-by-step optimization recommendations (budget transfers, missing coverage,
quick wins).

Used by:
  - campaign_builder.get_campaign_structure()  — per-ASIN view
  - amazon.py /ppc/optimization-recommendations — global view
  - PPC weekly skill via API endpoint
"""

from __future__ import annotations

import glob
import json
import os
import re
from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger

logger = get_logger(__name__)

_TARGET_ACOS_DEFAULT = 25.0
_LOOKBACK_DAYS = 30
_PRODUCTS_MD = os.path.expanduser("~/.openclaw/workspace/config/zoviro-products.md")
_H10_BASE = os.path.expanduser("~/.openclaw/skills/h10-browser/data/by-asin")

# Auto targeting strategy names that appear in keyword field — must be excluded
_AUTO_TARGETING_FILTER = """
    AND keyword !~ '^(close-|loose-|keyword-|substitut|complement)'
    AND keyword NOT IN ('close-match', 'loose-match', 'substitutes', 'complements')
"""


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def classify_campaign_status(
    acos_decimal: float | None,
    spend_30d: float,
    target_acos: float,
) -> str:
    """Return 'healthy' | 'warning' | 'critical' | 'inactive'."""
    if acos_decimal is None or spend_30d < 1:
        return "inactive"
    pct = acos_decimal * 100
    if pct > target_acos * 2:
        return "critical"
    if pct > target_acos * 1.3:
        return "warning"
    return "healthy"


def generate_optimization_steps(
    campaign: dict[str, Any],
    zero_conv_terms: list[dict[str, Any]],
    target_acos: float,
    transfer_amount: float,
    transfer_target_name: str | None,
) -> list[dict[str, Any]]:
    """Produce tiered, non-destructive optimization steps for a campaign.

    Never suggests pausing — always gives stepwise fix + optional transfer.
    """
    steps: list[dict[str, Any]] = []
    avg_bid = campaign.get("spend_30d", 0) / max(campaign.get("clicks_30d", 1), 1)

    if zero_conv_terms:
        total_wasted = sum(t.get("spend", 0) for t in zero_conv_terms)
        term_details = [
            f"{t['term']} ({t['clicks']}次点击, ${t['spend']:.1f}浪费)"
            for t in zero_conv_terms[:15]
        ]
        steps.append({
            "timing": "立即",
            "action": f"否定 {len(zero_conv_terms)} 个 0 转化搜索词 (共浪费 ${total_wasted:.0f})",
            "details": term_details,
            "terms": zero_conv_terms[:15],
            "total_wasted": round(total_wasted, 2),
        })

    steps.append({
        "timing": "本周",
        "action": "降 bid 20%",
        "details": [
            f"当前 avg bid ≈ ${avg_bid:.2f}",
            f"新 bid ≈ ${avg_bid * 0.8:.2f}",
            "观察 7 天",
        ],
    })

    if transfer_amount > 0 and transfer_target_name:
        steps.append({
            "timing": f"7天后如果 ACoS 仍 > {target_acos}%",
            "action": f"转移 ${transfer_amount}/天",
            "details": [
                f"目标: {transfer_target_name}",
                f"保留 $5/天维持最低覆盖",
            ],
        })

    return steps


def _load_product_names() -> dict[str, str]:
    """Return {asin: product_name} from zoviro-products.md."""
    result: dict[str, str] = {}
    if not os.path.exists(_PRODUCTS_MD):
        return result
    try:
        content = open(_PRODUCTS_MD).read()
        for m in re.finditer(r"### (B0\w+) — (.+)", content):
            result[m.group(1)] = m.group(2).strip()
    except Exception:  # noqa: BLE001
        pass
    return result


def _load_h10_competitors(asin: str) -> list[str]:
    competitors_file = os.path.join(_H10_BASE, asin, "competitors.json")
    if not os.path.exists(competitors_file):
        return []
    try:
        data = json.load(open(competitors_file))
        if isinstance(data, list):
            return [c["asin"] for c in data[:10] if isinstance(c, dict) and "asin" in c]
    except Exception:  # noqa: BLE001
        pass
    return []


# ---------------------------------------------------------------------------
# Global optimizer
# ---------------------------------------------------------------------------

async def get_optimization_recommendations(
    session: AsyncSession,
    target_acos: float = _TARGET_ACOS_DEFAULT,
) -> dict[str, Any]:
    """Scan all active campaigns and produce actionable optimization recommendations.

    Returns:
        campaign_health: healthy/warning/critical/inactive counts
        budget_transfers: step-by-step transfer plans (same-product preferred)
        missing_coverage: products with no campaign or missing campaign types
        quick_wins: high-impact low-effort actions (exact match upgrades, etc.)
    """
    cutoff = date.today() - timedelta(days=_LOOKBACK_DAYS)

    # ── 1. Load all ENABLED campaigns with 30-day metrics ──────────────────
    camp_rows = (await session.exec(  # type: ignore[call-overload]
        text("""
            SELECT c.campaign_id, c.name, c.campaign_type, c.targeting_type,
                   c.budget_amount::numeric,
                   COALESCE(SUM(m.spend::numeric), 0)       AS spend,
                   COALESCE(SUM(m.sales::numeric), 0)       AS sales,
                   COALESCE(SUM(m.clicks::bigint), 0)       AS clicks,
                   COALESCE(SUM(m.impressions::bigint), 0)  AS impressions,
                   COALESCE(SUM(m.orders::bigint), 0)       AS orders
            FROM campaigns c
            LEFT JOIN ad_metrics m
                ON c.campaign_id = m.campaign_id AND m.report_date >= :cutoff
            WHERE c.state = 'ENABLED'
            GROUP BY c.campaign_id, c.name, c.campaign_type,
                     c.targeting_type, c.budget_amount
            ORDER BY spend DESC
        """),
        params={"cutoff": cutoff},
    )).all()

    # ── 2. Zero-conversion search terms per campaign ───────────────────────
    campaign_ids = [str(r[0]) for r in camp_rows if float(r[5] or 0) > 0]
    zero_conv: dict[str, list[str]] = {}
    if campaign_ids:
        placeholders = ", ".join(f"'{cid}'" for cid in campaign_ids[:100])
        zc_rows = (await session.exec(  # type: ignore[call-overload]
            text(f"""
                SELECT campaign_id, keyword, sum(clicks::bigint) cl, sum(spend::numeric) sp
                FROM search_term_reports
                WHERE campaign_id IN ({placeholders})
                  AND orders::bigint = 0
                  AND clicks::bigint >= 5
                  AND keyword IS NOT NULL AND keyword != ''
                  {_AUTO_TARGETING_FILTER}
                GROUP BY campaign_id, keyword
                ORDER BY sp DESC
                LIMIT 300
            """),
        )).all()
        for r in zc_rows:
            zero_conv.setdefault(str(r[0]), []).append({
                "term": str(r[1]),
                "clicks": int(r[2] or 0),
                "spend": round(float(r[3] or 0), 2),
            })

    # ── 3. Quick wins: exact-match upgrade candidates ─────────────────────
    quick_win_rows = (await session.exec(  # type: ignore[call-overload]
        text(f"""
            SELECT keyword, SUM(orders::bigint) ord, SUM(spend::numeric) sp,
                   SUM(sales::numeric) sal, SUM(clicks::bigint) cl,
                   SUM(impressions::bigint) impr
            FROM search_term_reports
            WHERE orders::bigint > 0
              AND keyword IS NOT NULL AND keyword != ''
              {_AUTO_TARGETING_FILTER}
            GROUP BY keyword
            HAVING SUM(orders::bigint) >= 3
               AND SUM(impressions::bigint) > 100
            ORDER BY SUM(orders::bigint) DESC
            LIMIT 20
        """),
    )).all()
    high_conv_terms = []
    for r in quick_win_rows:
        if not r[0]:
            continue
        sp, sal = float(r[2] or 0), float(r[3] or 0)
        high_conv_terms.append({
            "keyword": str(r[0]),
            "orders": int(r[1] or 0),
            "spend": round(sp, 2),
            "sales": round(sal, 2),
            "clicks": int(r[4] or 0),
            "impressions": int(r[5] or 0),
            "acos": round(sp / sal * 100, 1) if sal > 0 else None,
            "roas": round(sal / sp, 2) if sp > 0 else None,
            "cvr": round(int(r[1] or 0) / max(int(r[4] or 0), 1) * 100, 1),
        })

    # ── 4. Products from inventory + products.md ──────────────────────────
    product_names = _load_product_names()
    inv_rows = (await session.exec(  # type: ignore[call-overload]
        text("""
            SELECT DISTINCT ON (asin) asin, product_name
            FROM inventory_snapshots
            WHERE asin IS NOT NULL
            ORDER BY asin
        """),
    )).all()
    for r in inv_rows:
        asin = str(r[0])
        if asin not in product_names and r[1]:
            product_names[asin] = str(r[1])

    campaign_name_lower_list = [(str(r[0]), str(r[1]).lower()) for r in camp_rows]

    def match_product_campaigns(asin: str, name: str) -> list[tuple[str, str]]:
        name_kws = [w.lower() for w in name.split() if len(w) > 3][:5]
        return [
            (cid, cn_lower) for cid, cn_lower in campaign_name_lower_list
            if asin.lower() in cn_lower or any(k in cn_lower for k in name_kws)
        ]

    # ── 5. Classify each campaign ─────────────────────────────────────────
    classified: list[dict[str, Any]] = []
    health_counts = {"healthy": 0, "warning": 0, "critical": 0, "inactive": 0}

    for r in camp_rows:
        cid = str(r[0])
        spend = float(r[5] or 0)
        sales = float(r[6] or 0)
        clicks = int(r[7] or 0)
        budget = float(r[4] or 0)
        acos_dec = spend / sales if sales > 0 else None
        avg_daily_spend = spend / _LOOKBACK_DAYS
        depletes_early = avg_daily_spend >= budget * 0.9 and budget > 0

        status = classify_campaign_status(acos_dec, spend, target_acos)
        health_counts[status] = health_counts.get(status, 0) + 1

        classified.append({
            "campaign_id": cid,
            "name": str(r[1]),
            "type": str(r[2] or "SP"),
            "targeting_type": str(r[3] or ""),
            "budget": budget,
            "spend_30d": round(spend, 2),
            "sales_30d": round(sales, 2),
            "clicks_30d": clicks,
            "impressions_30d": int(r[8] or 0),
            "orders_30d": int(r[9] or 0),
            "acos": round(acos_dec * 100, 1) if acos_dec else None,
            "roas": round(sales / spend, 2) if spend > 0 else None,
            "status": status,
            "depletes_early": depletes_early,
            "zero_conv_terms": zero_conv.get(cid, [])[:15],
        })

    critical = [c for c in classified if c["status"] == "critical" and c["spend_30d"] > 5]
    healthy_with_capacity = [c for c in classified if c["status"] == "healthy" and c["depletes_early"]]

    # ── 6. Budget transfer recommendations ────────────────────────────────
    budget_transfers: list[dict[str, Any]] = []
    used_targets: set[str] = set()

    for source in critical:
        transferable = round(source["budget"] - 5.0, 2) if source["budget"] > 10 else 0.0
        if transferable <= 0:
            continue

        # Find best transfer target (not already used, not same source)
        target = None
        same_product = False

        # Check if there's a same-product healthy campaign
        # Heuristic: first 3-4 significant words overlap
        src_words = set(w.lower() for w in source["name"].split() if len(w) > 3)
        same_prod_candidates = [
            c for c in healthy_with_capacity
            if c["campaign_id"] != source["campaign_id"]
            and c["campaign_id"] not in used_targets
            and len(src_words & set(w.lower() for w in c["name"].split() if len(w) > 3)) >= 1
        ]
        other_candidates = [
            c for c in healthy_with_capacity
            if c["campaign_id"] != source["campaign_id"]
            and c["campaign_id"] not in used_targets
            and c not in same_prod_candidates
        ]

        if same_prod_candidates:
            target = same_prod_candidates[0]
            same_product = True
        elif other_candidates:
            target = other_candidates[0]
            same_product = False

        if target:
            used_targets.add(target["campaign_id"])

        zc_terms = source.get("zero_conv_terms", [])[:15]
        steps = generate_optimization_steps(
            campaign=source,
            zero_conv_terms=zc_terms,
            target_acos=target_acos,
            transfer_amount=transferable,
            transfer_target_name=target["name"] if target else None,
        )

        expected_roas = target["roas"] if target and target["roas"] else 4.0
        weekly_gain = round(transferable * expected_roas * 7, 0) if target else 0

        budget_transfers.append({
            "from_campaign": source["name"],
            "from_acos": source["acos"],
            "from_spend_30d": source["spend_30d"],
            "to_campaign": target["name"] if target else None,
            "to_acos": target["acos"] if target else None,
            "same_product": same_product,
            "transfer_amount": transferable,
            "steps": steps,
            "preserve_note": f"保留 $5/天, 不完全暂停",
            "expected_impact": {
                "from_saved": f"${round(transferable * 7, 0)}/周减少亏损",
                "to_gained": f"+${weekly_gain}/周广告销售",
                "net_weekly_gain": f"${round(transferable * 5 * 7, 0)}",
            },
        })

    # ── 7. Missing coverage ───────────────────────────────────────────────
    missing_coverage: list[dict[str, Any]] = []
    for asin, name in product_names.items():
        matching = match_product_campaigns(asin, name)
        if not matching:
            missing_coverage.append({
                "product": name,
                "asin": asin,
                "missing": "无任何 Campaign",
                "suggestion": "建议用 Launch 策略创建",
            })
        else:
            # Check for missing campaign types
            has_pt = any(
                "product" in cn_lower or "competitor" in cn_lower or "asin" in cn_lower
                for _, cn_lower in matching
            )
            has_sb = any(
                "sb" in cn_lower or "brand" in cn_lower or "headline" in cn_lower
                for _, cn_lower in matching
            )
            if not has_pt:
                comp = _load_h10_competitors(asin)
                if comp:
                    missing_coverage.append({
                        "product": name,
                        "asin": asin,
                        "missing": "无 Product Targeting",
                        "suggestion": f"建议针对 {min(4, len(comp))} 个竞品 ASIN 投放",
                        "competitor_asins": comp[:4],
                    })
            if not has_sb:
                missing_coverage.append({
                    "product": name,
                    "asin": asin,
                    "missing": "无品牌 SB 广告",
                    "suggestion": "建议添加 SB 品牌 Headline 广告",
                })

    # ── 8. Quick wins ─────────────────────────────────────────────────────
    quick_wins: list[dict[str, Any]] = []
    if high_conv_terms:
        total_orders = sum(t["orders"] for t in high_conv_terms)
        total_sales = sum(t["sales"] for t in high_conv_terms)
        avg_acos = sum(t["spend"] for t in high_conv_terms) / max(total_sales, 1) * 100
        quick_wins.append({
            "type": "exact_match_upgrade",
            "action": f"{len(high_conv_terms)} 个高转化搜索词建议加入 Exact Match",
            "impact": f"这些词共 {total_orders} 单, ${total_sales:.0f} 销售, 平均 ACoS {avg_acos:.0f}%",
            "impact_detail": "Exact Match 比 Auto/Broad 精准度更高, 预计 ACoS 降 3-5pp",
            "terms": high_conv_terms,  # full data per term
        })

    capped_budgets = [c for c in classified if c["depletes_early"] and c["status"] == "healthy"]
    if capped_budgets:
        total_budget_gap = sum(c["spend_30d"] / _LOOKBACK_DAYS - c["budget"] for c in capped_budgets)
        quick_wins.append({
            "type": "budget_increase",
            "action": f"{len(capped_budgets)} 个高效 Campaign 预算提前耗尽",
            "impact": f"增加预算约 ${round(total_budget_gap * 7, 0)}/周 可多产出约 4x ROAS 销售额",
            "campaigns": [
                {
                    "name": c["name"],
                    "current_budget": c["budget"],
                    "avg_daily_spend": round(c["spend_30d"] / _LOOKBACK_DAYS, 2),
                    "suggested_budget": round(c["spend_30d"] / _LOOKBACK_DAYS * 1.3, 2),
                    "acos": c["acos"],
                    "roas": c["roas"],
                    "orders_30d": c["orders_30d"],
                    "sales_30d": c["sales_30d"],
                }
                for c in capped_budgets
            ],
        })

    # Build clean campaigns list for the UI (exclude internal optimizer fields)
    campaigns_list = [
        {
            "campaign_id": c["campaign_id"],
            "name": c["name"],
            "type": c["type"],
            "targeting_type": c["targeting_type"],
            "budget": c["budget"],
            "spend_30d": c["spend_30d"],
            "sales_30d": c["sales_30d"],
            "clicks_30d": c["clicks_30d"],
            "impressions_30d": c["impressions_30d"],
            "orders_30d": c["orders_30d"],
            "acos": c["acos"],
            "roas": c["roas"],
            "status": c["status"],
            "depletes_early": c["depletes_early"],
        }
        for c in classified
    ]

    return {
        "generated_at": date.today().isoformat(),
        "target_acos": target_acos,
        "campaign_health": health_counts,
        "total_campaigns": len(classified),
        "campaigns": campaigns_list,
        "budget_transfers": budget_transfers,
        "missing_coverage": missing_coverage[:10],
        "quick_wins": quick_wins,
    }
