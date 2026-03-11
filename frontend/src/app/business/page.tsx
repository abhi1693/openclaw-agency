"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  DollarSign,
  ShoppingCart,
  Megaphone,
  Boxes,
  RotateCcw,
  TrendingUp,
} from "lucide-react";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/charts/chart";
import MetricSparkline from "@/components/charts/metric-sparkline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SalesPoint = {
  date: string;
  revenue: number;
  orders: number;
};

type TopProduct = {
  asin: string;
  title: string;
  todayUnits: number;
  inventory: number;
  trend7d: number[];
};

type SalesData = {
  days?: SalesPoint[];
};

type OrdersData = {
  days?: { date: string; count: number }[];
};

type CampaignsData = {
  // Aggregated fields (may not be present in raw API response)
  totalSpend?: number;
  acos?: number;
  // Raw API response shape
  total?: number;
  campaigns?: unknown[];
};

type InventoryData = {
  totalUnits?: number;
  outOfStockSkus?: number;
  // Raw API response shape
  total?: number;
};

type ReturnsData = {
  // Aggregated field (may not be present in raw API response)
  returnRate7d?: number;
  // Raw API response shape
  total?: number;
  events?: unknown[];
};

type FinanceData = {
  // Aggregated field (may not be present in raw API response)
  grossMarginPct?: number;
  // Raw API response shape
  total?: number;
  events?: unknown[];
};

// ---------------------------------------------------------------------------
// Hook: generic auto-refreshing fetch
// ---------------------------------------------------------------------------

