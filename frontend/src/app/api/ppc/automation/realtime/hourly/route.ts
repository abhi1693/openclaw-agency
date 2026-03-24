import { NextResponse } from 'next/server'
import { fetchBackend } from '../../../../amazon/_backend'

export async function GET() {
  const res = await fetchBackend('/api/v1/ppc/automation/realtime/hourly')
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
