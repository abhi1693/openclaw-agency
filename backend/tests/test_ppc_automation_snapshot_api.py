"""Service + API tests for PPC entity snapshots (read-only)."""

from __future__ import annotations

import pytest
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.amazon_orders import Campaign
from app.models.ppc_automation import PpcEntitySnapshot
from app.services.ppc_entity_snapshots import (
    get_entity_freshness,
    get_sync_status,
    list_entity_snapshots,
    sync_campaign_entity_snapshots,
)
from app.db.session import get_session
from app.api.ppc_automation_api import router as ppc_router


# ---------------------------------------------------------------------------
# Helpers (plain async defs, not fixtures — match repo test style)
# ---------------------------------------------------------------------------


from tests.aiosqlite_fixtures import register_async_engine
async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


def _build_test_app(
    session_maker: async_sessionmaker[AsyncSession],
) -> FastAPI:
    app = FastAPI()
    app.include_router(ppc_router)

    async def _override_get_session() -> AsyncSession:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session
    return app


async def _make_session_maker(
    engine: AsyncEngine,
) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ---------------------------------------------------------------------------
# Service: list_entity_snapshots
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_entity_snapshots_empty() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        result = await list_entity_snapshots(session)
        assert result.total == 0
        assert result.items == []


@pytest.mark.asyncio
async def test_list_entity_snapshots_with_snapshots() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c1 = Campaign(
            id=uuid4(), campaign_id="SNAP-001", name="Campaign 1",
            campaign_type="sp", state="enabled", targeting_type="auto",
            budget_amount=Decimal("100.00"), budget_type="daily",
            synced_at=datetime(2026, 4, 20, 12, 0, 0, tzinfo=timezone.utc),
        )
        c2 = Campaign(
            id=uuid4(), campaign_id="SNAP-002", name="Campaign 2",
            campaign_type="sb", state="paused", targeting_type="manual",
            budget_amount=Decimal("50.00"), budget_type="lifetime",
            synced_at=datetime(2026, 4, 20, 13, 0, 0, tzinfo=timezone.utc),
        )
        for c in [c1, c2]:
            session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
        result = await list_entity_snapshots(session)
        assert result.total == 2
        assert len(result.items) == 2
        assert result.items[0].entity_type == "campaign"


