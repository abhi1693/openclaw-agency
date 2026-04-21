import { NextResponse } from 'next/server'
import { fetchBackend } from '../../../../amazon/_backend'

export async function POST() {
  const res = await fetchBackend('/api/v1/ppc/automation/keyword-recommendations/auto-resolve-ad-group', {
    method: 'POST',
  })
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
