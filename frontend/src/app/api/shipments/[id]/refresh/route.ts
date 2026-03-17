import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '@/app/api/amazon/_backend'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await fetchBackend(`/api/v1/shipments/${id}/refresh`, { method: 'POST' })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
