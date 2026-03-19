"""Refund recovery audit engine — cross-references returns, refunds, and reimbursements."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.amazon_orders import (
    AmazonOrder,
    AmazonOrderItem,
    FinancialEvent,
    ProductCost,
    RefundClaim,
    ReimbursementEvent,
    ReturnEvent,
)

logger = get_logger(__name__)

# Default human-readable reason per scenario — used when raw reason is unavailable/unknown
SCENARIO_DEFAULT_REASON: dict[str, str] = {
    "A": "Customer refund issued - item not returned to FBA inventory",
    "B": "Inventory lost in FBA warehouse - not reimbursed",
    "C": "Inventory damaged/disposed in FBA warehouse",
    "D": "Reimbursement amount disputed",
    "E": "FBA fulfillment issue - requires investigation",
}


def _resolve_reason(raw_reason: str | None, claim_scenario: str) -> str:
    """Return a clean human-readable reason, never 'unknown' or empty."""
    r = (raw_reason or "").strip()
    if r and r.lower() != "unknown":
        return r
    return SCENARIO_DEFAULT_REASON.get(claim_scenario, "FBA fulfillment issue - requires investigation")


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
    # Load ALL reimbursement events — used for two purposes:
    # 1. reimb_by_order: check if a specific order has been reimbursed
    # 2. fnsku_by_sku: fallback FNSKU lookup by SKU (some rows have empty order_id)
    reimb_rows = list(await session.exec(select(ReimbursementEvent)))
    reimb_by_order: dict[str, list[ReimbursementEvent]] = {}
    fnsku_by_sku: dict[str, str] = {}
    reimb_by_sku: dict[str, list[ReimbursementEvent]] = {}
    for r in reimb_rows:
        if r.order_id:
            reimb_by_order.setdefault(r.order_id, []).append(r)
        if r.fnsku and r.sku and r.sku not in fnsku_by_sku:
            fnsku_by_sku[r.sku] = r.fnsku
        if r.sku:
            reimb_by_sku.setdefault(r.sku, []).append(r)

    # ── Build quantity lookup from order items ────────────────────────────────
    # AmazonOrderItem.order_id is a UUID FK to AmazonOrder.id; we need
    # amazon_order_id (string) → so we join through AmazonOrder first.
    order_rows = list(await session.exec(select(AmazonOrder)))
    order_uuid_to_amazon_id: dict[str, str] = {str(o.id): o.amazon_order_id for o in order_rows}
    item_rows = list(await session.exec(select(AmazonOrderItem)))
    qty_by_order_sku: dict[tuple[str, str], int] = {}
    sku_prices: dict[str, list[Decimal]] = {}  # sku → list of observed unit prices
    for item in item_rows:
        amazon_oid = order_uuid_to_amazon_id.get(str(item.order_id))
        if amazon_oid and item.sku and item.quantity_ordered:
            # Keep the max in case of duplicate rows
            key = (amazon_oid, item.sku)
            qty_by_order_sku[key] = max(qty_by_order_sku.get(key, 0), item.quantity_ordered)
        if item.sku and item.item_price and item.item_price > 0 and item.quantity_ordered > 0:
            unit_px = item.item_price / item.quantity_ordered
            sku_prices.setdefault(item.sku, []).append(unit_px)

    # ── Build unit-price lookup for quantity estimation ───────────────────────
    # Priority: median selling price from order items → product_costs.unit_cost
    sku_to_unit_price: dict[str, Decimal] = {}
    for sku, prices in sku_prices.items():
        sorted_px = sorted(prices)
        mid = len(sorted_px) // 2
        sku_to_unit_price[sku] = sorted_px[mid]

    # Fill gaps using ProductCost (COGS) with a conservative 2× markup estimate
    cost_rows = list(await session.exec(select(ProductCost)))
    for pc in cost_rows:
        if pc.sku and pc.sku not in sku_to_unit_price and pc.unit_cost > 0:
            sku_to_unit_price[pc.sku] = pc.unit_cost * Decimal("2")

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
        fnsku: str = "",
        shipment_id: str = "",
        quantity: int = 0,
        quantity_estimated: bool = False,
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
                fnsku=fnsku,
                shipment_id=shipment_id,
                quantity=quantity,
                quantity_estimated=quantity_estimated,
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
                existing.fnsku = fnsku or existing.fnsku
                existing.shipment_id = shipment_id or existing.shipment_id
                # Prefer real quantity over estimated; only overwrite estimated with real
                if quantity and (not existing.quantity or existing.quantity_estimated):
                    existing.quantity = quantity
                    existing.quantity_estimated = quantity_estimated
                existing.refund_date = refund_date or existing.refund_date
                existing.refund_amount = refund_amount if refund_amount > 0 else existing.refund_amount
                # Only overwrite reason if new value is non-empty and non-"unknown"
                if refund_reason and refund_reason.lower() != "unknown":
                    existing.refund_reason = refund_reason
                elif not existing.refund_reason or existing.refund_reason.lower() == "unknown":
                    existing.refund_reason = refund_reason
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
        rp = (return_records[0].raw_payload or {}) if return_records else {}
        asin = str(rp.get("asin") or "")
        fnsku = str(rp.get("fnSku") or rp.get("fnsku") or fnsku_by_sku.get(sku or "") or "")
        shipment_id = str(rp.get("shipmentId") or rp.get("shipment_id") or "")
        # Priority 1: return_events.quantity
        quantity = return_records[0].quantity if return_records else 0
        # Priority 2: amazon_order_items.quantity_ordered
        if not quantity:
            quantity = qty_by_order_sku.get((order_id, sku or ""), 0)

        # Scenario B: no return records — enrich reason/quantity from reimbursement events by SKU
        if claim_scenario == "B":
            b_reimb = reimb_by_sku.get(sku or "") or []
            if not b_reimb and fnsku:
                b_reimb = [r for r in reimb_rows if r.fnsku == fnsku]
            if b_reimb:
                if not return_reason:
                    return_reason = b_reimb[0].reason or ""
                if not quantity and b_reimb[0].amount_inventory:
                    quantity = b_reimb[0].amount_inventory

        # Priority 3: estimate from refund_amount ÷ unit_price
        qty_estimated = False
        if not quantity:
            unit_px = sku_to_unit_price.get(sku or "")
            if unit_px and unit_px > 0:
                quantity = max(1, round(float(amount) / float(unit_px)))
                qty_estimated = True
        # Priority 4: conservative fallback
        if not quantity:
            quantity = 1

        await _upsert_claim(
            order_id,
            sku=sku or "",
            asin=asin or "",
            fnsku=fnsku or "",
            shipment_id=shipment_id,
            quantity=quantity,
            quantity_estimated=qty_estimated,
            refund_date=refund_date,
            refund_amount=amount,
            refund_reason=_resolve_reason(return_reason, claim_scenario),
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

        rp_r = (r.raw_payload or {}) if r.raw_payload else {}
        asin_val = str(rp_r.get("asin") or "")
        fnsku_val = str(rp_r.get("fnSku") or rp_r.get("fnsku") or fnsku_by_sku.get(r.sku or "") or "")
        shipment_id_val = str(rp_r.get("shipmentId") or rp_r.get("shipment_id") or "")
        # Priority 1: return_events.quantity; Priority 2: order items
        r_quantity = r.quantity or qty_by_order_sku.get((order_id, r.sku or ""), 0)
        r_qty_estimated = False
        if not r_quantity:
            # Priority 3: estimate from refund amount ÷ unit price
            r_amount = Decimal(str(amount)) if amount else Decimal(0)
            unit_px = sku_to_unit_price.get(r.sku or "")
            if unit_px and unit_px > 0 and r_amount > 0:
                r_quantity = max(1, round(float(r_amount) / float(unit_px)))
                r_qty_estimated = True
            else:
                r_quantity = 1  # Priority 4: fallback

        await _upsert_claim(
            order_id,
            sku=r.sku or "",
            asin=asin_val or "",
            fnsku=fnsku_val or "",
            shipment_id=shipment_id_val,
            quantity=r_quantity,
            quantity_estimated=r_qty_estimated,
            refund_date=r.event_date,
            refund_amount=Decimal(str(amount)) if amount else Decimal(0),
            refund_reason=_resolve_reason(r.reason, claim_scenario),
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
