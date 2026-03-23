import { NextResponse } from 'next/server'
import { fetchBackend } from '../_backend'

export async function POST() {
  try {
    const res = await fetchBackend('/api/v1/ams/subscriptions/ensure', { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return NextResponse.json(data, { status: res.status })
    }
    return NextResponse.json(await res.json())
  } catch (err) {
    console.error('AMS ensure error:', err)
    return NextResponse.json({ error: true, message: 'Ensure subscriptions failed' }, { status: 503 })
  }
}