@pytest.mark.asyncio
async def test_list_entity_snapshots_filter_by_state() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c1 = Campaign(
            id=uuid4(), campaign_id="SNAP-EN-001", name="Enabled C",
            campaign_type="sp", state="enabled", synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        c2 = Campaign(
            id=uuid4(), campaign_id="SNAP-PA-001", name="Paused C",
            campaign_type="sp", state="paused", synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        for c in [c1, c2]:
            session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
        enabled = await list_entity_snapshots(session, state="enabled")
        assert all(item.state == "enabled" for item in enabled.items)
        paused = await list_entity_snapshots(session, state="paused")
        assert all(item.state == "paused" for item in paused.items)


@pytest.mark.asyncio
async def test_list_entity_snapshots_pagination() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        for i in range(3):
            c = Campaign(
                id=uuid4(), campaign_id=f"SNAP-PAGE-{i}", name=f"C {i}",
                campaign_type="sp", state="enabled",
                synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
            )
            session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
        result = await list_entity_snapshots(session, limit=1, offset=0)
        assert len(result.items) == 1
        assert result.total == 3
        assert result.offset == 0
        assert result.limit == 1


# ---------------------------------------------------------------------------
# Service: get_entity_freshness
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_entity_freshness_empty() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        result = await get_entity_freshness(session, stale_after_seconds=3600)
        assert result.snapshot_count == 0
        assert result.entity_types == []


@pytest.mark.asyncio
async def test_get_entity_freshness_with_data() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="FRESH-001", name="Fresh C",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
        result = await get_entity_freshness(session, stale_after_seconds=3600)
        assert result.snapshot_count == 1
        assert len(result.entity_types) == 1
        assert result.entity_types[0].entity_type == "campaign"


# ---------------------------------------------------------------------------
# Service: get_sync_status
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_sync_status_empty() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        result = await get_sync_status(session)
        assert result.snapshot_count == 0
        assert result.read_only is True


@pytest.mark.asyncio
async def test_get_sync_status_with_data() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="STATUS-001", name="Status C",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
        result = await get_sync_status(session)
        assert result.snapshot_count == 1
        assert result.read_only is True


# ---------------------------------------------------------------------------
# Service: sync_campaign_entity_snapshots
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sync_campaign_snapshots_empty() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        result = await sync_campaign_entity_snapshots(session)
        assert result.scanned == 0


@pytest.mark.asyncio
async def test_sync_campaign_snapshots_creates() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="SYNC-C-001", name="Sync C",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
        result = await sync_campaign_entity_snapshots(session)
        assert result.scanned == 1
        assert result.created == 1
        assert result.updated == 0


@pytest.mark.asyncio
async def test_sync_campaign_snapshots_idempotent() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="SYNC-IDEM-001", name="Idempotent C",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
        result2 = await sync_campaign_entity_snapshots(session)
        assert result2.scanned == 1
        assert result2.created == 0
        assert result2.updated == 1


@pytest.mark.asyncio
async def test_sync_campaign_snapshots_skips_when_campaign_id_is_empty_string() -> None:
    """A campaign with an empty-string campaign_id is skipped during snapshot sync."""
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="", name="Empty-ID Campaign",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
        result = await sync_campaign_entity_snapshots(session)
        assert result.scanned == 1
        assert result.skipped == 1
        assert result.created == 0


# ---------------------------------------------------------------------------
# API: GET /ppc/automation/snapshots
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_api_list_snapshots_empty() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/snapshots")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data


@pytest.mark.asyncio
async def test_api_list_snapshots_with_data() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c1 = Campaign(
            id=uuid4(), campaign_id="API-SNAP-001", name="API C1",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        c2 = Campaign(
            id=uuid4(), campaign_id="API-SNAP-002", name="API C2",
            campaign_type="sb", state="paused",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        for c in [c1, c2]:
            session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/snapshots")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2


@pytest.mark.asyncio
async def test_api_list_snapshots_filter_by_entity_type() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="API-FILTER-001", name="API Filter C",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/snapshots?entity_type=campaign")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1
        resp2 = await ac.get("/ppc/automation/snapshots?entity_type=nonexistent")
        assert resp2.json()["total"] == 0


@pytest.mark.asyncio
async def test_api_list_snapshots_filter_by_state() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="API-STATE-001", name="API State C",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/snapshots?state=enabled")
        assert resp.status_code == 200
        assert all(item["state"] == "enabled" for item in resp.json()["items"])


@pytest.mark.asyncio
async def test_api_list_snapshots_pagination() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        for i in range(3):
            c = Campaign(
                id=uuid4(), campaign_id=f"API-PAGE-{i}", name=f"API Page C{i}",
                campaign_type="sp", state="enabled",
                synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
            )
            session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/snapshots?limit=1&offset=0")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        assert data["total"] == 3


@pytest.mark.asyncio
async def test_api_list_snapshots_limit_validation() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/snapshots?limit=0")
        assert resp.status_code == 422
        resp2 = await ac.get("/ppc/automation/snapshots?limit=1000")
        assert resp2.status_code == 422


# ---------------------------------------------------------------------------
# API: GET /ppc/automation/freshness
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_api_freshness_empty() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/freshness")
        assert resp.status_code == 200
        data = resp.json()
        assert "entity_types" in data


@pytest.mark.asyncio
async def test_api_freshness_with_data() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="API-FRESH-001", name="API Fresh C",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/freshness")
        assert resp.status_code == 200
        assert resp.json()["snapshot_count"] == 1


@pytest.mark.asyncio
async def test_api_freshness_stale_param() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="API-FRESH-P-001", name="API Fresh P C",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/freshness?stale_after_seconds=86400")
        assert resp.status_code == 200
        assert resp.json()["stale_after_seconds"] == 86400


# ---------------------------------------------------------------------------
# API: GET /ppc/automation/sync/status
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_api_sync_status_empty() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/sync/status")
        assert resp.status_code == 200
        assert resp.json()["read_only"] is True


@pytest.mark.asyncio
async def test_api_sync_status_with_data() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="API-STAT-001", name="API Stat C",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/sync/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["snapshot_count"] == 1
        assert data["read_only"] is True


# ---------------------------------------------------------------------------
# API: POST /ppc/automation/sync/snapshots
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_api_manual_sync_triggers_materialization() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="API-SYNC-001", name="API Sync C",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/snapshots")
        assert resp.json()["total"] == 0
        resp = await ac.post("/ppc/automation/sync/snapshots")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source"] == "campaigns"
        assert data["created"] == 1
        assert data["read_only"] is True
        resp = await ac.get("/ppc/automation/snapshots")
        assert resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_api_manual_sync_idempotent() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        c = Campaign(
            id=uuid4(), campaign_id="API-IDEM-001", name="API Idem C",
            campaign_type="sp", state="enabled",
            synced_at=datetime(2026, 4, 20, tzinfo=timezone.utc),
        )
        session.add(c)
        await session.commit()
        await sync_campaign_entity_snapshots(session)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/ppc/automation/sync/snapshots")
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 0
        assert data["updated"] == 1
