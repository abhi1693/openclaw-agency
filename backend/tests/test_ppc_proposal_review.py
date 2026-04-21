"""Tests for the unified proposal review endpoint."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.ppc_automation_api import router as ppc_router
from app.db.session import get_session
from app.models.ppc_automation import (
    BidRecommendation,
    KeywordRecommendation,
    PpcProposal,
    PpcProposalItem,
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


def _build_test_app(session_maker: async_sessionmaker[AsyncSession]) -> FastAPI:
    app = FastAPI()
    app.include_router(ppc_router)

    async def _override_get_session() -> AsyncSession:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session
    return app


async def _seed_proposal_with_items(
    session: AsyncSession,
    status: str = "pending",
) -> PpcProposal:
    """Create a proposal with bid and keyword items."""
    proposal = PpcProposal(name="Review Test Proposal", status=status, created_by="test")
    session.add(proposal)
    await session.flush()

    bid_rec = BidRecommendation(
        campaign_id="CAMP-1",
        ad_group_id="AG-1",
        keyword_id="KW-1",
        match_type="exact",
        current_bid=Decimal("1.00"),
        recommended_bid=Decimal("1.25"),
        status="pending",
    )
    session.add(bid_rec)
    await session.flush()

    kw_rec = KeywordRecommendation(
        source_campaign_id="CAMP-1",
        action="add_keyword",
        search_term="test keyword",
        match_type="exact",
        target_campaign_id="CAMP-1",
        target_ad_group_id=None,
        status="pending",
        confidence=0.8,
    )
    session.add(kw_rec)
    await session.flush()

    session.add(
        PpcProposalItem(
            proposal_id=proposal.id,
            recommendation_type="bid",
            recommendation_id=bid_rec.id,
        )
    )
    session.add(
        PpcProposalItem(
            proposal_id=proposal.id,
            recommendation_type="keyword",
            recommendation_id=kw_rec.id,
        )
    )
    await session.commit()
    await session.refresh(proposal)
    return proposal


@pytest.mark.asyncio
async def test_proposal_review_returns_proposal_and_items() -> None:
    """GET /proposals/{id}/review returns proposal, items, readiness, diff, executions."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)
    app = _build_test_app(session_maker)

    async with session_maker() as session:
        proposal = await _seed_proposal_with_items(session)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/ppc/automation/proposals/{proposal.id}/review")

    assert response.status_code == 200
    data = response.json()
    assert data["proposal"]["name"] == "Review Test Proposal"
    assert data["proposal"]["status"] == "pending"
    assert len(data["items"]) == 2
    assert data["readiness"] is not None
    assert data["readiness"]["all_ready"] is False
    assert data["readiness"]["total"] == 2
    assert data["diff"] is not None
    assert data["executions"] == []
    assert data["feature_flag_live_writes"] is False


@pytest.mark.asyncio
async def test_proposal_review_404_for_unknown_proposal() -> None:
    """Unknown proposal ID returns 404."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)
    app = _build_test_app(session_maker)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/ppc/automation/proposals/{uuid4()}/review")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_proposal_review_includes_execution_items() -> None:
    """Review endpoint includes per-execution-item details when executions exist."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)
    app = _build_test_app(session_maker)

    from app.services.ppc_execution import create_execution_record

    async with session_maker() as session:
        proposal = await _seed_proposal_with_items(session, status="approved")

        key = uuid4()
        await create_execution_record(session, proposal.id, key, triggered_by="test")
        await session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/ppc/automation/proposals/{proposal.id}/review")

    assert response.status_code == 200
    data = response.json()
    assert len(data["executions"]) == 1
    assert data["executions"][0]["status"] == "pending"
    assert data["executions"][0]["_items"] == []


@pytest.mark.asyncio
async def test_list_proposal_executions_endpoint() -> None:
    """GET /proposals/{id}/executions returns execution list."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)
    app = _build_test_app(session_maker)

    from app.services.ppc_execution import create_execution_record

    async with session_maker() as session:
        proposal = await _seed_proposal_with_items(session, status="approved")
        key = uuid4()
        await create_execution_record(session, proposal.id, key, triggered_by="test")
        await session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/ppc/automation/proposals/{proposal.id}/executions")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["proposal_id"] == str(proposal.id)
    assert len(data["items"]) == 1
