'use client'

import { useEffect, useState, useCallback } from 'react'
import { Markdown } from '@/components/atoms/Markdown'
import {
  FileText, RefreshCw, ChevronRight, ChevronLeft, ChevronDown, X,
  Package, BarChart2, Search, TrendingUp,
  Users, Megaphone, LayoutGrid, Clock, Trash2, Zap,
  Moon, Plus, ArrowUp, ArrowDown, CheckCircle2, ListTodo,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { DashboardPageLayout } from '@/components/templates/DashboardPageLayout'
import { cn } from '@/lib/utils'

// ─── URL helpers ──────────────────────────────────────────────────────────────

function setUrlReport(tab: string, report: string) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set('tab', tab)
  url.searchParams.set('report', report)
  window.history.pushState({}, '', url.toString())
}

function clearUrlReport() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('report')
  window.history.replaceState({}, '', url.toString())
}

function setUrlTab(tab: string) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set('tab', tab)
  url.searchParams.delete('report')
  window.history.replaceState({}, '', url.toString())
}

function getInitialUrlParams(): { tab: string | null; report: string | null } {
  if (typeof window === 'undefined') return { tab: null, report: null }
  const p = new URLSearchParams(window.location.search)
  return { tab: p.get('tab'), report: p.get('report') }
}

// ─── Tag Pill ─────────────────────────────────────────────────────────────────

function TagPill({ label, color }: { label: string; color: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap flex-shrink-0',
      color
    )}>
      {label}
    </span>
  )
}

// ─── Report Modal (Bug 1 & 2: Dialog with overlay + proper close) ─────────────

interface ReportModalProps {
  title: string
  tag: React.ReactNode
  date?: string
  sizeKb?: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
  children: React.ReactNode
}

function ReportModal({ title, tag, date, sizeKb, onClose, onPrev, onNext, hasPrev, hasNext, children }: ReportModalProps) {
  // Handle ← → keyboard navigation (Dialog handles ESC via onOpenChange)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      else if (e.key === 'ArrowRight' && hasNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPrev, onNext, hasPrev, hasNext])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="max-w-[90vw] max-h-[90vh] !overflow-hidden !p-0 flex flex-col gap-0 rounded-2xl"
      >
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0">
          {/* Explicit X close button (Bug 2) */}
          <DialogClose asChild>
            <button
              className="flex-shrink-0 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="关闭 (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </DialogClose>
          {tag}
          <DialogTitle className="text-sm font-semibold truncate flex-1">{title}</DialogTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
            {date && <span>{date}</span>}
            {sizeKb !== undefined && <span>{sizeKb} KB</span>}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="上一篇 (←)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="下一篇 (→)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-6">
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── CollapsibleGroup (Bug 5: shared grouping component) ──────────────────────

function CollapsibleGroup({
  title,
  count,
  children,
  accentColor,
}: {
  title: string
  count: number
  children: React.ReactNode
  accentColor?: string
}) {
  const [open, setOpen] = useState(false) // default collapsed

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/60 border border-border hover:bg-secondary transition-colors mb-1"
      >
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"/>
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"/>
        }
        {accentColor && (
          <span className={cn('w-1 h-4 rounded-full flex-shrink-0', accentColor)}/>
        )}
        <span className="text-sm font-medium text-foreground flex-1 text-left">{title}</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">{count} 份</span>
      </button>
      {open && (
        <div className="rounded-lg border border-border overflow-hidden mb-1">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Tab Config ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'discovery', label: '🔍 市场研究' },
  { id: 'listing',   label: '📦 Listing' },
  { id: 'ppc',       label: '📊 PPC 报告' },
  { id: 'content',   label: '✍️ 内容报告' },
  { id: 'strategy',  label: '🎯 战略调研' },
  { id: 'intel',     label: '🌙 夜间调研' },
] as const

type TabId = typeof TABS[number]['id']

// ─── ASIN Nicknames ────────────────────────────────────────────────────────────

const ASIN_NICKNAMES: Record<string, string> = {
  'B0GJR8435C': 'Antioxidant Body Oil',
  'B0GJQZLHNK': 'Deep Moisture Body Oil',
  'B0GJPJNJ57': 'Repair Body Lotion',
  'B0GJR3TB2S': 'Hydration Body Lotion',
  'B0F6MN77BB': 'Foaming Sanitizer 4pk',
  'B0F745BDP8': 'Foaming Sanitizer 1pk',
  'B0CRSSGGYY': 'Gel Sanitizer 50pk',
  'B0CRSY8YZS': 'Gel Sanitizer 8pk',
  'B0CR5D91N2': 'Tea Tree Wipes 10pk',
  'B0CR74VL95': 'Jasmine Wipes 6pk',
  'B0CQMYDK3G': 'Tropical Fruit Wipes 6pk',
  'B0CQN3YBZY': 'Jasmine Wipes 3pk',
  'B0CQN2MFB3': 'Jasmine Wipes 6pk Alt',
  'B0CQN1NDFQ': 'Tropical Fruit Wipes 3pk',
  'B0CR75NMV6': 'Bergamot Wipes 3pk',
  'B0CR74H614': 'Bergamot TF Wipes 3pk',
  'B0CR75Y4X6': 'Bergamot Wipes 6pk',
  'B0D991MB7W': 'Bergamot Wipes 24pk',
  'B0D99D2RCP': 'Bergamot TF Wipes 24pk',
}

// ─── localStorage helpers ──────────────────────────────────────────────────────

function loadReadSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(key)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch { return new Set() }
}

function saveReadSet(key: string, set: Set<string>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(Array.from(set)))
}

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) }
  catch { return d }
}

// ─── ComingSoon ────────────────────────────────────────────────────────────────

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4 text-muted-foreground">
      <Clock className="w-12 h-12" />
      <p className="text-xl font-semibold text-foreground">{label}</p>
      <p className="text-base">Coming Soon — 即将上线</p>
    </div>
  )
}

// ─── Compact Report List skeleton ─────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0"/>
          <Skeleton className="h-4 flex-1"/>
          <Skeleton className="h-4 w-16"/>
          <Skeleton className="h-4 w-20"/>
          <Skeleton className="h-4 w-12"/>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISCOVERY REPORTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface DiscoveryFile {
  filename:   string
  prefix:     string
  date:       string
  sizeKb:     number
  modifiedAt: string
  title?:     string | null
}

const DISCOVERY_READ_KEY = 'discovery-reports-read'

