import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'
async function proxy(request: Request, method: string) { const url = new URL(request.url); const qs = url.searchParams.toString(); const init: RequestInit = { method }; if (method !== 'GET' && method !== 'DELETE') init.body = JSON.stringify(await request.json()); const res = await fetchBackend(`/api/intel/queue${qs ? '?' + qs : ''}`, init); return NextResponse.json(await res.json(), { status: res.status }) }
export async function GET(request: Request) { return proxy(request, 'GET') }
export async function POST(request: Request) { return proxy(request, 'POST') }
export async function PUT(request: Request) { return proxy(request, 'PUT') }
export async function DELETE(request: Request) { return proxy(request, 'DELETE') }
