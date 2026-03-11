import { NextResponse } from 'next/server'

const DEFAULT_BACKEND_BASE = 'http://127.0.0.1:8000'

function backendBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (raw && raw.toLowerCase() !== 'auto') return raw.replace(/\/+$/, '')
  return DEFAULT_BACKEND_BASE
}

export async function GET(request: Request) {
  try {
    // Forward auth cookies/headers from the incoming request so the backend
    // can authenticate the user via its standard session mechanism.
    const cookie = request.headers.get('cookie') ?? ''
    const authorization = request.headers.get('authorization') ?? ''

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (cookie) headers['cookie'] = cookie
    if (authorization) headers['authorization'] = authorization

    const res = await fetch(`${backendBase()}/api/v1/system/cron-jobs`, {
      cache: 'no-store',
      headers,
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Gateway 不可用', jobs: [] },
        { status: res.status },
      )
    }

    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json(
      { error: 'Gateway 不可用', jobs: [] },
      { status: 503 },
    )
  }
}
