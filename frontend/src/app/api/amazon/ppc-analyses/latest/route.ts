import { NextResponse } from 'next/server'

import { fetchBackend } from '../../_backend'

export async function GET() {
  try {
    const response = await fetchBackend('/api/v1/amazon/ppc-analyses/latest')
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend ppc-analyses latest error:', err)
    return NextResponse.json({ total: 0, snapshots: [], error: true }, { status: 503 })
  }
}
