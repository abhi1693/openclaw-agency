import { NextResponse } from 'next/server'
import { fetchBackend } from '../../../amazon/_backend'

export async function POST() {
  const res = await fetchBackend('/api/v1/ppc/automation/run-placement-analysis', { method: 'POST', body: '{}' })
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
