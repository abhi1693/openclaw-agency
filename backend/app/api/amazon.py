"""Amazon orders, inventory, and phase 3 domain read/sync endpoints."""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, Depends, Query
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.time import utcnow
from app.db.session import get_session
from app.models.amazon_orders import (
    AdMetric,
    AmazonOrder,
    AmazonOrderItem,
    Campaign,
    DailySales,
    FinancialEvent,
    InventorySnapshot,
    PpcAnalysisSnapshot,
    PricingSnapshot,
    ProductCost,
    ProductSales,
    RestockConfig,
    ReturnEvent,
    SearchTermReport,
)
from app.schemas.amazon import (
    AdMetricRead,
    AmazonInventoryAlert,
    AmazonInventoryAlerts,
    AmazonInventoryItemRead,
    AmazonInventoryResponse,
    AmazonInventorySummary,
    AmazonOrderItemRead,
    AmazonOrderRead,
    AmazonOrdersResponse,
    AmazonSyncResponse,
    BudgetResponse,
    CampaignRead,
    CampaignsResponse,
    CogsListResponse,
    DailySalesRead,
    FinanceResponse,
    FinancialEventRead,
    InventoryStatusResponse,
    InventoryStatusSummary,
    PpcAnalysesResponse,
    PpcAnalysesSyncResponse,
    PpcAnalysisSnapshotRead,
    PricingResponse,
    PricingSnapshotRead,
    ProductCostRead,
    ProductCostUpsert,
    ProductSalesRead,
    ProfitResponse,
    ProfitItemRead,
    ProfitSummaryRead,
    RestockConfigRead,
    RestockConfigUpsert,
    RestockItemRead,
    RestockResponse,
    RestockSummaryRead,
    ReturnsResponse,
    ReturnEventRead,
    SalesResponse,
    SearchTermReportRead,
    SearchTermsResponse,
    SearchTermsSyncResponse,
    TopProductsResponse,
)
from app.services.amazon_sync import (
    inventory_status,
    sync_campaigns_and_budget,
    sync_finances,
    sync_orders_and_inventory,
    sync_ppc_analyses,
    sync_pricing,
    sync_returns,
    sync_sales,
    sync_search_terms,
    sync_top_products,
)
from app.services.profit_calculator import compute_profit

router = APIRouter(prefix="/amazon", tags=["amazon"])
SESSION_DEP = Depends(get_session)


@router.post("/sync", response_model=AmazonSyncResponse)
async def sync_amazon_data(
    days: int = Query(default=7, ge=1, le=90),
    session: AsyncSession = SESSION_DEP,
) -> AmazonSyncResponse:
    result = await sync_orders_and_inventory(session, days=days)
    return AmazonSyncResponse(**result.__dict__)


@router.post("/sales/sync", response_model=AmazonSyncResponse)
async def sync_amazon_sales(
    days: int = Query(default=14, ge=1, le=90), session: AsyncSession = SESSION_DEP
) -> AmazonSyncResponse:
    sales_result = await sync_sales(session, days=days)
    top_products_result = await sync_top_products(session, days=days)
    return AmazonSyncResponse(
        daily_sales_synced=sales_result.daily_sales_synced,
        product_sales_synced=top_products_result.product_sales_synced,
        synced_at=max(sales_result.synced_at, top_products_result.synced_at),
    )


@router.post("/finance/sync", response_model=AmazonSyncResponse)
async def sync_amazon_finance(
    days: int = Query(default=30, ge=1, le=180), session: AsyncSession = SESSION_DEP
) -> AmazonSyncResponse:
    result = await sync_finances(session, days=days)
    return AmazonSyncResponse(**result.__dict__)


@router.post("/campaigns/sync", response_model=AmazonSyncResponse)
async def sync_amazon_campaigns(
    days: int = Query(default=7, ge=1, le=90),
    campaign_type: str = Query(default="sp"),
    session: AsyncSession = SESSION_DEP,
) -> AmazonSyncResponse:
    result = await sync_campaigns_and_budget(session, days=days, campaign_type=campaign_type)
    return AmazonSyncResponse(**result.__dict__)


@router.post("/pricing/sync", response_model=AmazonSyncResponse)
async def sync_amazon_pricing(session: AsyncSession = SESSION_DEP) -> AmazonSyncResponse:
    result = await sync_pricing(session)
    return AmazonSyncResponse(**result.__dict__)


@router.post("/returns/sync", response_model=AmazonSyncResponse)
async def sync_amazon_returns(
    days: int = Query(default=30, ge=1, le=180), session: AsyncSession = SESSION_DEP
) -> AmazonSyncResponse:
    result = await sync_returns(session, days=days)
    return AmazonSyncResponse(**result.__dict__)


@router.get("/orders", response_model=AmazonOrdersResponse)
async def list_amazon_orders(
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = SESSION_DEP,
) -> AmazonOrdersResponse:
    cutoff_date = utcnow() - timedelta(days=days)
    cutoff_rows = await session.exec(
        select(AmazonOrder)
        .where(col(AmazonOrder.purchase_date) >= cutoff_date)
        .order_by(col(AmazonOrder.purchase_date).desc())
        .limit(limit)
    )
    orders = list(cutoff_rows)
    order_ids = [order.id for order in orders]
    items_by_order: dict[object, list[AmazonOrderItemRead]] = {order.id: [] for order in orders}
    if order_ids:
        item_rows = await session.exec(
            select(AmazonOrderItem)
            .where(col(AmazonOrderItem.order_id).in_(order_ids))
            .order_by(col(AmazonOrderItem.created_at).asc())
        )
        for item in item_rows:
            items_by_order[item.order_id].append(
                AmazonOrderItemRead(
                    asin=item.asin,
                    sku=item.sku,
                    title=item.title,
                    quantity_ordered=item.quantity_ordered,
                    quantity_shipped=item.quantity_shipped,
                    item_price=item.item_price,
                    item_tax=item.item_tax,
                    promo_discount=item.promo_discount,
                    currency=item.currency,
                )
            )
    last_synced_at = max((order.synced_at for order in orders), default=None)
    return AmazonOrdersResponse(
        total=len(orders),
        period=f"Last {days} days",
        last_synced_at=last_synced_at,
        orders=[
            AmazonOrderRead(
                amazon_order_id=order.amazon_order_id,
                status=order.status,
                purchase_date=order.purchase_date,
                amount=order.amount,
                currency=order.currency,
                item_count=order.item_count,
                fulfillment=order.fulfillment,
                synced_at=order.synced_at,
                items=items_by_order.get(order.id, []),
            )
            for order in orders
        ],
    )


@router.get("/inventory", response_model=AmazonInventoryResponse)
async def get_amazon_inventory(
    include_all: bool = Query(default=False),
    session: AsyncSession = SESSION_DEP,
) -> AmazonInventoryResponse:
    rows = list(
        await session.exec(
            select(InventorySnapshot).order_by(col(InventorySnapshot.total_supply).asc())
        )
    )
    filtered = rows if include_all else [row for row in rows if row.sku.endswith("-FBA")]

    def build_alert(
        row: InventorySnapshot, *, priority: str | None = None, message: str | None = None
    ) -> AmazonInventoryAlert:
        return AmazonInventoryAlert(
            sku=row.sku,
            asin=row.asin,
            product_name=row.product_name,
            total_supply=row.total_supply,
            priority=priority,
            message=message,
        )

    critical = [row for row in filtered if row.total_supply <= 10]
    low_stock = [row for row in filtered if 10 < row.total_supply <= 50]
    overstock = [row for row in filtered if row.total_supply > 500]
    healthy = [row for row in filtered if 50 < row.total_supply <= 500]
    last_synced_at = max((row.synced_at for row in filtered), default=None)

    return AmazonInventoryResponse(
        last_synced_at=last_synced_at,
        items=[
            AmazonInventoryItemRead(
                sku=row.sku,
                asin=row.asin,
                fn_sku=row.fn_sku,
                condition=row.condition,
                available=row.available,
                inbound=row.inbound,
                reserved=row.reserved,
                total_supply=row.total_supply,
                product_name=row.product_name,
                synced_at=row.synced_at,
                status=inventory_status(row.total_supply),
            )
            for row in filtered
        ],
        summary=AmazonInventorySummary(
            total=len(filtered),
            critical=len(critical),
            low_stock=len(low_stock),
            overstock=len(overstock),
            healthy=len(healthy),
        ),
        alerts=AmazonInventoryAlerts(
            critical=[
                build_alert(row, priority="high", message=f"{row.total_supply} units left")
                for row in critical[:10]
            ],
            low_stock=[build_alert(row) for row in low_stock[:15]],
            overstock=[build_alert(row) for row in overstock[:10]],
            restock=[],
        ),
    )


