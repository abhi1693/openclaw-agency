import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../../../amazon/_backend'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params
  const body = await req.json()
  const res = await fetchBackend(`/api/v1/ppc/automation/goals/${campaignId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
