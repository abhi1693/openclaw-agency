import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'
export async function GET() { const res = await fetchBackend('/api/keywords/rankings'); return NextResponse.json(await res.json(), { status: res.status }) }
export async function POST() { const res = await fetchBackend('/api/keywords/rankings', { method: 'POST' }); return NextResponse.json(await res.json(), { status: res.status }) }
