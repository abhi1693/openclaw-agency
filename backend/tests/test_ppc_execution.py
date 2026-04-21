"""Tests for PPC proposal execution - locks, retries, and idempotency."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.ppc_automation_api import router as ppc_router
from app.db.session import get_session
from app.models.ppc_automation import (
    BidRecommendation,
    KeywordRecommendation,
    PlacementRecommendation,
    BudgetAllocation,
    PpcEntitySnapshot,
    PpcProposal,
    PpcProposalExecution,
    PpcProposalItem,
    PpcExecutionItem,
)
from app.services.ppc_execution import (
    create_execution_record,
    execute_proposal,
    find_existing_execution,
    get_execution,
    get_latest_execution,
    get_execution_items,
    FEATURE_PPC_LIVE_WRITES,
)
from app.services.ppc_proposals import approve_proposal


# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------


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


async def _seed_approved_proposal(session: AsyncSession) -> PpcProposal:
    """Create a minimal approved proposal with one pending bid recommendation."""
    proposal = PpcProposal(
        name="Test Proposal",
        status="approved",
        created_by="test",
    )
    session.add(proposal)
    await session.flush()

    rec = BidRecommendation(
        campaign_id="CAMP-1",
        ad_group_id="AG-1",
        keyword_id="KW-1",
        match_type="exact",
        current_bid=Decimal("1.00"),
        recommended_bid=Decimal("1.25"),
        status="pending",
    )
    session.add(rec)
    await session.flush()

    item = PpcProposalItem(
        proposal_id=proposal.id,
        recommendation_type="bid",
        recommendation_id=rec.id,
    )
    session.add(item)
    await session.commit()
    return proposal


# ---------------------------------------------------------------------------
# Unit tests - execution record management
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_execution_record():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        key = uuid4()
        exec_rec = await create_execution_record(
            session, proposal.id, key, triggered_by="test"
        )
        await session.commit()
        assert exec_rec.proposal_id == proposal.id
        assert exec_rec.idempotency_key == key
        assert exec_rec.status == "pending"
        assert exec_rec.triggered_by == "test"


@pytest.mark.asyncio
async def test_find_existing_execution_idempotency():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        key = uuid4()

        # First call creates record
        exec1 = await create_execution_record(session, proposal.id, key, "test")
        await session.commit()

    # Second call with same key finds existing
    async with maker() as session:
        existing = await find_existing_execution(session, proposal.id, key)
        assert existing is not None
        assert existing.id == exec1.id

    # Different key finds nothing
    async with maker() as session:
        different = await find_existing_execution(session, proposal.id, uuid4())
        assert different is None


@pytest.mark.asyncio
async def test_get_execution_returns_recent_first():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        key1 = uuid4()
        key2 = uuid4()

        exec1 = await create_execution_record(session, proposal.id, key1, "t1")
        await session.commit()

        exec2 = await create_execution_record(session, proposal.id, key2, "t2")
        await session.commit()

    async with maker() as session:
        rows = await get_execution(session, proposal.id, limit=5)
        assert len(rows) == 2
        # Newest first
        assert rows[0].id == exec2.id
        assert rows[1].id == exec1.id


@pytest.mark.asyncio
async def test_get_latest_execution():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        key1 = uuid4()
        key2 = uuid4()

        await create_execution_record(session, proposal.id, key1, "t1")
        await session.commit()

        latest = await create_execution_record(session, proposal.id, key2, "t2")
        await session.commit()

    async with maker() as session:
        found = await get_latest_execution(session, proposal.id)
        assert found is not None
        assert found.id == latest.id


@pytest.mark.asyncio
async def test_get_latest_execution_none_when_empty():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    async with maker() as session:
        found = await get_latest_execution(session, uuid4())
        assert found is None


# ---------------------------------------------------------------------------
# Integration tests - execute_proposal
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_proposal_requires_approved():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    async with maker() as session:
        # Proposal is in "staged" status
        proposal = PpcProposal(name="Staged", status="staged", created_by="test")
        session.add(proposal)
        await session.commit()

        with pytest.raises(ValueError, match="must be 'approved'"):
            await execute_proposal(session, proposal.id)


@pytest.mark.asyncio
async def test_execute_proposal_not_found():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    async with maker() as session:
        with pytest.raises(ValueError, match="not found"):
            await execute_proposal(session, uuid4())


@pytest.mark.asyncio
async def test_execute_proposal_idempotency_same_key():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)
    key = uuid4()

    # First execution
    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        exec1, items1 = await execute_proposal(session, proposal.id, idempotency_key=key)
        assert exec1.status in ("completed", "failed")

    # Second execution with same key returns same record
    async with maker() as session:
        exec2, items2 = await execute_proposal(session, proposal.id, idempotency_key=key)
        assert exec2.id == exec1.id


@pytest.mark.asyncio
async def test_execute_proposal_different_key_creates_new_record():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        exec1, _ = await execute_proposal(session, proposal.id, idempotency_key=uuid4())

    async with maker() as session:
        exec2, _ = await execute_proposal(session, proposal.id, idempotency_key=uuid4())
        assert exec2.id != exec1.id


@pytest.mark.asyncio
async def test_execute_proposal_skips_items_when_feature_flag_false():
    """When FEATURE_PPC_LIVE_WRITES=False, items are marked skipped."""
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    assert FEATURE_PPC_LIVE_WRITES is False, "Sanity: live writes must be disabled"

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        exec_rec, items = await execute_proposal(session, proposal.id, idempotency_key=uuid4())
        assert exec_rec.status == "completed"
        assert exec_rec.items_applied == 0
        # All items should be skipped (not applied, not failed)
        for item in items:
            assert item.status == "skipped"


@pytest.mark.asyncio
async def test_execute_proposal_creates_execution_items():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        exec_rec, items = await execute_proposal(session, proposal.id, idempotency_key=uuid4())
        assert exec_rec.items_total == 1
        assert len(items) == 1
        assert items[0].recommendation_type == "bid"
        assert items[0].status == "skipped"  # feature flag off


@pytest.mark.asyncio
async def test_execute_proposal_runs_multiple_items():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    async with maker() as session:
        proposal = PpcProposal(name="Multi", status="approved", created_by="test")
        session.add(proposal)
        await session.flush()

        # 3 items: bid, keyword, placement
        bid_rec = BidRecommendation(
            campaign_id="C1", ad_group_id="A1", keyword_id="K1",
            match_type="exact", current_bid=Decimal("1"), recommended_bid=Decimal("1.5"),
        )
        kw_rec = KeywordRecommendation(
            source_campaign_id="C1", search_term="test", match_type="exact",
            action="add_negative",
        )
        place_rec = PlacementRecommendation(
            campaign_id="C1", placement="top_of_search",
            current_modifier_pct=0.0, recommended_modifier_pct=10.0,
        )
        session.add_all([bid_rec, kw_rec, place_rec])
        await session.flush()

        for rec, rtype in [(bid_rec, "bid"), (kw_rec, "keyword"), (place_rec, "placement")]:
            session.add(PpcProposalItem(
                proposal_id=proposal.id,
                recommendation_type=rtype,
                recommendation_id=rec.id,
            ))
        await session.commit()

        exec_rec, items = await execute_proposal(session, proposal.id, idempotency_key=uuid4())
        assert exec_rec.items_total == 3
        assert len(items) == 3
        assert all(i.status == "skipped" for i in items)  # flag is off


@pytest.mark.asyncio
async def test_execute_proposal_respects_max_item_retries():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        # With max_item_retries=0, no retries should be attempted
        exec_rec, items = await execute_proposal(
            session, proposal.id, idempotency_key=uuid4(), max_item_retries=0
        )
        assert exec_rec.status == "completed"
        assert items[0].attempt == 1  # first and only attempt


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_proposal_endpoint_returns_200():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)
    app = _build_test_app(maker)

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        proposal_id = str(proposal.id)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        resp = await client.post(
            f"/ppc/automation/proposals/{proposal_id}/execute",
            json={"triggered_by": "test"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("completed", "failed")
    assert data["proposal_id"] == proposal_id
    assert data["feature_flag_live_writes"] is False


@pytest.mark.asyncio
async def test_execute_proposal_endpoint_idempotency():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)
    app = _build_test_app(maker)

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        proposal_id = str(proposal.id)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        idempotency_key = str(uuid4())
        resp1 = await client.post(
            f"/ppc/automation/proposals/{proposal_id}/execute",
            json={"idempotency_key": idempotency_key},
        )
        resp2 = await client.post(
            f"/ppc/automation/proposals/{proposal_id}/execute",
            json={"idempotency_key": idempotency_key},
        )

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json()["id"] == resp2.json()["id"]


@pytest.mark.asyncio
async def test_list_proposal_executions():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)
    app = _build_test_app(maker)

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        proposal_id = str(proposal.id)
        # Create two executions
        await execute_proposal(session, proposal.id, idempotency_key=uuid4())
        await execute_proposal(session, proposal.id, idempotency_key=uuid4())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        resp = await client.get(
            f"/ppc/automation/proposals/{proposal_id}/executions",
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_get_latest_execution_endpoint():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)
    app = _build_test_app(maker)

    async with maker() as session:
        proposal = await _seed_approved_proposal(session)
        proposal_id = str(proposal.id)
        await execute_proposal(session, proposal.id, idempotency_key=uuid4())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        resp = await client.get(
            f"/ppc/automation/proposals/{proposal_id}/execution/latest",
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "execution" in data
    assert "items" in data
    assert data["feature_flag_live_writes"] is False


@pytest.mark.asyncio
async def test_execute_proposal_endpoint_rejects_unapproved():
    engine = await _make_engine()
    maker = await _make_session_maker(engine)
    app = _build_test_app(maker)

    async with maker() as session:
        proposal = PpcProposal(name="Staged", status="staged", created_by="test")
        session.add(proposal)
        await session.commit()
        await session.refresh(proposal)
        proposal_id = str(proposal.id)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        resp = await client.post(
            f"/ppc/automation/proposals/{proposal_id}/execute",
            json={},
        )
    assert resp.status_code == 400
    assert "approved" in resp.json()["detail"]
