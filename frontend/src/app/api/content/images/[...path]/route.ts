import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../../amazon/_backend'
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { const { path } = await params; const res = await fetchBackend(`/api/content/images/${path.join('/')}`); return new NextResponse(await res.arrayBuffer(), { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': res.headers.get('cache-control') || 'public, max-age=3600' } }) }
