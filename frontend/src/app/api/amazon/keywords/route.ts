import { NextResponse } from 'next/server'
import { fetchBackend } from '../_backend'

export async function GET() {
  try {
    const res = await fetchBackend('/api/amazon/keywords/search-terms')
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('Keywords API error:', err)
    return NextResponse.json({
      noData: true,
      message: 'Backend unavailable',
      period: 'N/A',
      summary: { addKeywords: 0, negativeKeywords: 0, bidUpSuggestions: 0, bidDownSuggestions: 0, watchList: 0 },
      topAdd: [],
      topNegative: [],
      topBidUp: [],
      topBidDown: [],
    }, { status: 503 })
  }
}
