import { NextResponse } from 'next/server'
import { fetchBackend } from '../../_backend'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown backend error'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const asin = searchParams.get('asin')
  const requestedLimit = searchParams.get('limit') || '100'
  const limit = /^\d+$/.test(requestedLimit) ? requestedLimit : '100'

  let url = `/api/v1/amazon/keywords/top?limit=${encodeURIComponent(limit)}`
  if (asin) url += `&asin=${encodeURIComponent(asin)}`

  try {
    const response = await fetchBackend(url)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.warn('Backend keywords/top error:', getErrorMessage(err))
    return NextResponse.json([], { status: 503 })
  }
}
