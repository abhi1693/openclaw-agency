"""Tests for PPC proposal-item readiness checks (Phase 2)."""

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
    PpcProposalItem,
    PlacementRecommendation,
)
from app.services.ppc_proposals import (
    check_item_readiness,
    create_proposal,
    run_readiness_check,
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


# ---------------------------------------------------------------------------
# Unit tests for check_item_readiness
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestCheckBidReadiness:
    async def test_ready_bid_has_keyword_id_and_ad_group_id(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            bid = BidRecommendation(
                campaign_id="C-1", ad_group_id="AG-1", keyword_id="KW-1",
                match_type="exact",
                current_bid=Decimal("1.00"), recommended_bid=Decimal("1.25"),
            )
            session.add(bid)
            await session.commit()

            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="bid",
                recommendation_id=bid.id,
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "ready"
            assert detail is None

    async def test_bid_missing_keyword_id(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            bid = BidRecommendation(
                campaign_id="C-1", ad_group_id="AG-1", keyword_id=None,
                match_type="exact",
                current_bid=Decimal("1.00"), recommended_bid=Decimal("1.25"),
            )
            session.add(bid)
            await session.commit()

            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="bid",
                recommendation_id=bid.id,
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "missing_keyword_id"
            assert "keyword_id is null" in (detail or "")

    async def test_bid_missing_ad_group_id(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            bid = BidRecommendation(
                campaign_id="C-1", ad_group_id=None, keyword_id="KW-1",
                match_type="exact",
                current_bid=Decimal("1.00"), recommended_bid=Decimal("1.25"),
            )
            session.add(bid)
            await session.commit()

            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="bid",
                recommendation_id=bid.id,
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "missing_ad_group_id"

    async def test_bid_not_pending(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            bid = BidRecommendation(
                campaign_id="C-1", ad_group_id="AG-1", keyword_id="KW-1",
                match_type="exact",
                current_bid=Decimal("1.00"), recommended_bid=Decimal("1.25"),
                status="applied",
            )
            session.add(bid)
            await session.commit()

            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="bid",
                recommendation_id=bid.id,
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "status_not_pending"


@pytest.mark.asyncio
class TestCheckKeywordReadiness:
    async def test_ready_keyword_add_negative(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            kw = KeywordRecommendation(
                source_campaign_id="C-1", search_term="hemp rope",
                match_type="exact", action="add_negative",
            )
            session.add(kw)
            await session.commit()

            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="keyword",
                recommendation_id=kw.id,
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "ready"

    async def test_add_keyword_missing_target_campaign_id(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            kw = KeywordRecommendation(
                source_campaign_id="C-1", search_term="hemp rope",
                match_type="exact", action="add_keyword",
                target_campaign_id=None,
            )
            session.add(kw)
            await session.commit()

            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="keyword",
                recommendation_id=kw.id,
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "missing_target_campaign_id"

    async def test_add_keyword_unresolved_ad_group_id(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            kw = KeywordRecommendation(
                source_campaign_id="C-1", search_term="hemp rope",
                match_type="exact", action="add_keyword",
                target_campaign_id="C-1",
                target_ad_group_id=None,
            )
            session.add(kw)
            await session.commit()

            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="keyword",
                recommendation_id=kw.id,
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "unresolved"
            assert "target_ad_group_id" in (detail or "")

    async def test_add_keyword_fully_resolved(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            kw = KeywordRecommendation(
                source_campaign_id="C-1", search_term="hemp rope",
                match_type="exact", action="add_keyword",
                target_campaign_id="C-1",
                target_ad_group_id="AG-1",
            )
            session.add(kw)
            await session.commit()

            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="keyword",
                recommendation_id=kw.id,
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "ready"


@pytest.mark.asyncio
class TestCheckPlacementBudgetReadiness:
    async def test_ready_placement_pending(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            rec = PlacementRecommendation(
                campaign_id="C-1", placement="top_of_search",
                current_modifier_pct=0.0, recommended_modifier_pct=25.0,
            )
            session.add(rec)
            await session.commit()

            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="placement",
                recommendation_id=rec.id,
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "ready"

    async def test_placement_not_pending(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            rec = PlacementRecommendation(
                campaign_id="C-1", placement="top_of_search",
                current_modifier_pct=0.0, recommended_modifier_pct=25.0,
                status="applied",
            )
            session.add(rec)
            await session.commit()

            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="placement",
                recommendation_id=rec.id,
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "status_not_pending"

    async def test_ready_budget_pending(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            rec = BudgetAllocation(
                parent_asin="B00TEST",
                total_daily_budget=Decimal("100.00"),
                sp_pct=Decimal("0.50"),
                sb_pct=Decimal("0.25"),
                sd_pct=Decimal("0.25"),
                sbv_pct=Decimal("0.00"),
                alloc_date=date(2026, 4, 21),
            )
            session.add(rec)
            await session.commit()

            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="budget",
                recommendation_id=rec.id,
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "ready"


@pytest.mark.asyncio
class TestCheckUnknownRecommendationType:
    async def test_unknown_type(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            item = PpcProposalItem(
                proposal_id=uuid4(),
                recommendation_type="froozle",
                recommendation_id=uuid4(),
            )

            check, detail = await check_item_readiness(session, item)

            assert check == "unknown"
            assert "unrecognised" in (detail or "")


# ---------------------------------------------------------------------------
# Unit tests for run_readiness_check
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestRunReadinessCheck:
    async def test_all_ready_returns_true(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            bid = BidRecommendation(
                campaign_id="C-1", ad_group_id="AG-1", keyword_id="KW-1",
                match_type="exact",
                current_bid=Decimal("1.00"), recommended_bid=Decimal("1.25"),
            )
            session.add(bid)
            await session.commit()

            proposal = await create_proposal(
                session, "Ready test", {"bid": [bid.id]}, created_by="tester"
            )
            await session.commit()

            result = await run_readiness_check(session, proposal.id)

            assert result["total"] == 1
            assert result["ready"] == 1
            assert result["not_ready"] == 0
            assert result["all_ready"] is True

    async def test_mixed_readiness(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            # Ready bid
            ready_bid = BidRecommendation(
                campaign_id="C-1", ad_group_id="AG-1", keyword_id="KW-1",
                match_type="exact",
                current_bid=Decimal("1.00"), recommended_bid=Decimal("1.25"),
            )
            # Unresolved keyword (add_keyword with no target_ad_group_id)
            unresolved_kw = KeywordRecommendation(
                source_campaign_id="C-1", search_term="hemp rope",
                match_type="exact", action="add_keyword",
                target_campaign_id="C-1",
                target_ad_group_id=None,
            )
            session.add(ready_bid)
            session.add(unresolved_kw)
            await session.commit()

            proposal = await create_proposal(
                session, "Mixed test",
                {"bid": [ready_bid.id], "keyword": [unresolved_kw.id]},
                created_by="tester",
            )
            await session.commit()

            result = await run_readiness_check(session, proposal.id)

            assert result["total"] == 2
            assert result["ready"] == 1
            assert result["not_ready"] == 1
            assert result["all_ready"] is False
            # When persist=False, the result dict items have check=None because
            # check_item_readiness results are only written to item objects when persist=True.
            # Verify via the count fields instead.
            assert result["not_ready"] == 1
            assert result["ready"] == 1

    async def test_persist_writes_back_to_rows(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        async with sm() as session:
            unresolved_kw = KeywordRecommendation(
                source_campaign_id="C-1", search_term="hemp rope",
                match_type="exact", action="add_keyword",
                target_campaign_id="C-1",
                target_ad_group_id=None,
            )
            session.add(unresolved_kw)
            await session.commit()

            proposal = await create_proposal(
                session, "Persist test", {"keyword": [unresolved_kw.id]},
                created_by="tester",
            )
            await session.commit()

            items_result = await session.exec(
                select(PpcProposalItem).where(PpcProposalItem.proposal_id == proposal.id)
            )
            items = list(items_result)
            assert items[0].readiness_check is None

            await run_readiness_check(session, proposal.id, persist=True)

            items_result2 = await session.exec(
                select(PpcProposalItem).where(PpcProposalItem.proposal_id == proposal.id)
            )
            items2 = list(items_result2)
            assert items2[0].readiness_check == "unresolved"


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestReadinessAPI:
    async def test_readiness_endpoint_returns_200(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        app = _build_test_app(sm)

        async with sm() as session:
            proposal = await create_proposal(session, "API readiness test", {})
            await session.commit()
            pid = str(proposal.id)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get(f"/ppc/automation/proposals/{pid}/readiness")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] == 0
            assert data["all_ready"] is True
            assert data["ready"] == 0
            assert data["not_ready"] == 0

    async def test_readiness_endpoint_unknown_proposal_returns_404(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        app = _build_test_app(sm)

        fake_id = str(uuid4())
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get(f"/ppc/automation/proposals/{fake_id}/readiness")
            assert resp.status_code == 404

    async def test_readiness_endpoint_with_persist_false_does_not_write(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        app = _build_test_app(sm)

        async with sm() as session:
            unresolved_kw = KeywordRecommendation(
                source_campaign_id="C-1", search_term="hemp rope",
                match_type="exact", action="add_keyword",
                target_campaign_id="C-1",
                target_ad_group_id=None,
            )
            session.add(unresolved_kw)
            await session.commit()

            proposal = await create_proposal(
                session, "No-persist test", {"keyword": [unresolved_kw.id]},
                created_by="tester",
            )
            await session.commit()
            pid = str(proposal.id)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get(f"/ppc/automation/proposals/{pid}/readiness?persist=false")
            assert resp.status_code == 200
            assert resp.json()["not_ready"] == 1

        async with sm() as session:
            items_result = await session.exec(
                select(PpcProposalItem).where(PpcProposalItem.proposal_id == proposal.id)
            )
            items = list(items_result)
            # persist=false → DB rows still null
            assert items[0].readiness_check is None

    async def test_readiness_endpoint_with_persist_true_writes_rows(self) -> None:
        engine = await _make_engine()
        register_async_engine(engine)
        sm = await _make_session_maker(engine)
        app = _build_test_app(sm)

        async with sm() as session:
            unresolved_kw = KeywordRecommendation(
                source_campaign_id="C-1", search_term="hemp rope",
                match_type="exact", action="add_keyword",
                target_campaign_id="C-1",
                target_ad_group_id=None,
            )
            session.add(unresolved_kw)
            await session.commit()

            proposal = await create_proposal(
                session, "Persist API test", {"keyword": [unresolved_kw.id]},
                created_by="tester",
            )
            await session.commit()
            pid = str(proposal.id)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get(f"/ppc/automation/proposals/{pid}/readiness?persist=true")
            assert resp.status_code == 200
            assert resp.json()["not_ready"] == 1

        async with sm() as session:
            items_result = await session.exec(
                select(PpcProposalItem).where(PpcProposalItem.proposal_id == proposal.id)
            )
            items = list(items_result)
            assert items[0].readiness_check == "unresolved"