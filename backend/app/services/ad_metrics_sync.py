"""Ad Metrics Sync — primary: Ads API per-campaign daily data; fallback: search_term aggregation.

Primary path
------------
Calls `node guard.js performance --campaigns --daily --days N` to fetch true per-campaign
daily rows from the Amazon Advertising Reporting API (timeUnit=DAILY). This gives accurate
campaign_id values and real daily-grain data.

Fallback path
-------------
If the Ads API call fails (network, credentials, report timeout), falls back to aggregating
search_term_reports by campaign × date — the same logic that was the sole implementation
before this rewrite.

ad_metrics table: identity_key (unique), campaign_id, period, report_date,
                  spend, sales, impressions, clicks, orders, units, ctr, cpc, acos, roas
"""

from __future__ import annotations

import asyncio
import json
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow

logger = get_logger(__name__)

GUARD_JS = Path.home() / ".openclaw" / "skills" / "amazon-advertising" / "guard.js"


def _safe_decimal(val: Any) -> Decimal | None:
    try:
        if val is None:
            return None
        return Decimal(str(float(val))).quantize(Decimal("0.0001"))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _clean_json_stdout(stdout: str) -> str:
    return "\n".join(
        line
        for line in stdout.splitlines()
        if line.strip()
        and not line.startswith("[dotenv")
        and not line.startswith("[Auth]")
        and not line.startswith("[Report]")
    )


async def sync_ad_metrics_from_api(
    session: AsyncSession,
    *,
    days: int = 30,
) -> dict[str, int]:
    """Sync ad_metrics from Ads API (DAILY campaign report).

    Falls back to search_term_reports aggregation if the API call fails.

    Returns dict with 'inserted', 'updated', 'total_processed', 'source'.
    """
    # ── Primary: Ads API ─────────────────────────────────────────────────────
    rows: list[dict[str, Any]] = []
    source = "ads_api"
    try:
        proc = await asyncio.create_subprocess_exec(
            "node", str(GUARD_JS),
            "performance", "--campaigns", "--daily", "--days", str(days),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"guard.js failed ({proc.returncode}): {stderr.decode().strip()}")

        raw = _clean_json_stdout(stdout.decode())
        data = json.loads(raw)
        rows = list(data.get("rows") or [])
        logger.info("ad_metrics_sync: Ads API returned %d rows", len(rows))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "ad_metrics_sync: Ads API failed (%s), falling back to search_term aggregation", exc
        )
        return await sync_ad_metrics_from_search_terms(session)

    if not rows:
        logger.warning("ad_metrics_sync: Ads API returned 0 rows, falling back")
        return await sync_ad_metrics_from_search_terms(session)

    # ── Upsert rows ───────────────────────────────────────────────────────────
    now = utcnow()
    inserted = 0
    updated = 0

    for row in rows:
        campaign_id: str = str(row.get("campaignId") or row.get("campaignName") or "unknown").strip()
        date_str: str = str(row.get("date") or "").strip()
        if not date_str:
            continue

        try:
            report_date: date = date.fromisoformat(date_str)
        except ValueError:
            continue

        identity_key = f"ads_api_{campaign_id}_{date_str}"
        period = date_str

        impressions = int(row.get("impressions") or 0)
        clicks = int(row.get("clicks") or 0)
        orders = int(row.get("purchases7d") or 0)
        units = int(row.get("unitsSoldClicks7d") or 0)
        spend = _safe_decimal(row.get("cost")) or Decimal("0")
        sales = _safe_decimal(row.get("sales7d")) or Decimal("0")

        ctr = _safe_decimal(clicks / impressions) if impressions > 0 else None
        cpc = _safe_decimal(float(spend) / clicks) if clicks > 0 else None
        acos = _safe_decimal(float(spend) / float(sales)) if sales and float(sales) > 0 else None
        roas = _safe_decimal(float(sales) / float(spend)) if spend and float(spend) > 0 else None

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
        "ad_metrics_sync: done (Ads API) — %d rows (%d inserted, %d updated)",
        total, inserted, updated,
    )
    return {"inserted": inserted, "updated": updated, "total_processed": total, "source": source}


async def sync_ad_metrics_from_search_terms(
    session: AsyncSession,
) -> dict[str, int]:
    """Aggregate search_term_reports → ad_metrics (campaign × date grain).

    Fallback path used when Ads API is unavailable. Uses INSERT ... ON CONFLICT DO UPDATE
    for idempotent upsert so this can be re-run safely at any time.

    Returns dict with 'inserted', 'updated', 'total_processed'.
    """
    logger.info("ad_metrics_sync: starting aggregation from search_term_reports (fallback)")

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
        return {"inserted": 0, "updated": 0, "total_processed": 0, "source": "search_term_fallback"}

    now = utcnow()
    inserted = 0
    updated = 0

    for row in rows:
        campaign_id: str = row.campaign_id
        report_date: date = row.report_date
        report_date_str = report_date.isoformat() if report_date else "unknown"

        identity_key = f"str_agg_{campaign_id}_{report_date_str}"
        period = report_date_str

        impressions = int(row.total_impressions or 0)
        clicks = int(row.total_clicks or 0)
        orders = int(row.total_orders or 0)
        units = int(row.total_units or 0)
        spend = _safe_decimal(row.total_spend) or Decimal("0")
        sales = _safe_decimal(row.total_sales) or Decimal("0")

        ctr = _safe_decimal(clicks / impressions) if impressions > 0 else None
        cpc = _safe_decimal(float(spend) / clicks) if clicks > 0 else None
        acos = _safe_decimal(float(spend) / float(sales)) if sales and float(sales) > 0 else None
        roas = _safe_decimal(float(sales) / float(spend)) if spend and float(spend) > 0 else None

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
        "ad_metrics_sync: done (search_term fallback) — %d rows (%d inserted, %d updated) from %d source rows",
        total, inserted, updated, len(rows),
    )
    return {"inserted": inserted, "updated": updated, "total_processed": total, "source": "search_term_fallback"}
