import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../../../amazon/_backend'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const res = await fetchBackend('/api/v1/ppc/automation/campaign-plans/generate', {
    method: 'POST',
    body,
  })
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
