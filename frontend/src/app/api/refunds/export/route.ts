import { NextRequest } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const params = new URLSearchParams()
  if (status) params.set('status', status)

  const query = params.toString()
  const res = await fetchBackend(`/api/v1/amazon/refunds/export${query ? `?${query}` : ''}`)

  if (!res.ok) {
    console.error('[refunds/export] backend error', res.status)
    return new Response('Export failed', { status: res.status })
  }

  const csv = await res.text()
  const contentDisposition = res.headers.get('Content-Disposition') || 'attachment; filename="refunds.csv"'

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': contentDisposition,
    },
  })
}
