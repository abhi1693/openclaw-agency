import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '@/app/api/amazon/_backend'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const search = req.nextUrl.search
    const res = await fetchBackend(`/api/v1/report-highlights${search}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const res = await fetchBackend('/api/v1/report-highlights', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
