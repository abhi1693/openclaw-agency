import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '@/app/api/amazon/_backend'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; move_id: string }> }
) {
  const { id, move_id } = await params
  const res = await fetchBackend(`/api/v1/shipments/${id}/moves/${move_id}`, { method: 'DELETE' })
  if (res.status === 204) return new NextResponse(null, { status: 204 })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
