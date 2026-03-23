import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../../../../amazon/_backend'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.text()
  const res = await fetchBackend(`/api/v1/ppc/automation/campaign-plans/${id}/approve`, {
    method: 'POST',
    body: body || '{}',
  })
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
