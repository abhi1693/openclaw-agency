import { NextResponse } from 'next/server'
import { fetchBackend } from '../../_backend'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown backend error'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const asin = searchParams.get('asin')
  const keyword = searchParams.get('keyword')

  if (!asin || !keyword) {
    return NextResponse.json({ error: 'asin and keyword are required' }, { status: 400 })
  }

  const url = `/api/v1/amazon/keywords/trends?asin=${encodeURIComponent(asin)}&keyword=${encodeURIComponent(keyword)}`

  try {
    const response = await fetchBackend(url)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.warn('Backend keywords/trends error:', getErrorMessage(err))
    return NextResponse.json([], { status: 503 })
  }
}
