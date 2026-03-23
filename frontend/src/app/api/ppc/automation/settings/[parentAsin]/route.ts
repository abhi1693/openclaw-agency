import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../../../amazon/_backend'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ parentAsin: string }> }) {
  const { parentAsin } = await params
  const res = await fetchBackend(`/api/v1/ppc/automation/settings/${parentAsin}`)
  if (res.status === 404) return NextResponse.json(null, { status: 404 })
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ parentAsin: string }> }) {
  const { parentAsin } = await params
  const body = await req.json()
  const res = await fetchBackend(`/api/v1/ppc/automation/settings/${parentAsin}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
