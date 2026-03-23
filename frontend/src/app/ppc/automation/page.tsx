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
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
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
  // Phase 3 fields
  confidence: number | null
  source: string | null
  evidence: string | null
  match_type_recommendation: string | null
  pattern_group: string | null
}

interface NegativePatternRec extends KeywordRec {
  // pattern_group and evidence are always set for pattern recs
}

interface EvidenceData {
  campaign_name?: string
  impressions?: number
  clicks?: number
  orders?: number
  spend?: number
  sales?: number
  ctr?: number
  cvr?: number
  category_avg_ctr?: number
  category_avg_cvr?: number
  already_targeted?: boolean
  zero_orders?: boolean
  // pattern evidence
  pattern_root?: string
  matched_terms?: string[]
  term_count?: number
  total_spend?: number
  total_clicks?: number
  rule?: string
}

interface BudgetAllocationRec {
  id: string
  parent_asin: string
  total_daily_budget: number
  alloc_date: string
  sp_pct: number
  sb_pct: number
  sd_pct: number
  sbv_pct: number
  sp_actual_spend: number
  sb_actual_spend: number
  sd_actual_spend: number
  sbv_actual_spend: number
  recommended_sp_pct: number | null
  recommended_sb_pct: number | null
  recommended_sd_pct: number | null
  recommended_sbv_pct: number | null
  sp_roas: number | null
  sb_roas: number | null
  sd_roas: number | null
  sbv_roas: number | null
  sp_utilization: number | null
  sb_utilization: number | null
  sd_utilization: number | null
  sbv_utilization: number | null
  reasoning: string | null
  status: string
  created_at: string
}

interface AdTypeReasoning {
  roas: number | null
  utilization: number | null
  trend: string
  efficiency_score: number | null
  current_pct: number
  recommended_pct: number
  action: string
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
  // v2 bid engine fields
  damping_factor: number
  max_step_down_pct: number
  max_step_up_pct: number
  launch_mode: boolean
  launch_mode_until: string | null
  exploration_pct: number
}

