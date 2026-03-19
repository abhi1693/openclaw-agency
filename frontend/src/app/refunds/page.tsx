'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, CheckCircle2, Clock, DollarSign, Download,
  FileText, Filter, Play, RefreshCw, Search, X, Copy, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DashboardPageLayout } from '@/components/templates/DashboardPageLayout'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Claim {
  orderId: string
  refundDate: string
  reason: string
  amount: number
  sku: string
  asin: string
  daysSinceRefund: number
  hasReturn: boolean
  hasReimbursement: boolean
  claimType: string
  claimScenario: string
  priority: string
  status: string
  caseStatus: string
}

interface Summary {
  pendingAmount: number
  claimableCount: number
  recoveredAmount: number
  submittedCount: number
  auditDate: string | null
  period: string | null
  totalRefunds: number
}

interface CaseDetail {
  orderId: string
  status?: string
  caseId?: string | null
  notes?: string
  submittedAt?: string | null
  template?: string | null
  templateText?: string | null
  claimType?: string
  amount?: number
  error?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const priorityColor: Record<string, string> = {
  high:   'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-slate-100 text-slate-500',
}

const statusColor: Record<string, string> = {
  actionable: 'bg-blue-100 text-blue-700',
  pending:    'bg-amber-100 text-amber-700',
  submitted:  'bg-purple-100 text-purple-700',
  approved:   'bg-emerald-100 text-emerald-700',
  denied:     'bg-rose-100 text-rose-700',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
      statusColor[status] ?? 'bg-slate-100 text-slate-500'
    )}>
      {status}
    </span>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="flex items-center gap-4 flex-1 min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm px-5 py-4">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', accent || 'bg-blue-50 text-blue-600')}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-slate-900 truncate">{value}</p>
        {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Order ID Cell ─────────────────────────────────────────────────────────────

function OrderIdCell({ orderId }: { orderId: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(orderId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="flex items-center gap-1 group">
      <span className="font-mono text-xs text-slate-700">{orderId}</span>
      <button
        onClick={e => { e.stopPropagation(); copy() }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-200"
        title="Copy order number"
      >
        {copied
          ? <Check className="w-3 h-3 text-emerald-600" />
          : <Copy className="w-3 h-3 text-slate-400" />}
      </button>
      {copied && <span className="text-[10px] text-emerald-600 font-medium">Copied!</span>}
    </div>
  )
}

// ─── Claim Instructions Accordion ─────────────────────────────────────────────

function ClaimInstructions({ scenario, claimType }: { scenario: string; claimType: string }) {
  const [open, setOpen] = useState(false)

  const key = (scenario || '').toLowerCase()
  const type = (claimType || '').toLowerCase()

  let title = '📋 How to File'
  let content: React.ReactNode

  if (key.includes('safe') || type.includes('safe')) {
    title = '🛡️ How to File — SAFE-T Claim'
    content = (
      <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-700">
        <li>Log in to <a href="https://sellercentral.amazon.com/safet-claims" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">Seller Central → SAFE-T Claims</a></li>
        <li>Click <strong>File New Claim</strong></li>
        <li>Enter the order ID shown above</li>
        <li>Select claim reason and upload evidence (tracking, photos, etc.)</li>
        <li>Submit and note the Case ID below</li>
      </ol>
    )
  } else if (key.includes('reimburse') || type.includes('reimburse') || key.includes('fba') || type.includes('fba')) {
    title = '📦 How to File — Reimbursement Request'
    content = (
      <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-700">
        <li>Log in to <a href="https://sellercentral.amazon.com/reportcentral/REIMBURSEMENTS/1" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">Seller Central → FBA Inventory → Reimbursements</a></li>
        <li>Click <strong>Create Reimbursement Request</strong></li>
        <li>Enter the order ID and select the affected shipment</li>
        <li>Describe the issue and attach supporting documents</li>
        <li>Submit and save the Case ID below</li>
      </ol>
    )
  } else {
    title = '📬 How to File — Seller Support'
    content = (
      <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-700">
        <li>Go to <a href="https://sellercentral.amazon.com/help/center" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">Seller Central → Help → Contact Us</a></li>
        <li>Select <strong>FBA Issue → Refund / Reimbursement</strong></li>
        <li>Reference this Order ID in your message</li>
        <li>Attach relevant evidence and submit</li>
        <li>Save the resulting Case ID below</li>
      </ol>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-slate-600">{title}</span>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-white border-t border-slate-100">
          {content}
        </div>
      )}
    </div>
  )
}

// ─── Case Detail Panel ─────────────────────────────────────────────────────────

function CasePanel({
  claim,
  onClose,
  onSaved,
}: {
  claim: Claim
  onClose: () => void
  onSaved: () => void
}) {
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState(claim.caseStatus || 'pending')
  const [caseId, setCaseId] = useState('')
  const [notes, setNotes] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    fetch(`/api/refunds/case/${encodeURIComponent(claim.orderId)}`)
      .then(r => r.json())
      .then((d: CaseDetail) => {
        setDetail(d)
        setStatus(d.status || claim.caseStatus || 'pending')
        setCaseId(d.caseId || '')
        setNotes(d.notes || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [claim.orderId, claim.caseStatus])

  const templateText = detail?.templateText || detail?.template || null

  const copyTemplate = () => {
    if (!templateText) return
    navigator.clipboard.writeText(templateText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const save = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const body: Record<string, unknown> = { status, notes }
      if (caseId) body.caseId = caseId
      if (status === 'submitted' && !detail?.submittedAt) body.submittedAt = new Date().toISOString()
      await fetch(`/api/refunds/case/${encodeURIComponent(claim.orderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setSaveMsg('✓ 已保存')
      setTimeout(() => setSaveMsg(''), 2000)
      onSaved()
    } catch {
      setSaveMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const panel = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">Case Details</h2>
            <p className="text-[11px] text-slate-500 font-mono">{claim.orderId}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center flex-1 text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 加载中…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Claim info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-400 text-xs">Amount</span><p className="font-semibold text-slate-900">{fmtUSD(claim.amount)}</p></div>
              <div><span className="text-slate-400 text-xs">Claim Type</span><p className="font-medium text-slate-900 capitalize">{claim.claimType}</p></div>
              <div><span className="text-slate-400 text-xs">SKU</span><p className="font-mono text-xs text-slate-700">{claim.sku}</p></div>
              <div><span className="text-slate-400 text-xs">Days Since Refund</span><p className="font-medium text-slate-900">{claim.daysSinceRefund}</p></div>
              <div><span className="text-slate-400 text-xs">Reason</span><p className="text-slate-700 text-xs">{claim.reason}</p></div>
              <div><span className="text-slate-400 text-xs">Scenario</span><p className="font-medium text-slate-900">{claim.claimScenario}</p></div>
            </div>

            {/* How to File */}
            <ClaimInstructions scenario={claim.claimScenario} claimType={claim.claimType} />

            {/* Template */}
            {templateText ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">📋 Claim Template</span>
                  <button
                    onClick={copyTemplate}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? '已复制' : '复制模板'}
                  </button>
                </div>
                <pre className="text-[11px] text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap border border-slate-200 max-h-48 overflow-y-auto font-mono leading-relaxed">
                  {templateText}
                </pre>
              </div>
            ) : detail?.error ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {detail.error}
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-4">暂无模板 — SP-API 数据不可用时模板无法生成</div>
            )}

            {/* Status Management */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">⚙️ Status</span>
              <div className="flex flex-wrap gap-2">
                {(['actionable', 'pending', 'submitted', 'approved', 'denied'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all',
                      status === s
                        ? (statusColor[s] || 'bg-slate-100 text-slate-500') + ' ring-2 ring-offset-1 ring-current'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Case ID */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Case ID</label>
              <input
                type="text"
                value={caseId}
                onChange={e => setCaseId(e.target.value)}
                placeholder="Amazon Case ID..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Case notes..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white resize-none"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between">
          <span className="text-sm text-emerald-600">{saveMsg}</span>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(panel, document.body)
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function RefundsPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [auditRunning, setAuditRunning] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: '', reason: '', priority: '', claimType: '' })
  const [sort, setSort] = useState('amount_desc')
  const [page] = useState(1)
  const limit = 100

  const loadSummary = useCallback(async () => {
    try {
      const r = await fetch('/api/refunds/summary')
      setSummary(await r.json())
    } catch { /* ignore */ }
  }, [])

  const loadClaims = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page), limit: String(limit), sort,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.reason ? { reason: filters.reason } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.claimType ? { claimType: filters.claimType } : {}),
      ...(search ? { search } : {}),
    })
    try {
      const r = await fetch(`/api/refunds/list?${params}`)
      const d = await r.json()
      setClaims(d.claims || [])
      setTotal(d.total || 0)
    } catch { /* ignore */ }
  }, [page, sort, filters, search])

  const load = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadSummary(), loadClaims()])
    setLoading(false)
  }, [loadSummary, loadClaims])

  useEffect(() => { load() }, [load])

  const runAudit = async () => {
    setAuditRunning(true)
    try {
      await fetch('/api/refunds/audit', { method: 'POST' })
      await load()
    } catch { /* ignore */ } finally {
      setAuditRunning(false)
    }
  }

  const batchGenerate = async () => {
    const ids = selectedIds.size > 0
      ? Array.from(selectedIds)
      : claims.filter(c => c.caseStatus === 'actionable').map(c => c.orderId).slice(0, 20)
    if (!ids.length) return
    setGenerating(true)
    try {
      await fetch('/api/refunds/case/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: ids }),
      })
      await loadClaims()
    } catch { /* ignore */ } finally {
      setGenerating(false)
    }
  }

  const exportCsv = () => {
    window.open('/api/refunds/export', '_blank')
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === claims.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(claims.map(c => c.orderId)))
    }
  }

  const reasons = Array.from(new Set(claims.map(c => c.reason))).filter(Boolean).sort()
  const claimTypes = Array.from(new Set(claims.map(c => c.claimType))).filter(Boolean).sort()

  const handleCaseSaved = () => {
    loadSummary()
    loadClaims()
    setSelectedClaim(null)
  }

  return (
    <DashboardPageLayout
      title="FBA 退款追回"
      description="FBA Refund Recovery"
      signedOut={{ message: 'Sign in to view refunds', forceRedirectUrl: '/refunds' }}
    >
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={<DollarSign className="w-5 h-5" />}
            label="待追回总额"
            value={fmtUSD(summary?.pendingAmount ?? 0)}
            sub={summary?.period || '最近 180 天'}
            accent="bg-rose-50 text-rose-600"
          />
          <KpiCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="可追回订单"
            value={String(summary?.claimableCount ?? 0)}
            sub={`共 ${summary?.totalRefunds ?? 0} 退款`}
            accent="bg-amber-50 text-amber-600"
          />
          <KpiCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="已追回金额"
            value={fmtUSD(summary?.recoveredAmount ?? 0)}
            accent="bg-emerald-50 text-emerald-600"
          />
          <KpiCard
            icon={<Clock className="w-5 h-5" />}
            label="已提交 Cases"
            value={String(summary?.submittedCount ?? 0)}
            sub={summary?.auditDate ? `审计日期 ${summary.auditDate}` : undefined}
            accent="bg-purple-50 text-purple-600"
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={runAudit}
            disabled={auditRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {auditRunning
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4" />}
            {auditRunning ? 'Running…' : 'Run Audit'}
          </button>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search orders, SKU…"
              className="pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-48"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
              className="px-2 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">All Status</option>
              {['actionable', 'pending', 'submitted', 'approved', 'denied'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={filters.priority}
              onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
              className="px-2 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">All Priority</option>
              {['high', 'medium', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            <select
              value={filters.claimType}
              onChange={e => setFilters(f => ({ ...f, claimType: e.target.value }))}
              className="px-2 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">All Claim Types</option>
              {claimTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select
              value={filters.reason}
              onChange={e => setFilters(f => ({ ...f, reason: e.target.value }))}
              className="px-2 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">All Reasons</option>
              {reasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={batchGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {generating ? 'Generating…' : selectedIds.size > 0 ? `Generate (${selectedIds.size})` : 'Batch Generate'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900 text-sm">
              Claims
              <span className="ml-2 text-slate-400 font-normal text-xs">{total} records</span>
            </h2>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 focus:outline-none"
            >
              <option value="amount_desc">Amount ↓</option>
              <option value="amount_asc">Amount ↑</option>
              <option value="daysSinceRefund_desc">Days ↓</option>
              <option value="date_desc">Date ↓</option>
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 加载中…
            </div>
          ) : claims.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              暂无数据 — 请先运行 Audit
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-[11px] text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === claims.length && claims.length > 0}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left">Order ID</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">SKU</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">ASIN</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Reason</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center hidden md:table-cell">Days</th>
                    <th className="px-4 py-3 text-center hidden lg:table-cell">Return?</th>
                    <th className="px-4 py-3 text-center hidden lg:table-cell">Reimb?</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Claim Type</th>
                    <th className="px-4 py-3 text-left">Priority</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim, i) => (
                    <tr
                      key={claim.orderId + i}
                      className={cn(
                        'border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors',
                        selectedIds.has(claim.orderId) && 'bg-blue-50/50'
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(claim.orderId)}
                          onChange={() => toggleSelect(claim.orderId)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <OrderIdCell orderId={claim.orderId} />
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs whitespace-nowrap">{fmtDate(claim.refundDate)}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs hidden md:table-cell">{claim.sku}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs hidden lg:table-cell font-mono">{claim.asin || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs hidden lg:table-cell max-w-[140px] truncate">{claim.reason || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{fmtUSD(claim.amount)}</td>
                      <td className="px-4 py-2.5 text-center text-slate-600 text-xs hidden md:table-cell">{claim.daysSinceRefund}</td>
                      <td className="px-4 py-2.5 text-center hidden lg:table-cell">
                        <span className={cn('text-[10px] font-bold', claim.hasReturn ? 'text-rose-600' : 'text-slate-300')}>
                          {claim.hasReturn ? 'Y' : 'N'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center hidden lg:table-cell">
                        <span className={cn('text-[10px] font-bold', claim.hasReimbursement ? 'text-emerald-600' : 'text-slate-300')}>
                          {claim.hasReimbursement ? 'Y' : 'N'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span className="text-xs text-slate-600 capitalize">{claim.claimType}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                          priorityColor[claim.priority] ?? 'bg-slate-100 text-slate-500'
                        )}>
                          {claim.priority}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={claim.caseStatus || claim.status} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => setSelectedClaim(claim)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-xs text-slate-600 transition-colors"
                        >
                          <FileText className="w-3 h-3" />
                          View Case
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Case Panel */}
      {selectedClaim && (
        <CasePanel
          claim={selectedClaim}
          onClose={() => setSelectedClaim(null)}
          onSaved={handleCaseSaved}
        />
      )}
    </DashboardPageLayout>
  )
}
