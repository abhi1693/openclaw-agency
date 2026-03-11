import { NextResponse } from 'next/server'

const DEFAULT_BACKEND_BASE = 'http://127.0.0.1:8000'

function backendBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (raw && raw.toLowerCase() !== 'auto') return raw.replace(/\/+$/, '')
  return DEFAULT_BACKEND_BASE
}

/**
 * Resolve the best available auth token for backend calls.
 *
 * Priority:
 * 1. Authorization header forwarded from the browser (user is signed in via local auth)
 * 2. LOCAL_AUTH_TOKEN env var (server-side secret — works for curl / server-to-server calls)
 */
function resolveAuthToken(incomingAuthorization: string): string {
  // Browser sent a token — use it as-is (already includes "Bearer " prefix)
  if (incomingAuthorization) return incomingAuthorization

  // Server-side fallback: use the configured LOCAL_AUTH_TOKEN env var
  const envToken = process.env.LOCAL_AUTH_TOKEN?.trim()
  if (envToken) return `Bearer ${envToken}`

  return ''
}

export async function GET(request: Request) {
  try {
    const cookie = request.headers.get('cookie') ?? ''
    const authorization = resolveAuthToken(request.headers.get('authorization') ?? '')

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
