import { NextRequest } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const payload: Record<string, unknown> = {
    order_ids: body.orderIds,
    status: body.status,
  }
  if (body.amazonCaseId) payload.amazon_case_id = body.amazonCaseId

  const res = await fetchBackend('/api/v1/amazon/refunds/claims/batch-status', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    return Response.json({ error: `Backend ${res.status}` }, { status: res.status })
  }
  return Response.json(await res.json())
}
