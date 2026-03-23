import { NextResponse } from 'next/server'
import { fetchBackend } from '../_backend'

export async function GET() {
  try {
    const res = await fetchBackend('/api/v1/ams/config')
    if (!res.ok) throw new Error(`Backend responded ${res.status}`)
    return NextResponse.json(await res.json())
  } catch (err) {
    console.error('AMS config error:', err)
    return NextResponse.json({ profile_id: '', datasets: [], error: true }, { status: 503 })
  }
}
