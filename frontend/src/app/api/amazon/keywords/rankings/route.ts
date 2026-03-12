import { NextResponse } from 'next/server'
import { fetchBackend } from '../../_backend'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown backend error'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const asin = searchParams.get('asin')
  const requestedDays = searchParams.get('days') || '90'
  const days = /^\d+$/.test(requestedDays) ? requestedDays : '90'

  let url = `/api/v1/amazon/keywords/rankings?days=${encodeURIComponent(days)}`
  if (asin) url += `&asin=${encodeURIComponent(asin)}`

  try {
    const response = await fetchBackend(url)
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    return NextResponse.json(await response.json())
  } catch (err: unknown) {
    console.warn('Backend keywords/rankings error:', getErrorMessage(err))
    return NextResponse.json([], { status: 503 })
  }
}
