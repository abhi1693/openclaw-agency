import { NextRequest } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClaim(c: any) {
  return {
    orderId: c.order_id,
    sku: c.sku,
    asin: c.asin,
    fnsku: c.fnsku || '',
    shipmentId: c.shipment_id || '',
    quantity: c.quantity || 0,
    quantityEstimated: c.quantity_estimated || false,
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
    caseStatus: c.status,
    amazonCaseId: c.amazon_case_id,
    reimbursementId: c.reimbursement_id || '',
    evidence: c.evidence,
    template: c.template_text,
    notes: c.notes,
    submittedAt: c.submitted_at,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const params = new URLSearchParams()
  const status = searchParams.get('status')
  const reason = searchParams.get('reason')
  const priority = searchParams.get('priority')
  const claimType = searchParams.get('claimType')
  const sort = searchParams.get('sort') || 'amount_desc'
  const page = searchParams.get('page') || '1'
  const limit = searchParams.get('limit') || '50'
  const search = searchParams.get('search')

  if (status) params.set('status', status)
  if (reason) params.set('reason', reason)
  if (priority) params.set('priority', priority)
  if (claimType) params.set('claim_type', claimType)
  params.set('sort', sort)
  params.set('page', page)
  params.set('limit', limit)
  if (search) params.set('search', search)

  const res = await fetchBackend(`/api/v1/amazon/refunds/claims?${params}`)
  if (!res.ok) {
    console.error('[refunds/list] backend error', res.status)
    return Response.json({ claims: [], total: 0, page: Number(page), limit: Number(limit) })
  }

  const data = await res.json()
  return Response.json({
    claims: (data.claims || []).map(mapClaim),
    total: data.total,
    page: data.page,
    limit: data.limit,
  })
}
