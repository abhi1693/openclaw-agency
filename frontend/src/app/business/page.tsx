"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
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
  Package,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Lightbulb,
  Wallet,
  RotateCcw,
  CheckCircle2,
  Target,
  CalendarClock,
  ExternalLink,
} from "lucide-react";

import seasonalWindows from "@/config/seasonal-windows.json";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProfitItem } from "@/app/api/profit/route";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/charts/chart";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 7 | 14 | 30;

interface SalesDay {
  date: string;
  revenue: number;
  units: number;
  orders: number;
  avgUnitPrice: number;
}

interface InventoryItem {
  sku: string;
  asin?: string;
  name?: string;
  productName?: string;
  available?: number;
  inbound?: number;
  reserved?: number;
}

interface TopProduct {
  asin: string;
  sku?: string;
  title?: string;
  quantityOrdered: number;
  revenue: number;
  orderCount: number;
}

interface FinanceEvent {
  event_group: string;
  amount: number;
  sku?: string;
  revenue?: number;
}

interface ReturnEvent {
  sku?: string;
  title?: string;
  returnCount?: number;
  returnRate?: string;
  priority?: string;
}

interface Insight {
  type: "positive" | "negative" | "neutral";
  icon: string;
  text: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sumField(arr: SalesDay[], key: keyof SalesDay): number {
  return arr.reduce((acc, item) => acc + ((item[key] as number) ?? 0), 0);
}

function pct(current: number, prev: number): number {
  if (!prev) return 0;
  return ((current - prev) / prev) * 100;
}

const fmt = {
  currency: (v: number | undefined | null) =>
    v != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(v)
      : "--",
  currencyFull: (v: number | undefined | null) =>
    v != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(v)
      : "--",
  number: (v: number | undefined | null) =>
    v != null ? new Intl.NumberFormat("en-US").format(v) : "--",
  pct: (v: number | undefined | null) =>
    v != null ? `${v.toFixed(1)}%` : "--",
  compact: (n: number | undefined | null): string => {
    if (n == null || isNaN(n)) return "0";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
  },
};

// ─── Period Selector ──────────────────────────────────────────────────────────

function PeriodSelector({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const periods: Period[] = [7, 14, 30];
  return (
    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted">
      {periods.map((p) => (
        <Button
          key={p}
          size="sm"
          variant={value === p ? "primary" : "ghost"}
          className="h-7 px-3 text-sm"
          onClick={() => onChange(p)}
        >
          {p}天
        </Button>
      ))}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  subValue,
  trend,
  icon,
  loading,
}: {
  label: string;
  value: string;
  subValue?: string;
  trend?: { pct: number; prevLabel: string } | null;
  icon: React.ReactNode;
  loading: boolean;
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
            <Skeleton className="h-4 w-40" />
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-3xl font-bold text-foreground">{value}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {trend != null && (
                <span
                  className={
                    trend.pct >= 0
                      ? "text-xs text-emerald-600 font-medium"
                      : "text-xs text-destructive font-medium"
                  }
                >
                  {trend.pct >= 0 ? "↑" : "↓"} {Math.abs(trend.pct).toFixed(1)}% vs 上周期
                </span>
              )}
              {subValue && (
                <span className="text-xs text-muted-foreground">{subValue}</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Insight Panel ────────────────────────────────────────────────────────────

function InsightPanel({
  curRevenue,
  prevRevenue,
  curUnits,
  prevUnits,
  curOrders,
  prevOrders,
  lowStock,
}: {
  curRevenue: number;
  prevRevenue: number;
  curUnits: number;
  prevUnits: number;
  curOrders: number;
  prevOrders: number;
  lowStock: number;
}) {
  const insights = useMemo<Insight[]>(() => {
    const result: Insight[] = [];
    const revPct = pct(curRevenue, prevRevenue);
    const unitsPerOrder = curOrders > 0 ? curUnits / curOrders : 0;
    const prevUnitsPerOrder = prevOrders > 0 ? prevUnits / prevOrders : 0;
    const aov = curOrders > 0 ? curRevenue / curOrders : 0;
    const prevAov = prevOrders > 0 ? prevRevenue / prevOrders : 0;

    if (revPct > 10) {
      result.push({
        type: "positive",
        icon: "💰",
        text: `销售额同比增长 ${revPct.toFixed(0)}%，表现强劲`,
      });
    } else if (revPct < -10) {
      result.push({
        type: "negative",
        icon: "📉",
        text: `销售额下降 ${Math.abs(revPct).toFixed(0)}%，需要关注`,
      });
    }

    if (unitsPerOrder > prevUnitsPerOrder * 1.1) {
      result.push({
        type: "positive",
        icon: "🛒",
        text: `客件数增加：${unitsPerOrder.toFixed(1)} vs ${prevUnitsPerOrder.toFixed(1)}`,
      });
    } else if (unitsPerOrder < prevUnitsPerOrder * 0.9 && prevUnitsPerOrder > 0) {
      result.push({
        type: "negative",
        icon: "🛒",
        text: `客件数下降：${unitsPerOrder.toFixed(1)} vs ${prevUnitsPerOrder.toFixed(1)}`,
      });
    }

    if (aov > prevAov * 1.15) {
      result.push({
        type: "positive",
        icon: "💵",
        text: `客单价提升 $${(aov - prevAov).toFixed(2)}，高价值订单增加`,
      });
    }

    if (lowStock > 5) {
      result.push({
        type: "negative",
        icon: "⚠️",
        text: `${lowStock} 个 SKU 库存偏低，建议补货`,
      });
    } else if (lowStock > 0) {
      result.push({
        type: "neutral",
        icon: "📦",
        text: `${lowStock} 个 SKU 库存偏低，请留意`,
      });
    }

    if (result.length === 0) {
      result.push({
        type: "neutral",
        icon: "✨",
        text: "各项指标平稳，保持现有运营策略",
      });
    }

    return result.slice(0, 4);
  }, [curRevenue, prevRevenue, curUnits, prevUnits, curOrders, prevOrders, lowStock]);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">业务洞察</h3>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="space-y-2">
          {insights.map((insight, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-sm ${
                insight.type === "positive"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : insight.type === "negative"
                  ? "bg-destructive/8 text-destructive"
                  : "bg-muted/50 text-muted-foreground"
              }`}
            >
              <span>{insight.icon}</span>
              <span>{insight.text}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── Margin Badge ─────────────────────────────────────────────────────────────

function getMarginForAsin(asin: string, profitData: ProfitItem[] | null): number | null {
  if (!asin || !profitData?.length) return null;
  const item = profitData.find((p) => p.asin === asin);
  if (!item) return null;
  const m = item.profitMargin;
  if (m == null || isNaN(m) || m <= 0) return null;
  return m;
}

function MarginBadge({ asin, profitData }: { asin: string; profitData: ProfitItem[] | null }) {
  const margin = getMarginForAsin(asin, profitData);
  if (margin === null) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  const cls =
    margin >= 30
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      : margin >= 15
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400";
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {margin.toFixed(0)}%
    </span>
  );
}

// ─── Chart config ─────────────────────────────────────────────────────────────

const salesChartConfig = {
  current: {
    label: "本周期",
    color: "#3B82F6",
  },
  previous: {
    label: "上周期",
    color: "#9CA3AF",
  },
} satisfies ChartConfig;

// ─── Seasonal Windows ─────────────────────────────────────────────────────────

interface SeasonalWindow {
  product: string;
  asin: string;
  peakMonth: number;
  prepDeadlineDays: number;
  urgency: string;
  deadline?: string;
}

function SeasonalWindowsCard() {
  const today = new Date();
  const windows = seasonalWindows as SeasonalWindow[];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">季节性窗口</h3>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {windows.map((w, i) => {
            const daysLeft = w.deadline
              ? Math.ceil((new Date(w.deadline).getTime() - Date.now()) / 86_400_000)
              : w.prepDeadlineDays;
            const urgencyDot =
              daysLeft < 30 ? "🔴" : daysLeft <= 90 ? "🟡" : "⚪";
            const peakLabel = new Date(today.getFullYear(), w.peakMonth - 1, 1)
              .toLocaleString("en-US", { month: "long" });
            const absoluteLabel = w.deadline
              ? new Date(w.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : null;
            return (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base leading-none">{urgencyDot}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-foreground truncate">{w.product}</p>
                      {w.asin && (
                        <a
                          href={`https://www.amazon.com/dp/${w.asin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary flex-shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">峰值月份: {peakLabel}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-sm font-bold text-foreground">{daysLeft}d</p>
                  {absoluteLabel && (
                    <p className="text-[10px] text-muted-foreground">{absoluteLabel}</p>
                  )}
                  {!absoluteLabel && (
                    <p className="text-[10px] text-muted-foreground">备货截止</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BusinessPage() {
  const [period, setPeriod] = useState<Period>(14);

  // Sales data
  const [sales, setSales] = useState<SalesDay[]>([]);
  const [prevSales, setPrevSales] = useState<SalesDay[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);

  // Ops data
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [finance, setFinance] = useState<{ events?: FinanceEvent[] } | null>(null);
  const [returns, setReturns] = useState<{ total?: number; events?: ReturnEvent[]; alerts?: { critical?: ReturnEvent[]; high?: ReturnEvent[] } } | null>(null);
  const [opsLoading, setOpsLoading] = useState(true);

  // Profit data for margin badges
  const [profitItems, setProfitItems] = useState<ProfitItem[] | null>(null);

  // ── Fetch sales + inventory on period change ──────────────────────────────
  useEffect(() => {
    setSalesLoading(true);
    const days = period * 2;

    Promise.all([
      fetch(`/api/amazon/sales?days=${days}`).then((r) => r.json()).catch(() => ({ metrics: [] })),
      fetch("/api/amazon/inventory").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch(`/api/amazon/top-products?days=${period}`).then((r) => r.json()).catch(() => ({ products: [] })),
    ]).then(([salesData, invData, topData]) => {
      if (salesData.mock || invData.mock) setIsMock(true);

      // Map metrics to SalesDay
      const metrics: SalesDay[] = (salesData.metrics ?? []).map(
        (m: Record<string, unknown>) => ({
          date: (typeof m.interval === 'string' ? m.interval.split("T")[0]?.split("--")[0]?.slice(5) : null) ??
                (typeof m.date === 'string' ? m.date : "") ??
                "",
          revenue: parseFloat(String(m.total_sales ?? m.totalSales ?? m.revenue ?? 0)),
          units: Number(m.unit_count ?? m.unitCount ?? m.units ?? 0),
          orders: Number(m.order_count ?? m.orderCount ?? m.orders ?? 0),
          avgUnitPrice: parseFloat(String(m.average_unit_price ?? m.avgUnitPrice ?? 0)),
        })
      );

      if (metrics.length >= period * 2) {
        setPrevSales(metrics.slice(0, period));
        setSales(metrics.slice(period, period * 2));
      } else if (metrics.length > period) {
        const half = Math.floor(metrics.length / 2);
        setPrevSales(metrics.slice(0, half));
        setSales(metrics.slice(half));
      } else {
        setSales(metrics);
        setPrevSales([]);
      }

      // Inventory
      if (invData.items?.length) setInventory(invData.items);

      // Top products — map API snake_case fields + deduplicate by ASIN
      if (topData.products?.length) {
        const mapped: TopProduct[] = (topData.products as Record<string, unknown>[]).map((p) => ({
          asin: String(p.asin ?? ""),
          sku: p.sku ? String(p.sku) : undefined,
          title: p.title ? String(p.title) : (p.name ? String(p.name) : undefined),
          revenue: parseFloat(String(p.revenue ?? 0)) || 0,
          orderCount: Number(p.order_count ?? p.orderCount ?? 0),
          quantityOrdered: Number(p.quantity_sold ?? p.quantityOrdered ?? p.units ?? 0),
        }));

        const deduped = new Map<string, TopProduct>();
        for (const p of mapped) {
          const key = p.asin;
          if (deduped.has(key)) {
            const existing = deduped.get(key)!;
            deduped.set(key, {
              ...existing,
              quantityOrdered: existing.quantityOrdered + p.quantityOrdered,
              revenue: existing.revenue + p.revenue,
              orderCount: existing.orderCount + p.orderCount,
            });
          } else {
            deduped.set(key, { ...p });
          }
        }
        setTopProducts(
          Array.from(deduped.values()).sort((a, b) => b.revenue - a.revenue)
        );
      }

      setSalesLoading(false);
    });
  }, [period]);

  // ── Fetch ops data once ───────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch("/api/amazon/finance").then((r) => r.json()).catch(() => null),
      fetch("/api/amazon/returns").then((r) => r.json()).catch(() => null),
      fetch("/api/profit").then((r) => r.json()).catch(() => null),
    ]).then(([financeData, returnsData, profitData]) => {
      setFinance(financeData);
      setReturns(returnsData);
      if (profitData?.items?.length) setProfitItems(profitData.items as ProfitItem[]);
      setOpsLoading(false);
    });
  }, []);

  // ── KPI Aggregates ────────────────────────────────────────────────────────
  const curRevenue = sumField(sales, "revenue");
  const prvRevenue = sumField(prevSales, "revenue");
  const curUnits = sumField(sales, "units");
  const prvUnits = sumField(prevSales, "units");
  const curOrders = sumField(sales, "orders");
  const prvOrders = sumField(prevSales, "orders");
  const avgOrderValue = curOrders ? curRevenue / curOrders : 0;
  const prevAvgOrderValue = prvOrders ? prvRevenue / prvOrders : 0;
  const avgUnitPrice = curUnits ? curRevenue / curUnits : 0;
  const prevAvgUnitPrice = prvUnits ? prvRevenue / prvUnits : 0;

  const lowStockCount = inventory.filter((i) => (i.available ?? 0) <= 50).length;

  // ── Chart data — align current vs previous by day index ──────────────────
  const chartData = useMemo(() => {
    const len = Math.max(sales.length, prevSales.length);
    return Array.from({ length: len }, (_, i) => ({
      day: `Day ${i + 1}`,
      current: sales[i]?.revenue ?? null,
      previous: prevSales[i]?.revenue ?? null,
    }));
  }, [sales, prevSales]);

  // ── Finance aggregates ────────────────────────────────────────────────────
  const financeAgg = useMemo(() => {
    if (!finance?.events?.length) return null;
    let productCharge = 0;
    let refund = 0;
    let fee = 0;
    const skuFees = new Map<string, { fee: number; revenue: number }>();

    for (const ev of finance.events) {
      const grp = ev.event_group?.toLowerCase() ?? "";
      // FIX: amount comes back as a string from the API — parse it
      const amt = parseFloat(String(ev.amount)) || 0;

      if (grp === "product_charge") {
        if (amt > 0) {
          // Positive product_charge = revenue (Net Revenue, Sales)
          productCharge += amt;
          if (ev.sku) {
            const existing = skuFees.get(ev.sku) ?? { fee: 0, revenue: 0 };
            skuFees.set(ev.sku, { ...existing, revenue: existing.revenue + amt });
          }
        } else if (amt < 0) {
          // Negative product_charge = fees/promotions (Fees, Promotions)
          fee += Math.abs(amt);
          if (ev.sku) {
            const existing = skuFees.get(ev.sku) ?? { fee: 0, revenue: 0 };
            skuFees.set(ev.sku, { ...existing, fee: existing.fee + Math.abs(amt) });
          }
        }
      } else if (grp.includes("refund")) {
        refund += Math.abs(amt);
      } else if (grp.includes("fee") || grp.includes("commission")) {
        fee += Math.abs(amt);
        if (ev.sku) {
          const existing = skuFees.get(ev.sku) ?? { fee: 0, revenue: 0 };
          skuFees.set(ev.sku, { ...existing, fee: existing.fee + Math.abs(amt) });
        }
      }
    }

    const netProfit = productCharge - refund - fee;
    const margin = productCharge > 0 ? (netProfit / productCharge) * 100 : 0;

    // High fee SKUs (fee ratio > 40%)
    const highFeeSKUs = Array.from(skuFees.entries())
      .map(([sku, { fee: f, revenue: r }]) => ({
        sku,
        feeRatio: r > 0 ? (f / r) * 100 : 0,
        fee: f,
        revenue: r,
      }))
      .filter((x) => x.feeRatio > 40)
      .sort((a, b) => b.feeRatio - a.feeRatio)
      .slice(0, 5);

    return { productCharge, refund, fee, netProfit, margin, highFeeSKUs };
  }, [finance]);

  // ── Returns ───────────────────────────────────────────────────────────────
  const returnAlerts: ReturnEvent[] =
    returns?.alerts?.critical ?? returns?.alerts?.high ?? [];
  const totalReturns = returns?.total ?? returnAlerts.length ?? 0;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <DashboardPageLayout
      title="ZOVIRO Business"
      description="运营数据总览"
      signedOut={{
        message: "Sign in to access the business dashboard.",
        forceRedirectUrl: "/business",
      }}
    >
      {/* ── Header + Period selector ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">业务总览</h1>
          <p className="text-sm text-muted-foreground mt-0.5">ZOVIRO 运营数据</p>
        </div>
        <div className="flex items-center gap-3">
          {isMock && (
            <Badge variant="default" className="text-[10px]">
              <AlertTriangle className="w-2.5 h-2.5 mr-1" />
              模拟数据
            </Badge>
          )}
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* ── Low stock banner ─────────────────────────────────────────────── */}
      {!salesLoading && lowStockCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/8 border border-destructive/20 mb-6">
          <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive">
            <span className="font-semibold">{lowStockCount} 个 SKU 库存偏低</span>
            <span className="opacity-70"> — 建议尽快补货避免断货</span>
          </p>
        </div>
      )}

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <KpiCard
          label="销售额"
          value={fmt.currency(curRevenue) || "--"}
          subValue={prvRevenue ? `上周期 ${fmt.currency(prvRevenue)}` : undefined}
          trend={prvRevenue ? { pct: pct(curRevenue, prvRevenue), prevLabel: fmt.currency(prvRevenue) } : null}
          icon={<DollarSign className="h-4 w-4" />}
          loading={salesLoading}
        />
        <KpiCard
          label="订单数"
          value={curOrders ? fmt.number(curOrders) : "--"}
          subValue={`日均 ${curOrders && period ? (curOrders / period).toFixed(0) : "--"} 单`}
          trend={prvOrders ? { pct: pct(curOrders, prvOrders), prevLabel: String(prvOrders) } : null}
          icon={<ShoppingCart className="h-4 w-4" />}
          loading={salesLoading}
        />
        <KpiCard
          label="客单价"
          value={avgOrderValue ? fmt.currencyFull(avgOrderValue) : "--"}
          subValue={prevAvgOrderValue ? `上周期 ${fmt.currencyFull(prevAvgOrderValue)}` : undefined}
          trend={prevAvgOrderValue ? { pct: pct(avgOrderValue, prevAvgOrderValue), prevLabel: fmt.currencyFull(prevAvgOrderValue) } : null}
          icon={<Target className="h-4 w-4" />}
          loading={salesLoading}
        />
        <KpiCard
          label="件单价"
          value={avgUnitPrice ? fmt.currencyFull(avgUnitPrice) : "--"}
          subValue={prevAvgUnitPrice ? `上周期 ${fmt.currencyFull(prevAvgUnitPrice)}` : undefined}
          trend={prevAvgUnitPrice ? { pct: pct(avgUnitPrice, prevAvgUnitPrice), prevLabel: fmt.currencyFull(prevAvgUnitPrice) } : null}
          icon={<TrendingUp className="h-4 w-4" />}
          loading={salesLoading}
        />
      </div>

      {/* ── Seasonal Windows ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <SeasonalWindowsCard />
      </div>

      {/* ── Sales chart + Insights ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Sales trend chart */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">销售趋势</h2>
                <p className="text-xs text-muted-foreground">本周期 vs 上周期 · 日销售额 (USD)</p>
              </div>
              <div className="flex items-center gap-4 text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-primary" />
                  <span className="text-muted-foreground">本周期</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-muted-foreground/40" />
                  <span className="text-muted-foreground">上周期</span>
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {salesLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex h-56 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ChartContainer config={salesChartConfig} className="h-56 w-full">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradPrevious" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#9CA3AF" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#9CA3AF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
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
                    dataKey="previous"
                    stroke="#9CA3AF"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    fill="url(#gradPrevious)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="current"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    fill="url(#gradCurrent)"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Business Insights */}
        {salesLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : (
          <InsightPanel
            curRevenue={curRevenue}
            prevRevenue={prvRevenue}
            curUnits={curUnits}
            prevUnits={prvUnits}
            curOrders={curOrders}
            prevOrders={prvOrders}
            lowStock={lowStockCount}
          />
        )}
      </div>

      {/* ── Profit room + Top Products ───────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* 利润指挥室 */}
        <Card className="xl:col-span-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">💰 利润指挥室</h2>
                <p className="text-xs text-muted-foreground">净利润 · 利润率 · 成本拆解</p>
              </div>
              <Badge variant="outline" className="text-[10px]">Mock COGS</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {opsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : !financeAgg ? (
              <EmptyState message="暂无财务数据" />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">商品收入</p>
                    <p className="text-lg font-bold text-foreground">{fmt.currency(financeAgg.productCharge)}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">净利润</p>
                    <p className={`text-lg font-bold ${financeAgg.netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {fmt.currency(financeAgg.netProfit)}
                    </p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">利润率</p>
                    <p className={`text-lg font-bold ${financeAgg.margin >= 20 ? "text-emerald-600" : financeAgg.margin >= 10 ? "text-amber-600" : "text-destructive"}`}>
                      {fmt.pct(financeAgg.margin)}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>退款</span>
                    <span className="text-destructive">{fmt.currency(financeAgg.refund)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>FBA / 佣金费用</span>
                    <span className="text-destructive">{fmt.currency(financeAgg.fee)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium pt-1 border-t border-border">
                    <span>费用率</span>
                    <span>{financeAgg.productCharge > 0 ? fmt.pct((financeAgg.fee / financeAgg.productCharge) * 100) : "--"}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="text-base font-semibold text-foreground">Top Products</h3>
              </div>
              {topProducts.length > 0 && (
                <Badge variant="default" className="text-[10px]">{period}天</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {salesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : topProducts.length === 0 ? (
              <EmptyState message="暂无销售数据" />
            ) : (
              <div className="space-y-2">
                {topProducts.slice(0, 7).map((p, i) => (
                  <div
                    key={`${p.asin}-${i}`}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                        i < 3
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {p.title || p.sku || p.asin}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {p.orderCount} 订单 · {p.quantityOrdered} 件
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-0.5">
                      <p className="text-sm font-semibold text-foreground">
                        ${fmt.compact(p.revenue)}
                      </p>
                      <MarginBadge asin={p.asin} profitData={profitItems} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Alert panels ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* 库存警报 */}
        <Card className="border-destructive/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-destructive" />
                <h3 className="text-base font-semibold text-foreground">库存警报</h3>
              </div>
              {lowStockCount > 0 && (
                <Badge variant="danger" className="text-[10px]">{lowStockCount} 偏低</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {salesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : (
              (() => {
                const lowItems = inventory.filter((item) => (item.available ?? 0) <= 50).slice(0, 5);
                return lowItems.length === 0 ? (
                  <EmptyState message="库存健康" />
                ) : (
                  <div className="space-y-2">
                    {lowItems.map((item, i) => (
                      <div
                        key={`${item.sku}-${i}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-destructive/5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{item.sku}</p>
                          {item.asin && (
                            <p className="text-[10px] text-muted-foreground">ASIN: {item.asin}</p>
                          )}
                        </div>
                        <div className="text-right ml-2">
                          <Badge
                            variant={item.available === 0 ? "danger" : "default"}
                            className="text-[9px]"
                          >
                            {item.available === 0 ? "缺货" : `${item.available} 剩`}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </CardContent>
        </Card>

        {/* 费用监控 */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" />
                <h3 className="text-base font-semibold text-foreground">费用监控</h3>
              </div>
              {(financeAgg?.highFeeSKUs?.length ?? 0) > 0 && (
                <Badge className="text-[10px] bg-primary/10 text-primary border-0">
                  {financeAgg!.highFeeSKUs.length} 高费用
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {opsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : !financeAgg?.highFeeSKUs?.length ? (
              <EmptyState message="费用正常" />
            ) : (
              <div className="space-y-3">
                {financeAgg.highFeeSKUs.map((item, i) => (
                  <div key={`fee-${i}`} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-foreground truncate max-w-[60%]">{item.sku}</span>
                      <span className="text-destructive font-semibold">{item.feeRatio.toFixed(0)}%</span>
                    </div>
                    <Progress value={Math.min(item.feeRatio, 100)} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground">
                      收入 ${fmt.compact(item.revenue)} · 费用 ${fmt.compact(item.fee)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 退货警报 */}
        <Card className="border-amber-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-500" />
                <h3 className="text-base font-semibold text-foreground">退货警报</h3>
              </div>
              {totalReturns > 0 && (
                <Badge variant="danger" className="text-[10px]">{totalReturns} 退货</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {opsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : returnAlerts.length === 0 ? (
              <EmptyState message="退货正常" />
            ) : (
              <div className="space-y-2">
                {returnAlerts.slice(0, 4).map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-destructive/5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.title || item.sku || "Unknown"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.returnCount} 退货
                        {item.returnRate ? ` · 退货率 ${item.returnRate}%` : ""}
                      </p>
                    </div>
                    <Badge variant="danger" className="text-[9px] ml-2">
                      {item.returnRate ? `${item.returnRate}%` : "警报"}
                    </Badge>
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
