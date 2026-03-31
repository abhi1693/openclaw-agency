"""Keyword harvesting and negation service.

Reads search_term_reports and generates threshold-based suggestions:
  - harvest: orders >= min_orders AND acos < max_acos_threshold  -> promote to exact keyword
  - negate:  clicks >= min_clicks AND orders == 0               -> add as negative keyword
"""

from __future__ import annotations

from decimal import Decimal

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.amazon_orders import SearchTermReport
from app.models.ppc_automation import KeywordHarvestSuggestion

logger = get_logger(__name__)


async def run_keyword_harvester(
    session: AsyncSession,
    min_orders: int = 2,
    min_clicks: int = 15,
    target_acos: float = 25.0,
) -> dict[str, int]:
    """Generate keyword harvest/negate suggestions from search_term_reports.

    Returns counts of created harvest and negate suggestions.
    """
    # Load all search term report rows
    result = await session.exec(select(SearchTermReport))
    all_rows = result.all()

    # Aggregate by (search_term, campaign_id, campaign_name)
    aggregated: dict[tuple[str, str | None, str | None], dict] = {}
    for row in all_rows:
        key = (row.search_term, row.campaign_id, row.campaign_name)
        if key not in aggregated:
            aggregated[key] = {
                "impressions": 0,
                "clicks": 0,
                "orders": 0,
                "spend": Decimal("0"),
                "sales": Decimal("0"),
            }
        agg = aggregated[key]
        agg["impressions"] += row.impressions
        agg["clicks"] += row.clicks
        agg["orders"] += row.orders
        agg["spend"] += row.spend or Decimal("0")
        agg["sales"] += row.sales or Decimal("0")

    # Determine which search terms already have pending suggestions to avoid dupes
    existing_result = await session.exec(
        select(KeywordHarvestSuggestion).where(
            col(KeywordHarvestSuggestion.status) == "pending"
        )
    )
    existing = existing_result.all()
    existing_keys: set[tuple[str, str | None, str]] = {
        (s.search_term, s.campaign_id, s.action) for s in existing
    }

    acos_threshold = Decimal(str(target_acos)) / Decimal("100")

    harvest_count = 0
    negate_count = 0

    for (search_term, campaign_id, campaign_name), agg in aggregated.items():
        orders = agg["orders"]
        clicks = agg["clicks"]
        spend = agg["spend"]
        sales = agg["sales"]
        computed_acos = (spend / sales) if sales > Decimal("0") else None

        # Harvest: orders >= threshold AND acos < target
        if (harvest_key := (search_term, campaign_id, "harvest")) not in existing_keys:
            if orders >= min_orders and computed_acos is not None and computed_acos < acos_threshold:
                session.add(KeywordHarvestSuggestion(
                    search_term=search_term,
                    campaign_id=campaign_id,
                    campaign_name=campaign_name,
                    impressions=agg["impressions"],
                    clicks=clicks,
                    orders=orders,
                    spend=spend,
                    acos=computed_acos,
                    action="harvest",
                    min_orders_threshold=min_orders,
                    min_clicks_threshold=min_clicks,
                    max_acos_threshold=acos_threshold,
                    status="pending",
                    created_at=utcnow(),
                ))
                existing_keys.add(harvest_key)
                harvest_count += 1

        # Negate: clicks >= threshold AND orders == 0
        if (negate_key := (search_term, campaign_id, "negate")) not in existing_keys:
            if clicks >= min_clicks and orders == 0:
                session.add(KeywordHarvestSuggestion(
                    search_term=search_term,
                    campaign_id=campaign_id,
                    campaign_name=campaign_name,
                    impressions=agg["impressions"],
                    clicks=clicks,
                    orders=0,
                    spend=spend,
                    acos=None,
                    action="negate",
                    min_orders_threshold=min_orders,
                    min_clicks_threshold=min_clicks,
                    max_acos_threshold=acos_threshold,
                    status="pending",
                    created_at=utcnow(),
                ))
                existing_keys.add(negate_key)
                negate_count += 1

    await session.commit()
    logger.info("Keyword harvester: %d harvest, %d negate suggestions created", harvest_count, negate_count)
    return {"harvest": harvest_count, "negate": negate_count}
