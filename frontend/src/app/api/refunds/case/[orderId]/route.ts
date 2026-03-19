import { NextRequest } from 'next/server'
import { fetchBackend } from '../../../amazon/_backend'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClaim(c: any) {
  return {
    orderId: c.order_id,
    sku: c.sku,
    asin: c.asin,
    fnsku: c.fnsku || '',
    shipmentId: c.shipment_id || '',
    quantity: c.quantity || 0,
    refundDate: c.refund_date,
    amount: c.refund_amount,
    reason: c.refund_reason,
    daysSinceRefund: c.days_since_refund,
    hasReturn: c.has_return,
    hasReimbursement: c.has_reimbursement,
    claimType: c.claim_type,
    claimScenario: c.claim_scenario,
    priority: c.priority,
    status: c.status,
    caseId: c.amazon_case_id || null,
    evidence: c.evidence,
    template: c.template_text,
    notes: c.notes,
    submittedAt: c.submitted_at,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params
  const res = await fetchBackend(`/api/v1/amazon/refunds/case/${encodeURIComponent(orderId)}`)
  if (!res.ok) {
    if (res.status === 404) {
      return Response.json({ orderId, status: 'pending', template: null, caseId: null, notes: '', error: 'Claim not found' })
    }
    console.error('[refunds/case] backend error', res.status)
    return Response.json({ error: `Backend ${res.status}` }, { status: res.status })
  }
  return Response.json(mapClaim(await res.json()))
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params
  const body = await req.json()

  // Map camelCase → snake_case
  const payload: Record<string, unknown> = {}
  if (body.status !== undefined) payload.status = body.status
  if (body.caseId !== undefined) payload.amazon_case_id = body.caseId
  if (body.submittedAt !== undefined) payload.submitted_at = body.submittedAt
  if (body.notes !== undefined) payload.notes = body.notes

  const res = await fetchBackend(`/api/v1/amazon/refunds/case/${encodeURIComponent(orderId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    console.error('[refunds/case] PUT backend error', res.status)
    return Response.json({ error: `Backend ${res.status}` }, { status: res.status })
  }
  return Response.json(mapClaim(await res.json()))
}
