import { NextResponse } from 'next/server'

import { fetchBackend } from '../_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') || '100'

  try {
    const response = await fetchBackend(`/api/v1/amazon/pricing?limit=${encodeURIComponent(limit)}`)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend pricing error:', err)
    return NextResponse.json({ total: 0, snapshots: [], error: true }, { status: 503 })
  }
}

export async function POST() {
  try {
    const response = await fetchBackend('/api/v1/amazon/pricing/sync', { method: 'POST' })
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend pricing sync error:', err)
    return NextResponse.json({ error: true, message: 'Pricing sync failed' }, { status: 503 })
  }
}
