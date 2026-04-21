import { NextRequest, NextResponse } from 'next/server'

import { fetchBackend } from '../../../../amazon/_backend'

export async function POST(req: NextRequest) {
  try {
    const res = await fetchBackend('/api/v1/ppc/automation/snapshots/sync', {
      method: 'POST',
      headers: { Authorization: req.headers.get('authorization') ?? '', 'Content-Type': 'application/json' },
    })
    if (!res.ok) return NextResponse.json({ error: res.statusText }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
