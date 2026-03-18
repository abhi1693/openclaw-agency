'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardPageLayout } from '@/components/templates/DashboardPageLayout'
import {
  Ship, Plus, RefreshCw, ChevronDown, ChevronRight,
  Anchor, MapPin, Package, DollarSign, X, Loader2, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContainerMove {
  id: number
  shipment_id: number
  date: string
  move_type: string
  location: string
  vessel_voyage: string | null
  created_at: string
}

interface ShipmentEvent {
  id: number
  shipment_id: number
  event_type: string
  description: string
  location: string
  vessel_name: string
  event_at: string | null
  source: string
  created_at: string
}

interface Shipment {
  id: number
  booking_number: string
  container_number: string
  bl_number: string
  carrier: string
  carrier_scac: string
  vessel_name: string
  voyage_number: string
  place_of_receipt: string
  port_of_loading: string
  port_of_discharge: string
  place_of_delivery: string
  container_type: string
  service_type: string
  cargo_quantity: string
  cbm: string | null
  weight_kg: number
  tare_weight_kg: number | null
  weight_method: string
  vgm_weight: number | null
  pickup_date: string | null
  pickup_depot: string
  full_in_date: string | null
  full_return_to: string
  vgm_cutoff_date: string | null
  cutoff_date: string | null
  etd: string | null
  eta: string | null
  estimated_on_board_date: string | null
  issue_date: string | null
  actual_departure: string | null
  actual_arrival: string | null
  status: string
  last_event: string
  last_event_at: string | null
  tracking_source: string
  stowage_code: string
  exchange_rate: string | null
  description: string
  supplier: string
  reference: string
  notes: string
  freight_cost: string
  customs_cost: string
  other_cost: string
  created_at: string
  updated_at: string
  events?: ShipmentEvent[]
}

interface DashboardData {
  in_transit: number
  arriving_soon: number
  year_total: number
  total_freight_cost: number
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  booked: '已订舱',
  departed: '已出发',
  in_transit: '在途',
  arrived: '已到港',
  discharged: '已卸货',
  picked_up: '已提柜',
  delivered: '已送达',
  delayed: '延误',
}

const STATUS_COLOR: Record<string, string> = {
  booked:    'bg-slate-100 text-slate-600',
  departed:  'bg-green-100 text-green-700',
  in_transit:'bg-blue-100 text-blue-700',
  arrived:   'bg-yellow-100 text-yellow-700',
  discharged:'bg-orange-100 text-orange-700',
  picked_up: 'bg-purple-100 text-purple-700',
  delivered: 'bg-slate-200 text-slate-500',
  delayed:   'bg-red-100 text-red-700',
}

const CARRIERS = [
  'Evergreen', 'COSCO', 'OOCL', 'Yang Ming', 'ONE',
  'Maersk', 'MSC', 'Hapag-Lloyd', 'CMA CGM',
]

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  return Math.round(diff / 86_400_000)
}

function totalCost(s: Shipment): number {
  return (parseFloat(s.freight_cost) || 0)
       + (parseFloat(s.customs_cost) || 0)
       + (parseFloat(s.other_cost) || 0)
}

// Derive a short status badge label from the latest container move_type
function moveStatusBadge(moves: ContainerMove[]): { label: string; color: string } | null {
  if (!moves.length) return null
  const latest = moves[moves.length - 1].move_type.toLowerCase()
  if (latest.includes('loaded')) return { label: 'Loaded', color: 'bg-blue-100 text-blue-700' }
  if (latest.includes('discharged') || latest.includes('unloaded')) return { label: 'Discharged', color: 'bg-orange-100 text-orange-700' }
  if (latest.includes('received')) return { label: 'Received', color: 'bg-green-100 text-green-700' }
  if (latest.includes('pick-up') || latest.includes('pickup')) return { label: 'Picked Up', color: 'bg-purple-100 text-purple-700' }
  if (latest.includes('deliver')) return { label: 'Delivered', color: 'bg-slate-200 text-slate-500' }
  return { label: 'In Transit', color: 'bg-yellow-100 text-yellow-700' }
}

// ─── Container Moves Section ──────────────────────────────────────────────────

interface ContainerMovesSectionProps {
  shipmentId: number
  containerNumber: string
}

