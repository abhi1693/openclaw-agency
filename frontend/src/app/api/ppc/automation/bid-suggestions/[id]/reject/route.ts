import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../../../../amazon/_backend'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await fetchBackend(`/api/v1/ppc/automation/bid-suggestions/${id}/reject`, { method: 'POST' })
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
