'use client'

import React, { useState, useMemo } from 'react'
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Play,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { DashboardPageLayout } from '@/components/templates/DashboardPageLayout'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BidRec {
  id: string
  campaign_id: string
  ad_group_id: string | null
  keyword_id: string | null
  match_type: string | null
  current_bid: number
  recommended_bid: number
  conversion_rate: number | null
  target_acos: number | null
  aov: number | null
  reason: string | null
  status: string
  created_at: string
}

interface KeywordRec {
  id: string
  source_campaign_id: string
  search_term: string
  match_type: string
  impressions: number
  clicks: number
  orders: number
  ctr: number | null
  conversion_rate: number | null
  acos: number | null
  action: string
  target_campaign_id: string | null
  status: string
  created_at: string
}

interface ChangeLogEntry {
  id: string
  change_type: string
  entity_type: string
  entity_id: string
  old_value: string | null
  new_value: string | null
  reason: string | null
  triggered_by: string
  created_at: string
}

interface AutomationSettings {
  parent_asin: string
  target_acos: number
  min_bid: number
  max_bid: number
  bid_change_limit_pct: number
  dayparting_enabled: boolean
  auto_negative_enabled: boolean
  auto_keyword_enabled: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtUSD(n: number) {
  return `$${n.toFixed(2)}`
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function changePct(current: number, recommended: number) {
  if (current === 0) return 0
  return ((recommended - current) / current) * 100
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  applied: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  approved: 'bg-blue-100 text-blue-700',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-500')}>
      {status}
    </span>
  )
}

function SortableHeader({ label, field, sort, onSort }: { label: string; field: string; sort: { field: string; dir: 'asc' | 'desc' }; onSort: (f: string) => void }) {
  const active = sort.field === field
  return (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </span>
    </th>
  )
}

// ─── Fetch helpers ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ─── Tabs ────────────────────────────────────────────────────────────────────────

const TABS = ['Bid Recommendations', 'Keyword Recommendations', 'Settings'] as const
type Tab = typeof TABS[number]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PpcAutomationPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Bid Recommendations')
  const [changeLogOpen, setChangeLogOpen] = useState(false)
  const queryClient = useQueryClient()

  return (
    <DashboardPageLayout
      title="PPC Automation"
      description="竞价自动优化引擎"
      signedOut={{ message: 'Sign in to view PPC automation', forceRedirectUrl: '/ppc/automation' }}
      headerActions={<RunOptimizerButton />}
    >
      {/* Tab bar */}
      <div className="border-b border-slate-200">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-5 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {activeTab === 'Bid Recommendations' && <BidRecommendationsTab />}
        {activeTab === 'Keyword Recommendations' && <KeywordRecommendationsTab />}
        {activeTab === 'Settings' && <SettingsTab />}
      </div>

      {/* Change log panel */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          onClick={() => setChangeLogOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
        >
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-slate-400" />
            Recent Changes
          </span>
          {changeLogOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {changeLogOpen && <ChangeLogPanel />}
      </div>
    </DashboardPageLayout>
  )
}

// ─── Run Optimizer Button ──────────────────────────────────────────────────────

function RunOptimizerButton() {
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ bid: number; kw: number } | null>(null)

  async function handleRun() {
    setRunning(true)
    setResult(null)
    try {
      const data = await apiFetch('/api/ppc/automation/run-optimizer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_bid: true, run_keywords: true }),
      })
      setResult({ bid: data.bid_recommendations_created, kw: data.keyword_recommendations_created })
      queryClient.invalidateQueries({ queryKey: ['bid-recs'] })
      queryClient.invalidateQueries({ queryKey: ['kw-recs'] })
      queryClient.invalidateQueries({ queryKey: ['change-log'] })
    } catch {
      // swallow for now
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="text-xs text-emerald-600 font-medium">
          +{result.bid} bid recs, +{result.kw} kw recs
        </span>
      )}
      <button
        onClick={handleRun}
        disabled={running}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition',
          running
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700',
        )}
      >
        {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? 'Running…' : 'Run Optimizer'}
      </button>
    </div>
  )
}

// ─── Bid Recommendations Tab ───────────────────────────────────────────────────

