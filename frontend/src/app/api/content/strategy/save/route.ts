import { NextResponse } from 'next/server'
import { fetchBackend } from '../../../amazon/_backend'
export async function GET() { const res = await fetchBackend('/api/content/strategy/save'); return NextResponse.json(await res.json(), { status: res.status }) }
export async function POST(request: Request) { const res = await fetchBackend('/api/content/strategy/save', { method: 'POST', body: JSON.stringify(await request.json()) }); return NextResponse.json(await res.json(), { status: res.status }) }