const DISCOVERY_TAG: Record<string, { label: string; color: string; accent: string }> = {
  competitors:   { label: '竞品对比', color: 'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-300',    accent: 'bg-red-400' },
  trends:        { label: '趋势研究', color: 'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',   accent: 'bg-blue-400' },
  'trends-deep': { label: '深度趋势', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', accent: 'bg-purple-400' },
  voc:           { label: '客户之声', color: 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-300',  accent: 'bg-green-400' },
  industry:      { label: '行业动态', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', accent: 'bg-orange-400' },
}

function getDiscoveryTag(prefix: string) {
  return DISCOVERY_TAG[prefix] ?? { label: prefix || '报告', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', accent: 'bg-slate-400' }
}

function DiscoveryContent({ file, onMarkRead }: { file: DiscoveryFile; onMarkRead: (fn: string) => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/discovery/reports?file=${encodeURIComponent(file.filename)}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setContent(d.content); onMarkRead(file.filename) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [file.filename]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4"/>)}</div>
  if (error) return <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>
  if (content) return <Markdown content={content} variant="description"/>
  return null
}

function DiscoveryTab({ tabId, initialReport, onCountChange }: {
  tabId: string
  initialReport?: string | null
  onCountChange?: (count: number, loaded: boolean) => void
}) {
  const [files, setFiles] = useState<DiscoveryFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DiscoveryFile | null>(null)
  const [search, setSearch] = useState('')
  const [filterPrefix, setFilterPrefix] = useState('all')
  const [readSet, setReadSet] = useState<Set<string>>(new Set())

  useEffect(() => { setReadSet(loadReadSet(DISCOVERY_READ_KEY)) }, [])

  const markRead = useCallback((filename: string) => {
    setReadSet(prev => { const next = new Set(prev); next.add(filename); saveReadSet(DISCOVERY_READ_KEY, next); return next })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try { const data = await fetch('/api/discovery/reports').then(r => r.json()); setFiles(data.files || []) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Restore modal from URL on load
  useEffect(() => {
    if (!initialReport || !files.length) return
    const f = files.find(x => x.filename === initialReport)
    if (f && !selected) setSelected(f)
  }, [initialReport, files]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onCountChange?.(files.length, !loading) }, [files.length, loading, onCountChange])

  const handleDelete = useCallback(async (e: React.MouseEvent, f: DiscoveryFile) => {
    e.stopPropagation()
    if (!confirm(`确定删除 ${f.filename}？`)) return
    try {
      const res = await fetch(`/api/discovery/reports?file=${encodeURIComponent(f.filename)}`, { method: 'DELETE' })
      if (!res.ok) { alert(`删除失败: ${(await res.json()).error}`); return }
      setReadSet(prev => { const next = new Set(prev); next.delete(f.filename); saveReadSet(DISCOVERY_READ_KEY, next); return next })
      setFiles(prev => prev.filter(x => x.filename !== f.filename))
      setSelected(prev => prev?.filename === f.filename ? null : prev)
    } catch { alert('删除失败，请重试') }
  }, [])

  const prefixes = Array.from(new Set(files.map(f => f.prefix))).filter(Boolean)

  const filtered = files.filter(f => {
    const q = search.toLowerCase()
    const matchSearch = !search || f.filename.toLowerCase().includes(q) || (f.title?.toLowerCase().includes(q) ?? false)
    const matchPrefix = filterPrefix === 'all' || f.prefix === filterPrefix
    return matchSearch && matchPrefix
  })

  // Bug 5: Group by prefix for display
  const byPrefix: Record<string, DiscoveryFile[]> = {}
  for (const f of filtered) {
    const key = f.prefix || '其他'
    if (!byPrefix[key]) byPrefix[key] = []
    byPrefix[key].push(f)
  }

  const selectedIdx = selected ? filtered.findIndex(f => f.filename === selected.filename) : -1
  const hasPrev = selectedIdx > 0
  const hasNext = selectedIdx >= 0 && selectedIdx < filtered.length - 1

  function openReport(f: DiscoveryFile) { setSelected(f); setUrlReport(tabId, f.filename) }
  function closeModal() { setSelected(null); clearUrlReport() }
  function navPrev() { if (hasPrev) openReport(filtered[selectedIdx - 1]) }
  function navNext() { if (hasNext) openReport(filtered[selectedIdx + 1]) }

  function renderRow(f: DiscoveryFile) {
    const { label, color } = getDiscoveryTag(f.prefix)
    const isRead = readSet.has(f.filename)
    return (
      <div key={f.filename}
        className={cn('group flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 cursor-pointer transition-colors', selected?.filename === f.filename ? 'bg-primary/5' : 'hover:bg-secondary/50')}
        onClick={() => openReport(f)}>
        <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isRead ? 'bg-transparent' : 'bg-blue-500')}/>
        <p className={cn('text-sm flex-1 min-w-0 truncate', isRead ? 'text-muted-foreground' : 'text-foreground font-medium')}>
          {f.title || f.filename.replace('.md', '')}
        </p>
        <TagPill label={label} color={color}/>
        <span className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right">{f.date || fmtDate(f.modifiedAt)}</span>
        <span className="text-xs text-muted-foreground flex-shrink-0 w-14 text-right">{f.sizeKb} KB</span>
        <button onClick={e => handleDelete(e, f)} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive" title="删除">
          <Trash2 className="w-3.5 h-3.5"/>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">市场研究与竞品分析报告</p>
          {!loading && files.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground">
              <FileText className="w-3 h-3"/> {files.length} 份
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>刷新
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <input type="text" placeholder="搜索报告…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"/>
        </div>
        {prefixes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterPrefix('all')} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filterPrefix === 'all' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary')}>全部</button>
            {prefixes.map(p => (
              <button key={p} onClick={() => setFilterPrefix(p === filterPrefix ? 'all' : p)} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filterPrefix === p ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary')}>
                {getDiscoveryTag(p).label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? <ListSkeleton/> : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <FileText className="w-10 h-10"/><p>暂无报告</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">没有匹配的报告</div>
      ) : (
        /* Bug 5: Grouped collapsible by prefix */
        <div className="space-y-1">
          {Object.entries(byPrefix).map(([prefix, groupFiles]) => {
            const { label, accent } = getDiscoveryTag(prefix)
            return (
              <CollapsibleGroup key={prefix} title={label} count={groupFiles.length} accentColor={accent}>
                {groupFiles.map(f => renderRow(f))}
              </CollapsibleGroup>
            )
          })}
        </div>
      )}

      {selected && (
        <ReportModal
          title={selected.title || selected.filename.replace('.md', '')}
          tag={<TagPill label={getDiscoveryTag(selected.prefix).label} color={getDiscoveryTag(selected.prefix).color}/>}
          date={selected.date || fmtDate(selected.modifiedAt)}
          sizeKb={selected.sizeKb}
          onClose={closeModal} onPrev={navPrev} onNext={navNext}
          hasPrev={hasPrev} hasNext={hasNext}
        >
          <DiscoveryContent file={selected} onMarkRead={markRead}/>
        </ReportModal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// LISTING REPORTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface ListingReportFile {
  filename:   string
  asin:       string
  type:       string
  date:       string
  sizeKb:     number
  modifiedAt: string
  title?:     string | null
}

const LISTING_READ_KEY = 'listing-reports-read'

const LISTING_TAG: Record<string, { label: string; color: string }> = {
  'search-term': { label: 'Search Terms', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  listing:       { label: 'Listing',       color: 'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300' },
}

function getListingTag(type: string) {
  if (type.includes('search-term')) return LISTING_TAG['search-term']
  if (type.includes('listing'))    return LISTING_TAG['listing']
  return { label: type || 'Report', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }
}

// Bug 4: Extract date from filename to distinguish duplicate titles
function extractDateFromFilename(filename: string): string | null {
  const m = filename.match(/(\d{4}[-_]\d{2}[-_]\d{2})/)
  return m ? m[1].replace(/_/g, '-') : null
}

function getListingDisplayTitle(f: ListingReportFile): string {
  const base = f.title || f.filename.replace('.md', '')
  const dateStr = extractDateFromFilename(f.filename) || f.date
  if (dateStr && !base.includes(dateStr)) {
    return `${base} (${dateStr})`
  }
  return base
}

function ListingContent({ file, onMarkRead }: { file: ListingReportFile; onMarkRead: (fn: string) => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/listing/reports?file=${encodeURIComponent(file.filename)}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setContent(d.content); onMarkRead(file.filename) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [file.filename]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4"/>)}</div>
  if (error) return <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>
  if (content) return <Markdown content={content} variant="description"/>
  return null
}

function ListingTab({ tabId, initialReport, onCountChange }: {
  tabId: string
  initialReport?: string | null
  onCountChange?: (count: number, loaded: boolean) => void
}) {
  const [files, setFiles] = useState<ListingReportFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ListingReportFile | null>(null)
  const [search, setSearch] = useState('')
  const [readSet, setReadSet] = useState<Set<string>>(new Set())
  // Bug 5: default all ASIN groups collapsed (initialized from loaded data)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => { setReadSet(loadReadSet(LISTING_READ_KEY)) }, [])

  const markRead = useCallback((filename: string) => {
    setReadSet(prev => { const next = new Set(prev); next.add(filename); saveReadSet(LISTING_READ_KEY, next); return next })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/listing/reports').then(r => r.json())
      const fs: ListingReportFile[] = data.files || []
      setFiles(fs)
      // Bug 5: default all ASIN groups to collapsed
      setCollapsed(new Set(Array.from(new Set(fs.map(f => f.asin)))))
    }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Restore modal from URL on load
  useEffect(() => {
    if (!initialReport || !files.length) return
    const f = files.find(x => x.filename === initialReport)
    if (f && !selected) setSelected(f)
  }, [initialReport, files]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onCountChange?.(files.length, !loading) }, [files.length, loading, onCountChange])

  const handleDelete = useCallback(async (e: React.MouseEvent, f: ListingReportFile) => {
    e.stopPropagation()
    if (!confirm(`确定删除 ${f.filename}？`)) return
    try {
      const res = await fetch(`/api/listing/reports?file=${encodeURIComponent(f.filename)}`, { method: 'DELETE' })
      if (!res.ok) { alert(`删除失败: ${(await res.json()).error}`); return }
      setReadSet(prev => { const next = new Set(prev); next.delete(f.filename); saveReadSet(LISTING_READ_KEY, next); return next })
      setFiles(prev => prev.filter(x => x.filename !== f.filename))
      setSelected(prev => prev?.filename === f.filename ? null : prev)
    } catch { alert('删除失败，请重试') }
  }, [])

  function toggleAsin(asin: string) {
    setCollapsed(prev => { const next = new Set(prev); if (next.has(asin)) next.delete(asin); else next.add(asin); return next })
  }

  const filtered = files.filter(f => {
    if (!search) return true
    const q = search.toLowerCase()
    const nickname = ASIN_NICKNAMES[f.asin]?.toLowerCase() ?? ''
    return f.filename.toLowerCase().includes(q) || f.asin.toLowerCase().includes(q) || nickname.includes(q) || f.type.toLowerCase().includes(q)
  })

  // Group by ASIN, preserving order
  const byAsin: Record<string, ListingReportFile[]> = {}
  for (const f of filtered) { if (!byAsin[f.asin]) byAsin[f.asin] = []; byAsin[f.asin].push(f) }

  // Flat list for modal navigation
  const flatFiltered: ListingReportFile[] = Object.values(byAsin).flat()
  const selectedIdx = selected ? flatFiltered.findIndex(f => f.filename === selected.filename) : -1
  const hasPrev = selectedIdx > 0
  const hasNext = selectedIdx >= 0 && selectedIdx < flatFiltered.length - 1

  function openReport(f: ListingReportFile) { setSelected(f); setUrlReport(tabId, f.filename) }
  function closeModal() { setSelected(null); clearUrlReport() }
  function navPrev() { if (hasPrev) openReport(flatFiltered[selectedIdx - 1]) }
  function navNext() { if (hasNext) openReport(flatFiltered[selectedIdx + 1]) }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Listing 优化分析报告 — 每两周自动生成</p>
          {!loading && files.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground">
                <FileText className="w-3 h-3"/> {files.length} 份
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground">
                <Package className="w-3 h-3"/> {new Set(files.map(f => f.asin)).size} ASIN
              </span>
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>刷新
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
        <input type="text" placeholder="搜索 ASIN / 报告…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"/>
      </div>

      {loading ? <ListSkeleton/> : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <FileText className="w-10 h-10"/><p>暂无报告</p>
          <p className="text-sm">报告文件将出现在 <code className="font-mono">~/.openclaw/workspace/reports/listing/</code></p>
        </div>
      ) : Object.entries(byAsin).length === 0 ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">没有匹配的报告</div>
      ) : (
        <div className="space-y-1">
          {Object.entries(byAsin).map(([asin, asinFiles]) => {
            const nickname = ASIN_NICKNAMES[asin]
            const isCollapsed = collapsed.has(asin)
            return (
              <div key={asin}>
                {/* Bug 3 & 5: ASIN section header — larger text, color bar, collapsible */}
                <button
                  onClick={() => toggleAsin(asin)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/60 border border-border hover:bg-secondary transition-colors mb-1"
                >
                  {isCollapsed
                    ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"/>
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"/>
                  }
                  {/* Bug 3: left color bar */}
                  <span className="w-1 h-5 rounded-full bg-primary/50 flex-shrink-0"/>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Bug 3: larger product nickname */}
                    <span className="text-sm font-semibold text-foreground truncate">{nickname ?? asin}</span>
                    {/* Bug 3: ASIN code stays small */}
                    {nickname && <span className="text-xs font-mono text-muted-foreground flex-shrink-0">{asin}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground">{asinFiles.length} 份</span>
                  </div>
                </button>
                {!isCollapsed && (
                  <div className="rounded-lg border border-border overflow-hidden mb-1">
                    {asinFiles.map(f => {
                      const { label, color } = getListingTag(f.type)
                      const isRead = readSet.has(f.filename)
                      return (
                        <div key={f.filename}
                          className={cn('group flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 cursor-pointer transition-colors', selected?.filename === f.filename ? 'bg-primary/5' : 'hover:bg-secondary/50')}
                          onClick={() => openReport(f)}>
                          <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isRead ? 'bg-transparent' : 'bg-blue-500')}/>
                          {/* Bug 4: display title with date */}
                          <p className={cn('text-sm flex-1 min-w-0 truncate', isRead ? 'text-muted-foreground' : 'text-foreground font-medium')}>
                            {getListingDisplayTitle(f)}
                          </p>
                          <TagPill label={label} color={color}/>
                          <span className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right">{fmtDate(f.modifiedAt)}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0 w-14 text-right">{f.sizeKb} KB</span>
                          <button onClick={e => handleDelete(e, f)} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive" title="删除">
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <ReportModal
          title={getListingDisplayTitle(selected)}
          tag={<TagPill label={getListingTag(selected.type).label} color={getListingTag(selected.type).color}/>}
          date={fmtDate(selected.modifiedAt)}
          sizeKb={selected.sizeKb}
          onClose={closeModal} onPrev={navPrev} onNext={navNext}
          hasPrev={hasPrev} hasNext={hasNext}
        >
          <ListingContent file={selected} onMarkRead={markRead}/>
        </ReportModal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PPC REPORTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface PpcReportFile {
  filename:   string
  prefix:     string
  date:       string
  sizeKb:     number
  modifiedAt: string
  title?:     string | null
}

const PPC_READ_KEY = 'ppc-reports-read'

const PPC_TAG: Record<string, { label: string; color: string; accent: string }> = {
  'ai-insights':       { label: 'AI 洞察',   color: 'bg-cyan-100   text-cyan-700   dark:bg-cyan-900/30   dark:text-cyan-300',   accent: 'bg-cyan-400' },
  'weekly-report':     { label: '周报',       color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', accent: 'bg-indigo-400' },
  'bid-analysis':      { label: '出价分析',   color: 'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300',  accent: 'bg-amber-400' },
  'campaign-analysis': { label: '广告活动',   color: 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-300',  accent: 'bg-green-400' },
  'search-terms':      { label: '搜索词',     color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', accent: 'bg-violet-400' },
}

function getPpcTag(prefix: string) {
  return PPC_TAG[prefix] ?? { label: prefix || 'PPC 报告', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', accent: 'bg-slate-400' }
}

function PpcContent({ file, onMarkRead }: { file: PpcReportFile; onMarkRead: (fn: string) => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/ppc/reports?file=${encodeURIComponent(file.filename)}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setContent(d.content); onMarkRead(file.filename) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [file.filename]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4"/>)}</div>
  if (error) return <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>
  if (content) return <Markdown content={content} variant="description"/>
  return null
}

function PpcTab({ tabId, initialReport, onCountChange }: {
  tabId: string
  initialReport?: string | null
  onCountChange?: (count: number, loaded: boolean) => void
}) {
  const [files, setFiles] = useState<PpcReportFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PpcReportFile | null>(null)
  const [search, setSearch] = useState('')
  const [filterPrefix, setFilterPrefix] = useState('all')
  const [readSet, setReadSet] = useState<Set<string>>(new Set())

  useEffect(() => { setReadSet(loadReadSet(PPC_READ_KEY)) }, [])

  const markRead = useCallback((filename: string) => {
    setReadSet(prev => { const next = new Set(prev); next.add(filename); saveReadSet(PPC_READ_KEY, next); return next })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try { const data = await fetch('/api/ppc/reports').then(r => r.json()); setFiles(data.files || []) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!initialReport || !files.length) return
    const f = files.find(x => x.filename === initialReport)
    if (f && !selected) setSelected(f)
  }, [initialReport, files]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onCountChange?.(files.length, !loading) }, [files.length, loading, onCountChange])

  const handleDelete = useCallback(async (e: React.MouseEvent, f: PpcReportFile) => {
    e.stopPropagation()
    if (!confirm(`确定删除 ${f.filename}？`)) return
    try {
      const res = await fetch(`/api/ppc/reports?file=${encodeURIComponent(f.filename)}`, { method: 'DELETE' })
      if (!res.ok) { alert(`删除失败: ${(await res.json()).error}`); return }
      setReadSet(prev => { const next = new Set(prev); next.delete(f.filename); saveReadSet(PPC_READ_KEY, next); return next })
      setFiles(prev => prev.filter(x => x.filename !== f.filename))
      setSelected(prev => prev?.filename === f.filename ? null : prev)
    } catch { alert('删除失败，请重试') }
  }, [])

  const prefixes = Array.from(new Set(files.map(f => f.prefix))).filter(Boolean)

  const filtered = files.filter(f => {
    const q = search.toLowerCase()
    const matchSearch = !search || f.filename.toLowerCase().includes(q) || (f.title?.toLowerCase().includes(q) ?? false)
    return matchSearch && (filterPrefix === 'all' || f.prefix === filterPrefix)
  })

  // Bug 5: Group by prefix
  const byPrefix: Record<string, PpcReportFile[]> = {}
  for (const f of filtered) {
    const key = f.prefix || '其他'
    if (!byPrefix[key]) byPrefix[key] = []
    byPrefix[key].push(f)
  }

  const selectedIdx = selected ? filtered.findIndex(f => f.filename === selected.filename) : -1
  const hasPrev = selectedIdx > 0
  const hasNext = selectedIdx >= 0 && selectedIdx < filtered.length - 1

  function openReport(f: PpcReportFile) { setSelected(f); setUrlReport(tabId, f.filename) }
  function closeModal() { setSelected(null); clearUrlReport() }
  function navPrev() { if (hasPrev) openReport(filtered[selectedIdx - 1]) }
  function navNext() { if (hasNext) openReport(filtered[selectedIdx + 1]) }

  function renderRow(f: PpcReportFile) {
    const { label, color } = getPpcTag(f.prefix)
    const isRead = readSet.has(f.filename)
    return (
      <div key={f.filename}
        className={cn('group flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 cursor-pointer transition-colors', selected?.filename === f.filename ? 'bg-primary/5' : 'hover:bg-secondary/50')}
        onClick={() => openReport(f)}>
        <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isRead ? 'bg-transparent' : 'bg-blue-500')}/>
        <p className={cn('text-sm flex-1 min-w-0 truncate', isRead ? 'text-muted-foreground' : 'text-foreground font-medium')}>
          {f.title || f.filename.replace('.md', '')}
        </p>
        <TagPill label={label} color={color}/>
        <span className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right">{f.date || fmtDate(f.modifiedAt)}</span>
        <span className="text-xs text-muted-foreground flex-shrink-0 w-14 text-right">{f.sizeKb} KB</span>
        <button onClick={e => handleDelete(e, f)} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive" title="删除">
          <Trash2 className="w-3.5 h-3.5"/>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">PPC 广告 AI 洞察与分析报告</p>
          {!loading && files.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground">
              <Zap className="w-3 h-3"/> {files.length} 份
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>刷新
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <input type="text" placeholder="搜索报告…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"/>
        </div>
        {prefixes.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterPrefix('all')} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filterPrefix === 'all' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary')}>全部</button>
            {prefixes.map(p => (
              <button key={p} onClick={() => setFilterPrefix(p === filterPrefix ? 'all' : p)} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filterPrefix === p ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary')}>
                {getPpcTag(p).label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? <ListSkeleton/> : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Zap className="w-10 h-10"/><p>暂无 PPC 报告</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">没有匹配的报告</div>
      ) : (
        /* Bug 5: Grouped collapsible by prefix */
        <div className="space-y-1">
          {Object.entries(byPrefix).map(([prefix, groupFiles]) => {
            const { label, accent } = getPpcTag(prefix)
            return (
              <CollapsibleGroup key={prefix} title={label} count={groupFiles.length} accentColor={accent}>
                {groupFiles.map(f => renderRow(f))}
              </CollapsibleGroup>
            )
          })}
        </div>
      )}

      {selected && (
        <ReportModal
          title={selected.title || selected.filename.replace('.md', '')}
          tag={<TagPill label={getPpcTag(selected.prefix).label} color={getPpcTag(selected.prefix).color}/>}
          date={selected.date || fmtDate(selected.modifiedAt)}
          sizeKb={selected.sizeKb}
          onClose={closeModal} onPrev={navPrev} onNext={navNext}
          hasPrev={hasPrev} hasNext={hasNext}
        >
          <PpcContent file={selected} onMarkRead={markRead}/>
        </ReportModal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRATEGY REPORTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface StrategyFile {
  filename:   string
  prefix:     string
  date:       string
  sizeKb:     number
  modifiedAt: string
  title?:     string | null
}

const STRATEGY_READ_KEY = 'strategy-reports-read'

function getStrategyTag(filename: string): { label: string; color: string; accent: string } {
  const name = filename.toLowerCase()
  if (name.includes('deep-dive'))     return { label: '🔬 深度调研',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', accent: 'bg-purple-400' }
  if (name.includes('feasibility'))   return { label: '📋 可行性分析', color: 'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300',  accent: 'bg-amber-400' }
  if (name.includes('roadmap'))       return { label: '🗺️ 路线图',     color: 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-300',  accent: 'bg-green-400' }
  if (name.includes('growth-plan') || name.includes('strategy'))
                                      return { label: '🎯 战略规划',   color: 'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',   accent: 'bg-blue-400' }
  if (name.includes('market-entry'))  return { label: '🚀 市场进入',   color: 'bg-cyan-100   text-cyan-700   dark:bg-cyan-900/30   dark:text-cyan-300',   accent: 'bg-cyan-400' }
  return { label: '📄 调研报告', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', accent: 'bg-slate-400' }
}

function StrategyContent({ file, onMarkRead }: { file: StrategyFile; onMarkRead: (fn: string) => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/strategy/reports?file=${encodeURIComponent(file.filename)}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setContent(d.content); onMarkRead(file.filename) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [file.filename]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4"/>)}</div>
  if (error) return <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>
  if (content) return <Markdown content={content} variant="description"/>
  return null
}

function StrategyTab({ tabId, initialReport, onCountChange }: {
  tabId: string
  initialReport?: string | null
  onCountChange?: (count: number, loaded: boolean) => void
}) {
  const [files, setFiles] = useState<StrategyFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<StrategyFile | null>(null)
  const [search, setSearch] = useState('')
  const [filterLabel, setFilterLabel] = useState('all')
  const [readSet, setReadSet] = useState<Set<string>>(new Set())

  useEffect(() => { setReadSet(loadReadSet(STRATEGY_READ_KEY)) }, [])

  const markRead = useCallback((filename: string) => {
    setReadSet(prev => { const next = new Set(prev); next.add(filename); saveReadSet(STRATEGY_READ_KEY, next); return next })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try { const data = await fetch('/api/strategy/reports').then(r => r.json()); setFiles(data.files || []) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!initialReport || !files.length) return
    const f = files.find(x => x.filename === initialReport)
    if (f && !selected) setSelected(f)
  }, [initialReport, files]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onCountChange?.(files.length, !loading) }, [files.length, loading, onCountChange])

  const handleDelete = useCallback(async (e: React.MouseEvent, f: StrategyFile) => {
    e.stopPropagation()
    if (!confirm(`确定删除 ${f.filename}？`)) return
    try {
      const res = await fetch(`/api/strategy/reports?file=${encodeURIComponent(f.filename)}`, { method: 'DELETE' })
      if (!res.ok) { alert(`删除失败: ${(await res.json()).error}`); return }
      setReadSet(prev => { const next = new Set(prev); next.delete(f.filename); saveReadSet(STRATEGY_READ_KEY, next); return next })
      setFiles(prev => prev.filter(x => x.filename !== f.filename))
      setSelected(prev => prev?.filename === f.filename ? null : prev)
    } catch { alert('删除失败，请重试') }
  }, [])

  const badgeTypes = Array.from(new Map(files.map(f => { const t = getStrategyTag(f.filename); return [t.label, t] })).values())

  const filtered = files.filter(f => {
    const q = search.toLowerCase()
    const matchSearch = !search || f.filename.toLowerCase().includes(q) || (f.title?.toLowerCase().includes(q) ?? false)
    return matchSearch && (filterLabel === 'all' || getStrategyTag(f.filename).label === filterLabel)
  })

  // Bug 5: Group by badge label
  const byLabel: Record<string, StrategyFile[]> = {}
  for (const f of filtered) {
    const key = getStrategyTag(f.filename).label
    if (!byLabel[key]) byLabel[key] = []
    byLabel[key].push(f)
  }

  const selectedIdx = selected ? filtered.findIndex(f => f.filename === selected.filename) : -1
  const hasPrev = selectedIdx > 0
  const hasNext = selectedIdx >= 0 && selectedIdx < filtered.length - 1

  function openReport(f: StrategyFile) { setSelected(f); setUrlReport(tabId, f.filename) }
  function closeModal() { setSelected(null); clearUrlReport() }
  function navPrev() { if (hasPrev) openReport(filtered[selectedIdx - 1]) }
  function navNext() { if (hasNext) openReport(filtered[selectedIdx + 1]) }

  function renderRow(f: StrategyFile) {
    const { label, color } = getStrategyTag(f.filename)
    const isRead = readSet.has(f.filename)
    return (
      <div key={f.filename}
        className={cn('group flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 cursor-pointer transition-colors', selected?.filename === f.filename ? 'bg-primary/5' : 'hover:bg-secondary/50')}
        onClick={() => openReport(f)}>
        <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isRead ? 'bg-transparent' : 'bg-blue-500')}/>
        <p className={cn('text-sm flex-1 min-w-0 truncate', isRead ? 'text-muted-foreground' : 'text-foreground font-medium')}>
          {f.title || f.filename.replace('.md', '')}
        </p>
        <TagPill label={label} color={color}/>
        <span className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right">{f.date || fmtDate(f.modifiedAt)}</span>
        <span className="text-xs text-muted-foreground flex-shrink-0 w-14 text-right">{f.sizeKb} KB</span>
        <button onClick={e => handleDelete(e, f)} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive" title="删除">
          <Trash2 className="w-3.5 h-3.5"/>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">战略规划与市场研究报告</p>
          {!loading && files.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground">
              <FileText className="w-3 h-3"/> {files.length} 份
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>刷新
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <input type="text" placeholder="搜索报告…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"/>
        </div>
        {badgeTypes.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterLabel('all')} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filterLabel === 'all' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary')}>全部</button>
            {badgeTypes.map(({ label }) => (
              <button key={label} onClick={() => setFilterLabel(label === filterLabel ? 'all' : label)} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filterLabel === label ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary')}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? <ListSkeleton/> : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <FileText className="w-10 h-10"/><p>暂无战略报告</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">没有匹配的报告</div>
      ) : (
        /* Bug 5: Grouped collapsible by badge label */
        <div className="space-y-1">
          {Object.entries(byLabel).map(([label, groupFiles]) => {
            const { accent } = getStrategyTag(groupFiles[0].filename)
            return (
              <CollapsibleGroup key={label} title={label} count={groupFiles.length} accentColor={accent}>
                {groupFiles.map(f => renderRow(f))}
              </CollapsibleGroup>
            )
          })}
        </div>
      )}

      {selected && (
        <ReportModal
          title={selected.title || selected.filename.replace('.md', '')}
          tag={<TagPill label={getStrategyTag(selected.filename).label} color={getStrategyTag(selected.filename).color}/>}
          date={selected.date || fmtDate(selected.modifiedAt)}
          sizeKb={selected.sizeKb}
          onClose={closeModal} onPrev={navPrev} onNext={navNext}
          hasPrev={hasPrev} hasNext={hasNext}
        >
          <StrategyContent file={selected} onMarkRead={markRead}/>
        </ReportModal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEL REPORTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface IntelReportFile {
  filename:   string
  type:       'daily' | 'weekly'
  date:       string
  sizeKb:     number
  modifiedAt: string
  title?:     string | null
}

interface IntelQueueItem { topic: string; priority: number; addedAt: string; addedBy: string }
interface IntelCompletedItem extends IntelQueueItem { completedAt: string; reportPath: string }
interface IntelQueueData { items: IntelQueueItem[]; completed: IntelCompletedItem[] }

const INTEL_READ_KEY = 'intel-reports-read'

const INTEL_TAG = {
  daily:  { label: '🌙 日报', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', accent: 'bg-indigo-400' },
  weekly: { label: '📊 周报', color: 'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300',  accent: 'bg-amber-400' },
}

function getIntelTag(type: 'daily' | 'weekly') {
  return INTEL_TAG[type] ?? INTEL_TAG.daily
}

// ── Intel Queue Manager ──────────────────────────────────────────────────────

function IntelQueueManager() {
  const [queue, setQueue]               = useState<IntelQueueData | null>(null)
  const [loading, setLoading]           = useState(true)
  const [newTopic, setNewTopic]         = useState('')
  const [adding, setAdding]             = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const loadQueue = useCallback(async () => {
    try { const data = await fetch('/api/intel/queue').then(r => r.json()); setQueue(data) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadQueue() }, [loadQueue])

  const handleAdd = async () => {
    if (!newTopic.trim()) return
    setAdding(true)
    try {
      const data = await fetch('/api/intel/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: newTopic.trim() }) }).then(r => r.json())
      setQueue(data); setNewTopic('')
    } catch (e) { console.error(e) }
    finally { setAdding(false) }
  }

  const handleDelete = async (index: number) => {
    try { const data = await fetch(`/api/intel/queue?index=${index}`, { method: 'DELETE' }).then(r => r.json()); setQueue(data) }
    catch (e) { console.error(e) }
  }

  const handleMove = async (index: number, dir: 'up' | 'down') => {
    if (!queue) return
    const items = [...queue.items]
    const target = dir === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= items.length) return
    const order = items.map((_, i) => i)
    order.splice(index, 1); order.splice(target, 0, index)
    try { const data = await fetch('/api/intel/queue/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order }) }).then(r => r.json()); setQueue(data) }
    catch (e) { console.error(e) }
  }

  if (loading) return <div className="space-y-2"><Skeleton className="h-8 w-full"/><Skeleton className="h-16 w-full"/></div>

  const items = queue?.items ?? []
  const completed = queue?.completed ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-muted-foreground"/>
          <span className="text-sm font-semibold">Intel 研究队列</span>
          {items.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-secondary text-[10px] text-muted-foreground">{items.length} 个待研</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={loadQueue} className="h-7 px-2 gap-1 text-xs">
          <RefreshCw className="w-3 h-3"/>刷新
        </Button>
      </div>

      <div className="flex gap-2">
        <input type="text" placeholder="添加研究话题…" value={newTopic} onChange={e => setNewTopic(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="flex-1 px-3 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"/>
        <Button size="sm" onClick={handleAdd} disabled={adding || !newTopic.trim()} className="h-8 px-3 gap-1 text-xs">
          <Plus className="w-3 h-3"/>添加
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-center text-muted-foreground py-3 opacity-60">队列为空 — 添加话题让夜间 Intel 代理去研究</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={`${item.topic}-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/60 border border-border group">
              <span className="text-[10px] font-mono text-muted-foreground w-5 text-center flex-shrink-0">#{i+1}</span>
              <p className="flex-1 text-sm text-foreground truncate">{item.topic}</p>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.addedAt}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => handleMove(i, 'up')} disabled={i === 0} className="p-0.5 rounded hover:bg-secondary disabled:opacity-30 text-muted-foreground hover:text-foreground"><ArrowUp className="w-3 h-3"/></button>
                <button onClick={() => handleMove(i, 'down')} disabled={i === items.length-1} className="p-0.5 rounded hover:bg-secondary disabled:opacity-30 text-muted-foreground hover:text-foreground"><ArrowDown className="w-3 h-3"/></button>
                <button onClick={() => handleDelete(i)} className="p-0.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive ml-0.5"><X className="w-3 h-3"/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="border-t border-border pt-2">
          <button onClick={() => setShowCompleted(!showCompleted)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500"/>
            <span>已完成 ({completed.length})</span>
            {showCompleted ? <ChevronDown className="w-3 h-3"/> : <ChevronRight className="w-3 h-3"/>}
          </button>
          {showCompleted && (
            <div className="mt-2 space-y-1">
              {completed.map((item, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0"/>
                  <p className="flex-1 text-xs text-muted-foreground truncate line-through">{item.topic}</p>
                  <span className="text-[10px] text-muted-foreground">{item.completedAt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Intel Content ────────────────────────────────────────────────────────────

function IntelContent({ file, onMarkRead }: { file: IntelReportFile; onMarkRead: (fn: string) => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/intel/reports?file=${encodeURIComponent(file.filename)}&type=${file.type}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setContent(d.content); onMarkRead(file.filename) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [file.filename]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4"/>)}</div>
  if (error) return <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>
  if (content) return <Markdown content={content} variant="description"/>
  return null
}

// ── Intel Tab ────────────────────────────────────────────────────────────────

function IntelTab({ tabId, initialReport, onCountChange }: {
  tabId: string
  initialReport?: string | null
  onCountChange?: (count: number, loaded: boolean) => void
}) {
  const [files, setFiles]           = useState<IntelReportFile[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<IntelReportFile | null>(null)
  const [search, setSearch]         = useState('')
  const [filterType, setFilterType] = useState<'all' | 'daily' | 'weekly'>('all')
  const [readSet, setReadSet]       = useState<Set<string>>(new Set())
  const [queueOpen, setQueueOpen]   = useState(false)

  useEffect(() => { setReadSet(loadReadSet(INTEL_READ_KEY)) }, [])

  const markRead = useCallback((filename: string) => {
    setReadSet(prev => { const next = new Set(prev); next.add(filename); saveReadSet(INTEL_READ_KEY, next); return next })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try { const data = await fetch('/api/intel/reports').then(r => r.json()); setFiles(data.files || []) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!initialReport || !files.length) return
    const f = files.find(x => x.filename === initialReport)
    if (f && !selected) setSelected(f)
  }, [initialReport, files]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onCountChange?.(files.length, !loading) }, [files.length, loading, onCountChange])

  const handleDelete = useCallback(async (e: React.MouseEvent, f: IntelReportFile) => {
    e.stopPropagation()
    if (!confirm(`确定删除 ${f.filename}？`)) return
    try {
      const res = await fetch(`/api/intel/reports?file=${encodeURIComponent(f.filename)}&type=${f.type}`, { method: 'DELETE' })
      if (!res.ok) { alert(`删除失败: ${(await res.json()).error}`); return }
      setReadSet(prev => { const next = new Set(prev); next.delete(f.filename); saveReadSet(INTEL_READ_KEY, next); return next })
      setFiles(prev => prev.filter(x => x.filename !== f.filename))
      setSelected(prev => prev?.filename === f.filename ? null : prev)
    } catch { alert('删除失败，请重试') }
  }, [])

  const filtered = files.filter(f => {
    const q = search.toLowerCase()
    const matchSearch = !search || f.filename.toLowerCase().includes(q) || (f.title?.toLowerCase().includes(q) ?? false)
    return matchSearch && (filterType === 'all' || f.type === filterType)
  })

  // Bug 5: Group by type (daily/weekly)
  const byType: Record<string, IntelReportFile[]> = {}
  for (const f of filtered) {
    if (!byType[f.type]) byType[f.type] = []
    byType[f.type].push(f)
  }

  const selectedIdx = selected ? filtered.findIndex(f => f.filename === selected.filename) : -1
  const hasPrev = selectedIdx > 0
  const hasNext = selectedIdx >= 0 && selectedIdx < filtered.length - 1

  function openReport(f: IntelReportFile) { setSelected(f); setUrlReport(tabId, f.filename) }
  function closeModal() { setSelected(null); clearUrlReport() }
  function navPrev() { if (hasPrev) openReport(filtered[selectedIdx - 1]) }
  function navNext() { if (hasNext) openReport(filtered[selectedIdx + 1]) }

  function renderRow(f: IntelReportFile) {
    const { label, color } = getIntelTag(f.type)
    const isRead = readSet.has(f.filename)
    return (
      <div key={f.filename}
        className={cn('group flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 cursor-pointer transition-colors', selected?.filename === f.filename ? 'bg-primary/5' : 'hover:bg-secondary/50')}
        onClick={() => openReport(f)}>
        <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isRead ? 'bg-transparent' : 'bg-blue-500')}/>
        <p className={cn('text-sm flex-1 min-w-0 truncate', isRead ? 'text-muted-foreground' : 'text-foreground font-medium')}>
          {f.title || f.filename.replace('.md', '')}
        </p>
        <TagPill label={label} color={color}/>
        <span className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right">{f.date || fmtDate(f.modifiedAt)}</span>
        <span className="text-xs text-muted-foreground flex-shrink-0 w-14 text-right">{f.sizeKb} KB</span>
        <button onClick={e => handleDelete(e, f)} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive" title="删除">
          <Trash2 className="w-3.5 h-3.5"/>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Intel 夜间调研报告 — 日报与周报</p>
          {!loading && files.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground">
                <Moon className="w-3 h-3"/> {files.filter(f => f.type === 'daily').length} 日报
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground">
                <BarChart2 className="w-3 h-3"/> {files.filter(f => f.type === 'weekly').length} 周报
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setQueueOpen(true)} className="gap-1.5">
            <ListTodo className="w-3.5 h-3.5"/>研究队列
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>刷新
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <input type="text" placeholder="搜索报告…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"/>
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', 'daily', 'weekly'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filterType === t ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary')}>
              {t === 'all' ? '全部' : t === 'daily' ? '🌙 日报' : '📊 周报'}
            </button>
          ))}
        </div>
      </div>

      {loading ? <ListSkeleton/> : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Moon className="w-10 h-10"/>
          <p>暂无 Intel 报告</p>
          <p className="text-sm">日报: <code className="font-mono">reports/intel/daily/</code> · 周报: <code className="font-mono">reports/intel/weekly/</code></p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">没有匹配的报告</div>
      ) : (
        /* Bug 5: Grouped collapsible by type */
        <div className="space-y-1">
          {Object.entries(byType).map(([type, groupFiles]) => {
            const { label, accent } = getIntelTag(type as 'daily' | 'weekly')
            return (
              <CollapsibleGroup key={type} title={label} count={groupFiles.length} accentColor={accent}>
                {groupFiles.map(f => renderRow(f))}
              </CollapsibleGroup>
            )
          })}
        </div>
      )}

      {/* Intel Queue Modal */}
      {queueOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setQueueOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
          <div className="relative z-10 w-full max-w-lg mx-4 bg-card rounded-xl shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-primary"/>
                <span className="font-semibold text-sm">Intel 研究队列</span>
              </div>
              <button onClick={() => setQueueOpen(false)} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
                <X className="w-4 h-4"/>
              </button>
            </div>
            <div className="px-4 pb-4">
              <IntelQueueManager/>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <ReportModal
          title={selected.title || selected.filename.replace('.md', '')}
          tag={<TagPill label={getIntelTag(selected.type).label} color={getIntelTag(selected.type).color}/>}
          date={selected.date || fmtDate(selected.modifiedAt)}
          sizeKb={selected.sizeKb}
          onClose={closeModal} onPrev={navPrev} onNext={navNext}
          hasPrev={hasPrev} hasNext={hasNext}
        >
          <IntelContent file={selected} onMarkRead={markRead}/>
        </ReportModal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function ReportsContent({
  activeTab,
  initialReport,
  onTabCountChange,
}: {
  activeTab: TabId
  initialReport: string | null
  onTabCountChange: (tabId: TabId, count: number, loaded: boolean) => void
}) {
  return (
    <div className="max-w-full space-y-6">
      <div className={cn(activeTab === 'discovery' ? 'block' : 'hidden')}>
        <DiscoveryTab tabId="discovery" initialReport={activeTab === 'discovery' ? initialReport : null} onCountChange={(c, l) => onTabCountChange('discovery', c, l)}/>
      </div>
      <div className={cn(activeTab === 'listing' ? 'block' : 'hidden')}>
        <ListingTab tabId="listing" initialReport={activeTab === 'listing' ? initialReport : null} onCountChange={(c, l) => onTabCountChange('listing', c, l)}/>
      </div>
      <div className={cn(activeTab === 'ppc' ? 'block' : 'hidden')}>
        <PpcTab tabId="ppc" initialReport={activeTab === 'ppc' ? initialReport : null} onCountChange={(c, l) => onTabCountChange('ppc', c, l)}/>
      </div>
      <div className={cn(activeTab === 'content' ? 'block' : 'hidden')}>
        <ComingSoon label="Content Reports"/>
      </div>
      <div className={cn(activeTab === 'strategy' ? 'block' : 'hidden')}>
        <StrategyTab tabId="strategy" initialReport={activeTab === 'strategy' ? initialReport : null} onCountChange={(c, l) => onTabCountChange('strategy', c, l)}/>
      </div>
      <div className={cn(activeTab === 'intel' ? 'block' : 'hidden')}>
        <IntelTab tabId="intel" initialReport={activeTab === 'intel' ? initialReport : null} onCountChange={(c, l) => onTabCountChange('intel', c, l)}/>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('discovery')
  const [initialReport, setInitialReport] = useState<string | null>(null)
  const [tabCounts, setTabCounts] = useState<Partial<Record<TabId, number>>>({})
  const [tabLoaded, setTabLoaded] = useState<Partial<Record<TabId, boolean>>>({})

  // Read URL params on mount
  useEffect(() => {
    const { tab, report } = getInitialUrlParams()
    if (tab && TABS.some(t => t.id === tab)) {
      setActiveTab(tab as TabId)
    }
    if (report) setInitialReport(report)
  }, [])

  const handleTabCountChange = useCallback((tabId: TabId, count: number, loaded: boolean) => {
    setTabCounts(prev => prev[tabId] === count ? prev : { ...prev, [tabId]: count })
    setTabLoaded(prev => prev[tabId] === loaded ? prev : { ...prev, [tabId]: loaded })
  }, [])

  function switchTab(tab: TabId) {
    setActiveTab(tab)
    setInitialReport(null)
    setUrlTab(tab)
  }

  return (
    <DashboardPageLayout
      signedOut={{ message: 'Sign in to view reports', forceRedirectUrl: '/reports' }}
      title="Reports"
      description="报告中心"
      headerActions={
        <div className="flex max-w-full flex-wrap gap-1 rounded-lg border border-slate-200 p-0.5">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              <span className="flex items-center">
                <span>{tab.label}</span>
                {tabLoaded[tab.id] && (tabCounts[tab.id] ?? 0) > 0 && (
                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                    {tabCounts[tab.id]}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      }
    >
      <ReportsContent activeTab={activeTab} initialReport={initialReport} onTabCountChange={handleTabCountChange}/>
    </DashboardPageLayout>
  )
}
