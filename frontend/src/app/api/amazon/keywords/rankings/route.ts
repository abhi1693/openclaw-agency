import { NextResponse } from 'next/server'
import { fetchBackend } from '../../_backend'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const asin = searchParams.get('asin')
  const days = searchParams.get('days') || '90'

  let url = `/api/v1/amazon/keywords/rankings?days=${encodeURIComponent(days)}`
  if (asin) url += `&asin=${encodeURIComponent(asin)}`

  try {
    const response = await fetchBackend(url)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.error('Backend keywords/rankings error:', err)
    return NextResponse.json([], { status: 503 })
  }
}
