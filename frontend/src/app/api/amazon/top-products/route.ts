import { NextResponse } from 'next/server'

import { fetchBackend } from '../_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') || '10'

  try {
    const response = await fetchBackend(`/api/v1/amazon/top-products?limit=${encodeURIComponent(limit)}`)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend top-products error:', err)
    return NextResponse.json({ total: 0, period: 'Last 14 days', products: [], error: true }, { status: 503 })
  }
}
