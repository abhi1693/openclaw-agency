import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND}/ppc/automation/snapshots/sync`, {
      method: 'POST',
      headers: { Authorization: req.headers.get('authorization') ?? '', 'Content-Type': 'application/json' },
    })
    if (!res.ok) return NextResponse.json({ error: res.statusText }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
