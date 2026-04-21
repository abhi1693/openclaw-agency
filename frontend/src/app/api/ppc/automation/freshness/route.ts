import { NextRequest, NextResponse } from 'next/server'

import { fetchBackend } from '../../../amazon/_backend'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const stale = searchParams.get('stale_after_seconds') ?? '3600'
  try {
    const res = await fetchBackend(`/api/v1/ppc/automation/freshness?stale_after_seconds=${stale}`, {
      headers: { Authorization: req.headers.get('authorization') ?? '' },
    })
    if (!res.ok) return NextResponse.json({ error: res.statusText }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
