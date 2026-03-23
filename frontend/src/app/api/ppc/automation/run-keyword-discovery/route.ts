import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../../amazon/_backend'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const res = await fetchBackend('/api/v1/ppc/automation/run-keyword-discovery', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
