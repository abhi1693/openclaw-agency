/**
 * GET /api/ppc — PPC keyword analysis (add/negative/upgrade suggestions)
 * Migrated Phase 3: reads from FastAPI backend → /api/v1/amazon/ppc/keyword-analysis
 */
import { NextResponse } from 'next/server'
import { fetchBackend } from '../amazon/_backend'

export async function GET() {
  try {
    const response = await fetchBackend('/api/v1/amazon/ppc/keyword-analysis')
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('PPC keyword-analysis backend error:', err)
    return NextResponse.json({
      empty: true,
      source: 'none',
      message: '暂无分析数据，等待下次分析运行',
      summary: null,
      addKeywords: [],
      negativeKeywords: [],
      matchUpgrades: [],
      longTail: [],
      duplicateTargeting: [],
      error: true,
    }, { status: 503 })
  }
}
