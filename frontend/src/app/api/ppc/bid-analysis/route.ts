/**
 * GET /api/ppc/bid-analysis — PPC bid & budget analysis
 * Migrated Phase 3: reads from FastAPI backend → /api/v1/amazon/ppc/bid-analysis
 */
import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function GET() {
  try {
    const response = await fetchBackend('/api/v1/amazon/ppc/bid-analysis')
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('PPC bid-analysis backend error:', err)
    return NextResponse.json({
      empty: true,
      error: true,
      message: 'Bid 分析数据加载失败',
      summary: null,
      bidEfficiency: { overbidding: [], underbidding: [], wellBidCount: 0, totalAnalyzed: 0 },
      budgetUtilization: { campaigns: [], capped: [], underutilized: [], dormant: [] },
      acosAnalysis: { deteriorating: [], breakeven: [] },
      performers: { top5: [], bottom5: [] },
      reallocations: [],
    }, { status: 503 })
  }
}
