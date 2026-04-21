"""Tests for PPC proposal staging and dry-run diffs."""

from __future__ import annotations

from datetime import date
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
    BidRecommendation,
    BudgetAllocation,
    KeywordRecommendation,
    PlacementRecommendation,
    PpcEntitySnapshot,
    PpcProposalItem,
)
from app.services.ppc_proposals import (
    approve_proposal,
    compute_proposal_diff,
    create_proposal,
    list_proposals,
    reject_proposal,
)


from tests.aiosqlite_fixtures import register_async_engine
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


def _bid_recommendation(keyword_id: str = "KW-1") -> BidRecommendation:
    return BidRecommendation(
        campaign_id="CAMP-1",
        ad_group_id="AG-1",
        keyword_id=keyword_id,
        match_type="exact",
        current_bid=Decimal("1.00"),
        recommended_bid=Decimal("1.25"),
    )


def _keyword_recommendation() -> KeywordRecommendation:
    return KeywordRecommendation(
        source_campaign_id="CAMP-1",
        search_term="open claw",
        match_type="exact",
        action="add_keyword",
        target_campaign_id="CAMP-1",
    )


@pytest.mark.asyncio
async def test_create_proposal_with_items() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        bid = _bid_recommendation()
        keyword = _keyword_recommendation()
        session.add(bid)
        session.add(keyword)
        await session.commit()

        proposal = await create_proposal(
            session,
            "Launch changes",
            {"bid": [bid.id], "keyword": [keyword.id]},
            created_by="tester",
            description="staged for review",
        )
        await session.commit()

        items = list(
            await session.exec(
                select(PpcProposalItem).where(PpcProposalItem.proposal_id == proposal.id)
            )
        )
        assert proposal.name == "Launch changes"
        assert proposal.status == "staged"
        assert len(items) == 2
        assert {item.recommendation_type for item in items} == {"bid", "keyword"}


@pytest.mark.asyncio
async def test_list_proposals_empty() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        rows, total = await list_proposals(session)
        assert rows == []
        assert total == 0


@pytest.mark.asyncio
async def test_list_proposals_with_data() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        await create_proposal(session, "One", {}, created_by="tester")
        rejected = await create_proposal(session, "Two", {}, created_by="tester")
        rejected.status = "rejected"
        await session.commit()

        rows, total = await list_proposals(session, status="staged")
        assert total == 1
        assert rows[0].name == "One"


@pytest.mark.asyncio
async def test_compute_proposal_diff_bid() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        bid = _bid_recommendation(keyword_id="KW-DIFF")
        snapshot = PpcEntitySnapshot(
            entity_type="keyword",
            entity_id="KW-DIFF",
            campaign_id="CAMP-1",
            ad_group_id="AG-1",
            name="open claw exact",
            bid=Decimal("1.00"),
        )
        session.add(bid)
        session.add(snapshot)
        await session.commit()
        proposal = await create_proposal(session, "Bid diff", {"bid": [bid.id]})
        await session.commit()

        diff = await compute_proposal_diff(session, proposal.id)

        assert diff.summary == {"bids": 1, "keywords": 0, "placements": 0, "budgets": 0}
        assert len(diff.items) == 1
        item = diff.items[0]
        assert item.entity_name == "open claw exact"
        assert item.current_value == "1.00"
        assert item.recommended_value == "1.25"
        assert item.change_pct == 25.0


@pytest.mark.asyncio
async def test_compute_proposal_diff_no_snapshot() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        bid = _bid_recommendation(keyword_id="KW-MISSING")
        session.add(bid)
        await session.commit()
        proposal = await create_proposal(session, "Unknown bid", {"bid": [bid.id]})
        await session.commit()

        diff = await compute_proposal_diff(session, proposal.id)

        assert diff.items[0].entity_id == "KW-MISSING"
        assert diff.items[0].current_value == "unknown"
        assert diff.items[0].change_pct is None


@pytest.mark.asyncio
async def test_compute_proposal_diff_budget() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        budget = BudgetAllocation(
            parent_asin="B00TEST",
            total_daily_budget=Decimal("100.00"),
            sp_pct=Decimal("0.5000"),
            sb_pct=Decimal("0.2500"),
            sd_pct=Decimal("0.2500"),
            sbv_pct=Decimal("0.0000"),
            alloc_date=date(2026, 4, 21),
            recommended_sp_pct=0.6,
            recommended_sb_pct=0.2,
        )
        session.add(budget)
        await session.commit()
        proposal = await create_proposal(session, "Budget diff", {"budget": [budget.id]})
        await session.commit()

        diff = await compute_proposal_diff(session, proposal.id)

        assert diff.summary["budgets"] == 1
        assert [item.field for item in diff.items] == ["sp_pct", "sb_pct"]


