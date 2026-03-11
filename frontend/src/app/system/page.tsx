'use client'
import { useEffect, useState, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Cpu, MemoryStick, HardDrive, Clock, Monitor, Zap, RefreshCw, Bot, Coins, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'
import { DashboardPageLayout } from '@/components/templates/DashboardPageLayout'
import CronCalendar from '@/components/system/CronCalendar'
import { getLocalAuthToken, isLocalAuthMode } from '@/auth/localAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HardwareData {
  cpu: string; cores: number
  ramTotal: number; ramUsed: number; ramPct: number
  diskTotal: number; diskUsed: number; diskFree: number; diskUsedPct: number
  uptime: string; osVersion: string; model: string
}

interface ModelStat {
  id: string; name: string; provider: string
  inputTokens: number; outputTokens: number; totalTokens: number
  cost: number; sessions: number
}

interface UsageData {
  models: ModelStat[]
  totalTokens: number
  totalCost: number
}

interface CronJob {
  id: string
  name: string
  agentId?: string
  schedule: { kind: string; expr?: string; tz?: string } | string
  payload?: { model?: string; kind?: string }
  enabled: boolean
  state?: {
    lastRunAtMs?: number
    lastRunStatus?: string
    lastStatus?: string
    nextRunAtMs?: number
    consecutiveErrors?: number
  }
}

interface CronJobsData {
  jobs: CronJob[]
}

// ─── Cron → Human Readable ───────────────────────────────────────────────────

function cronToHuman(expr: string): string {
  if (!expr || expr === '—') return expr
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr
  const [minStr, hourStr, dom, mon, dow] = parts

  const fmtTime = (h: string, m: string) => {
    const hNum = parseInt(h)
    const mNum = parseInt(m)
    if (isNaN(hNum) || isNaN(mNum)) return null
    if (mNum === 0) return `${String(hNum).padStart(2, '0')}:00`
    return `${String(hNum).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`
  }

  // Multi-hour daily: "0 0,6,12,18 * * *" → "每天 0/6/12/18 时"
  if (dom === '*' && mon === '*' && dow === '*' && hourStr.includes(',') && minStr === '0') {
    const hours = hourStr.split(',').join('/')
    return `每天 ${hours} 时`
  }

  const time = fmtTime(hourStr, minStr)
  if (!time) return expr

  // Daily: "0 5 * * *" → "每天 05:00"
  if (dom === '*' && mon === '*' && dow === '*') {
    return `每天 ${time}`
  }

  // Weekly with range "1-6": "0 4 * * 1-6" → "周一至六 04:00"
  if (dom === '*' && mon === '*' && dow !== '*' && !dow.includes(',')) {
    const DOW_NAMES = ['日', '一', '二', '三', '四', '五', '六']
    if (dow.includes('-')) {
      const [start, end] = dow.split('-').map(Number)
      if (!isNaN(start) && !isNaN(end) && start >= 0 && end <= 6) {
        return `周${DOW_NAMES[start]}至${DOW_NAMES[end]} ${time}`
      }
    }
    // Single weekday: "0 4 * * 1" → "每周一 04:00"
    const d = parseInt(dow)
    if (!isNaN(d) && d >= 0 && d <= 6) {
      if (d === 0) return `每周日 ${time}`
      return `每周${DOW_NAMES[d]} ${time}`
    }
  }

  // Monthly multi-day: "0 4 8,22 * *" → "每月8/22号 04:00"
  if (dom.includes(',') && mon === '*' && dow === '*') {
    const days = dom.split(',').join('/')
    return `每月${days}号 ${time}`
  }

  // Monthly single day: "0 7 1 * *" → "每月1号 07:00"
  if (dom !== '*' && !dom.includes('/') && mon === '*' && dow === '*') {
    const day = parseInt(dom)
    if (!isNaN(day) && day >= 1 && day <= 31) {
      return `每月${day}号 ${time}`
    }
  }

  return expr
}

// ─── Cron Schedule Helpers ───────────────────────────────────────────────────