@router.get("/sales", response_model=SalesResponse)
async def list_sales(
    days: int = Query(default=14, ge=1, le=90), session: AsyncSession = SESSION_DEP
) -> SalesResponse:
    rows = list(
        await session.exec(
            select(DailySales).order_by(col(DailySales.sales_date).desc()).limit(days)
        )
    )
    return SalesResponse(
        total=len(rows),
        period=f"Last {days} days",
        last_synced_at=max((row.synced_at for row in rows), default=None),
        metrics=[
            DailySalesRead(
                sales_date=row.sales_date,
                interval=row.interval,
                order_count=row.order_count,
                order_item_count=row.order_item_count,
                unit_count=row.unit_count,
                average_unit_price=row.average_unit_price,
                total_sales=row.total_sales,
                currency=row.currency,
                synced_at=row.synced_at,
            )
            for row in rows
        ],
    )


@router.get("/top-products", response_model=TopProductsResponse)
async def list_top_products(
    limit: int = Query(default=10, ge=1, le=100), session: AsyncSession = SESSION_DEP
) -> TopProductsResponse:
    rows = list(
        await session.exec(
            select(ProductSales).order_by(col(ProductSales.revenue).desc()).limit(limit)
        )
    )
    return TopProductsResponse(
        total=len(rows),
        period=rows[0].period if rows else "Last 14 days",
        last_synced_at=max((row.synced_at for row in rows), default=None),
        products=[
            ProductSalesRead(
                period=row.period,
                sku=row.sku,
                asin=row.asin,
                title=row.title,
                quantity_sold=row.quantity_sold,
                order_count=row.order_count,
                revenue=row.revenue,
                currency=row.currency,
                synced_at=row.synced_at,
            )
            for row in rows
        ],
    )


@router.get("/finance", response_model=FinanceResponse)
async def list_financial_events(
    limit: int = Query(default=100, ge=1, le=500), session: AsyncSession = SESSION_DEP
) -> FinanceResponse:
    rows = list(
        await session.exec(
            select(FinancialEvent)
            .order_by(col(FinancialEvent.posted_date).desc(), col(FinancialEvent.created_at).desc())
            .limit(limit)
        )
    )
    return FinanceResponse(
        total=len(rows),
        period=rows[0].period if rows else "Last 30 days",
        last_synced_at=max((row.synced_at for row in rows), default=None),
        events=[
            FinancialEventRead(
                period=row.period,
                event_group=row.event_group,
                reference_id=row.reference_id,
                posted_date=row.posted_date,
                sku=row.sku,
                amount=row.amount,
                currency=row.currency,
                description=row.description,
                synced_at=row.synced_at,
            )
            for row in rows
        ],
    )


@router.get("/campaigns", response_model=CampaignsResponse)
async def list_campaigns(
    campaign_type: str = Query(default="sp"),
    limit: int = Query(default=200, ge=1, le=500),
    session: AsyncSession = SESSION_DEP,
) -> CampaignsResponse:
    rows = list(
        await session.exec(
            select(Campaign)
            .where(col(Campaign.campaign_type) == campaign_type)
            .order_by(col(Campaign.name).asc())
            .limit(limit)
        )
    )
    return CampaignsResponse(
        total=len(rows),
        campaign_type=campaign_type,
        last_synced_at=max((row.synced_at for row in rows), default=None),
        campaigns=[
            CampaignRead(
                campaign_id=row.campaign_id,
                campaign_type=row.campaign_type,
                name=row.name,
                state=row.state,
                targeting_type=row.targeting_type,
                budget_amount=row.budget_amount,
                budget_type=row.budget_type,
                start_date=row.start_date,
                end_date=row.end_date,
                synced_at=row.synced_at,
            )
            for row in rows
        ],
    )


@router.get("/budget", response_model=BudgetResponse)
async def list_budget_metrics(
    limit: int = Query(default=100, ge=1, le=500), session: AsyncSession = SESSION_DEP
) -> BudgetResponse:
    rows = list(
        await session.exec(select(AdMetric).order_by(col(AdMetric.spend).desc()).limit(limit))
    )
    return BudgetResponse(
        total=len(rows),
        period=rows[0].period if rows else "Last 7 days",
        last_synced_at=max((row.synced_at for row in rows), default=None),
        metrics=[
            AdMetricRead(
                campaign_id=row.campaign_id,
                period=row.period,
                report_date=row.report_date,
                spend=row.spend,
                sales=row.sales,
                impressions=row.impressions,
                clicks=row.clicks,
                orders=row.orders,
                units=row.units,
                ctr=row.ctr,
                cpc=row.cpc,
                acos=row.acos,
                roas=row.roas,
                synced_at=row.synced_at,
            )
            for row in rows
        ],
    )


@router.get("/pricing", response_model=PricingResponse)
async def list_pricing(
    limit: int = Query(default=100, ge=1, le=500), session: AsyncSession = SESSION_DEP
) -> PricingResponse:
    rows = list(
        await session.exec(
            select(PricingSnapshot).order_by(col(PricingSnapshot.created_at).desc()).limit(limit)
        )
    )
    return PricingResponse(
        total=len(rows),
        period=rows[0].period if rows else utcnow().isoformat(),
        last_synced_at=max((row.synced_at for row in rows), default=None),
        snapshots=[
            PricingSnapshotRead(
                period=row.period,
                asin=row.asin,
                sku=row.sku,
                status=row.status,
                price=row.price,
                currency=row.currency,
                change_amount=row.change_amount,
                change_percent=row.change_percent,
                competitor_offers=row.competitor_offers,
                buy_box_winner=row.buy_box_winner,
                synced_at=row.synced_at,
            )
            for row in rows
        ],
    )


@router.get("/returns", response_model=ReturnsResponse)
async def list_returns(
    limit: int = Query(default=100, ge=1, le=500), session: AsyncSession = SESSION_DEP
) -> ReturnsResponse:
    rows = list(
        await session.exec(
            select(ReturnEvent).order_by(col(ReturnEvent.quantity).desc()).limit(limit)
        )
    )
    return ReturnsResponse(
        total=len(rows),
        period=rows[0].period if rows else "Last 30 days",
        last_synced_at=max((row.synced_at for row in rows), default=None),
        events=[
            ReturnEventRead(
                period=row.period,
                order_id=row.order_id,
                sku=row.sku,
                reason=row.reason,
                quantity=row.quantity,
                status=row.status,
                event_date=row.event_date,
                synced_at=row.synced_at,
            )
            for row in rows
        ],
    )


# ── Search Terms ──────────────────────────────────────────────────────────────

