#!/usr/bin/env python3
"""Import existing H10 Cerebro keyword data into keyword_rankings DB table."""

from __future__ import annotations

import asyncio
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from uuid import uuid4

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.models.amazon_orders import KeywordRanking


DATA_ROOT = Path.home() / ".openclaw/skills/h10-browser/data"
BY_ASIN_DIR = DATA_ROOT / "by-asin"
RAW_DIR = DATA_ROOT / "raw"


def parse_snapshot_date(filename: str) -> date | None:
    """Extract date from filename like '2026-03-04.json' or 'cerebro_2026-03-04.json'."""
    match = re.search(r"(\d{4}-\d{2}-\d{2})", filename)
    if match:
        return date.fromisoformat(match.group(1))
    return None


def _to_int(val) -> int | None:
    """Coerce a value to int, returning None for unparseable strings like '-', '>3000', '8%'."""
    if val is None:
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, float):
        return int(val)
    s = str(val).strip().lstrip(">").rstrip("%").replace(",", "")
    if s in ("-", "", "N/A", "n/a"):
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def _to_float(val) -> float | None:
    """Coerce a value to float, returning None for unparseable strings."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().lstrip(">").rstrip("%").replace(",", "")
    if s in ("-", "", "N/A", "n/a"):
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _to_str(val) -> str | None:
    """Return string or None."""
    if val is None:
        return None
    s = str(val).strip()
    return s if s and s not in ("-", "N/A") else None


def parse_keywords_from_data(data: dict, asin: str, snapshot_date: date) -> list[dict]:
    """Parse keyword entries from a Cerebro JSON payload."""
    keywords = data.get("keywords", [])
    rows = []
    for kw in keywords:
        if not isinstance(kw, dict):
            continue
        keyword_text = kw.get("keyword", "").strip()
        if not keyword_text:
            continue
        rows.append({
            "id": uuid4(),
            "asin": asin,
            "keyword": keyword_text,
            "organic_rank": _to_int(kw.get("organic_rank")),
            "sponsored_rank": _to_int(kw.get("sponsored_rank")),
            "search_volume": _to_int(kw.get("search_volume")),
            "search_volume_trend": _to_str(kw.get("search_volume_trend")),
            "click_share": _to_float(kw.get("click_share")),
            "conversion_share": _to_float(kw.get("conversion_share")),
            "cerebro_iq_score": _to_float(kw.get("cerebro_iq_score")),
            "competing_products": _to_int(kw.get("competing_products")),
            "sponsored_asins": _to_int(kw.get("sponsored_asins")),
            "suggested_ppc_bid": _to_float(kw.get("suggested_ppc_bid")),
            "title_density": _to_int(kw.get("title_density")),
            "cpr": _to_int(kw.get("cpr")),
            "source": "h10_cerebro",
            "snapshot_date": snapshot_date,
            "created_at": datetime.now(),
        })
    return rows


async def import_all() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)  # type: ignore

    all_rows: list[dict] = []
    seen_keys: set[tuple] = set()

    # 1. by-asin/*/keywords/*.json
    if BY_ASIN_DIR.exists():
        for asin_dir in sorted(BY_ASIN_DIR.iterdir()):
            if not asin_dir.is_dir():
                continue
            asin = asin_dir.name
            kw_dir = asin_dir / "keywords"
            if not kw_dir.exists():
                continue
            for json_file in sorted(kw_dir.glob("*.json")):
                snapshot_date = parse_snapshot_date(json_file.name)
                if not snapshot_date:
                    print(f"  Skipping {json_file.name} — no date in filename")
                    continue
                try:
                    with open(json_file) as f:
                        data = json.load(f)
                    rows = parse_keywords_from_data(data, asin, snapshot_date)
                    added = 0
                    for r in rows:
                        k = (r["asin"], r["keyword"], r["snapshot_date"])
                        if k not in seen_keys:
                            seen_keys.add(k)
                            all_rows.append(r)
                            added += 1
                    print(f"  {asin}/{json_file.name}: {len(rows)} parsed, {added} unique")
                except Exception as e:
                    print(f"  ERROR {json_file}: {e}")
    else:
        print(f"  by-asin dir not found: {BY_ASIN_DIR}")

    # 2. raw/*/cerebro_*.json
    if RAW_DIR.exists():
        for asin_dir in sorted(RAW_DIR.iterdir()):
            if not asin_dir.is_dir():
                continue
            asin = asin_dir.name
            for json_file in sorted(asin_dir.glob("cerebro_*.json")):
                snapshot_date = parse_snapshot_date(json_file.name)
                if not snapshot_date:
                    continue
                try:
                    with open(json_file) as f:
                        data = json.load(f)
                    rows = parse_keywords_from_data(data, asin, snapshot_date)
                    added = 0
                    for r in rows:
                        k = (r["asin"], r["keyword"], r["snapshot_date"])
                        if k not in seen_keys:
                            seen_keys.add(k)
                            all_rows.append(r)
                            added += 1
                    if added:
                        print(f"  raw/{asin}/{json_file.name}: {added} new unique keywords")
                except Exception as e:
                    print(f"  ERROR {json_file}: {e}")
    else:
        print(f"  raw dir not found: {RAW_DIR}")

    print(f"\nTotal unique rows to insert: {len(all_rows)}")

    if not all_rows:
        print("Nothing to import.")
        await engine.dispose()
        return

    async with async_session() as session:
        stmt = pg_insert(KeywordRanking).values(all_rows)
        stmt = stmt.on_conflict_do_nothing(constraint="uq_keyword_ranking_identity")
        await session.execute(stmt)
        await session.commit()
        print("Insert complete.")

    # Verify
    async with async_session() as session:
        count_stmt = select(func.count()).select_from(KeywordRanking)  # type: ignore
        result = await session.exec(count_stmt)
        total = result.one()
        print(f"✅ DB now has {total} rows in keyword_rankings.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(import_all())
