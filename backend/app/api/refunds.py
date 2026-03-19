"""Refund Recovery API endpoints — backed by PostgreSQL via FastAPI."""

from __future__ import annotations

import io
import csv as csv_module
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlmodel import col, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.time import utcnow
from app.db.session import get_session
from app.models.amazon_orders import RefundClaim
from app.schemas.refunds import (
    GenerateTemplatesRequest,
    GenerateTemplatesResponse,
    RefundAuditResponse,
    RefundClaimRead,
    RefundClaimsResponse,
    RefundClaimUpdate,
    RefundSummary,
)
from app.services.refund_audit import generate_claim_template, run_refund_audit
from app.services.amazon_sync import sync_returns, sync_finances, sync_reimbursements

router = APIRouter(prefix="/amazon/refunds", tags=["refunds"])
SESSION_DEP = Depends(get_session)


def _claim_to_read(claim: RefundClaim) -> RefundClaimRead:
    return RefundClaimRead(
        order_id=claim.order_id,
        sku=claim.sku,
        asin=claim.asin,
        fnsku=claim.fnsku,
        shipment_id=claim.shipment_id,
        quantity=claim.quantity,
        refund_date=claim.refund_date.isoformat() if claim.refund_date else None,
        refund_amount=float(claim.refund_amount),
        refund_reason=claim.refund_reason,
        days_since_refund=claim.days_since_refund,
        has_return=claim.has_return,
        has_reimbursement=claim.has_reimbursement,
        claim_type=claim.claim_type,
        claim_scenario=claim.claim_scenario,
        priority=claim.priority,
        status=claim.status,
        amazon_case_id=claim.amazon_case_id,
        evidence=claim.evidence,
        template_text=claim.template_text,
        notes=claim.notes,
        submitted_at=claim.submitted_at.isoformat() if claim.submitted_at else None,
        created_at=claim.created_at.isoformat() if claim.created_at else None,
        updated_at=claim.updated_at.isoformat() if claim.updated_at else None,
    )


@router.get("/summary", response_model=RefundSummary)
async def get_refund_summary(session: AsyncSession = SESSION_DEP) -> RefundSummary:
    """KPI summary: pending amount, claimable count, recovered, submitted."""
    claims = list(await session.exec(select(RefundClaim)))
    actionable = [c for c in claims if c.status == "actionable"]
    submitted = [c for c in claims if c.status in ("submitted", "approved")]
    pending_amount = float(sum(c.refund_amount for c in actionable))
    recovered_amount = float(sum(c.refund_amount for c in claims if c.status == "approved"))
    last_updated = max((c.updated_at for c in claims), default=None)
    return RefundSummary(
        pending_amount=pending_amount,
        claimable_count=len(actionable),
        recovered_amount=recovered_amount,
        submitted_count=len(submitted),
        audit_date=last_updated.strftime("%Y-%m-%d") if last_updated else None,
        total_refunds=len(claims),
    )


@router.get("/claims", response_model=RefundClaimsResponse)
async def list_refund_claims(
    status: str | None = Query(default=None),
    reason: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    claim_type: str | None = Query(default=None),
    sort: str = Query(default="amount_desc"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=500),
    search: str | None = Query(default=None),
    session: AsyncSession = SESSION_DEP,
) -> RefundClaimsResponse:
    """List refund claims with optional filters and pagination."""
    stmt = select(RefundClaim)

    if status:
        stmt = stmt.where(col(RefundClaim.status) == status)
    if reason:
        stmt = stmt.where(col(RefundClaim.refund_reason) == reason)
    if priority:
        stmt = stmt.where(col(RefundClaim.priority) == priority)
    if claim_type:
        stmt = stmt.where(col(RefundClaim.claim_type) == claim_type)
    if search:
        q = f"%{search}%"
        stmt = stmt.where(
            or_(
                col(RefundClaim.order_id).like(q),
                col(RefundClaim.sku).like(q),
                col(RefundClaim.asin).like(q),
                col(RefundClaim.refund_reason).like(q),
            )
        )

    # Sort
    field_map = {
        "amount": RefundClaim.refund_amount,
        "date": RefundClaim.refund_date,
        "days": RefundClaim.days_since_refund,
        "priority": RefundClaim.priority,
        "status": RefundClaim.status,
        "created": RefundClaim.created_at,
    }
    sort_parts = sort.split("_")
    sort_field = sort_parts[0]
    sort_dir = sort_parts[-1] if len(sort_parts) > 1 else "desc"
    db_field = field_map.get(sort_field, RefundClaim.refund_amount)
    if sort_dir == "asc":
        stmt = stmt.order_by(col(db_field).asc())
    else:
        stmt = stmt.order_by(col(db_field).desc())

    all_rows = list(await session.exec(stmt))
    total = len(all_rows)
    offset = (page - 1) * limit
    paginated = all_rows[offset : offset + limit]

    return RefundClaimsResponse(
        claims=[_claim_to_read(c) for c in paginated],
        total=total,
        page=page,
        limit=limit,
    )