@router.post("/search-terms/sync", response_model=SearchTermsSyncResponse)
async def sync_search_terms_endpoint(
    period: str = Query(default="last_30d", description="last_week | last_month | last_30d"),
    session: AsyncSession = SESSION_DEP,
) -> SearchTermsSyncResponse:
    count, synced_at = await sync_search_terms(session, period=period)
    return SearchTermsSyncResponse(search_terms_synced=count, synced_at=synced_at)


@router.get("/search-terms", response_model=SearchTermsResponse)
async def get_search_terms(
    campaign_id: str | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=500, ge=1, le=5000),
    session: AsyncSession = SESSION_DEP,
) -> SearchTermsResponse:
    cutoff = utcnow() - timedelta(days=days)
    stmt = select(SearchTermReport).where(col(SearchTermReport.synced_at) >= cutoff)
    if campaign_id:
        stmt = stmt.where(SearchTermReport.campaign_id == campaign_id)
    stmt = stmt.order_by(col(SearchTermReport.synced_at).desc()).limit(limit)
    rows = await session.exec(stmt)
    items = rows.all()
    last_synced = items[0].synced_at if items else None
    return SearchTermsResponse(
        total=len(items),
        period=f"last {days}d",
        last_synced_at=last_synced,
        terms=[SearchTermReportRead(**item.model_dump()) for item in items],
    )


# ── PPC Analyses ──────────────────────────────────────────────────────────────

@router.post("/ppc-analyses/sync", response_model=PpcAnalysesSyncResponse)
async def sync_ppc_analyses_endpoint(
    session: AsyncSession = SESSION_DEP,
) -> PpcAnalysesSyncResponse:
    count, synced_at = await sync_ppc_analyses(session)
    return PpcAnalysesSyncResponse(analyses_synced=count, synced_at=synced_at)


@router.get("/ppc-analyses/latest", response_model=PpcAnalysesResponse)
async def get_ppc_analyses_latest(
    session: AsyncSession = SESSION_DEP,
) -> PpcAnalysesResponse:
    types = ["keyword", "bid", "campaign", "weekly", "ai-insights"]
    results = []
    for analysis_type in types:
        stmt = (
            select(PpcAnalysisSnapshot)
            .where(PpcAnalysisSnapshot.analysis_type == analysis_type)
            .order_by(col(PpcAnalysisSnapshot.report_date).desc())
            .limit(1)
        )
        rows = await session.exec(stmt)
        item = rows.first()
        if item:
            results.append(PpcAnalysisSnapshotRead(**item.model_dump()))
    return PpcAnalysesResponse(total=len(results), snapshots=results)


@router.get("/ppc-analyses", response_model=PpcAnalysesResponse)
async def get_ppc_analyses(
    type: str | None = Query(default=None),
    days: int = Query(default=90, ge=1, le=365),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = SESSION_DEP,
) -> PpcAnalysesResponse:
    from datetime import date as _date, timedelta as _td
    cutoff_date = _date.today() - _td(days=days)
    stmt = select(PpcAnalysisSnapshot).where(
        col(PpcAnalysisSnapshot.report_date) >= cutoff_date
    )
    if type:
        stmt = stmt.where(PpcAnalysisSnapshot.analysis_type == type)
    stmt = stmt.order_by(col(PpcAnalysisSnapshot.report_date).desc()).limit(limit)
    rows = await session.exec(stmt)
    items = rows.all()
    return PpcAnalysesResponse(
        total=len(items),
        snapshots=[PpcAnalysisSnapshotRead(**item.model_dump()) for item in items],
    )


# ─── Keyword Rankings ────────────────────────────────────────────────────────

from app.models.amazon_orders import KeywordRanking


@router.get("/keywords/rankings")
async def get_keyword_rankings(
    asin: str = Query(...),
    days: int = Query(default=90, ge=1, le=365),
    session: AsyncSession = SESSION_DEP,
) -> list[dict]:
    """Get keyword ranking history for an ASIN."""
    cutoff = (utcnow() - timedelta(days=days)).date()
    stmt = (
        select(KeywordRanking)
        .where(col(KeywordRanking.asin) == asin)
        .where(col(KeywordRanking.snapshot_date) >= cutoff)
        .order_by(col(KeywordRanking.snapshot_date).desc())
    )
    rows = (await session.exec(stmt)).all()
    return [r.model_dump() for r in rows]


@router.post("/keywords/rankings/import")
async def import_keyword_rankings(
    payload: list[dict],
    session: AsyncSession = SESSION_DEP,
) -> dict:
    """Bulk import keyword rankings from H10 JSON payload."""
    inserted = 0
    for item in payload:
        existing_stmt = (
            select(KeywordRanking)
            .where(col(KeywordRanking.asin) == item.get("asin", ""))
            .where(col(KeywordRanking.keyword) == item.get("keyword", ""))
            .where(col(KeywordRanking.snapshot_date) == item.get("snapshot_date"))
        )
        existing = (await session.exec(existing_stmt)).first()
        if existing:
            continue
        row = KeywordRanking(**{k: v for k, v in item.items() if hasattr(KeywordRanking, k)})
        session.add(row)
        inserted += 1
    await session.commit()
    return {"inserted": inserted, "total": len(payload)}


@router.get("/keywords/top")
async def get_top_keywords(
    asin: str = Query(...),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = SESSION_DEP,
) -> list[dict]:
    """Get top N keywords for an ASIN by search volume (latest snapshot)."""
    latest_stmt = (
        select(col(KeywordRanking.snapshot_date))
        .where(col(KeywordRanking.asin) == asin)
        .order_by(col(KeywordRanking.snapshot_date).desc())
        .limit(1)
    )
    latest_date = (await session.exec(latest_stmt)).first()
    if not latest_date:
        return []
    stmt = (
        select(KeywordRanking)
        .where(col(KeywordRanking.asin) == asin)
        .where(col(KeywordRanking.snapshot_date) == latest_date)
        .order_by(col(KeywordRanking.search_volume).desc())
        .limit(limit)
    )
    rows = (await session.exec(stmt)).all()
    return [r.model_dump() for r in rows]


@router.get("/keywords/trends")
async def get_keyword_trends(
    asin: str = Query(...),
    keyword: str = Query(...),
    session: AsyncSession = SESSION_DEP,
) -> list[dict]:
    """Get historical trend data for a specific keyword+ASIN pair."""
    stmt = (
        select(KeywordRanking)
        .where(col(KeywordRanking.asin) == asin)
        .where(col(KeywordRanking.keyword) == keyword)
        .order_by(col(KeywordRanking.snapshot_date).asc())
    )
    rows = (await session.exec(stmt)).all()
    return [r.model_dump() for r in rows]


# ── Profit ────────────────────────────────────────────────────────────────────

@router.get("/profit", response_model=ProfitResponse)
async def get_profit(
    days: int = Query(default=30, ge=1, le=180),
    session: AsyncSession = SESSION_DEP,
) -> ProfitResponse:
    """Return profit summary + per-SKU breakdown from DB."""
    data = await compute_profit(session, days=days)
    last_synced_rows = list(await session.exec(select(ProductSales).limit(1)))
    last_synced = last_synced_rows[0].synced_at if last_synced_rows else None
    return ProfitResponse(
        summary=ProfitSummaryRead(
            total_revenue=data.summary.total_revenue,
            total_cost=data.summary.total_cost,
            total_profit=data.summary.total_profit,
            profit_margin=data.summary.profit_margin,
            total_ad_spend=data.summary.total_ad_spend,
            tacos=data.summary.tacos,
            organic_ratio=data.summary.organic_ratio,
        ),
        items=[
            ProfitItemRead(
                sku=i.sku,
                asin=i.asin,
                product_name=i.product_name,
                revenue=i.revenue,
                units_sold=i.units_sold,
                landed_cost=i.landed_cost,
                fba_fee=i.fba_fee,
                referral_fee=i.referral_fee,
                ad_spend=i.ad_spend,
                net_profit=i.net_profit,
                profit_margin=i.profit_margin,
            )
            for i in data.items
        ],
        warnings=data.warnings,
        synced_at=last_synced,
    )


