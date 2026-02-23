"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { useMC, BRAND_COLORS } from "../context";
import { Skeleton } from "../layout";
import type { PerfSnap } from "../types";

type Range = "today" | "yesterday" | "7d" | "30d";

export default function PerformancePage() {
  const { brands, perfData, loading, t, isDark, privacy, priv, refreshTabData } = useMC();
  const [range, setRange] = useState<Range>("30d");
  const [sortCol, setSortCol] = useState<string>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => { refreshTabData("performance"); }, []);

  // Filter perf data by range
  const now = new Date();
  const rangeStart = {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    yesterday: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
    "7d": new Date(Date.now() - 7 * 864e5),
    "30d": new Date(Date.now() - 30 * 864e5),
  }[range];

  const filtered = perfData.filter(p => new Date(p.date) >= rangeStart);
  if (range === "yesterday") {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    filtered.length = 0;
    perfData.filter(p => new Date(p.date).toDateString() === yesterday.toDateString()).forEach(p => filtered.push(p));
  }
  if (range === "today") {
    filtered.length = 0;
    perfData.filter(p => new Date(p.date).toDateString() === now.toDateString()).forEach(p => filtered.push(p));
  }

  const usedData = range === "30d" ? perfData : filtered;

  // Chart data
  const dates = [...new Set(usedData.map(p => p.date))].sort().slice(-30);
  const revenueChartData = dates.map(d => {
    const row: any = { date: d.slice(5) };
    let total = 0;
    brands.forEach(b => {
      const snap = usedData.find(p => p.date === d && p.brand_id === b.id);
      const val = snap?.revenue || 0;
      row[b.name] = val;
      total += val;
    });
    row["Total"] = total;
    return row;
  });

  const ordersChartData = dates.map(d => {
    const row: any = { date: d.slice(5) };
    brands.forEach(b => {
      const snap = usedData.find(p => p.date === d && p.brand_id === b.id);
      row[b.name] = snap?.orders || 0;
    });
    return row;
  });

  // Brand summary table
  const brandSummaries = brands.map(b => {
    const snaps = usedData.filter(p => p.brand_id === b.id);
    const revenue = snaps.reduce((s, p) => s + p.revenue, 0);
    const orders = snaps.reduce((s, p) => s + p.orders, 0);
    const adSpend = snaps.reduce((s, p) => s + p.ad_spend, 0);
    const avgRoas = snaps.length ? snaps.reduce((s, p) => s + p.roas, 0) / snaps.length : 0;
    const avgAov = orders ? revenue / orders : 0;
    const clicks = snaps.reduce((s, p) => s + p.clicks, 0);
    const impressions = snaps.reduce((s, p) => s + p.impressions, 0);
    const ctr = impressions ? (clicks / impressions) * 100 : 0;
    return { ...b, revenue, orders, adSpend, avgRoas, avgAov, clicks, impressions, ctr };
  });

  brandSummaries.sort((a, b) => {
    const va = (a as any)[sortCol] || 0;
    const vb = (b as any)[sortCol] || 0;
    return sortDir === "desc" ? vb - va : va - vb;
  });

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const RANGES: { id: Range; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "7d", label: "7 Days" },
    { id: "30d", label: "30 Days" },
  ];

  if (loading) {
    return <div style={{ padding: 24 }}><Skeleton h={300} r={20} /></div>;
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header + Range Picker */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text }}>📊 Performance</h1>
          <p style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>Revenue analytics across all brands</p>
        </div>
        <div style={{ display: "flex", gap: 3, background: isDark ? t.sidebarHover : "#F0F3F8", borderRadius: 50, padding: 3 }}>
          {RANGES.map(r => (
            <motion.button key={r.id} onClick={() => setRange(r.id)} whileTap={{ scale: 0.95 }}
              style={{ padding: "7px 16px", borderRadius: 50, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: range === r.id ? t.primary : "transparent", color: range === r.id ? "#fff" : t.text2, fontFamily: "inherit", transition: "all 0.15s" }}>
              {r.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* KPI Summary Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Revenue", value: brandSummaries.reduce((s, b) => s + b.revenue, 0), prefix: "$", color: t.green },
          { label: "Total Orders", value: brandSummaries.reduce((s, b) => s + b.orders, 0), prefix: "", color: t.primary },
          { label: "Total Ad Spend", value: brandSummaries.reduce((s, b) => s + b.adSpend, 0), prefix: "$", color: t.red },
          { label: "Avg ROAS", value: brandSummaries.length ? brandSummaries.reduce((s, b) => s + b.avgRoas, 0) / brandSummaries.length : 0, prefix: "", suffix: "x", decimals: 2, color: t.teal },
          { label: "Total Clicks", value: brandSummaries.reduce((s, b) => s + b.clicks, 0), prefix: "", color: t.purple },
        ].map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            style={{ background: t.card, borderRadius: 16, padding: "16px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: t.text2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{kpi.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color }}>
              {privacy ? "••••" : `${kpi.prefix}${(kpi.decimals ? kpi.value.toFixed(kpi.decimals) : Math.round(kpi.value).toLocaleString())}${kpi.suffix || ""}`}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Revenue Area Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        style={{ background: t.card, borderRadius: 20, padding: 24, marginBottom: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 16 }}>📈 Revenue by Brand</h3>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                {brands.map((b, i) => (
                  <linearGradient key={b.id} id={`pg-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND_COLORS[i % BRAND_COLORS.length]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={BRAND_COLORS[i % BRAND_COLORS.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={t.tableBorder} />
              <XAxis dataKey="date" tick={{ fill: t.text2, fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: t.text2, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 12, fontSize: 12 }} formatter={(v: number | undefined) => v != null ? [`$${v.toLocaleString()}`, ""] : ["—", ""]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              {brands.map((b, i) => (
                <Area key={b.id} type="monotone" dataKey={b.name}
                  stroke={BRAND_COLORS[i % BRAND_COLORS.length]}
                  fill={`url(#pg-${i})`} strokeWidth={2} dot={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Orders Bar Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        style={{ background: t.card, borderRadius: 20, padding: 24, marginBottom: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 16 }}>📦 Orders by Brand</h3>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ordersChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.tableBorder} />
              <XAxis dataKey="date" tick={{ fill: t.text2, fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: t.text2, fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 12, fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              {brands.map((b, i) => (
                <Bar key={b.id} dataKey={b.name} fill={BRAND_COLORS[i % BRAND_COLORS.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Brand Comparison Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
        style={{ background: t.card, borderRadius: 20, padding: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 16 }}>🏷️ Brand Comparison</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {[
                  { key: "name", label: "Brand" },
                  { key: "revenue", label: "Revenue" },
                  { key: "orders", label: "Orders" },
                  { key: "avgAov", label: "AOV" },
                  { key: "adSpend", label: "Ad Spend" },
                  { key: "avgRoas", label: "ROAS" },
                  { key: "clicks", label: "Clicks" },
                  { key: "ctr", label: "CTR" },
                  { key: "revenue_target", label: "Goal Progress" },
                ].map(col => (
                  <th key={col.key}
                    onClick={() => col.key !== "name" && col.key !== "revenue_target" && handleSort(col.key)}
                    style={{ textAlign: "left", padding: "10px 14px", color: t.text2, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `2px solid ${t.tableBorder}`, cursor: col.key !== "name" ? "pointer" : "default", whiteSpace: "nowrap", userSelect: "none" }}>
                    {col.label} {sortCol === col.key ? (sortDir === "desc" ? "↓" : "↑") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brandSummaries.map((b, i) => (
                <motion.tr key={b.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  style={{ borderBottom: `1px solid ${t.tableBorder}` }}
                  onMouseOver={e => (e.currentTarget.style.background = isDark ? t.sidebarHover : "#F8FAFC")}
                  onMouseOut={e => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                      <span style={{ fontWeight: 600, color: t.text }}>{b.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", fontWeight: 600, color: t.green }}>{priv(`$${b.revenue.toLocaleString()}`)}</td>
                  <td style={{ padding: "12px 14px", color: t.text }}>{b.orders.toLocaleString()}</td>
                  <td style={{ padding: "12px 14px", color: t.text }}>{priv(`$${b.avgAov.toFixed(2)}`)}</td>
                  <td style={{ padding: "12px 14px", color: t.red }}>{priv(`$${b.adSpend.toLocaleString()}`)}</td>
                  <td style={{ padding: "12px 14px", color: t.teal, fontWeight: 600 }}>{b.avgRoas > 0 ? `${b.avgRoas.toFixed(2)}x` : "—"}</td>
                  <td style={{ padding: "12px 14px", color: t.text }}>{b.clicks.toLocaleString()}</td>
                  <td style={{ padding: "12px 14px", color: t.text }}>{b.ctr > 0 ? `${b.ctr.toFixed(2)}%` : "—"}</td>
                  <td style={{ padding: "12px 14px" }}>
                    {b.revenue_target > 0 ? (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: t.text2 }}>{((b.revenue / b.revenue_target) * 100).toFixed(0)}%</span>
                          <span style={{ fontSize: 10, color: t.text3 }}>${b.revenue_target.toLocaleString()}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: `${t.green}20` }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min((b.revenue / b.revenue_target) * 100, 100)}%` }}
                            transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                            style={{ height: "100%", borderRadius: 3, background: b.revenue / b.revenue_target >= 0.8 ? t.green : t.primary }} />
                        </div>
                      </div>
                    ) : <span style={{ color: t.text3, fontSize: 11 }}>No target</span>}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
