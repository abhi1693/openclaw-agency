"""Tests for PPC keyword recommendation ad-group resolution endpoints."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.ppc_automation_api import router as ppc_router
from app.db.session import get_session
from app.models.ppc_automation import (
    KeywordRecommendation,
    PpcEntitySnapshot,
)


async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


async def _make_session_maker(
    engine: AsyncEngine,
) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


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


def _ad_group_snapshot(
    entity_id: str,
    campaign_id: str,
    name: str = "Test Ad Group",
    state: str = "enabled",
) -> PpcEntitySnapshot:
    return PpcEntitySnapshot(
        entity_type="ad_group",
        entity_id=entity_id,
        campaign_id=campaign_id,
        name=name,
        state=state,
        targeting_type="auto",
        bid=Decimal("0.75"),
    )


def _keyword_rec(
    source_campaign_id: str = "CAMP-1",
    action: str = "add_keyword",
    target_campaign_id: str | None = "CAMP-1",
    target_ad_group_id: str | None = None,
) -> KeywordRecommendation:
    return KeywordRecommendation(
        source_campaign_id=source_campaign_id,
        search_term="open claw",
        match_type="exact",
        action=action,
        target_campaign_id=target_campaign_id,
        target_ad_group_id=target_ad_group_id,
    )


# ---------------------------------------------------------------------------
# GET /ppc/automation/campaigns/{campaign_id}/ad-groups
# ---------------------------------------------------------------------------

AC_GROUP_ID_1 = "AG-001"
AC_GROUP_ID_2 = "AG-002"
AC_CAMPAIGN_ID = "CAMP-ADG"


@pytest.mark.asyncio
async def test_list_campaign_ad_groups_empty() -> None:
    engine = await _make_engine()
    sm = await _make_session_maker(engine)
    app = _build_test_app(sm)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        resp = await ac.get(f"/ppc/automation/campaigns/{AC_CAMPAIGN_ID}/ad-groups")
    assert resp.status_code == 200
    data = resp.json()
    assert data["campaign_id"] == AC_CAMPAIGN_ID
    assert data["ad_groups"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_campaign_ad_groups_returns_matching_groups() -> None:
    engine = await _make_engine()
    sm = await _make_session_maker(engine)
    async with sm() as session:
        session.add(_ad_group_snapshot(AC_GROUP_ID_1, AC_CAMPAIGN_ID, name="Exact Match AG"))
        session.add(_ad_group_snapshot("AG-OTHER", "OTHER-CAMP", name="Other Campaign AG"))
        session.add(_ad_group_snapshot(AC_GROUP_ID_2, AC_CAMPAIGN_ID, name="Second AG"))
        await session.commit()

    app = _build_test_app(sm)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        resp = await ac.get(f"/ppc/automation/campaigns/{AC_CAMPAIGN_ID}/ad-groups")

    assert resp.status_code == 200
    data = resp.json()
    assert data["campaign_id"] == AC_CAMPAIGN_ID
    assert data["total"] == 2
    entity_ids = {ag["entity_id"] for ag in data["ad_groups"]}
    assert entity_ids == {AC_GROUP_ID_1, AC_GROUP_ID_2}


@pytest.mark.asyncio
async def test_list_campaign_ad_groups_includes_snapshot_fields() -> None:
    engine = await _make_engine()
    sm = await _make_session_maker(engine)
    async with sm() as session:
        session.add(_ad_group_snapshot(AC_GROUP_ID_1, AC_CAMPAIGN_ID, name="My AG", state="enabled"))
        await session.commit()

    app = _build_test_app(sm)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        resp = await ac.get(f"/ppc/automation/campaigns/{AC_CAMPAIGN_ID}/ad-groups")

    assert resp.status_code == 200
    ag = resp.json()["ad_groups"][0]
    assert ag["entity_id"] == AC_GROUP_ID_1
    assert ag["name"] == "My AG"
    assert ag["campaign_id"] == AC_CAMPAIGN_ID
    assert ag["state"] == "enabled"


# ---------------------------------------------------------------------------
# PATCH /ppc/automation/keyword-recommendations/{rec_id}/resolve-ad-group
# ---------------------------------------------------------------------------

RESOLVE_CAMPAIGN_ID = "CAMP-RESOLVE"


@pytest.mark.asyncio
async def test_resolve_ad_group_sets_target_ad_group_id() -> None:
    engine = await _make_engine()
    sm = await _make_session_maker(engine)
    async with sm() as session:
        # Add a matching ad-group snapshot so the campaign membership check passes
        session.add(_ad_group_snapshot("AG-NEW", RESOLVE_CAMPAIGN_ID))
        rec = _keyword_rec(target_campaign_id=RESOLVE_CAMPAIGN_ID)
        session.add(rec)
        await session.commit()
        rec_id = rec.id

    app = _build_test_app(sm)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        resp = await ac.patch(
            f"/ppc/automation/keyword-recommendations/{rec_id}/resolve-ad-group",
            json={"ad_group_id": "AG-NEW"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["target_ad_group_id"] == "AG-NEW"
    assert data["target_campaign_id"] == RESOLVE_CAMPAIGN_ID
    assert data["action"] == "add_keyword"


@pytest.mark.asyncio
async def test_resolve_ad_group_validates_campaign_membership() -> None:
    engine = await _make_engine()
    sm = await _make_session_maker(engine)
    async with sm() as session:
        # Ad group belongs to CAMP-A but the recommendation targets CAMP-B
        rec = KeywordRecommendation(
            source_campaign_id="CAMP-A",
            search_term="open claw",
            match_type="exact",
            action="add_keyword",
            target_campaign_id="CAMP-B",  # different campaign
        )
        session.add(rec)
        await session.commit()
        rec_id = rec.id

    app = _build_test_app(sm)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        resp = await ac.patch(
            f"/ppc/automation/keyword-recommendations/{rec_id}/resolve-ad-group",
            json={"ad_group_id": "AG-FROM-CAMP-A"},
        )

    assert resp.status_code == 400
    assert "does not belong to campaign" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_resolve_ad_group_allows_any_ad_group_when_no_target_campaign() -> None:
    """When target_campaign_id is null, skip campaign validation (user must choose wisely)."""
    engine = await _make_engine()
    sm = await _make_session_maker(engine)
    async with sm() as session:
        rec = KeywordRecommendation(
            source_campaign_id="CAMP-A",
            search_term="open claw",
            match_type="exact",
            action="add_keyword",
            target_campaign_id=None,  # not yet set
        )
        session.add(rec)
        await session.commit()
        rec_id = rec.id

    app = _build_test_app(sm)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        resp = await ac.patch(
            f"/ppc/automation/keyword-recommendations/{rec_id}/resolve-ad-group",
            json={"ad_group_id": "AG-ANY-CAMPAIGN"},
        )

    assert resp.status_code == 200
    assert resp.json()["target_ad_group_id"] == "AG-ANY-CAMPAIGN"


@pytest.mark.asyncio
async def test_resolve_ad_group_rejects_add_negative_action() -> None:
    engine = await _make_engine()
    sm = await _make_session_maker(engine)
    async with sm() as session:
        rec = _keyword_rec(action="add_negative")
        session.add(rec)
        await session.commit()
        rec_id = rec.id

    app = _build_test_app(sm)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        resp = await ac.patch(
            f"/ppc/automation/keyword-recommendations/{rec_id}/resolve-ad-group",
            json={"ad_group_id": "AG-1"},
        )

    assert resp.status_code == 400
    assert "add_keyword" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_resolve_ad_group_returns_404_for_unknown_rec() -> None:
    engine = await _make_engine()
    sm = await _make_session_maker(engine)
    app = _build_test_app(sm)

    fake_id = str(uuid4())
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        resp = await ac.patch(
            f"/ppc/automation/keyword-recommendations/{fake_id}/resolve-ad-group",
            json={"ad_group_id": "AG-1"},
        )

    assert resp.status_code == 404