function ContainerMovesSection({ shipmentId, containerNumber }: ContainerMovesSectionProps) {
  const [moves, setMoves] = useState<ContainerMove[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: '', move_type: '', location: '', vessel_voyage: '' })

  const loadMoves = useCallback(async () => {
    const res = await fetch(`/api/shipments/${shipmentId}/moves`)
    if (res.ok) {
      const d = await res.json()
      setMoves(d.moves ?? [])
    }
    setLoading(false)
  }, [shipmentId])

  useEffect(() => { loadMoves() }, [loadMoves])

  async function addMove(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.move_type) return
    setSaving(true)
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/moves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          move_type: form.move_type,
          location: form.location,
          vessel_voyage: form.vessel_voyage || null,
        }),
      })
      if (res.ok) {
        setForm({ date: '', move_type: '', location: '', vessel_voyage: '' })
        setShowForm(false)
        await loadMoves()
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteMove(moveId: number) {
    await fetch(`/api/shipments/${shipmentId}/moves/${moveId}`, { method: 'DELETE' })
    await loadMoves()
  }

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const badge = moveStatusBadge(moves)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Container Moves : {containerNumber}
          </h4>
          {badge && (
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', badge.color)}>
              {badge.label}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition font-medium"
        >
          <Plus className="w-3 h-3" />
          添加
        </button>
      </div>

      {showForm && (
        <form onSubmit={addMove} className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
          <div>
            <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">日期 *</label>
            <input
              value={form.date}
              onChange={setField('date')}
              placeholder="2026-03-12"
              required
              className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:placeholder-slate-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">动作 *</label>
            <input
              value={form.move_type}
              onChange={setField('move_type')}
              placeholder="Loaded (FCL) on vessel"
              required
              className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:placeholder-slate-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">地点</label>
            <input
              value={form.location}
              onChange={setField('location')}
              placeholder="YANTIAN, CHINA (CN)"
              className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:placeholder-slate-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">船名/航次</label>
            <input
              value={form.vessel_voyage}
              onChange={setField('vessel_voyage')}
              placeholder="EVER MILD 1445-009E"
              className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:placeholder-slate-500"
            />
          </div>
          <div className="col-span-2 flex justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1 rounded text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1 rounded text-xs bg-blue-600 text-white font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              保存
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>加载中…</span>
        </div>
      ) : moves.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-400 dark:text-slate-500 italic mb-2">暂无移动记录</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            点击上方{' '}
            <span className="text-blue-600 dark:text-blue-400 font-medium">「添加」</span>
            {' '}按钮手动录入
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Container Moves</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Location</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Vessel Voyage</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m, i) => (
                <tr
                  key={m.id}
                  className={cn(i % 2 === 0
                    ? 'bg-white dark:bg-slate-900'
                    : 'bg-slate-50 dark:bg-slate-800/50',
                    'border-b border-slate-100 dark:border-slate-700 last:border-0')}
                >
                  <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">{m.date}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{m.move_type}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{m.location || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{m.vessel_voyage || '—'}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => deleteMove(m.id)}
                      className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition"
                      title="删除"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Add Shipment Modal ───────────────────────────────────────────────────────

interface AddModalProps {
  onClose: () => void
  onCreated: () => void
}

function AddShipmentModal({ onClose, onCreated }: AddModalProps) {
  const [form, setForm] = useState({
    booking_number: '',
    carrier: 'Evergreen',
    carrier_scac: '',
    vessel_name: '',
    voyage_number: '',
    port_of_loading: '',
    port_of_discharge: '',
    container_type: '',
    weight_kg: '',
    etd: '',
    eta: '',
    description: '',
    supplier: '',
    reference: '',
    notes: '',
    freight_cost: '',
    customs_cost: '',
    other_cost: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.booking_number.trim()) { setError('订舱号不能为空'); return }
    setSaving(true); setError('')
    try {
      const payload: Record<string, unknown> = { ...form }
      if (form.weight_kg) payload.weight_kg = parseInt(form.weight_kg)
      else delete payload.weight_kg
      if (form.freight_cost) payload.freight_cost = parseFloat(form.freight_cost)
      else delete payload.freight_cost
      if (form.customs_cost) payload.customs_cost = parseFloat(form.customs_cost)
      else delete payload.customs_cost
      if (form.other_cost) payload.other_cost = parseFloat(form.other_cost)
      else delete payload.other_cost
      if (!form.etd) delete payload.etd
      if (!form.eta) delete payload.eta

      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || '创建失败')
      }
      onCreated()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <Ship className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">添加柜子</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          {/* Basic */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">订舱号 <span className="text-red-500">*</span></label>
              <input
                value={form.booking_number}
                onChange={set('booking_number')}
                placeholder="e.g. 147600270372"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">船公司</label>
              <select
                value={form.carrier}
                onChange={set('carrier')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {CARRIERS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">柜型</label>
              <input
                value={form.container_type}
                onChange={set('container_type')}
                placeholder="e.g. 40'HC"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Vessel */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">船名</label>
              <input value={form.vessel_name} onChange={set('vessel_name')} placeholder="e.g. EVER MILD"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">航次</label>
              <input value={form.voyage_number} onChange={set('voyage_number')} placeholder="e.g. 1445-009E"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">装货港 (POL)</label>
              <input value={form.port_of_loading} onChange={set('port_of_loading')} placeholder="e.g. YANTIAN"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">卸货港 (POD)</label>
              <input value={form.port_of_discharge} onChange={set('port_of_discharge')} placeholder="e.g. LOS ANGELES"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ETD (预计离港)</label>
              <input type="date" value={form.etd} onChange={set('etd')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ETA (预计到港)</label>
              <input type="date" value={form.eta} onChange={set('eta')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Business */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">货物描述</label>
              <input value={form.description} onChange={set('description')} placeholder="e.g. Hand sanitizer, 500 cartons"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">供应商</label>
              <input value={form.supplier} onChange={set('supplier')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">内部参考号</label>
              <input value={form.reference} onChange={set('reference')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">毛重 (KG)</label>
              <input type="number" value={form.weight_kg} onChange={set('weight_kg')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Costs */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">费用（选填）</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">运费 ($)</label>
                <input type="number" step="0.01" value={form.freight_cost} onChange={set('freight_cost')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">关务费 ($)</label>
                <input type="number" step="0.01" value={form.customs_cost} onChange={set('customs_cost')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">其他 ($)</label>
                <input type="number" step="0.01" value={form.other_cost} onChange={set('other_cost')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition">
              取消
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 rounded-lg text-sm bg-blue-600 text-white font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              添加
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Shipment Row ─────────────────────────────────────────────────────────────

interface ShipmentRowProps {
  shipment: Shipment
  onRefresh: (id: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
  refreshing: boolean
}

function ShipmentRow({ shipment: s, onRefresh, onDelete, refreshing }: ShipmentRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<Shipment | null>(null)
  const [loading, setLoading] = useState(false)

  async function expand() {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (!detail) {
      setLoading(true)
      try {
        const res = await fetch(`/api/shipments/${s.id}`)
        if (res.ok) setDetail(await res.json())
      } finally {
        setLoading(false)
      }
    }
  }

  const days = daysUntil(s.eta)
  const route = [s.port_of_loading, s.port_of_discharge].filter(Boolean).join(' → ')
  const cost = totalCost(s)

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer"
        onClick={expand}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            }
            <div>
              <p className="text-sm font-semibold text-slate-800">{s.booking_number}</p>
              {s.container_number && (
                <p className="text-xs text-slate-500">{s.container_number}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-slate-700">{s.vessel_name || '—'}</p>
          {s.voyage_number && <p className="text-xs text-slate-500">{s.voyage_number}</p>}
        </td>
        <td className="px-4 py-3">
          <p className="text-sm text-slate-700">{route || '—'}</p>
          {s.carrier && <p className="text-xs text-slate-500">{s.carrier}</p>}
        </td>
        <td className="px-4 py-3 text-sm text-slate-700">{fmtDate(s.etd)}</td>
        <td className="px-4 py-3">
          <p className="text-sm text-slate-700">{fmtDate(s.eta)}</p>
          {days !== null && days >= 0 && days <= 14 && (
            <p className={cn('text-xs font-medium', days <= 3 ? 'text-red-600' : days <= 7 ? 'text-orange-600' : 'text-slate-500')}>
              {days === 0 ? '今天到' : `${days}天后`}
            </p>
          )}
        </td>
        <td className="px-4 py-3">
          <span className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
            STATUS_COLOR[s.status] ?? STATUS_COLOR.booked,
          )}>
            {STATUS_LABEL[s.status] ?? s.status}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">
          {cost > 0 ? `$${cost.toLocaleString()}` : '—'}
        </td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onRefresh(s.id)}
              disabled={refreshing}
              title="从 ShipmentLink 刷新"
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition disabled:opacity-40"
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            </button>
            <button
              onClick={() => onDelete(s.id)}
              title="删除"
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-200">
          <td colSpan={8} className="px-6 py-4">
            {loading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>加载中…</span>
              </div>
            ) : detail ? (
              <div className="space-y-5">
                {/* Row 1: Basic Info + Container Activity */}
                <div className="grid grid-cols-2 gap-5">
                  {/* Basic Information */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Basic Information</h4>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      {([
                        ['收货地', detail.place_of_receipt],
                        ['装货港 (POL)', detail.port_of_loading],
                        ['卸货港 (POD)', detail.port_of_discharge],
                        ['交货地', detail.place_of_delivery],
                        ['VGM截止', fmtDate(detail.vgm_cutoff_date)],
                        ['截关日', fmtDate(detail.cutoff_date)],
                        ['ETD', fmtDate(detail.etd)],
                        ['ETA', fmtDate(detail.eta)],
                        ['预计上船', fmtDate(detail.estimated_on_board_date)],
                        ['签单日期', fmtDate(detail.issue_date)],
                        ['汇率', detail.exchange_rate || ''],
                        ['订舱状态', detail.status ? (STATUS_LABEL[detail.status] ?? detail.status) : ''],
                        ['积载码', detail.stowage_code],
                        ['提单号', detail.bl_number],
                      ] as [string, string][]).filter(([, v]) => v && v !== '—').map(([k, v]) => (
                        <div key={k} className="flex flex-col">
                          <dt className="text-[11px] text-slate-400 font-medium">{k}</dt>
                          <dd className="text-slate-700 font-medium text-sm">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {detail.last_event && (
                      <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-800 mt-1">
                        <span className="font-semibold">最新动态: </span>{detail.last_event}
                      </div>
                    )}
                    {detail.notes && (
                      <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600 mt-1">
                        <span className="font-semibold">备注: </span>{detail.notes}
                      </div>
                    )}
                  </div>

                  {/* Container Activity Information */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Container Activity Information</h4>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      {([
                        ['柜号', detail.container_number],
                        ['柜型', detail.container_type],
                        ['服务类型', detail.service_type],
                        ['货物数量', detail.cargo_quantity],
                        ['体积 (CBM)', detail.cbm ? `${parseFloat(detail.cbm).toFixed(4)} CBM` : ''],
                        ['毛重', detail.weight_kg ? `${detail.weight_kg.toLocaleString()} KG` : ''],
                        ['皮重', detail.tare_weight_kg ? `${detail.tare_weight_kg.toLocaleString()} KG` : ''],
                        ['称重方式', detail.weight_method],
                        ['VGM', detail.vgm_weight ? `${detail.vgm_weight.toLocaleString()} KG` : ''],
                        ['提柜日期', fmtDate(detail.pickup_date)],
                        ['提柜地点', detail.pickup_depot],
                        ['重箱进场', fmtDate(detail.full_in_date)],
                        ['还箱地点', detail.full_return_to],
                        ['船名/航次', [detail.vessel_name, detail.voyage_number].filter(Boolean).join(' / ')],
                        ['供应商', detail.supplier],
                        ['参考号', detail.reference],
                        ['货物描述', detail.description],
                      ] as [string, string][]).filter(([, v]) => v && v !== '—').map(([k, v]) => (
                        <div key={k} className="flex flex-col">
                          <dt className="text-[11px] text-slate-400 font-medium">{k}</dt>
                          <dd className="text-slate-700 font-medium text-sm">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>

                {/* Row 2: Container Moves */}
                <ContainerMovesSection shipmentId={detail.id} containerNumber={detail.container_number} />

                {/* Row 3: Tracking Timeline */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    追踪时间线 ({detail.events?.length ?? 0} 条记录)
                  </h4>
                  {detail.events && detail.events.length > 0 ? (
                    <ol className="flex flex-wrap gap-3">
                      {detail.events.map((ev, i) => (
                        <li key={ev.id ?? i} className="flex-1 min-w-[200px] bg-slate-50 rounded-lg px-3 py-2">
                          <p className="text-sm font-medium text-slate-700">{ev.description || ev.event_type}</p>
                          {ev.location && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{ev.location}</p>}
                          {ev.event_at && <p className="text-xs text-slate-400 mt-0.5">{fmtDate(ev.event_at)}</p>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-slate-400 italic">
                      暂无追踪记录 — 点击刷新按钮从 ShipmentLink 获取
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [refreshingId, setRefreshingId] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, dashRes] = await Promise.all([
        fetch('/api/shipments'),
        fetch('/api/shipments/dashboard'),
      ])
      if (listRes.ok) {
        const d = await listRes.json()
        setShipments(d.shipments ?? [])
      }
      if (dashRes.ok) {
        setDashboard(await dashRes.json())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRefresh = useCallback(async (id: number) => {
    setRefreshingId(id)
    try {
      const res = await fetch(`/api/shipments/${id}/refresh`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || data?.detail || '刷新失败，请稍后重试')
      }
      setToast('✅ 追踪信息已刷新')
      setTimeout(() => setToast(null), 3000)
      await load()
    } catch (err) {
      setToast(`❌ ${err instanceof Error ? err.message : '刷新失败，请稍后重试'}`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setRefreshingId(null)
    }
  }, [load])

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('确定删除这条记录？')) return
    await fetch(`/api/shipments/${id}`, { method: 'DELETE' })
    await load()
  }, [load])

  const filtered = shipments.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || (
      s.booking_number.toLowerCase().includes(q) ||
      s.vessel_name.toLowerCase().includes(q) ||
      s.container_number.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.supplier.toLowerCase().includes(q)
    )
    const matchStatus = !statusFilter || s.status === statusFilter
    return matchSearch && matchStatus
  })

  const statusOptions = [
    { value: '', label: '全部状态' },
    ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l })),
  ]

  return (
    <DashboardPageLayout
      title="🚢 海运追踪"
      description="集装箱状态追踪，数据来自 ShipmentLink"
      signedOut={{ message: 'Sign in to view shipments', forceRedirectUrl: '/shipments' }}
      headerActions={
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          添加柜子
        </button>
      }
    >
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: '在途柜数',
            value: loading ? '…' : String(dashboard?.in_transit ?? 0),
            icon: <Ship className="w-5 h-5 text-blue-500" />,
            color: 'text-blue-700',
          },
          {
            label: '7天内到港',
            value: loading ? '…' : String(dashboard?.arriving_soon ?? 0),
            icon: <Anchor className="w-5 h-5 text-orange-500" />,
            color: 'text-orange-700',
          },
          {
            label: '今年总柜数',
            value: loading ? '…' : String(dashboard?.year_total ?? 0),
            icon: <Package className="w-5 h-5 text-slate-500" />,
            color: 'text-slate-700',
          },
          {
            label: '今年运费合计',
            value: loading ? '…' : `$${(dashboard?.total_freight_cost ?? 0).toLocaleString()}`,
            icon: <DollarSign className="w-5 h-5 text-green-500" />,
            color: 'text-green-700',
          },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
            <div className="p-2 bg-slate-50 rounded-xl">{card.icon}</div>
            <div>
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className={cn('text-2xl font-bold', card.color)}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索订舱号、船名、描述…"
          className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
        >
          {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={load}
          className="p-2 rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 transition text-slate-500"
          title="刷新列表"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['订舱号', '船名/航次', '路线', 'ETD', 'ETA', '状态', '费用', '操作'].map(h => (
                  <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>加载中…</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">
                    {search || statusFilter ? '没有匹配的记录' : '暂无海运记录，点击「添加柜子」开始追踪'}
                  </td>
                </tr>
              ) : (
                filtered.map(s => (
                  <ShipmentRow
                    key={s.id}
                    shipment={s}
                    onRefresh={handleRefresh}
                    onDelete={handleDelete}
                    refreshing={refreshingId === s.id}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400 text-center">
        追踪数据来自 ShipmentLink。点击刷新按钮获取最新状态（Playwright 抓取，约需 30 秒）。
      </p>

      {showAdd && (
        <AddShipmentModal
          onClose={() => setShowAdd(false)}
          onCreated={load}
        />
      )}
    </DashboardPageLayout>
  )
}