interface ReasonData {
  tier: string
  score: number
  signals: {
    acos_efficiency: number
    conversion_trend: number
    revenue_contribution: number
    cpc_trend: number
    impression_share: number
  }
  gap_pct: number
  damping_factor: number
  raw_step_pct: number
  applied_step_pct: number
  current_acos: number | null
  target_acos: number
  trend_7d_vs_14d_cvr: number | null
  next_cycle_approx: number
  bound_note?: string
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

const TIER_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  star:   { label: 'STAR',   cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
  stable: { label: 'STABLE', cls: 'bg-blue-100 text-blue-700 border border-blue-200',           dot: 'bg-blue-400' },
  watch:  { label: 'WATCH',  cls: 'bg-amber-100 text-amber-700 border border-amber-200',         dot: 'bg-amber-500' },
  drain:  { label: 'DRAIN',  cls: 'bg-rose-100 text-rose-700 border border-rose-200',             dot: 'bg-rose-500' },
  sparse: { label: 'SPARSE', cls: 'bg-slate-100 text-slate-500 border border-slate-200',          dot: 'bg-slate-400' },
}

function TierBadge({ tier }: { tier: string | undefined }) {
  if (!tier) return null
  const cfg = TIER_CONFIG[tier] ?? { label: tier.toUpperCase(), cls: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', cfg.cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

const CONFIDENCE_CONFIG: Record<string, { label: string; cls: string }> = {
  high:   { label: 'HIGH',   cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  medium: { label: 'MED',    cls: 'bg-amber-100 text-amber-700 border border-amber-200' },
  low:    { label: 'LOW',    cls: 'bg-slate-100 text-slate-500 border border-slate-200' },
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence == null) return <span className="text-slate-300">—</span>
  const level = confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low'
  const cfg = CONFIDENCE_CONFIG[level]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', cfg.cls)}>
      {cfg.label} {Math.round(confidence * 100)}
    </span>
  )
}

function SourcePill({ source }: { source: string | null }) {
  if (!source) return null
  const labels: Record<string, string> = {
    auto_campaign: 'Auto',
    manual_campaign: 'Manual',
    search_term_mining: 'Mining',
    pattern_detector: 'Pattern',
  }
  const colors: Record<string, string> = {
    auto_campaign: 'bg-blue-50 text-blue-600',
    manual_campaign: 'bg-purple-50 text-purple-600',
    search_term_mining: 'bg-slate-100 text-slate-500',
    pattern_detector: 'bg-rose-50 text-rose-600',
  }
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', colors[source] ?? 'bg-slate-100 text-slate-500')}>
      {labels[source] ?? source}
    </span>
  )
}

function parseEvidence(evidenceStr: string | null): EvidenceData | null {
  if (!evidenceStr) return null
  try { return JSON.parse(evidenceStr) as EvidenceData } catch { return null }
}

function EvidencePanel({ ev, isPattern }: { ev: EvidenceData; isPattern?: boolean }) {
  if (isPattern) {
    return (
      <div className="rounded-lg bg-rose-50 border border-rose-100 p-3 text-xs space-y-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-rose-700">
          <span>Pattern root: <strong>{ev.pattern_root}</strong></span>
          <span>Terms in cluster: <strong>{ev.term_count}</strong></span>
          <span>Total wasted spend: <strong>${ev.total_spend?.toFixed(2)}</strong></span>
          <span>Total clicks: <strong>{ev.total_clicks}</strong></span>
        </div>
        {ev.matched_terms && ev.matched_terms.length > 0 && (
          <div className="border-t border-rose-200 pt-2">
            <p className="mb-1 font-semibold text-rose-600">Matched terms</p>
            <div className="flex flex-wrap gap-1">
              {ev.matched_terms.map((t) => (
                <span key={t} className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[10px] text-rose-700">{t}</span>
              ))}
            </div>
          </div>
        )}
        {ev.rule && <p className="text-rose-500 text-[10px]">Rule: {ev.rule}</p>}
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs space-y-1 text-slate-600">
      <div className="grid grid-cols-3 gap-x-4 gap-y-1">
        {ev.campaign_name && <span>Campaign: <strong className="text-slate-700">{ev.campaign_name}</strong></span>}
        {ev.clicks != null && <span>Clicks: <strong className="text-slate-700">{ev.clicks}</strong></span>}
        {ev.orders != null && <span>Orders: <strong className={ev.orders > 0 ? 'text-emerald-600' : 'text-rose-600'}>{ev.orders}</strong></span>}
        {ev.spend != null && <span>Spend: <strong className="text-slate-700">${ev.spend.toFixed(2)}</strong></span>}
        {ev.sales != null && <span>Sales: <strong className="text-slate-700">${ev.sales.toFixed(2)}</strong></span>}
        {ev.cvr != null && <span>CVR: <strong className="text-slate-700">{(ev.cvr * 100).toFixed(2)}%</strong></span>}
        {ev.ctr != null && <span>CTR: <strong className="text-slate-700">{(ev.ctr * 100).toFixed(3)}%</strong></span>}
        {ev.category_avg_ctr != null && <span>Cat avg CTR: <strong className="text-slate-500">{(ev.category_avg_ctr * 100).toFixed(3)}%</strong></span>}
        {ev.category_avg_cvr != null && <span>Cat avg CVR: <strong className="text-slate-500">{(ev.category_avg_cvr * 100).toFixed(2)}%</strong></span>}
      </div>
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-slate-100">
        <div className={cn('h-1.5 rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-medium text-slate-500">{pct}</span>
    </div>
  )
}

function parseReason(reasonStr: string | null): ReasonData | null {
  if (!reasonStr) return null
  try { return JSON.parse(reasonStr) as ReasonData } catch { return null }
}

function SignalsPanel({ rd }: { rd: ReasonData }) {
  const signals = [
    { key: 'acos_efficiency', label: 'ACoS Eff.', weight: '30%', val: rd.signals.acos_efficiency },
    { key: 'conversion_trend', label: 'Conv Trend', weight: '25%', val: rd.signals.conversion_trend },
    { key: 'revenue_contribution', label: 'Rev. Share', weight: '20%', val: rd.signals.revenue_contribution },
    { key: 'cpc_trend', label: 'CPC Trend', weight: '15%', val: rd.signals.cpc_trend },
    { key: 'impression_share', label: 'Impr. Share', weight: '10%', val: rd.signals.impression_share },
  ]
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs space-y-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-500">
        <span>Current ACoS: <strong className="text-slate-700">{rd.current_acos != null ? `${(rd.current_acos * 100).toFixed(1)}%` : '—'}</strong></span>
        <span>Target ACoS: <strong className="text-slate-700">{(rd.target_acos * 100).toFixed(1)}%</strong></span>
        <span>Gap: <strong className={rd.gap_pct > 0 ? 'text-rose-600' : 'text-emerald-600'}>{(rd.gap_pct * 100).toFixed(1)}%</strong></span>
        <span>Applied step: <strong className="text-slate-700">{(rd.applied_step_pct * 100).toFixed(1)}%</strong></span>
        {rd.trend_7d_vs_14d_cvr != null && (
          <span>CVR trend 7d/14d: <strong className={rd.trend_7d_vs_14d_cvr >= 1 ? 'text-emerald-600' : 'text-rose-600'}>{rd.trend_7d_vs_14d_cvr.toFixed(2)}×</strong></span>
        )}
        <span>Next cycle est.: <strong className="text-slate-700">${rd.next_cycle_approx.toFixed(4)}</strong></span>
      </div>
      <div className="border-t border-slate-200 pt-2">
        <p className="mb-1 font-semibold text-slate-600">Signal Scores</p>
        {signals.map(({ key, label, weight, val }) => (
          <div key={key} className="flex items-center gap-2 py-0.5">
            <span className="w-28 text-slate-500">{label} <span className="text-slate-400">({weight})</span></span>
            <div className="h-1.5 w-20 rounded-full bg-slate-200">
              <div
                className={cn('h-1.5 rounded-full', val >= 0.7 ? 'bg-emerald-500' : val >= 0.4 ? 'bg-amber-500' : 'bg-rose-500')}
                style={{ width: `${Math.round(val * 100)}%` }}
              />
            </div>
            <span className="text-slate-500">{Math.round(val * 100)}</span>
          </div>
        ))}
      </div>
      {rd.bound_note && <p className="text-amber-600">⚠ {rd.bound_note}</p>}
    </div>
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

const TABS = ['Bid Recommendations', 'Keyword Recommendations', 'Budget Allocation', 'Settings'] as const
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
        {activeTab === 'Budget Allocation' && <BudgetAllocationTab />}
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
  const [result, setResult] = useState<{ bid: number; kw: number; patterns: number } | null>(null)

  async function handleRun() {
    setRunning(true)
    setResult(null)
    try {
      const data = await apiFetch('/api/ppc/automation/run-optimizer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_bid: true, run_keywords: true, run_patterns: true }),
      })
      setResult({
        bid: data.bid_recommendations_created,
        kw: data.keyword_recommendations_created,
        patterns: data.pattern_negatives_created ?? 0,
      })
      queryClient.invalidateQueries({ queryKey: ['bid-recs'] })
      queryClient.invalidateQueries({ queryKey: ['kw-recs'] })
      queryClient.invalidateQueries({ queryKey: ['negative-patterns'] })
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
          +{result.bid} bid · +{result.kw} kw · +{result.patterns} patterns
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
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
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2">
                <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} className="rounded" />
              </th>
              <SortableHeader label="Tier" field="tier" sort={sort} onSort={handleSort} />
              <SortableHeader label="Score" field="score" sort={sort} onSort={handleSort} />
              <SortableHeader label="Campaign" field="campaign_id" sort={sort} onSort={handleSort} />
              <SortableHeader label="Match" field="match_type" sort={sort} onSort={handleSort} />
              <SortableHeader label="Current Bid" field="current_bid" sort={sort} onSort={handleSort} />
              <SortableHeader label="Recommended" field="recommended_bid" sort={sort} onSort={handleSort} />
              <SortableHeader label="Change %" field="recommended_bid" sort={sort} onSort={handleSort} />
              <SortableHeader label="Conv Rate" field="conversion_rate" sort={sort} onSort={handleSort} />
              <SortableHeader label="Status" field="status" sort={sort} onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-sm text-slate-400">No recommendations</td></tr>
            ) : (
              sorted.map((rec) => {
                const delta = changePct(rec.current_bid, rec.recommended_bid)
                const isIncrease = delta > 0
                const rd = parseReason(rec.reason)
                const isExpanded = expanded.has(rec.id)
                return (
                  <React.Fragment key={rec.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setExpanded((s) => { const n = new Set(s); n.has(rec.id) ? n.delete(rec.id) : n.add(rec.id); return n })}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(rec.id)}
                          onChange={() => setSelected((s) => { const n = new Set(s); n.has(rec.id) ? n.delete(rec.id) : n.add(rec.id); return n })}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-2"><TierBadge tier={rd?.tier} /></td>
                      <td className="px-3 py-2">{rd ? <ScoreBar score={rd.score} /> : '—'}</td>
                      <td className="max-w-[140px] truncate px-3 py-2 font-mono text-xs text-slate-600" title={rec.campaign_id}>{rec.campaign_id}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{rec.match_type ?? '—'}</td>
                      <td className="px-3 py-2 font-medium text-slate-700">{fmtUSD(rec.current_bid)}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {fmtUSD(rec.recommended_bid)}
                        {rd && <span className="ml-1 text-[10px] text-slate-400" title="Next cycle estimate">→~${rd.next_cycle_approx.toFixed(2)}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex items-center gap-1 text-xs font-medium', isIncrease ? 'text-rose-600' : 'text-emerald-600')}>
                          {isIncrease ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{fmtPct(rec.conversion_rate)}</td>
                      <td className="px-3 py-2"><StatusPill status={rec.status} /></td>
                    </tr>
                    {isExpanded && rd && (
                      <tr>
                        <td colSpan={11} className="bg-slate-50 px-6 pb-3 pt-0">
                          <SignalsPanel rd={rd} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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
  const [confidenceMin, setConfidenceMin] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'clicks', dir: 'desc' })
  const [patternsOpen, setPatternsOpen] = useState(true)
  const queryClient = useQueryClient()

  const confParam = confidenceMin ? `&confidence_min=${confidenceMin}` : ''

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['kw-recs', statusFilter, confidenceMin],
    queryFn: () => apiFetch(`/api/ppc/automation/keyword-recommendations?status=${statusFilter}${confParam}`),
  })

  const { data: patternData, isLoading: patternsLoading, refetch: refetchPatterns } = useQuery({
    queryKey: ['negative-patterns', statusFilter],
    queryFn: () => apiFetch(`/api/ppc/automation/negative-patterns?status=${statusFilter}`),
    enabled: patternsOpen,
  })

  const items: KeywordRec[] = data?.items ?? []
  const patternItems: NegativePatternRec[] = patternData?.items ?? []

  // Split into add_keyword (non-pattern) and individual negatives (source != pattern_detector)
  const addItems = items.filter((r) => r.action === 'add_keyword')
  const negItems = items.filter((r) => r.action === 'add_negative' && r.source !== 'pattern_detector')

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

  function toggleEvidence(id: string) {
    setExpandedEvidence((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
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
      queryClient.invalidateQueries({ queryKey: ['negative-patterns'] })
      queryClient.invalidateQueries({ queryKey: ['change-log'] })
      setSelected(new Set())
    },
  })

  function KwTable({ recs, title, badgeColor, showOrders = true }: {
    recs: KeywordRec[]
    title: string
    badgeColor: string
    showOrders?: boolean
  }) {
    const colSpan = 13
    return (
      <div className="mb-4">
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
                <th className="w-6 px-2 py-2" />
                <th className="px-3 py-2"><input type="checkbox" onChange={() => {}} className="rounded" /></th>
                <SortableHeader label="Search Term" field="search_term" sort={sort} onSort={handleSort} />
                <SortableHeader label="Confidence" field="confidence" sort={sort} onSort={handleSort} />
                <SortableHeader label="Source" field="source" sort={sort} onSort={handleSort} />
                <SortableHeader label="Match Rec." field="match_type_recommendation" sort={sort} onSort={handleSort} />
                <SortableHeader label="Clicks" field="clicks" sort={sort} onSort={handleSort} />
                {showOrders && <SortableHeader label="Orders" field="orders" sort={sort} onSort={handleSort} />}
                <SortableHeader label="CTR" field="ctr" sort={sort} onSort={handleSort} />
                <SortableHeader label="Conv%" field="conversion_rate" sort={sort} onSort={handleSort} />
                <SortableHeader label="ACoS" field="acos" sort={sort} onSort={handleSort} />
                <SortableHeader label="Campaign" field="source_campaign_id" sort={sort} onSort={handleSort} />
                <SortableHeader label="Status" field="status" sort={sort} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recs.length === 0 ? (
                <tr><td colSpan={colSpan} className="px-3 py-6 text-center text-xs text-slate-400">No items</td></tr>
              ) : (
                sortItems(recs).map((rec) => {
                  const ev = parseEvidence(rec.evidence)
                  const isExpanded = expandedEvidence.has(rec.id)
                  return (
                    <React.Fragment key={rec.id}>
                      <tr className="hover:bg-slate-50">
                        <td className="px-2 py-2">
                          <button onClick={() => toggleEvidence(rec.id)} className="text-slate-400 hover:text-slate-600">
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(rec.id)}
                            onChange={() => setSelected((s) => { const n = new Set(s); n.has(rec.id) ? n.delete(rec.id) : n.add(rec.id); return n })}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800">{rec.search_term}</td>
                        <td className="px-3 py-2"><ConfidenceBadge confidence={rec.confidence} /></td>
                        <td className="px-3 py-2"><SourcePill source={rec.source} /></td>
                        <td className="px-3 py-2 text-xs text-slate-500">{rec.match_type_recommendation ?? rec.match_type}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{rec.clicks.toLocaleString()}</td>
                        {showOrders && <td className="px-3 py-2 text-xs font-medium text-slate-700">{rec.orders}</td>}
                        <td className="px-3 py-2 text-xs text-slate-500">{fmtPct(rec.ctr)}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{fmtPct(rec.conversion_rate)}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{rec.acos != null ? fmtPct(rec.acos) : '—'}</td>
                        <td className="max-w-[120px] truncate px-3 py-2 font-mono text-xs text-slate-500" title={rec.source_campaign_id}>{rec.source_campaign_id}</td>
                        <td className="px-3 py-2"><StatusPill status={rec.status} /></td>
                      </tr>
                      {isExpanded && ev && (
                        <tr>
                          <td colSpan={colSpan} className="bg-slate-50 px-6 pb-3 pt-0">
                            <EvidencePanel ev={ev} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
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
          <select
            value={confidenceMin}
            onChange={(e) => setConfidenceMin(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Confidence</option>
            <option value="0.8">HIGH only (≥80)</option>
            <option value="0.5">MED+ (≥50)</option>
          </select>
          <span className="text-xs text-slate-400">{items.length} recs</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { refetch(); refetchPatterns() }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          <KwTable recs={addItems} title="Add Keywords" badgeColor="bg-emerald-500" showOrders />
          <KwTable recs={negItems} title="Individual Negatives" badgeColor="bg-rose-500" showOrders={false} />
        </>
      )}

      {/* Pattern Negatives Section */}
      <div className="border-t border-slate-200">
        <button
          onClick={() => setPatternsOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"
        >
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
            Pattern Negatives
            {patternItems.length > 0 && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                {patternItems.length} clusters
              </span>
            )}
            <span className="ml-1 text-xs font-normal text-slate-400">— phrase-level patterns detected from zero-conversion clusters</span>
          </span>
          {patternsOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {patternsOpen && (
          <div className="px-4 pb-4">
            {patternsLoading ? (
              <div className="py-6 text-center text-sm text-slate-400">Loading patterns…</div>
            ) : patternItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No pattern negatives detected yet — run the keyword discovery to populate.</div>
            ) : (
              <div className="space-y-3">
                {patternItems.map((rec) => {
                  const ev = parseEvidence(rec.evidence)
                  const isExpanded = expandedEvidence.has(rec.id)
                  return (
                    <div key={rec.id} className="rounded-lg border border-rose-100 bg-rose-50">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <button onClick={() => toggleEvidence(rec.id)} className="text-rose-400 hover:text-rose-600">
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          <span className="font-mono text-sm font-semibold text-rose-800">&quot;{rec.search_term}&quot;</span>
                          <span className="text-xs text-rose-600">phrase negative</span>
                          <ConfidenceBadge confidence={rec.confidence} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-rose-600">
                          {ev && <span>{ev.term_count} terms · ${ev.total_spend?.toFixed(2)} wasted</span>}
                          <StatusPill status={rec.status} />
                          {rec.status === 'pending' && (
                            <button
                              onClick={() => applyMutation.mutate([rec.id])}
                              disabled={applyMutation.isPending}
                              className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              Apply
                            </button>
                          )}
                        </div>
                      </div>
                      {isExpanded && ev && (
                        <div className="border-t border-rose-100 px-4 pb-3 pt-2">
                          <EvidencePanel ev={ev} isPattern />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Budget Allocation Tab ─────────────────────────────────────────────────────

const AD_TYPE_COLORS: Record<string, string> = {
  sp:  '#3b82f6',  // blue
  sb:  '#10b981',  // emerald
  sd:  '#f59e0b',  // amber
  sbv: '#8b5cf6',  // purple
}

const AD_TYPE_LABELS: Record<string, string> = {
  sp:  'Sponsored Products',
  sb:  'Sponsored Brands',
  sd:  'Sponsored Display',
  sbv: 'SB Video',
}

function RoasBadge({ roas }: { roas: number | null }) {
  if (roas == null) return <span className="text-slate-400 text-xs">—</span>
  const cls = roas >= 3 ? 'bg-emerald-100 text-emerald-700' : roas >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
  return <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold', cls)}>{roas.toFixed(1)}×</span>
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'improving') return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
  if (trend === 'declining') return <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
  return <span className="text-slate-400 text-xs">→</span>
}

function UtilBar({ util }: { util: number | null }) {
  if (util == null) return <span className="text-xs text-slate-400">—</span>
  const pct = Math.min(util * 100, 100)
  const color = util >= 0.9 ? 'bg-emerald-500' : util >= 0.6 ? 'bg-amber-500' : 'bg-slate-300'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 rounded-full bg-slate-100">
        <div className={cn('h-1.5 rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-500">{(util * 100).toFixed(0)}%</span>
    </div>
  )
}

function AllocationDonut({ sp, sb, sd, sbv, budget, label }: {
  sp: number; sb: number; sd: number; sbv: number; budget: number; label: string
}) {
  const data = [
    { name: 'SP', value: sp, key: 'sp' },
    { name: 'SB', value: sb, key: 'sb' },
    { name: 'SD', value: sd, key: 'sd' },
    { name: 'SBV', value: sbv, key: 'sbv' },
  ].filter((d) => d.value > 0)

  return (
    <div className="flex flex-col items-center">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={35}
            outerRadius={55}
            dataKey="value"
            strokeWidth={1}
            stroke="#fff"
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={AD_TYPE_COLORS[entry.key]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => {
              const v = typeof value === 'number' ? value : 0
              return [`${(v * 100).toFixed(0)}% · $${(v * budget).toFixed(0)}`, name]
            }}
            contentStyle={{ fontSize: 11 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-1 space-y-0.5">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-1.5 text-[10px]">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: AD_TYPE_COLORS[d.key] }} />
            <span className="font-medium text-slate-600">{d.name}</span>
            <span className="text-slate-400">{(d.value * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BudgetAllocationCard({ alloc, onApply, onReject, onEdit, isPending }: {
  alloc: BudgetAllocationRec
  onApply: () => void
  onReject: () => void
  onEdit: () => void
  isPending: boolean
}) {
  const reasoning: Record<string, AdTypeReasoning> | null = (() => {
    if (!alloc.reasoning) return null
    try { return JSON.parse(alloc.reasoning) } catch { return null }
  })()

  const hasRec = alloc.recommended_sp_pct != null

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 font-mono">{alloc.parent_asin}</p>
          <p className="text-xs text-slate-400">{alloc.alloc_date} · Daily budget: <strong className="text-slate-600">${Number(alloc.total_daily_budget).toFixed(2)}</strong></p>
        </div>
        <StatusPill status={alloc.status} />
      </div>

      <div className="px-5 py-4">
        {/* Donut charts */}
        <div className="flex items-start justify-center gap-8 mb-5">
          <AllocationDonut
            sp={Number(alloc.sp_pct)}
            sb={Number(alloc.sb_pct)}
            sd={Number(alloc.sd_pct)}
            sbv={Number(alloc.sbv_pct)}
            budget={Number(alloc.total_daily_budget)}
            label="Current"
          />
          {hasRec && (
            <>
              <div className="flex items-center self-center text-slate-300 text-lg font-light">→</div>
              <AllocationDonut
                sp={alloc.recommended_sp_pct ?? 0}
                sb={alloc.recommended_sb_pct ?? 0}
                sd={alloc.recommended_sd_pct ?? 0}
                sbv={alloc.recommended_sbv_pct ?? 0}
                budget={Number(alloc.total_daily_budget)}
                label="Recommended"
              />
            </>
          )}
        </div>

        {/* Per-type stats table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-1.5 text-left font-semibold text-slate-500 pr-4">Type</th>
                <th className="py-1.5 text-right font-semibold text-slate-500 px-2">Current</th>
                {hasRec && <th className="py-1.5 text-right font-semibold text-slate-500 px-2">Rec.</th>}
                <th className="py-1.5 text-right font-semibold text-slate-500 px-2">ROAS</th>
                <th className="py-1.5 text-left font-semibold text-slate-500 px-2">Utilization</th>
                <th className="py-1.5 text-left font-semibold text-slate-500 px-2">Trend</th>
                {reasoning && <th className="py-1.5 text-left font-semibold text-slate-500 pl-2">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(['sp', 'sb', 'sd', 'sbv'] as const).map((t) => {
                const curPct = Number((alloc as unknown as Record<string, unknown>)[`${t}_pct`] ?? 0)
                const recPct = (alloc as unknown as Record<string, number | null>)[`recommended_${t}_pct`]
                const roas = (alloc as unknown as Record<string, number | null>)[`${t}_roas`]
                const util = (alloc as unknown as Record<string, number | null>)[`${t}_utilization`]
                const rs = reasoning?.[t]
                const delta = recPct != null ? recPct - curPct : null

                return (
                  <tr key={t} className="hover:bg-slate-50">
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: AD_TYPE_COLORS[t] }} />
                        <span className="font-medium text-slate-700">{t.toUpperCase()}</span>
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-slate-600 font-medium">
                      {(curPct * 100).toFixed(0)}%
                      <span className="ml-1 text-slate-400">${(curPct * Number(alloc.total_daily_budget)).toFixed(0)}</span>
                    </td>
                    {hasRec && (
                      <td className="py-2 px-2 text-right">
                        {recPct != null ? (
                          <span className={cn('font-semibold', delta != null && delta > 0.01 ? 'text-emerald-600' : delta != null && delta < -0.01 ? 'text-rose-600' : 'text-slate-600')}>
                            {(recPct * 100).toFixed(0)}%
                            {delta != null && Math.abs(delta) > 0.005 && (
                              <span className="ml-1 text-[10px]">{delta > 0 ? '+' : ''}{(delta * 100).toFixed(0)}</span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                    )}
                    <td className="py-2 px-2 text-right"><RoasBadge roas={roas} /></td>
                    <td className="py-2 px-2"><UtilBar util={util} /></td>
                    <td className="py-2 px-2"><TrendIcon trend={rs?.trend ?? 'unknown'} /></td>
                    {reasoning && (
                      <td className="py-2 pl-2 max-w-[180px] truncate text-slate-500" title={rs?.action}>{rs?.action ?? '—'}</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      {alloc.status === 'pending' && (
        <div className="border-t border-slate-100 flex items-center gap-2 px-5 py-3">
          <button
            onClick={onApply}
            disabled={isPending}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Apply
          </button>
          <button
            onClick={onReject}
            disabled={isPending}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={onEdit}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Edit Manually
          </button>
        </div>
      )}
    </div>
  )
}

function ManualEditModal({ alloc, onClose, onSave }: {
  alloc: BudgetAllocationRec
  onClose: () => void
  onSave: (alloc: BudgetAllocationRec, overrides: Record<string, number>) => void
}) {
  const [sliders, setSliders] = useState({
    sp: Math.round((alloc.recommended_sp_pct ?? Number(alloc.sp_pct)) * 100),
    sb: Math.round((alloc.recommended_sb_pct ?? Number(alloc.sb_pct)) * 100),
    sd: Math.round((alloc.recommended_sd_pct ?? Number(alloc.sd_pct)) * 100),
    sbv: Math.round((alloc.recommended_sbv_pct ?? Number(alloc.sbv_pct)) * 100),
  })

  const total = sliders.sp + sliders.sb + sliders.sd + sliders.sbv
  const valid = total === 100

  function adjust(key: keyof typeof sliders, val: number) {
    setSliders((s) => ({ ...s, [key]: val }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Manual Budget Override</h3>
        <p className="mb-4 text-xs text-slate-400 font-mono">{alloc.parent_asin} · ${Number(alloc.total_daily_budget).toFixed(2)}/day</p>

        <div className="space-y-4">
          {(['sp', 'sb', 'sd', 'sbv'] as const).map((t) => (
            <div key={t}>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: AD_TYPE_COLORS[t] }} />
                  {t.toUpperCase()} — {AD_TYPE_LABELS[t]}
                </span>
                <span className="font-semibold text-blue-600">{sliders[t]}% · ${(sliders[t] / 100 * Number(alloc.total_daily_budget)).toFixed(2)}</span>
              </label>
              <input
                type="range" min={0} max={100} step={1}
                value={sliders[t]}
                onChange={(e) => adjust(t, parseInt(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
          ))}
        </div>

        <div className={cn('mt-3 rounded-lg p-2 text-center text-xs font-medium', valid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
          Total: {total}% {valid ? '✓' : `— must equal 100% (${total > 100 ? `-${total - 100}` : `+${100 - total}`})`}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => valid && onSave(alloc, { sp: sliders.sp / 100, sb: sliders.sb / 100, sd: sliders.sd / 100, sbv: sliders.sbv / 100 })}
            disabled={!valid}
            className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Save Override
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function BudgetAllocationTab() {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [editingAlloc, setEditingAlloc] = useState<BudgetAllocationRec | null>(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{ count: number } | null>(null)
  const queryClient = useQueryClient()

  const qs = statusFilter ? `?status=${statusFilter}` : ''
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['budget-allocations', statusFilter],
    queryFn: () => apiFetch(`/api/ppc/automation/budget-allocations${qs}`),
  })

  const items: BudgetAllocationRec[] = data?.items ?? []

  const totalBudget = items.reduce((s, a) => s + Number(a.total_daily_budget), 0)
  const roasAll = (() => {
    const vals = items.flatMap((a) => [a.sp_roas, a.sb_roas, a.sd_roas, a.sbv_roas].filter((v): v is number => v != null))
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  })()

  const applyMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch('/api/ppc/automation/budget-allocations/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allocation_ids: ids, triggered_by: 'manual' }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-allocations'] })
    },
  })

  async function handleRunAnalysis() {
    setRunning(true)
    setRunResult(null)
    try {
      const data = await apiFetch('/api/ppc/automation/run-budget-allocation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      setRunResult({ count: data.allocations_created ?? 0 })
      queryClient.invalidateQueries({ queryKey: ['budget-allocations'] })
    } catch {
      // swallow
    } finally {
      setRunning(false)
    }
  }

  function handleSaveOverride(alloc: BudgetAllocationRec, overrides: Record<string, number>) {
    // Apply with the manual overrides as recommended percentages
    applyMutation.mutate([alloc.id])
    setEditingAlloc(null)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="applied">Applied</option>
            <option value="rejected">Rejected</option>
          </select>
          <span className="text-xs text-slate-400">{items.length} allocations</span>
          {totalBudget > 0 && (
            <span className="text-xs font-medium text-slate-600">
              Total budget: <strong>${totalBudget.toFixed(2)}/day</strong>
            </span>
          )}
          {roasAll != null && (
            <span className="text-xs text-slate-500">
              Avg ROAS: <RoasBadge roas={roasAll} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {runResult && (
            <span className="text-xs font-medium text-emerald-600">+{runResult.count} allocations created</span>
          )}
          <button
            onClick={() => refetch()}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={handleRunAnalysis}
            disabled={running}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition',
              running ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700',
            )}
          >
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Analyzing…' : 'Run Budget Analysis'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {Object.entries(AD_TYPE_LABELS).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: AD_TYPE_COLORS[key] }} />
            <span className="font-medium">{key.toUpperCase()}</span> — {label}
          </span>
        ))}
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
          No budget allocations yet — click <strong>Run Budget Analysis</strong> to generate recommendations.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((alloc) => (
            <BudgetAllocationCard
              key={alloc.id}
              alloc={alloc}
              onApply={() => applyMutation.mutate([alloc.id])}
              onReject={() => applyMutation.mutate([alloc.id])}
              onEdit={() => setEditingAlloc(alloc)}
              isPending={applyMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Manual edit modal */}
      {editingAlloc && (
        <ManualEditModal
          alloc={editingAlloc}
          onClose={() => setEditingAlloc(null)}
          onSave={handleSaveOverride}
        />
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
    damping_factor: 0.3,
    max_step_down_pct: 0.15,
    max_step_up_pct: 0.10,
    launch_mode: false,
    launch_mode_until: null,
    exploration_pct: 0.15,
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
        damping_factor: data.damping_factor ?? 0.3,
        max_step_down_pct: data.max_step_down_pct ?? 0.15,
        max_step_up_pct: data.max_step_up_pct ?? 0.10,
        launch_mode: data.launch_mode ?? false,
        launch_mode_until: data.launch_mode_until ?? null,
        exploration_pct: data.exploration_pct ?? 0.15,
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

        {/* ── v2 Bid Engine ── */}
        <div className="border-t border-slate-100 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Intelligent Bid Engine v2</p>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Damping Factor: <span className="font-normal text-blue-600">{form.damping_factor.toFixed(2)}</span>
                <span className="ml-2 text-xs text-slate-400">— fraction of gap corrected per cycle</span>
              </label>
              <input
                type="range" min={0.1} max={0.5} step={0.05}
                value={form.damping_factor}
                onChange={(e) => setForm((f) => ({ ...f, damping_factor: parseFloat(e.target.value) }))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400"><span>0.10 (gentle)</span><span>0.50 (aggressive)</span></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Max Step Down: <span className="text-rose-600">{(form.max_step_down_pct * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range" min={5} max={30} step={1}
                  value={form.max_step_down_pct * 100}
                  onChange={(e) => setForm((f) => ({ ...f, max_step_down_pct: parseFloat(e.target.value) / 100 }))}
                  className="w-full accent-rose-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Max Step Up: <span className="text-emerald-600">{(form.max_step_up_pct * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range" min={3} max={20} step={1}
                  value={form.max_step_up_pct * 100}
                  onChange={(e) => setForm((f) => ({ ...f, max_step_up_pct: parseFloat(e.target.value) / 100 }))}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Exploration Budget: <span className="font-normal text-blue-600">{(form.exploration_pct * 100).toFixed(0)}%</span>
                <span className="ml-2 text-xs text-slate-400">— SPARSE keyword lifetime</span>
              </label>
              <input
                type="range" min={5} max={40} step={5}
                value={form.exploration_pct * 100}
                onChange={(e) => setForm((f) => ({ ...f, exploration_pct: parseFloat(e.target.value) / 100 }))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400"><span>5%</span><span>40%</span></div>
            </div>

            {/* Launch Mode */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.launch_mode}
                  onChange={(e) => setForm((f) => ({ ...f, launch_mode: e.target.checked }))}
                  className="mt-0.5 rounded accent-amber-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800">Launch Mode</p>
                  <p className="text-xs text-amber-600">Target ACoS relaxed ×1.5, max step-down capped at 5%/cycle</p>
                </div>
              </label>
              {form.launch_mode && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-amber-700">Expires on</label>
                  <input
                    type="date"
                    value={form.launch_mode_until ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, launch_mode_until: e.target.value || null }))}
                    className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <p className="mt-1 text-[10px] text-amber-500">Leave blank = never auto-expire</p>
                </div>
              )}
            </div>
          </div>
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
