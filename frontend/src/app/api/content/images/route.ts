import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'
export async function GET(req: NextRequest) { const qs = req.nextUrl.searchParams.toString(); const res = await fetchBackend(`/api/content/images${qs ? '?' + qs : ''}`); return NextResponse.json(await res.json(), { status: res.status }) }
export async function POST(req: NextRequest) { const formData = await req.formData(); const res = await fetchBackend('/api/content/images', { method: 'POST', body: formData }); return NextResponse.json(await res.json(), { status: res.status }) }
export async function DELETE(req: NextRequest) { const qs = req.nextUrl.searchParams.toString(); const res = await fetchBackend(`/api/content/images${qs ? '?' + qs : ''}`, { method: 'DELETE' }); return NextResponse.json(await res.json(), { status: res.status }) }
