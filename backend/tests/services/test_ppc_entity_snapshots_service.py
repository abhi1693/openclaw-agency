# ruff: noqa: INP001
"""Tests for PPC entity snapshot service helpers."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.time import utcnow
from app.models.amazon_orders import Campaign
from app.models.ppc_automation import PpcEntitySnapshot
from app.services.ppc_entity_snapshots import (
    get_entity_freshness,
    get_sync_status,
    list_entity_snapshots,
    sync_campaign_entity_snapshots,
)


async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


@pytest.mark.asyncio
async def test_list_entity_snapshots_filters_by_state() -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    now = utcnow()
    async with session_maker() as session:
        session.add(
            PpcEntitySnapshot(
                entity_type="campaign",
                entity_id="enabled-1",
                campaign_id="enabled-1",
                name="Enabled",
                state="enabled",
                observed_at=now,
                synced_at=now,
            )
        )
        session.add(
            PpcEntitySnapshot(
                entity_type="campaign",
                entity_id="paused-1",
                campaign_id="paused-1",
                name="Paused",
                state="paused",
                observed_at=now,
                synced_at=now,
            )
        )
        await session.commit()

        result = await list_entity_snapshots(session, state="enabled")

    await engine.dispose()
    assert result.total == 1
    assert result.items[0].entity_id == "enabled-1"
    assert result.limit == 100
    assert result.offset == 0


@pytest.mark.asyncio
async def test_get_entity_freshness_marks_stale_entity_type() -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    old = utcnow() - timedelta(hours=2)
    async with session_maker() as session:
        session.add(
            PpcEntitySnapshot(
                entity_type="campaign",
                entity_id="campaign-1",
                campaign_id="campaign-1",
                state="enabled",
                observed_at=old,
                synced_at=old,
            )
        )
        await session.commit()

        result = await get_entity_freshness(session, stale_after_seconds=60)

    await engine.dispose()
    assert result.stale_after_seconds == 60
    assert len(result.entity_types) == 1
    assert result.entity_types[0].entity_type == "campaign"
    assert result.entity_types[0].total == 1
    assert result.entity_types[0].stale is True


@pytest.mark.asyncio
async def test_get_sync_status_returns_read_only_snapshot_summary() -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    now = utcnow()
    async with session_maker() as session:
        session.add(
            PpcEntitySnapshot(
                entity_type="campaign",
                entity_id="campaign-1",
                campaign_id="campaign-1",
                state="enabled",
                observed_at=now - timedelta(minutes=5),
                synced_at=now,
            )
        )
        await session.commit()

        result = await get_sync_status(session, stale_after_seconds=3600)

    await engine.dispose()
    assert result.snapshot_count == 1
    assert result.latest_synced_at is not None
    assert result.latest_observed_at is not None
    assert result.read_only is True
    assert result.entity_types[0].stale is False


@pytest.mark.asyncio
async def test_sync_campaign_entity_snapshots_materializes_campaigns() -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    now = utcnow()
    async with session_maker() as session:
        session.add(
            Campaign(
                campaign_id="campaign-1",
                campaign_type="sponsoredProducts",
                name="Launch Campaign",
                state="enabled",
                targeting_type="manual",
                budget_amount=Decimal("25.00"),
                budget_type="daily",
                synced_at=now,
            )
        )
        await session.commit()

        result = await sync_campaign_entity_snapshots(session)
        snapshots = await list_entity_snapshots(session)

    await engine.dispose()
    assert result.scanned == 1
    assert result.created == 1
    assert result.updated == 0
    assert snapshots.total == 1
    assert snapshots.items[0].name == "Launch Campaign"
