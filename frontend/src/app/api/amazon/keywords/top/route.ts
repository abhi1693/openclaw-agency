import { NextResponse } from 'next/server'
import { fetchBackend } from '../../_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const asin = searchParams.get('asin')
  const limit = searchParams.get('limit') || '100'

  let url = `/api/v1/amazon/keywords/top?limit=${encodeURIComponent(limit)}`
  if (asin) url += `&asin=${encodeURIComponent(asin)}`

  try {
    const response = await fetchBackend(url)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend keywords/top error:', err)
    return NextResponse.json([], { status: 503 })
  }
}
