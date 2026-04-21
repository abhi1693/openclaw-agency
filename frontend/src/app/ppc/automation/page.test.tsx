import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ChangeLogPanel,
  autoResolveAdGroup,
  bulkResolveAdGroup,
  resolveAdGroup,
} from './page'

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

function mockFetchResponse(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

describe('PPC automation resolution UX', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000')
    fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('ChangeLogPanel renders loading state', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined))

    renderWithQueryClient(<ChangeLogPanel />)

    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('ChangeLogPanel renders with empty entries', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { items: [] }))

    renderWithQueryClient(<ChangeLogPanel />)

    expect(await screen.findByText('No changes yet')).toBeInTheDocument()
  })

  it('ChangeLogPanel renders entries colored by change_type', async () => {
    fetchMock.mockResolvedValue(
      mockFetchResponse(200, {
        items: [
          {
            id: '1',
            change_type: 'resolve',
            entity_type: 'keyword_recommendation',
            entity_id: 'rec-1',
            old_value: null,
            new_value: '{"target_ad_group_id":"ag-1"}',
            reason: 'manual ad-group resolution',
            triggered_by: 'manual',
            created_at: '2026-04-21T20:00:00Z',
          },
          {
            id: '2',
            change_type: 'bulk_resolve',
            entity_type: 'keyword_recommendation',
            entity_id: 'rec-2',
            old_value: null,
            new_value: '{"target_ad_group_id":"ag-2"}',
            reason: 'bulk ad-group resolution',
            triggered_by: 'manual',
            created_at: '2026-04-21T20:01:00Z',
          },
          {
            id: '3',
            change_type: 'auto_resolve',
            entity_type: 'keyword_recommendation',
            entity_id: 'rec-3',
            old_value: null,
            new_value: '{"target_ad_group_id":"ag-3"}',
            reason: 'auto ad-group resolution',
            triggered_by: 'system',
            created_at: '2026-04-21T20:02:00Z',
          },
        ],
      })
    )

    renderWithQueryClient(<ChangeLogPanel />)

    await waitFor(() => expect(screen.getByText('resolve')).toBeInTheDocument())
    expect(screen.getByText('resolve')).toHaveClass('bg-amber-100', 'text-amber-700')
    expect(screen.getByText('bulk_resolve')).toHaveClass('bg-cyan-100', 'text-cyan-700')
    expect(screen.getByText('auto_resolve')).toHaveClass('bg-teal-100', 'text-teal-700')
  })

  it('resolveAdGroup calls fetch with correct URL and target_ad_group_id body', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { id: 'rec-1' }))

    await resolveAdGroup('rec-1', 'ag-1')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ppc/automation/keyword-recommendations/rec-1/resolve-ad-group',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_ad_group_id: 'ag-1' }),
      })
    )
  })

  it('bulkResolveAdGroup calls fetch with correct body', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { resolved: [], skipped: [] }))

    await bulkResolveAdGroup('campaign-1', 'ag-1')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ppc/automation/keyword-recommendations/bulk-resolve-ad-group',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: 'ag-1',
          ad_group_id: 'ag-1',
          match_target_campaign_id: 'campaign-1',
        }),
      })
    )
  })

  it('autoResolveAdGroup calls fetch with correct URL', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { auto_resolved: 0 }))

    await autoResolveAdGroup()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ppc/automation/keyword-recommendations/auto-resolve-ad-group',
      { method: 'POST' }
    )
  })

  it('resolveAdGroup throws on non-200 response', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(500))

    await expect(resolveAdGroup('rec-1', 'ag-1')).rejects.toThrow('HTTP 500')
  })

  it('bulkResolveAdGroup throws on non-200 response', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(400))

    await expect(bulkResolveAdGroup('campaign-1', 'ag-1')).rejects.toThrow('HTTP 400')
  })
})