@pytest.mark.asyncio
async def test_approve_proposal() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        proposal = await create_proposal(session, "Approve me", {})
        await session.commit()

        approved = await approve_proposal(session, proposal.id, "ops")

        assert approved.status == "approved"
        assert approved.approved_by == "ops"
        assert approved.approved_at is not None


@pytest.mark.asyncio
async def test_reject_proposal() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        proposal = await create_proposal(session, "Reject me", {})
        await session.commit()

        rejected = await reject_proposal(session, proposal.id)

        assert rejected.status == "rejected"


@pytest.mark.asyncio
async def test_api_list_proposals_empty() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/ppc/automation/proposals")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_api_create_get_diff_approve_reject_proposal() -> None:
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        bid = _bid_recommendation(keyword_id="KW-API")
        snapshot = PpcEntitySnapshot(
            entity_type="keyword",
            entity_id="KW-API",
            campaign_id="CAMP-1",
            name="API keyword",
            bid=Decimal("1.00"),
        )
        session.add(bid)
        session.add(snapshot)
        await session.commit()
        bid_id = str(bid.id)

    app = _build_test_app(sm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        create_resp = await ac.post(
            "/ppc/automation/proposals",
            json={
                "name": "API proposal",
                "description": "review",
                "bids": [bid_id],
                "created_by": "api-test",
            },
        )
        assert create_resp.status_code == 200
        proposal_id = create_resp.json()["id"]
        assert create_resp.json()["item_count"] == 1

        get_resp = await ac.get(f"/ppc/automation/proposals/{proposal_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["item_count"] == 1

        diff_resp = await ac.get(f"/ppc/automation/proposals/{proposal_id}/diff")
        assert diff_resp.status_code == 200
        assert diff_resp.json()["items"][0]["current_value"] == "1.0000"

        approve_resp = await ac.post(
            f"/ppc/automation/proposals/{proposal_id}/approve",
            json={"approved_by": "reviewer"},
        )
        assert approve_resp.status_code == 200
        assert approve_resp.json()["status"] == "approved"

        reject_resp = await ac.post(f"/ppc/automation/proposals/{proposal_id}/reject")
        assert reject_resp.status_code == 200
        assert reject_resp.json()["status"] == "rejected"


@pytest.mark.asyncio
async def test_compute_proposal_diff_uses_snapshot_name_not_stored() -> None:
    """When a PlacementRecommendation has a stale campaign_name but a fresh
    PpcEntitySnapshot exists, diff must use the snapshot name.
    """
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        rec = PlacementRecommendation(
            campaign_id="CAMP-STALE",
            campaign_name="Stale Name (wrong)",
            placement="top_of_search",
            current_modifier_pct=0.0,
            recommended_modifier_pct=25.0,
        )
        snapshot = PpcEntitySnapshot(
            entity_type="placement",
            entity_id="CAMP-STALE:top_of_search",
            campaign_id="CAMP-STALE",
            name="Campaign Fresh Name",
            placement="top_of_search",
            placement_modifier_pct=Decimal("0"),
        )
        session.add(rec)
        session.add(snapshot)
        await session.commit()
        proposal = await create_proposal(session, "Placement diff", {"placement": [rec.id]})
        await session.commit()

        diff = await compute_proposal_diff(session, proposal.id)

        assert len(diff.items) == 1
        item = diff.items[0]
        assert item.entity_name == "Campaign Fresh Name", (
            "Must use snapshot name, not stored campaign_name"
        )
        assert item.resolved_campaign_name == "Campaign Fresh Name"
        assert item.current_value == "0"
        assert item.recommended_value == "25.0"


@pytest.mark.asyncio
async def test_compute_proposal_diff_resolved_campaign_name() -> None:
    """Bid diff should include resolved campaign name from snapshot."""
    engine = await _make_engine()
    register_async_engine(engine)
    sm = await _make_session_maker(engine)
    async with sm() as session:
        bid = _bid_recommendation(keyword_id="KW-CAMP")
        keyword_snapshot = PpcEntitySnapshot(
            entity_type="keyword",
            entity_id="KW-CAMP",
            campaign_id="CAMP-NAME-TEST",
            name="my keyword exact",
            bid=Decimal("1.00"),
        )
        campaign_snapshot = PpcEntitySnapshot(
            entity_type="campaign",
            entity_id="CAMP-NAME-TEST",
            name="Resolved Campaign Name",
        )
        session.add(bid)
        session.add(keyword_snapshot)
        session.add(campaign_snapshot)
        await session.commit()
        proposal = await create_proposal(session, "Bid with campaign", {"bid": [bid.id]})
        await session.commit()

        diff = await compute_proposal_diff(session, proposal.id)

        assert len(diff.items) == 1
        item = diff.items[0]
        assert item.entity_name == "my keyword exact"
        assert item.resolved_campaign_name == "Resolved Campaign Name"
