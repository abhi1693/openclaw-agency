import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'
export async function GET(request: Request) { const qs = new URL(request.url).searchParams.toString(); const res = await fetchBackend(`/api/content/prompts${qs ? '?' + qs : ''}`); return NextResponse.json(await res.json(), { status: res.status }) }
export async function POST(request: Request) { const res = await fetchBackend('/api/content/prompts', { method: 'POST', body: JSON.stringify(await request.json()) }); return NextResponse.json(await res.json(), { status: res.status }) }
export async function PATCH(request: Request) { const qs = new URL(request.url).searchParams.toString(); const res = await fetchBackend(`/api/content/prompts${qs ? '?' + qs : ''}`, { method: 'PATCH', body: JSON.stringify(await request.json()) }); return NextResponse.json(await res.json(), { status: res.status }) }
export async function DELETE(request: Request) { const qs = new URL(request.url).searchParams.toString(); const res = await fetchBackend(`/api/content/prompts${qs ? '?' + qs : ''}`, { method: 'DELETE' }); return NextResponse.json(await res.json(), { status: res.status }) }