type CronFrequency = 'daily' | 'weekly' | 'monthly' | 'custom'

interface CronScheduleState {
  frequency: CronFrequency
  hour: number
  minute: number
  weekDays: number[]   // cron DOW: 0=Sun,1=Mon,...,6=Sat
  monthDay: number     // 1–31
  customExpr: string
}

function parseCronToState(expr: string): CronScheduleState {
  const parts = expr.trim().split(/\s+/)
  const base: CronScheduleState = { frequency: 'custom', hour: 9, minute: 0, weekDays: [1], monthDay: 1, customExpr: expr }
  if (parts.length !== 5) return base
  const [minStr, hourStr, dom, mon, dow] = parts
  const m = parseInt(minStr); const h = parseInt(hourStr)
  if (isNaN(m) || isNaN(h) || minStr.includes('/') || hourStr.includes('/')) return base
  // Daily
  if (dom === '*' && mon === '*' && dow === '*')
    return { ...base, frequency: 'daily', hour: h, minute: m }
  // Weekly
  if (dom === '*' && mon === '*' && dow !== '*') {
    const days = dow.split(',').map(d => parseInt(d)).filter(d => !isNaN(d) && d >= 0 && d <= 6)
    if (days.length > 0) return { ...base, frequency: 'weekly', hour: h, minute: m, weekDays: days }
  }
  // Monthly
  if (dom !== '*' && !dom.includes('/') && !dom.includes(',') && mon === '*' && dow === '*') {
    const day = parseInt(dom)
    if (!isNaN(day) && day >= 1 && day <= 31) return { ...base, frequency: 'monthly', hour: h, minute: m, monthDay: day }
  }
  return base
}

function generateCronFromState(s: CronScheduleState): string {
  if (s.frequency === 'custom') return s.customExpr
  const min = s.minute; const hr = s.hour
  if (s.frequency === 'daily')   return `${min} ${hr} * * *`
  if (s.frequency === 'weekly')  return `${min} ${hr} * * ${s.weekDays.length ? s.weekDays.join(',') : '1'}`
  if (s.frequency === 'monthly') return `${min} ${hr} ${s.monthDay} * *`
  return s.customExpr
}

const FREQ_LABELS: { key: CronFrequency; label: string }[] = [
  { key: 'daily',   label: '每天' },
  { key: 'weekly',  label: '每周' },
  { key: 'monthly', label: '每月' },
  { key: 'custom',  label: '自定义' },
]

const DOW_LABELS = ['日', '一', '二', '三', '四', '五', '六'] // index = cron DOW (0=Sun)

