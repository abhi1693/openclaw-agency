import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '@/app/api/amazon/_backend'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await fetchBackend(`/api/v1/shipments/${id}`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const res = await fetchBackend(`/api/v1/shipments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await fetchBackend(`/api/v1/shipments/${id}`, { method: 'DELETE' })
  if (res.status === 204) return new NextResponse(null, { status: 204 })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
