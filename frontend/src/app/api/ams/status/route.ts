import { NextResponse } from 'next/server'
import { fetchBackend } from '../_backend'

export async function GET() {
  try {
    const res = await fetchBackend('/api/v1/ams/status')
    if (!res.ok) throw new Error(`Backend responded ${res.status}`)
    return NextResponse.json(await res.json())
  } catch (err) {
    console.error('AMS status error:', err)
    return NextResponse.json({ configured_datasets: [], consumer: {}, error: true }, { status: 503 })
  }
}
