/**
 * GET /api/ppc/weekly-report — PPC weekly report
 * Migrated Phase 3: reads from FastAPI backend → /api/v1/amazon/ppc/weekly
 */
import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function GET() {
  try {
    const response = await fetchBackend('/api/v1/amazon/ppc/weekly')
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('PPC weekly-report backend error:', err)
    return NextResponse.json({
      empty: true,
      error: true,
      message: '周报数据加载失败',
      overview: { totalSpend: null, totalSales: null, totalOrders: null, acos: null, roas: null },
      moneyKeywords: [],
      burnKeywords: [],
      actionItems: [],
      riskAlerts: [],
      summary: { highPriorityActions: 0, mediumPriorityActions: 0, criticalAlerts: 0, warningAlerts: 0 },
    }, { status: 503 })
  }
}