function BidRecommendationsTab() {
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'created_at', dir: 'desc' })
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bid-recs', statusFilter],
    queryFn: () => apiFetch(`/api/ppc/automation/bid-recommendations?status=${statusFilter}`),
  })

  const items: BidRec[] = data?.items ?? []

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sort.field]
      const bv = (b as unknown as Record<string, unknown>)[sort.field]
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [items, sort])

  function handleSort(field: string) {
    setSort((s) => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' }))
  }

  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map((r) => r.id)))
  }

  const applyMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch('/api/ppc/automation/bid-recommendations/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recommendation_ids: ids, triggered_by: 'manual' }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bid-recs'] })
      queryClient.invalidateQueries({ queryKey: ['change-log'] })
      setSelected(new Set())
    },
  })

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="pending">Pending</option>
            <option value="applied">Applied</option>
            <option value="rejected">Rejected</option>
          </select>
          <span className="text-xs text-slate-400">{items.length} items</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => applyMutation.mutate([...selected])}
              disabled={applyMutation.isPending}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Apply Selected ({selected.size})
            </button>
          )}
          {items.length > 0 && statusFilter === 'pending' && (
            <button
              onClick={() => applyMutation.mutate(items.map((r) => r.id))}
              disabled={applyMutation.isPending}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              Apply All
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2">
                <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} className="rounded" />
              </th>
              <SortableHeader label="Campaign" field="campaign_id" sort={sort} onSort={handleSort} />
              <SortableHeader label="Match" field="match_type" sort={sort} onSort={handleSort} />
              <SortableHeader label="Current Bid" field="current_bid" sort={sort} onSort={handleSort} />
              <SortableHeader label="Recommended" field="recommended_bid" sort={sort} onSort={handleSort} />
              <SortableHeader label="Change %" field="recommended_bid" sort={sort} onSort={handleSort} />
              <SortableHeader label="Conv Rate" field="conversion_rate" sort={sort} onSort={handleSort} />
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Reason</th>
              <SortableHeader label="Status" field="status" sort={sort} onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">No recommendations</td></tr>
            ) : (
              sorted.map((rec) => {
                const delta = changePct(rec.current_bid, rec.recommended_bid)
                const isIncrease = delta > 0
                return (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(rec.id)}
                        onChange={() => setSelected((s) => { const n = new Set(s); n.has(rec.id) ? n.delete(rec.id) : n.add(rec.id); return n })}
                        className="rounded"
                      />
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 font-mono text-xs text-slate-600" title={rec.campaign_id}>{rec.campaign_id}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{rec.match_type ?? '—'}</td>
                    <td className="px-3 py-2 font-medium text-slate-700">{fmtUSD(rec.current_bid)}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{fmtUSD(rec.recommended_bid)}</td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center gap-1 text-xs font-medium', isIncrease ? 'text-rose-600' : 'text-emerald-600')}>
                        {isIncrease ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{fmtPct(rec.conversion_rate)}</td>
                    <td className="max-w-[280px] px-3 py-2 text-xs text-slate-500 truncate" title={rec.reason ?? ''}>{rec.reason ?? '—'}</td>
                    <td className="px-3 py-2"><StatusPill status={rec.status} /></td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Keyword Recommendations Tab ──────────────────────────────────────────────

function KeywordRecommendationsTab() {
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'clicks', dir: 'desc' })
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['kw-recs', statusFilter],
    queryFn: () => apiFetch(`/api/ppc/automation/keyword-recommendations?status=${statusFilter}`),
  })

  const items: KeywordRec[] = data?.items ?? []
  const addItems = items.filter((r) => r.action === 'add_keyword')
  const negItems = items.filter((r) => r.action === 'add_negative')

  function handleSort(field: string) {
    setSort((s) => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' }))
  }

  function sortItems(arr: KeywordRec[]) {
    return [...arr].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sort.field]
      const bv = (b as unknown as Record<string, unknown>)[sort.field]
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }

  const applyMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch('/api/ppc/automation/keyword-recommendations/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recommendation_ids: ids, triggered_by: 'manual' }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kw-recs'] })
      queryClient.invalidateQueries({ queryKey: ['change-log'] })
      setSelected(new Set())
    },
  })

  function KwTable({ recs, title, badgeColor }: { recs: KeywordRec[]; title: string; badgeColor: string }) {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <span className={cn('inline-block h-2 w-2 rounded-full', badgeColor)} />
            {title}
            <span className="text-xs font-normal text-slate-400">({recs.length})</span>
          </h3>
          {recs.length > 0 && statusFilter === 'pending' && (
            <div className="flex gap-2">
              {selected.size > 0 && (
                <button
                  onClick={() => applyMutation.mutate([...selected].filter((id) => recs.some((r) => r.id === id)))}
                  disabled={applyMutation.isPending}
                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Apply Selected
                </button>
              )}
              <button
                onClick={() => applyMutation.mutate(recs.map((r) => r.id))}
                disabled={applyMutation.isPending}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                Apply All
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2">
                  <input type="checkbox" onChange={() => {}} className="rounded" />
                </th>
                <SortableHeader label="Search Term" field="search_term" sort={sort} onSort={handleSort} />
                <SortableHeader label="Match" field="match_type" sort={sort} onSort={handleSort} />
                <SortableHeader label="Campaign" field="source_campaign_id" sort={sort} onSort={handleSort} />
                <SortableHeader label="Impr." field="impressions" sort={sort} onSort={handleSort} />
                <SortableHeader label="Clicks" field="clicks" sort={sort} onSort={handleSort} />
                <SortableHeader label="Orders" field="orders" sort={sort} onSort={handleSort} />
                <SortableHeader label="CTR" field="ctr" sort={sort} onSort={handleSort} />
                <SortableHeader label="Conv%" field="conversion_rate" sort={sort} onSort={handleSort} />
                <SortableHeader label="ACoS" field="acos" sort={sort} onSort={handleSort} />
                <SortableHeader label="Status" field="status" sort={sort} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recs.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-xs text-slate-400">No items</td></tr>
              ) : (
                sortItems(recs).map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(rec.id)}
                        onChange={() => setSelected((s) => { const n = new Set(s); n.has(rec.id) ? n.delete(rec.id) : n.add(rec.id); return n })}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{rec.search_term}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{rec.match_type}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 font-mono text-xs text-slate-500" title={rec.source_campaign_id}>{rec.source_campaign_id}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{rec.impressions.toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{rec.clicks.toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs font-medium text-slate-700">{rec.orders}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{fmtPct(rec.ctr)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{fmtPct(rec.conversion_rate)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{rec.acos != null ? fmtPct(rec.acos) : '—'}</td>
                    <td className="px-3 py-2"><StatusPill status={rec.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="pending">Pending</option>
            <option value="applied">Applied</option>
            <option value="rejected">Rejected</option>
          </select>
          <span className="text-xs text-slate-400">{items.length} total</span>
        </div>
        <button onClick={() => refetch()} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          <KwTable recs={addItems} title="Add Keywords" badgeColor="bg-emerald-500" />
          <KwTable recs={negItems} title="Add Negatives" badgeColor="bg-rose-500" />
        </>
      )}
    </div>
  )
}

// ─── Settings Tab ──────────────────────────────────────────────────────────────

const KNOWN_ASINS = ['B0DEMO001', 'B0DEMO002']  // placeholder; real values come from product config

function SettingsTab() {
  const [selectedAsin, setSelectedAsin] = useState<string>(KNOWN_ASINS[0])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data, isLoading, refetch } = useQuery<AutomationSettings | null>({
    queryKey: ['automation-settings', selectedAsin],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/automation/settings/${selectedAsin}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })

  const [form, setForm] = useState<Omit<AutomationSettings, 'parent_asin'>>({
    target_acos: 0.3,
    min_bid: 0.02,
    max_bid: 5.0,
    bid_change_limit_pct: 0.2,
    dayparting_enabled: false,
    auto_negative_enabled: false,
    auto_keyword_enabled: false,
  })

  function handleLoad() {
    if (data) {
      setForm({
        target_acos: data.target_acos,
        min_bid: data.min_bid,
        max_bid: data.max_bid,
        bid_change_limit_pct: data.bid_change_limit_pct,
        dayparting_enabled: data.dayparting_enabled,
        auto_negative_enabled: data.auto_negative_enabled,
        auto_keyword_enabled: data.auto_keyword_enabled,
      })
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await apiFetch(`/api/ppc/automation/settings/${selectedAsin}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      setSaved(true)
      refetch()
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // swallow
    } finally {
      setSaving(false)
    }
  }

  function field(key: keyof typeof form) {
    return {
      value: String(form[key]),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: typeof form[key] === 'boolean' ? e.target.checked : parseFloat(e.target.value) || 0 })),
    }
  }

  return (
    <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Product selector */}
      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-slate-700">Product (Parent ASIN)</label>
        <div className="flex gap-2">
          <select
            value={selectedAsin}
            onChange={(e) => { setSelectedAsin(e.target.value); setSaved(false) }}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {KNOWN_ASINS.map((a) => <option key={a}>{a}</option>)}
          </select>
          <button onClick={handleLoad} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            Load
          </button>
        </div>
        {isLoading && <p className="mt-1 text-xs text-slate-400">Loading…</p>}
        {!isLoading && !data && <p className="mt-1 text-xs text-amber-600">No settings saved yet — defaults shown below.</p>}
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Target ACoS: <span className="font-normal text-blue-600">{(form.target_acos * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range" min={1} max={100} step={1}
            value={form.target_acos * 100}
            onChange={(e) => setForm((f) => ({ ...f, target_acos: parseFloat(e.target.value) / 100 }))}
            className="w-full accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400"><span>1%</span><span>100%</span></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Min Bid ($)</label>
            <input type="number" step={0.01} min={0.02} {...field('min_bid')} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Max Bid ($)</label>
            <input type="number" step={0.01} min={0.02} {...field('max_bid')} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Max Bid Change per Cycle: <span className="font-normal text-blue-600">{(form.bid_change_limit_pct * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range" min={5} max={100} step={5}
            value={form.bid_change_limit_pct * 100}
            onChange={(e) => setForm((f) => ({ ...f, bid_change_limit_pct: parseFloat(e.target.value) / 100 }))}
            className="w-full accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400"><span>5%</span><span>100%</span></div>
        </div>

        <div className="space-y-2 pt-2">
          {([
            { key: 'auto_keyword_enabled', label: 'Auto Keyword Discovery', desc: 'Automatically add high-performing search terms as keywords' },
            { key: 'auto_negative_enabled', label: 'Auto Negative Keywords', desc: 'Automatically add zero-order terms as negatives' },
            { key: 'dayparting_enabled', label: 'Dayparting', desc: 'Adjust bids by time of day (Phase 4)' },
          ] as const).map(({ key, label, desc }) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form[key] as boolean}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                className="mt-0.5 rounded accent-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition',
            saving ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700',
          )}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && <span className="text-xs text-emerald-600 font-medium">Saved!</span>}
      </div>
    </div>
  )
}

// ─── Change Log Panel ──────────────────────────────────────────────────────────

function ChangeLogPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['change-log'],
    queryFn: () => apiFetch('/api/ppc/automation/change-log?limit=50'),
  })

  const entries: ChangeLogEntry[] = data?.items ?? []

  const TYPE_COLORS: Record<string, string> = {
    bid: 'bg-blue-100 text-blue-700',
    keyword: 'bg-emerald-100 text-emerald-700',
    negative: 'bg-rose-100 text-rose-700',
    budget: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="overflow-x-auto border-t border-slate-100">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            {['Time', 'Type', 'Entity', 'Old Value', 'New Value', 'Reason', 'By'].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
          ) : entries.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No changes yet</td></tr>
          ) : (
            entries.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(e.created_at)}</td>
                <td className="px-3 py-2">
                  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', TYPE_COLORS[e.change_type] ?? 'bg-slate-100 text-slate-500')}>
                    {e.change_type}
                  </span>
                </td>
                <td className="max-w-[120px] truncate px-3 py-2 font-mono text-slate-600" title={`${e.entity_type}/${e.entity_id}`}>{e.entity_id}</td>
                <td className="max-w-[80px] truncate px-3 py-2 text-slate-500" title={e.old_value ?? ''}>{e.old_value ?? '—'}</td>
                <td className="max-w-[80px] truncate px-3 py-2 font-medium text-slate-700" title={e.new_value ?? ''}>{e.new_value ?? '—'}</td>
                <td className="max-w-[200px] truncate px-3 py-2 text-slate-500" title={e.reason ?? ''}>{e.reason ?? '—'}</td>
                <td className="px-3 py-2 text-slate-400">{e.triggered_by}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
