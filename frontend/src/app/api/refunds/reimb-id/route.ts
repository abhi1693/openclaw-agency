import { type NextRequest } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const params = new URLSearchParams()
  for (const [k, v] of searchParams.entries()) params.set(k, v)

  const res = await fetchBackend(`/api/v1/amazon/refunds/reimb-id?${params}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[refunds/reimb-id] backend error', res.status, text.slice(0, 200))
    return Response.json({ reimbursement_id: null })
  }
  return Response.json(await res.json())
}
