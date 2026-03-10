import { NextResponse } from 'next/server'

import { fetchBackend } from '../_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') || '100'

  try {
    const response = await fetchBackend(`/api/v1/amazon/returns?limit=${encodeURIComponent(limit)}`)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend returns error:', err)
    return NextResponse.json({ total: 0, period: 'Last 30 days', events: [], error: true }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const days = searchParams.get('days') || '30'

  try {
    const response = await fetchBackend(`/api/v1/amazon/returns/sync?days=${encodeURIComponent(days)}`, { method: 'POST' })
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend returns sync error:', err)
    return NextResponse.json({ error: true, message: 'Returns sync failed' }, { status: 503 })
  }
}
