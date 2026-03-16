import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'
export async function GET(request: Request) { const url = new URL(request.url); const qs = url.searchParams.toString(); const res = await fetchBackend(`/api/intel/reports${qs ? '?' + qs : ''}`); return NextResponse.json(await res.json(), { status: res.status }) }
export async function DELETE(request: Request) { const url = new URL(request.url); const qs = url.searchParams.toString(); const res = await fetchBackend(`/api/intel/reports${qs ? '?' + qs : ''}`, { method: 'DELETE' }); return NextResponse.json(await res.json(), { status: res.status }) }
