import { NextResponse } from 'next/server'

import { fetchBackend } from '../_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const campaignId = searchParams.get('campaign_id')
  const days = searchParams.get('days') || '30'
  const limit = searchParams.get('limit') || '500'

  let url = `/api/v1/amazon/search-terms?days=${encodeURIComponent(days)}&limit=${encodeURIComponent(limit)}`
  if (campaignId) url += `&campaign_id=${encodeURIComponent(campaignId)}`

  try {
    const response = await fetchBackend(url)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend search-terms error:', err)
    return NextResponse.json({ total: 0, period: '', terms: [], error: true }, { status: 503 })
  }
}

export async function POST() {
  try {
    const response = await fetchBackend('/api/v1/amazon/search-terms/sync', { method: 'POST' })
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend search-terms sync error:', err)
    return NextResponse.json({ error: true, message: 'Search terms sync failed' }, { status: 503 })
  }
}
