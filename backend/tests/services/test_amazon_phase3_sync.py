# ruff: noqa: INP001

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.amazon_orders import (
    AdMetric,
    Campaign,
    DailySales,
    FinancialEvent,
    PricingSnapshot,
    ProductSales,
    ReturnEvent,
)
from app.services import amazon_sync


async def _make_session() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return session_maker()


@pytest.mark.asyncio
async def test_sync_phase3_domains(monkeypatch, tmp_path) -> None:
    async def fake_sp_api(*args: str):
        if args[:2] == ("sales", "--days"):
            return {
                "metrics": [
                    {
                        "interval": "2026-03-09T00:00Z--2026-03-10T00:00Z",
                        "orderCount": 4,
                        "orderItemCount": 5,
                        "unitCount": 6,
                        "averageUnitPrice": {"amount": 10.5, "currencyCode": "USD"},
                        "totalSales": {"amount": 63.0, "currencyCode": "USD"},
                    }
                ]
            }
        if args[:2] == ("top-products", "--days"):
            return {
                "period": "Last 14 days",
                "products": [
                    {
                        "sku": "SKU-1",
                        "asin": "ASIN-1",
                        "title": "Product 1",
                        "quantitySold": 5,
                        "orderCount": 4,
                        "revenue": 63.0,
                        "currency": "USD",
                    }
                ],
            }
        if args[:2] == ("finances", "--days"):
            return {
                "period": "Last 30 days",
                "productCharges": [
                    {
                        "sku": "SKU-1",
                        "sales": 63.0,
                        "fees": -10.0,
                        "promotions": -1.0,
                        "netRevenue": 52.0,
                    }
                ],
                "refundSummary": [
                    {
                        "orderId": "ORDER-1",
                        "postedDate": "2026-03-10T00:00:00Z",
                        "items": [
                            {
                                "sku": "SKU-1",
                                "adjustments": [{"type": "Principal", "amount": -10.0}],
                            }
                        ],
                    }
                ],
            }
        if args[:2] == ("returns", "--days"):
            return {
                "period": "Last 30 days",
                "topReasons": [{"reason": "DEFECTIVE", "count": 2}],
            }
        raise AssertionError(args)

    async def fake_ads_api(*args: str):
        if args[:2] == ("campaigns", "--type"):
            return {
                "campaignType": "sp",
                "campaigns": [
                    {
                        "campaignId": "123",
                        "name": "Campaign 1",
                        "state": "ENABLED",
                        "targetingType": "AUTO",
                        "budget": {"budget": 10, "budgetType": "DAILY"},
                        "startDate": "2026-03-01",
                    }
                ],
            }
        if args[:3] == ("performance", "--days", "7"):
            return {
                "period": "Last 7 days",
                "records": [
                    {
                        "campaignId": "123",
                        "date": "2026-03-09",
                        "spend": 5.0,
                        "sales": 20.0,
                        "impressions": 100,
                        "clicks": 10,
                        "orders": 2,
                        "units": 2,
                        "ctr": 0.1,
                        "cpc": 0.5,
                        "acos": 0.25,
                        "roas": 4.0,
                    }
                ],
            }
        raise AssertionError(args)

    monkeypatch.setattr(amazon_sync, "_run_sp_api", fake_sp_api)
    monkeypatch.setattr(amazon_sync, "_run_ads_api", fake_ads_api)
    monkeypatch.setattr(amazon_sync, "SP_API_REPORTS", tmp_path)
    pricing_path = amazon_sync.SP_API_REPORTS
    pricing_path.mkdir(exist_ok=True)
    (pricing_path / "pricing-999.json").write_text(
        '{"period":"2026-03-10T00:00:00Z","alerts":{"stable":[{"asin":"ASIN-1","sku":"SKU-1","price":24.99,"currency":"USD","competitorOffers":2,"buyBoxWinner":true}]}}'
    )

    async with await _make_session() as session:
        sales_result = await amazon_sync.sync_sales(session, days=14)
        top_products_result = await amazon_sync.sync_top_products(session, days=14)
        finance_result = await amazon_sync.sync_finances(session, days=30)
        campaigns_result = await amazon_sync.sync_campaigns_and_budget(
            session, days=7, campaign_type="sp"
        )
        pricing_result = await amazon_sync.sync_pricing(session)
        returns_result = await amazon_sync.sync_returns(session, days=30)

        assert sales_result.daily_sales_synced == 1
        assert top_products_result.product_sales_synced == 1
        assert finance_result.financial_events_synced == 5
        assert campaigns_result.campaigns_synced == 1
        assert campaigns_result.ad_metrics_synced == 1
        assert pricing_result.pricing_snapshots_synced == 1
        assert returns_result.return_events_synced == 1

        assert len((await session.exec(select(DailySales))).all()) == 1
        assert len((await session.exec(select(ProductSales))).all()) == 1
        assert len((await session.exec(select(FinancialEvent))).all()) == 5
        assert len((await session.exec(select(Campaign))).all()) == 1
        assert len((await session.exec(select(AdMetric))).all()) == 1
        assert len((await session.exec(select(PricingSnapshot))).all()) == 1
        assert len((await session.exec(select(ReturnEvent))).all()) == 1
