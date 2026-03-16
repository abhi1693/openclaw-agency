import { fetchBackend } from '../../amazon/_backend'

export async function POST() {
  try {
    const res = await fetchBackend('/api/v1/amazon/refunds/audit', {
      method: 'POST',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[refunds/audit] backend error', res.status, text.slice(0, 200))
      return Response.json({ success: false, error: `Backend ${res.status}` }, { status: 500 })
    }
    const data = await res.json()
    return Response.json({ success: true, result: data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[refunds/audit] failed:', msg)
    return Response.json({ success: false, error: msg.slice(0, 500) }, { status: 500 })
  }
}
