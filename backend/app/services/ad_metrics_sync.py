"""Ad Metrics Sync — aggregates search_term_reports into ad_metrics table.

Why this exists
---------------
`ad_metrics` is the source of truth for campaign-level performance used by:
  - placement_optimizer.py   (ROAS per campaign)
  - tacos_calculator.py      (total ad spend/sales)
  - budget_allocator.py      (ROAS per ad type)
  - bid_optimizer.py         (total revenue baseline)

Amazon's SP reporting API returns search-term-level data, which is ingested
into `search_term_reports`. This service aggregates those rows up to the
campaign + date grain and populates `ad_metrics`.

When to run
-----------
Run once after every `sync_search_terms()` call. The scheduler runs it
automatically before bid optimization. Can also be triggered manually via
the API endpoint.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.amazon_orders import AdMetric

logger = get_logger(__name__)


def _safe_decimal(val: Any) -> Decimal | None:
    try:
        if val is None:
            return None
        return Decimal(str(float(val))).quantize(Decimal("0.0001"))
    except (InvalidOperation, ValueError, TypeError):
        return None


async def sync_ad_metrics_from_search_terms(
    session: AsyncSession,
) -> dict[str, int]:
    """Aggregate search_term_reports → ad_metrics (campaign × date grain).

    Uses INSERT ... ON CONFLICT DO UPDATE for idempotent upsert so this can
    be re-run safely at any time.

    Returns:
        dict with 'inserted', 'updated', and 'total_processed' counts.
    """
    logger.info("ad_metrics_sync: starting aggregation from search_term_reports")

    # Step 1: Aggregate search_term_reports by campaign + report_date.
    # Use COALESCE(campaign_id, campaign_name) so existing rows without
    # campaign_id (pre-fix sync) still contribute to ad_metrics.
    stmt = text("""
        SELECT
            COALESCE(campaign_id, campaign_name, 'unknown') AS campaign_id,
            report_date,
            SUM(impressions) AS total_impressions,
            SUM(clicks)      AS total_clicks,
            SUM(orders)      AS total_orders,
            SUM(units)       AS total_units,
            SUM(spend)       AS total_spend,
            SUM(sales)       AS total_sales
        FROM search_term_reports
        WHERE (campaign_id IS NOT NULL OR campaign_name IS NOT NULL)
          AND report_date IS NOT NULL
        GROUP BY COALESCE(campaign_id, campaign_name, 'unknown'), report_date
        ORDER BY report_date DESC, COALESCE(campaign_id, campaign_name, 'unknown')
    """)
    rows = (await session.exec(stmt)).all()  # type: ignore[arg-type]

    if not rows:
        logger.warning("ad_metrics_sync: no search_term_report rows found — nothing to sync")
        return {"inserted": 0, "updated": 0, "total_processed": 0}

    now = utcnow()
    inserted = 0
    updated = 0

    for row in rows:
        campaign_id: str = row.campaign_id
        report_date: date = row.report_date
        report_date_str = report_date.isoformat() if report_date else "unknown"

        identity_key = f"str_agg_{campaign_id}_{report_date_str}"
        period = report_date_str  # daily period string

        impressions = int(row.total_impressions or 0)
        clicks = int(row.total_clicks or 0)
        orders = int(row.total_orders or 0)
        units = int(row.total_units or 0)
        spend = _safe_decimal(row.total_spend) or Decimal("0")
        sales = _safe_decimal(row.total_sales) or Decimal("0")

        # Derived metrics
        ctr = _safe_decimal(clicks / impressions) if impressions > 0 else None
        cpc = _safe_decimal(float(spend) / clicks) if clicks > 0 else None
        acos = _safe_decimal(float(spend) / float(sales)) if sales and float(sales) > 0 else None
        roas = _safe_decimal(float(sales) / float(spend)) if spend and float(spend) > 0 else None

        # Upsert via raw SQL to handle ON CONFLICT efficiently
        upsert = text("""
            INSERT INTO ad_metrics
                (id, identity_key, campaign_id, period, report_date,
                 spend, sales, impressions, clicks, orders, units,
                 ctr, cpc, acos, roas,
                 synced_at, created_at, updated_at)
            VALUES
                (gen_random_uuid(), :identity_key, :campaign_id, :period, :report_date,
                 :spend, :sales, :impressions, :clicks, :orders, :units,
                 :ctr, :cpc, :acos, :roas,
                 :now, :now, :now)
            ON CONFLICT (identity_key) DO UPDATE SET
                spend        = EXCLUDED.spend,
                sales        = EXCLUDED.sales,
                impressions  = EXCLUDED.impressions,
                clicks       = EXCLUDED.clicks,
                orders       = EXCLUDED.orders,
                units        = EXCLUDED.units,
                ctr          = EXCLUDED.ctr,
                cpc          = EXCLUDED.cpc,
                acos         = EXCLUDED.acos,
                roas         = EXCLUDED.roas,
                synced_at    = EXCLUDED.synced_at,
                updated_at   = EXCLUDED.updated_at
            RETURNING (xmax = 0) AS is_insert
        """)

        result = (await session.exec(  # type: ignore[arg-type]
            upsert,
            params={
                "identity_key": identity_key,
                "campaign_id": campaign_id,
                "period": period,
                "report_date": report_date,
                "spend": float(spend),
                "sales": float(sales),
                "impressions": impressions,
                "clicks": clicks,
                "orders": orders,
                "units": units,
                "ctr": float(ctr) if ctr is not None else None,
                "cpc": float(cpc) if cpc is not None else None,
                "acos": float(acos) if acos is not None else None,
                "roas": float(roas) if roas is not None else None,
                "now": now,
            },
        )).first()

        if result and result.is_insert:
            inserted += 1
        else:
            updated += 1

    await session.commit()

    total = inserted + updated
    logger.info(
        "ad_metrics_sync: done — %d rows processed (%d inserted, %d updated) from %d source rows",
        total, inserted, updated, len(rows),
    )
    return {"inserted": inserted, "updated": updated, "total_processed": total}
