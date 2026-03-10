const DEFAULT_BACKEND_BASE = 'http://127.0.0.1:8000'

function backendBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (raw && raw.toLowerCase() !== 'auto') {
    return raw.replace(/\/+$/, '')
  }
  return DEFAULT_BACKEND_BASE
}

export async function fetchBackend(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })
}
