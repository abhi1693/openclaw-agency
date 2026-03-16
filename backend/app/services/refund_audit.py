"""Refund recovery audit engine — cross-references returns, refunds, and reimbursements."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.amazon_orders import FinancialEvent, RefundClaim, ReimbursementEvent, ReturnEvent

logger = get_logger(__name__)

# Non-buyer fault reasons that qualify for reimbursement/SAFE-T
NON_BUYER_REASONS = {
    "undeliverable_unknown",
    "damaged_by_carrier",
    "damaged_by_fc",
    "missed_estimated_delivery",
    "never_arrived",
    "switcheroo",
    # Legacy / human-readable variants
    "shipping address undeliverable",
    "undeliverable",
    "carrier damaged",
    "carrier damaged - item damaged by carrier",
    "missed delivery promise",
    "lost in transit",
    "item not received",
    "damaged by fc",
    "damaged by amazon",
    "fulfillment center damaged",
    "wrong item sent by amazon",
    "customer moved",
    "no secure delivery location",
    "delivery attempted",
}

SAFE_T_REASONS = {
    "undeliverable_unknown",
    "damaged_by_carrier",
    "missed_estimated_delivery",
    "never_arrived",
    # Legacy variants
    "shipping address undeliverable",
    "undeliverable",
    "missed delivery promise",
    "carrier damaged",
    "lost in transit",
    "item not received",
}


def _matches_non_buyer(reason: str | None) -> bool:
    if not reason:
        return False
    lower = reason.lower()
    return any(r in lower for r in NON_BUYER_REASONS)


def _matches_safe_t(reason: str | None) -> bool:
    if not reason:
        return False
    lower = reason.lower()
    return any(r in lower for r in SAFE_T_REASONS)


def _days_since(dt: datetime | None) -> int:
    if dt is None:
        return 0
    now = datetime.now(tz=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return max(0, (now - dt).days)


def _determine_priority(amount: Decimal, days_since: int) -> str:
    if amount >= 50 or days_since > 180:
        return "high"
    if amount >= 20 or days_since > 90:
        return "medium"
    if amount == 0:
        return "medium"  # unknown amount — worth investigating
    return "low"


def generate_claim_template(claim: RefundClaim) -> str:
    """Generate pre-filled claim text for Seller Central submission."""
    scenario_descriptions = {
        "A": "The refund was issued due to a non-buyer fault reason and no reimbursement has been received.",
        "B": "More than 45 days have passed since the refund was issued and no return or reimbursement has been received.",
        "C": "The item was returned as unsellable and no reimbursement has been received.",
        "D": "A return was logged with a non-buyer fault reason but no reimbursement has been issued.",
        "E": "Amazon disposed of the unit without providing a reimbursement.",
    }

    scenario_desc = scenario_descriptions.get(claim.claim_scenario, "")
    claim_type_label = "SAFE-T Claim" if claim.claim_type == "safe-t" else "Reimbursement Request"
    refund_date_str = (
        claim.refund_date.strftime("%Y-%m-%d") if claim.refund_date else "unknown date"
    )

    lines = [
        f"Dear Amazon Seller Support,",
        "",
        f"I am writing to request a {claim_type_label} for Order ID: {claim.order_id}.",
        "",
        f"Details:",
        f"- Order ID: {claim.order_id}",
        f"- SKU: {claim.sku or 'N/A'}",
        f"- ASIN: {claim.asin or 'N/A'}",
        f"- Refund Date: {refund_date_str}",
        f"- Refund Amount: ${float(claim.refund_amount):.2f}",
        f"- Days Since Refund: {claim.days_since_refund}",
        f"- Return Received: {'Yes' if claim.has_return else 'No'}",
        f"- Prior Reimbursement: {'Yes' if claim.has_reimbursement else 'No'}",
        f"- Claim Scenario: {claim.claim_scenario}",
        "",
        f"Reason for claim: {scenario_desc}",
        "",
    ]

    if claim.claim_type == "safe-t":
        lines += [
            "This qualifies for a SAFE-T claim because the return reason indicates the issue "
            "was not caused by the buyer (e.g., carrier damage, undeliverable address, lost in transit).",
            "",
            "I kindly request that Amazon review this case and issue the appropriate reimbursement.",
        ]
    else:
        lines += [
            "Per Amazon's FBA reimbursement policy, I am entitled to reimbursement when Amazon "
            "loses or damages inventory, or when a refund is issued without a matching return.",
            "",
            "I kindly request that Amazon review this case and issue the appropriate reimbursement.",
        ]

    if claim.refund_reason and claim.refund_reason != "unknown":
        lines.insert(-1, f"")
        lines.insert(-1, f"Return reason on file: {claim.refund_reason}")

    lines += ["", "Thank you for your assistance.", ""]
    return "\n".join(lines)


async def run_refund_audit(session: AsyncSession, *, days: int = 180) -> dict:
    """
    Cross-reference returns, refunds, and reimbursements to find claimable orders.

    Scenario A: Non-buyer fault return reason + no reimbursement
    Scenario B: Refund > 45 days + no return + no reimbursement
    Scenario C: Returned unsellable + no reimbursement
    Scenario D: Return with non-buyer reason, no reimbursement, unresolved status
    Scenario E: Amazon disposed without reimbursement

    Results are written to RefundClaim table.
    """
    now = utcnow()

    # ── Load returns ─────────────────────────────────────────────────────────
    return_rows = list(
        await session.exec(
            select(ReturnEvent).where(col(ReturnEvent.order_id).is_not(None))
        )
    )
    returns_by_order: dict[str, list[ReturnEvent]] = {}
    for r in return_rows:
        oid = r.order_id
        if oid:
            returns_by_order.setdefault(oid, []).append(r)

    # ── Load reimbursements ───────────────────────────────────────────────────
    reimb_rows = list(
        await session.exec(
            select(ReimbursementEvent).where(col(ReimbursementEvent.order_id) != "")
        )
    )
    reimb_by_order: dict[str, list[ReimbursementEvent]] = {}
    for r in reimb_rows:
        if r.order_id:
            reimb_by_order.setdefault(r.order_id, []).append(r)

    # ── Load financial refund events ──────────────────────────────────────────
    fin_rows = list(
        await session.exec(
            select(FinancialEvent)
            .where(col(FinancialEvent.event_group) == "refund")
            .where(col(FinancialEvent.reference_id).is_not(None))
        )
    )

    # Aggregate refund totals per order_id (reference_id)
    refund_by_order: dict[str, dict] = {}
    for fe in fin_rows:
        oid = fe.reference_id
        if not oid:
            continue
        if oid not in refund_by_order:
            refund_by_order[oid] = {
                "order_id": oid,
                "date": fe.posted_date,
                "amount": Decimal(0),
                "sku": fe.sku or "",
            }
        if fe.amount is not None and fe.amount < 0:
            refund_by_order[oid]["amount"] += abs(fe.amount)
        if not refund_by_order[oid]["sku"] and fe.sku:
            refund_by_order[oid]["sku"] = fe.sku
        if fe.posted_date and (refund_by_order[oid]["date"] is None or fe.posted_date > refund_by_order[oid]["date"]):
            refund_by_order[oid]["date"] = fe.posted_date

    # ── Load existing claims for upsert tracking ──────────────────────────────
    existing_claims_rows = list(await session.exec(select(RefundClaim)))
    existing_by_order: dict[str, RefundClaim] = {c.order_id: c for c in existing_claims_rows}

    created = 0
    updated = 0
    claimed_order_ids: set[str] = set()

    async def _upsert_claim(
        order_id: str,
        *,
        sku: str,
        asin: str,
        refund_date: datetime | None,
        refund_amount: Decimal,
        refund_reason: str,
        has_return: bool,
        has_reimbursement: bool,
        claim_type: str,
        claim_scenario: str,
        status: str = "actionable",
    ) -> None:
        nonlocal created, updated
        days_since = _days_since(refund_date)
        priority = _determine_priority(refund_amount, days_since)

        existing = existing_by_order.get(order_id)
        if existing is None:
            claim = RefundClaim(
                order_id=order_id,
                sku=sku,
                asin=asin,
                refund_date=refund_date,
                refund_amount=refund_amount,
                refund_reason=refund_reason,
                days_since_refund=days_since,
                has_return=has_return,
                has_reimbursement=has_reimbursement,
                claim_type=claim_type,
                claim_scenario=claim_scenario,
                priority=priority,
                status=status,
                created_at=now,
                updated_at=now,
            )
            claim.template_text = generate_claim_template(claim)
            session.add(claim)
            existing_by_order[order_id] = claim
            created += 1
        else:
            # Only update fields if not already submitted/approved/denied
            if existing.status not in ("submitted", "approved", "denied"):
                existing.sku = sku or existing.sku
                existing.asin = asin or existing.asin
                existing.refund_date = refund_date or existing.refund_date
                existing.refund_amount = refund_amount if refund_amount > 0 else existing.refund_amount
                existing.refund_reason = refund_reason or existing.refund_reason
                existing.days_since_refund = days_since
                existing.has_return = has_return
                existing.has_reimbursement = has_reimbursement
                existing.claim_type = claim_type
                existing.claim_scenario = claim_scenario
                existing.priority = priority
                existing.status = status
                existing.updated_at = now
                if not existing.template_text:
                    existing.template_text = generate_claim_template(existing)
            updated += 1

    # ── Forward scan: refunded orders ────────────────────────────────────────
    for order_id, refund in refund_by_order.items():
        if refund["amount"] <= 0:
            continue

        has_return = order_id in returns_by_order
        has_reimb = order_id in reimb_by_order
        refund_date: datetime | None = refund["date"]
        days_since = _days_since(refund_date)
        amount: Decimal = refund["amount"]

        return_records = returns_by_order.get(order_id, [])
        return_reason = return_records[0].reason if return_records else ""
        is_unsellable = any(
            "unsellable" in (r.reason or "").lower() or "unsellable" in (r.status or "").lower()
            for r in return_records
        )

        claim_type: str | None = None
        claim_scenario: str | None = None
        status = "actionable"

        # Scenario A: Non-buyer fault refund, no reimbursement
        if not has_reimb and _matches_non_buyer(return_reason):
            claim_type = "safe-t" if _matches_safe_t(return_reason) else "reimbursement"
            claim_scenario = "A"

        # Scenario B: >45 days, no return, no reimbursement
        if not claim_type and not has_reimb and not has_return and days_since > 45:
            claim_type = "reimbursement"
            claim_scenario = "B"
            if days_since < 45:
                status = "waiting"

        # Scenario C: Returned unsellable, no reimbursement
        if not claim_type and not has_reimb and has_return and is_unsellable:
            claim_type = "reimbursement"
            claim_scenario = "C"

        if not claim_type:
            continue

        sku = return_records[0].sku or refund["sku"] if return_records else refund["sku"]
        asin = (return_records[0].raw_payload or {}).get("asin", "") if return_records else ""

        await _upsert_claim(
            order_id,
            sku=sku or "",
            asin=asin or "",
            refund_date=refund_date,
            refund_amount=amount,
            refund_reason=return_reason or "unknown",
            has_return=has_return,
            has_reimbursement=has_reimb,
            claim_type=claim_type,
            claim_scenario=claim_scenario,
            status=status,
        )
        claimed_order_ids.add(order_id)

    # ── Reverse scan: returns with non-buyer reasons ──────────────────────────
    for r in return_rows:
        order_id = r.order_id
        if not order_id:
            continue
        if not _matches_non_buyer(r.reason):
            continue
        if order_id in claimed_order_ids:
            continue

        has_reimb = order_id in reimb_by_order
        status_lower = (r.status or "").lower()
        days_since = _days_since(r.event_date)
        amount = refund_by_order.get(order_id, {}).get("amount", Decimal(0))

        claim_type = None
        claim_scenario = None

        # Scenario D: Non-buyer reason, no reimbursement, unresolved status
        if (
            not has_reimb
            and status_lower not in ("reimbursed", "unit returned to inventory")
        ):
            claim_type = "safe-t" if _matches_safe_t(r.reason) else "reimbursement"
            claim_scenario = "D"

        # Scenario E: Amazon disposed unit without reimbursement
        if not has_reimb and (
            status_lower in ("immediate_donation", "immediate_disposal")
            or "donation" in status_lower
            or "disposal" in status_lower
        ):
            claim_type = "reimbursement"
            claim_scenario = "E"

        if not claim_type:
            continue

        asin_val = (r.raw_payload or {}).get("asin", "") if r.raw_payload else ""

        await _upsert_claim(
            order_id,
            sku=r.sku or "",
            asin=asin_val or "",
            refund_date=r.event_date,
            refund_amount=Decimal(str(amount)) if amount else Decimal(0),
            refund_reason=r.reason or "unknown",
            has_return=True,
            has_reimbursement=has_reimb,
            claim_type=claim_type,
            claim_scenario=claim_scenario,
        )
        claimed_order_ids.add(order_id)

    await session.commit()

    # ── Build summary ─────────────────────────────────────────────────────────
    all_claims = list(await session.exec(select(RefundClaim)))
    actionable = [c for c in all_claims if c.status == "actionable"]
    submitted = [c for c in all_claims if c.status in ("submitted", "approved")]
    pending_amount = float(sum(c.refund_amount for c in actionable))
    recovered_amount = float(
        sum(c.refund_amount for c in all_claims if c.status == "approved")
    )

    return {
        "audit_date": now.strftime("%Y-%m-%d"),
        "period": f"last {days} days",
        "summary": {
            "pending_amount": pending_amount,
            "claimable_count": len(actionable),
            "recovered_amount": recovered_amount,
            "submitted_count": len(submitted),
            "audit_date": now.strftime("%Y-%m-%d"),
            "total_refunds": len(refund_by_order),
        },
        "claims_created": created,
        "claims_updated": updated,
    }
