import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../../../amazon/_backend'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const res = await fetchBackend('/api/v1/ppc/automation/dayparting/import-hourly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
