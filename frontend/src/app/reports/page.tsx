'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Markdown } from '@/components/atoms/Markdown'
import {
  FileText, RefreshCw, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, X, Calendar,
  Package, BarChart2, Search, TrendingUp,
  Users, Megaphone, LayoutGrid, Clock, Trash2, Zap, PanelLeftClose, PanelLeftOpen,
  Moon, Plus, ArrowUp, ArrowDown, CheckCircle2, ListTodo,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DashboardPageLayout } from '@/components/templates/DashboardPageLayout'
import { cn } from '@/lib/utils'

// ─── Mobile detection hook ─────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

// ─── Mobile Report Overlay ─────────────────────────────────────────────────────
function MobileOverlay({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-white flex flex-col"
      style={{ height: '100dvh' }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-white flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-sm text-blue-600 font-medium flex-shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
          返回列表
        </button>
        <span className="text-sm text-muted-foreground truncate flex-1">{title}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {children}
      </div>
    </div>,
    document.body
  )
}

// ─── Tab Config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'discovery', label: '🔍 市场研究',  sub: '市场研究' },
  { id: 'listing',   label: '📦 Listing',   sub: 'Listing 优化' },
  { id: 'ppc',       label: '📊 PPC 报告',   sub: '广告报告' },
  { id: 'content',   label: '✍️ 内容报告', sub: '内容分析' },
  { id: 'strategy',  label: '🎯 战略调研', sub: '战略 & 调研' },
  { id: 'intel',     label: '🌙 夜间调研',  sub: '夜间调研' },
] as const

type TabId = typeof TABS[number]['id']

// ─── ASIN Nicknames ───────────────────────────────────────────────────────────

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

// ─── localStorage helpers ─────────────────────────────────────────────────────

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

// ─── Coming Soon ──────────────────────────────────────────────────────────────

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4 text-muted-foreground">
      <Clock className="w-12 h-12" />
      <p className="text-xl font-semibold text-[hsl(var(--foreground))]">{label}</p>
      <p className="text-base text-[hsl(var(--muted-foreground))]">Coming Soon — 即将上线</p>
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

function listingTypeLabel(type: string): { label: string; variant: 'default' | 'outline' | 'accent' | 'success' | 'warning' | 'danger' } {
  if (type.includes('search-term')) return { label: 'Search Terms', variant: 'accent' }
  if (type.includes('listing'))    return { label: 'Listing',       variant: 'warning' }
  return { label: type || 'Report', variant: 'outline' }
}

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) }
  catch { return d }
}

