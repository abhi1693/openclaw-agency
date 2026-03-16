const DEFAULT_BACKEND_BASE = 'http://127.0.0.1:8000'

function backendBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (raw && raw.toLowerCase() !== 'auto') {
    return raw.replace(/\/+$/, '')
  }
  return DEFAULT_BACKEND_BASE
}

export async function fetchBackend(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || undefined)
  const body = init?.body
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (!headers.has('content-type') && body && !isFormData) {
    headers.set('content-type', 'application/json')
  }

  return fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  })
}
