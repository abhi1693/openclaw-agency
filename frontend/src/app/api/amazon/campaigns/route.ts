import { NextResponse } from 'next/server'

import { fetchBackend } from '../_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'sp'
  const limit = searchParams.get('limit') || '200'

  try {
    const response = await fetchBackend(`/api/v1/amazon/campaigns?campaign_type=${encodeURIComponent(type)}&limit=${encodeURIComponent(limit)}`)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend campaigns error:', err)
    return NextResponse.json({ total: 0, campaign_type: type, campaigns: [], error: true }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'sp'
  const days = searchParams.get('days') || '7'

  try {
    const response = await fetchBackend(`/api/v1/amazon/campaigns/sync?campaign_type=${encodeURIComponent(type)}&days=${encodeURIComponent(days)}`, { method: 'POST' })
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend campaigns sync error:', err)
    return NextResponse.json({ error: true, message: 'Campaign sync failed' }, { status: 503 })
  }
}