function CronScheduleEditor({
  value, onChange
}: {
  value: CronScheduleState
  onChange: (s: CronScheduleState) => void
}) {
  const expr = generateCronFromState(value)

  function set(patch: Partial<CronScheduleState>) {
    onChange({ ...value, ...patch })
  }

  function toggleDay(d: number) {
    const days = value.weekDays.includes(d)
      ? value.weekDays.filter(x => x !== d)
      : [...value.weekDays, d].sort((a, b) => a - b)
    set({ weekDays: days.length ? days : [d] })
  }

  const inputCls = "w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]"
  const selectCls = inputCls + " appearance-none"

  return (
    <div className="space-y-3">
      {/* Frequency */}
      <div>
        <label className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-semibold block mb-1.5">频率</label>
        <div className="flex gap-1.5 flex-wrap">
          {FREQ_LABELS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => set({ frequency: key })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                value.frequency === key
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]'
                  : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
              }`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Time: hour + minute (shown for all except custom) */}
      {value.frequency !== 'custom' && (
        <div>
          <label className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-semibold block mb-1.5">时间</label>
          <div className="flex gap-2 items-center">
            <select className={selectCls + " flex-1"} value={value.hour} onChange={e => set({ hour: +e.target.value })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')} 时</option>
              ))}
            </select>
            <span className="text-[hsl(var(--muted-foreground))] text-sm">:</span>
            <select className={selectCls + " flex-1"} value={value.minute} onChange={e => set({ minute: +e.target.value })}>
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(min => (
                <option key={min} value={min}>{String(min).padStart(2, '0')} 分</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Weekly: day-of-week checkboxes */}
      {value.frequency === 'weekly' && (
        <div>
          <label className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-semibold block mb-1.5">周几</label>
          <div className="flex gap-1">
            {DOW_LABELS.map((lbl, d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`w-8 h-8 rounded-lg text-xs font-medium border transition-colors ${
                  value.weekDays.includes(d)
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]'
                    : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                }`}
              >{lbl}</button>
            ))}
          </div>
        </div>
      )}

      {/* Monthly: day-of-month */}
      {value.frequency === 'monthly' && (
        <div>
          <label className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-semibold block mb-1.5">几号</label>
          <Input
            type="number"
            min={1}
            max={31}
            value={value.monthDay}
            onChange={e => set({ monthDay: Math.min(31, Math.max(1, +e.target.value)) })}
          />
        </div>
      )}

      {/* Custom: raw cron input */}
      {value.frequency === 'custom' && (
        <div>
          <label className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-semibold block mb-1.5">Cron 表达式</label>
          <Input
            className="font-mono"
            value={value.customExpr}
            onChange={e => set({ customExpr: e.target.value })}
            placeholder="0 9 * * *"
          />
        </div>
      )}

      {/* Preview */}
      <div className="rounded-lg bg-[hsl(var(--secondary)/0.5)] border border-[hsl(var(--border)/0.5)] px-3 py-2">
        <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-semibold">Cron 预览</span>
        <p className="text-sm font-mono text-[hsl(var(--foreground))] mt-0.5">{expr || '—'}</p>
      </div>
    </div>
  )
}

// ─── Helper components ───────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, accent, children
}: {
  icon: React.ElementType; label: string; value: string; sub?: string
  accent?: boolean; children?: React.ReactNode
}) {
  return (
    <div className={`relative rounded-xl border bg-[hsl(var(--card))] p-4 overflow-hidden transition-all hover:border-[hsl(var(--border)/1.5)] ${accent ? 'border-[hsl(var(--primary)/0.3)] shadow-[0_0_24px_hsl(var(--primary)/0.06)]' : 'border-[hsl(var(--border))]'}`}>
      {accent && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--primary)/0.5)] to-transparent" />}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] font-semibold">{label}</p>
          <p className={`text-xl font-bold mt-1 leading-tight ${accent ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]'}`}>{value}</p>
          {sub && <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg flex-shrink-0 ${accent ? 'bg-[hsl(var(--primary)/0.12)]' : 'bg-[hsl(var(--secondary))]'}`}>
          <Icon className={`w-4 h-4 ${accent ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`} />
        </div>
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}

function UsageBar({ pct, warn = 70, danger = 88 }: { pct: number; warn?: number; danger?: number }) {
  const color = pct >= danger ? 'bg-[hsl(var(--zv-red))]' : pct >= warn ? 'bg-[hsl(var(--zv-amber))]' : 'bg-[hsl(var(--primary))]'
  return (
    <div className="w-full bg-[hsl(var(--secondary))] rounded-full h-1.5 overflow-hidden mt-2">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// Build auth headers for server-side proxied routes (local auth mode)
function buildAuthHeaders(): Record<string, string> {
  if (!isLocalAuthMode()) return {}
  const token = getLocalAuthToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function SystemPageContent({ forceRefresh, onAutoRefresh }: { forceRefresh: number; onAutoRefresh: () => void }) {
  const [hw,  setHw]  = useState<HardwareData | null>(null)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [hwLoading,    setHwLoading]    = useState(true)
  const [usageLoading, setUsageLoading] = useState(true)

  const [cronJobs, setCronJobs] = useState<CronJobsData | null>(null)
  const [cronError, setCronError] = useState<string | null>(null)
  const [cronLoading, setCronLoading] = useState(true)
  const [editJob, setEditJob] = useState<CronJob | null>(null)
  const [editForm, setEditForm] = useState({ model: '', enabled: true })
  const [editSchedule, setEditSchedule] = useState<CronScheduleState>({ frequency: 'daily', hour: 9, minute: 0, weekDays: [1], monthDay: 1, customExpr: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [activeTab, setActiveTab] = useState<'system' | 'cron'>('system')

  // AI Model Usage: shows top 5 by default, expandable for all
  const [usageExpanded, setUsageExpanded] = useState(false)
  const TOP_N = 5

  const loadHardware = useCallback(async () => {
    try {
      const res = await fetch('/api/system/hardware')
      if (res.ok) setHw(await res.json())
    } catch { /* ignore */ }
    finally { setHwLoading(false) }
  }, [])

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/system/model-usage')
      if (res.ok) setUsage(await res.json())
    } catch { /* ignore */ }
    finally { setUsageLoading(false) }
  }, [])

  const loadCronJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/system/cron-jobs', {
        headers: buildAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.error) { setCronError(data.error) }
        else {
          // API returns {jobs: {jobs: [...], total, ...}} — unwrap
          const inner = data?.jobs
          const list = Array.isArray(inner) ? inner : Array.isArray(inner?.jobs) ? inner.jobs : []
          setCronJobs({ jobs: list })
        }
      } else {
        setCronError('Gateway 不可用')
      }
    } catch { setCronError('Gateway 不可用') }
    finally { setCronLoading(false) }
  }, [])

  function openEdit(job: CronJob) {
    const sched = typeof job.schedule === 'string' ? job.schedule : (job.schedule as { expr?: string })?.expr || ''
    const model = job.payload?.model || job.agentId || ''
    setEditJob(job)
    setEditForm({ model, enabled: job.enabled })
    setEditSchedule(parseCronToState(sched))
    setEditError(null)
  }

  async function saveEdit() {
    if (!editJob) return
    setEditSaving(true)
    setEditError(null)
    try {
      const payload = { ...editForm, schedule: generateCronFromState(editSchedule) }
      const res = await fetch(`/api/system/cron-jobs/${editJob.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setEditError(data.error || '保存失败')
      } else {
        setEditJob(null)
        setToast({ msg: '✅ 保存成功', ok: true })
        setTimeout(() => setToast(null), 3000)
        await loadCronJobs()
      }
    } catch {
      setEditError('网络错误，请重试')
    } finally {
      setEditSaving(false)
    }
  }

  useEffect(() => {
    setHwLoading(true)
    setUsageLoading(true)
    setCronLoading(true)
    setCronError(null)
    loadHardware()
    loadUsage()
    loadCronJobs()
  }, [forceRefresh, loadHardware, loadUsage, loadCronJobs])

  // Auto-refresh hardware every 30s
  useEffect(() => {
    const t = setInterval(() => {
      loadHardware()
      onAutoRefresh()
    }, 30_000)
    return () => clearInterval(t)
  }, [loadHardware, onAutoRefresh])

  // Auto-refresh cron jobs every 60s
  useEffect(() => {
    const t = setInterval(() => {
      loadCronJobs()
    }, 60_000)
    return () => clearInterval(t)
  }, [loadCronJobs])

  const maxTokens = usage?.models[0]?.totalTokens ?? 1

  // Models to show in table: top 5 when collapsed, all when expanded
  const displayedModels = usage
    ? usageExpanded ? usage.models : usage.models.slice(0, TOP_N)
    : []

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex gap-1 mb-6 bg-[hsl(var(--secondary)/0.5)] rounded-xl p-1 w-fit">
        {[
          { key: 'system', label: '🖥️ 系统 & 模型' },
          { key: 'cron', label: '⏰ 定时任务' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as 'system' | 'cron')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'system' && (
        <>
          {/* ── Section: Mac Hardware ── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Monitor className="w-4 h-4 text-[hsl(var(--primary))]" />
              <h2 className="text-base font-semibold text-[hsl(var(--foreground))] uppercase tracking-wider">Mac Hardware</h2>
              <div className="h-px flex-1 bg-[hsl(var(--border))]" />
              {hw && <Badge variant="outline" className="text-[9px] px-1.5 h-4 border-[hsl(var(--primary)/0.3)] text-[hsl(var(--primary))]">macOS {hw.osVersion}</Badge>}
            </div>

            {hwLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
            ) : hw ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="col-span-2 lg:col-span-2">
                  <StatCard
                    icon={Cpu} label="处理器" accent
                    value={hw.cpu.replace('Apple ', '').replace('(TM)', '™').replace('(R)', '®')}
                    sub={`${hw.cores} 逻辑核心`}
                  />
                </div>

                <StatCard
                  icon={Monitor} label="机型"
                  value={hw.model.replace('Mac', 'Mac ')}
                  sub={`运行 ${hw.uptime}`}
                />

                <StatCard
                  icon={MemoryStick} label="内存"
                  value={`${hw.ramUsed} GB`}
                  sub={`共 ${hw.ramTotal} GB · ${hw.ramPct}% 已用`}
                  accent={hw.ramPct >= 88}
                >
                  <UsageBar pct={hw.ramPct} />
                </StatCard>

                <StatCard
                  icon={HardDrive} label="磁盘"
                  value={`${hw.diskFree} GB 可用`}
                  sub={`共 ${hw.diskTotal} GB · ${hw.diskUsedPct}% 已用`}
                  accent={hw.diskUsedPct >= 85}
                >
                  <UsageBar pct={hw.diskUsedPct} warn={75} danger={88} />
                </StatCard>

                <StatCard
                  icon={Clock} label="运行时长"
                  value={hw.uptime}
                  sub="自上次重启"
                />
              </div>
            ) : (
              <p className="text-base text-[hsl(var(--muted-foreground))]">无法获取硬件信息</p>
            )}
          </section>

          {/* ── Section: Model Usage (top 5 default, expandable) ── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Bot className="w-4 h-4 text-[hsl(var(--zv-blue))]" />
              <h2 className="text-base font-semibold text-[hsl(var(--foreground))] uppercase tracking-wider">AI 模型用量</h2>
              <div className="h-px flex-1 bg-[hsl(var(--border))]" />
              {usage && (
                <span className="text-[10px] text-[hsl(var(--muted-foreground))] flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-[hsl(var(--zv-amber))]" />
                  {fmt(usage.totalTokens)} tokens · ${usage.totalCost.toFixed(2)}
                </span>
              )}
            </div>

            {(
              usageLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
                </div>
              ) : usage && usage.models.length > 0 ? (
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm overflow-hidden">
                  <div className="grid grid-cols-[2fr_80px_1fr_1fr_1fr_1fr_110px] gap-3 px-4 py-2.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.5)]">
                    {['模型', 'Provider', '输入', '输出', '总计', '会话', '占比'].map(h => (
                      <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{h}</span>
                    ))}
                  </div>

                  {displayedModels.map((m, i) => {
                    const used = m.totalTokens > 0
                    const pct  = used ? Math.round((m.totalTokens / maxTokens) * 100) : 0
                    const providerColor: Record<string, string> = {
                      Anthropic: 'text-[hsl(var(--zv-amber))] bg-[hsl(var(--zv-amber)/0.1)]',
                      Google:    'text-[hsl(217_91%_65%)] bg-[hsl(217_91%_60%/0.1)]',
                      OpenAI:    'text-[hsl(142_71%_50%)] bg-[hsl(142_71%_45%/0.1)]',
                    }
                    const pColor = providerColor[m.provider] ?? 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))]'

                    return (
                      <div
                        key={m.id}
                        className={`grid grid-cols-[2fr_80px_1fr_1fr_1fr_1fr_110px] gap-3 px-4 py-3 items-center transition-colors hover:bg-[hsl(var(--secondary)/0.3)] ${i < displayedModels.length - 1 ? 'border-b border-[hsl(var(--border)/0.5)]' : ''} ${!used ? 'opacity-40' : ''}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${used ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-foreground))]'}`} />
                          <span className="text-base font-medium text-[hsl(var(--foreground))] truncate">{m.name}</span>
                        </div>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md w-fit ${pColor}`}>
                          {m.provider}
                        </span>
                        <span className="text-sm text-[hsl(var(--muted-foreground))] tabular-nums">{used ? fmt(m.inputTokens) : '—'}</span>
                        <span className="text-sm text-[hsl(var(--muted-foreground))] tabular-nums">{used ? fmt(m.outputTokens) : '—'}</span>
                        <span className={`text-sm font-semibold tabular-nums ${used ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                          {used ? fmt(m.totalTokens) : '—'}
                        </span>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />
                          <span className="text-sm text-[hsl(var(--muted-foreground))] tabular-nums">{used ? m.sessions : '0'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-[hsl(var(--secondary))] rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-[hsl(var(--primary))] rounded-full transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-[hsl(var(--muted-foreground))] w-8 text-right tabular-nums">{pct}%</span>
                        </div>
                      </div>
                    )
                  })}

                  {usage.models.length > TOP_N && (
                    <div
                      className="px-4 py-2.5 border-t border-[hsl(var(--border)/0.5)] text-center cursor-pointer hover:bg-[hsl(var(--secondary)/0.3)] transition-colors"
                      onClick={() => setUsageExpanded(v => !v)}
                    >
                      <span className="text-xs text-[hsl(var(--muted-foreground))] flex items-center justify-center gap-1">
                        {usageExpanded ? (
                          <><ChevronUp className="w-3 h-3" /> 收起，只显示 Top {TOP_N}</>
                        ) : (
                          <><ChevronDown className="w-3 h-3" /> 显示全部 {usage.models.length} 个模型</>
                        )}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_120px] gap-4 px-4 py-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)]">
                    <div className="flex items-center gap-2">
                      <Coins className="w-3.5 h-3.5 text-[hsl(var(--zv-amber))]" />
                      <span className="text-sm font-bold text-[hsl(var(--foreground))]">总计</span>
                    </div>
                    <span className="text-sm font-semibold text-[hsl(var(--foreground))] tabular-nums">
                      {fmt(usage.models.reduce((s, m) => s + m.inputTokens, 0))}
                    </span>
                    <span className="text-sm font-semibold text-[hsl(var(--foreground))] tabular-nums">
                      {fmt(usage.models.reduce((s, m) => s + m.outputTokens, 0))}
                    </span>
                    <span className="text-base font-bold text-[hsl(var(--primary))] tabular-nums">{fmt(usage.totalTokens)}</span>
                    <span className="text-sm font-semibold text-[hsl(var(--foreground))] tabular-nums">
                      {usage.models.reduce((s, m) => s + m.sessions, 0)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-[hsl(var(--zv-amber))]" />
                      <span className="text-sm font-bold text-[hsl(var(--zv-amber))]">${usage.totalCost.toFixed(3)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm p-8 text-center">
                  <Bot className="w-8 h-8 mx-auto text-[hsl(var(--muted-foreground))] mb-2 opacity-40" />
                  <p className="text-base text-[hsl(var(--muted-foreground))]">暂无模型用量数据</p>
                </div>
              )
            )}
          </section>
        </>
      )}

      {activeTab === 'cron' && (
        <section className="space-y-6">
          {cronJobs && cronJobs.jobs.length > 0 && <CronCalendar jobs={cronJobs.jobs} onEditJob={openEdit} />}

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[hsl(var(--zv-amber))]" />
              <h2 className="text-base font-semibold text-[hsl(var(--foreground))] uppercase tracking-wider">⏰ 定时任务</h2>
              <div className="h-px flex-1 bg-[hsl(var(--border))]" />
            </div>

            {cronLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
            ) : cronError ? (
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">⚠️ {cronError} — Cron Jobs 暂时不可用</p>
              </div>
            ) : cronJobs && cronJobs.jobs.length > 0 ? (
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px_1fr] gap-3 px-4 py-2.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.5)]">
                  {['名称', 'Schedule', 'Agent', 'Model', '状态', '下次运行'].map(h => (
                    <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{h}</span>
                  ))}
                </div>
                {cronJobs.jobs.map((job, i) => {
                  const schedExpr = typeof job.schedule === 'string' ? job.schedule : job.schedule?.expr || '—'
                  const schedHuman = cronToHuman(schedExpr)
                  const tz = typeof job.schedule === 'object' ? job.schedule?.tz : undefined
                  const agentLabel = job.agentId || '—'
                  const rawModel = job.payload?.model
                  const modelLabel = rawModel
                    ? rawModel.includes('/') ? rawModel.split('/').slice(1).join('/') : rawModel
                    : '默认'
                  const nextRunMs = job.state?.nextRunAtMs
                  const lastStatus = job.state?.lastStatus || job.state?.lastRunStatus
                  const fmtTime = (ms?: number) => ms ? new Date(ms).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

                  return (
                    <div key={job.id} onClick={() => openEdit(job)} className={`grid grid-cols-[2fr_1fr_1fr_1fr_80px_1fr] gap-3 px-4 py-3 items-center cursor-pointer hover:bg-[hsl(var(--secondary)/0.3)] transition-colors ${i < cronJobs.jobs.length - 1 ? 'border-b border-[hsl(var(--border)/0.5)]' : ''} ${!job.enabled ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${job.enabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-foreground))]'}`} />
                        <span className="text-sm font-medium text-[hsl(var(--foreground))] truncate">{job.name}</span>
                      </div>
                      <span
                        className="text-xs text-[hsl(var(--muted-foreground))] truncate cursor-default"
                        title={`${schedExpr}${tz ? ` (${tz})` : ''}`}
                      >{schedHuman}</span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))] truncate">{agentLabel}</span>
                      <span className={`text-xs truncate ${rawModel ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{modelLabel}</span>
                      <span className="text-sm">
                        {!job.enabled ? '⏸️' : lastStatus === 'ok' ? '✅' : lastStatus === 'error' ? '❌' : '—'}
                      </span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{fmtTime(nextRunMs)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">暂无定时任务</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Edit Modal ── */}
      <Dialog open={!!editJob} onOpenChange={(open) => { if (!open) setEditJob(null) }}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>编辑任务：{editJob?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Schedule friendly picker */}
            <div>
              <label className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-semibold block mb-2">Schedule</label>
              <CronScheduleEditor value={editSchedule} onChange={setEditSchedule} />
            </div>
            <div>
              <label className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-semibold">Model</label>
              <Input
                className="mt-1.5"
                value={editForm.model}
                onChange={e => setEditForm(f => ({ ...f, model: e.target.value }))}
                placeholder="anthropic/claude-sonnet-4-6"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-semibold">启用</span>
              <button
                type="button"
                onClick={() => setEditForm(f => ({ ...f, enabled: !f.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.enabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--secondary))]'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-[hsl(var(--primary-foreground))] transition-transform ${editForm.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {editError && <p className="text-xs text-[hsl(var(--destructive))]">{editError}</p>}
          </div>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => setEditJob(null)}>取消</Button>
            <Button className="flex-1" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? '保存中...' : '保存'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm text-[hsl(var(--primary-foreground))] shadow-lg ${toast.ok ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--destructive))]'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
export default function SystemPage() {
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [forceRefresh, setForceRefresh] = useState(0)

  const handleRefresh = () => {
    setForceRefresh(n => n + 1)
    setLastRefresh(new Date())
  }

  return (
    <DashboardPageLayout
      signedOut={{ message: 'Sign in to view system', forceRedirectUrl: '/system' }}
      title="System"
      description="系统与模型用量"
      headerActions={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse" />
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              Live · {lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </Button>
        </div>
      }
    >
      <SystemPageContent forceRefresh={forceRefresh} onAutoRefresh={() => setLastRefresh(new Date())} />
    </DashboardPageLayout>
  )
}
