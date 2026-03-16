/**
 * GET /api/ppc/search-terms?days=7 — PPC search term report
 * Migrated Phase 3: reads from FastAPI backend → /api/v1/amazon/ppc/search-terms
 */
import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const days = searchParams.get('days') || '7'
  const campaignId = searchParams.get('campaign_id') || ''
  try {
    const params = new URLSearchParams({ days })
    if (campaignId) params.set('campaign_id', campaignId)
    const response = await fetchBackend(`/api/v1/amazon/ppc/search-terms?${params}`)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('PPC search-terms backend error:', err)
    return NextResponse.json({
      days: parseInt(days, 10),
      count: 0,
      terms: [],
      error: true,
      message: '搜索词报告加载失败',
    }, { status: 503 })
  }
}
