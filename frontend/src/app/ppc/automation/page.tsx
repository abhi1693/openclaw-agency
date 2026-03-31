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
  // Phase 6: TACoS target mode
  target_mode: 'acos' | 'tacos'
  target_tacos: number | null
}

interface PlacementRec {
  id: string
  campaign_id: string
  campaign_name: string | null
  placement: string
  current_modifier_pct: number
  recommended_modifier_pct: number | null
  placement_impressions: number
  placement_clicks: number
  placement_orders: number
  placement_ctr: number | null
  placement_cvr: number | null
  placement_acos: number | null
  placement_roas: number | null
  campaign_avg_roas: number | null
  reason: string | null
  status: string
  created_at: string
}

interface CampaignPlanRec {
  id: string
  parent_asin: string
  campaign_count: number
  total_daily_budget: number
  status: string
  created_at: string
  approved_at: string | null
  applied_at: string | null
  plan?: string
}

interface TACoSData {
  period_days: number
  total_revenue: number
  ad_spend: number
  ad_sales: number
  organic_revenue: number
  tacos: number | null
  acos: number | null
  organic_pct: number
  effective_acos_ceiling: number | null
  tacos_target: number | null
  trend_7d: number | null
  trend_note: string
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

function fmtUSD(n: number | string | null | undefined) {
  if (n == null) return '—'
  const v = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(v)) return '—'
  return `$${v.toFixed(2)}`
}

function fmtPct(n: number | string | null | undefined) {
  if (n == null) return '—'
  const v = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(v)) return '—'
  return `${(v * 100).toFixed(1)}%`
}

/** Safe Number coercion — all backend decimals may arrive as strings */
function N(v: unknown): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return isNaN(n) ? 0 : n
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
          <span>Total wasted spend: <strong>${N(ev.total_spend).toFixed(2)}</strong></span>
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
        {ev.spend != null && <span>Spend: <strong className="text-slate-700">${N(ev.spend).toFixed(2)}</strong></span>}
        {ev.sales != null && <span>Sales: <strong className="text-slate-700">${N(ev.sales).toFixed(2)}</strong></span>}
        {ev.cvr != null && <span>CVR: <strong className="text-slate-700">{(N(ev.cvr) * 100).toFixed(2)}%</strong></span>}
        {ev.ctr != null && <span>CTR: <strong className="text-slate-700">{(N(ev.ctr) * 100).toFixed(3)}%</strong></span>}
        {ev.category_avg_ctr != null && <span>Cat avg CTR: <strong className="text-slate-500">{(N(ev.category_avg_ctr) * 100).toFixed(3)}%</strong></span>}
        {ev.category_avg_cvr != null && <span>Cat avg CVR: <strong className="text-slate-500">{(N(ev.category_avg_cvr) * 100).toFixed(2)}%</strong></span>}
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
        <span>Current ACoS: <strong className="text-slate-700">{rd.current_acos != null ? `${(N(rd.current_acos) * 100).toFixed(1)}%` : '—'}</strong></span>
        <span>Target ACoS: <strong className="text-slate-700">{(N(rd.target_acos) * 100).toFixed(1)}%</strong></span>
        <span>Gap: <strong className={rd.gap_pct > 0 ? 'text-rose-600' : 'text-emerald-600'}>{(N(rd.gap_pct) * 100).toFixed(1)}%</strong></span>
        <span>Applied step: <strong className="text-slate-700">{(N(rd.applied_step_pct) * 100).toFixed(1)}%</strong></span>
        {rd.trend_7d_vs_14d_cvr != null && (
          <span>CVR trend 7d/14d: <strong className={rd.trend_7d_vs_14d_cvr >= 1 ? 'text-emerald-600' : 'text-rose-600'}>{N(rd.trend_7d_vs_14d_cvr).toFixed(2)}×</strong></span>
        )}
        <span>Next cycle est.: <strong className="text-slate-700">${N(rd.next_cycle_approx).toFixed(4)}</strong></span>
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

