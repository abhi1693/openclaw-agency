import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const params = new URLSearchParams()
  if (searchParams.get('entity_type')) params.set('entity_type', searchParams.get('entity_type')!)
  if (searchParams.get('campaign_id')) params.set('campaign_id', searchParams.get('campaign_id')!)
  if (searchParams.get('state')) params.set('state', searchParams.get('state')!)
  if (searchParams.get('limit')) params.set('limit', searchParams.get('limit')!)
  if (searchParams.get('offset')) params.set('offset', searchParams.get('offset')!)
  try {
    const res = await fetch(`${BACKEND}/ppc/automation/snapshots?${params}`, {
      headers: { Authorization: req.headers.get('authorization') ?? '' },
    })
    if (!res.ok) return NextResponse.json({ error: res.statusText }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
