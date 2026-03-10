# ruff: noqa: INP001
"""API tests for Amazon orders endpoint filtering."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.amazon import router as amazon_router
from app.core.time import utcnow
from app.db.session import get_session
from app.models.amazon_orders import AmazonOrder


async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


def _build_test_app(
    session_maker: async_sessionmaker[AsyncSession],
) -> FastAPI:
    app = FastAPI()
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(amazon_router)
    app.include_router(api_v1)

    async def _override_get_session() -> AsyncSession:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session
    return app


@pytest.mark.asyncio
async def test_list_amazon_orders_filters_by_days_query_param() -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    app = _build_test_app(session_maker)

    now = utcnow()
    async with session_maker() as session:
        session.add(
            AmazonOrder(
                id=uuid4(),
                amazon_order_id="recent-order",
                status="Shipped",
                purchase_date=now - timedelta(days=2),
                amount=Decimal("19.99"),
                currency="USD",
                item_count=1,
                fulfillment="AFN",
                synced_at=now,
            )
        )
        session.add(
            AmazonOrder(
                id=uuid4(),
                amazon_order_id="old-order",
                status="Shipped",
                purchase_date=now - timedelta(days=30),
                amount=Decimal("29.99"),
                currency="USD",
                item_count=1,
                fulfillment="AFN",
                synced_at=now,
            )
        )
        await session.commit()

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.get("/api/v1/amazon/orders?days=7")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert [order["amazon_order_id"] for order in body["orders"]] == ["recent-order"]
        assert body["period"] == "Last 7 days"
    finally:
        await engine.dispose()
