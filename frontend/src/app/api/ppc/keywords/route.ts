/**
 * GET /api/ppc/keywords?days=7 — PPC keyword performance
 * Migrated Phase 3: reads from FastAPI backend → /api/v1/amazon/ppc/keywords
 */
import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const days = searchParams.get('days') || '7'
  try {
    const response = await fetchBackend(`/api/v1/amazon/ppc/keywords?days=${days}`)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('PPC keywords backend error:', err)
    return NextResponse.json({
      days: parseInt(days, 10),
      count: 0,
      keywords: [],
      kpi: { spend: 0, sales: 0, clicks: 0, orders: 0, impressions: 0, acos: 0, roas: 0, cpc: 0, ctr: 0, convRate: 0 },
      error: true,
      message: 'PPC keywords API 连接失败',
    }, { status: 503 })
  }
}
