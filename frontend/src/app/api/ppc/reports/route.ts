/**
 * GET  /api/ppc/reports              — list .md report files
 * GET  /api/ppc/reports?file=<name>  — return content of a specific file
 * Migrated Phase 3: reads from FastAPI backend → /api/v1/amazon/ppc/reports
 * Note: DELETE is not proxied (rarely used, keep local if needed)
 */
import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const file = searchParams.get('file')
  try {
    const params = new URLSearchParams()
    if (file) params.set('file', file)
    const url = params.toString()
      ? `/api/v1/amazon/ppc/reports?${params}`
      : '/api/v1/amazon/ppc/reports'
    const response = await fetchBackend(url)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('PPC reports backend error:', err)
    return NextResponse.json({
      error: true,
      message: 'PPC reports API 连接失败',
      count: 0,
      files: [],
    }, { status: 503 })
  }
}