function useAutoFetch<T>(url: string, intervalMs = 60_000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    const timer = setInterval(fetchData, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [url, intervalMs]);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  subValue,
  delta,
  icon,
  loading,
  error,
}: {
  label: string;
  value: string;
  subValue?: string;
  delta?: { text: string; positive: boolean } | null;
  icon: React.ReactNode;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <div className="rounded-lg p-1.5 bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : error ? (
          <div className="space-y-1">
            <p className="text-2xl font-bold text-foreground">--</p>
            <p className="text-xs text-destructive">{error}</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-3xl font-bold text-foreground">{value}</p>
            <div className="flex items-center gap-2">
              {delta ? (
                <span
                  className={
                    delta.positive ? "text-xs text-emerald-600" : "text-xs text-destructive"
                  }
                >
                  {delta.positive ? "↑" : "↓"} {delta.text}
                </span>
              ) : null}
              {subValue ? (
                <span className="text-xs text-muted-foreground">{subValue}</span>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = {
  currency: (v: number | undefined | null) =>
    v != null
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v)
      : "--",
  number: (v: number | undefined | null) =>
    v != null ? new Intl.NumberFormat("en-US").format(v) : "--",
  pct: (v: number | undefined | null) =>
    v != null ? `${v.toFixed(1)}%` : "--",
};

function pctChange(today: number, yesterday: number) {
  if (yesterday === 0) return null;
  const diff = ((today - yesterday) / yesterday) * 100;
  return { text: `${Math.abs(diff).toFixed(1)}% vs 昨日`, positive: diff >= 0 };
}

// ---------------------------------------------------------------------------
// Chart config
// ---------------------------------------------------------------------------

const salesChartConfig = {
  revenue: {
    label: "销售额",
    color: "hsl(var(--primary))",
  },
  orders: {
    label: "订单数",
    color: "hsl(var(--secondary))",
  },
} satisfies ChartConfig;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BusinessPage() {
  const sales2d = useAutoFetch<SalesData>("/api/amazon/sales?days=2");
  const sales14d = useAutoFetch<SalesData>("/api/amazon/sales?days=14");
  const orders2d = useAutoFetch<OrdersData>("/api/amazon/orders?days=2");
  const campaigns = useAutoFetch<CampaignsData>("/api/amazon/campaigns");
  const inventory = useAutoFetch<InventoryData>("/api/amazon/inventory");
  const returns = useAutoFetch<ReturnsData>("/api/amazon/returns");
  const finance = useAutoFetch<FinanceData>("/api/amazon/finance");
  const topProducts = useAutoFetch<{ products: TopProduct[] }>("/api/amazon/top-products");

  // --- KPI: Today / Yesterday sales ---
  const todayRevenue = sales2d.data?.days?.[1]?.revenue ?? null;
  const yesterdayRevenue = sales2d.data?.days?.[0]?.revenue ?? null;
  const revenueDelta =
    todayRevenue !== null && yesterdayRevenue !== null
      ? pctChange(todayRevenue, yesterdayRevenue)
      : null;

  // --- KPI: Today / Yesterday orders ---
  const todayOrders = orders2d.data?.days?.[1]?.count ?? null;
  const yesterdayOrders = orders2d.data?.days?.[0]?.count ?? null;
  const ordersDelta =
    todayOrders !== null && yesterdayOrders !== null
      ? pctChange(todayOrders, yesterdayOrders)
      : null;

  // --- Chart: 14-day combined ---
  const chartData: (SalesPoint & { orders: number })[] = (sales14d.data?.days ?? []).map((pt) => ({
    ...pt,
    orders: 0, // orders not available from sales API; placeholder
  }));

  return (
    <DashboardPageLayout
      title="ZOVIRO Business"
      description="每日运营概览"
      signedOut={{
        message: "Sign in to access the business dashboard.",
        forceRedirectUrl: "/business",
      }}
    >
      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="今日销售额"
          value={todayRevenue !== null ? fmt.currency(todayRevenue) : "--"}
          delta={revenueDelta}
          subValue="vs 昨日"
          icon={<DollarSign className="h-4 w-4" />}
          loading={sales2d.loading}
          error={sales2d.error}
        />

        <KpiCard
          label="今日订单数"
          value={todayOrders !== null ? fmt.number(todayOrders) : "--"}
          delta={ordersDelta}
          subValue="vs 昨日"
          icon={<ShoppingCart className="h-4 w-4" />}
          loading={orders2d.loading}
          error={orders2d.error}
        />

        <KpiCard
          label="广告花费 / ACoS"
          value={fmt.currency(campaigns.data?.totalSpend)}
          subValue={campaigns.data?.acos != null ? `ACoS ${fmt.pct(campaigns.data.acos)}` : undefined}
          icon={<Megaphone className="h-4 w-4" />}
          loading={campaigns.loading}
          error={campaigns.error}
        />

        <KpiCard
          label="可售库存"
          value={fmt.number(inventory.data?.totalUnits)}
          subValue={
            inventory.data?.outOfStockSkus != null
              ? `${fmt.number(inventory.data.outOfStockSkus)} SKU 缺货`
              : undefined
          }
          icon={<Boxes className="h-4 w-4" />}
          loading={inventory.loading}
          error={inventory.error}
        />

        <KpiCard
          label="退货率 (7D)"
          value={fmt.pct(returns.data?.returnRate7d)}
          subValue="7 日滚动"
          icon={<RotateCcw className="h-4 w-4" />}
          loading={returns.loading}
          error={returns.error}
        />

        <KpiCard
          label="毛利率"
          value={fmt.pct(finance.data?.grossMarginPct)}
          subValue="估算毛利率"
          icon={<TrendingUp className="h-4 w-4" />}
          loading={finance.loading}
          error={finance.error}
        />
      </div>

      {/* ── Middle row: Chart + Top Products ─────────────────────── */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">

        {/* Sales Trend Chart */}
        <Card className="xl:col-span-3">
          <CardHeader>
            <h2 className="text-base font-semibold text-foreground">销售趋势 (14 天)</h2>
            <p className="text-xs text-muted-foreground">每日销售额</p>
          </CardHeader>
          <CardContent>
            {sales14d.loading ? (
              <Skeleton className="h-56 w-full" />
            ) : sales14d.error ? (
              <div className="flex h-56 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
                数据加载失败：{sales14d.error}
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex h-56 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ChartContainer config={salesChartConfig} className="h-56 w-full">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                    }
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#gradRevenue)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Top 5 Products */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <h2 className="text-base font-semibold text-foreground">Top 5 产品</h2>
            <p className="text-xs text-muted-foreground">今日销量排行</p>
          </CardHeader>
          <CardContent>
            {topProducts.loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : topProducts.error ? (
              <div className="flex h-40 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
                数据加载失败：{topProducts.error}
              </div>
            ) : !topProducts.data?.products?.length ? (
              <div className="flex h-40 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
                暂无产品数据
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1.5rem_1fr_3.5rem_2.5rem_4rem] gap-x-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>#</span>
                  <span>产品</span>
                  <span className="text-right">销量</span>
                  <span className="text-right">库存</span>
                  <span className="text-right">7D</span>
                </div>
                {topProducts.data.products.slice(0, 5).map((product, idx) => (
                  <div
                    key={`${product.asin}-${idx}`}
                    className="grid grid-cols-[1.5rem_1fr_3.5rem_2.5rem_4rem] items-center gap-x-2 rounded-lg border border-border px-1 py-2"
                  >
                    <span className="text-xs font-medium text-muted-foreground">{idx + 1}</span>
                    <span className="truncate text-sm font-medium text-foreground" title={product.title}>
                      {product.title}
                    </span>
                    <span className="text-right text-sm tabular-nums text-foreground">
                      {fmt.number(product.todayUnits)}
                    </span>
                    <span className="text-right text-sm tabular-nums text-muted-foreground">
                      {fmt.number(product.inventory)}
                    </span>
                    <div className="flex justify-end">
                      {product.trend7d?.length ? (
                        <MetricSparkline values={product.trend7d} className="h-7 w-16" />
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardPageLayout>
  );
}
