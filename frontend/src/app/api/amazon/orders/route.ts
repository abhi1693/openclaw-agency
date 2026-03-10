import { NextResponse } from 'next/server'

import { fetchBackend } from '../_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const days = searchParams.get('days') || '7'

  try {
    const response = await fetchBackend(`/api/v1/amazon/orders?days=${encodeURIComponent(days)}`)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    const data = await response.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error('Backend orders error:', err)
    return NextResponse.json({ total: 0, period: `Last ${days} days`, orders: [], error: true }, { status: 503 })
  }
}
