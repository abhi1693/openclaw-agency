import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'
export async function POST() { const res = await fetchBackend('/api/reviews/crawl', { method: 'POST' }); return NextResponse.json(await res.json(), { status: res.status }) }
