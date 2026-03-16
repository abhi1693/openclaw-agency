import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'
export async function GET() { const res = await fetchBackend('/api/keywords/config'); return NextResponse.json(await res.json(), { status: res.status }) }
export async function POST(request: Request) { const res = await fetchBackend('/api/keywords/config', { method: 'POST', body: JSON.stringify(await request.json()) }); return NextResponse.json(await res.json(), { status: res.status }) }
export async function DELETE(request: Request) { const qs = new URL(request.url).searchParams.toString(); const res = await fetchBackend(`/api/keywords/config${qs ? '?' + qs : ''}`, { method: 'DELETE' }); return NextResponse.json(await res.json(), { status: res.status }) }
