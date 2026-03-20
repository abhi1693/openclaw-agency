'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, CheckCircle2, Clock, DollarSign, Download,
  FileText, Filter, Play, RefreshCw, Search, X, Copy, Check,
} from 'lucide-react'
import { cn, copyToClipboard } from '@/lib/utils'
import { DashboardPageLayout } from '@/components/templates/DashboardPageLayout'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Claim {
  orderId: string
  refundDate: string
  reason: string
  amount: number
  sku: string
  asin: string
  fnsku: string
  shipmentId: string
  quantity: number
  quantityEstimated: boolean
  daysSinceRefund: number
  hasReturn: boolean
  hasReimbursement: boolean
  claimType: string
  claimScenario: string
  priority: string
  status: string
  caseStatus: string
  reimbursementId: string
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

function fmtQty(qty: number, _estimated: boolean) {
  if (!qty) return ''
  return String(qty)
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
  filed:      'bg-indigo-100 text-indigo-700',
  approved:   'bg-emerald-100 text-emerald-700',
  resolved:   'bg-emerald-100 text-emerald-700',
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
    copyToClipboard(orderId).then(() => {
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

const SC_HELP = 'https://sellercentral.amazon.com/help/hub/support'
const SC_IDR = 'https://sellercentral.amazon.com/inventory-defect-and-reimbursement'

function ClaimInstructions({ scenario, claimType, fnsku }: { scenario: string; claimType: string; fnsku?: string }) {
  const [open, setOpen] = useState(false)

  const s = (scenario || '').toUpperCase().trim()

  type Instructions = { title: string; menuItem: string; steps: React.ReactNode; materials: string }

  let inst: Instructions

  if (s === 'A') {
    inst = {
      title: '🔁 申请指引 — Scenario A (FBA Returns Reimbursement)',
      menuItem: 'FBA Returns Reimbursement',
      steps: (
        <ol className="list-decimal list-inside space-y-1.5">
          <li>进入 <a href={SC_HELP} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">Seller Central → Help → Get Support</a></li>
          <li>快捷菜单选择 <strong className="text-slate-900">FBA Returns Reimbursement</strong></li>
          <li>按提示填写 Order ID 和退款原因说明</li>
          <li>上传证据截图（物流记录、买家通信等）</li>
          <li>提交后记录 Case ID</li>
        </ol>
      ),
      materials: 'Order ID · 退款原因说明 · 证据截图',
    }
  } else if (s === 'B') {
    inst = {
      title: '📦 申请指引 — Scenario B (库存丢失)',
      menuItem: 'Inventory lost in FBA warehouse',
      steps: (
        <ol className="list-decimal list-inside space-y-1.5">
          <li><strong>先查</strong> <a href={SC_IDR} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">Inventory Defect and Reimbursement</a> 页面：
            <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-slate-500">
              <li>如显示 <strong className="text-slate-700">In Progress</strong> → 等待，勿重复提交</li>
              <li>如显示 <strong className="text-slate-700">Eligible for Claim</strong> → 直接在该页面提交</li>
              <li>如显示 <strong className="text-slate-700">Resolved</strong> 但金额不对 → 走 Scenario D 争议</li>
              <li>如该 item 不在列表里 → 继续下方步骤手动提交</li>
            </ul>
          </li>
          <li>进入 <a href={SC_HELP} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">Seller Central → Help → Get Support</a></li>
          <li>快捷菜单选择 <strong className="text-slate-900">Inventory lost in FBA warehouse</strong></li>
          <li>
            在 <strong>Enter FNSKU</strong> 输入框粘贴 FNSKU
            {fnsku ? <span className="ml-1 font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">{fnsku}</span> : <span className="ml-1 text-slate-400">（见上方）</span>}
          </li>
          <li>填写 Shipment ID 和丢失数量</li>
          <li>描述问题后提交，保存 Case ID 至下方</li>
        </ol>
      ),
      materials: 'FNSKU · Shipment ID · 丢失数量',
    }
  } else if (s === 'C') {
    inst = {
      title: '🏭 申请指引 — Scenario C (仓库损坏/销毁)',
      menuItem: 'Inventory damaged in FBA warehouse',
      steps: (
        <ol className="list-decimal list-inside space-y-1.5">
          <li><strong>先查</strong> <a href={SC_IDR} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">Inventory Defect and Reimbursement</a> 页面：
            <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-slate-500">
              <li>如显示 <strong className="text-slate-700">In Progress</strong> → 等待，勿重复提交</li>
              <li>如显示 <strong className="text-slate-700">Eligible for Claim</strong> → 直接在该页面提交</li>
              <li>如显示 <strong className="text-slate-700">Resolved</strong> 但金额不对 → 走 Scenario D 争议</li>
              <li>如该 item 不在列表里 → 继续下方步骤手动提交</li>
            </ul>
          </li>
          <li>进入 <a href={SC_HELP} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">Seller Central → Help → Get Support</a></li>
          <li>快捷菜单选择 <strong className="text-slate-900">Inventory damaged in FBA warehouse</strong></li>
          <li>提供相关 FNSKU 和受损/销毁数量</li>
          <li>附上仓库报告截图后提交</li>
          <li>保存 Case ID 至下方</li>
        </ol>
      ),
      materials: 'FNSKU · 受损/销毁数量 · 仓库报告',
    }
  } else if (s === 'D') {
    inst = {
      title: '⚖️ 申请指引 — Scenario D (Reimbursement 争议)',
      menuItem: 'Submit a reimbursement claim dispute',
      steps: (
        <ol className="list-decimal list-inside space-y-1.5">
          <li>进入 <a href={SC_HELP} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">Seller Central → Help → Get Support</a></li>
          <li>快捷菜单选择 <strong className="text-slate-900">Submit a reimbursement claim dispute</strong></li>
          <li>填写原 Reimbursement ID 和争议理由</li>
          <li>说明金额差异或被拒原因后提交</li>
          <li>保存 Case ID 至下方</li>
        </ol>
      ),
      materials: '原 Reimbursement ID · 争议理由 · 金额说明',
    }
  } else {
    inst = {
      title: '📬 申请指引 — Scenario E / 其他',
      menuItem: 'My issue is not listed',
      steps: (
        <ol className="list-decimal list-inside space-y-1.5">
          <li>进入 <a href={SC_HELP} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">Seller Central → Help → Get Support</a></li>
          <li>如菜单无匹配选项，点击 <strong className="text-slate-900">My issue is not listed</strong></li>
          <li><strong>What do you need help with?</strong> — 填写问题描述（参考 claim reason）</li>
          <li><strong>What steps have you taken already?</strong> — "Checked FBA reports and identified discrepancy"</li>
          <li><strong>Reference numbers</strong> — 填写 Order ID</li>
          <li>附上截图等证据后提交，等待客服回复</li>
        </ol>
      ),
      materials: 'Order ID · 问题描述 · 相关截图',
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-slate-600">{inst.title}</span>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-white border-t border-slate-100 space-y-3 text-xs text-slate-700">
          <div className="flex items-start gap-2 p-2 rounded bg-blue-50 border border-blue-200">
            <span className="text-blue-600 font-semibold shrink-0">快捷菜单：</span>
            <span className="font-semibold text-blue-800">{inst.menuItem}</span>
          </div>
          {inst.steps}
          <div className="p-2 rounded bg-slate-50 border border-slate-200 text-slate-500">
            <strong className="text-slate-600">需要准备：</strong> {inst.materials}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Filing Materials ──────────────────────────────────────────────────────────

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  const copy = () => {
    copyToClipboard(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-[11px] text-slate-400 w-28 shrink-0">{label}</span>
      <span className="font-mono text-xs text-slate-800 flex-1 truncate">{value}</span>
      <button
        onClick={copy}
        className="shrink-0 p-1 rounded hover:bg-slate-100 transition-colors"
        title={`Copy ${label}`}
      >
        {copied
          ? <Check className="w-3 h-3 text-emerald-600" />
          : <Copy className="w-3 h-3 text-slate-400" />}
      </button>
    </div>
  )
}

function FilingMaterials({ claim }: { claim: Claim }) {
  const [open, setOpen] = useState(true)
  const [descCopied, setDescCopied] = useState(false)

  const s = (claim.claimScenario || '').toUpperCase().trim()
  const date = claim.refundDate ? new Date(claim.refundDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  const amt = `$${Number(claim.amount).toFixed(2)}`

  const qty = claim.quantity > 0 ? fmtQty(claim.quantity, claim.quantityEstimated) : ''
  const shipId = claim.shipmentId || ''

  // Generate a compact, pasteable description per scenario
  let descTemplate = ''
  if (s === 'A') {
    descTemplate = `Order ${claim.orderId} was refunded ${amt} on ${date} with reason "${displayReason(claim.reason, claim.claimScenario)}". The item was not returned to our FBA inventory. FNSKU: ${claim.fnsku || 'N/A'}, ASIN: ${claim.asin || 'N/A'}, SKU: ${claim.sku || 'N/A'}. We request reimbursement of ${amt} via FBA Returns Reimbursement.`
  } else if (s === 'B') {
    const shipPart = shipId ? `, Shipment ID: ${shipId}` : ''
    const qtyPart = qty ? ` (quantity: ${qty})` : ''
    descTemplate = `FBA inventory with FNSKU ${claim.fnsku || 'N/A'} (ASIN: ${claim.asin || 'N/A'}, SKU: ${claim.sku || 'N/A'}) was lost in the fulfillment center${shipPart}. Order ID: ${claim.orderId}${qtyPart}. We request reimbursement for the lost unit(s).`
  } else if (s === 'C') {
    const qtyPart = qty ? ` (quantity: ${qty})` : ''
    descTemplate = `FBA inventory with FNSKU ${claim.fnsku || 'N/A'} (ASIN: ${claim.asin || 'N/A'}, SKU: ${claim.sku || 'N/A'}) was damaged or disposed of in the fulfillment center without reimbursement${qtyPart}. We request reimbursement for the affected unit(s).`
  } else if (s === 'D') {
    descTemplate = `We are disputing the reimbursement for Order ID ${claim.orderId}. The customer refund amount was ${amt} but the reimbursement received did not match. FNSKU: ${claim.fnsku || 'N/A'}, ASIN: ${claim.asin || 'N/A'}. We request re-evaluation of this claim.`
  } else {
    descTemplate = `Order ID: ${claim.orderId}. FNSKU: ${claim.fnsku || 'N/A'}, ASIN: ${claim.asin || 'N/A'}, SKU: ${claim.sku || 'N/A'}. Refunded ${amt} on ${date} for reason "${displayReason(claim.reason, claim.claimScenario)}". We have checked FBA reports and identified a discrepancy. Please assist.`
  }

  const copyDesc = () => {
    copyToClipboard(descTemplate).then(() => {
      setDescCopied(true)
      setTimeout(() => setDescCopied(false), 2000)
    })
  }

  // Build field list per scenario
  const showFields: { label: string; value: string }[] = []
  if (s === 'A') {
    showFields.push(
      { label: 'Order ID', value: claim.orderId },
      { label: 'FNSKU', value: claim.fnsku },
      { label: 'ASIN', value: claim.asin },
      { label: 'SKU', value: claim.sku },
      { label: 'Refund Date', value: date },
      { label: 'Refund Amount', value: amt },
      { label: 'Return Reason', value: displayReason(claim.reason, claim.claimScenario) },
    )
  } else if (s === 'B') {
    showFields.push(
      { label: 'FNSKU', value: claim.fnsku },
      { label: 'ASIN', value: claim.asin },
      { label: 'SKU', value: claim.sku },
      { label: 'Shipment ID', value: shipId },
      { label: 'Quantity', value: qty },
      { label: 'Order ID', value: claim.orderId },
      { label: 'Refund Amount', value: amt },
    )
  } else if (s === 'C') {
    showFields.push(
      { label: 'FNSKU', value: claim.fnsku },
      { label: 'ASIN', value: claim.asin },
      { label: 'SKU', value: claim.sku },
      { label: 'Quantity', value: qty },
      { label: 'Order ID', value: claim.orderId },
    )
  } else if (s === 'D') {
    showFields.push(
      { label: 'Order ID', value: claim.orderId },
      { label: 'FNSKU', value: claim.fnsku },
      { label: 'ASIN', value: claim.asin },
      { label: 'Refund Amount', value: amt },
    )
  } else {
    showFields.push(
      { label: 'Order ID', value: claim.orderId },
      { label: 'FNSKU', value: claim.fnsku },
      { label: 'ASIN', value: claim.asin },
      { label: 'SKU', value: claim.sku },
      { label: 'Refund Date', value: date },
      { label: 'Refund Amount', value: amt },
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-amber-700">📋 申请材料 Filing Materials</span>
        <span className="text-amber-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-white border-t border-slate-100 space-y-3">
          {/* Field rows */}
          <div>
            {showFields.map(f => <CopyRow key={f.label} label={f.label} value={f.value} />)}
          </div>

          {/* Description template */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Description</span>
              <button
                onClick={copyDesc}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] text-slate-600 transition-colors"
              >
                {descCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {descCopied ? '已复制' : '复制'}
              </button>
            </div>
            <p className="text-[11px] text-slate-700 bg-slate-50 rounded p-2.5 border border-slate-200 leading-relaxed">
              {descTemplate}
            </p>
          </div>
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
    copyToClipboard(templateText).then(() => {
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
            <OrderIdCell orderId={claim.orderId} />
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
              <div><span className="text-slate-400 text-xs">Reason</span><p className="text-slate-700 text-xs">{displayReason(claim.reason, claim.claimScenario)}</p></div>
              <div><span className="text-slate-400 text-xs">Scenario</span><p className="font-medium text-slate-900">{claim.claimScenario}</p></div>
              {claim.fnsku && (
                <div className="col-span-2">
                  <span className="text-slate-400 text-xs">FNSKU</span>
                  <OrderIdCell orderId={claim.fnsku} />
                </div>
              )}
            </div>

            {/* How to File */}
            <ClaimInstructions scenario={claim.claimScenario} claimType={claim.claimType} fnsku={claim.fnsku} />

            {/* Filing Materials */}
            <FilingMaterials claim={claim} />

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
                {(['actionable', 'pending', 'submitted', 'filed', 'approved', 'resolved', 'denied'] as const).map(s => (
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

// ─── Reason translation ────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  UNDELIVERABLE_UNKNOWN:          'Shipping address undeliverable - item not returned',
  undeliverable_unknown:          'Shipping address undeliverable - item not returned',
  DAMAGED_BY_CARRIER:             'Carrier damaged - item not returned',
  damaged_by_carrier:             'Carrier damaged - item not returned',
  MISSED_ESTIMATED_DELIVERY:      'Missed estimated delivery - item not returned',
  missed_estimated_delivery:      'Missed estimated delivery - item not returned',
  NEVER_ARRIVED:                  'Item never arrived - lost in transit',
  never_arrived:                  'Item never arrived - lost in transit',
  CustomerReturn:                 'Customer return - item not received back',
  CUSTOMER_RETURN:                'Customer return - item not received back',
  customer_return:                'Customer return - item not received back',
  FREE_REPLACEMENT_REFUND_ITEMS:  'Free replacement issued - original not returned',
  free_replacement_refund_items:  'Free replacement issued - original not returned',
  REVERSAL_REIMBURSEMENT:         'Previous reimbursement reversed',
  reversal_reimbursement:         'Previous reimbursement reversed',
  DAMAGED:                        'Item damaged in FBA warehouse',
  damaged:                        'Item damaged in FBA warehouse',
  LOST:                           'Item lost in FBA warehouse',
  lost:                           'Item lost in FBA warehouse',
  CustomerServiceIssue:           'Amazon courtesy refund - item delivered, no return',
  customerserviceissue:           'Amazon courtesy refund - item delivered, no return',
  CUSTOMER_SERVICE_ISSUE:         'Amazon courtesy refund - item delivered, no return',
  Lost_Warehouse:                 'Item lost in FBA warehouse',
  Damaged_Warehouse:              'Item damaged in FBA warehouse',
  Reimbursement_Reversal:         'Previous reimbursement reversed',
  unit_returned_to_inventory:     'Item returned to FBA inventory — no claim needed',
}

const SCENARIO_FALLBACK_REASON: Record<string, string> = {
  A: 'Customer refund issued - item not returned to FBA inventory',
  B: 'Inventory lost in FBA warehouse - not reimbursed',
  C: 'Inventory damaged/disposed in FBA warehouse',
  D: 'Reimbursement amount disputed',
  E: 'FBA fulfillment issue - requires investigation',
  F: 'Amazon courtesy refund charged to seller - item delivered, no return initiated',
}

function displayReason(raw: string, scenario?: string): string {
  if (!raw || raw.toLowerCase() === 'unknown') {
    return scenario
      ? (SCENARIO_FALLBACK_REASON[scenario.toUpperCase()] ?? 'FBA fulfillment issue - requires investigation')
      : 'Refund issued - item not returned to inventory'
  }
  return REASON_LABELS[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// ─── FNSKU Group View ──────────────────────────────────────────────────────────

interface FnSkuGroup {
  key: string       // fnsku|scenario
  fnsku: string
  asin: string
  sku: string
  scenario: string
  claims: Claim[]
}

const SCENARIO_META: Record<string, { label: string; path: string; color: string }> = {
  A: { label: 'FBA Returns Reimb.',   path: 'Help → FBA Returns Reimbursement',                    color: 'bg-rose-100 text-rose-700' },
  B: { label: 'Inventory Lost',      path: 'Help → Inventory lost in FBA warehouse',               color: 'bg-blue-100 text-blue-700' },
  C: { label: 'Inventory Damaged',   path: 'Help → Inventory damaged in FBA warehouse',            color: 'bg-amber-100 text-amber-700' },
  D: { label: 'Dispute',             path: 'Help → Submit a reimbursement claim dispute',          color: 'bg-purple-100 text-purple-700' },
  E: { label: 'Other',               path: 'Help → My issue is not listed',                        color: 'bg-slate-100 text-slate-600' },
  F: { label: 'Courtesy Refund',     path: 'Help → My issue is not listed',                        color: 'bg-emerald-100 text-emerald-700' },
}

function scenarioOpeningLine(scenario: string, n: number): string {
  const s = scenario.toUpperCase()
  if (s === 'A') return `The following ${n} order${n !== 1 ? 's were' : ' was'} refunded due to non-buyer fault reasons (carrier damage, undeliverable address, etc.) but the item${n !== 1 ? 's were' : ' was'} not returned to our FBA inventory. We are requesting reimbursement via FBA Returns Reimbursement.`
  if (s === 'B') return `The following ${n} order${n !== 1 ? 's were' : ' was'} refunded but the item${n !== 1 ? 's were' : ' was'} never returned to our FBA inventory. More than 45 days have passed since each refund. We are requesting reimbursement for these lost units.`
  if (s === 'C') return `The following ${n} item${n !== 1 ? 's were' : ' was'} returned to our FBA warehouse as unsellable/damaged without a corresponding reimbursement. We are requesting reimbursement for these damaged units.`
  if (s === 'D') return `We are disputing the following ${n} case${n !== 1 ? 's' : ''}. The customer refund amount${n !== 1 ? 's were' : ' was'} not matched by the expected reimbursement${n !== 1 ? 's' : ''}.`
  if (s === 'F') return `Amazon issued courtesy refund${n !== 1 ? 's' : ''} for the following ${n} order${n !== 1 ? 's' : ''} and charged the full amount${n !== 1 ? 's' : ''} to our seller account. The item${n !== 1 ? 's were' : ' was'} successfully delivered and no return${n !== 1 ? 's were' : ' was'} initiated. We are requesting reimbursement for these incorrectly charged amounts.`
  return `The following ${n} order${n !== 1 ? 's have an' : ' has an'} unresolved FBA inventory discrepancy. We have verified through our FBA reports that the items were not returned to sellable inventory and no reimbursement has been issued.`
}

interface FilingEntry { caseId: string; submitting: boolean; done: boolean }

function FnSkuGroupView({
  claims,
  onViewCase,
  onFilingComplete,
}: {
  claims: Claim[]
  onViewCase: (c: Claim) => void
  onFilingComplete: () => void
}) {
  const [expandedFnskus, setExpandedFnskus] = useState<Set<string>>(new Set())
  const [selections, setSelections] = useState<Record<string, Set<string>>>({})
  const [templates, setTemplates] = useState<Record<string, string>>({})
  const [multiReasonKeys, setMultiReasonKeys] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [filingState, setFilingState] = useState<Record<string, FilingEntry>>({})

  // SC form fields for Scenario B/C — two copyable fields matching the SC form
  // (Reimbursement ID is shown per-claim row, not at the group level)
  interface ScFields { fnsku: string; details: string }
  const [scFields, setScFields] = useState<Record<string, ScFields>>({})
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const groups: FnSkuGroup[] = useMemo(() => {
    const map: Record<string, FnSkuGroup> = {}
    for (const c of claims) {
      const key = `${c.fnsku || '(no FNSKU)'}|${c.claimScenario || 'E'}`
      if (!map[key]) map[key] = { key, fnsku: c.fnsku, asin: c.asin, sku: c.sku, scenario: c.claimScenario || 'E', claims: [] }
      map[key].claims.push(c)
    }
    // Priority order: A & F (high, Amazon won't auto-process) → D (disputes) → B & C (check IDR first) → E (other)
    const SCENARIO_ORDER: Record<string, number> = { A: 0, F: 1, D: 2, B: 3, C: 4, E: 5 }
    return Object.values(map).sort((a, b) => {
      const oa = SCENARIO_ORDER[a.scenario] ?? 9
      const ob = SCENARIO_ORDER[b.scenario] ?? 9
      if (oa !== ob) return oa - ob
      const totA = a.claims.reduce((s, c) => s + c.amount, 0)
      const totB = b.claims.reduce((s, c) => s + c.amount, 0)
      return totB - totA
    })
  }, [claims])

  const toggleGroup = (key: string) => setExpandedFnskus(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const toggleClaim = (key: string, orderId: string) => setSelections(prev => {
    const cur = new Set(prev[key] || [])
    if (cur.has(orderId)) cur.delete(orderId)
    else if (cur.size < 10) cur.add(orderId)
    return { ...prev, [key]: cur }
  })

  const selectTop10 = (key: string, groupClaims: Claim[]) =>
    setSelections(prev => ({ ...prev, [key]: new Set(groupClaims.slice(0, 10).map(c => c.orderId)) }))

  const generateTemplate = async (group: FnSkuGroup) => {
    const key = group.key
    let sel = selections[key] || new Set()
    // Auto-select top 10 actionable if user hasn't made a manual selection.
    // For Scenario B/C, prefer claims that don't already have a reimbursement on file
    // (has_reimbursement=false) since Amazon may have auto-processed the rest.
    if (sel.size === 0) {
      const actionable = group.claims.filter(c => c.status === 'actionable')
      const pool = actionable.length > 0 ? actionable : group.claims
      const prioritized = ['B', 'C'].includes(group.scenario)
        ? [...pool.filter(c => !c.hasReimbursement), ...pool.filter(c => c.hasReimbursement)]
        : pool
      sel = new Set(prioritized.slice(0, 10).map(c => c.orderId))
      setSelections(prev => ({ ...prev, [key]: sel }))
    }
    const selected = group.claims.filter(c => sel.has(c.orderId))
    const totalAmt = selected.reduce((s, c) => s + c.amount, 0)
    const totalQty = selected.reduce((s, c) => s + (c.quantity || 1), 0)

    // ── Scenario B/C: generate three SC form fields instead of a text blob ──
    if (['B', 'C'].includes(group.scenario)) {
      const dates = selected
        .map(c => c.refundDate ? new Date(c.refundDate).getTime() : null)
        .filter((t): t is number => t !== null)
      const fmtD = (t: number) =>
        new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const dateRange = dates.length
        ? (Math.min(...dates) === Math.max(...dates)
          ? fmtD(dates[0])
          : `${fmtD(Math.min(...dates))} – ${fmtD(Math.max(...dates))}`)
        : 'N/A'
      const actionVerb = group.scenario === 'B'
        ? 'lost in your fulfillment center'
        : 'damaged or disposed in your fulfillment center'
      const details = [
        `We identified ${totalQty} unit${totalQty !== 1 ? 's' : ''} of FNSKU ${group.fnsku || 'N/A'} (ASIN: ${group.asin || 'N/A'}, SKU: ${group.sku || 'N/A'}) that were ${actionVerb} but not reimbursed or insufficiently reimbursed.`,
        '',
        `Affected orders: ${selected.length} (${dateRange})`,
        `Total refund amount: $${totalAmt.toFixed(2)}`,
        `Total units: ${totalQty}`,
        '',
        `We have verified through our FBA inventory reports that these units are unaccounted for and no corresponding reimbursement has been issued. Please investigate and issue the appropriate reimbursement.`,
      ].join('\n')

      setScFields(prev => ({ ...prev, [key]: { fnsku: group.fnsku || '', details } }))
      return
    }

    // ── All other scenarios: generate full text template ──
    const byReason: Record<string, Claim[]> = {}
    for (const c of selected) {
      const r = displayReason(c.reason, c.claimScenario)
      if (!byReason[r]) byReason[r] = []
      byReason[r].push(c)
    }
    const uniqueReasons = Object.keys(byReason)
    const n = selected.length
    const lines: string[] = []

    lines.push(scenarioOpeningLine(group.scenario, n))
    lines.push('')

    if (uniqueReasons.length === 1) {
      for (const c of selected) {
        const date = c.refundDate ? new Date(c.refundDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
        const qty = fmtQty(c.quantity || 1, c.quantityEstimated)
        lines.push(`- Order ${c.orderId}, refunded $${c.amount.toFixed(2)} on ${date}, qty: ${qty}, reason: ${displayReason(c.reason, c.claimScenario)}`)
      }
    } else {
      for (const [reason, reasonClaims] of Object.entries(byReason)) {
        lines.push(`Orders — ${reason}:`)
        for (const c of reasonClaims) {
          const date = c.refundDate ? new Date(c.refundDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
          const qty = fmtQty(c.quantity || 1, c.quantityEstimated)
          lines.push(`  - Order ${c.orderId}, refunded $${c.amount.toFixed(2)} on ${date}, qty: ${qty}`)
        }
        lines.push('')
      }
    }

    lines.push('')
    lines.push(`Total refund amount: $${totalAmt.toFixed(2)}`)
    lines.push(`Total units affected: ${totalQty}`)
    lines.push(`FNSKU: ${group.fnsku || 'N/A'}`)
    lines.push(`ASIN: ${group.asin || 'N/A'}`)
    lines.push(`SKU: ${group.sku || 'N/A'}`)

    setTemplates(prev => ({ ...prev, [key]: lines.join('\n') }))
    setMultiReasonKeys(prev => {
      const next = new Set(prev)
      uniqueReasons.length > 2 ? next.add(key) : next.delete(key)
      return next
    })
  }

  const copyTemplate = (key: string) => {
    const t = templates[key]
    if (!t) return
    copyToClipboard(t).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }

  const copyField = (fieldKey: string, value: string) => {
    copyToClipboard(value).then(() => {
      setCopiedField(fieldKey)
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  const markFiled = async (group: FnSkuGroup) => {
    const key = group.key
    const sel = selections[key] || new Set()
    const selected = sel.size > 0 ? group.claims.filter(c => sel.has(c.orderId)) : group.claims.slice(0, 10)
    const orderIds = selected.map(c => c.orderId)
    const caseId = filingState[key]?.caseId || ''

    setFilingState(prev => ({ ...prev, [key]: { caseId, submitting: true, done: false } }))
    try {
      await fetch('/api/refunds/batch-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds, status: 'filed', ...(caseId ? { amazonCaseId: caseId } : {}) }),
      })
      setFilingState(prev => ({ ...prev, [key]: { caseId, submitting: false, done: true } }))
      onFilingComplete()
    } catch {
      setFilingState(prev => ({ ...prev, [key]: { caseId, submitting: false, done: false } }))
    }
  }

  // Split into active (actionable/pending) and filed
  const FILED_STATUSES = new Set(['filed', 'submitted', 'approved', 'resolved', 'denied'])
  const activeGroups = useMemo(() => groups.map(g => ({ ...g, claims: g.claims.filter(c => !FILED_STATUSES.has(c.status)) })).filter(g => g.claims.length > 0), [groups])
  const filedGroups = useMemo(() => groups.map(g => ({ ...g, claims: g.claims.filter(c => FILED_STATUSES.has(c.status)) })).filter(g => g.claims.length > 0), [groups])

  if (activeGroups.length === 0 && filedGroups.length === 0) return (
    <div className="py-16 text-center text-slate-400">No data — run Audit first</div>
  )

  return (
    <div className="space-y-3">
      {activeGroups.map(group => {
        const key = group.key
        const isExpanded = expandedFnskus.has(key)
        const sel = selections[key] || new Set()
        const total = group.claims.reduce((s, c) => s + c.amount, 0)
        const actionable = group.claims.filter(c => c.status === 'actionable').length
        const tmpl = templates[key]
        const scF = scFields[key]
        const filing = filingState[key]
        const hasMultiReason = multiReasonKeys.has(key)
        const meta = SCENARIO_META[group.scenario.toUpperCase()] || SCENARIO_META['E']

        return (
          <div key={key} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => toggleGroup(key)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Scenario badge */}
                <span className={cn('shrink-0 text-[11px] font-bold px-2 py-0.5 rounded', meta.color)}>
                  {group.scenario}
                </span>
                {/* FNSKU + identifiers */}
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-slate-900">{group.fnsku || '—'}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {meta.label} · ASIN: {group.asin || '—'} · SKU: {group.sku || '—'}
                  </p>
                </div>
                {/* Counts */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="bg-slate-100 text-slate-600 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">{group.claims.length} claims</span>
                  {actionable > 0 && actionable < group.claims.length && (
                    <span className="bg-amber-100 text-amber-700 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">{actionable} actionable</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-bold text-slate-900">{fmtUSD(total)}</span>
                <span className="text-slate-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* SC entry path banner */}
            {isExpanded && (
              <div className="px-5 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                <span className="text-[11px] text-blue-500 font-semibold shrink-0">Go to:</span>
                <span className="text-[11px] font-semibold text-blue-800">{meta.path}</span>
              </div>
            )}

            {/* IDR dedup warning for Scenario B/C */}
            {isExpanded && (group.scenario === 'B' || group.scenario === 'C') && (
              <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
                <span className="text-amber-500 text-sm shrink-0 mt-0.5">⚠️</span>
                <p className="text-[11px] text-amber-800">
                  <strong>Check before filing:</strong> Amazon now auto-processes most warehouse lost/damaged cases via the{' '}
                  <a href={SC_IDR} target="_blank" rel="noopener noreferrer" className="underline font-semibold hover:text-amber-900">
                    Inventory Defect and Reimbursement
                  </a>{' '}
                  page. If a claim is already In Progress or Resolved there, do not file a duplicate — check the amount and use Scenario D to dispute if needed.
                </p>
              </div>
            )}

            {isExpanded && (
              <div className="border-t border-slate-100">
                {/* Actions bar */}
                <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
                  <button
                    onClick={() => selectTop10(key, group.claims)}
                    className="text-xs px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors"
                  >
                    Select Top 10
                  </button>
                  {sel.size > 0 && (
                    <button
                      onClick={() => setSelections(prev => ({ ...prev, [key]: new Set() }))}
                      className="text-xs px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-600 transition-colors"
                    >
                      Clear ({sel.size})
                    </button>
                  )}
                  <button
                    onClick={() => generateTemplate(group)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    <FileText className="w-3 h-3" />
                    Prepare Filing ({sel.size > 0 ? sel.size : Math.min(group.claims.length, 10)})
                  </button>
                  {sel.size >= 10 && (
                    <span className="text-[11px] text-amber-600">Max 10 orders per ticket</span>
                  )}
                </div>

                {/* Claims rows */}
                <div className="divide-y divide-slate-100">
                  {group.claims.map(claim => (
                    <div
                      key={claim.orderId}
                      className={cn(
                        'flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 transition-colors',
                        sel.has(claim.orderId) && 'bg-blue-50/50'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={sel.has(claim.orderId)}
                        onChange={() => toggleClaim(key, claim.orderId)}
                        className="rounded"
                        disabled={!sel.has(claim.orderId) && sel.size >= 10}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <OrderIdCell orderId={claim.orderId} />
                          <StatusPill status={claim.status} />
                          {claim.status === 'resolved' && claim.reason === 'unit_returned_to_inventory' && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-sky-100 text-sky-700">
                              Returned to Inventory
                            </span>
                          )}
                          {claim.status === 'resolved' && claim.reason !== 'unit_returned_to_inventory' && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                              Auto-Reimbursed by Amazon
                            </span>
                          )}
                          {claim.status !== 'resolved' && (
                            <span className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                              priorityColor[claim.priority] ?? 'bg-slate-100 text-slate-500'
                            )}>{claim.priority}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{fmtDate(claim.refundDate)} · qty: {fmtQty(claim.quantity || 1, claim.quantityEstimated)} · {displayReason(claim.reason, claim.claimScenario)} · Scenario {claim.claimScenario}</span>
                          {claim.reimbursementId && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="font-mono text-[10px] text-slate-500">Reimb: {claim.reimbursementId}</span>
                              <button
                                onClick={e => { e.stopPropagation(); copyField(`reimb:${claim.orderId}`, claim.reimbursementId) }}
                                className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] text-slate-500 transition-colors"
                              >
                                {copiedField === `reimb:${claim.orderId}` ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                                {copiedField === `reimb:${claim.orderId}` ? 'Copied' : 'Copy'}
                              </button>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="font-semibold text-slate-900 text-sm shrink-0">{fmtUSD(claim.amount)}</span>
                      <button
                        onClick={() => onViewCase(claim)}
                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-xs text-slate-600 transition-colors"
                      >
                        <FileText className="w-3 h-3" />
                        View
                      </button>
                    </div>
                  ))}
                </div>

                {/* Generated template + filing */}
                {(scF || tmpl) && (
                  <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 space-y-3">

                    {/* ── Scenario B/C: SC form fields ── */}
                    {scF && (
                      <div className="space-y-2">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          SC Form Fields (Step 3)
                        </span>
                        {/* FNSKU */}
                        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <span className="text-[11px] text-slate-400 w-28 shrink-0">FNSKU</span>
                          <span className="flex-1 font-mono text-[12px] text-slate-800 truncate">{scF.fnsku || 'N/A'}</span>
                          <button
                            onClick={() => copyField(`${key}:fnsku`, scF.fnsku)}
                            className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] text-slate-600 transition-colors"
                          >
                            {copiedField === `${key}:fnsku` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            {copiedField === `${key}:fnsku` ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        {/* Reimbursement ID note */}
                        <p className="text-[11px] text-slate-400 px-1">
                          💡 Reimbursement ID is shown per claim row below — copy it from there when filling the SC form.
                        </p>
                        {/* Additional Details */}
                        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100">
                            <span className="text-[11px] text-slate-400">Additional Details</span>
                            <button
                              onClick={() => copyField(`${key}:details`, scF.details)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] text-slate-600 transition-colors"
                            >
                              {copiedField === `${key}:details` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              {copiedField === `${key}:details` ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <pre className="text-[11px] text-slate-700 p-3 whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-y-auto">
                            {scF.details}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* ── Other scenarios: full text template ── */}
                    {tmpl && !scF && (
                      <>
                        {hasMultiReason && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>This batch contains more than 2 different refund reasons. Consider filing separately by reason for better approval rates.</span>
                          </div>
                        )}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Filing Template</span>
                            <button
                              onClick={() => copyTemplate(key)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 text-[11px] text-slate-700 transition-colors"
                            >
                              {copiedKey === key ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              {copiedKey === key ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <pre className="text-[11px] text-slate-700 bg-white rounded border border-slate-200 p-2.5 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
                            {tmpl}
                          </pre>
                        </div>
                      </>
                    )}

                    {/* Mark as Filed */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                      <span className="text-[11px] font-semibold text-slate-500 shrink-0">Mark as Filed:</span>
                      <input
                        type="text"
                        placeholder="Amazon Case ID (optional)"
                        value={filing?.caseId || ''}
                        onChange={e => setFilingState(prev => ({
                          ...prev,
                          [key]: { caseId: e.target.value, submitting: false, done: prev[key]?.done || false },
                        }))}
                        className="flex-1 px-2 py-1 text-xs rounded border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <button
                        onClick={() => markFiled(group)}
                        disabled={filing?.submitting || filing?.done}
                        className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {filing?.done
                          ? <><Check className="w-3 h-3" /> Filed</>
                          : filing?.submitting
                          ? <><RefreshCw className="w-3 h-3 animate-spin" /> Filing…</>
                          : 'Mark as Filed'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Filed Cases section */}
      {filedGroups.length > 0 && (
        <FiledCasesSection groups={filedGroups} onViewCase={onViewCase} />
      )}
    </div>
  )
}

// ─── Filed Cases Section ───────────────────────────────────────────────────────

function FiledCasesSection({ groups, onViewCase }: { groups: FnSkuGroup[]; onViewCase: (c: Claim) => void }) {
  const [open, setOpen] = useState(false)
  const totalFiled = groups.reduce((s, g) => s + g.claims.length, 0)
  const totalAmt = groups.reduce((s, g) => s + g.claims.reduce((a, c) => a + c.amount, 0), 0)

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">Filed</span>
          <span className="text-sm font-semibold text-slate-700">Filed Cases</span>
          <span className="bg-slate-100 text-slate-600 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">{totalFiled} claims</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-500 text-sm">{fmtUSD(totalAmt)}</span>
          <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {groups.map(group => {
            const meta = SCENARIO_META[group.scenario.toUpperCase()] || SCENARIO_META['E']
            return (
              <div key={group.key} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded', meta.color)}>{group.scenario}</span>
                  <span className="font-mono text-xs font-semibold text-slate-800">{group.fnsku || '—'}</span>
                  <span className="text-[11px] text-slate-400">{meta.label} · {group.claims.length} claims</span>
                </div>
                <div className="space-y-1.5">
                  {group.claims.map(claim => (
                    <div key={claim.orderId} className="flex items-center gap-3 text-[11px]">
                      <OrderIdCell orderId={claim.orderId} />
                      <StatusPill status={claim.status} />
                      <span className="text-slate-500">{fmtDate(claim.refundDate)}</span>
                      <span className="font-semibold text-slate-700">{fmtUSD(claim.amount)}</span>
                      <button
                        onClick={() => onViewCase(claim)}
                        className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-500 transition-colors"
                      >
                        <FileText className="w-3 h-3" /> View
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
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
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list')
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
        {/* KPI Cards — scenario-priority breakdown */}
        {(() => {
          const actionable = (scenarios: string[]) => claims.filter(c => c.status === 'actionable' && scenarios.includes(c.claimScenario))
          const highPri = actionable(['A', 'F'])
          const checkFirst = actionable(['B', 'C'])
          const disputes = actionable(['D'])
          const filed = claims.filter(c => ['submitted', 'filed', 'approved'].includes(c.status))
          const resolved = claims.filter(c => c.status === 'resolved')
          const sum = (cs: Claim[]) => cs.reduce((s, c) => s + c.amount, 0)
          return (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard
                icon={<AlertTriangle className="w-5 h-5" />}
                label="高优先级 (A+F)"
                value={`${highPri.length} claims`}
                sub={fmtUSD(sum(highPri))}
                accent="bg-rose-50 text-rose-600"
              />
              <KpiCard
                icon={<DollarSign className="w-5 h-5" />}
                label="先查 IDR (B+C)"
                value={`${checkFirst.length} claims`}
                sub={fmtUSD(sum(checkFirst))}
                accent="bg-amber-50 text-amber-600"
              />
              <KpiCard
                icon={<Clock className="w-5 h-5" />}
                label="争议 (D)"
                value={`${disputes.length} claims`}
                sub={fmtUSD(sum(disputes))}
                accent="bg-orange-50 text-orange-600"
              />
              <KpiCard
                icon={<CheckCircle2 className="w-5 h-5" />}
                label="已提交"
                value={`${filed.length} claims`}
                sub={summary?.auditDate ? `审计 ${summary.auditDate}` : summary?.period || ''}
                accent="bg-purple-50 text-purple-600"
              />
              <KpiCard
                icon={<CheckCircle2 className="w-5 h-5" />}
                label="已自动赔偿"
                value={`${resolved.length} claims`}
                sub={fmtUSD(sum(resolved))}
                accent="bg-emerald-50 text-emerald-600"
              />
            </div>
          )
        })()}

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
              {['actionable', 'pending', 'submitted', 'filed', 'approved', 'resolved', 'denied'].map(s => (
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

        {/* Table / Group View */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-slate-900 text-sm">
                Claims
                <span className="ml-2 text-slate-400 font-normal text-xs">{total} records</span>
              </h2>
              {/* View mode tabs */}
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'px-3 py-1 font-medium transition-colors',
                    viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  )}
                >
                  列表
                </button>
                <button
                  onClick={() => setViewMode('grouped')}
                  className={cn(
                    'px-3 py-1 font-medium transition-colors border-l border-slate-200',
                    viewMode === 'grouped' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  )}
                >
                  按 FNSKU 分组
                </button>
              </div>
            </div>
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
          ) : viewMode === 'grouped' ? (
            <div className="p-4">
              <FnSkuGroupView claims={claims} onViewCase={setSelectedClaim} onFilingComplete={load} />
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
                    <th className="px-4 py-3 text-left hidden lg:table-cell">FNSKU</th>
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
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        {claim.fnsku ? <OrderIdCell orderId={claim.fnsku} /> : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs hidden lg:table-cell font-mono">{claim.asin || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs hidden lg:table-cell max-w-[140px] truncate">{displayReason(claim.reason, claim.claimScenario)}</td>
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
