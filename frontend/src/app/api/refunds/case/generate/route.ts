import { NextRequest } from 'next/server'
import { fetchBackend } from '../../../amazon/_backend'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const orderIds: string[] = body.orderIds || []

  if (!orderIds.length) {
    return Response.json({ error: 'No orderIds provided' }, { status: 400 })
  }

  const res = await fetchBackend('/api/v1/amazon/refunds/case/generate', {
    method: 'POST',
    body: JSON.stringify({ order_ids: orderIds }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[refunds/generate] backend error', res.status, text.slice(0, 200))
    return Response.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  const data = await res.json()
  // Map results to expected camelCase format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = (data.results || []).map((r: any) => ({
    orderId: r.order_id,
    status: r.status,
    error: r.error,
  }))
  return Response.json({ results })
}
