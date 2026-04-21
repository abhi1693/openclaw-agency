"""Tests for the live-write readiness gate (Phase 4)."""

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
    PpcExecutionItem,
    PpcProposal,
    PpcProposalExecution,
    PpcProposalItem,
)
from app.services.ppc_execution import FEATURE_PPC_LIVE_WRITES
from app.services.ppc_live_write_gate import get_live_write_gate, get_pilot_policy
from app.config.ams_config import get_ams_profile_id


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


async def _seed_gate_scenario(
    session: AsyncSession,
    approved_proposal: bool = False,
    has_execution_items: bool = False,
) -> PpcProposal:
    """Seed a proposal and related data for gate tests."""
    proposal = PpcProposal(
        name="Gate Test Proposal",
        status="approved" if approved_proposal else "pending",
        created_by="test",
    )
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

    session.add(
        PpcProposalItem(
            proposal_id=proposal.id,
            recommendation_type="bid",
            recommendation_id=bid_rec.id,
        )
    )

    if has_execution_items:
        execution = PpcProposalExecution(
            proposal_id=proposal.id,
            idempotency_key=uuid4(),
            status="completed",
            triggered_by="test",
        )
        session.add(execution)
        await session.flush()

        session.add(
            PpcExecutionItem(
                execution_id=execution.id,
                proposal_item_id=proposal.id,  # type: ignore[arg-type]
                recommendation_type="bid",
                recommendation_id=bid_rec.id,
                status="skipped",  # dry-run, FEATURE_PPC_LIVE_WRITES=False
                attempt=1,
            )
        )

    await session.commit()
    await session.refresh(proposal)
    return proposal


# ---------------------------------------------------------------------------
# get_live_write_gate unit tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gate_flag_is_false():
    """FEATURE_PPC_LIVE_WRITES must be False in Phase 4."""
    assert FEATURE_PPC_LIVE_WRITES is False, (
        "Sanity: FEATURE_PPC_LIVE_WRITES must be False in Phase 4. "
        "Live writes are disabled."
    )


@pytest.mark.asyncio
async def test_gate_reports_enabled_false():
    """Gate always reports enabled=False when feature flag is False."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)

    async with session_maker() as session:
        report = await get_live_write_gate(session, checked_at="2026-04-21T00:00:00Z")

    assert report["enabled"] is False
    assert report["feature_flag_value"] is False


@pytest.mark.asyncio
async def test_gate_reports_can_enable_false_when_no_data():
    """Gate reports can_enable=False when no proposals or executions exist."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)

    async with session_maker() as session:
        report = await get_live_write_gate(session, checked_at="2026-04-21T00:00:00Z")

    assert report["can_enable"] is False
    blocker_codes = [b["code"] for b in report["blockers"]]
    # ads_profile_id_missing does NOT appear here: AMAZON_ADS_PROFILE_ID is set in this environment
    assert "no_approved_proposals" in blocker_codes
    assert "no_observation_runs" in blocker_codes
    # credentials blocker is environment-dependent; only assert it when the env var is absent
    if not get_ams_profile_id():
        assert "ads_profile_id_missing" in blocker_codes


@pytest.mark.asyncio
async def test_gate_blocks_when_no_approved_proposals():
    """Gate adds no_approved_proposals blocker when no proposals are approved."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)

    async with session_maker() as session:
        # Seed proposal in pending (not approved) state
        await _seed_gate_scenario(session, approved_proposal=False)
        report = await get_live_write_gate(session, checked_at="2026-04-21T00:00:00Z")

    blocker_codes = [b["code"] for b in report["blockers"]]
    assert "no_approved_proposals" in blocker_codes


@pytest.mark.asyncio
async def test_gate_blocks_when_no_observation_runs():
    """Gate adds no_observation_runs blocker when no executions have run."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)

    async with session_maker() as session:
        # Approved proposal but no executions yet
        await _seed_gate_scenario(session, approved_proposal=True, has_execution_items=False)
        report = await get_live_write_gate(session, checked_at="2026-04-21T00:00:00Z")

    blocker_codes = [b["code"] for b in report["blockers"]]
    assert "no_observation_runs" in blocker_codes