@router.post("/profit/refresh", response_model=AmazonSyncResponse)
async def refresh_profit(
    days: int = Query(default=30, ge=1, le=180),
    session: AsyncSession = SESSION_DEP,
) -> AmazonSyncResponse:
    """Trigger a full SP-API sync and return updated counts."""
    result = await sync_orders_and_inventory(session, days=days)
    fin_result = await sync_finances(session, days=days)
    return AmazonSyncResponse(
        orders_synced=result.orders_synced,
        order_items_synced=result.order_items_synced,
        inventory_items_synced=result.inventory_items_synced,
        financial_events_synced=fin_result.financial_events_synced,
        synced_at=utcnow(),
    )


@router.get("/profit/cogs", response_model=CogsListResponse)
async def get_cogs(session: AsyncSession = SESSION_DEP) -> CogsListResponse:
    """List all product costs (COGS)."""
    rows = list(await session.exec(select(ProductCost).order_by(col(ProductCost.sku).asc())))
    return CogsListResponse(
        items=[
            ProductCostRead(
                id=r.id,
                sku=r.sku,
                asin=r.asin,
                product_name=r.product_name,
                unit_cost=r.unit_cost,
                shipping_to_port=r.shipping_to_port,
                freight=r.freight,
                customs=r.customs,
                duty_rate=r.duty_rate,
                last_mile=r.last_mile,
                prep=r.prep,
                other_cost=r.other_cost,
                total_landed_cost=r.total_landed_cost,
                currency=r.currency,
                updated_at=r.updated_at,
            )
            for r in rows
        ],
        total=len(rows),
    )


@router.put("/profit/cogs", response_model=CogsListResponse)
async def upsert_cogs(
    payload: list[ProductCostUpsert] = Body(...),
    session: AsyncSession = SESSION_DEP,
) -> CogsListResponse:
    """Bulk upsert COGS items."""
    now = utcnow()
    for item in payload:
        existing = (
            await session.exec(select(ProductCost).where(col(ProductCost.sku) == item.sku))
        ).one_or_none()
        if existing:
            existing.asin = item.asin
            existing.product_name = item.product_name
            existing.unit_cost = item.unit_cost
            existing.shipping_to_port = item.shipping_to_port
            existing.freight = item.freight
            existing.customs = item.customs
            existing.duty_rate = item.duty_rate
            existing.last_mile = item.last_mile
            existing.prep = item.prep
            existing.other_cost = item.other_cost
            existing.total_landed_cost = item.total_landed_cost
            existing.currency = item.currency
            existing.updated_at = now
        else:
            row = ProductCost(
                sku=item.sku,
                asin=item.asin,
                product_name=item.product_name,
                unit_cost=item.unit_cost,
                shipping_to_port=item.shipping_to_port,
                freight=item.freight,
                customs=item.customs,
                duty_rate=item.duty_rate,
                last_mile=item.last_mile,
                prep=item.prep,
                other_cost=item.other_cost,
                total_landed_cost=item.total_landed_cost,
                currency=item.currency,
                updated_at=now,
                created_at=now,
            )
            session.add(row)
    await session.commit()
    rows = list(await session.exec(select(ProductCost).order_by(col(ProductCost.sku).asc())))
    return CogsListResponse(
        items=[
            ProductCostRead(
                id=r.id,
                sku=r.sku,
                asin=r.asin,
                product_name=r.product_name,
                unit_cost=r.unit_cost,
                shipping_to_port=r.shipping_to_port,
                freight=r.freight,
                customs=r.customs,
                duty_rate=r.duty_rate,
                last_mile=r.last_mile,
                prep=r.prep,
                other_cost=r.other_cost,
                total_landed_cost=r.total_landed_cost,
                currency=r.currency,
                updated_at=r.updated_at,
            )
            for r in rows
        ],
        total=len(rows),
    )


# ── Restock ───────────────────────────────────────────────────────────────────

def _hash_code(s: str) -> int:
    h = 0
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return h


def _get_daily_sales_for_asin(asin: str) -> float:
    return float((_hash_code(asin) % 16) + 5)


def _get_mock_stock_for_asin(asin: str) -> int:
    return (_hash_code(asin) % 251) + 50


@router.get("/restock", response_model=RestockResponse)
async def get_restock(session: AsyncSession = SESSION_DEP) -> RestockResponse:
    """Return restock recommendations based on inventory + config."""
    configs = list(
        await session.exec(select(RestockConfig).order_by(col(RestockConfig.asin).asc()))
    )
    if not configs:
        return RestockResponse(
            items=[],
            summary=RestockSummaryRead(critical=0, warning=0, ok=0),
            last_synced_at=None,
        )

    inventory_rows = list(await session.exec(select(InventorySnapshot)))
    inv_by_asin: dict[str, InventorySnapshot] = {
        row.asin: row for row in inventory_rows if row.asin
    }
    last_synced = max((row.synced_at for row in inventory_rows), default=None)
    now = utcnow()

    items: list[RestockItemRead] = []
    for cfg in configs:
        inv = inv_by_asin.get(cfg.asin)
        current_stock = inv.total_supply if inv else _get_mock_stock_for_asin(cfg.asin)
        product_name = (inv.product_name if inv else None) or cfg.asin
        last_updated = inv.synced_at if inv else now

        daily_sales = _get_daily_sales_for_asin(cfg.asin)
        days_until_stockout = int(current_stock / daily_sales) if daily_sales > 0 else 999
        reorder_qty = int((cfg.lead_time_days + cfg.fba_prep_days + cfg.safety_stock_days) * daily_sales)

        if days_until_stockout < 14:
            urgency = "critical"
        elif days_until_stockout < 30:
            urgency = "warning"
        else:
            urgency = "ok"

        items.append(
            RestockItemRead(
                asin=cfg.asin,
                product_name=product_name,
                current_stock=current_stock,
                daily_sales=daily_sales,
                days_until_stockout=days_until_stockout,
                reorder_qty=reorder_qty,
                urgency=urgency,
                last_updated=last_updated,
            )
        )

    summary = RestockSummaryRead(
        critical=sum(1 for i in items if i.urgency == "critical"),
        warning=sum(1 for i in items if i.urgency == "warning"),
        ok=sum(1 for i in items if i.urgency == "ok"),
    )
    return RestockResponse(items=items, summary=summary, last_synced_at=last_synced)


@router.post("/restock/sync", response_model=AmazonSyncResponse)
async def sync_restock(
    days: int = Query(default=7, ge=1, le=30),
    session: AsyncSession = SESSION_DEP,
) -> AmazonSyncResponse:
    """Re-sync inventory data to update restock recommendations."""
    result = await sync_orders_and_inventory(session, days=days)
    return AmazonSyncResponse(
        inventory_items_synced=result.inventory_items_synced,
        synced_at=result.synced_at,
    )


@router.get("/restock/config", response_model=list[RestockConfigRead])
async def get_restock_config(session: AsyncSession = SESSION_DEP) -> list[RestockConfigRead]:
    """Return per-ASIN restock config."""
    rows = list(
        await session.exec(select(RestockConfig).order_by(col(RestockConfig.asin).asc()))
    )
    return [
        RestockConfigRead(
            id=r.id,
            asin=r.asin,
            lead_time_days=r.lead_time_days,
            fba_prep_days=r.fba_prep_days,
            safety_stock_days=r.safety_stock_days,
        )
        for r in rows
    ]


