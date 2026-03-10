import { NextResponse } from 'next/server'

import { fetchBackend } from '../_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const days = searchParams.get('days') || '90'
  const limit = searchParams.get('limit') || '50'

  let url = `/api/v1/amazon/ppc-analyses?days=${encodeURIComponent(days)}&limit=${encodeURIComponent(limit)}`
  if (type) url += `&type=${encodeURIComponent(type)}`

  try {
    const response = await fetchBackend(url)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend ppc-analyses error:', err)
    return NextResponse.json({ total: 0, snapshots: [], error: true }, { status: 503 })
  }
}

export async function POST() {
  try {
    const response = await fetchBackend('/api/v1/amazon/ppc-analyses/sync', { method: 'POST' })
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend ppc-analyses sync error:', err)
    return NextResponse.json({ error: true, message: 'PPC analyses sync failed' }, { status: 503 })
  }
}
