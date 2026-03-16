/**
 * GET /api/ppc/campaign-analysis — PPC campaign analysis
 * Migrated Phase 3: reads from FastAPI backend → /api/v1/amazon/ppc/campaign-analysis
 */
import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function GET() {
  try {
    const response = await fetchBackend('/api/v1/amazon/ppc/campaign-analysis')
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('PPC campaign-analysis backend error:', err)
    return NextResponse.json({
      empty: true,
      error: true,
      message: 'Campaign 分析数据加载失败',
      summary: null,
      duplicates: [],
      asinCoverage: { whitelist: [], covered: [], uncovered: [] },
      typeDistribution: { sp: {}, sb: {}, totalDailyBudget: 0 },
      zombieCampaigns: [],
      naming: { issueCount: 0, issues: [] },
      recommendations: [],
    }, { status: 503 })
  }
}