@router.put("/restock/config", response_model=list[RestockConfigRead])
async def upsert_restock_config(
    payload: list[RestockConfigUpsert] = Body(...),
    session: AsyncSession = SESSION_DEP,
) -> list[RestockConfigRead]:
    """Bulk upsert restock config."""
    now = utcnow()
    for item in payload:
        existing = (
            await session.exec(
                select(RestockConfig).where(col(RestockConfig.asin) == item.asin)
            )
        ).one_or_none()
        if existing:
            existing.lead_time_days = item.lead_time_days
            existing.fba_prep_days = item.fba_prep_days
            existing.safety_stock_days = item.safety_stock_days
            existing.updated_at = now
        else:
            row = RestockConfig(
                asin=item.asin,
                lead_time_days=item.lead_time_days,
                fba_prep_days=item.fba_prep_days,
                safety_stock_days=item.safety_stock_days,
                created_at=now,
                updated_at=now,
            )
            session.add(row)
    await session.commit()
    rows = list(
        await session.exec(select(RestockConfig).order_by(col(RestockConfig.asin).asc()))
    )
    return [
        RestockConfigRead(
            id=r.id,
            asin=r.asin,
            lead_time_days=r.lead_time_days,
            fba_prep_days=r.fba_prep_days,
            safety_stock_days=r.safety_stock_days,
        )
        for r in rows
    ]


# ── Inventory Status & FC Distribution ───────────────────────────────────────

@router.get("/inventory/status", response_model=InventoryStatusResponse)
async def get_inventory_status(session: AsyncSession = SESSION_DEP) -> InventoryStatusResponse:
    """Return inventory status dashboard summary from DB snapshots."""
    rows = list(
        await session.exec(select(InventorySnapshot).order_by(col(InventorySnapshot.sku).asc()))
    )
    last_synced = max((row.synced_at for row in rows), default=None)

    summary = InventoryStatusSummary(
        total_fulfillable=sum(row.available for row in rows),
        total_reserved=sum(row.reserved for row in rows),
        total_unsellable=0,
        total_inbound=sum(row.inbound for row in rows),
        total_warehouse=sum(row.total_supply for row in rows),
        total_skus=len(rows),
    )

    items = [
        AmazonInventoryItemRead(
            sku=row.sku,
            asin=row.asin,
            fn_sku=row.fn_sku,
            condition=row.condition,
            available=row.available,
            inbound=row.inbound,
            reserved=row.reserved,
            total_supply=row.total_supply,
            product_name=row.product_name,
            synced_at=row.synced_at,
            status=inventory_status(row.total_supply),
        )
        for row in rows
    ]

    return InventoryStatusResponse(summary=summary, items=items, last_synced_at=last_synced)


@router.get("/inventory/fc-distribution")
async def get_fc_distribution(session: AsyncSession = SESSION_DEP) -> dict:
    """Return FC distribution data from h10 file if available, else DB fallback."""
    import json
    from pathlib import Path
    from typing import Any

    fc_path = Path.home() / ".openclaw" / "skills" / "h10-browser" / "data" / "inventory" / "fc_distribution.json"
    sku_map_path = Path.home() / ".openclaw" / "workspace" / "config" / "sku-asin-map.json"

    if fc_path.exists():
        try:
            raw = json.loads(fc_path.read_text())
            sku_map: dict[str, str] = {}
            if sku_map_path.exists():
                map_data = json.loads(sku_map_path.read_text())
                if map_data.get("by_sku"):
                    for sku, info in map_data["by_sku"].items():
                        sku_map[sku] = info.get("name", "")
            return {**raw, "sku_name_map": sku_map, "source": "h10_file"}
        except Exception:
            pass

    # Fallback: build from InventorySnapshot DB rows
    rows = list(await session.exec(select(InventorySnapshot)))
    last_synced = max((row.synced_at for row in rows), default=None)

    by_sku: dict[str, Any] = {}
    for row in rows:
        sku = row.sku
        by_sku[sku] = {
            "asin": row.asin,
            "name": row.product_name or sku,
            "total_sellable": row.available,
            "total_damaged": 0,
            "total_defective": 0,
            "fc_count": 1,
            "regions": {
                "west": {"units": 0, "fcs": [], "pct": 0},
                "south": {"units": 0, "fcs": [], "pct": 0},
                "midwest": {"units": 0, "fcs": [], "pct": 0},
                "east": {"units": 0, "fcs": [], "pct": 0},
            },
            "balance_score": None,
            "gap_regions": [],
        }

    account_summary = {
        "total_units": sum(row.total_supply for row in rows),
        "total_sellable": sum(row.available for row in rows),
        "customer_damaged": 0,
        "defective": 0,
        "fc_count": 0,
        "sku_count": len(rows),
    }

    return {
        "updated": last_synced.isoformat() if last_synced else None,
        "source": "db_inventory_snapshots",
        "account_summary": account_summary,
        "by_sku": by_sku,
        "fc_details": [],
        "sku_name_map": {},
    }


# ── PPC Sub-endpoints (Phase 3) ───────────────────────────────────────────────

def _get_ppc_cache_snapshot(analysis_type: str) -> dict | None:
    """Read latest PPC analysis snapshot from ads skill cache files."""
    import glob as _glob
    import json as _json

    CACHE_DIR = Path.home() / ".openclaw" / "skills" / "amazon-advertising" / "cache"
    prefix_map = {
        "weekly": "weekly-report-",
        "campaign": "campaign-analysis-",
        "bid": "bid-analysis-",
        "keyword": "keyword-analysis-",
        "ai-insights": "ai-insights-result-",
    }
    prefix = prefix_map.get(analysis_type)
    if not prefix:
        return None
    files = sorted(_glob.glob(str(CACHE_DIR / f"{prefix}*.json")))
    if not files:
        return None
    try:
        return _json.loads(Path(files[-1]).read_text(encoding="utf-8"))
    except Exception:
        return None


@router.get("/ppc/overview")
async def get_ppc_overview(
    days: int = Query(default=7, ge=1, le=90),
    session: AsyncSession = SESSION_DEP,
) -> dict:
    """PPC overview KPIs aggregated from AdMetric DB records."""
    cutoff = utcnow() - timedelta(days=days)
    rows = list(
        await session.exec(
            select(AdMetric)
            .where(col(AdMetric.synced_at) >= cutoff)
            .order_by(col(AdMetric.spend).desc())
        )
    )
    total_spend = sum(float(r.spend or 0) for r in rows)
    total_sales = sum(float(r.sales or 0) for r in rows)
    total_clicks = sum(r.clicks for r in rows)
    total_orders = sum(r.orders for r in rows)
    total_impressions = sum(r.impressions for r in rows)
    last_synced = max((r.synced_at for r in rows), default=None)
    return {
        "days": days,
        "count": len(rows),
        "kpi": {
            "spend": round(total_spend, 2),
            "sales": round(total_sales, 2),
            "clicks": total_clicks,
            "orders": total_orders,
            "impressions": total_impressions,
            "acos": round(total_spend / total_sales * 100, 1) if total_sales > 0 else 0,
            "roas": round(total_sales / total_spend, 2) if total_spend > 0 else 0,
            "cpc": round(total_spend / total_clicks, 2) if total_clicks > 0 else 0,
            "ctr": round(total_clicks / total_impressions * 100, 2) if total_impressions > 0 else 0,
            "convRate": round(total_orders / total_clicks * 100, 2) if total_clicks > 0 else 0,
        },
        "last_synced_at": last_synced.isoformat() if last_synced else None,
        "empty": len(rows) == 0,
    }


