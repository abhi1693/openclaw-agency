"""Traffic Sync — SP API sales-traffic report → traffic_daily table.

Calls `node guard.js sales-traffic --days N` and upserts daily session/pageview
data into traffic_daily. Stores both the store-level summary (asin=NULL) and
per-ASIN rows when the API returns them.
"""

from __future__ import annotations

import asyncio
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow

logger = get_logger(__name__)

GUARD_JS = Path.home() / ".openclaw" / "skills" / "amazon-sp-api" / "guard.js"


def _safe_decimal(val: Any) -> Decimal | None:
    try:
        if val is None:
            return None
        return Decimal(str(float(val))).quantize(Decimal("0.01"))
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
        and not line.startswith("[SP]")
    )


async def sync_traffic_from_api(
    session: AsyncSession,
    *,
    days: int = 3,
) -> dict[str, int]:
    """Sync traffic_daily from SP API sales-traffic report.

    Returns dict with 'inserted', 'updated', 'total_processed'.
    """
    rows: list[dict[str, Any]] = []
    try:
        proc = await asyncio.create_subprocess_exec(
            "node", str(GUARD_JS),
            "sales-traffic", "--days", str(days),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60.0)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise RuntimeError("guard.js sales-traffic timed out after 60s")
        if proc.returncode != 0:
            raise RuntimeError(
                f"guard.js sales-traffic failed ({proc.returncode}): {stderr.decode().strip()}"
            )

        raw = _clean_json_stdout(stdout.decode())
        data = json.loads(raw)

        # SP API guard.js returns:
        # { period, rowCount, dailySummaryCount, dailySummary: [...], data: [...] }
        # dailySummary: flat rows with date, sessions, pageViews, buyBoxPct, etc.
        # data: per-ASIN rows (may be empty)
        daily_summary: list[dict] = data.get("dailySummary") or []
        by_asin_rows: list[dict] = data.get("data") or []
        logger.info(
            "traffic_sync: API returned %d summary rows, %d ASIN rows",
            len(daily_summary), len(by_asin_rows),
        )

        # Store-level summary rows (asin = NULL)
        for entry in daily_summary:
            date_str = entry.get("date")
            if not date_str:
                continue
            rows.append({
                "report_date": date_str,
                "asin": None,
                "sessions": int(entry.get("sessions") or 0),
                "page_views": int(entry.get("pageViews") or 0),
                "buy_box_pct": float(entry.get("buyBoxPct") or 0),
                "unit_session_pct": float(entry.get("unitSessionPct") or 0),
                "units_ordered": int(entry.get("unitsOrdered") or 0),
                "ordered_product_sales": float(entry.get("orderedProductSales") or 0),
            })

        # Per-ASIN rows (optional — may be empty)
        for entry in by_asin_rows:
            date_str = entry.get("date")
            asin = entry.get("parentAsin") or entry.get("asin") or entry.get("childAsin")
            if not date_str or not asin:
                continue
            rows.append({
                "report_date": date_str,
                "asin": asin,
                "sessions": int(entry.get("sessions") or 0),
                "page_views": int(entry.get("pageViews") or 0),
                "buy_box_pct": float(entry.get("buyBoxPct") or 0),
                "unit_session_pct": float(entry.get("unitSessionPct") or 0),
                "units_ordered": int(entry.get("unitsOrdered") or 0),
                "ordered_product_sales": float(entry.get("orderedProductSales") or 0),
            })

    except Exception as exc:  # noqa: BLE001
        logger.warning("traffic_sync: failed — %s", exc)
        raise

    if not rows:
        logger.warning("traffic_sync: API returned 0 rows")
        return {"inserted": 0, "updated": 0, "total_processed": 0}

    inserted = updated = 0
    now = utcnow()

    for row in rows:
        result = await session.exec(  # type: ignore[call-overload]
            text("""
                INSERT INTO traffic_daily
                    (id, report_date, asin, sessions, page_views, buy_box_pct,
                     unit_session_pct, units_ordered, ordered_product_sales,
                     synced_at, created_at)
                VALUES
                    (gen_random_uuid(), :report_date, :asin, :sessions, :page_views,
                     :buy_box_pct, :unit_session_pct, :units_ordered,
                     :ordered_product_sales, :synced_at, :created_at)
                ON CONFLICT (report_date, asin)
                DO UPDATE SET
                    sessions = EXCLUDED.sessions,
                    page_views = EXCLUDED.page_views,
                    buy_box_pct = EXCLUDED.buy_box_pct,
                    unit_session_pct = EXCLUDED.unit_session_pct,
                    units_ordered = EXCLUDED.units_ordered,
                    ordered_product_sales = EXCLUDED.ordered_product_sales,
                    synced_at = EXCLUDED.synced_at
                RETURNING (xmax = 0) AS was_inserted
            """),
            params={
                "report_date": row["report_date"],
                "asin": row.get("asin"),
                "sessions": row["sessions"],
                "page_views": row["page_views"],
                "buy_box_pct": _safe_decimal(row.get("buy_box_pct")),
                "unit_session_pct": _safe_decimal(row.get("unit_session_pct")),
                "units_ordered": row["units_ordered"],
                "ordered_product_sales": _safe_decimal(row.get("ordered_product_sales")),
                "synced_at": now,
                "created_at": now,
            },
        )
        row_result = result.first()
        if row_result and row_result[0]:
            inserted += 1
        else:
            updated += 1

    await session.commit()
    logger.info(
        "traffic_sync: %d inserted, %d updated (%d total)", inserted, updated, len(rows)
    )
    return {"inserted": inserted, "updated": updated, "total_processed": len(rows)}