function ListingDetail({
  file,
  onMarkRead,
  fullscreen,
}: {
  file: ListingReportFile
  onMarkRead: (filename: string) => void
  fullscreen?: boolean
}) {
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

  const { label, variant } = listingTypeLabel(file.type)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge className="text-[10px] font-semibold flex-shrink-0" variant={variant}>{label}</Badge>
        <p className="text-base font-mono text-[hsl(var(--muted-foreground))] truncate flex-1">{file.filename.replace(/\.md$/, '')}</p>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">{file.sizeKb} KB</span>
      </div>
      {fullscreen ? (
        <div>
          {loading && <div className="space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-4"/>)}</div>}
          {error && <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>}
          {content && <Markdown content={content} variant="description" />}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 max-h-[70vh] overflow-y-auto">
            {loading && <div className="space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-4"/>)}</div>}
            {error && <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>}
            {content && <Markdown content={content} variant="description" />}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ListingTab({ onCountChange }: { onCountChange?: (count: number, loaded: boolean) => void }) {
  const isMobile = useIsMobile()
  const [files, setFiles] = useState<ListingReportFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ListingReportFile | null>(null)
  const [search, setSearch] = useState('')
  const [readSet, setReadSet] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [mobileShowContent, setMobileShowContent] = useState(false)

  // Load read state from localStorage on mount
  useEffect(() => {
    setReadSet(loadReadSet(LISTING_READ_KEY))
  }, [])

  const markRead = useCallback((filename: string) => {
    setReadSet(prev => {
      const next = new Set(prev)
      next.add(filename)
      saveReadSet(LISTING_READ_KEY, next)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/listing/reports')
      const data = await res.json()
      setFiles(data.files || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = useCallback(async (e: React.MouseEvent, f: ListingReportFile) => {
    e.stopPropagation()
    if (!confirm(`确定删除 ${f.filename}？`)) return
    try {
      const res = await fetch(`/api/listing/reports?file=${encodeURIComponent(f.filename)}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        alert(`删除失败: ${d.error}`)
        return
      }
      // Remove from read set and file list
      setReadSet(prev => {
        const next = new Set(prev)
        next.delete(f.filename)
        saveReadSet(LISTING_READ_KEY, next)
        return next
      })
      setFiles(prev => prev.filter(x => x.filename !== f.filename))
      setSelected(prev => (prev?.filename === f.filename ? null : prev))
    } catch (e) {
      console.error(e)
      alert('删除失败，请重试')
    }
  }, [])

  useEffect(() => {
    onCountChange?.(files.length, !loading)
  }, [files.length, loading, onCountChange])

  const filtered = files.filter(f => {
    if (!search) return true
    const needle = search.toLowerCase()
    const nickname = ASIN_NICKNAMES[f.asin]?.toLowerCase() ?? ''
    return f.filename.toLowerCase().includes(needle)
      || f.asin.toLowerCase().includes(needle)
      || nickname.includes(needle)
      || f.type.toLowerCase().includes(needle)
  })

  // Group by ASIN
  const byAsin: Record<string, ListingReportFile[]> = {}
  for (const f of filtered) { if (!byAsin[f.asin]) byAsin[f.asin] = []; byAsin[f.asin].push(f) }

  function toggleAsin(asin: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(asin)) next.delete(asin)
      else next.add(asin)
      return next
    })
  }

  return (
    <>
    <div className="space-y-4">
      {/* Compact header with inline stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-base text-[hsl(var(--muted-foreground))]">Listing 优化分析报告 — 每两周自动生成</p>
          {!loading && files.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))]">
                <FileText className="w-3 h-3"/> {files.length} 份
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))]">
                <Package className="w-3 h-3"/> {new Set(files.map(f=>f.asin)).size} ASIN
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))]">
                <BarChart2 className="w-3 h-3"/> {files[0] ? fmtDate(files[0].modifiedAt) : '—'}
              </span>
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}/>刷新
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=> (
          <Card key={i}><CardContent className="pt-4"><Skeleton className="h-4 w-48 mb-2"/><Skeleton className="h-3 w-32"/></CardContent></Card>
        ))}</div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <FileText className="w-10 h-10"/>
          <p className="text-base text-[hsl(var(--muted-foreground))]">暂无报告</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            报告文件将出现在 <code className="font-mono">~/.openclaw/workspace/reports/listing/</code>
          </p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Left panel — collapsible */}
          <div className={cn('flex flex-shrink-0 transition-all duration-200', panelCollapsed ? 'w-[40px]' : 'w-[288px]', mobileShowContent ? 'hidden md:flex' : 'flex')}>
            {/* Always-visible toggle strip */}
            <div className="flex flex-col items-center pt-1 pr-1">
              <button
                onClick={() => setPanelCollapsed(!panelCollapsed)}
                className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] transition-colors"
                title={panelCollapsed ? '展开面板' : '收起面板'}
              >
                {panelCollapsed ? <PanelLeftOpen className="w-4 h-4"/> : <PanelLeftClose className="w-4 h-4"/>}
              </button>
              {panelCollapsed && (
                <div className="h-[calc(100vh-280px)] overflow-y-auto space-y-1 mt-2">
                  {Object.entries(byAsin).map(([asin, asinFiles]) => {
                    const nickname = ASIN_NICKNAMES[asin]
                    return asinFiles.map(f => {
                      const isActive = selected?.filename === f.filename
                      const isRead = readSet.has(f.filename)
                      return (
                        <button
                          key={f.filename}
                          onClick={() => setSelected(f)}
                          title={`${nickname ?? asin} — ${f.filename}`}
                          className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors relative ${isActive ? 'bg-[hsl(var(--primary)/0.15)]' : 'hover:bg-[hsl(var(--secondary))]'}`}
                        >
                          <Package className={`w-4 h-4 ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}/>
                          {!isRead && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]"/>}
                        </button>
                      )
                    })
                  })}
                </div>
              )}
            </div>
            {/* Content — only shown when not collapsed */}
            {!panelCollapsed && (
              <div className="flex flex-col gap-3 flex-1 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]"/>
                  <input
                    type="text"
                    placeholder="搜索 ASIN / 报告…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary)/0.5)]"
                  />
                </div>
                <div className="h-[calc(100vh-280px)] overflow-y-auto pr-1 space-y-3">
                  {Object.entries(byAsin).map(([asin, asinFiles]) => {
                    const nickname = ASIN_NICKNAMES[asin]
                    const isCollapsed = collapsed.has(asin)
                    return (
                      <div key={asin} className="space-y-1.5">
                        <button
                          onClick={() => toggleAsin(asin)}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[hsl(var(--secondary)/0.6)] border border-[hsl(var(--border))]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Package className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]"/>
                            <div className="min-w-0 text-left">
                              <p className="text-xs font-semibold text-[hsl(var(--foreground))] truncate">{nickname ?? asin}</p>
                              <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono truncate">{asin}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{asinFiles.length} 份</span>
                            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]"/> : <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]"/>}
                          </div>
                        </button>
                        {!isCollapsed && (
                          <div className="space-y-1.5">
                            {asinFiles.map(f => {
                              const { label, variant } = listingTypeLabel(f.type)
                              const isRead = readSet.has(f.filename)
                              const isActive = selected?.filename === f.filename
                              return (
                                <div
                                  key={f.filename}
                                  className={`group rounded-lg border px-2.5 py-2 transition-all ${isActive ? 'border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.08)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--secondary))]'}`}
                                >
                                  <div className="flex items-start gap-1">
                                    <button onClick={() => { setSelected(f); setPanelCollapsed(true); setMobileShowContent(true) }} className="flex-1 min-w-0 text-left">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className={`text-xs font-medium truncate ${isRead ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]'}`}>{f.title || (nickname ?? asin)}</p>
                                          {f.title && <p className="text-[9px] font-mono text-[hsl(var(--muted-foreground))] truncate">{f.filename.replace('.md','')}</p>}
                                        </div>
                                        <Badge className="text-[10px] font-semibold flex-shrink-0" variant={variant}>{label}</Badge>
                                      </div>
                                      <div className="flex items-center gap-2 mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                                        <Calendar className="w-3 h-3"/>
                                        <span>{fmtDate(f.modifiedAt)}</span>
                                        <span>·</span>
                                        <span className={isRead ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--primary))]'}>{isRead ? '已读' : '未读'}</span>
                                      </div>
                                    </button>
                                    <button
                                      onClick={(e) => handleDelete(e, f)}
                                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/15 text-[hsl(var(--muted-foreground))] hover:text-destructive mt-0.5"
                                      title="删除"
                                    >
                                      <Trash2 className="w-3.5 h-3.5"/>
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="flex-1 min-w-0">
            <div className="h-[calc(100vh-280px)] overflow-y-auto">
              {mobileShowContent && (
                <button
                  onClick={() => { setSelected(null); setMobileShowContent(false); setPanelCollapsed(false) }}
                  className="md:hidden flex items-center gap-1.5 mb-3 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  返回列表
                </button>
              )}
              {selected ? (
                <ListingDetail file={selected} onMarkRead={markRead} />
              ) : (
                <div className="h-full flex items-center justify-center border border-dashed border-[hsl(var(--border))] rounded-xl text-[hsl(var(--muted-foreground))]">
                  选择一个报告查看
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    {isMobile && selected && (
      <MobileOverlay
        title={selected.filename.replace('.md', '')}
        onClose={() => { setSelected(null); setMobileShowContent(false); setPanelCollapsed(false) }}
      >
        <ListingDetail file={selected} onMarkRead={markRead} fullscreen />
      </MobileOverlay>
    )}
    </>
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

const DISCOVERY_BADGE: Record<string, { label: string; variant: 'default' | 'outline' | 'accent' | 'success' | 'warning' | 'danger'; icon: React.ComponentType<{ className?: string }> }> = {
  trends:        { label: '趋势研究', variant: 'accent',  icon: TrendingUp },
  'trends-deep': { label: '深度趋势', variant: 'accent',  icon: TrendingUp },
  competitors:   { label: '竞品对比', variant: 'danger',  icon: Users },
  voc:           { label: '客户之声', variant: 'success', icon: Megaphone },
  industry:      { label: '行业动态', variant: 'accent',  icon: LayoutGrid },
}

function discoveryBadge(prefix: string) {
  return DISCOVERY_BADGE[prefix] ?? { label: prefix || '报告', variant: 'outline' as const satisfies 'default' | 'outline' | 'accent' | 'success' | 'warning' | 'danger', icon: FileText }
}

function DiscoveryDetail({
  file,
  onMarkRead,
  fullscreen,
}: {
  file: DiscoveryFile
  onMarkRead: (filename: string) => void
  fullscreen?: boolean
}) {
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

  const { label, variant } = discoveryBadge(file.prefix)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge className="text-[10px] font-semibold flex-shrink-0" variant={variant}>{label}</Badge>
        <p className="text-base font-mono text-[hsl(var(--muted-foreground))] truncate flex-1">{file.filename.replace(/\.md$/, '')}</p>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">{file.sizeKb} KB</span>
      </div>
      {fullscreen ? (
        <div>
          {loading && <div className="space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-4"/>)}</div>}
          {error && <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>}
          {content && <Markdown content={content} variant="description" />}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 max-h-[70vh] overflow-y-auto">
            {loading && <div className="space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-4"/>)}</div>}
            {error && <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>}
            {content && <Markdown content={content} variant="description" />}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function DiscoveryTab({ onCountChange }: { onCountChange?: (count: number, loaded: boolean) => void }) {
  const isMobile = useIsMobile()
  const [files, setFiles] = useState<DiscoveryFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DiscoveryFile | null>(null)
  const [search, setSearch] = useState('')
  const [filterPrefix, setFilterPrefix] = useState<string>('all')
  const [readSet, setReadSet] = useState<Set<string>>(new Set())
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [mobileShowContent, setMobileShowContent] = useState(false)

  useEffect(() => {
    setReadSet(loadReadSet(DISCOVERY_READ_KEY))
  }, [])

  const markRead = useCallback((filename: string) => {
    setReadSet(prev => {
      const next = new Set(prev)
      next.add(filename)
      saveReadSet(DISCOVERY_READ_KEY, next)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/discovery/reports')
      const data = await res.json()
      setFiles(data.files || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = useCallback(async (e: React.MouseEvent, f: DiscoveryFile) => {
    e.stopPropagation()
    if (!confirm(`确定删除 ${f.filename}？`)) return
    try {
      const res = await fetch(`/api/discovery/reports?file=${encodeURIComponent(f.filename)}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        alert(`删除失败: ${d.error}`)
        return
      }
      setReadSet(prev => {
        const next = new Set(prev)
        next.delete(f.filename)
        saveReadSet(DISCOVERY_READ_KEY, next)
        return next
      })
      setFiles(prev => prev.filter(x => x.filename !== f.filename))
      setSelected(prev => prev?.filename === f.filename ? null : prev)
    } catch (e) {
      console.error(e)
      alert('删除失败，请重试')
    }
  }, [])

  useEffect(() => {
    onCountChange?.(files.length, !loading)
  }, [files.length, loading, onCountChange])

  const prefixes = Array.from(new Set(files.map(f => f.prefix))).filter(Boolean)

  const filtered = files.filter(f => {
    const matchSearch = !search || f.filename.toLowerCase().includes(search.toLowerCase())
    const matchPrefix = filterPrefix === 'all' || f.prefix === filterPrefix
    return matchSearch && matchPrefix
  })

  return (
    <>
    <div className="space-y-4">
      {/* Compact header with inline stats */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <p className="text-base text-[hsl(var(--muted-foreground))]">市场研究与竞品分析报告</p>
          {!loading && files.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))]">
              <FileText className="w-3 h-3"/> {files.length} 份
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}/>刷新
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=>(
          <Card key={i}><CardContent className="pt-4"><Skeleton className="h-4 w-48 mb-2"/><Skeleton className="h-3 w-32"/></CardContent></Card>
        ))}</div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <FileText className="w-10 h-10"/>
          <p className="text-base text-[hsl(var(--muted-foreground))]">暂无报告</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            报告文件将出现在 <code className="font-mono">~/.openclaw/workspace/reports/discovery/</code>
          </p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Left panel — collapsible */}
          <div className={cn('flex flex-shrink-0 transition-all duration-200', panelCollapsed ? 'w-[40px]' : 'w-[288px]', mobileShowContent ? 'hidden md:flex' : 'flex')}>
            {/* Always-visible toggle strip */}
            <div className="flex flex-col items-center pt-1 pr-1">
              <button
                onClick={() => setPanelCollapsed(!panelCollapsed)}
                className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] transition-colors"
                title={panelCollapsed ? '展开面板' : '收起面板'}
              >
                {panelCollapsed ? <PanelLeftOpen className="w-4 h-4"/> : <PanelLeftClose className="w-4 h-4"/>}
              </button>
              {panelCollapsed && (
                <div className="h-[calc(100vh-280px)] overflow-y-auto space-y-1 mt-2">
                  {filtered.map(f => {
                    const { icon: Icon } = discoveryBadge(f.prefix)
                    const isActive = selected?.filename === f.filename
                    const isRead = readSet.has(f.filename)
                    return (
                      <button
                        key={f.filename}
                        onClick={() => setSelected(f)}
                        title={f.filename.replace('.md','')}
                        className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors relative ${isActive ? 'bg-[hsl(var(--primary)/0.15)]' : 'hover:bg-[hsl(var(--secondary))]'}`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}/>
                        {!isRead && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]"/>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Content — only shown when not collapsed */}
            {!panelCollapsed && (
              <div className="flex flex-col gap-3 flex-1 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]"/>
                  <input
                    type="text"
                    placeholder="搜索报告…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary)/0.5)]"
                  />
                </div>
                {prefixes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setFilterPrefix('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filterPrefix === 'all' ? 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'}`}
                    >全部</button>
                    {prefixes.map(p => {
                      const { label } = discoveryBadge(p)
                      return (
                        <button key={p} onClick={() => setFilterPrefix(p === filterPrefix ? 'all' : p)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filterPrefix === p ? 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'}`}
                        >{label}</button>
                      )
                    })}
                  </div>
                )}
                <div className="h-[calc(100vh-280px)] overflow-y-auto pr-1 space-y-2">
                  {filtered.length === 0 ? (
                    <div className="flex items-center justify-center py-10">
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">没有匹配的报告</p>
                    </div>
                  ) : filtered.map(f => {
                    const { label, variant, icon: Icon } = discoveryBadge(f.prefix)
                    const isRead = readSet.has(f.filename)
                    const isActive = selected?.filename === f.filename
                    return (
                      <div
                        key={f.filename}
                        className={`group rounded-lg border px-2.5 py-2 transition-all ${isActive ? 'border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.08)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--secondary))]'}`}
                      >
                        <div className="flex items-start gap-1">
                          <button onClick={() => { setSelected(f); setPanelCollapsed(true); setMobileShowContent(true) }} className="flex-1 min-w-0 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isRead ? 'bg-transparent' : 'bg-blue-500'}`} />
                                <Icon className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}/>
                                <p className={`text-xs font-medium truncate ${isRead ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]'}`}>{f.title || f.filename.replace('.md','')}</p>
                              </div>
                              <Badge className="text-[10px] font-semibold flex-shrink-0" variant={variant}>{label}</Badge>
                            </div>
                            {f.title && <p className="text-[9px] font-mono text-[hsl(var(--muted-foreground))] truncate mt-0.5 ml-5">{f.filename.replace('.md','')}</p>}
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                              <Calendar className="w-3 h-3"/>
                              <span>{f.date || fmtDate(f.modifiedAt)}</span>
                              <span>·</span>
                              <span>{f.sizeKb} KB</span>
                              <span>·</span>
                              <span className={isRead ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--primary))]'}>{isRead ? '已读' : '未读'}</span>
                            </div>
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, f)}
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/15 text-[hsl(var(--muted-foreground))] hover:text-destructive mt-0.5"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right panel — preview */}
          <div className="flex-1 min-w-0">
            <div className="h-[calc(100vh-280px)] overflow-y-auto">
              {mobileShowContent && (
                <button
                  onClick={() => { setSelected(null); setMobileShowContent(false); setPanelCollapsed(false) }}
                  className="md:hidden flex items-center gap-1.5 mb-3 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  返回列表
                </button>
              )}
              {selected ? (
                <DiscoveryDetail file={selected} onMarkRead={markRead} />
              ) : (
                <div className="h-full flex items-center justify-center border border-dashed border-[hsl(var(--border))] rounded-xl text-[hsl(var(--muted-foreground))]">
                  选择一个报告查看
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    {isMobile && selected && (
      <MobileOverlay
        title={selected.filename.replace('.md', '')}
        onClose={() => { setSelected(null); setMobileShowContent(false); setPanelCollapsed(false) }}
      >
        <DiscoveryDetail file={selected} onMarkRead={markRead} fullscreen />
      </MobileOverlay>
    )}
    </>
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

const PPC_BADGE: Record<string, { label: string; variant: 'default' | 'outline' | 'accent' | 'success' | 'warning' | 'danger'; icon: React.ComponentType<{ className?: string }> }> = {
  'ai-insights':       { label: 'AI 洞察',   variant: 'accent',   icon: Zap },
  'weekly-report':     { label: '周报',       variant: 'accent',   icon: BarChart2 },
  'bid-analysis':      { label: '出价分析',   variant: 'warning',  icon: TrendingUp },
  'campaign-analysis': { label: '广告活动',   variant: 'success',  icon: Megaphone },
  'search-terms':      { label: '搜索词',     variant: 'warning',  icon: Search },
}

function ppcBadge(prefix: string) {
  return PPC_BADGE[prefix] ?? { label: prefix || 'PPC 报告', variant: 'outline' as const satisfies 'default' | 'outline' | 'accent' | 'success' | 'warning' | 'danger', icon: FileText }
}

function PpcDetail({
  file,
  onMarkRead,
  fullscreen,
}: {
  file: PpcReportFile
  onMarkRead: (filename: string) => void
  fullscreen?: boolean
}) {
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

  const { label, variant } = ppcBadge(file.prefix)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge className="text-[10px] font-semibold flex-shrink-0" variant={variant}>{label}</Badge>
        <p className="text-base font-mono text-[hsl(var(--muted-foreground))] truncate flex-1">{file.filename.replace(/\.md$/, '')}</p>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">{file.sizeKb} KB</span>
      </div>
      {fullscreen ? (
        <div>
          {loading && <div className="space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-4"/>)}</div>}
          {error && <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>}
          {content && <Markdown content={content} variant="description" />}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 max-h-[70vh] overflow-y-auto">
            {loading && <div className="space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-4"/>)}</div>}
            {error && <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>}
            {content && <Markdown content={content} variant="description" />}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PpcTab({ onCountChange }: { onCountChange?: (count: number, loaded: boolean) => void }) {
  const isMobile = useIsMobile()
  const [files, setFiles] = useState<PpcReportFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PpcReportFile | null>(null)
  const [search, setSearch] = useState('')
  const [filterPrefix, setFilterPrefix] = useState<string>('all')
  const [readSet, setReadSet] = useState<Set<string>>(new Set())
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [mobileShowContent, setMobileShowContent] = useState(false)

  useEffect(() => {
    setReadSet(loadReadSet(PPC_READ_KEY))
  }, [])

  const markRead = useCallback((filename: string) => {
    setReadSet(prev => {
      const next = new Set(prev)
      next.add(filename)
      saveReadSet(PPC_READ_KEY, next)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ppc/reports')
      const data = await res.json()
      setFiles(data.files || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = useCallback(async (e: React.MouseEvent, f: PpcReportFile) => {
    e.stopPropagation()
    if (!confirm(`确定删除 ${f.filename}？`)) return
    try {
      const res = await fetch(`/api/ppc/reports?file=${encodeURIComponent(f.filename)}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        alert(`删除失败: ${d.error}`)
        return
      }
      setReadSet(prev => {
        const next = new Set(prev)
        next.delete(f.filename)
        saveReadSet(PPC_READ_KEY, next)
        return next
      })
      setFiles(prev => prev.filter(x => x.filename !== f.filename))
      setSelected(prev => prev?.filename === f.filename ? null : prev)
    } catch (e) {
      console.error(e)
      alert('删除失败，请重试')
    }
  }, [])

  useEffect(() => {
    onCountChange?.(files.length, !loading)
  }, [files.length, loading, onCountChange])

  const prefixes = Array.from(new Set(files.map(f => f.prefix))).filter(Boolean)

  const filtered = files.filter(f => {
    const matchSearch = !search || f.filename.toLowerCase().includes(search.toLowerCase())
    const matchPrefix = filterPrefix === 'all' || f.prefix === filterPrefix
    return matchSearch && matchPrefix
  })

  return (
    <>
    <div className="space-y-4">
      {/* Compact header with inline stats */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <p className="text-base text-[hsl(var(--muted-foreground))]">PPC 广告 AI 洞察与分析报告</p>
          {!loading && files.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))]">
              <Zap className="w-3 h-3"/> {files.length} 份
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}/>刷新
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=>(
          <Card key={i}><CardContent className="pt-4"><Skeleton className="h-4 w-48 mb-2"/><Skeleton className="h-3 w-32"/></CardContent></Card>
        ))}</div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Zap className="w-10 h-10"/>
          <p className="text-base text-[hsl(var(--muted-foreground))]">暂无 PPC 报告</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            报告文件将出现在 <code className="font-mono">~/.openclaw/workspace/reports/ppc/</code>
          </p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">命名格式: <code className="font-mono">ai-insights-YYYY-MM-DD.md</code></p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Left panel — collapsible */}
          <div className={cn('flex flex-shrink-0 transition-all duration-200', panelCollapsed ? 'w-[40px]' : 'w-[288px]', mobileShowContent ? 'hidden md:flex' : 'flex')}>
            {/* Always-visible toggle strip */}
            <div className="flex flex-col items-center pt-1 pr-1">
              <button
                onClick={() => setPanelCollapsed(!panelCollapsed)}
                className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] transition-colors"
                title={panelCollapsed ? '展开面板' : '收起面板'}
              >
                {panelCollapsed ? <PanelLeftOpen className="w-4 h-4"/> : <PanelLeftClose className="w-4 h-4"/>}
              </button>
              {panelCollapsed && (
                <div className="h-[calc(100vh-280px)] overflow-y-auto space-y-1 mt-2">
                  {filtered.map(f => {
                    const { icon: Icon } = ppcBadge(f.prefix)
                    const isActive = selected?.filename === f.filename
                    const isRead = readSet.has(f.filename)
                    return (
                      <button
                        key={f.filename}
                        onClick={() => setSelected(f)}
                        title={f.filename.replace('.md','')}
                        className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors relative ${isActive ? 'bg-[hsl(var(--primary)/0.15)]' : 'hover:bg-[hsl(var(--secondary))]'}`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}/>
                        {!isRead && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]"/>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Content — only shown when not collapsed */}
            {!panelCollapsed && (
              <div className="flex flex-col gap-3 flex-1 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]"/>
                  <input
                    type="text"
                    placeholder="搜索报告…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary)/0.5)]"
                  />
                </div>
                {prefixes.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setFilterPrefix('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filterPrefix === 'all' ? 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'}`}
                    >全部</button>
                    {prefixes.map(p => {
                      const { label } = ppcBadge(p)
                      return (
                        <button key={p} onClick={() => setFilterPrefix(p === filterPrefix ? 'all' : p)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filterPrefix === p ? 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'}`}
                        >{label}</button>
                      )
                    })}
                  </div>
                )}
                <div className="h-[calc(100vh-280px)] overflow-y-auto pr-1 space-y-2">
                  {filtered.length === 0 ? (
                    <div className="flex items-center justify-center py-10">
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">没有匹配的报告</p>
                    </div>
                  ) : filtered.map(f => {
                    const { label, variant, icon: Icon } = ppcBadge(f.prefix)
                    const isRead = readSet.has(f.filename)
                    const isActive = selected?.filename === f.filename
                    return (
                      <div
                        key={f.filename}
                        className={`group rounded-lg border px-2.5 py-2 transition-all ${isActive ? 'border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.08)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--secondary))]'}`}
                      >
                        <div className="flex items-start gap-1">
                          <button onClick={() => { setSelected(f); setPanelCollapsed(true); setMobileShowContent(true) }} className="flex-1 min-w-0 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isRead ? 'bg-transparent' : 'bg-blue-500'}`} />
                                <Icon className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}/>
                                <p className={`text-xs font-medium truncate ${isRead ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]'}`}>{f.title || f.filename.replace('.md','')}</p>
                              </div>
                              <Badge className="text-[10px] font-semibold flex-shrink-0" variant={variant}>{label}</Badge>
                            </div>
                            {f.title && <p className="text-[9px] font-mono text-[hsl(var(--muted-foreground))] truncate mt-0.5 ml-5">{f.filename.replace('.md','')}</p>}
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                              <Calendar className="w-3 h-3"/>
                              <span>{f.date || fmtDate(f.modifiedAt)}</span>
                              <span>·</span>
                              <span>{f.sizeKb} KB</span>
                              <span>·</span>
                              <span className={isRead ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--primary))]'}>{isRead ? '已读' : '未读'}</span>
                            </div>
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, f)}
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/15 text-[hsl(var(--muted-foreground))] hover:text-destructive mt-0.5"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right panel — preview */}
          <div className="flex-1 min-w-0">
            <div className="h-[calc(100vh-280px)] overflow-y-auto">
              {mobileShowContent && (
                <button
                  onClick={() => { setSelected(null); setMobileShowContent(false); setPanelCollapsed(false) }}
                  className="md:hidden flex items-center gap-1.5 mb-3 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  返回列表
                </button>
              )}
              {selected ? (
                <PpcDetail file={selected} onMarkRead={markRead} />
              ) : (
                <div className="h-full flex items-center justify-center border border-dashed border-[hsl(var(--border))] rounded-xl text-[hsl(var(--muted-foreground))]">
                  选择一个报告查看
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    {isMobile && selected && (
      <MobileOverlay
        title={selected.filename.replace('.md', '')}
        onClose={() => { setSelected(null); setMobileShowContent(false); setPanelCollapsed(false) }}
      >
        <PpcDetail file={selected} onMarkRead={markRead} fullscreen />
      </MobileOverlay>
    )}
    </>
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

// Badge rules: matched against full filename (contains check, order matters)
function strategyBadge(filename: string) {
  const name = filename.toLowerCase()
  if (name.includes('deep-dive'))
    return { label: '🔬 深度调研',   variant: 'accent' as const,   icon: Search }
  if (name.includes('feasibility'))
    return { label: '📋 可行性分析', variant: 'warning' as const,  icon: BarChart2 }
  if (name.includes('roadmap'))
    return { label: '🗺️ 路线图',     variant: 'success' as const,  icon: LayoutGrid }
  if (name.includes('growth-plan') || name.includes('strategy'))
    return { label: '🎯 战略规划',   variant: 'accent' as const,   icon: TrendingUp }
  if (name.includes('market-entry'))
    return { label: '🚀 市场进入',   variant: 'warning' as const,  icon: Zap }
  return { label: '📄 调研报告',     variant: 'outline' as const,  icon: FileText }
}

function StrategyDetail({
  file,
  onMarkRead,
  fullscreen,
}: {
  file: StrategyFile
  onMarkRead: (filename: string) => void
  fullscreen?: boolean
}) {
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

  const { label, variant } = strategyBadge(file.filename)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge className="text-[10px] font-semibold flex-shrink-0" variant={variant}>{label}</Badge>
        <p className="text-base font-mono text-[hsl(var(--muted-foreground))] truncate flex-1">{file.filename.replace(/\.md$/, '')}</p>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">{file.sizeKb} KB</span>
      </div>
      {fullscreen ? (
        <div>
          {loading && <div className="space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-4"/>)}</div>}
          {error && <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>}
          {content && <Markdown content={content} variant="description" />}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 max-h-[70vh] overflow-y-auto">
            {loading && <div className="space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-4"/>)}</div>}
            {error && <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>}
            {content && <Markdown content={content} variant="description" />}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StrategyTab({ onCountChange }: { onCountChange?: (count: number, loaded: boolean) => void }) {
  const isMobile = useIsMobile()
  const [files, setFiles] = useState<StrategyFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<StrategyFile | null>(null)
  const [search, setSearch] = useState('')
  const [filterPrefix, setFilterPrefix] = useState<string>('all')
  const [readSet, setReadSet] = useState<Set<string>>(new Set())
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [mobileShowContent, setMobileShowContent] = useState(false)

  useEffect(() => {
    setReadSet(loadReadSet(STRATEGY_READ_KEY))
  }, [])

  const markRead = useCallback((filename: string) => {
    setReadSet(prev => {
      const next = new Set(prev)
      next.add(filename)
      saveReadSet(STRATEGY_READ_KEY, next)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/strategy/reports')
      const data = await res.json()
      setFiles(data.files || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = useCallback(async (e: React.MouseEvent, f: StrategyFile) => {
    e.stopPropagation()
    if (!confirm(`确定删除 ${f.filename}？`)) return
    try {
      const res = await fetch(`/api/strategy/reports?file=${encodeURIComponent(f.filename)}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        alert(`删除失败: ${d.error}`)
        return
      }
      setReadSet(prev => {
        const next = new Set(prev)
        next.delete(f.filename)
        saveReadSet(STRATEGY_READ_KEY, next)
        return next
      })
      setFiles(prev => prev.filter(x => x.filename !== f.filename))
      setSelected(prev => prev?.filename === f.filename ? null : prev)
    } catch (e) {
      console.error(e)
      alert('删除失败，请重试')
    }
  }, [])

  useEffect(() => {
    onCountChange?.(files.length, !loading)
  }, [files.length, loading, onCountChange])

  // Deduplicate filter tags by badge label (not raw prefix) to avoid duplicates
  const badgeTypes = Array.from(
    new Map(files.map(f => {
      const badge = strategyBadge(f.filename)
      return [badge.label, badge]
    })).values()
  )

  const filtered = files.filter(f => {
    const matchSearch = !search || f.filename.toLowerCase().includes(search.toLowerCase())
    const matchBadge = filterPrefix === 'all' || strategyBadge(f.filename).label === filterPrefix
    return matchSearch && matchBadge
  })

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <p className="text-base text-[hsl(var(--muted-foreground))]">战略规划与市场研究报告</p>
          {!loading && files.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))]">
              <FileText className="w-3 h-3"/> {files.length} 份
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}/>刷新
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=>(
          <Card key={i}><CardContent className="pt-4"><Skeleton className="h-4 w-48 mb-2"/><Skeleton className="h-3 w-32"/></CardContent></Card>
        ))}</div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <FileText className="w-10 h-10"/>
          <p className="text-base text-[hsl(var(--muted-foreground))]">暂无战略报告</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            报告文件将出现在 <code className="font-mono">~/.openclaw/workspace/reports/strategy/</code>
          </p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Left panel — collapsible */}
          <div className={cn('flex flex-shrink-0 transition-all duration-200', panelCollapsed ? 'w-[40px]' : 'w-[288px]', mobileShowContent ? 'hidden md:flex' : 'flex')}>
            {/* Always-visible toggle strip */}
            <div className="flex flex-col items-center pt-1 pr-1">
              <button
                onClick={() => setPanelCollapsed(!panelCollapsed)}
                className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] transition-colors"
                title={panelCollapsed ? '展开面板' : '收起面板'}
              >
                {panelCollapsed ? <PanelLeftOpen className="w-4 h-4"/> : <PanelLeftClose className="w-4 h-4"/>}
              </button>
              {panelCollapsed && (
                <div className="h-[calc(100vh-280px)] overflow-y-auto space-y-1 mt-2">
                  {filtered.map(f => {
                    const { icon: Icon } = strategyBadge(f.filename)
                    const isActive = selected?.filename === f.filename
                    const isRead = readSet.has(f.filename)
                    return (
                      <button
                        key={f.filename}
                        onClick={() => setSelected(f)}
                        title={f.filename.replace('.md','')}
                        className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors relative ${isActive ? 'bg-[hsl(var(--primary)/0.15)]' : 'hover:bg-[hsl(var(--secondary))]'}`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}/>
                        {!isRead && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]"/>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Content — only shown when not collapsed */}
            {!panelCollapsed && (
              <div className="flex flex-col gap-3 flex-1 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]"/>
                  <input
                    type="text"
                    placeholder="搜索报告…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary)/0.5)]"
                  />
                </div>
                {badgeTypes.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setFilterPrefix('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filterPrefix === 'all' ? 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'}`}
                    >全部</button>
                    {badgeTypes.map(({ label }) => (
                      <button key={label} onClick={() => setFilterPrefix(label === filterPrefix ? 'all' : label)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filterPrefix === label ? 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'}`}
                      >{label}</button>
                    ))}
                  </div>
                )}
                <div className="h-[calc(100vh-280px)] overflow-y-auto pr-1 space-y-2">
                  {filtered.length === 0 ? (
                    <div className="flex items-center justify-center py-10">
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">没有匹配的报告</p>
                    </div>
                  ) : filtered.map(f => {
                    const { label, variant, icon: Icon } = strategyBadge(f.filename)
                    const isRead = readSet.has(f.filename)
                    const isActive = selected?.filename === f.filename
                    return (
                      <div
                        key={f.filename}
                        className={`group rounded-lg border px-2.5 py-2 transition-all ${isActive ? 'border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.08)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--secondary))]'}`}
                      >
                        <div className="flex items-start gap-1">
                          <button onClick={() => { setSelected(f); setPanelCollapsed(true); setMobileShowContent(true) }} className="flex-1 min-w-0 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isRead ? 'bg-transparent' : 'bg-blue-500'}`} />
                                <Icon className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}/>
                                <p className={`text-xs font-medium truncate ${isRead ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]'}`}>{f.title || f.filename.replace('.md','')}</p>
                              </div>
                              <Badge className="text-[10px] font-semibold flex-shrink-0" variant={variant}>{label}</Badge>
                            </div>
                            {f.title && <p className="text-[9px] font-mono text-[hsl(var(--muted-foreground))] truncate mt-0.5 ml-5">{f.filename.replace('.md','')}</p>}
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                              <Calendar className="w-3 h-3"/>
                              <span>{f.date || fmtDate(f.modifiedAt)}</span>
                              <span>·</span>
                              <span>{f.sizeKb} KB</span>
                              <span>·</span>
                              <span className={isRead ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--primary))]'}>{isRead ? '已读' : '未读'}</span>
                            </div>
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, f)}
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/15 text-[hsl(var(--muted-foreground))] hover:text-destructive mt-0.5"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right panel — preview */}
          <div className="flex-1 min-w-0">
            <div className="h-[calc(100vh-280px)] overflow-y-auto">
              {mobileShowContent && (
                <button
                  onClick={() => { setSelected(null); setMobileShowContent(false); setPanelCollapsed(false) }}
                  className="md:hidden flex items-center gap-1.5 mb-3 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  返回列表
                </button>
              )}
              {selected ? (
                <StrategyDetail file={selected} onMarkRead={markRead} />
              ) : (
                <div className="h-full flex items-center justify-center border border-dashed border-[hsl(var(--border))] rounded-xl text-[hsl(var(--muted-foreground))]">
                  选择一个报告查看
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    {isMobile && selected && (
      <MobileOverlay
        title={selected.filename.replace('.md', '')}
        onClose={() => { setSelected(null); setMobileShowContent(false); setPanelCollapsed(false) }}
      >
        <StrategyDetail file={selected} onMarkRead={markRead} fullscreen />
      </MobileOverlay>
    )}
    </>
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

interface IntelQueueItem {
  topic:    string
  priority: number
  addedAt:  string
  addedBy:  string
}

interface IntelCompletedItem extends IntelQueueItem {
  completedAt: string
  reportPath:  string
}

interface IntelQueueData {
  items:     IntelQueueItem[]
  completed: IntelCompletedItem[]
}

const INTEL_READ_KEY = 'intel-reports-read'

function intelBadge(type: 'daily' | 'weekly') {
  if (type === 'weekly') return { label: '📊 周报', variant: 'warning' as const }
  return { label: '🌙 日报', variant: 'accent' as const }
}

// ── Intel Queue Manager ──────────────────────────────────────────────────────

function IntelQueueManager() {
  const [queue, setQueue]           = useState<IntelQueueData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [newTopic, setNewTopic]     = useState('')
  const [adding, setAdding]         = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const loadQueue = useCallback(async () => {
    try {
      const res  = await fetch('/api/intel/queue')
      const data = await res.json()
      setQueue(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadQueue() }, [loadQueue])

  const handleAdd = async () => {
    if (!newTopic.trim()) return
    setAdding(true)
    try {
      const res  = await fetch('/api/intel/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: newTopic.trim() }),
      })
      const data = await res.json()
      setQueue(data)
      setNewTopic('')
    } catch (e) { console.error(e) }
    finally { setAdding(false) }
  }

  const handleDelete = async (index: number) => {
    try {
      const res  = await fetch(`/api/intel/queue?index=${index}`, { method: 'DELETE' })
      const data = await res.json()
      setQueue(data)
    } catch (e) { console.error(e) }
  }

  const handleMove = async (index: number, dir: 'up' | 'down') => {
    if (!queue) return
    const items  = [...queue.items]
    const target = dir === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= items.length) return
    // Swap priorities
    const order = items.map((_, i) => i)
    order.splice(index, 1)
    order.splice(target, 0, index)
    try {
      const res  = await fetch('/api/intel/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      })
      const data = await res.json()
      setQueue(data)
    } catch (e) { console.error(e) }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full"/>
        <Skeleton className="h-16 w-full"/>
      </div>
    )
  }

  const items     = queue?.items     ?? []
  const completed = queue?.completed ?? []

  return (
    <Card>
    <CardContent className="pt-4 pb-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-[hsl(var(--muted-foreground))]"/>
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Intel 研究队列</span>
          {items.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-[hsl(var(--secondary))] text-[10px] text-[hsl(var(--muted-foreground))]">
              {items.length} 个待研
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={loadQueue} className="h-7 px-2 gap-1 text-xs">
          <RefreshCw className="w-3 h-3"/>刷新
        </Button>
      </div>

      {/* Add new topic */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="添加研究话题…"
          value={newTopic}
          onChange={e => setNewTopic(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="flex-1 px-3 py-1.5 bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary)/0.5)]"
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={adding || !newTopic.trim()}
          className="h-8 px-3 gap-1 text-xs"
        >
          <Plus className="w-3 h-3"/>添加
        </Button>
      </div>

      {/* Queue items */}
      {items.length === 0 ? (
        <p className="text-xs text-center text-[hsl(var(--muted-foreground))] py-3 opacity-60">
          队列为空 — 添加话题让夜间 Intel 代理去研究
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div
              key={`${item.topic}-${i}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--secondary)/0.6)] border border-[hsl(var(--border))] group"
            >
              <span className="text-[10px] font-mono text-[hsl(var(--muted-foreground))] w-5 text-center flex-shrink-0">
                #{i + 1}
              </span>
              <p className="flex-1 text-sm text-[hsl(var(--foreground))] truncate">{item.topic}</p>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] flex-shrink-0">{item.addedAt}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => handleMove(i, 'up')}
                  disabled={i === 0}
                  className="p-0.5 rounded hover:bg-[hsl(var(--secondary))] disabled:opacity-30 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  <ArrowUp className="w-3 h-3"/>
                </button>
                <button
                  onClick={() => handleMove(i, 'down')}
                  disabled={i === items.length - 1}
                  className="p-0.5 rounded hover:bg-[hsl(var(--secondary))] disabled:opacity-30 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  <ArrowDown className="w-3 h-3"/>
                </button>
                <button
                  onClick={() => handleDelete(i)}
                  className="p-0.5 rounded hover:bg-destructive/15 text-[hsl(var(--muted-foreground))] hover:text-destructive ml-0.5"
                >
                  <X className="w-3 h-3"/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed — collapsible */}
      {completed.length > 0 && (
        <div className="border-t border-[hsl(var(--border))] pt-2">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500"/>
            <span>已完成 ({completed.length})</span>
            {showCompleted ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
          </button>
          {showCompleted && (
            <div className="mt-2 space-y-1">
              {completed.map((item, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0"/>
                  <p className="flex-1 text-xs text-[hsl(var(--muted-foreground))] truncate line-through">{item.topic}</p>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{item.completedAt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </CardContent>
    </Card>
  )
}

// ── Intel Report Detail ──────────────────────────────────────────────────────

function IntelDetail({
  file,
  onMarkRead,
  fullscreen,
}: {
  file: IntelReportFile
  onMarkRead: (filename: string) => void
  fullscreen?: boolean
}) {
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

  const { label, variant } = intelBadge(file.type)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge className="text-[10px] font-semibold flex-shrink-0" variant={variant}>{label}</Badge>
        <p className="text-base font-mono text-[hsl(var(--muted-foreground))] truncate flex-1">{file.filename.replace(/\.md$/, '')}</p>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">{file.sizeKb} KB</span>
      </div>
      {fullscreen ? (
        <div>
          {loading && <div className="space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-4"/>)}</div>}
          {error && <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>}
          {content && <Markdown content={content} variant="description" />}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 max-h-[70vh] overflow-y-auto">
            {loading && <div className="space-y-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-4"/>)}</div>}
            {error && <div className="flex items-center gap-2 text-destructive"><X className="w-4 h-4"/><span>{error}</span></div>}
            {content && <Markdown content={content} variant="description" />}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Intel Tab ────────────────────────────────────────────────────────────────

function IntelTab({ onCountChange }: { onCountChange?: (count: number, loaded: boolean) => void }) {
  const isMobile = useIsMobile()
  const [files, setFiles]               = useState<IntelReportFile[]>([])
  const [loading, setLoading]           = useState(true)
  const [selected, setSelected]         = useState<IntelReportFile | null>(null)
  const [search, setSearch]             = useState('')
  const [filterType, setFilterType]     = useState<'all' | 'daily' | 'weekly'>('all')
  const [readSet, setReadSet]           = useState<Set<string>>(new Set())
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [mobileShowContent, setMobileShowContent] = useState(false)
  const [queueOpen, setQueueOpen]       = useState(false)

  useEffect(() => {
    setReadSet(loadReadSet(INTEL_READ_KEY))
  }, [])

  const markRead = useCallback((filename: string) => {
    setReadSet(prev => {
      const next = new Set(prev)
      next.add(filename)
      saveReadSet(INTEL_READ_KEY, next)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/intel/reports')
      const data = await res.json()
      setFiles(data.files || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = useCallback(async (e: React.MouseEvent, f: IntelReportFile) => {
    e.stopPropagation()
    if (!confirm(`确定删除 ${f.filename}？`)) return
    try {
      const res = await fetch(`/api/intel/reports?file=${encodeURIComponent(f.filename)}&type=${f.type}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        alert(`删除失败: ${d.error}`)
        return
      }
      setReadSet(prev => {
        const next = new Set(prev)
        next.delete(f.filename)
        saveReadSet(INTEL_READ_KEY, next)
        return next
      })
      setFiles(prev => prev.filter(x => x.filename !== f.filename))
      setSelected(prev => prev?.filename === f.filename ? null : prev)
    } catch (e) {
      console.error(e)
      alert('删除失败，请重试')
    }
  }, [])

  useEffect(() => {
    onCountChange?.(files.length, !loading)
  }, [files.length, loading, onCountChange])

  const filtered = files.filter(f => {
    const matchSearch = !search || f.filename.toLowerCase().includes(search.toLowerCase())
    const matchType   = filterType === 'all' || f.type === filterType
    return matchSearch && matchType
  })

  return (
    <>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <p className="text-base text-[hsl(var(--muted-foreground))]">Intel 夜间调研报告 — 日报与周报</p>
          {!loading && files.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))]">
                <Moon className="w-3 h-3"/> {files.filter(f => f.type === 'daily').length} 日报
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))]">
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
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}/>刷新
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=>(
          <Card key={i}><CardContent className="pt-4"><Skeleton className="h-4 w-48 mb-2"/><Skeleton className="h-3 w-32"/></CardContent></Card>
        ))}</div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Moon className="w-10 h-10"/>
          <p className="text-base text-[hsl(var(--muted-foreground))]">暂无 Intel 报告</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            日报将出现在 <code className="font-mono">~/.openclaw/workspace/reports/intel/daily/</code>
          </p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            周报将出现在 <code className="font-mono">~/.openclaw/workspace/reports/intel/weekly/</code>
          </p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Left panel — collapsible */}
          <div className={cn('flex flex-shrink-0 transition-all duration-200', panelCollapsed ? 'w-[40px]' : 'w-[288px]', mobileShowContent ? 'hidden md:flex' : 'flex')}>
            {/* Always-visible toggle strip */}
            <div className="flex flex-col items-center pt-1 pr-1">
              <button
                onClick={() => setPanelCollapsed(!panelCollapsed)}
                className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] transition-colors"
                title={panelCollapsed ? '展开面板' : '收起面板'}
              >
                {panelCollapsed ? <PanelLeftOpen className="w-4 h-4"/> : <PanelLeftClose className="w-4 h-4"/>}
              </button>
              {panelCollapsed && (
                <div className="h-[calc(100vh-280px)] overflow-y-auto space-y-1 mt-2">
                  {filtered.map(f => {
                    const isActive = selected?.filename === f.filename
                    const isRead   = readSet.has(f.filename)
                    const Icon     = f.type === 'weekly' ? BarChart2 : Moon
                    return (
                      <button
                        key={f.filename}
                        onClick={() => setSelected(f)}
                        title={f.filename.replace('.md', '')}
                        className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors relative ${isActive ? 'bg-[hsl(var(--primary)/0.15)]' : 'hover:bg-[hsl(var(--secondary))]'}`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}/>
                        {!isRead && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]"/>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Content — only shown when not collapsed */}
            {!panelCollapsed && (
              <div className="flex flex-col gap-3 flex-1 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]"/>
                  <input
                    type="text"
                    placeholder="搜索报告…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary)/0.5)]"
                  />
                </div>
                {/* Type filter */}
                <div className="flex items-center gap-1.5">
                  {(['all', 'daily', 'weekly'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filterType === t ? 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'}`}
                    >
                      {t === 'all' ? '全部' : t === 'daily' ? '🌙 日报' : '📊 周报'}
                    </button>
                  ))}
                </div>
                <div className="h-[calc(100vh-280px)] overflow-y-auto pr-1 space-y-2">
                  {filtered.length === 0 ? (
                    <div className="flex items-center justify-center py-10">
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">没有匹配的报告</p>
                    </div>
                  ) : filtered.map(f => {
                    const { label, variant } = intelBadge(f.type)
                    const isRead   = readSet.has(f.filename)
                    const isActive = selected?.filename === f.filename
                    const Icon     = f.type === 'weekly' ? BarChart2 : Moon
                    return (
                      <div
                        key={f.filename}
                        className={`group rounded-lg border px-2.5 py-2 transition-all ${isActive ? 'border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.08)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--secondary))]'}`}
                      >
                        <div className="flex items-start gap-1">
                          <button onClick={() => { setSelected(f); setPanelCollapsed(true); setMobileShowContent(true) }} className="flex-1 min-w-0 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isRead ? 'bg-transparent' : 'bg-blue-500'}`}/>
                                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}/>
                                <p className={`text-xs font-medium truncate ${isRead ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]'}`}>
                                  {f.title || f.filename.replace('.md', '')}
                                </p>
                              </div>
                              <Badge className="text-[10px] font-semibold flex-shrink-0" variant={variant}>{label}</Badge>
                            </div>
                            {f.title && <p className="text-[9px] font-mono text-[hsl(var(--muted-foreground))] truncate mt-0.5 ml-5">{f.filename.replace('.md','')}</p>}
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                              <Calendar className="w-3 h-3"/>
                              <span>{f.date || fmtDate(f.modifiedAt)}</span>
                              <span>·</span>
                              <span>{f.sizeKb} KB</span>
                              <span>·</span>
                              <span className={isRead ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--primary))]'}>{isRead ? '已读' : '未读'}</span>
                            </div>
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, f)}
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/15 text-[hsl(var(--muted-foreground))] hover:text-destructive mt-0.5"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right panel — preview */}
          <div className="flex-1 min-w-0">
            <div className="h-[calc(100vh-280px)] overflow-y-auto">
              {mobileShowContent && (
                <button
                  onClick={() => { setSelected(null); setMobileShowContent(false); setPanelCollapsed(false) }}
                  className="md:hidden flex items-center gap-1.5 mb-3 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  返回列表
                </button>
              )}
              {selected ? (
                <IntelDetail file={selected} onMarkRead={markRead}/>
              ) : (
                <div className="h-full flex items-center justify-center border border-dashed border-[hsl(var(--border))] rounded-xl text-[hsl(var(--muted-foreground))]">
                  选择一个报告查看
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Intel Queue Modal */}
    {queueOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setQueueOpen(false)}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
        <div className="relative z-10 w-full max-w-lg mx-4 bg-[hsl(var(--card))] rounded-xl shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-[hsl(var(--primary))]"/>
              <span className="font-semibold text-sm">Intel 研究队列</span>
            </div>
            <button onClick={() => setQueueOpen(false)} className="p-1 rounded-lg hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
              <X className="w-4 h-4"/>
            </button>
          </div>
          <div className="px-4 pb-4">
            <IntelQueueManager />
          </div>
        </div>
      </div>
    )}

    {isMobile && selected && (
      <MobileOverlay
        title={selected.filename.replace('.md', '')}
        onClose={() => { setSelected(null); setMobileShowContent(false); setPanelCollapsed(false) }}
      >
        <IntelDetail file={selected} onMarkRead={markRead} fullscreen />
      </MobileOverlay>
    )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function ReportsContent({
  activeTab,
  onTabCountChange,
}: {
  activeTab: TabId
  onTabCountChange: (tabId: TabId, count: number, loaded: boolean) => void
}) {
  return (
    <div className="max-w-full space-y-6">
      <div className={cn(activeTab === 'discovery' ? 'block' : 'hidden')}>
        <DiscoveryTab onCountChange={(count, loaded) => onTabCountChange('discovery', count, loaded)} />
      </div>
      <div className={cn(activeTab === 'listing' ? 'block' : 'hidden')}>
        <ListingTab onCountChange={(count, loaded) => onTabCountChange('listing', count, loaded)} />
      </div>
      <div className={cn(activeTab === 'ppc' ? 'block' : 'hidden')}>
        <PpcTab onCountChange={(count, loaded) => onTabCountChange('ppc', count, loaded)} />
      </div>
      <div className={cn(activeTab === 'content' ? 'block' : 'hidden')}>
        <ComingSoon label="Content Reports" />
      </div>
      <div className={cn(activeTab === 'strategy' ? 'block' : 'hidden')}>
        <StrategyTab onCountChange={(count, loaded) => onTabCountChange('strategy', count, loaded)} />
      </div>
      <div className={cn(activeTab === 'intel' ? 'block' : 'hidden')}>
        <IntelTab onCountChange={(count, loaded) => onTabCountChange('intel', count, loaded)} />
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('discovery')
  const [tabCounts, setTabCounts] = useState<Partial<Record<TabId, number>>>({})
  const [tabLoaded, setTabLoaded] = useState<Partial<Record<TabId, boolean>>>({})

  const handleTabCountChange = useCallback((tabId: TabId, count: number, loaded: boolean) => {
    setTabCounts(prev => prev[tabId] === count ? prev : { ...prev, [tabId]: count })
    setTabLoaded(prev => prev[tabId] === loaded ? prev : { ...prev, [tabId]: loaded })
  }, [])

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
              onClick={() => setActiveTab(tab.id)}
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
      <ReportsContent activeTab={activeTab} onTabCountChange={handleTabCountChange} />
    </DashboardPageLayout>
  )
}