@router.get("/ppc/keywords")
async def get_ppc_keywords(
    days: int = Query(default=7, ge=1, le=90),
) -> dict:
    """PPC keyword performance — reads latest performance-keywords cache file."""
    import glob as _glob
    import json as _json

    CACHE_DIR = Path.home() / ".openclaw" / "skills" / "amazon-advertising" / "cache"
    files = sorted(_glob.glob(str(CACHE_DIR / "performance-keywords-*.json")))
    if not files:
        return {
            "days": days, "count": 0, "keywords": [],
            "kpi": {"spend": 0, "sales": 0, "clicks": 0, "orders": 0,
                    "impressions": 0, "acos": 0, "roas": 0, "cpc": 0, "ctr": 0, "convRate": 0},
            "empty": True, "message": "暂无关键词性能数据",
        }
    try:
        data = _json.loads(Path(files[-1]).read_text(encoding="utf-8"))
    except Exception:
        return {"days": days, "count": 0, "keywords": [], "empty": True, "error": True}

    def enrich(r: dict) -> dict:
        impressions = r.get("impressions") or 0
        clicks = r.get("clicks") or 0
        cost = float(r.get("cost") or 0)
        sales = float(r.get("sales7d") or 0)
        orders = r.get("purchases7d") or 0
        return {
            "keyword": r.get("targeting") or r.get("keywordText") or "—",
            "matchType": r.get("matchType") or "—",
            "campaignName": r.get("campaignName") or "—",
            "adGroupName": r.get("adGroupName") or "—",
            "impressions": impressions,
            "clicks": clicks,
            "ctr": round(clicks / impressions * 100, 2) if impressions > 0 else 0,
            "cpc": round(cost / clicks, 2) if clicks > 0 else 0,
            "cost": round(cost, 2),
            "sales": round(sales, 2),
            "orders": orders,
            "acos": round(cost / sales * 100, 1) if sales > 0 else (999 if cost > 0 else 0),
            "convRate": round(orders / clicks * 100, 2) if clicks > 0 else 0,
            "roas": round(sales / cost, 2) if cost > 0 else 0,
        }

    keywords = sorted([enrich(r) for r in data.get("rows", [])], key=lambda x: -x["cost"])
    total_spend = sum(k["cost"] for k in keywords)
    total_sales = sum(k["sales"] for k in keywords)
    total_clicks = sum(k["clicks"] for k in keywords)
    total_orders = sum(k["orders"] for k in keywords)
    total_impressions = sum(k["impressions"] for k in keywords)
    return {
        "days": days,
        "startDate": data.get("startDate"),
        "endDate": data.get("endDate"),
        "count": len(keywords),
        "kpi": {
            "spend": round(total_spend, 2),
            "sales": round(total_sales, 2),
            "clicks": total_clicks,
            "orders": total_orders,
            "impressions": total_impressions,
            "acos": round(total_spend / total_sales * 100, 1) if total_sales > 0 else 0,
            "roas": round(total_sales / total_spend, 2) if total_spend > 0 else 0,
            "cpc": round(total_spend / total_clicks, 2) if total_clicks > 0 else 0,
            "ctr": round(total_clicks / total_impressions * 100, 2) if total_impressions > 0 else 0,
            "convRate": round(total_orders / total_clicks * 100, 2) if total_clicks > 0 else 0,
        },
        "keywords": keywords,
        "source": Path(files[-1]).name,
        "empty": False,
    }


@router.get("/ppc/search-terms")
async def get_ppc_search_terms(
    days: int = Query(default=7, ge=1, le=90),
    campaign_id: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    session: AsyncSession = SESSION_DEP,
) -> dict:
    """PPC search term performance from SearchTermReport DB."""
    from datetime import date as date_type
    cutoff_date = date_type.today() - timedelta(days=days)
    stmt = select(SearchTermReport).where(col(SearchTermReport.report_date) >= cutoff_date)
    if campaign_id:
        stmt = stmt.where(SearchTermReport.campaign_id == campaign_id)
    stmt = stmt.order_by(col(SearchTermReport.spend).desc().nullslast()).limit(limit)
    rows = list(await session.exec(stmt))
    if not rows:
        return {
            "days": days, "count": 0, "terms": [],
            "empty": True, "message": "暂无搜索词数据，请先同步 /api/v1/amazon/search-terms/sync",
        }
    last_synced = max((r.synced_at for r in rows), default=None)
    # Derive actual date range from data (not the cutoff)
    dates = sorted(r.report_date for r in rows if r.report_date)
    start_date = str(dates[0]) if dates else None
    end_date = str(dates[-1]) if dates else None

    def to_term(r: SearchTermReport) -> dict:
        impressions = r.impressions or 0
        clicks = r.clicks or 0
        spend = float(r.spend or 0)
        sales = float(r.sales or 0)
        orders = r.orders or 0
        return {
            "searchTerm": r.search_term,
            "targeting": r.keyword or "—",
            "matchType": r.match_type or "—",
            "campaignName": r.campaign_name or "—",
            "impressions": impressions,
            "clicks": clicks,
            "ctr": round(clicks / impressions * 100, 2) if impressions > 0 else 0,
            "cpc": round(spend / clicks, 2) if clicks > 0 else 0,
            "cost": round(spend, 2),
            "sales": round(sales, 2),
            "orders": orders,
            "acos": round(spend / sales * 100, 1) if sales > 0 else (999 if spend > 0 else 0),
            "convRate": round(orders / clicks * 100, 2) if clicks > 0 else 0,
        }

    terms = [to_term(r) for r in rows]
    return {
        "days": days,
        "startDate": start_date,
        "endDate": end_date,
        "count": len(terms),
        "terms": terms,
        "last_synced_at": last_synced.isoformat() if last_synced else None,
        "empty": False,
    }


