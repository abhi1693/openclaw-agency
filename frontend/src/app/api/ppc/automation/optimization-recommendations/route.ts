import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../../amazon/_backend'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const targetAcos = searchParams.get('target_acos') || '25'
  const res = await fetchBackend(
    `/api/v1/amazon/ppc/optimization-recommendations?target_acos=${targetAcos}`
  )
  if (!res.ok) return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
