import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../../../amazon/_backend'

export async function GET(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params
  const { searchParams } = new URL(req.url)
  const qs = searchParams.toString()
  const res = await fetchBackend(`/api/v1/ppc/automation/dayparting/${campaignId}${qs ? `?${qs}` : ''}`)
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
