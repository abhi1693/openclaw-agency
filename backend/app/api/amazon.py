"""Amazon orders, inventory, and phase 3 domain read/sync endpoints."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
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
    ProductSales,
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
    DailySalesRead,
    FinanceResponse,
    FinancialEventRead,
    PpcAnalysesResponse,
    PpcAnalysesSyncResponse,
    PpcAnalysisSnapshotRead,
    PricingResponse,
    PricingSnapshotRead,
    ProductSalesRead,
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
    session: AsyncSession = SESSION_DEP,
) -> SearchTermsSyncResponse:
    count, synced_at = await sync_search_terms(session)
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
