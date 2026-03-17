import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '@/app/api/amazon/_backend'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const params = url.searchParams.toString()
  const res = await fetchBackend(`/api/v1/shipments/${params ? `?${params}` : ''}`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const res = await fetchBackend('/api/v1/shipments/', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