@router.get("/ppc/reports")
async def get_ppc_reports(
    file: str | None = Query(default=None),
) -> dict:
    """PPC report .md files from ~/.openclaw/workspace/reports/ppc/."""
    import datetime as _dt

    PPC_DIR = Path.home() / ".openclaw" / "workspace" / "reports" / "ppc"
    PPC_DIR.mkdir(parents=True, exist_ok=True)

    if file:
        safe = Path(file).name
        if not safe.endswith(".md"):
            return {"error": "Only .md files allowed"}
        fpath = PPC_DIR / safe
        if not fpath.exists():
            return {"error": "File not found"}
        return {"file": safe, "content": fpath.read_text(encoding="utf-8")}

    import re as _re

    def extract_title(fp: Path) -> str | None:
        try:
            content = fp.read_text(encoding="utf-8")
            m = _re.search(r"^#\s+(.+)$", content, _re.MULTILINE)
            return m.group(1).strip() if m else None
        except Exception:
            return None

    def parse_filename(name: str) -> tuple[str, str]:
        base = name.replace(".md", "")
        m = _re.search(r"(\d{4}-\d{2}-\d{2})$", base)
        if m:
            d = m.group(1)
            return base[: -(len(d) + 1)], d
        return base, ""

    files_list = []
    for f in sorted(PPC_DIR.glob("*.md"), reverse=True):
        stat = f.stat()
        prefix, date_str = parse_filename(f.name)
        files_list.append({
            "filename": f.name,
            "prefix": prefix,
            "date": date_str,
            "sizeKb": max(1, stat.st_size // 1024),
            "modifiedAt": _dt.datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "title": extract_title(f),
        })

    return {
        "reportsDir": str(PPC_DIR),
        "count": len(files_list),
        "files": files_list,
    }


@router.get("/ppc/weekly")
async def get_ppc_weekly(session: AsyncSession = SESSION_DEP) -> dict:
    """PPC weekly report — DB first (type=weekly), fallback to cache file."""
    stmt = (
        select(PpcAnalysisSnapshot)
        .where(PpcAnalysisSnapshot.analysis_type == "weekly")
        .order_by(col(PpcAnalysisSnapshot.report_date).desc())
        .limit(1)
    )
    row = (await session.exec(stmt)).first()
    if row and row.data:
        return {**row.data, "empty": False, "source": f"db:{row.report_date}",
                "report_date": str(row.report_date)}
    data = _get_ppc_cache_snapshot("weekly")
    if data:
        return {**data, "empty": False}
    return {
        "empty": True,
        "message": "暂无周报数据。请运行 node ppc-weekly-report.js",
        "overview": {"totalSpend": None, "totalSales": None, "totalOrders": None, "acos": None, "roas": None},
        "moneyKeywords": [], "burnKeywords": [], "actionItems": [], "riskAlerts": [],
        "summary": {"highPriorityActions": 0, "mediumPriorityActions": 0, "criticalAlerts": 0, "warningAlerts": 0},
    }


@router.get("/ppc/campaign-analysis")
async def get_ppc_campaign_analysis(session: AsyncSession = SESSION_DEP) -> dict:
    """PPC campaign analysis — DB first (type=campaign), fallback to cache file."""
    stmt = (
        select(PpcAnalysisSnapshot)
        .where(PpcAnalysisSnapshot.analysis_type == "campaign")
        .order_by(col(PpcAnalysisSnapshot.report_date).desc())
        .limit(1)
    )
    row = (await session.exec(stmt)).first()
    if row and row.data:
        return {**row.data, "empty": False, "source": f"db:{row.report_date}",
                "report_date": str(row.report_date)}
    data = _get_ppc_cache_snapshot("campaign")
    if data:
        return {**data, "empty": False}
    return {
        "empty": True,
        "message": "暂无 Campaign 分析数据。请运行 node ppc-campaign-analyzer.js",
        "summary": None, "duplicates": [],
        "asinCoverage": {"whitelist": [], "covered": [], "uncovered": []},
        "typeDistribution": {"sp": {}, "sb": {}, "totalDailyBudget": 0},
        "zombieCampaigns": [], "naming": {"issueCount": 0, "issues": []}, "recommendations": [],
    }


@router.get("/ppc/bid-analysis")
async def get_ppc_bid_analysis(session: AsyncSession = SESSION_DEP) -> dict:
    """PPC bid analysis — DB first (type=bid), fallback to cache file."""
    stmt = (
        select(PpcAnalysisSnapshot)
        .where(PpcAnalysisSnapshot.analysis_type == "bid")
        .order_by(col(PpcAnalysisSnapshot.report_date).desc())
        .limit(1)
    )
    row = (await session.exec(stmt)).first()
    if row and row.data:
        return {**row.data, "empty": False, "source": f"db:{row.report_date}",
                "report_date": str(row.report_date)}
    data = _get_ppc_cache_snapshot("bid")
    if data:
        return {**data, "empty": False}
    return {
        "empty": True,
        "message": "暂无 Bid/Budget 分析数据。请运行 node ppc-bid-analyzer.js",
        "summary": None,
        "bidEfficiency": {"overbidding": [], "underbidding": [], "wellBidCount": 0, "totalAnalyzed": 0},
        "budgetUtilization": {"campaigns": [], "capped": [], "underutilized": [], "dormant": []},
        "acosAnalysis": {"deteriorating": [], "breakeven": []},
        "performers": {"top5": [], "bottom5": []}, "reallocations": [],
    }


def _normalize_ai_insights(data: dict) -> dict:
    """Normalize snake_case AI insights keys to camelCase for frontend."""
    out: dict[str, Any] = {}

    # Simple scalar fields
    out["generatedAt"] = data.get("generated_at") or data.get("generatedAt")
    out["model"] = data.get("model")
    out["overall"] = data.get("overall")
    out["h10CrossAnalysis"] = data.get("h10_cross_analysis") or data.get("h10CrossAnalysis")

    # date_range: "2026-02-21 to 2026-03-23" → { start, end }
    dr = data.get("date_range") or data.get("dateRange")
    if isinstance(dr, str) and " to " in dr:
        parts = dr.split(" to ", 1)
        out["dateRange"] = {"start": parts[0].strip(), "end": parts[1].strip()}
    elif isinstance(dr, dict):
        out["dateRange"] = dr
    else:
        out["dateRange"] = None

    # keyword_semantic_groups → keywordGrouping: { brandTerms, categoryTerms, competitorTerms, problemSolvingTerms }
    GROUP_MAP = {
        "brand": "brandTerms",
        "品牌": "brandTerms",
        "category": "categoryTerms",
        "品类": "categoryTerms",
        "competitor": "competitorTerms",
        "竞品": "competitorTerms",
        "problem": "problemSolvingTerms",
        "问题": "problemSolvingTerms",
        "功能": "problemSolvingTerms",
    }
    kg: dict[str, list] = {
        "brandTerms": [], "categoryTerms": [], "competitorTerms": [], "problemSolvingTerms": [],
    }
    groups = data.get("keyword_semantic_groups") or data.get("keywordGrouping") or []
    if isinstance(groups, list):
        for grp in groups:
            group_label = (grp.get("group") or "").lower()
            bucket = "categoryTerms"  # default
            for key, bucket_name in GROUP_MAP.items():
                if key in group_label:
                    bucket = bucket_name
                    break
            strategy = grp.get("strategy") or ""
            for kw in grp.get("keywords") or []:
                kg[bucket].append({"term": kw, "strategy": strategy})
    elif isinstance(groups, dict):
        kg = groups  # already normalized
    out["keywordGrouping"] = kg

    # negative_keyword_risk → negativeRiskAssessment
    VERDICT_MAP = {"直接否定": "否定"}
    neg_risks = data.get("negative_keyword_risk") or data.get("negativeRiskAssessment") or []
    if neg_risks and isinstance(neg_risks[0], dict) and "keyword" in neg_risks[0]:
        out["negativeRiskAssessment"] = [
            {
                "term": r.get("keyword") or r.get("term") or "",
                "spend": float(r.get("spend") or 0),
                "verdict": VERDICT_MAP.get(r.get("verdict") or "", r.get("verdict") or "观察"),
                "reason": r.get("reason") or "",
            }
            for r in neg_risks
        ]
    else:
        out["negativeRiskAssessment"] = neg_risks

    # anomaly_analysis → anomalyAnalysis (root_cause → rootCause)
    anomalies = data.get("anomaly_analysis") or data.get("anomalyAnalysis") or []
    if anomalies and isinstance(anomalies[0], dict) and "root_cause" in anomalies[0]:
        out["anomalyAnalysis"] = [
            {
                "campaign": r.get("campaign") or "",
                "issue": r.get("issue") or "",
                "rootCause": r.get("root_cause") or r.get("rootCause") or "",
                "fix": r.get("fix") or "",
            }
            for r in anomalies
        ]
    else:
        out["anomalyAnalysis"] = anomalies

    # action_plan → weeklyActionPlan
    out["weeklyActionPlan"] = data.get("action_plan") or data.get("weeklyActionPlan") or []

    return out


@router.get("/ppc/ai-insights")
async def get_ppc_ai_insights(session: AsyncSession = SESSION_DEP) -> dict:
    """PPC AI insights — DB first (type=ai-insights), fallback to cache file."""
    stmt = (
        select(PpcAnalysisSnapshot)
        .where(PpcAnalysisSnapshot.analysis_type == "ai-insights")
        .order_by(col(PpcAnalysisSnapshot.report_date).desc())
        .limit(1)
    )
    row = (await session.exec(stmt)).first()
    if row and row.data:
        normalized = _normalize_ai_insights(row.data)
        return {**normalized, "empty": False, "source": f"db:{row.report_date}",
                "report_date": str(row.report_date)}
    data = _get_ppc_cache_snapshot("ai-insights")
    if data:
        normalized = _normalize_ai_insights(data)
        return {**normalized, "empty": False}
    return {
        "empty": True,
        "message": "等待下次 AI 分析运行",
        "hint": "node ~/.openclaw/skills/amazon-advertising/ppc-ai-insights.js --format prompt",
    }


async def _compute_keyword_analysis_live(session: AsyncSession) -> dict:
    """Compute keyword analysis in real-time from search_term_reports (last 30 days)."""
    from datetime import date as date_type
    cutoff = date_type.today() - timedelta(days=30)
    rows = list(await session.exec(
        select(SearchTermReport).where(col(SearchTermReport.report_date) >= cutoff)
    ))
    if not rows:
        return {
            "empty": True, "source": "live:no_data",
            "message": "search_term_reports 暂无数据（30天内）",
            "summary": None,
            "addKeywords": [], "negativeKeywords": [], "matchUpgrades": [],
            "longTail": [], "duplicateTargeting": [],
        }

    # Aggregate by search_term across all rows
    from collections import defaultdict
    agg: dict[str, dict] = defaultdict(lambda: {
        "impressions": 0, "clicks": 0, "orders": 0,
        "spend": 0.0, "sales": 0.0, "campaigns": set(),
        "match_types": set(), "keywords": set(),
    })
    for r in rows:
        st = (r.search_term or "").strip().lower()
        if not st:
            continue
        a = agg[st]
        a["impressions"] += r.impressions or 0
        a["clicks"] += r.clicks or 0
        a["orders"] += r.orders or 0
        a["spend"] += float(r.spend or 0)
        a["sales"] += float(r.sales or 0)
        if r.campaign_name:
            a["campaigns"].add(r.campaign_name)
        if r.match_type:
            a["match_types"].add(r.match_type.upper())
        if r.keyword:
            a["keywords"].add((r.keyword or "").strip().lower())

    # addKeywords: good CVR, not already an exact targeted keyword
    add_kws: list[dict] = []
    for st, a in agg.items():
        if a["orders"] < 1 or a["clicks"] < 3:
            continue
        acos = a["spend"] / a["sales"] * 100 if a["sales"] > 0 else 999
        if acos > 50:
            continue
        # Skip if already targeted as exact keyword
        if st in a["keywords"] and "EXACT" in a["match_types"]:
            continue
        add_kws.append({
            "searchTerm": st,
            "impressions": a["impressions"],
            "clicks": a["clicks"],
            "orders": a["orders"],
            "sales": round(a["sales"], 2),
            "spend": round(a["spend"], 2),
            "acos": round(acos, 1),
            "suggestedMatchType": "EXACT",
            "campaigns": sorted(a["campaigns"]),
        })
    add_kws.sort(key=lambda x: (-x["orders"], x["acos"]))
    add_kws = add_kws[:25]

    # negativeKeywords: high spend with zero orders
    neg_kws: list[dict] = []
    for st, a in agg.items():
        if a["orders"] > 0 or a["clicks"] < 3:
            continue
        if a["spend"] < 2.0:
            continue
        level = "flag" if a["spend"] >= 10 else "warn"
        neg_kws.append({
            "searchTerm": st,
            "impressions": a["impressions"],
            "clicks": a["clicks"],
            "spend": round(a["spend"], 2),
            "campaigns": sorted(a["campaigns"]),
            "level": level,
            "action": "建议添加否定关键词",
        })
    neg_kws.sort(key=lambda x: -x["spend"])
    neg_kws = neg_kws[:25]

    # matchUpgrades: BROAD match with good conversion → suggest EXACT
    broad_agg: dict[str, dict] = defaultdict(lambda: {
        "orders": 0, "spend": 0.0, "sales": 0.0, "campaigns": set(),
    })
    for r in rows:
        if (r.match_type or "").upper() != "BROAD":
            continue
        kw = (r.keyword or r.search_term or "").strip().lower()
        if not kw:
            continue
        b = broad_agg[kw]
        b["orders"] += r.orders or 0
        b["spend"] += float(r.spend or 0)
        b["sales"] += float(r.sales or 0)
        if r.campaign_name:
            b["campaigns"].add(r.campaign_name)

    upgrades: list[dict] = []
    for kw, b in broad_agg.items():
        if b["orders"] < 2:
            continue
        acos = b["spend"] / b["sales"] * 100 if b["sales"] > 0 else 999
        if acos > 40:
            continue
        upgrades.append({
            "keyword": kw,
            "currentMatch": "BROAD",
            "orders": b["orders"],
            "acos": round(acos, 1),
            "suggestion": f"升级为 EXACT，保留转化，减少无关曝光",
        })
    upgrades.sort(key=lambda x: (-x["orders"], x["acos"]))
    upgrades = upgrades[:20]

    dates = sorted(r.report_date for r in rows if r.report_date)
    start_date = str(dates[0]) if dates else None
    end_date = str(dates[-1]) if dates else None

    return {
        "empty": False,
        "source": "live:search_term_reports",
        "derivedFrom": f"search_term_reports ({len(rows)} rows)",
        "startDate": start_date,
        "endDate": end_date,
        "summary": {
            "addKeywordCount": len(add_kws),
            "negativeCount": len(neg_kws),
            "negWarnCount": sum(1 for k in neg_kws if k["level"] == "warn"),
            "negFlagCount": sum(1 for k in neg_kws if k["level"] == "flag"),
            "upgradeCount": len(upgrades),
            "longTailCount": 0,
            "duplicateGroupCount": 0,
        },
        "addKeywords": add_kws,
        "negativeKeywords": neg_kws,
        "matchUpgrades": upgrades,
        "longTail": [],
        "duplicateTargeting": [],
    }


@router.get("/ppc/keyword-analysis")
async def get_ppc_keyword_analysis(session: AsyncSession = SESSION_DEP) -> dict:
    """PPC keyword analysis — DB snapshot if fresh (<7 days), else live from search_term_reports."""
    from datetime import date as date_type
    stmt = (
        select(PpcAnalysisSnapshot)
        .where(PpcAnalysisSnapshot.analysis_type == "keyword")
        .order_by(col(PpcAnalysisSnapshot.report_date).desc())
        .limit(1)
    )
    row = (await session.exec(stmt)).first()
    snapshot_fresh = (
        row is not None
        and row.report_date is not None
        and (date_type.today() - row.report_date).days <= 7
    )
    if snapshot_fresh and row and row.data:
        return {**row.data, "empty": False, "source": f"db:{row.report_date}",
                "report_date": str(row.report_date)}

    # Snapshot is stale or missing — compute live from DB
    return await _compute_keyword_analysis_live(session)


@router.get("/product-costs")
async def get_product_costs(session: AsyncSession = SESSION_DEP) -> dict:
    """Flat list of product costs keyed by ASIN/SKU (alias of /profit/cogs)."""
    rows = list(await session.exec(select(ProductCost).order_by(col(ProductCost.sku).asc())))
    return {
        "items": [
            {
                "sku": r.sku,
                "asin": r.asin,
                "product_name": r.product_name,
                "unit_cost": float(r.unit_cost) if r.unit_cost is not None else None,
                "total_landed_cost": float(r.total_landed_cost) if r.total_landed_cost is not None else None,
                "currency": r.currency,
            }
            for r in rows
        ],
        "total": len(rows),
    }
