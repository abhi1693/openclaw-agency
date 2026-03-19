"""Pydantic schemas for the Refund Recovery API."""

from __future__ import annotations

from pydantic import BaseModel


class RefundSummary(BaseModel):
    pending_amount: float
    claimable_count: int
    recovered_amount: float
    submitted_count: int
    audit_date: str | None = None
    total_refunds: int = 0


class RefundClaimRead(BaseModel):
    order_id: str
    sku: str
    asin: str
    fnsku: str = ""
    shipment_id: str = ""
    quantity: int = 0
    refund_date: str | None = None
    refund_amount: float
    refund_reason: str
    days_since_refund: int
    has_return: bool
    has_reimbursement: bool
    claim_type: str
    claim_scenario: str
    priority: str
    status: str
    amazon_case_id: str
    evidence: str
    template_text: str
    notes: str
    submitted_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class RefundClaimUpdate(BaseModel):
    status: str | None = None
    amazon_case_id: str | None = None
    submitted_at: str | None = None
    notes: str | None = None


class RefundClaimsResponse(BaseModel):
    claims: list[RefundClaimRead]
    total: int
    page: int
    limit: int


class RefundAuditResponse(BaseModel):
    audit_date: str
    period: str
    summary: RefundSummary
    claims_created: int
    claims_updated: int


class GenerateTemplatesRequest(BaseModel):
    order_ids: list[str]


class GenerateTemplatesResponse(BaseModel):
    results: list[dict]
