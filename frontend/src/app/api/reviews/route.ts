import { NextResponse } from 'next/server'
import { fetchBackend } from '../amazon/_backend'
export async function GET(request: Request) { const qs = new URL(request.url).searchParams.toString(); const res = await fetchBackend(`/api/reviews${qs ? '?' + qs : ''}`); return NextResponse.json(await res.json(), { status: res.status }) }
