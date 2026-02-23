"""Background data sync service for Shopify and Meta APIs."""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime
from typing import Any

import httpx
from sqlalchemy import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import async_session_maker
from app.models.mc_models import Brand, PerformanceSnapshot

logger = logging.getLogger(__name__)

import os as _os
SHOPIFY_STORES = [
    {"name": "plentum", "domain": "plentumstore.myshopify.com", "token": _os.environ.get("PLENTUM_SHOPIFY_TOKEN", "")},
    {"name": "mavena", "domain": "e1jy1j-sg.myshopify.com", "token": _os.environ.get("MAVENA_SHOPIFY_TOKEN", "")},
    {"name": "pawfully", "domain": "pawfullyco.myshopify.com", "token": _os.environ.get("PAWFULLY_SHOPIFY_TOKEN", "")},
]

META_ACCOUNTS = [
    {"name": "plentum", "account_id": "act_736405932421739"},
    {"name": "mavena", "account_id": "act_1002679805332780"},
]
META_TOKEN = _os.environ.get("META_SYSTEM_USER_TOKEN", "")


async def sync_shopify_store(store: dict[str, str], session: AsyncSession) -> None:
    """Sync today's orders from a Shopify store."""
    today = date.today().isoformat()
    url = f"https://{store['domain']}/admin/api/2024-01/orders.json"
    headers = {"X-Shopify-Access-Token": store["token"]}
    params = {"status": "any", "created_at_min": f"{today}T00:00:00-05:00", "limit": 250}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code != 200:
                logger.warning(f"Shopify sync failed for {store['name']}: {resp.status_code}")
                return
            orders = resp.json().get("orders", [])

        revenue = sum(float(o.get("total_price", 0)) for o in orders)
        order_count = len(orders)
        aov = round(revenue / order_count, 2) if order_count > 0 else 0

        # Find brand
        brand_q = select(Brand).where(Brand.shopify_store == store["name"])
        result = await session.exec(brand_q)  # type: ignore[arg-type]
        brand = result.first()
        if not brand:
            return

        # Upsert today's snapshot
        snap_q = select(PerformanceSnapshot).where(
            PerformanceSnapshot.brand_id == brand.id,
            PerformanceSnapshot.date == date.today(),
        )
        snap_result = await session.exec(snap_q)  # type: ignore[arg-type]
        snap = snap_result.first()
        if snap:
            snap.revenue = revenue
            snap.orders = order_count
            snap.aov = aov
        else:
            snap = PerformanceSnapshot(
                brand_id=brand.id,
                date=date.today(),
                revenue=revenue,
                orders=order_count,
                aov=aov,
            )
        session.add(snap)
        brand.current_revenue += revenue
        session.add(brand)
        await session.commit()
        logger.info(f"Synced {store['name']}: {order_count} orders, ${revenue:.2f}")
    except Exception as e:
        logger.error(f"Shopify sync error for {store['name']}: {e}")


async def sync_meta_ads(account: dict[str, str], session: AsyncSession) -> None:
    """Sync today's ad spend from Meta."""
    today = date.today().isoformat()
    url = f"https://graph.facebook.com/v19.0/{account['account_id']}/insights"
    params = {
        "access_token": META_TOKEN,
        "time_range": f'{{"since":"{today}","until":"{today}"}}',
        "fields": "spend,impressions,clicks,actions",
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                logger.warning(f"Meta sync failed for {account['name']}: {resp.status_code}")
                return
            data = resp.json().get("data", [])
        if not data:
            return
        row = data[0]
        spend = float(row.get("spend", 0))
        impressions = int(row.get("impressions", 0))
        clicks = int(row.get("clicks", 0))

        brand_q = select(Brand).where(Brand.meta_ad_account == account["account_id"])
        result = await session.exec(brand_q)  # type: ignore[arg-type]
        brand = result.first()
        if not brand:
            return

        snap_q = select(PerformanceSnapshot).where(
            PerformanceSnapshot.brand_id == brand.id,
            PerformanceSnapshot.date == date.today(),
        )
        snap_result = await session.exec(snap_q)  # type: ignore[arg-type]
        snap = snap_result.first()
        if snap:
            snap.ad_spend = spend
            snap.impressions = impressions
            snap.clicks = clicks
            snap.roas = round(snap.revenue / spend, 2) if spend > 0 else 0
        else:
            snap = PerformanceSnapshot(
                brand_id=brand.id,
                date=date.today(),
                ad_spend=spend,
                impressions=impressions,
                clicks=clicks,
            )
        session.add(snap)
        await session.commit()
        logger.info(f"Synced Meta {account['name']}: ${spend:.2f} spend")
    except Exception as e:
        logger.error(f"Meta sync error for {account['name']}: {e}")


async def run_sync_cycle() -> None:
    """Run one full sync cycle."""
    async with async_session_maker() as session:
        for store in SHOPIFY_STORES:
            await sync_shopify_store(store, session)
        for account in META_ACCOUNTS:
            await sync_meta_ads(account, session)


async def start_sync_loop(interval_seconds: int = 300) -> None:
    """Background loop that syncs every interval_seconds."""
    while True:
        try:
            await run_sync_cycle()
        except Exception as e:
            logger.error(f"Sync cycle error: {e}")
        await asyncio.sleep(interval_seconds)
