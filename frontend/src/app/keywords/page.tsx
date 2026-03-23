'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import {
  Key, TrendingUp, ChevronDown, ChevronRight,
  RefreshCw, Lightbulb, AlertTriangle, BarChart3, DollarSign, Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { DashboardPageLayout } from '@/components/templates/DashboardPageLayout'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATIC_PRODUCTS = [
  { asin: 'B0GJR8435C', name: 'Antioxidant Shimmer Body Oil (Silver)' },
  { asin: 'B0GJQZLHNK', name: 'Deep Moisture Shimmer Body Oil (Golden)' },
  { asin: 'B0GJR3TB2S', name: 'Hydration Body Lotion (Dry & Dehydrated)' },
  { asin: 'B0GJPJNJ57', name: 'Repair Body Lotion (Dry & Sensitive)' },
  { asin: 'B0F6MN77BB', name: 'Foaming Hand Sanitizer 9.5oz (4-Pack)' },
  { asin: 'B0F745BDP8', name: 'Foaming Hand Sanitizer 9.5oz (10-Pack)' },
  { asin: 'B0CRSSGGYY', name: 'Hand Sanitizer Gel 2oz Travel (50-Pack)' },
  { asin: 'B0CR74VL95', name: 'Jasmine Hand Sanitizer Wipes 80ct (6-Pack)' },
  { asin: 'B0CR5D91N2', name: 'Tea Tree Hand Sanitizer Wipes 20ct (10-Pack)' },
]

type Product = { asin: string; name: string }

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KeywordRanking {
  id: string
  asin: string
  keyword: string
  organic_rank: number | null
  sponsored_rank: number | null
  search_volume: number | null
  search_volume_trend: string | null
  click_share: number | null
  conversion_share: number | null
  competing_products: number | null
  suggested_ppc_bid: number | null
  cerebro_iq_score: number | null
  title_density: number | null
  snapshot_date: string
  source: string
  created_at: string
}

interface SearchTerm {
  id: string
  search_term: string | null
  campaign_name: string | null
  keyword: string | null
  match_type: string | null
  impressions: number
  clicks: number
  spend: string
  sales: string
  orders: number
  acos: string | null
  roas: string | null
  ctr: string | null
  cpc: string | null
}

interface SearchTermsResponse {
  total: number
  period: string
  terms: SearchTerm[]
}

type RankTab = 'all' | 'up' | 'down' | 'new' | 'dropped'
type SearchTermFilter = 'all' | 'high-conv' | 'inefficient' | 'zero-conv'
type MainTab = 'rankings' | 'search-terms' | 'ai-insights'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | string | null | undefined, decimals = 2): string {
  if (n == null) return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  return num.toFixed(decimals)
}

function fmtCurrency(n: number | string | null | undefined): string {
  if (n == null) return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  return `$${num.toFixed(2)}`
}

function fmtPct(n: number | string | null | undefined): string {
  if (n == null) return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  return `${(num * 100).toFixed(1)}%`
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US')
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <span className="text-xs text-[hsl(var(--muted-foreground))]">数据不足</span>
  const w = 120, h = 40, pad = 4
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad)
    // Invert y because lower rank = better
    const y = pad + ((v - min) / range) * (h - 2 * pad)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const polyline = pts.join(' ')
  const lastY = parseFloat(pts[pts.length - 1].split(',')[1])
  const trend = data[data.length - 1] < data[0] ? 'up' : data[data.length - 1] > data[0] ? 'down' : 'flat'
  const color = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#94a3b8'

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={parseFloat(pts[pts.length - 1].split(',')[0])}
        cy={lastY}
        r={2.5}
        fill={color}
      />
    </svg>
  )
}

// ─── Tab 1: Rankings ──────────────────────────────────────────────────────────