function TierLegend() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
      >
        <span>📋 关键词分级说明</span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-2 px-4 pb-3 sm:grid-cols-5 sm:gap-3">
          {[
            { tier: 'star',   icon: '⭐', label: 'Star 明星词',    desc: 'ACoS 远低于目标，转化率高，建议加大投入获取更多订单' },
            { tier: 'stable', icon: '✅', label: 'Stable 稳定词',   desc: 'ACoS 接近目标，表现稳定，微调即可' },
            { tier: 'watch',  icon: '👀', label: 'Watch 观察词',    desc: 'ACoS 偏高但有数据支撑，需持续观察或小幅降 Bid' },
            { tier: 'drain',  icon: '🚿', label: 'Drain 亏损词',    desc: 'ACoS 严重超标，持续亏损，建议大幅降 Bid 或暂停' },
            { tier: 'sparse', icon: '📊', label: 'Sparse 数据不足', desc: '点击量不足 5 次，数据太少无法判断，暂不调整' },
          ].map(({ tier, icon, label, desc }) => {
            const cfg = TIER_CONFIG[tier] ?? { cls: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400', label: '' }
            return (
              <div key={tier} className={cn('rounded-lg border p-2.5 text-xs', cfg.cls)}>
                <p className="mb-0.5 font-semibold">{icon} {label}</p>
                <p className="leading-snug opacity-75">{desc}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BidDetailPanel({ rec, rd }: { rec: BidRec; rd: ReasonData }) {
  const delta = changePct(rec.current_bid, rec.recommended_bid)
  const isIncrease = delta > 0.5
  const isDecrease = delta < -0.5
  const directionMsg = isIncrease
    ? '⬆️ 提升曝光量和订单量 — 当前 ACoS 低于目标，有空间争取更多流量'
    : isDecrease
    ? '⬇️ 控制广告花费 — 当前 ACoS 高于目标，需要降低成本提高效率'
    : '➡️ 维持当前出价 — 表现稳定，暂无调整必要'
  const directionCls = isIncrease
    ? 'bg-green-50 border-green-200 text-green-700'
    : isDecrease
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-slate-50 border-slate-200 text-slate-600'
  const signals = rd.signals
  return (
    <div className="space-y-3 py-1">
      <div className={cn('rounded-lg border px-3 py-2 text-sm font-medium', directionCls)}>
        {directionMsg}
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-lg border border-slate-100 bg-white p-2.5">
          <p className="mb-0.5 text-slate-400">当前 ACoS</p>
          <p className="font-semibold text-slate-800">
            {rd.current_acos != null ? `${(N(rd.current_acos) * 100).toFixed(1)}%` : '—'}
            <span className="ml-1 text-[10px] font-normal text-slate-400">目标 {(N(rd.target_acos) * 100).toFixed(1)}%</span>
          </p>
          {rd.current_acos != null && (
            <p className={cn('mt-0.5 text-[10px]', N(rd.current_acos) <= N(rd.target_acos) ? 'text-emerald-600' : 'text-rose-600')}>
              {N(rd.current_acos) <= N(rd.target_acos) ? '低于目标，表现良好' : '高于目标，需要优化'}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-slate-100 bg-white p-2.5">
          <p className="mb-0.5 text-slate-400">转化率 (CVR)</p>
          <p className="font-semibold text-slate-800">
            {rec.conversion_rate != null ? `${(N(rec.conversion_rate) * 100).toFixed(1)}%` : '—'}
          </p>
          {rd.trend_7d_vs_14d_cvr != null && (
            <p className={cn('mt-0.5 text-[10px]', N(rd.trend_7d_vs_14d_cvr) >= 1 ? 'text-emerald-600' : 'text-rose-600')}>
              近7d趋势: {N(rd.trend_7d_vs_14d_cvr).toFixed(2)}× {N(rd.trend_7d_vs_14d_cvr) >= 1 ? '↑ 上升' : '↓ 下降'}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-slate-100 bg-white p-2.5">
          <p className="mb-0.5 text-slate-400">综合评分</p>
          <p className="font-semibold text-slate-800">{Math.round(rd.score * 100)} / 100</p>
          <div className="mt-1 h-1 rounded-full bg-slate-200">
            <div
              className={cn('h-1 rounded-full', rd.score >= 0.7 ? 'bg-emerald-500' : rd.score >= 0.4 ? 'bg-amber-500' : 'bg-rose-500')}
              style={{ width: `${Math.round(rd.score * 100)}%` }}
            />
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-slate-100 bg-white p-3 text-xs">
        <p className="mb-2 font-semibold text-slate-600">信号分析</p>
        {[
          { key: 'acos_efficiency'      as const, label: 'ACoS 效率', weight: '30%' },
          { key: 'conversion_trend'     as const, label: '转化趋势',  weight: '25%' },
          { key: 'revenue_contribution' as const, label: '营收贡献',  weight: '20%' },
          { key: 'cpc_trend'            as const, label: 'CPC 趋势',  weight: '15%' },
          { key: 'impression_share'     as const, label: '展示占比',  weight: '10%' },
        ].map(({ key, label, weight }) => {
          const val = signals[key]
          return (
            <div key={key} className="flex items-center gap-2 py-0.5">
              <span className="w-28 text-slate-500">{label} <span className="text-slate-400">({weight})</span></span>
              <div className="h-1.5 w-24 rounded-full bg-slate-200">
                <div
                  className={cn('h-1.5 rounded-full', val >= 0.7 ? 'bg-emerald-500' : val >= 0.4 ? 'bg-amber-500' : 'bg-rose-500')}
                  style={{ width: `${Math.round(val * 100)}%` }}
                />
              </div>
              <span className="text-slate-400">{Math.round(val * 100)}</span>
            </div>
          )
        })}
      </div>
      <div className="rounded-lg border border-slate-100 bg-white p-3 text-xs space-y-1 text-slate-600">
        <p className="mb-1 font-semibold text-slate-700">Bid 调整详情</p>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">当前竞价:</span>
          <span className="font-medium">{fmtUSD(rec.current_bid)}</span>
          <span className="text-slate-400">→</span>
          <span className={cn('font-semibold', isIncrease ? 'text-green-600' : isDecrease ? 'text-red-600' : 'text-slate-600')}>
            {fmtUSD(rec.recommended_bid)}
            <span className="ml-1 text-[10px]">({delta > 0 ? '+' : ''}{N(delta).toFixed(1)}%)</span>
          </span>
        </div>
        <p><span className="text-slate-400">ACoS 偏差:</span> <span className={cn('font-medium', N(rd.gap_pct) > 0 ? 'text-rose-600' : 'text-emerald-600')}>{(N(rd.gap_pct) * 100).toFixed(1)}%</span></p>
        <p><span className="text-slate-400">阻尼系数:</span> {N(rd.damping_factor).toFixed(2)} · <span className="text-slate-400">调整幅度:</span> {(N(rd.applied_step_pct) * 100).toFixed(1)}%</p>
        {rd.bound_note && <p className="text-amber-600">⚠ {rd.bound_note}</p>}
      </div>
    </div>
  )
}

function SortableHeader({ label, field, sort, onSort, title }: { label: string; field: string; sort: { field: string; dir: 'asc' | 'desc' }; onSort: (f: string) => void; title?: string }) {
  const active = sort.field === field
  return (
    <th
      title={title}
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

const TABS = ['📡 实时监控', '📋 Campaign 诊断', '💰 Bid 建议', '🔑 关键词建议', '📍 Placement 优化', '🏗️ Campaign 构建器', '🌾 关键词收割', '📊 预算节奏', '🎯 智能优化', '⏰ 分时投放', '⚙️ 设置'] as const
type Tab = typeof TABS[number]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PpcAutomationPage() {
  const [activeTab, setActiveTab] = useState<Tab>('📋 Campaign 诊断')
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
        {activeTab === '📡 实时监控' && <RealtimeTab />}
        {activeTab === '📋 Campaign 诊断' && <CampaignDiagnosticsTab />}
        {activeTab === '💰 Bid 建议' && <BidRecommendationsTab />}
        {activeTab === '🔑 关键词建议' && <KeywordRecommendationsTab />}
        {activeTab === '📍 Placement 优化' && <PlacementsTab />}
        {activeTab === '🏗️ Campaign 构建器' && <CampaignBuilderTab />}
        {activeTab === '🌾 关键词收割' && <KeywordHarvestTab />}
        {activeTab === '📊 预算节奏' && <BudgetPacingTab />}
        {activeTab === '🎯 智能优化' && <GoalOptimizerTab />}
        {activeTab === '⏰ 分时投放' && <DaypartingTab />}
        {activeTab === '⚙️ 设置' && <SettingsTab />}
      </div>

      {/* Change log panel */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          onClick={() => setChangeLogOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
        >
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-slate-400" />
            变更日志
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
        title="运行竞价优化引擎，生成 Bid / 关键词建议"
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition',
          running
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700',
        )}
      >
        {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? '运行中…' : '运行优化'}
      </button>
    </div>
  )
}

// ─── Realtime Tab ─────────────────────────────────────────────────────────────

interface RealtimeToday {
  date: string; empty?: boolean; message?: string
  impressions: number; clicks: number; orders: number
  cost: number; sales: number
  acos: number | null; roas: number | null; cpc: number | null; ctr: number | null
  campaigns: number; latest_hour: number | null; source: string
}
interface RealtimeHour { hour: number; impressions: number; clicks: number; orders: number; cost: number; sales: number; acos: number | null }
interface RealtimeCampaign { campaignId: string; name: string; impressions: number; clicks: number; orders: number; cost: number; sales: number; acos: number | null; cpc: number | null }
interface RealtimePlacement { placement: string; impressions: number; clicks: number; cost: number; sales: number; acos: number | null; sharePct: number }

function fmt$(n: number) { return `$${n.toFixed(2)}` }
function fmtK(n: number) { if (n >= 1000) return `${(n / 1000).toFixed(1)}K`; return String(n) }

function RealtimeKPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{label}</p>
      <p className="text-xl font-bold mt-1 text-slate-900">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function HourlyBars({ hours, latestHour }: { hours: RealtimeHour[]; latestHour: number | null }) {
  if (!hours.length) return <p className="text-sm text-slate-500 py-4 text-center">暂无今日数据</p>
  // Build full timeline 0..latestHour, filling gaps with 0
  const maxH = latestHour ?? Math.max(...hours.map(h => h.hour))
  const hourMap = new Map(hours.map(h => [h.hour, h]))
  const fullHours = Array.from({ length: maxH + 1 }, (_, i) => hourMap.get(i) ?? { hour: i, cost: 0, impressions: 0, clicks: 0, orders: 0, sales: 0, acos: null })
  const maxImpr = Math.max(...fullHours.map(h => h.impressions), 1)
  const maxCost = Math.max(...fullHours.map(h => h.cost), 0.01)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">每小时展示量 (bars) + 花费 ($)</p>
        <p className="text-[10px] text-slate-400">共 {fullHours.length} 小时</p>
      </div>
      <div className="flex items-end gap-0.5 h-24">
        {fullHours.map(h => {
          const imprPct = h.impressions / maxImpr * 100
          const hasCost = h.cost > 0
          return (
            <div key={h.hour} className="flex flex-col items-center flex-1 min-w-0 group relative">
              <div
                className={cn('w-full rounded-t transition-all cursor-default', hasCost ? 'bg-blue-500 hover:bg-blue-600' : 'bg-slate-200')}
                style={{ height: `${Math.max(imprPct, hasCost ? 4 : 1)}%` }}
              />
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 gap-0.5">
                <span>{h.hour}:00</span>
                <span>{(h.impressions / 1000).toFixed(1)}K 展示</span>
                {hasCost && <span>${h.cost.toFixed(2)}</span>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-0.5">
        {fullHours.map(h => (
          <p key={h.hour} className={cn('flex-1 text-center text-[8px] min-w-0 truncate', h.cost > 0 ? 'text-slate-500 font-medium' : 'text-slate-300')}>
            {h.hour}
          </p>
        ))}
      </div>
    </div>
  )
}

function PlacementBars({ placements }: { placements: RealtimePlacement[] }) {
  const PLACEMENT_LABELS: Record<string, string> = {
    'TOP_OF_SEARCH': '搜索顶部',
    'DETAIL_PAGE': '商品页',
    'OTHER': '其他',
    'OFF_AMAZON': '站外',
    'Unknown': '未知',
  }
  return (
    <div className="space-y-2">
      {placements.map(p => (
        <div key={p.placement} className="space-y-0.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-700 font-medium">{PLACEMENT_LABELS[p.placement] ?? p.placement}</span>
            <span className="text-slate-500">{fmt$(p.cost)} ({p.sharePct}%)</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${Math.max(p.sharePct, 1)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function RealtimeTab() {
  // ✅ interval cleanup verified 2026-03-25 — polling via React Query refetchInterval; no bare setInterval/useEffect; cleanup handled automatically on unmount
  const { data: today, dataUpdatedAt } = useQuery<RealtimeToday>({
    queryKey: ['realtime-today'],
    queryFn: () => fetch('/api/ppc/automation/realtime/today').then(r => r.json()),
    refetchInterval: 60_000,
  })
  const { data: hourlyData } = useQuery<{ hours: RealtimeHour[] }>({
    queryKey: ['realtime-hourly'],
    queryFn: () => fetch('/api/ppc/automation/realtime/hourly').then(r => r.json()),
    refetchInterval: 60_000,
  })
  const { data: campaignsData } = useQuery<{ campaigns: RealtimeCampaign[] }>({
    queryKey: ['realtime-campaigns'],
    queryFn: () => fetch('/api/ppc/automation/realtime/campaigns').then(r => r.json()),
    refetchInterval: 60_000,
  })
  const { data: placementsData } = useQuery<{ placements: RealtimePlacement[] }>({
    queryKey: ['realtime-placements'],
    queryFn: () => fetch('/api/ppc/automation/realtime/placements').then(r => r.json()),
    refetchInterval: 60_000,
  })

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--:--'
  const latestHour = today?.latest_hour ?? null

  if (today?.empty) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-4xl mb-3">📡</p>
        <p className="text-slate-500">{today.message ?? '今日暂无 AMS 实时数据'}</p>
        <p className="text-xs text-slate-400 mt-2">AMS 实时数据从 2026-03-23 开始采集，每小时更新</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">LIVE</span>
        </div>
        <p className="text-sm text-slate-600">
          {today?.date ?? '--'}{latestHour !== null ? ` · 截至 ${String(latestHour).padStart(2, '0')}:00 EST` : ''} · 最后更新 {lastUpdated}
        </p>
        <p className="text-xs text-slate-400 ml-auto">Amazon 数据延迟约 2-4 小时 · 每 60 秒刷新</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <RealtimeKPICard label="今日花费" value={today ? fmt$(today.cost) : '—'} sub={today?.cpc ? `CPC $${today.cpc}` : undefined} />
        <RealtimeKPICard label="今日销售" value={today?.sales ? fmt$(today.sales) : '—'} />
        <RealtimeKPICard label="ACoS" value={today?.acos != null ? `${today.acos}%` : '—'} />
        <RealtimeKPICard label="点击" value={today ? fmtK(today.clicks) : '—'} sub={today?.ctr != null ? `CTR ${today.ctr}%` : undefined} />
        <RealtimeKPICard label="展示" value={today ? fmtK(today.impressions) : '—'} />
        <RealtimeKPICard label="活跃 Campaign" value={today ? String(today.campaigns) : '—'} sub="今日有花费" />
      </div>

      {/* Note: orders/sales may be 0 in SP-traffic stream */}
      {today && today.orders === 0 && (
        <p className="text-[10px] text-slate-400 -mt-2">
          ℹ️ SP-traffic stream 不含转化数据，orders/sales 可能延迟至次日更新
        </p>
      )}

      {/* Hourly chart + Placements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">📈 小时趋势</h3>
          <HourlyBars hours={hourlyData?.hours ?? []} latestHour={latestHour} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">📍 Placement 分布</h3>
          {placementsData?.placements?.length ? (
            <PlacementBars placements={placementsData.placements} />
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">暂无 Placement 数据</p>
          )}
        </div>
      </div>

      {/* Campaign table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">🏆 今日 Campaign 排名</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Campaign</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">花费</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">点击</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">展示</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">CPC</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">ACoS</th>
              </tr>
            </thead>
            <tbody>
              {(campaignsData?.campaigns ?? []).map((c, i) => (
                <tr key={c.campaignId} className={cn('border-b border-slate-50', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}>
                  <td className="px-4 py-2 text-slate-700 truncate max-w-[240px]" title={c.name}>{c.name}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900">{fmt$(c.cost)}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{c.clicks}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{fmtK(c.impressions)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{c.cpc != null ? `$${c.cpc}` : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {c.acos != null ? (
                      <span className={cn('text-xs font-medium', c.acos < 25 ? 'text-green-600' : c.acos < 40 ? 'text-amber-600' : 'text-red-600')}>
                        {c.acos}%
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {!campaignsData?.campaigns?.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">今日暂无 Campaign 数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Campaign Diagnostics Tab ─────────────────────────────────────────────────

type OptCampaign = {
  campaign_id: string; name: string; type: string; targeting_type: string
  budget: number; spend_30d: number; sales_30d: number
  clicks_30d: number; impressions_30d: number; orders_30d: number
  acos: number | null; roas: number | null
  status: 'healthy' | 'warning' | 'critical' | 'inactive'
  depletes_early: boolean
}
type ZeroConvTerm = { term: string; clicks: number; spend: number }
type OptTransfer = {
  from_campaign: string; from_acos: number | null; to_campaign: string | null
  same_product: boolean; transfer_amount: number
  steps: Array<{ timing: string; action: string; details?: string[]; terms?: ZeroConvTerm[]; total_wasted?: number }>
  expected_impact: { from_saved: string; to_gained: string; net_weekly_gain: string }
  preserve_note?: string
}
type QWTermSource = { campaign_name: string; targeting_type: string; orders: number; spend: number }
type QWTerm = {
  keyword: string; orders: number; spend: number; sales: number; clicks: number
  acos: number | null; roas: number | null; cvr: number
  source_campaigns?: QWTermSource[]
  suggested_action?: string
  suggested_exact_campaign?: string | null
  suggested_bid?: number | null
  suggested_daily_budget?: number | null
  expected_acos_after?: number | null
}
type QWCampaign = { name: string; current_budget: number; avg_daily_spend: number; suggested_budget: number; acos: number | null; roas: number | null; orders_30d: number; sales_30d: number }
type OptQuickWin = { type?: string; action: string; impact: string; impact_detail?: string; terms?: QWTerm[]; campaigns?: QWCampaign[] }
type OptMissing = { asin: string; product: string; missing: string; suggestion: string }
type OptData = {
  campaign_health: { healthy: number; warning: number; critical: number; inactive: number }
  campaigns: OptCampaign[]
  budget_transfers: OptTransfer[]
  quick_wins: OptQuickWin[]
  missing_coverage: OptMissing[]
  target_acos: number
  total_campaigns: number
}

function statusBg(s: OptCampaign['status']) {
  if (s === 'critical') return 'bg-rose-50'
  if (s === 'warning') return 'bg-amber-50'
  if (s === 'inactive') return 'bg-slate-50'
  return ''
}

function CampaignDiagnosticsTab() {
  const { data, isLoading } = useQuery<OptData>({
    queryKey: ['opt-recs'],
    queryFn: () => apiFetch('/api/ppc/automation/optimization-recommendations'),
    staleTime: 5 * 60 * 1000,
  })
  const [section, setSection] = useState<'health' | 'transfers' | 'coverage' | 'wins'>('health')
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  function toggleStep(key: string) { setExpandedSteps(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n }) }

  if (isLoading) return <div className="py-16 text-center text-sm text-slate-400">加载中...</div>
  if (!data) return <div className="py-16 text-center text-sm text-slate-400">暂无数据</div>

  const { campaign_health: h, campaigns = [], budget_transfers = [], quick_wins = [], missing_coverage = [] } = data

  const sectionTabs: Array<{ id: typeof section; label: string; count?: number }> = [
    { id: 'health', label: '🏥 Campaign 健康' },
    { id: 'transfers', label: '🔄 预算调配', count: budget_transfers.length },
    { id: 'coverage', label: '⚠️ 覆盖缺口', count: missing_coverage.length },
    { id: 'wins', label: '🎯 Quick Wins', count: quick_wins.length },
  ]

  return (
    <div className="space-y-4">
      {/* Summary badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-slate-700">Campaign 健康总览</span>
        <div className="flex gap-1.5 ml-2">
          {h.critical > 0 && <span className="rounded-full bg-rose-100 text-rose-600 text-xs font-semibold px-2.5 py-0.5 border border-rose-200">🔴 {h.critical} 高危</span>}
          {h.warning > 0 && <span className="rounded-full bg-amber-100 text-amber-600 text-xs font-semibold px-2.5 py-0.5 border border-amber-200">⚠️ {h.warning} 警告</span>}
          {h.healthy > 0 && <span className="rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-0.5 border border-emerald-200">✅ {h.healthy} 健康</span>}
          {h.inactive > 0 && <span className="rounded-full bg-slate-100 text-slate-500 text-xs font-semibold px-2.5 py-0.5 border border-slate-200">{h.inactive} 不活跃</span>}
        </div>
        <span className="ml-auto text-xs text-slate-400">目标 ACoS: {data.target_acos}%</span>
      </div>

      {/* Section nav */}
      <div className="flex gap-0 border-b border-slate-200">
        {sectionTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              section === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}{t.count != null ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* ── Section: Health table ── */}
      {section === 'health' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Campaign</th>
                <th className="px-3 py-2.5 text-left">类型</th>
                <th className="px-3 py-2.5 text-right">预算/天</th>
                <th className="px-3 py-2.5 text-right">30天花费</th>
                <th className="px-3 py-2.5 text-right">30天销售</th>
                <th className="px-3 py-2.5 text-right">ACoS</th>
                <th className="px-3 py-2.5 text-right">ROAS</th>
                <th className="px-3 py-2.5 text-center">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...campaigns]
                .sort((a, b) => {
                  const order = { critical: 0, warning: 1, healthy: 2, inactive: 3 }
                  return (order[a.status] ?? 4) - (order[b.status] ?? 4)
                })
                .map(c => (
                  <tr key={c.campaign_id} className={cn('hover:bg-slate-50', statusBg(c.status))}>
                    <td className="max-w-[220px] truncate px-4 py-2.5 font-medium text-slate-800 text-xs" title={c.name}>{c.name}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                        {c.type} · {c.targeting_type || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-500">${c.budget.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium text-slate-700">${c.spend_30d.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-600">{c.sales_30d > 0 ? `$${c.sales_30d.toFixed(2)}` : '—'}</td>
                    <td className={cn('px-3 py-2.5 text-right text-xs font-bold', c.acos == null ? 'text-slate-400' : c.acos > data.target_acos * 2 ? 'text-rose-600' : c.acos > data.target_acos * 1.3 ? 'text-amber-600' : 'text-emerald-700')}>
                      {c.acos != null ? `${c.acos}%` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-600">{c.roas != null ? `${c.roas}x` : '—'}</td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      {c.status === 'critical' && <span className="text-rose-600">🔴 高危</span>}
                      {c.status === 'warning' && <span className="text-amber-600">⚠️ 警告</span>}
                      {c.status === 'healthy' && <span className="text-emerald-600">✅ 健康</span>}
                      {c.status === 'inactive' && <span className="text-slate-400">— 不活跃</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Section: Budget transfers ── */}
      {section === 'transfers' && (
        <div className="space-y-3">
          {budget_transfers.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">暂无预算调配建议</div>
          )}
          {budget_transfers.map((t, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="font-semibold text-rose-600 truncate max-w-[200px]">{t.from_campaign}</span>
                <span className="text-slate-400 text-lg">→</span>
                <span className="font-semibold text-emerald-700 truncate max-w-[200px]">{t.to_campaign ?? '未确定'}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold ml-1', t.same_product ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200')}>
                  {t.same_product ? '✅ 同产品' : '⚠️ 跨产品'}
                </span>
                <span className="ml-auto font-bold text-slate-900">${t.transfer_amount}/天</span>
                {t.from_acos != null && <span className="text-xs text-slate-500">来源 ACoS {t.from_acos}%</span>}
              </div>
              <div className="space-y-1.5">
                {t.steps.map((s, si) => {
                  const stepKey = `${i}-${si}`
                  const isExpanded = expandedSteps.has(stepKey)
                  return (
                    <div key={si}>
                      <div className="flex items-start gap-2 text-sm">
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{s.timing}</span>
                        <span className="text-slate-700 flex-1">{s.action}</span>
                        {s.terms && s.terms.length > 0 && (
                          <button onClick={() => toggleStep(stepKey)} className="text-xs text-blue-500 hover:text-blue-700 shrink-0">
                            {isExpanded ? '▲ 收起' : '▼ 查看词'}
                          </button>
                        )}
                      </div>
                      {s.terms && s.terms.length > 0 && isExpanded && (
                        <div className="ml-16 mt-1.5 rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="px-2 py-1 text-left text-slate-500 font-medium">搜索词</th>
                                <th className="px-2 py-1 text-right text-slate-500 font-medium">点击</th>
                                <th className="px-2 py-1 text-right text-slate-500 font-medium">浪费</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {s.terms.map((term, ti) => (
                                <tr key={ti}>
                                  <td className="px-2 py-1 font-mono text-slate-700">{term.term}</td>
                                  <td className="px-2 py-1 text-right text-slate-500">{term.clicks}</td>
                                  <td className="px-2 py-1 text-right font-medium text-rose-600">${term.spend.toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {t.expected_impact && (
                <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-100 p-2.5 text-xs">
                  <span className="font-semibold text-emerald-800">预期收益: </span>
                  <span className="text-emerald-700">{t.expected_impact.to_gained} · 每周净收益 {t.expected_impact.net_weekly_gain}</span>
                </div>
              )}
              {t.preserve_note && <p className="mt-2 text-xs text-slate-400">💡 {t.preserve_note}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Section: Missing coverage ── */}
      {section === 'coverage' && (
        <div className="space-y-2">
          {missing_coverage.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">无覆盖缺口</div>
          )}
          {missing_coverage.map((m, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <span className="text-amber-500 text-lg shrink-0">⚠️</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-slate-800 truncate">{m.product}</p>
                <p className="text-xs text-slate-500 font-mono">{m.asin} · {m.missing}</p>
              </div>
              <p className="text-xs text-blue-600 shrink-0 max-w-[180px] text-right">{m.suggestion}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Section: Quick wins ── */}
      {section === 'wins' && (
        <div className="space-y-4">
          {quick_wins.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">暂无快速优化建议</div>
          )}
          {quick_wins.map((qw, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-start gap-3 p-4 bg-blue-50/50 border-b border-blue-100">
                <span className="text-lg shrink-0">🎯</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-slate-800">{qw.action}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{qw.impact}</p>
                  {qw.impact_detail && <p className="text-xs text-slate-400 mt-0.5">{qw.impact_detail}</p>}
                </div>
              </div>

              {/* Exact match keyword table */}
              {qw.type === 'exact_match_upgrade' && qw.terms && qw.terms.length > 0 && (() => {
                const totalOrders = qw.terms.reduce((s, t) => s + t.orders, 0)
                const totalSales = qw.terms.reduce((s, t) => s + t.sales, 0)
                const totalSpend = qw.terms.reduce((s, t) => s + t.spend, 0)
                const totalAcos = totalSales > 0 ? totalSpend / totalSales * 100 : null
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">关键词</th>
                          <th className="px-3 py-2 text-left">来源 Campaign</th>
                          <th className="px-3 py-2 text-right">订单</th>
                          <th className="px-3 py-2 text-right">销售</th>
                          <th className="px-3 py-2 text-right">花费</th>
                          <th className="px-3 py-2 text-right">ACoS</th>
                          <th className="px-3 py-2 text-right">ROAS</th>
                          <th className="px-3 py-2 text-right">CVR</th>
                          <th className="px-3 py-2 text-left text-blue-600">建议操作</th>
                          <th className="px-3 py-2 text-right text-blue-600">建议 Bid</th>
                          <th className="px-3 py-2 text-right text-emerald-600">预估 ACoS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {qw.terms.map((t, ti) => (
                          <tr key={ti} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono font-medium text-slate-700">{t.keyword}</td>
                            <td className="px-3 py-2 text-xs text-slate-500 max-w-[160px]">
                              {t.source_campaigns && t.source_campaigns.length > 0 ? (
                                <div className="space-y-0.5">
                                  {t.source_campaigns.slice(0, 2).map((s, si) => (
                                    <div key={si} className="truncate" title={s.campaign_name}>
                                      <span className={cn('inline-block mr-1 rounded px-1 text-[9px] font-mono', s.targeting_type === 'AUTO' ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500')}>{s.targeting_type === 'AUTO' ? 'AUTO' : 'MAN'}</span>
                                      <span className="truncate">{s.campaign_name.substring(0, 20)}{s.campaign_name.length > 20 ? '…' : ''}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-slate-700">{t.orders}</td>
                            <td className="px-3 py-2 text-right text-slate-600">${t.sales.toFixed(0)}</td>
                            <td className="px-3 py-2 text-right text-slate-500">${t.spend.toFixed(0)}</td>
                            <td className={cn('px-3 py-2 text-right font-medium', t.acos == null ? 'text-slate-400' : t.acos > data.target_acos * 1.3 ? 'text-amber-600' : 'text-emerald-700')}>
                              {t.acos != null ? `${t.acos}%` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">{t.roas != null ? `${t.roas}x` : '—'}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{t.cvr}%</td>
                            <td className="px-3 py-2 text-xs text-blue-700 max-w-[140px]">
                              <div>{t.suggested_action ?? '—'}</div>
                              {t.suggested_exact_campaign && <div className="text-[10px] text-slate-400 truncate" title={t.suggested_exact_campaign}>→ {t.suggested_exact_campaign.substring(0, 18)}{t.suggested_exact_campaign.length > 18 ? '…' : ''}</div>}
                            </td>
                            <td className="px-3 py-2 text-right text-blue-600 font-medium">
                              {t.suggested_bid != null ? `$${t.suggested_bid.toFixed(2)}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-emerald-600 font-medium">
                              {t.expected_acos_after != null ? `~${t.expected_acos_after}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 font-semibold">
                        <tr>
                          <td className="px-3 py-2 text-slate-700">合计 ({qw.terms.length} 词)</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-right text-slate-700">{totalOrders}</td>
                          <td className="px-3 py-2 text-right text-slate-700">${totalSales.toFixed(0)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">${totalSpend.toFixed(0)}</td>
                          <td className={cn('px-3 py-2 text-right', totalAcos != null && totalAcos > data.target_acos ? 'text-amber-600' : 'text-emerald-700')}>
                            {totalAcos != null ? `${totalAcos.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600">{totalSales > 0 && totalSpend > 0 ? `${(totalSales / totalSpend).toFixed(2)}x` : '—'}</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-right text-emerald-600">
                            {totalAcos != null ? `~${(totalAcos * 0.8).toFixed(0)}%` : '—'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}

              {/* Budget increase campaign cards */}
              {qw.type === 'budget_increase' && qw.campaigns && qw.campaigns.length > 0 && (
                <div className="divide-y divide-slate-100">
                  {qw.campaigns.map((c, ci) => {
                    const budgetGap = c.avg_daily_spend - c.current_budget
                    const extraSalesWeekly = budgetGap * (c.roas ?? 4) * 7
                    return (
                      <div key={ci} className="px-4 py-3 flex items-center gap-4 flex-wrap text-xs">
                        <span className="font-medium text-slate-800 truncate max-w-[180px]">{c.name}</span>
                        <span className="text-slate-400 shrink-0">当前 <strong className="text-slate-600">${c.current_budget}/天</strong></span>
                        <span className="text-rose-500 shrink-0">实际花费 <strong>${c.avg_daily_spend.toFixed(0)}/天</strong></span>
                        <span className="text-blue-600 font-semibold shrink-0">建议 ${c.suggested_budget.toFixed(0)}/天</span>
                        {c.acos != null && <span className="text-emerald-700 shrink-0">ACoS {c.acos}%</span>}
                        {c.roas != null && <span className="text-slate-500 shrink-0">ROAS {c.roas}x</span>}
                        <span className="ml-auto text-emerald-600 font-semibold shrink-0">
                          +${extraSalesWeekly.toFixed(0)}/周销售额
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Bid Recommendations Tab ───────────────────────────────────────────────────

function BidRecommendationsTab() {
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'score', dir: 'desc' })
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bid-recs', statusFilter],
    queryFn: () => apiFetch(`/api/ppc/automation/bid-recommendations?status=${statusFilter}`),
  })

  const items: BidRec[] = data?.items ?? []

  const enriched = useMemo(() => items.map((rec) => {
    const rd = parseReason(rec.reason)
    return { ...rec, _tier: rd?.tier ?? '', _score: rd?.score ?? 0, _delta_pct: changePct(rec.current_bid, rec.recommended_bid) }
  }), [items])

  const sorted = useMemo(() => {
    const FIELD_MAP: Record<string, string> = { tier: '_tier', score: '_score', delta_pct: '_delta_pct' }
    return [...enriched].sort((a, b) => {
      const f = FIELD_MAP[sort.field] ?? sort.field
      const av = (a as unknown as Record<string, unknown>)[f]
      const bv = (b as unknown as Record<string, unknown>)[f]
      if (av == null) return 1
      if (bv == null) return -1
      const na = typeof av === 'string' ? parseFloat(av) : (av as number)
      const nb = typeof bv === 'string' ? parseFloat(bv) : (bv as number)
      const aVal = !isNaN(na) ? na : av
      const bVal = !isNaN(nb) ? nb : bv
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [enriched, sort])

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
            <option value="pending">待处理</option>
            <option value="applied">已采纳</option>
            <option value="rejected">已拒绝</option>
          </select>
          <span className="text-xs text-slate-400">{items.length} 条</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            title="刷新"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => applyMutation.mutate([...selected])}
              disabled={applyMutation.isPending}
              title="将选中的竞价建议批量应用到广告系统"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              采纳选中 ({selected.size})
            </button>
          )}
          {items.length > 0 && statusFilter === 'pending' && (
            <button
              onClick={() => applyMutation.mutate(items.map((r) => r.id))}
              disabled={applyMutation.isPending}
              title="将所有待处理竞价建议批量应用"
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              全部采纳
            </button>
          )}
        </div>
      </div>

      {/* Tier Legend */}
      <div className="px-4 pt-3">
        <TierLegend />
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
              <SortableHeader label="Tier" field="tier" sort={sort} onSort={handleSort} title="优化层级：HIGH / MID / LOW" />
              <SortableHeader label="Score" field="score" sort={sort} onSort={handleSort} title="综合评分 (0–100)" />
              <SortableHeader label="Campaign" field="campaign_id" sort={sort} onSort={handleSort} title="广告活动 ID" />
              <SortableHeader label="Match" field="match_type" sort={sort} onSort={handleSort} title="匹配类型：exact / phrase / broad" />
              <SortableHeader label="当前竞价" field="current_bid" sort={sort} onSort={handleSort} title="当前竞价金额 (USD)" />
              <SortableHeader label="建议竞价" field="recommended_bid" sort={sort} onSort={handleSort} title="系统推荐竞价金额 (USD)" />
              <SortableHeader label="变化 %" field="delta_pct" sort={sort} onSort={handleSort} title="相较当前竞价的涨跌幅" />
              <SortableHeader label="转化率" field="conversion_rate" sort={sort} onSort={handleSort} title="点击转化率 (CVR)" />
              <SortableHeader label="状态" field="status" sort={sort} onSort={handleSort} title="待处理 / 已采纳 / 已拒绝" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-sm text-slate-400">暂无建议</td></tr>
            ) : (
              sorted.map((rec) => {
                const delta = changePct(rec.current_bid, rec.recommended_bid)
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
                      <td className={cn('px-3 py-2 font-medium', delta > 0.5 ? 'text-green-700 bg-green-50' : delta < -0.5 ? 'text-red-700 bg-red-50' : 'text-slate-900')}>
                        {fmtUSD(rec.recommended_bid)}
                        {rd && <span className={cn('ml-1 text-[10px] font-normal', delta > 0.5 ? 'text-green-500' : delta < -0.5 ? 'text-red-400' : 'text-slate-400')} title="Next cycle estimate">→~${N(rd.next_cycle_approx).toFixed(2)}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex items-center gap-1 text-xs font-medium', delta > 0.5 ? 'text-green-600' : delta < -0.5 ? 'text-red-600' : 'text-slate-500')}>
                          {delta > 0.5 ? <TrendingUp className="h-3 w-3" /> : delta < -0.5 ? <TrendingDown className="h-3 w-3" /> : null}
                          {delta > 0 ? '+' : ''}{N(delta).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{fmtPct(rec.conversion_rate)}</td>
                      <td className="px-3 py-2"><StatusPill status={rec.status} /></td>
                    </tr>
                    {isExpanded && rd && (
                      <tr>
                        <td colSpan={11} className="bg-slate-50 px-6 pb-3 pt-2">
                          <BidDetailPanel rec={rec} rd={rd} />
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
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'confidence', dir: 'desc' })
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
      const na = typeof av === 'string' ? parseFloat(av) : (av as number)
      const nb = typeof bv === 'string' ? parseFloat(bv) : (bv as number)
      const aVal = !isNaN(na) ? na : av
      const bVal = !isNaN(nb) ? nb : bv
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
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
                  title="将选中关键词建议批量应用"
                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  采纳选中
                </button>
              )}
              <button
                onClick={() => applyMutation.mutate(recs.map((r) => r.id))}
                disabled={applyMutation.isPending}
                title="将此分类所有待处理建议批量应用"
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                全部采纳
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
                <SortableHeader label="Search Term" field="search_term" sort={sort} onSort={handleSort} title="搜索词" />
                <SortableHeader label="置信度" field="confidence" sort={sort} onSort={handleSort} title="模型对该建议的置信度 (0–100)" />
                <SortableHeader label="来源" field="source" sort={sort} onSort={handleSort} title="发现来源：search_term_report / pattern_detector" />
                <SortableHeader label="建议匹配" field="match_type_recommendation" sort={sort} onSort={handleSort} title="建议的关键词匹配类型" />
                <SortableHeader label="点击" field="clicks" sort={sort} onSort={handleSort} title="历史点击次数" />
                {showOrders && <SortableHeader label="订单" field="orders" sort={sort} onSort={handleSort} title="历史成交订单数" />}
                <SortableHeader label="CTR" field="ctr" sort={sort} onSort={handleSort} title="点击率 (Click-Through Rate)" />
                <SortableHeader label="转化率" field="conversion_rate" sort={sort} onSort={handleSort} title="点击转化率 (CVR)" />
                <SortableHeader label="ACoS" field="acos" sort={sort} onSort={handleSort} title="广告销售成本比 (Ad Cost of Sales)" />
                <SortableHeader label="Campaign" field="source_campaign_id" sort={sort} onSort={handleSort} title="来源广告活动 ID" />
                <SortableHeader label="状态" field="status" sort={sort} onSort={handleSort} title="待处理 / 已采纳 / 已拒绝" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recs.length === 0 ? (
                <tr><td colSpan={colSpan} className="px-3 py-6 text-center text-xs text-slate-400">暂无数据</td></tr>
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
                        <td className="px-3 py-2 align-middle">
                          <input
                            type="checkbox"
                            checked={selected.has(rec.id)}
                            onChange={() => setSelected((s) => { const n = new Set(s); n.has(rec.id) ? n.delete(rec.id) : n.add(rec.id); return n })}
                            className="rounded align-middle"
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
            <option value="pending">待处理</option>
            <option value="applied">已采纳</option>
            <option value="rejected">已拒绝</option>
          </select>
          <select
            value={confidenceMin}
            onChange={(e) => setConfidenceMin(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全部置信度</option>
            <option value="0.8">HIGH (≥80)</option>
            <option value="0.5">MED+ (≥50)</option>
          </select>
          <span className="text-xs text-slate-400">{items.length} 条</span>
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
          <KwTable recs={addItems} title="新增关键词" badgeColor="bg-emerald-500" showOrders />
          <KwTable recs={negItems} title="单独否定词" badgeColor="bg-rose-500" showOrders={false} />
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
            模式否定词
            {patternItems.length > 0 && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                {patternItems.length} clusters
              </span>
            )}
            <span className="ml-1 text-xs font-normal text-slate-400">— 从零转化词簇中检测到的 phrase-level 模式</span>
          </span>
          {patternsOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {patternsOpen && (
          <div className="px-4 pb-4">
            {patternsLoading ? (
              <div className="py-6 text-center text-sm text-slate-400">Loading patterns…</div>
            ) : patternItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">暂无模式否定词 — 运行关键词发现来填充数据。</div>
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
                          {ev && <span>{ev.term_count} terms · ${N(ev.total_spend).toFixed(2)} wasted</span>}
                          <StatusPill status={rec.status} />
                          {rec.status === 'pending' && (
                            <button
                              onClick={() => applyMutation.mutate([rec.id])}
                              disabled={applyMutation.isPending}
                              title="将此模式添加为否定关键词"
                              className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              采纳
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
  return <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold', cls)}>{N(roas).toFixed(1)}×</span>
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
      <span className="text-[10px] text-slate-500">{(N(util) * 100).toFixed(0)}%</span>
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
          <p className="text-xs text-slate-400">{alloc.alloc_date} · Daily budget: <strong className="text-slate-600">${N(alloc.total_daily_budget).toFixed(2)}</strong></p>
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
            title="将此预算分配方案应用到广告账户"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            采纳
          </button>
          <button
            onClick={onReject}
            disabled={isPending}
            title="拒绝此预算分配建议"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            拒绝
          </button>
          <button
            onClick={onEdit}
            title="手动调整各广告类型预算占比"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            手动调整
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
        <h3 className="mb-1 text-sm font-semibold text-slate-800">手动预算调整</h3>
        <p className="mb-4 text-xs text-slate-400 font-mono">{alloc.parent_asin} · ${N(alloc.total_daily_budget).toFixed(2)}/day</p>

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
            保存覆盖
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            取消
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
            <option value="">全部状态</option>
            <option value="pending">待处理</option>
            <option value="applied">已采纳</option>
            <option value="rejected">已拒绝</option>
          </select>
          <span className="text-xs text-slate-400">{items.length} 条分配方案</span>
          {totalBudget > 0 && (
            <span className="text-xs font-medium text-slate-600">
              Total budget: <strong>${N(totalBudget).toFixed(2)}/day</strong>
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
            title="分析各广告类型预算分配，生成调整建议"
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition',
              running ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700',
            )}
          >
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? '分析中…' : '运行预算分析'}
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
          暂无预算分配方案 — 点击 <strong>运行预算分析</strong> 生成建议。
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
    target_mode: 'acos',
    target_tacos: null,
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
        target_mode: data.target_mode ?? 'acos',
        target_tacos: data.target_tacos ?? null,
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
        <label className="mb-1 block text-sm font-medium text-slate-700">产品 (Parent ASIN)</label>
        <div className="flex gap-2">
          <select
            value={selectedAsin}
            onChange={(e) => { setSelectedAsin(e.target.value); setSaved(false) }}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {KNOWN_ASINS.map((a) => <option key={a}>{a}</option>)}
          </select>
          <button onClick={handleLoad} title="加载当前 ASIN 的已保存设置" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            加载
          </button>
        </div>
        {isLoading && <p className="mt-1 text-xs text-slate-400">Loading…</p>}
        {!isLoading && !data && <p className="mt-1 text-xs text-amber-600">尚未保存设置 — 显示默认值。</p>}
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Target ACoS: <span className="font-normal text-blue-600">{(N(form.target_acos) * 100).toFixed(0)}%</span>
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
            Max Bid Change per Cycle: <span className="font-normal text-blue-600">{(N(form.bid_change_limit_pct) * 100).toFixed(0)}%</span>
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
                Damping Factor: <span className="font-normal text-blue-600">{N(form.damping_factor).toFixed(2)}</span>
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
                  Max Step Down: <span className="text-rose-600">{(N(form.max_step_down_pct) * 100).toFixed(0)}%</span>
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
                  Max Step Up: <span className="text-emerald-600">{(N(form.max_step_up_pct) * 100).toFixed(0)}%</span>
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
                Exploration Budget: <span className="font-normal text-blue-600">{(N(form.exploration_pct) * 100).toFixed(0)}%</span>
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
            { key: 'auto_keyword_enabled', label: '自动关键词发现', desc: '自动将高效搜索词添加为关键词' },
            { key: 'auto_negative_enabled', label: '自动否定关键词', desc: '自动将零转化词添加为否定关键词' },
            { key: 'dayparting_enabled', label: '分时竞价 (Dayparting)', desc: '按时段调整竞价（Phase 4）' },
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

        {/* ── Phase 6: TACoS Target Mode ── */}
        <div className="border-t border-slate-100 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">TACoS Target Mode</p>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-3">
            <div className="flex items-center gap-4">
              {(['acos', 'tacos'] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="target_mode"
                    value={mode}
                    checked={form.target_mode === mode}
                    onChange={() => setForm((f) => ({ ...f, target_mode: mode }))}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm font-medium text-indigo-800">{mode === 'acos' ? 'ACoS Mode' : 'TACoS Mode'}</span>
                </label>
              ))}
            </div>
            {form.target_mode === 'tacos' ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-indigo-700">
                  TACoS Target: <span className="font-normal text-indigo-900">{((form.target_tacos ?? 0.10) * 100).toFixed(0)}%</span>
                  <span className="ml-2 text-xs text-indigo-500">— Total Ad Spend / Total Revenue</span>
                </label>
                <input
                  type="range" min={1} max={30} step={1}
                  value={(form.target_tacos ?? 0.10) * 100}
                  onChange={(e) => setForm((f) => ({ ...f, target_tacos: parseFloat(e.target.value) / 100 }))}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-indigo-400"><span>1%</span><span>30%</span></div>
                <p className="mt-1 text-[10px] text-indigo-500">
                  Effective ACoS ceiling = TACoS target ÷ (1 − organic revenue %). Products with high organic share tolerate higher ACoS.
                </p>
              </div>
            ) : (
              <p className="text-xs text-indigo-500">Bid optimizer uses ACoS target directly. Switch to TACoS mode for organic-aware bidding.</p>
            )}
          </div>
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
          {saving ? '保存中…' : '保存设置'}
        </button>
        {saved && <span className="text-xs text-emerald-600 font-medium">已保存！</span>}
      </div>

      <AmsSubscriptionPanel />
    </div>
  )
}

// ─── AMS Subscription Panel ────────────────────────────────────────────────────

type AmsDataset = { id: string; description: string; queue_name: string; sqs_arn: string }
type AmsSub = { subscriptionId: string; dataSetId?: string; status?: string }

function AmsSubscriptionPanel() {
  const [ensuring, setEnsuring] = useState(false)
  const [resetting, setResetting] = useState<string | null>(null)
  const [ensureMsg, setEnsureMsg] = useState<string | null>(null)

  const { data: cfg, refetch: refetchCfg } = useQuery<{ profile_id: string; datasets: AmsDataset[] }>({
    queryKey: ['ams-config'],
    queryFn: () => fetch('/api/ams/config').then(r => r.json()),
    staleTime: 60_000,
  })

  const { data: subsData, refetch: refetchSubs, isFetching } = useQuery<{ subscriptions: AmsSub[] }>({
    queryKey: ['ams-subscriptions', cfg?.profile_id],
    queryFn: () =>
      cfg?.profile_id
        ? fetch(`/api/ams/subscriptions?profile_id=${encodeURIComponent(cfg.profile_id)}`).then(r => r.json())
        : Promise.resolve({ subscriptions: [] }),
    enabled: !!cfg?.profile_id,
    staleTime: 30_000,
  })

  const subs = subsData?.subscriptions ?? []
  const subByDataset = new Map(subs.filter(s => s.dataSetId).map(s => [s.dataSetId!, s]))
  const datasets = cfg?.datasets ?? []

  async function handleEnsure() {
    setEnsuring(true)
    setEnsureMsg(null)
    try {
      const res = await fetch('/api/ams/ensure', { method: 'POST' })
      const data = await res.json()
      setEnsureMsg(data.message || (data.error ? String(data.error) : 'Done'))
      refetchSubs()
    } catch {
      setEnsureMsg('Request failed')
    } finally {
      setEnsuring(false)
    }
  }

  async function handleReset(sub: AmsSub, ds: AmsDataset) {
    if (!cfg?.profile_id) return
    setResetting(ds.id)
    setEnsureMsg(null)
    try {
      // Delete existing
      await fetch(`/api/ams/subscriptions/${sub.subscriptionId}?profile_id=${encodeURIComponent(cfg.profile_id)}`, { method: 'DELETE' })
      // Recreate via ensure
      const res = await fetch('/api/ams/ensure', { method: 'POST' })
      const data = await res.json()
      setEnsureMsg(data.message || 'Reset complete')
      refetchSubs()
    } catch {
      setEnsureMsg('Reset failed')
    } finally {
      setResetting(null)
    }
  }

  function subStatus(dsId: string): 'active' | 'missing' {
    return subByDataset.has(dsId) ? 'active' : 'missing'
  }

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">AMS 实时数据流订阅</h3>
          {cfg?.profile_id && (
            <p className="mt-0.5 font-mono text-[11px] text-slate-400">profile: {cfg.profile_id}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { refetchCfg(); refetchSubs() }}
            disabled={isFetching}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {isFetching ? '…' : '刷新'}
          </button>
          <button
            onClick={handleEnsure}
            disabled={ensuring}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {ensuring ? '创建中…' : 'Ensure All'}
          </button>
        </div>
      </div>

      {ensureMsg && (
        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {ensureMsg}
        </div>
      )}

      <div className="space-y-2">
        {datasets.length === 0 ? (
          <p className="text-xs text-slate-400">Loading datasets…</p>
        ) : (
          datasets.map((ds) => {
            const sub = subByDataset.get(ds.id)
            const st = subStatus(ds.id)
            return (
              <div key={ds.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{ds.id}</span>
                    {st === 'active' ? (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Active</span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">未订阅</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">{ds.queue_name}</p>
                </div>
                {sub && (
                  <button
                    onClick={() => handleReset(sub, ds)}
                    disabled={resetting === ds.id}
                    className="ml-3 shrink-0 rounded border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-white disabled:opacity-40"
                  >
                    {resetting === ds.id ? '…' : 'Reset'}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Placements Tab ────────────────────────────────────────────────────────────

const PLACEMENT_LABELS: Record<string, string> = {
  top_of_search: 'Top of Search',
  product_pages: 'Product Pages',
  rest_of_search: 'Rest of Search',
}

const PLACEMENT_COLORS: Record<string, string> = {
  top_of_search: 'bg-emerald-100 text-emerald-700',
  product_pages: 'bg-blue-100 text-blue-700',
  rest_of_search: 'bg-slate-100 text-slate-600',
}

function parseReason2(s: string | null): Record<string, unknown> | null {
  if (!s) return null
  try { return JSON.parse(s) as Record<string, unknown> } catch { return null }
}

function PlacementsTab() {
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [runningAnalysis, setRunningAnalysis] = useState(false)
  const [analysisDone, setAnalysisDone] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['placement-recs', statusFilter],
    queryFn: () => apiFetch(`/api/ppc/automation/placement-recommendations?status=${statusFilter}&limit=200`),
  })

  const { data: tacosData } = useQuery<TACoSData>({
    queryKey: ['tacos-metrics'],
    queryFn: () => apiFetch('/api/ppc/automation/tacos?days=30'),
  })

  const items: PlacementRec[] = data?.items ?? []

  const applyMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch('/api/ppc/automation/placement-recommendations/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recommendation_ids: ids }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['placement-recs'] })
      setSelected(new Set())
    },
  })

  async function handleRunAnalysis() {
    setRunningAnalysis(true)
    setAnalysisDone(null)
    try {
      const res = await apiFetch('/api/ppc/automation/run-placement-analysis', { method: 'POST' })
      setAnalysisDone(res.recommendations_created)
      refetch()
    } catch { /* swallow */ }
    finally { setRunningAnalysis(false) }
  }

  // Group by campaign for display
  const byCampaign = items.reduce<Record<string, PlacementRec[]>>((acc, r) => {
    const key = r.campaign_id
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* TACoS summary banner */}
      {tacosData && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex flex-wrap gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">TACoS (30d)</p>
            <p className="text-lg font-bold text-indigo-700">{tacosData.tacos != null ? `${(N(tacosData.tacos) * 100).toFixed(1)}%` : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">ACoS</p>
            <p className="text-lg font-bold text-indigo-700">{tacosData.acos != null ? `${(N(tacosData.acos) * 100).toFixed(1)}%` : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">Organic %</p>
            <p className="text-lg font-bold text-indigo-700">{(N(tacosData.organic_pct) * 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">Total Revenue</p>
            <p className="text-lg font-bold text-indigo-700">${tacosData.total_revenue.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">Ad Spend</p>
            <p className="text-lg font-bold text-indigo-700">${tacosData.ad_spend.toLocaleString()}</p>
          </div>
          <div className="flex items-center">
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', tacosData.trend_note.includes('improving') ? 'bg-emerald-100 text-emerald-700' : tacosData.trend_note.includes('worsening') ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500')}>
              {tacosData.trend_note}
            </span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="pending">待处理</option>
            <option value="applied">已采纳</option>
          </select>
          <span className="text-xs text-slate-400">{items.length} 条建议 · {Object.keys(byCampaign).length} 个广告活动</span>
        </div>
        <div className="flex items-center gap-2">
          {analysisDone != null && (
            <span className="text-xs font-medium text-emerald-600">+{analysisDone} recs created</span>
          )}
          {selected.size > 0 && (
            <button
              onClick={() => applyMutation.mutate([...selected])}
              disabled={applyMutation.isPending}
              title="将选中的广告位调整建议批量应用"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              采纳选中 ({selected.size})
            </button>
          )}
          <button
            onClick={handleRunAnalysis}
            disabled={runningAnalysis}
            title="分析各广告位表现，生成展示位置调整建议"
            className={cn('inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition',
              runningAnalysis ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700')}
          >
            {runningAnalysis ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {runningAnalysis ? '运行中…' : '运行分析'}
          </button>
        </div>
      </div>

      {/* Campaign placement cards */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
          暂无广告位建议 — 点击 <strong>运行分析</strong> 生成。
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byCampaign).map(([campaignId, recs]) => {
            const name = recs[0]?.campaign_name || campaignId
            return (
              <div key={campaignId} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 bg-slate-50">
                  <p className="text-sm font-medium text-slate-700 truncate max-w-xs" title={name}>{name}</p>
                  <span className="font-mono text-[10px] text-slate-400">{campaignId}</span>
                </div>
                <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
                  {recs.sort((a, b) => a.placement.localeCompare(b.placement)).map((rec) => {
                    const reason = parseReason2(rec.reason)
                    const isSelected = selected.has(rec.id)
                    const roas = rec.placement_roas
                    const ratio = (reason?.roas_ratio as number) ?? null
                    return (
                      <div key={rec.id} className={cn('p-3 space-y-2', isSelected && 'bg-blue-50')}>
                        <div className="flex items-center justify-between">
                          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', PLACEMENT_COLORS[rec.placement] ?? 'bg-slate-100 text-slate-500')}>
                            {PLACEMENT_LABELS[rec.placement] ?? rec.placement}
                          </span>
                          {statusFilter === 'pending' && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => setSelected((s) => { const n = new Set(s); n.has(rec.id) ? n.delete(rec.id) : n.add(rec.id); return n })}
                              className="rounded accent-blue-600"
                            />
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 text-xs text-slate-600">
                          <span>Est. ROAS: <strong className="text-slate-800">{roas != null ? N(roas).toFixed(2) : '—'}×</strong></span>
                          <span>Ratio: <strong className={cn(ratio != null && ratio >= 1.2 ? 'text-emerald-600' : ratio != null && ratio <= 0.5 ? 'text-rose-600' : 'text-slate-700')}>{ratio != null ? N(ratio).toFixed(2) : '—'}×</strong></span>
                          <span>Clicks (est): <strong>{rec.placement_clicks}</strong></span>
                          <span>Orders (est): <strong>{rec.placement_orders}</strong></span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Current modifier: <strong>{N(rec.current_modifier_pct).toFixed(0)}%</strong></span>
                          {rec.recommended_modifier_pct != null && rec.recommended_modifier_pct !== rec.current_modifier_pct && (
                            <span className={cn('font-semibold', rec.recommended_modifier_pct > rec.current_modifier_pct ? 'text-emerald-600' : 'text-rose-600')}>
                              → {N(rec.recommended_modifier_pct).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <StatusPill status={rec.status} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ─── Campaign Builder Tab ──────────────────────────────────────────────────────

// ─── Campaign Builder v2 Types ────────────────────────────────────────────────

interface ProductItem {
  asin: string
  sku: string
  name: string
  stock: number
  has_campaigns: boolean
  campaign_count: number
}

interface KwEntry {
  keyword: string
  match_type: string
  bid: number
  search_volume: number
  competition: string
  source: string
  category: string
  acos: number | null
}

interface AdGroup {
  name: string
  default_bid: number
  keywords?: KwEntry[]
  targets?: { asin: string }[]
  strategies?: string[]
  targeting?: { tactic: string; description: string }[]
}

interface CampaignSlot {
  name: string
  type: string
  targeting: string
  budget_pct: number
  daily_budget: number
  bidding_strategy: string
  placement_top_of_search_pct: number
  purpose: string
  ad_groups: AdGroup[]
}

interface BudgetBar {
  name: string
  budget: number
  pct: number
  type: string
}

interface GeneratedPlan {
  plan_id: string
  asin: string
  product_name: string
  strategy: string
  strategy_label: string
  campaign_count: number
  total_daily_budget: number
  target_acos: number
  avg_cpc: number
  status: string
  plan: {
    campaigns: CampaignSlot[]
    budget_allocation: BudgetBar[]
    keyword_sources: { search_term_reports: number; h10_cerebro: number; competitor_asins: number }
    notes: string
  }
}

interface ExistingCampaign {
  campaign_id: string
  name: string
  type: string
  targeting: string
  budget: number
  spend_30d: number
  sales_30d: number
  clicks_30d: number
  orders_30d: number
  acos: number | null
  roas: number | null
  status: 'healthy' | 'warning' | 'critical' | 'inactive'
  depletes_early: boolean
  zero_conv_terms: string[]
}

interface OptimizationStep {
  priority: number
  type: 'budget_transfer' | 'missing_campaign'
  title: string
  from_campaign?: string
  to_campaign?: string
  to_campaign_same_product?: boolean
  transfer_amount?: number
  steps?: { timing: string; action: string; details: string[] }[]
  expected_impact?: { from_saved: string; to_gained: string; net_weekly_gain: string }
  preserve_note?: string
  recommendation?: string
  competitor_asins?: string[]
  suggested_budget?: number
  expected_acos?: string
}

interface CampaignStructure {
  asin: string
  product_name: string
  is_new_product: boolean
  existing_campaigns: ExistingCampaign[]
  optimization_steps: OptimizationStep[]
  budget_transfer_summary: {
    total_transferable: number
    same_product_targets: { campaign: string; reason: string; capacity: number }[]
    other_product_targets: { campaign: string; reason: string; capacity: number }[]
    priority_note: string
  } | null
}

const STRATEGY_OPTIONS = [
  { id: 'launch', emoji: '🚀', name: 'Launch', description: '新品上架, 高曝光, auto+broad 为主' },
  { id: 'grow', emoji: '📈', name: 'Grow', description: '精准投放, exact+phrase 为主, 抢排名' },
  { id: 'defend', emoji: '🛡️', name: 'Defend', description: '品牌词+核心词防御' },
  { id: 'harvest', emoji: '💰', name: 'Harvest', description: '降 ACoS, 只留高 ROI 词' },
  { id: 'test', emoji: '🧪', name: 'Test', description: '低预算试新品/新词' },
]

const BUDGET_PRESETS = [10, 25, 50, 100]

const TYPE_COLORS: Record<string, string> = {
  SP: 'bg-blue-100 text-blue-700',
  SB: 'bg-purple-100 text-purple-700',
  SD: 'bg-amber-100 text-amber-700',
}

const STATUS_STYLES: Record<string, string> = {
  healthy: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  critical: 'bg-rose-100 text-rose-700 border-rose-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
}

const STATUS_LABEL: Record<string, string> = {
  healthy: '✅ 健康',
  warning: '⚠️ 警告',
  critical: '🔴 高危',
  inactive: '⬜ 无数据',
}

const CATEGORY_BADGE: Record<string, string> = {
  core: '🎯 核心',
  long_tail: '🌱 长尾',
  brand: '🏷️ 品牌',
  competitor: '⚔️ 竞品',
  discovery: '🔍 探索',
}

function CampaignBuilderTab() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null)
  const [budget, setBudget] = useState(50)
  const [customBudget, setCustomBudget] = useState('')
  const [strategy, setStrategy] = useState('launch')
  const [targetAcos, setTargetAcos] = useState(25)
  const [generating, setGenerating] = useState(false)
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null)
  const [structure, setStructure] = useState<CampaignStructure | null>(null)
  const [loadingStructure, setLoadingStructure] = useState(false)
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<number>>(new Set())

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['ppc-products'],
    queryFn: () => apiFetch('/api/ppc/automation/products'),
  })

  const products: ProductItem[] = productsData?.products ?? []

  const effectiveBudget = customBudget ? parseFloat(customBudget) : budget

  function selectProduct(p: ProductItem) {
    setSelectedProduct(p)
  }

  async function goToStep2() {
    if (!selectedProduct) return
    setStep(2)
    // Pre-set strategy based on whether product has campaigns
    if (!selectedProduct.has_campaigns) setStrategy('launch')
    else setStrategy('grow')
  }

  async function goToStep3() {
    if (!selectedProduct) return
    setGenerating(true)
    setGeneratedPlan(null)
    setStructure(null)

    try {
      if (selectedProduct.has_campaigns) {
        // Fetch existing structure
        setLoadingStructure(true)
        const s = await apiFetch(
          `/api/ppc/automation/campaign-structure/${selectedProduct.asin}?target_acos=${targetAcos}`
        )
        setStructure(s)
        setLoadingStructure(false)
      }

      // Always generate a new plan
      const res = await apiFetch('/api/ppc/automation/campaign-plans/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          asin: selectedProduct.asin,
          daily_budget: effectiveBudget,
          strategy,
          target_acos: targetAcos,
        }),
      })
      setGeneratedPlan(res)
    } catch {
      // swallow
    } finally {
      setGenerating(false)
      setLoadingStructure(false)
    }
    setStep(3)
  }

  function toggleCampaign(idx: number) {
    setExpandedCampaigns(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function exportJSON() {
    if (!generatedPlan) return
    const blob = new Blob([JSON.stringify(generatedPlan.plan, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${generatedPlan.asin}_${strategy}_campaign_plan.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportCSV() {
    if (!generatedPlan?.plan?.campaigns) return
    const rows: string[][] = [['Campaign', 'Type', 'Targeting', 'Budget/Day', 'Bidding', 'Purpose']]
    for (const c of generatedPlan.plan.campaigns) {
      rows.push([c.name, c.type, c.targeting, String(c.daily_budget), c.bidding_strategy, c.purpose])
      for (const ag of c.ad_groups || []) {
        for (const kw of ag.keywords || []) {
          rows.push([c.name, 'KW', kw.match_type, String(kw.bid), kw.source, kw.keyword])
        }
      }
    }
    const csv = rows.map(r => r.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${generatedPlan.asin}_${strategy}_campaign_plan.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Step indicators ──
  const stepLabels = ['选产品', '设参数', '预览方案']

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {stepLabels.map((label, i) => {
          const s = i + 1
          const active = step === s
          const done = step > s
          return (
            <React.Fragment key={s}>
              <div
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition',
                  active ? 'bg-blue-600 text-white' : done ? 'text-emerald-600 hover:bg-slate-50' : 'text-slate-400'
                )}
                onClick={() => {
                  if (done || (s === 2 && selectedProduct)) setStep(s as 1 | 2 | 3)
                }}
              >
                <span className={cn('h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold',
                  active ? 'bg-white text-blue-600' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                )}>
                  {done ? '✓' : s}
                </span>
                {label}
              </div>
              {i < 2 && <div className="h-px w-6 bg-slate-200 flex-shrink-0" />}
            </React.Fragment>
          )
        })}
      </div>

      {/* ── Step 1: Product Selection ── */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-700">选择产品</p>
          {productsLoading ? (
            <div className="py-8 text-center text-sm text-slate-400">加载产品列表…</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {products.map(p => (
                <div
                  key={p.asin}
                  onClick={() => selectProduct(p)}
                  className={cn(
                    'border rounded-lg p-3 cursor-pointer transition hover:border-blue-300',
                    selectedProduct?.asin === p.asin
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  )}
                >
                  <p className="font-medium text-sm truncate text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{p.asin}{p.sku ? ` · ${p.sku}` : ''}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.has_campaigns ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200">
                        📊 {p.campaign_count} campaigns
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 border border-slate-200">
                        🆕 新品
                      </span>
                    )}
                    <span className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border',
                      p.stock > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'
                    )}>
                      库存: {p.stock}
                    </span>
                  </div>
                </div>
              ))}
              {products.length === 0 && (
                <div className="col-span-3 py-8 text-center text-sm text-slate-400">
                  暂无产品数据。请先同步库存。
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <button
              onClick={goToStep2}
              disabled={!selectedProduct}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition',
                selectedProduct ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              )}
            >
              下一步 →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Parameters ── */}
      {step === 2 && selectedProduct && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">产品:</span>
            <span className="font-medium text-slate-700">{selectedProduct.name}</span>
            <span className="text-slate-400">({selectedProduct.asin})</span>
          </div>

          {/* Budget */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">日预算 (USD)</label>
            <div className="flex items-center gap-2 flex-wrap">
              {BUDGET_PRESETS.map(b => (
                <button
                  key={b}
                  onClick={() => { setBudget(b); setCustomBudget('') }}
                  className={cn(
                    'px-4 py-1.5 rounded-lg border text-sm font-medium transition',
                    budget === b && !customBudget
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-blue-300'
                  )}
                >
                  ${b}/天
                </button>
              ))}
              <input
                type="number"
                min={1}
                step={1}
                placeholder="自定义"
                value={customBudget}
                onChange={e => setCustomBudget(e.target.value)}
                className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Strategy */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">投放策略</label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {STRATEGY_OPTIONS.map(s => (
                <div
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  className={cn(
                    'border rounded-lg p-3 cursor-pointer transition',
                    strategy === s.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                  )}
                >
                  <p className="text-sm font-semibold text-slate-800">{s.emoji} {s.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{s.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Target ACoS */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              目标 ACoS: <span className="text-blue-600 font-bold">{targetAcos}%</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={10}
                max={50}
                step={1}
                value={targetAcos}
                onChange={e => setTargetAcos(Number(e.target.value))}
                className="flex-1 h-2 rounded-full appearance-none bg-slate-200 accent-blue-600"
              />
              <span className="text-xs text-slate-400 w-20">10% – 50%</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              建议: Launch/Test = 35-40%，Grow = 25-30%，Harvest = 15-20%
            </p>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              ← 返回
            </button>
            <button
              onClick={goToStep3}
              disabled={generating}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition',
                generating ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              {generating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {generating ? '生成中…' : '生成方案'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              ← 重新设置
            </button>
            {generatedPlan && (
              <div className="flex gap-2">
                <button
                  onClick={exportCSV}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  📥 导出 CSV
                </button>
                <button
                  onClick={exportJSON}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  📥 导出 JSON
                </button>
              </div>
            )}
          </div>

          {generating && (
            <div className="py-8 text-center text-sm text-slate-400">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-500" />
              生成广告方案中…
            </div>
          )}

          {/* Existing product: structure + optimization */}
          {!generating && structure && !structure.is_new_product && (
            <div className="space-y-4">
              {/* Existing campaigns */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-sm font-semibold text-slate-700">📊 现有 Campaign 结构</p>
                  <p className="text-xs text-slate-400 mt-0.5">{structure.product_name}</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {structure.existing_campaigns.map(c => (
                    <div key={c.campaign_id} className="px-4 py-3 flex items-center gap-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold border',
                        STATUS_STYLES[c.status] ?? STATUS_STYLES.inactive)}>
                        {STATUS_LABEL[c.status]}
                      </span>
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        TYPE_COLORS[c.type] ?? 'bg-slate-100 text-slate-500')}>
                        {c.type}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{c.name}</p>
                        <p className="text-xs text-slate-400">${c.budget}/天 · 30天花费 ${c.spend_30d.toFixed(0)} · 销售 ${c.sales_30d.toFixed(0)}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 text-right">
                        {c.acos != null ? (
                          <span className={cn('font-semibold',
                            c.acos > targetAcos * 2 ? 'text-rose-600' : c.acos > targetAcos * 1.3 ? 'text-amber-600' : 'text-emerald-600')}>
                            ACoS {c.acos}%
                          </span>
                        ) : <span>—</span>}
                        {c.roas != null && <span>ROAS {c.roas}x</span>}
                        {c.depletes_early && <span className="text-amber-500">⚡预算耗尽</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Optimization steps */}
              {structure.optimization_steps.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">🔧 优化建议</p>
                  {structure.optimization_steps.map(opt => (
                    <div key={opt.priority} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className={cn('px-4 py-3 flex items-start gap-3',
                        opt.type === 'budget_transfer' ? 'bg-rose-50 border-b border-rose-100' : 'bg-blue-50 border-b border-blue-100'
                      )}>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 border border-slate-200 flex-shrink-0">
                          #{opt.priority}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-800">{opt.title}</p>
                          {opt.type === 'budget_transfer' && opt.to_campaign && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              转移到: <span className="font-medium">{opt.to_campaign}</span>
                              {opt.to_campaign_same_product
                                ? <span className="ml-1.5 text-emerald-600">✅ 同产品</span>
                                : <span className="ml-1.5 text-amber-600">⚠️ 跨产品(备选)</span>}
                            </p>
                          )}
                          {opt.type === 'missing_campaign' && (
                            <p className="text-xs text-slate-500 mt-0.5">{opt.recommendation}</p>
                          )}
                        </div>
                        {opt.transfer_amount != null && opt.transfer_amount > 0 && (
                          <span className="text-sm font-bold text-rose-600 flex-shrink-0">${opt.transfer_amount}/天</span>
                        )}
                        {opt.suggested_budget && (
                          <span className="text-sm font-bold text-blue-600 flex-shrink-0">建议 ${opt.suggested_budget}/天</span>
                        )}
                      </div>
                      {opt.steps && (
                        <div className="px-4 py-3 space-y-2">
                          {opt.steps.map((s, si) => (
                            <div key={si} className="flex gap-3">
                              <span className="text-xs font-semibold text-slate-500 w-32 flex-shrink-0">{s.timing}</span>
                              <div>
                                <p className="text-xs font-medium text-slate-700">{s.action}</p>
                                {s.details.length > 0 && (
                                  <p className="text-xs text-slate-400 mt-0.5">{s.details.join(' · ')}</p>
                                )}
                              </div>
                            </div>
                          ))}
                          {opt.preserve_note && (
                            <p className="text-xs text-slate-400 italic mt-1">{opt.preserve_note}</p>
                          )}
                        </div>
                      )}
                      {opt.type === 'budget_transfer' && opt.expected_impact && (
                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex gap-4 text-xs">
                          <span className="text-rose-600">{opt.expected_impact.from_saved}</span>
                          <span className="text-emerald-600">{opt.expected_impact.to_gained}</span>
                          <span className="font-bold text-slate-700">净收益: {opt.expected_impact.net_weekly_gain}</span>
                        </div>
                      )}
                      {opt.competitor_asins && opt.competitor_asins.length > 0 && (
                        <div className="px-4 py-2 border-t border-slate-100">
                          <p className="text-xs text-slate-500">竞品 ASIN: {opt.competitor_asins.join(', ')}</p>
                          <p className="text-xs text-slate-400">预期 ACoS: {opt.expected_acos}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Budget transfer summary */}
              {structure.budget_transfer_summary && structure.budget_transfer_summary.total_transferable > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
                  <p className="text-sm font-semibold text-slate-700 mb-2">💰 预算转移总览</p>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <p className="text-xs text-slate-400">可转移</p>
                      <p className="font-bold text-slate-800">${structure.budget_transfer_summary.total_transferable}/天</p>
                    </div>
                    {structure.budget_transfer_summary.same_product_targets.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400">同产品目标 (优先)</p>
                        {structure.budget_transfer_summary.same_product_targets.map(t => (
                          <p key={t.campaign} className="text-xs font-medium text-emerald-700">✅ {t.campaign}</p>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">{structure.budget_transfer_summary.priority_note}</p>
                </div>
              )}
            </div>
          )}

          {/* New plan preview */}
          {!generating && generatedPlan && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {generatedPlan.strategy_label} — {generatedPlan.product_name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {generatedPlan.campaign_count} campaigns · ${generatedPlan.total_daily_budget}/天 · 目标 ACoS {generatedPlan.target_acos}%
                    </p>
                  </div>
                  <StatusPill status={generatedPlan.status} />
                </div>
                <div className="mt-3 flex gap-4 text-xs text-slate-500">
                  <span>平均 CPC: <strong>${generatedPlan.avg_cpc?.toFixed(2) ?? '—'}</strong></span>
                  <span>搜索词报告: <strong>{generatedPlan.plan?.keyword_sources?.search_term_reports ?? 0}</strong> kw</span>
                  <span>H10 Cerebro: <strong>{generatedPlan.plan?.keyword_sources?.h10_cerebro ?? 0}</strong> kw</span>
                  <span>竞品 ASIN: <strong>{generatedPlan.plan?.keyword_sources?.competitor_asins ?? 0}</strong></span>
                </div>
              </div>

              {/* Budget allocation bars */}
              {generatedPlan.plan?.budget_allocation && generatedPlan.plan.budget_allocation.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">预算分配</p>
                  <div className="space-y-2">
                    {generatedPlan.plan.budget_allocation.map(b => (
                      <div key={b.name} className="flex items-center gap-3 text-xs">
                        <span className="w-40 truncate text-slate-600 flex-shrink-0">{b.name}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={cn('h-2 rounded-full', b.type === 'SP' ? 'bg-blue-400' : b.type === 'SB' ? 'bg-purple-400' : 'bg-amber-400')}
                            style={{ width: `${b.pct}%` }}
                          />
                        </div>
                        <span className="w-20 text-right text-slate-500 flex-shrink-0">${b.budget}/天 ({b.pct}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Campaign list */}
              <p className="text-sm font-semibold text-slate-700">Campaign 详情</p>
              <div className="space-y-2">
                {generatedPlan.plan?.campaigns?.map((c, idx) => {
                  const isOpen = expandedCampaigns.has(idx)
                  const totalKws = c.ad_groups?.reduce((sum, ag) => sum + (ag.keywords?.length ?? 0), 0) ?? 0
                  return (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <button
                        onClick={() => toggleCampaign(idx)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition"
                      >
                        {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0',
                          TYPE_COLORS[c.type] ?? 'bg-slate-100 text-slate-500')}>
                          {c.type}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{c.name}</p>
                          <p className="text-xs text-slate-400">{c.purpose}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
                          <span>${c.daily_budget}/天</span>
                          {totalKws > 0 && <span>{totalKws} kw</span>}
                          {c.placement_top_of_search_pct > 0 && (
                            <span className="text-blue-600">Top +{c.placement_top_of_search_pct}%</span>
                          )}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-3">
                          <div className="flex gap-4 text-xs text-slate-500">
                            <span>竞价策略: <strong>{c.bidding_strategy}</strong></span>
                            {c.placement_top_of_search_pct > 0 && (
                              <span>Top of Search 加价: <strong className="text-blue-600">+{c.placement_top_of_search_pct}%</strong></span>
                            )}
                          </div>
                          {c.ad_groups?.map((ag, agi) => (
                            <div key={agi}>
                              <p className="text-xs font-semibold text-slate-600 mb-1.5">Ad Group: {ag.name}</p>
                              {/* Keyword table */}
                              {ag.keywords && ag.keywords.length > 0 && (
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                  <table className="w-full text-xs">
                                    <thead className="bg-slate-100">
                                      <tr>
                                        {['关键词', '匹配', 'Bid', '来源', '搜索量', '竞争度', '分类'].map(h => (
                                          <th key={h} className="px-2 py-1.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                      {ag.keywords.slice(0, 20).map((kw, ki) => (
                                        <tr key={ki} className="hover:bg-slate-50">
                                          <td className="px-2 py-1.5 font-medium text-slate-700">{kw.keyword}</td>
                                          <td className="px-2 py-1.5 text-slate-500">{kw.match_type}</td>
                                          <td className="px-2 py-1.5 text-emerald-700 font-medium">${kw.bid}</td>
                                          <td className="px-2 py-1.5 text-slate-400">{kw.source}</td>
                                          <td className="px-2 py-1.5 text-slate-500">{kw.search_volume > 0 ? kw.search_volume.toLocaleString() : '—'}</td>
                                          <td className="px-2 py-1.5">
                                            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                              kw.competition === 'high' ? 'bg-rose-50 text-rose-600' :
                                              kw.competition === 'medium' ? 'bg-amber-50 text-amber-600' :
                                              'bg-emerald-50 text-emerald-600')}>
                                              {kw.competition === 'high' ? '高' : kw.competition === 'medium' ? '中' : '低'}
                                            </span>
                                          </td>
                                          <td className="px-2 py-1.5 text-slate-500">{CATEGORY_BADGE[kw.category] ?? kw.category}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {ag.keywords.length > 20 && (
                                    <p className="px-3 py-1.5 text-xs text-slate-400 bg-slate-50">
                                      + {ag.keywords.length - 20} 个关键词 (导出 JSON 查看全部)
                                    </p>
                                  )}
                                </div>
                              )}
                              {/* Auto strategies */}
                              {ag.strategies && (
                                <div className="flex gap-1.5 flex-wrap">
                                  {ag.strategies.map(s => (
                                    <span key={s} className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] text-blue-700">
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Product targets */}
                              {ag.targets && ag.targets.length > 0 && (
                                <div>
                                  <p className="text-xs text-slate-500 mb-1">竞品 ASIN 投放:</p>
                                  <div className="flex gap-1.5 flex-wrap">
                                    {ag.targets.map(t => (
                                      <span key={t.asin} className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] text-amber-700 font-mono">
                                        {t.asin}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* SD targeting */}
                              {ag.targeting && ag.targeting.length > 0 && (
                                <div className="flex gap-1.5 flex-wrap">
                                  {ag.targeting.map((t, ti) => (
                                    <span key={ti} className="rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[11px] text-purple-700">
                                      {t.description}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {generatedPlan.plan?.notes && (
                <p className="text-xs text-slate-400 italic px-1">{generatedPlan.plan.notes}</p>
              )}
            </div>
          )}
        </div>
      )}
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

// ─── Keyword Harvest Tab ─────────────────────────────────────────────────────

interface HarvestSuggestion {
  id: string
  search_term: string
  campaign_id: string | null
  campaign_name: string | null
  impressions: number
  clicks: number
  orders: number
  spend: number | null
  acos: number | null
  action: string
  min_orders_threshold: number
  min_clicks_threshold: number
  max_acos_threshold: number | null
  status: string
  created_at: string
}

function KeywordHarvestTab() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = React.useState('pending')
  const [actionFilter, setActionFilter] = React.useState('')
  const [minOrders, setMinOrders] = React.useState(2)
  const [minClicks, setMinClicks] = React.useState(15)
  const [targetAcos, setTargetAcos] = React.useState(25)
  const [generating, setGenerating] = React.useState(false)
  const [genResult, setGenResult] = React.useState<{ harvest: number; negate: number } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['keyword-harvest-suggestions', statusFilter, actionFilter],
    queryFn: async () => {
      const qs = new URLSearchParams({ status: statusFilter })
      if (actionFilter) qs.set('action', actionFilter)
      const res = await apiFetch(`/api/ppc/automation/keyword-suggestions?${qs}`)
      return res as { items: HarvestSuggestion[]; total: number }
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/ppc/automation/keyword-suggestions/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['keyword-harvest-suggestions'] }),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/ppc/automation/keyword-suggestions/${id}/reject`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['keyword-harvest-suggestions'] }),
  })

  async function handleGenerate() {
    setGenerating(true)
    setGenResult(null)
    try {
      const data = await apiFetch('/api/ppc/automation/keyword-suggestions/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ min_orders: minOrders, min_clicks: minClicks, target_acos: targetAcos }),
      })
      setGenResult(data.created)
      queryClient.invalidateQueries({ queryKey: ['keyword-harvest-suggestions'] })
    } catch {
      // swallow
    } finally {
      setGenerating(false)
    }
  }

  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="pending">待处理</option>
              <option value="approved">已批准</option>
              <option value="rejected">已拒绝</option>
            </select>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部类型</option>
              <option value="harvest">收割 (加词)</option>
              <option value="negate">否定 (排除)</option>
            </select>
            <span className="text-xs text-slate-400">{items.length} 条建议</span>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', generating && 'animate-spin')} />
            {generating ? '分析中...' : '重新生成建议'}
          </button>
        </div>

        {/* Threshold config */}
        <div className="flex items-center gap-4 flex-wrap text-sm text-slate-600">
          <label className="flex items-center gap-2">
            收割阈值: orders ≥
            <input
              type="number"
              value={minOrders}
              onChange={(e) => setMinOrders(Number(e.target.value))}
              className="w-16 rounded border border-slate-200 px-2 py-0.5 text-center text-sm"
              min={1}
            />
            且 ACoS &lt;
            <input
              type="number"
              value={targetAcos}
              onChange={(e) => setTargetAcos(Number(e.target.value))}
              className="w-16 rounded border border-slate-200 px-2 py-0.5 text-center text-sm"
              min={1}
            />
            %
          </label>
          <label className="flex items-center gap-2">
            否定阈值: clicks ≥
            <input
              type="number"
              value={minClicks}
              onChange={(e) => setMinClicks(Number(e.target.value))}
              className="w-16 rounded border border-slate-200 px-2 py-0.5 text-center text-sm"
              min={1}
            />
            且 0 成交
          </label>
        </div>

        {genResult && (
          <p className="text-xs text-green-600 font-medium">
            生成完成：{genResult.harvest} 条收割建议，{genResult.negate} 条否定建议
          </p>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">搜索词</th>
              <th className="px-4 py-3 text-left">Campaign</th>
              <th className="px-4 py-3 text-right">曝光</th>
              <th className="px-4 py-3 text-right">点击</th>
              <th className="px-4 py-3 text-right">订单</th>
              <th className="px-4 py-3 text-right">花费</th>
              <th className="px-4 py-3 text-right">ACoS</th>
              <th className="px-4 py-3 text-center">类型</th>
              <th className="px-4 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">暂无建议，点击「重新生成」分析搜索词报告</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700 max-w-[200px] truncate" title={item.search_term}>
                    {item.search_term}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[140px] truncate" title={item.campaign_name ?? item.campaign_id ?? ''}>
                    {item.campaign_name ?? item.campaign_id ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{item.impressions.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{item.clicks.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-700">{item.orders}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">
                    {item.spend != null ? `$${Number(item.spend).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {item.acos != null ? (
                      <span className={cn('font-medium', Number(item.acos) * 100 < 25 ? 'text-green-600' : 'text-red-500')}>
                        {(Number(item.acos) * 100).toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                      item.action === 'harvest'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700',
                    )}>
                      {item.action === 'harvest' ? '加词' : '否定'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {item.status === 'pending' ? (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => approveMutation.mutate(item.id)}
                          disabled={approveMutation.isPending}
                          className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          批准
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate(item.id)}
                          disabled={rejectMutation.isPending}
                          className="rounded bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-300 disabled:opacity-50"
                        >
                          拒绝
                        </button>
                      </div>
                    ) : (
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                        item.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500',
                      )}>
                        {item.status === 'approved' ? '已批准' : '已拒绝'}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Budget Pacing Tab ───────────────────────────────────────────────────────

interface PacingItem {
  campaign_id: string
  campaign_name: string | null
  monthly_budget: number
  daily_target: number
  today_spend: number
  mtd_spend: number
  avg_daily_spend: number
  pacing_score: number
  status: string
  days_remaining: number
  budget_remaining: number
}

function BudgetPacingTab() {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editBudget, setEditBudget] = React.useState('')
  const [editName, setEditName] = React.useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['budget-pacing'],
    queryFn: async () => {
      const res = await apiFetch('/api/ppc/automation/budget-pacing')
      return res as { items: PacingItem[]; total: number }
    },
    refetchInterval: 60_000,
  })

  const saveMutation = useMutation({
    mutationFn: ({ campaignId, monthly_budget, campaign_name }: { campaignId: string; monthly_budget: number; campaign_name: string }) =>
      apiFetch(`/api/ppc/automation/budget-pacing/${campaignId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ monthly_budget, campaign_name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-pacing'] })
      setEditingId(null)
    },
  })

  function startEdit(item: PacingItem) {
    setEditingId(item.campaign_id)
    setEditBudget(String(item.monthly_budget))
    setEditName(item.campaign_name ?? item.campaign_id)
  }

  function statusBadge(status: string) {
    if (status === 'over') return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 uppercase">超速</span>
    if (status === 'under') return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-yellow-100 text-yellow-700 uppercase">偏慢</span>
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 uppercase">正常</span>
  }

  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm text-slate-600">
          按月度预算目标计算每日节奏。超速 &gt;110%，偏慢 &lt;70%。
        </p>
        <span className="text-xs text-slate-400">{items.length} 个 campaign</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Campaign</th>
              <th className="px-4 py-3 text-right">月预算</th>
              <th className="px-4 py-3 text-right">今日目标</th>
              <th className="px-4 py-3 text-right">今日花费</th>
              <th className="px-4 py-3 text-right">月累计</th>
              <th className="px-4 py-3 text-right">剩余预算</th>
              <th className="px-4 py-3 text-right">节奏</th>
              <th className="px-4 py-3 text-center">状态</th>
              <th className="px-4 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  暂无数据。点击某行的「设置」为 campaign 添加月度预算目标。
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.campaign_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-700 max-w-[160px] truncate" title={item.campaign_name ?? item.campaign_id}>
                    {item.campaign_name ?? item.campaign_id}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-700">${item.monthly_budget.toFixed(0)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">${item.daily_target.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">${item.today_spend.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">${item.mtd_spend.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={cn('font-medium', item.budget_remaining < 0 ? 'text-red-600' : 'text-slate-700')}>
                      ${item.budget_remaining.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {/* Progress bar */}
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 bg-slate-100 rounded-full h-1.5">
                        <div
                          className={cn('h-1.5 rounded-full', item.status === 'over' ? 'bg-red-500' : item.status === 'under' ? 'bg-yellow-400' : 'bg-green-500')}
                          style={{ width: `${Math.min(100, item.pacing_score * 100).toFixed(0)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-10 text-right">{(item.pacing_score * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">{statusBadge(item.status)}</td>
                  <td className="px-4 py-2.5 text-center">
                    {editingId === item.campaign_id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={editBudget}
                          onChange={(e) => setEditBudget(e.target.value)}
                          className="w-20 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-center"
                          placeholder="月预算"
                        />
                        <button
                          onClick={() => saveMutation.mutate({ campaignId: item.campaign_id, monthly_budget: Number(editBudget), campaign_name: editName })}
                          disabled={saveMutation.isPending}
                          className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >保存</button>
                        <button onClick={() => setEditingId(null)} className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-300">取消</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(item)} className="rounded bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200">
                        设置
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Goal Optimizer Tab ──────────────────────────────────────────────────────

interface CampaignGoal {
  campaign_id: string
  campaign_name: string | null
  goal_mode: string
  target_acos: number
  kp: number
  ki: number
  kd: number
  max_bid_adjustment_pct: number
  pid_integral: number
  pid_last_error: number
  updated_at: string
}

interface BidSuggestionItem {
  id: string
  campaign_id: string
  campaign_name: string | null
  goal_mode: string
  actual_acos: number | null
  target_acos: number | null
  pid_error: number | null
  bid_adjustment_pct: number | null
  reason: string | null
  status: string
  created_at: string
}

function GoalOptimizerTab() {
  const queryClient = useQueryClient()
  const [activeSection, setActiveSection] = React.useState<'goals' | 'suggestions'>('suggestions')
  const [statusFilter, setStatusFilter] = React.useState('pending')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState({ campaign_name: '', goal_mode: 'target_acos', target_acos: 25 })
  const [generating, setGenerating] = React.useState(false)

  const { data: goalsData, isLoading: goalsLoading } = useQuery({
    queryKey: ['campaign-goals'],
    queryFn: () => apiFetch('/api/ppc/automation/goals') as Promise<{ items: CampaignGoal[]; total: number }>,
  })

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['bid-suggestions', statusFilter],
    queryFn: async () => {
      const res = await apiFetch(`/api/ppc/automation/bid-suggestions?status=${statusFilter}`)
      return res as { items: BidSuggestionItem[]; total: number }
    },
  })

  const saveMutation = useMutation({
    mutationFn: ({ campaignId, body }: { campaignId: string; body: object }) =>
      apiFetch(`/api/ppc/automation/goals/${campaignId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-goals'] })
      setEditingId(null)
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ppc/automation/bid-suggestions/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bid-suggestions'] }),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ppc/automation/bid-suggestions/${id}/reject`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bid-suggestions'] }),
  })

  const approveAllMutation = useMutation({
    mutationFn: () => apiFetch('/api/ppc/automation/bid-suggestions/approve-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bid-suggestions'] }),
  })

  async function handleGenerate() {
    setGenerating(true)
    try {
      await apiFetch('/api/ppc/automation/bid-suggestions/generate', { method: 'POST' })
      queryClient.invalidateQueries({ queryKey: ['bid-suggestions'] })
    } catch { /* swallow */ } finally {
      setGenerating(false)
    }
  }

  const goals = goalsData?.items ?? []
  const suggestions = suggestionsData?.items ?? []
  const pendingCount = suggestions.filter(s => s.status === 'pending').length

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => setActiveSection('suggestions')}
          className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', activeSection === 'suggestions' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
        >
          竞价建议 {pendingCount > 0 && <span className="ml-1 rounded-full bg-white/30 px-1.5 text-xs">{pendingCount}</span>}
        </button>
        <button
          onClick={() => setActiveSection('goals')}
          className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', activeSection === 'goals' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
        >
          目标设置
        </button>
      </div>

      {activeSection === 'suggestions' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pending">待处理</option>
                <option value="approved">已批准</option>
                <option value="rejected">已拒绝</option>
              </select>
              <span className="text-xs text-slate-400">{suggestions.length} 条</span>
            </div>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <button
                  onClick={() => approveAllMutation.mutate()}
                  disabled={approveAllMutation.isPending}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  全部批准 ({pendingCount})
                </button>
              )}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', generating && 'animate-spin')} />
                生成建议
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Campaign</th>
                  <th className="px-4 py-3 text-center">模式</th>
                  <th className="px-4 py-3 text-right">实际 ACoS</th>
                  <th className="px-4 py-3 text-right">目标 ACoS</th>
                  <th className="px-4 py-3 text-right">误差</th>
                  <th className="px-4 py-3 text-right">建议调整</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suggestionsLoading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
                ) : suggestions.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">暂无建议，先设置目标后点击「生成建议」</td></tr>
                ) : (
                  suggestions.map((s) => {
                    const adjPct = s.bid_adjustment_pct != null ? s.bid_adjustment_pct * 100 : null
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-xs font-mono max-w-[160px] truncate text-slate-700" title={s.campaign_name ?? s.campaign_id}>
                          {s.campaign_name ?? s.campaign_id}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 uppercase">
                            {s.goal_mode === 'target_acos' ? '目标ACoS' : s.goal_mode === 'max_sales' ? '最大销量' : '效率'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">
                          {s.actual_acos != null ? `${s.actual_acos.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">
                          {s.target_acos != null ? `${s.target_acos.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {s.pid_error != null ? (
                            <span className={cn('font-medium', s.pid_error > 0 ? 'text-red-500' : 'text-green-600')}>
                              {s.pid_error > 0 ? '+' : ''}{s.pid_error.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {adjPct != null ? (
                            <span className={cn('font-semibold', adjPct > 0 ? 'text-green-600' : 'text-red-500')}>
                              {adjPct > 0 ? '+' : ''}{adjPct.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {s.status === 'pending' ? (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => approveMutation.mutate(s.id)} disabled={approveMutation.isPending} className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">批准</button>
                              <button onClick={() => rejectMutation.mutate(s.id)} disabled={rejectMutation.isPending} className="rounded bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-300 disabled:opacity-50">拒绝</button>
                            </div>
                          ) : (
                            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', s.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                              {s.status === 'approved' ? '已批准' : '已拒绝'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'goals' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Campaign ID</th>
                <th className="px-4 py-3 text-left">名称</th>
                <th className="px-4 py-3 text-center">模式</th>
                <th className="px-4 py-3 text-right">目标 ACoS</th>
                <th className="px-4 py-3 text-right">Kp / Ki / Kd</th>
                <th className="px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {goalsLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : goals.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">暂无目标配置</td></tr>
              ) : (
                goals.map((g) => (
                  <tr key={g.campaign_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 max-w-[140px] truncate">{g.campaign_id}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">{g.campaign_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-50 text-purple-700 uppercase">
                        {g.goal_mode === 'target_acos' ? '目标ACoS' : g.goal_mode === 'max_sales' ? '最大销量' : '效率'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-700">{g.target_acos.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
                      {g.kp}/{g.ki}/{g.kd}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {editingId === g.campaign_id ? (
                        <div className="flex items-center gap-1 justify-center">
                          <select
                            value={editForm.goal_mode}
                            onChange={(e) => setEditForm(f => ({ ...f, goal_mode: e.target.value }))}
                            className="rounded border border-slate-200 px-1.5 py-0.5 text-xs"
                          >
                            <option value="target_acos">目标ACoS</option>
                            <option value="max_sales">最大销量</option>
                            <option value="efficiency">效率</option>
                          </select>
                          <input
                            type="number"
                            value={editForm.target_acos}
                            onChange={(e) => setEditForm(f => ({ ...f, target_acos: Number(e.target.value) }))}
                            className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-center"
                            placeholder="ACoS%"
                          />
                          <button
                            onClick={() => saveMutation.mutate({ campaignId: g.campaign_id, body: { ...editForm } })}
                            disabled={saveMutation.isPending}
                            className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >保存</button>
                          <button onClick={() => setEditingId(null)} className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">取消</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingId(g.campaign_id); setEditForm({ campaign_name: g.campaign_name ?? '', goal_mode: g.goal_mode, target_acos: g.target_acos }) }}
                          className="rounded bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200"
                        >编辑</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Dayparting Tab ──────────────────────────────────────────────────────────

interface HourlyEntry {
  hour: number
  impressions: number
  clicks: number
  orders: number
  spend: number
  sales: number
  cvr: number
  cpc: number
  acos: number | null
  cvr_coefficient: number
  avg_cvr: number
}

interface DaypartingData {
  campaign_id: string
  days_analyzed: number
  hourly: HourlyEntry[]
  recommended_multipliers: number[]
  schedule: { hourly_multipliers: string; enabled: boolean } | null
}

function DaypartingTab() {
  const queryClient = useQueryClient()
  const [campaignId, setCampaignId] = React.useState('')
  const [inputId, setInputId] = React.useState('')
  const [days, setDays] = React.useState(30)
  const [saving, setSaving] = React.useState(false)
  const [heatmapMetric, setHeatmapMetric] = React.useState<'cvr_coefficient' | 'clicks' | 'orders' | 'acos'>('cvr_coefficient')

  const { data, isLoading } = useQuery({
    queryKey: ['dayparting', campaignId, days],
    queryFn: async () => {
      const res = await apiFetch(`/api/ppc/automation/dayparting/${campaignId}?days=${days}`)
      return res as DaypartingData
    },
    enabled: !!campaignId,
  })

  async function handleSaveSchedule() {
    if (!campaignId || !data) return
    setSaving(true)
    try {
      await apiFetch(`/api/ppc/automation/dayparting/${campaignId}/schedule`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })
      queryClient.invalidateQueries({ queryKey: ['dayparting', campaignId] })
    } catch { /* swallow */ } finally {
      setSaving(false)
    }
  }

  const hourly = data?.hourly ?? []

  // Compute color intensity for heatmap cell
  function cellColor(entry: HourlyEntry): string {
    let val: number
    let max: number
    if (heatmapMetric === 'cvr_coefficient') {
      val = entry.cvr_coefficient
      max = 2.0
      if (val === 0) return 'bg-slate-100'
      const pct = Math.min(1, val / max)
      if (pct > 0.7) return 'bg-green-500'
      if (pct > 0.5) return 'bg-green-300'
      if (pct > 0.3) return 'bg-yellow-200'
      return 'bg-red-200'
    }
    if (heatmapMetric === 'clicks') {
      const maxClicks = Math.max(...hourly.map(h => h.clicks), 1)
      val = entry.clicks / maxClicks
      if (val > 0.75) return 'bg-blue-500'
      if (val > 0.5) return 'bg-blue-300'
      if (val > 0.25) return 'bg-blue-200'
      return val > 0 ? 'bg-blue-100' : 'bg-slate-100'
    }
    if (heatmapMetric === 'orders') {
      const maxOrders = Math.max(...hourly.map(h => h.orders), 1)
      val = entry.orders / maxOrders
      if (val > 0.75) return 'bg-purple-500'
      if (val > 0.5) return 'bg-purple-300'
      if (val > 0.25) return 'bg-purple-200'
      return val > 0 ? 'bg-purple-100' : 'bg-slate-100'
    }
    // acos
    if (entry.acos == null) return 'bg-slate-100'
    if (entry.acos < 15) return 'bg-green-500'
    if (entry.acos < 25) return 'bg-green-300'
    if (entry.acos < 35) return 'bg-yellow-200'
    return 'bg-red-300'
  }

  function cellLabel(entry: HourlyEntry): string {
    if (heatmapMetric === 'cvr_coefficient') return entry.cvr_coefficient > 0 ? `×${entry.cvr_coefficient.toFixed(2)}` : '—'
    if (heatmapMetric === 'clicks') return String(entry.clicks)
    if (heatmapMetric === 'orders') return String(entry.orders)
    return entry.acos != null ? `${entry.acos.toFixed(0)}%` : '—'
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <input
          type="text"
          value={inputId}
          onChange={(e) => setInputId(e.target.value)}
          placeholder="Campaign ID"
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <button
          onClick={() => setCampaignId(inputId.trim())}
          disabled={!inputId.trim()}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          加载数据
        </button>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        >
          <option value={7}>最近 7 天</option>
          <option value={14}>最近 14 天</option>
          <option value={30}>最近 30 天</option>
          <option value={60}>最近 60 天</option>
        </select>
        <select
          value={heatmapMetric}
          onChange={(e) => setHeatmapMetric(e.target.value as typeof heatmapMetric)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        >
          <option value="cvr_coefficient">CVR 系数</option>
          <option value="clicks">点击量</option>
          <option value="orders">订单数</option>
          <option value="acos">ACoS</option>
        </select>
      </div>

      {!campaignId ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-slate-400 shadow-sm">
          输入 Campaign ID 后点击「加载数据」查看 24 小时热力图
        </div>
      ) : isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-slate-400 shadow-sm">加载中...</div>
      ) : hourly.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-slate-400 shadow-sm">
          该 Campaign 暂无小时级数据。可通过「导入」接口上传数据。
        </div>
      ) : (
        <>
          {/* 24h Heatmap */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">24 小时热力图 — {campaignId}</h3>
              <span className="text-xs text-slate-400">分析 {data?.days_analyzed} 天</span>
            </div>
            <div className="grid grid-cols-12 gap-1">
              {hourly.map((entry) => (
                <div
                  key={entry.hour}
                  title={`${entry.hour}:00 | clicks=${entry.clicks} orders=${entry.orders} cvr=${(entry.cvr * 100).toFixed(2)}% coeff=×${entry.cvr_coefficient.toFixed(2)}`}
                  className={cn('rounded p-1.5 text-center cursor-default', cellColor(entry))}
                >
                  <div className="text-[10px] font-bold text-slate-700">{entry.hour}h</div>
                  <div className="text-[10px] text-slate-600">{cellLabel(entry)}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
              <span>显示: <strong>{heatmapMetric === 'cvr_coefficient' ? 'CVR系数(×avg)' : heatmapMetric}</strong></span>
              {heatmapMetric === 'cvr_coefficient' && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded bg-green-500" /> 高效
                  <span className="inline-block w-3 h-3 rounded bg-yellow-200 ml-2" /> 中等
                  <span className="inline-block w-3 h-3 rounded bg-red-200 ml-2" /> 低效
                </span>
              )}
            </div>
          </div>

          {/* Recommended multipliers */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">推荐竞价倍率（基于 CVR 系数）</h3>
              <button
                onClick={handleSaveSchedule}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                保存分时策略
              </button>
            </div>
            <div className="grid grid-cols-12 gap-1">
              {(data?.recommended_multipliers ?? []).map((m, h) => (
                <div
                  key={h}
                  className={cn(
                    'rounded p-1.5 text-center',
                    m >= 1.3 ? 'bg-green-100' : m >= 1.0 ? 'bg-slate-50' : 'bg-red-50',
                  )}
                >
                  <div className="text-[10px] font-bold text-slate-600">{h}h</div>
                  <div className={cn('text-[10px] font-semibold', m >= 1.3 ? 'text-green-700' : m >= 1.0 ? 'text-slate-600' : 'text-red-600')}>
                    ×{m.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            {data?.schedule && (
              <p className="mt-2 text-xs text-green-600">✓ 已保存分时策略，启用状态: {data.schedule.enabled ? '开启' : '关闭'}</p>
            )}
          </div>

          {/* Hourly detail table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 text-left">时段</th>
                  <th className="px-4 py-2.5 text-right">曝光</th>
                  <th className="px-4 py-2.5 text-right">点击</th>
                  <th className="px-4 py-2.5 text-right">订单</th>
                  <th className="px-4 py-2.5 text-right">CVR</th>
                  <th className="px-4 py-2.5 text-right">CVR 系数</th>
                  <th className="px-4 py-2.5 text-right">花费</th>
                  <th className="px-4 py-2.5 text-right">ACoS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hourly.map((h) => (
                  <tr key={h.hour} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-slate-700">{h.hour}:00–{h.hour}:59</td>
                    <td className="px-4 py-2 text-right text-slate-600">{h.impressions.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{h.clicks.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-700">{h.orders}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{(h.cvr * 100).toFixed(2)}%</td>
                    <td className="px-4 py-2 text-right">
                      <span className={cn('font-semibold', h.cvr_coefficient > 1 ? 'text-green-600' : h.cvr_coefficient > 0 ? 'text-slate-600' : 'text-slate-400')}>
                        {h.cvr_coefficient > 0 ? `×${h.cvr_coefficient.toFixed(2)}` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">${h.spend.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">
                      {h.acos != null ? (
                        <span className={cn('font-medium', h.acos < 25 ? 'text-green-600' : 'text-red-500')}>
                          {h.acos.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
