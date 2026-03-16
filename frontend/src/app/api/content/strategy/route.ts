import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'
export async function POST(request: Request) { const res = await fetchBackend('/api/content/strategy', { method: 'POST', body: JSON.stringify(await request.json()) }); return NextResponse.json(await res.json(), { status: res.status }) }