function RankingsTab({ asin }: { asin: string }) {
  const [rankings, setRankings] = useState<KeywordRanking[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<RankTab>('all')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [trendsCache, setTrendsCache] = useState<Record<string, number[]>>({})

  const fetchRankings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/amazon/keywords/top?asin=${encodeURIComponent(asin)}&limit=100`)
      const data = await res.json()
      if (Array.isArray(data)) {
        // Sort by search_volume descending
        const sorted = [...data].sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0))
        setRankings(sorted)
      }
    } finally {
      setLoading(false)
    }
  }, [asin])

  useEffect(() => {
    setRankings([])
    setExpandedRow(null)
    setTrendsCache({})
    fetchRankings()
  }, [fetchRankings])

  const fetchTrend = useCallback(async (keyword: string) => {
    const key = `${asin}|${keyword}`
    if (trendsCache[key]) return
    try {
      const res = await fetch(`/api/amazon/keywords/trends?asin=${encodeURIComponent(asin)}&keyword=${encodeURIComponent(keyword)}`)
      const data = await res.json()
      const points = Array.isArray(data)
        ? data.map((d: { organic_rank?: number }) => d.organic_rank ?? 0).filter(Boolean)
        : []
      setTrendsCache(prev => ({ ...prev, [key]: points }))
    } catch {
      setTrendsCache(prev => ({ ...prev, [key]: [] }))
    }
  }, [asin, trendsCache])

  const handleRowClick = (keyword: string) => {
    const key = `${asin}|${keyword}`
    if (expandedRow === key) {
      setExpandedRow(null)
    } else {
      setExpandedRow(key)
      fetchTrend(keyword)
    }
  }

  // Compute rank change — since we only have one snapshot, use search_volume_trend as proxy
  // For real change we'd need multiple snapshots; here we simulate with cerebro_iq_score direction
  const getChange = (r: KeywordRanking): number | null => {
    // We don't have rank history in the top endpoint, so no change data
    return null
  }

  const filtered = rankings.filter(r => {
    if (filter === 'all') return true
    const change = getChange(r)
    if (filter === 'up') return change !== null && change < 0
    if (filter === 'down') return change !== null && change > 0
    if (filter === 'new') return r.organic_rank !== null && r.organic_rank <= 10
    if (filter === 'dropped') return r.organic_rank !== null && r.organic_rank > 50
    return true
  })

  const filterPills: { id: RankTab; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'up', label: '排名上升' },
    { id: 'down', label: '排名下降' },
    { id: 'new', label: '新进入' },
    { id: 'dropped', label: '掉出' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[hsl(var(--muted-foreground))]">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  if (rankings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[hsl(var(--muted-foreground))]">
        <Key className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm font-medium">暂无数据，等待下次 Cerebro 采集</p>
        <p className="text-xs mt-1 opacity-60">当前 ASIN 尚未有 H10 Cerebro 数据</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {filterPills.map(p => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
              filter === p.id
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]'
            )}
          >
            {p.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">{filtered.length} 个关键词</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[hsl(var(--muted)/0.4)] border-b border-[hsl(var(--border))]">
              <th className="text-left px-3 py-3 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider w-10">#</th>
              <th className="text-left px-3 py-3 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">关键词</th>
              <th className="text-right px-3 py-3 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">有机排名</th>
              <th className="text-right px-3 py-3 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">排名变化</th>
              <th className="text-right px-3 py-3 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">搜索量</th>
              <th className="text-right px-3 py-3 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider hidden md:table-cell">点击份额</th>
              <th className="text-right px-3 py-3 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider hidden lg:table-cell">竞争度</th>
              <th className="text-right px-3 py-3 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider hidden lg:table-cell">PPC 出价</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, idx) => {
              const rowKey = `${row.asin}|${row.keyword}`
              const expanded = expandedRow === rowKey
              const change = getChange(row)

              return (
                <Fragment key={rowKey}>
                  <tr
                    onClick={() => handleRowClick(row.keyword)}
                    className={cn(
                      'border-b border-[hsl(var(--border))] cursor-pointer transition-colors',
                      expanded
                        ? 'bg-[hsl(var(--muted)/0.3)]'
                        : 'hover:bg-[hsl(var(--muted)/0.2)]'
                    )}
                  >
                    <td className="px-3 py-3 text-[hsl(var(--muted-foreground))]">
                      <div className="flex items-center gap-1">
                        {expanded ? (
                          <ChevronDown className="w-3 h-3 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 shrink-0" />
                        )}
                        <span className="tabular-nums text-xs">{idx + 1}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-medium text-[hsl(var(--foreground))] max-w-[200px] truncate">
                      {row.keyword}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {row.organic_rank != null ? (
                        <span className="font-semibold text-[hsl(var(--foreground))]">#{row.organic_rank}</span>
                      ) : (
                        <span className="text-[hsl(var(--muted-foreground))]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {change == null ? (
                        <Badge variant="default" className="text-xs tabular-nums">—</Badge>
                      ) : change < 0 ? (
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs tabular-nums hover:bg-green-100">
                          ↑ {Math.abs(change)}
                        </Badge>
                      ) : change > 0 ? (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs tabular-nums hover:bg-red-100">
                          ↓ {change}
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-xs tabular-nums">— 0</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[hsl(var(--foreground))]">
                      {fmtNum(row.search_volume)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[hsl(var(--muted-foreground))] hidden md:table-cell">
                      {row.click_share != null ? fmtPct(row.click_share) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[hsl(var(--muted-foreground))] hidden lg:table-cell">
                      {fmtNum(row.competing_products)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[hsl(var(--muted-foreground))] hidden lg:table-cell">
                      {row.suggested_ppc_bid != null ? fmtCurrency(row.suggested_ppc_bid) : '—'}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-[hsl(var(--muted)/0.15)]">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-8">
                          <div>
                            <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2 font-medium uppercase tracking-wider">排名趋势</p>
                            {trendsCache[rowKey] === undefined ? (
                              <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                                <RefreshCw className="w-3 h-3 animate-spin" /> 加载中...
                              </div>
                            ) : trendsCache[rowKey].length < 2 ? (
                              <p className="text-xs text-[hsl(var(--muted-foreground))]">暂无历史数据</p>
                            ) : (
                              <Sparkline data={trendsCache[rowKey]} />
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                            <span className="text-[hsl(var(--muted-foreground))]">搜索量趋势</span>
                            <span className="tabular-nums">{row.search_volume_trend ?? '—'}</span>
                            <span className="text-[hsl(var(--muted-foreground))]">竞品数</span>
                            <span className="tabular-nums">{fmtNum(row.competing_products)}</span>
                            <span className="text-[hsl(var(--muted-foreground))]">Cerebro IQ</span>
                            <span className="tabular-nums">{fmt(row.cerebro_iq_score, 0)}</span>
                            <span className="text-[hsl(var(--muted-foreground))]">标题密度</span>
                            <span className="tabular-nums">{row.title_density ?? '—'}</span>
                            <span className="text-[hsl(var(--muted-foreground))]">快照日期</span>
                            <span className="tabular-nums">{row.snapshot_date}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tab 2: Search Terms ───────────────────────────────────────────────────────

function SearchTermsTab() {
  const [data, setData] = useState<SearchTermsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<SearchTermFilter>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/amazon/search-terms?days=30&limit=500')
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const terms = data?.terms ?? []

  const filtered = terms.filter(t => {
    if (filter === 'all') return true
    const acos = t.acos ? parseFloat(t.acos) : null
    if (filter === 'high-conv') return acos !== null && acos < 30
    if (filter === 'inefficient') return acos !== null && acos > 50
    if (filter === 'zero-conv') return t.clicks > 0 && t.orders === 0
    return true
  })

  // Aggregates
  const totalSpend = terms.reduce((s, t) => s + parseFloat(t.spend || '0'), 0)
  const totalSales = terms.reduce((s, t) => s + parseFloat(t.sales || '0'), 0)
  const avgAcos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0

  const filterPills: { id: SearchTermFilter; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'high-conv', label: '高转化 (ACoS<30%)' },
    { id: 'inefficient', label: '低效 (ACoS>50%)' },
    { id: 'zero-conv', label: '零转化' },
  ]

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '总搜索词数', value: terms.length.toLocaleString(), icon: Search },
          { label: '总花费', value: fmtCurrency(totalSpend), icon: DollarSign },
          { label: '总销售', value: fmtCurrency(totalSales), icon: TrendingUp },
          { label: '平均 ACoS', value: `${avgAcos.toFixed(1)}%`, icon: BarChart3 },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                <span className="text-xs text-[hsl(var(--muted-foreground))]">{card.label}</span>
              </div>
              <p className="text-xl font-semibold tabular-nums text-[hsl(var(--foreground))]">{card.value}</p>
            </div>
          )
        })}
      </div>

      {/* Period badge */}
      {data?.period && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">数据周期：{data.period}</p>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {filterPills.map(p => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
              filter === p.id
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]'
            )}
          >
            {p.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">{filtered.length} 条</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[hsl(var(--muted-foreground))]">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-[hsl(var(--muted)/0.4)] border-b border-[hsl(var(--border))]">
                {['搜索词', '展示量', '点击', 'CTR', '花费', '销售额', '订单', 'ACoS', 'ROAS'].map(col => (
                  <th
                    key={col}
                    className={cn(
                      'px-3 py-3 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider',
                      col === '搜索词' ? 'text-left' : 'text-right'
                    )}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-[hsl(var(--muted-foreground))] text-sm">
                    暂无符合条件的数据
                  </td>
                </tr>
              ) : (
                filtered.map((t, index) => {
                  const acos = t.acos ? parseFloat(t.acos) : null
                  const isHighConv = acos !== null && acos < 30
                  const isIneff = acos !== null && acos > 50
                  return (
                    <tr
                      key={t.id || `${t.search_term ?? 'term'}-${index}`}
                      className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.2)] transition-colors"
                    >
                      <td className="px-3 py-2.5 max-w-[220px] truncate font-medium text-[hsl(var(--foreground))]">
                        {t.search_term?.trim() || '未命名搜索词'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[hsl(var(--muted-foreground))]">
                        {fmtNum(t.impressions)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[hsl(var(--muted-foreground))]">
                        {t.clicks}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[hsl(var(--muted-foreground))]">
                        {t.ctr ? `${(parseFloat(t.ctr) * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[hsl(var(--foreground))]">
                        {fmtCurrency(t.spend)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[hsl(var(--foreground))]">
                        {fmtCurrency(t.sales)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[hsl(var(--foreground))]">
                        {t.orders}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {acos == null ? (
                          <span className="text-[hsl(var(--muted-foreground))]">—</span>
                        ) : (
                          <span className={cn(
                            'font-medium',
                            isHighConv ? 'text-green-600' : isIneff ? 'text-red-600' : 'text-[hsl(var(--foreground))]'
                          )}>
                            {acos.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[hsl(var(--muted-foreground))]">
                        {t.roas ? parseFloat(t.roas).toFixed(2) : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Tab 3: AI Insights ────────────────────────────────────────────────────────

function AiInsightsTab({ rankings, searchTerms }: {
  rankings: KeywordRanking[]
  searchTerms: SearchTerm[]
}) {
  // Keyword Opportunities: high search_volume but organic_rank > 20
  const opportunities = rankings
    .filter(r => r.search_volume != null && r.search_volume > 5000 && (r.organic_rank == null || r.organic_rank > 20))
    .sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0))
    .slice(0, 10)

  // Lost keywords: we don't have historical data to detect drops; show high-rank ones
  const lowRankKeywords = rankings.filter(r => r.organic_rank != null && r.organic_rank > 30)

  // Inefficient PPC terms: high spend, low/no orders
  const inefficientTerms = searchTerms
    .filter(t => parseFloat(t.spend) > 5 && t.orders === 0)
    .sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend))
    .slice(0, 10)

  const hasEnoughData = rankings.length >= 10

  // Generate recommendations
  const recommendations: string[] = []
  if (opportunities.length > 0) {
    recommendations.push(`🎯 发现 ${opportunities.length} 个高搜索量但排名较低的关键词机会，建议优先投放 PPC 广告提升曝光。`)
  }
  if (inefficientTerms.length > 0) {
    const totalWaste = inefficientTerms.reduce((s, t) => s + parseFloat(t.spend), 0)
    recommendations.push(`⚠️ ${inefficientTerms.length} 个搜索词花费共 $${totalWaste.toFixed(2)} 但订单为 0，建议暂停或降低出价。`)
  }
  const highVolumeTerms = rankings.filter(r => (r.search_volume ?? 0) > 10000 && (r.organic_rank ?? 99) <= 5)
  if (highVolumeTerms.length > 0) {
    recommendations.push(`✅ ${highVolumeTerms.length} 个关键词有机排名进入前 5，继续维持广告预算巩固排名。`)
  }
  if (lowRankKeywords.length > 0) {
    recommendations.push(`📉 ${lowRankKeywords.length} 个关键词有机排名超过 30 位，考虑优化 Listing 相关度或加大广告力度。`)
  }
  if (recommendations.length < 3) {
    recommendations.push('📊 建议定期（每周）运行 H10 Cerebro 采集，积累更多历史数据以支持深度分析。')
  }

  return (
    <div className="space-y-6">
      {!hasEnoughData && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            需要更多历史数据才能生成深度分析（至少 2 周排名快照）。当前仅有单次 Cerebro 采集数据，部分分析受限。
          </p>
        </div>
      )}

      {/* Recommendations */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-[hsl(var(--primary))]" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--foreground))]">推荐操作</h3>
          <div className="h-px flex-1 bg-[hsl(var(--border))]" />
        </div>
        <div className="space-y-2">
          {recommendations.map((rec, i) => (
            <div key={i} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm text-[hsl(var(--foreground))]">
              {rec}
            </div>
          ))}
        </div>
      </div>

      {/* Opportunities */}
      {opportunities.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--foreground))]">关键词机会</h3>
            <div className="h-px flex-1 bg-[hsl(var(--border))]" />
          </div>
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[hsl(var(--muted)/0.4)] border-b border-[hsl(var(--border))]">
                  <th className="text-left px-3 py-2.5 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">关键词</th>
                  <th className="text-right px-3 py-2.5 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">搜索量</th>
                  <th className="text-right px-3 py-2.5 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">当前排名</th>
                  <th className="text-right px-3 py-2.5 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">PPC 出价</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((r, index) => (
                  <tr key={r.id || `${r.asin}-${r.keyword}-${index}`} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.2)]">
                    <td className="px-3 py-2.5 font-medium text-[hsl(var(--foreground))]">{r.keyword}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[hsl(var(--foreground))]">{fmtNum(r.search_volume)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.organic_rank != null ? (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">#{r.organic_rank}</Badge>
                      ) : (
                        <Badge variant="default">未排名</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[hsl(var(--muted-foreground))]">
                      {fmtCurrency(r.suggested_ppc_bid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inefficient PPC */}
      {inefficientTerms.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--foreground))]">PPC 效率分析（零转化高花费）</h3>
            <div className="h-px flex-1 bg-[hsl(var(--border))]" />
          </div>
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[hsl(var(--muted)/0.4)] border-b border-[hsl(var(--border))]">
                  <th className="text-left px-3 py-2.5 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">搜索词</th>
                  <th className="text-right px-3 py-2.5 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">花费</th>
                  <th className="text-right px-3 py-2.5 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">点击</th>
                  <th className="text-left px-3 py-2.5 text-[hsl(var(--muted-foreground))] font-medium text-xs uppercase tracking-wider">建议</th>
                </tr>
              </thead>
              <tbody>
                {inefficientTerms.map((t, index) => (
                  <tr key={t.id || `${t.search_term ?? 'term'}-${index}`} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.2)]">
                    <td className="px-3 py-2.5 font-medium text-[hsl(var(--foreground))] max-w-[200px] truncate">{t.search_term?.trim() || '未命名搜索词'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-600 font-medium">{fmtCurrency(t.spend)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[hsl(var(--muted-foreground))]">{t.clicks}</td>
                    <td className="px-3 py-2.5 text-left">
                      <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs">建议暂停</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function KeywordsPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('rankings')
  const [products, setProducts] = useState<Product[]>(STATIC_PRODUCTS)
  const [productsLoading, setProductsLoading] = useState(true)
  const [selectedAsin, setSelectedAsin] = useState(STATIC_PRODUCTS[0].asin)
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    fetch('/api/content/products')
      .then(r => r.json())
      .then((data: { products?: { asin: string; name: string }[] }) => {
        const list = data?.products
        if (Array.isArray(list) && list.length > 0) {
          const mapped = list.map(p => ({ asin: p.asin, name: p.name }))
          setProducts(mapped)
          setSelectedAsin(mapped[0].asin)
        } else {
          setUsingFallback(true)
        }
      })
      .catch(() => { setUsingFallback(true) })
      .finally(() => setProductsLoading(false))
  }, [])

  // Pre-load data for AI Insights tab
  const [rankings, setRankings] = useState<KeywordRanking[]>([])
  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([])

  useEffect(() => {
    // Fetch rankings for selected ASIN
    fetch(`/api/amazon/keywords/top?asin=${encodeURIComponent(selectedAsin)}&limit=100`)
      .then(r => r.json())
      .then((data: KeywordRanking[]) => { if (Array.isArray(data)) setRankings(data) })
      .catch(() => setRankings([]))

    // Fetch search terms (global, not per ASIN)
    fetch('/api/amazon/search-terms?days=30&limit=500')
      .then(r => r.json())
      .then((data: SearchTermsResponse) => { if (data?.terms) setSearchTerms(data.terms) })
      .catch(() => setSearchTerms([]))
  }, [selectedAsin])

  const selectedProduct = products.find(p => p.asin === selectedAsin)

  const tabs: { id: MainTab; label: string }[] = [
    { id: 'rankings', label: '🔑 排名追踪' },
    { id: 'search-terms', label: '📈 搜索词分析' },
    { id: 'ai-insights', label: '🤖 AI 洞察' },
  ]

  return (
    <DashboardPageLayout
      signedOut={{ message: 'Sign in to view keywords', forceRedirectUrl: '/keywords' }}
      title="Keywords"
      description="关键词排名追踪 & 搜索词分析"
      headerActions={
        <div className="flex flex-col gap-2 w-full">
          {usingFallback && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-400 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
              <span>产品目录不可用 — 显示缓存列表</span>
              <button
                onClick={() => window.location.reload()}
                className="ml-auto text-xs underline hover:no-underline"
              >
                刷新
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
          {/* ASIN Selector */}
          <select
            value={selectedAsin}
            onChange={e => setSelectedAsin(e.target.value)}
            disabled={productsLoading}
            className="bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-lg px-3 py-1.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] min-w-[280px] disabled:opacity-50"
          >
            {products.map(p => (
              <option key={p.asin} value={p.asin}>
                {p.asin} — {p.name}
              </option>
            ))}
          </select>

          {/* Tab pills */}
          <div className="inline-flex rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-0.5 gap-0.5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          </div>
        </div>
      }
    >
      <div>
        {activeTab === 'rankings' && (
          <RankingsTab asin={selectedAsin} />
        )}
        {activeTab === 'search-terms' && (
          <SearchTermsTab />
        )}
        {activeTab === 'ai-insights' && (
          <AiInsightsTab
            rankings={rankings}
            searchTerms={searchTerms}
          />
        )}
      </div>
    </DashboardPageLayout>
  )
}
