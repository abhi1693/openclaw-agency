import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'
async function proxy(request: Request, method: string) { const qs = new URL(request.url).searchParams.toString(); const res = await fetchBackend(`/api/listing/reports${qs ? '?' + qs : ''}`, { method }); return NextResponse.json(await res.json(), { status: res.status }) }
export async function GET(request: Request) { return proxy(request, 'GET') }
export async function DELETE(request: Request) { return proxy(request, 'DELETE') }
