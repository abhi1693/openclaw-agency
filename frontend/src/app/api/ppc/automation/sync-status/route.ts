import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const stale = searchParams.get('stale_after_seconds') ?? '3600'
  try {
    const res = await fetch(`${BACKEND}/ppc/automation/sync/status?stale_after_seconds=${stale}`, {
      headers: { Authorization: req.headers.get('authorization') ?? '' },
    })
    if (!res.ok) return NextResponse.json({ error: res.statusText }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
