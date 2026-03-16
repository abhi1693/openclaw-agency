/**
 * GET /api/ppc/ai-insights — PPC AI insights
 * Migrated Phase 3: reads from FastAPI backend → /api/v1/amazon/ppc/ai-insights
 */
import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function GET() {
  try {
    const response = await fetchBackend('/api/v1/amazon/ppc/ai-insights')
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('PPC ai-insights backend error:', err)
    return NextResponse.json({
      empty: true,
      error: true,
      message: 'AI 洞察数据加载失败',
    }, { status: 503 })
  }
}
