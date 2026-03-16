import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function GET() {
  try {
    const resp = await fetchBackend('/api/v1/amazon/inventory/fc-distribution')
    if (!resp.ok) throw new Error(`Backend responded ${resp.status}`)
    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[fc-distribution] error:', msg)
    return NextResponse.json({ error: true, message: msg }, { status: 500 })
  }
}
