import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchBackend } from '@/app/api/amazon/_backend'
import { GET as getFreshness } from './freshness/route'
import { GET as getSnapshots } from './snapshots/route'
import { POST as syncSnapshots } from './snapshots/sync/route'

vi.mock('@/app/api/amazon/_backend', () => ({
  fetchBackend: vi.fn(),
}))

const mockedFetchBackend = vi.mocked(fetchBackend)

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('PPC snapshot proxy routes', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('proxies freshness through the versioned backend API', async () => {
    mockedFetchBackend.mockResolvedValueOnce(jsonResponse({ snapshot_count: 3 }))

    const req = new NextRequest(
      'http://localhost/api/ppc/automation/freshness?stale_after_seconds=7200',
      { headers: { authorization: 'Bearer test-token' } },
    )

    const res = await getFreshness(req)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ snapshot_count: 3 })
    expect(mockedFetchBackend).toHaveBeenCalledWith(
      '/api/v1/ppc/automation/freshness?stale_after_seconds=7200',
      { headers: { Authorization: 'Bearer test-token' } },
    )
  })

  it('proxies snapshot list filters through the versioned backend API', async () => {
    mockedFetchBackend.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }))

    const req = new NextRequest(
      'http://localhost/api/ppc/automation/snapshots?entity_type=campaign&state=enabled&limit=25&offset=50',
      { headers: { authorization: 'Bearer test-token' } },
    )

    const res = await getSnapshots(req)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [], total: 0 })
    expect(mockedFetchBackend).toHaveBeenCalledWith(
      '/api/v1/ppc/automation/snapshots?entity_type=campaign&state=enabled&limit=25&offset=50',
      { headers: { Authorization: 'Bearer test-token' } },
    )
  })

  it('proxies manual snapshot sync through the versioned backend API', async () => {
    mockedFetchBackend.mockResolvedValueOnce(jsonResponse({ scanned: 2, updated: 2 }))

    const req = new NextRequest('http://localhost/api/ppc/automation/snapshots/sync', {
      headers: { authorization: 'Bearer test-token' },
    })

    const res = await syncSnapshots(req)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ scanned: 2, updated: 2 })
    expect(mockedFetchBackend).toHaveBeenCalledWith('/api/v1/ppc/automation/snapshots/sync', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    })
  })
})
