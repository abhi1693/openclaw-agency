import { NextResponse } from 'next/server'

import { fetchBackend } from '../_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') || '100'

  try {
    const response = await fetchBackend(`/api/v1/amazon/budget?limit=${encodeURIComponent(limit)}`)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend budget error:', err)
    return NextResponse.json({ total: 0, period: 'Last 7 days', metrics: [], error: true }, { status: 503 })
  }
}
