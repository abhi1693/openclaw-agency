import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '@/app/api/amazon/_backend'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const body = await req.json()
    const res = await fetchBackend(`/api/v1/report-highlights/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const res = await fetchBackend(`/api/v1/report-highlights/${id}`, {
      method: 'DELETE',
    })
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 })
    }
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