@router.post("/audit", response_model=RefundAuditResponse)
async def trigger_audit(
    days: int = Query(default=180, ge=1, le=365),
    session: AsyncSession = SESSION_DEP,
) -> RefundAuditResponse:
    """Sync returns + reimbursements + finances, then run cross-reference audit."""
    await sync_returns(session, days=days)
    await sync_finances(session, days=days)
    await sync_reimbursements(session, days=days)

    result = await run_refund_audit(session, days=days)
    summary_data = result["summary"]
    return RefundAuditResponse(
        audit_date=result["audit_date"],
        period=result["period"],
        summary=RefundSummary(**summary_data),
        claims_created=result["claims_created"],
        claims_updated=result["claims_updated"],
    )


@router.post("/sync", response_model=dict)
async def sync_reimbursements_only(
    days: int = Query(default=180, ge=1, le=365),
    session: AsyncSession = SESSION_DEP,
) -> dict:
    """Sync reimbursement data only (without running full audit)."""
    result = await sync_reimbursements(session, days=days)
    return {"synced": result.return_events_synced, "synced_at": result.synced_at.isoformat()}


@router.get("/export")
async def export_claims_csv(
    status: str | None = Query(default=None),
    session: AsyncSession = SESSION_DEP,
) -> StreamingResponse:
    """Export refund claims as CSV."""
    stmt = select(RefundClaim)
    if status:
        stmt = stmt.where(col(RefundClaim.status) == status)
    stmt = stmt.order_by(col(RefundClaim.refund_amount).desc())
    claims = list(await session.exec(stmt))

    output = io.StringIO()
    writer = csv_module.writer(output)
    writer.writerow([
        "Order ID", "Refund Date", "SKU", "ASIN", "FNSKU", "Reason",
        "Amount", "Days Since Refund", "Has Return", "Has Reimbursement",
        "Claim Type", "Claim Scenario", "Priority", "Status", "Amazon Case ID", "Notes",
    ])
    for c in claims:
        writer.writerow([
            c.order_id,
            c.refund_date.strftime("%Y-%m-%d") if c.refund_date else "",
            c.sku,
            c.asin,
            c.fnsku,
            c.refund_reason,
            float(c.refund_amount),
            c.days_since_refund,
            "Yes" if c.has_return else "No",
            "Yes" if c.has_reimbursement else "No",
            c.claim_type,
            c.claim_scenario,
            c.priority,
            c.status,
            c.amazon_case_id,
            c.notes,
        ])

    date_str = utcnow().strftime("%Y-%m-%d")
    output.seek(0)
    return StreamingResponse(
        iter([output.read()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="refunds-{date_str}.csv"'},
    )


@router.get("/case/{order_id}", response_model=RefundClaimRead)
async def get_claim(
    order_id: str,
    session: AsyncSession = SESSION_DEP,
) -> RefundClaimRead:
    """Get a single refund claim detail with template text."""
    rows = await session.exec(
        select(RefundClaim).where(col(RefundClaim.order_id) == order_id)
    )
    claim = rows.one_or_none()
    if claim is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Claim not found: {order_id}")

    # Auto-generate template if missing
    if not claim.template_text:
        claim.template_text = generate_claim_template(claim)
        claim.updated_at = utcnow()
        await session.commit()

    return _claim_to_read(claim)


@router.put("/case/{order_id}", response_model=RefundClaimRead)
async def update_claim(
    order_id: str,
    body: RefundClaimUpdate,
    session: AsyncSession = SESSION_DEP,
) -> RefundClaimRead:
    """Update a claim: status, amazon_case_id, submitted_at, notes."""
    rows = await session.exec(
        select(RefundClaim).where(col(RefundClaim.order_id) == order_id)
    )
    claim = rows.one_or_none()
    if claim is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Claim not found: {order_id}")

    if body.status is not None:
        claim.status = body.status
    if body.amazon_case_id is not None:
        claim.amazon_case_id = body.amazon_case_id
    if body.submitted_at is not None:
        try:
            claim.submitted_at = datetime.fromisoformat(body.submitted_at)
        except ValueError:
            pass
    if body.notes is not None:
        claim.notes = body.notes
    claim.updated_at = utcnow()

    await session.commit()
    await session.refresh(claim)
    return _claim_to_read(claim)


@router.post("/case/generate", response_model=GenerateTemplatesResponse)
async def batch_generate_templates(
    body: GenerateTemplatesRequest,
    session: AsyncSession = SESSION_DEP,
) -> GenerateTemplatesResponse:
    """Batch generate claim templates for selected order IDs."""
    results = []
    for order_id in body.order_ids:
        rows = await session.exec(
            select(RefundClaim).where(col(RefundClaim.order_id) == order_id)
        )
        claim = rows.one_or_none()
        if claim is None:
            results.append({"order_id": order_id, "status": "not_found"})
            continue
        claim.template_text = generate_claim_template(claim)
        claim.updated_at = utcnow()
        results.append({"order_id": order_id, "status": "generated"})

    await session.commit()
    return GenerateTemplatesResponse(results=results)
