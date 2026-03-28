import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'
export async function GET() { const res = await fetchBackend('/health'); return NextResponse.json(await res.json(), { status: res.status }) }