@pytest.mark.asyncio
async def test_gate_passes_when_approved_proposal_and_execution_exists():
    """Gate can_enable=True when approved proposal AND execution items exist AND env is configured.

    In this environment AMAZON_ADS_PROFILE_ID is set, so once a proposal is approved
    and at least one observation run has completed, all blockers clear and the gate
    reports can_enable=True. The ads_profile_id_missing blocker is environment-specific.
    """
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)

    async with session_maker() as session:
        await _seed_gate_scenario(session, approved_proposal=True, has_execution_items=True)
        report = await get_live_write_gate(session, checked_at="2026-04-21T00:00:00Z")

    # ads_profile_id_missing is environment-dependent; check conditionally
    blocker_codes = [b["code"] for b in report["blockers"]]
    if not get_ams_profile_id():
        assert "ads_profile_id_missing" in blocker_codes
    # When env is configured and data exists, can_enable becomes True
    assert report["can_enable"] is True


@pytest.mark.asyncio
async def test_gate_returns_pilot_policy():
    """Gate report includes pilot_policy with approved_types."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)

    async with session_maker() as session:
        report = await get_live_write_gate(session, checked_at="2026-04-21T00:00:00Z")

    assert "pilot_policy" in report
    assert "approved_types" in report["pilot_policy"]
    assert "bid" in report["pilot_policy"]["approved_types"]


@pytest.mark.asyncio
async def test_gate_blockers_summary_accurate():
    """blockers_summary maps category to correct count.

    The "credentials" category only appears when AMAZON_ADS_PROFILE_ID is absent.
    """
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)

    async with session_maker() as session:
        await _seed_gate_scenario(session, approved_proposal=False)
        report = await get_live_write_gate(session, checked_at="2026-04-21T00:00:00Z")

    # With no approved proposals and no executions:
    # - pilot_policy blocker always present
    # - observation_runs blocker always present
    # - credentials blocker only when env var is absent
    assert "pilot_policy" in report["blockers_summary"]
    assert "observation_runs" in report["blockers_summary"]
    assert report["blockers_summary"]["pilot_policy"] >= 1
    if not get_ams_profile_id():
        assert "credentials" in report["blockers_summary"]


# ---------------------------------------------------------------------------
# get_pilot_policy tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pilot_policy_approves_bid_only():
    """Phase 4 pilot policy only approves 'bid' recommendation type."""
    policy = get_pilot_policy()
    assert policy["approved_types"] == ["bid"]
    assert "keyword" not in policy["approved_types"]
    assert "placement" not in policy["approved_types"]
    assert "budget" not in policy["approved_types"]


@pytest.mark.asyncio
async def test_pilot_policy_message_describes_restriction():
    """Pilot policy message mentions the restriction to bid type only."""
    policy = get_pilot_policy()
    assert "bid" in policy["message"]
    assert "keyword" in policy["message"]
    assert "placement" in policy["message"]


# ---------------------------------------------------------------------------
# HTTP endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_live_write_gate_endpoint_returns_200():
    """GET /ppc/automation/live-write-gate returns 200 with structured report."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)
    app = _build_test_app(session_maker)

    async with session_maker() as session:
        await _seed_gate_scenario(session, approved_proposal=True, has_execution_items=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ppc/automation/live-write-gate")

    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is False
    assert data["feature_flag_value"] is False
    assert "blockers" in data
    assert "pilot_policy" in data
    assert "can_enable" in data
    assert "ads_profile_id" in data
    assert "checked_at" in data


@pytest.mark.asyncio
async def test_live_write_gate_endpoint_no_approved_proposals():
    """Gate endpoint shows no_approved_proposals blocker when none exist."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)
    app = _build_test_app(session_maker)

    async with session_maker() as session:
        await _seed_gate_scenario(session, approved_proposal=False)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ppc/automation/live-write-gate")

    assert response.status_code == 200
    data = response.json()
    blocker_codes = [b["code"] for b in data["blockers"]]
    assert "no_approved_proposals" in blocker_codes


@pytest.mark.asyncio
async def test_pilot_policy_endpoint_returns_200():
    """GET /ppc/automation/pilot-policy returns 200 with approved types."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)
    app = _build_test_app(session_maker)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ppc/automation/pilot-policy")

    assert response.status_code == 200
    data = response.json()
    assert data["approved_types"] == ["bid"]
    assert "message" in data


@pytest.mark.asyncio
async def test_proposal_review_includes_gate_report():
    """Proposal review endpoint still works with Phase 4 additions."""
    engine = await _make_engine()
    session_maker = await _make_session_maker(engine)
    app = _build_test_app(session_maker)

    async with session_maker() as session:
        proposal = await _seed_gate_scenario(session, approved_proposal=True, has_execution_items=False)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/ppc/automation/proposals/{proposal.id}/review")

    assert response.status_code == 200
    data = response.json()
    assert "proposal" in data
    assert "readiness" in data
    assert data["feature_flag_live_writes"] is False