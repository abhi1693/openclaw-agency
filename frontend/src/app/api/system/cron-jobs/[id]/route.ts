import { NextResponse } from 'next/server'

const DEFAULT_BACKEND_BASE = 'http://127.0.0.1:8000'

function backendBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (raw && raw.toLowerCase() !== 'auto') return raw.replace(/\/+$/, '')
  return DEFAULT_BACKEND_BASE
}

function resolveAuthToken(incomingAuthorization: string): string {
  if (incomingAuthorization) return incomingAuthorization
  const envToken = process.env.LOCAL_AUTH_TOKEN?.trim()
  if (envToken) return `Bearer ${envToken}`
  return ''
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cookie = request.headers.get('cookie') ?? ''
    const authorization = resolveAuthToken(request.headers.get('authorization') ?? '')
    const body = await request.json()
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (cookie) headers['cookie'] = cookie
    if (authorization) headers['authorization'] = authorization

    const res = await fetch(`${backendBase()}/api/v1/system/cron-jobs/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Gateway 不可用' }, { status: res.status })
    }
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ error: 'Gateway 不可用' }, { status: 503 })
  }
}
