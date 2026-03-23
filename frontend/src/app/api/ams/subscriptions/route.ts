import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../_backend'

export async function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get('profile_id') || ''
  try {
    const res = await fetchBackend(`/api/v1/ams/subscriptions?profile_id=${encodeURIComponent(profileId)}`)
    if (!res.ok) throw new Error(`Backend responded ${res.status}`)
    return NextResponse.json(await res.json())
  } catch (err) {
    console.error('AMS list subscriptions error:', err)
    return NextResponse.json({ subscriptions: [], error: true }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const res = await fetchBackend('/api/v1/ams/subscriptions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('AMS create subscription error:', err)
    return NextResponse.json({ error: true, message: 'Create subscription failed' }, { status: 503 })
  }
}
