# ruff: noqa: INP001

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.amazon import router as amazon_router
from app.db.session import get_session
from app.models.amazon_orders import (
    AdMetric,
    Campaign,
    DailySales,
    FinancialEvent,
    PricingSnapshot,
    ProductSales,
    ReturnEvent,
)


async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


def _build_test_app(session_maker: async_sessionmaker[AsyncSession]) -> FastAPI:
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
async def test_phase3_endpoints_return_persisted_rows() -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    app = _build_test_app(session_maker)

    async with session_maker() as session:
        session.add(
            DailySales(
                id=uuid4(),
                sales_date=date(2026, 3, 9),
                interval="2026-03-09T00:00Z--2026-03-10T00:00Z",
                order_count=5,
                order_item_count=7,
                unit_count=9,
                average_unit_price=Decimal("19.99"),
                total_sales=Decimal("179.91"),
                currency="USD",
            )
        )
        session.add(
            ProductSales(
                id=uuid4(),
                identity_key="Last 14 days|SKU-1|ASIN-1|Product 1",
                period="Last 14 days",
                sku="SKU-1",
                asin="ASIN-1",
                title="Product 1",
                quantity_sold=11,
                order_count=6,
                revenue=Decimal("299.99"),
                currency="USD",
            )
        )
        session.add(
            FinancialEvent(
                id=uuid4(),
                identity_key="Last 30 days|refund|ORDER-1|SKU-1|Principal|-|-19.99",
                period="Last 30 days",
                event_group="refund",
                reference_id="ORDER-1",
                sku="SKU-1",
                amount=Decimal("-19.99"),
                currency="USD",
                description="Principal",
            )
        )
        session.add(
            Campaign(
                id=uuid4(),
                campaign_id="123",
                campaign_type="sp",
                name="Campaign 1",
                state="ENABLED",
                targeting_type="AUTO",
                budget_amount=Decimal("10.00"),
                budget_type="DAILY",
            )
        )
        session.add(
            AdMetric(
                id=uuid4(),
                identity_key="Last 7 days|123|-",
                campaign_id="123",
                period="Last 7 days",
                spend=Decimal("5.00"),
                sales=Decimal("20.00"),
                impressions=100,
                clicks=10,
                orders=2,
                units=2,
                ctr=Decimal("0.1000"),
                cpc=Decimal("0.5000"),
                acos=Decimal("0.2500"),
                roas=Decimal("4.0000"),
            )
        )
        session.add(
            PricingSnapshot(
                id=uuid4(),
                identity_key="2026-03-10T00:00:00Z|SKU-1|ASIN-1",
                period="2026-03-10T00:00:00Z",
                asin="ASIN-1",
                sku="SKU-1",
                status="stable",
                price=Decimal("24.99"),
                currency="USD",
                competitor_offers=3,
                buy_box_winner=True,
            )
        )
        session.add(
            ReturnEvent(
                id=uuid4(),
                identity_key="Last 30 days|ORDER-2|SKU-1|-|-|DEFECTIVE|aggregated",
                period="Last 30 days",
                order_id="ORDER-2",
                sku="SKU-1",
                reason="DEFECTIVE",
                quantity=1,
                status="aggregated",
            )
        )
        await session.commit()

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            sales = await client.get("/api/v1/amazon/sales?days=14")
            top_products = await client.get("/api/v1/amazon/top-products?limit=5")
            finance = await client.get("/api/v1/amazon/finance?limit=10")
            campaigns = await client.get("/api/v1/amazon/campaigns?campaign_type=sp&limit=10")
            budget = await client.get("/api/v1/amazon/budget?limit=10")
            pricing = await client.get("/api/v1/amazon/pricing?limit=10")
            returns = await client.get("/api/v1/amazon/returns?limit=10")

        assert sales.status_code == 200
        assert sales.json()["metrics"][0]["interval"] == "2026-03-09T00:00Z--2026-03-10T00:00Z"
        assert top_products.status_code == 200
        assert top_products.json()["products"][0]["sku"] == "SKU-1"
        assert finance.status_code == 200
        assert finance.json()["events"][0]["event_group"] == "refund"
        assert campaigns.status_code == 200
        assert campaigns.json()["campaigns"][0]["campaign_id"] == "123"
        assert budget.status_code == 200
        assert budget.json()["metrics"][0]["campaign_id"] == "123"
        assert pricing.status_code == 200
        assert pricing.json()["snapshots"][0]["status"] == "stable"
        assert returns.status_code == 200
        assert returns.json()["events"][0]["reason"] == "DEFECTIVE"
    finally:
        await engine.dispose()
