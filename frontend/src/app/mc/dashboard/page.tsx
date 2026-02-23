"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, BarChart3, Zap, Target, Activity, Bot, Sun, Clock,
  AlertTriangle, Inbox, CheckCircle2, Eye, Ban, Calendar,
} from "lucide-react";
import { useMC, BRAND_COLORS, STATUS_COLORS } from "../context";
import { Skeleton } from "../layout";
import { etRelative, etDateShort } from "../helpers";
import { TASK_STATUSES, TASK_CATEGORIES, AGENT_EMOJIS } from "../types";
import type { MCTask, TaskSummary } from "../types";

// ── Animated Counter ──
function Count({ value, prefix = "", suffix = "", decimals = 0, color }: {
  value: number; prefix?: string; suffix?: string; decimals?: number; color?: string;
}) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ color }}
    >
      {prefix}{decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString()}{suffix}
    </motion.span>
  );
}

// ── Goal Ring ──
function GoalRing({ pct, size = 80, stroke = 7, color = "#396AFF", label, brand }: {
  pct: number; size?: number; stroke?: number; color?: string; label: string; brand?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(pct, 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F0F0F0" strokeWidth={stroke} />
          <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - (clamped / 100) * circ }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color }}>{clamped.toFixed(0)}%</div>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#718EBF", textAlign: "center", maxWidth: size }}>{label}</div>
    </div>
  );
}

// ── Sparkline ──
function Sparkline({ data, color = "#396AFF", w = 80, h = 30 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length < 2) return <div style={{ width: w, height: h }} />;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`
  ).join(" ");
  const filled = pts + ` ${w},${h} 0,${h}`;
  return (
    <svg width={w} height={h}>
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={filled} fill={`url(#sg-${color.replace("#", "")})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export default function DashboardPage() {
  const {
    agents, brands, tasks, activity, perfData, loading, t, privacy, priv, isDark,
    activeAgents, totalRevenue, pendingTasks, refreshTabData,
  } = useMC();

  useEffect(() => { refreshTabData("performance"); }, []);

  const totalOrders = brands.reduce((s, b) => s + (b.latest_performance?.orders || 0), 0);
  const totalAdSpend = brands.reduce((s, b) => s + (b.latest_performance?.ad_spend || 0), 0);
  const avgRoas = brands.filter(b => b.latest_performance?.roas).reduce((s, b, _, a) =>
    s + (b.latest_performance?.roas || 0) / a.length, 0);
  const avgAov = brands.filter(b => b.latest_performance?.aov).reduce((s, b, _, a) =>
    s + (b.latest_performance?.aov || 0) / a.length, 0);

  // Build sparkline data per brand from perfData
  const brandSparklines: Record<string, number[]> = {};
  perfData.forEach(p => {
    const k = p.brand_id || "";
    if (!brandSparklines[k]) brandSparklines[k] = [];
    brandSparklines[k].push(p.revenue);
  });

  // Chart data
  const dates = [...new Set(perfData.map(p => p.date))].sort().slice(-14);
  const chartData = dates.map(d => {
    const row: any = { date: d.slice(5) };
    brands.forEach(b => {
      const snap = perfData.find(p => p.date === d && p.brand_id === b.id);
      row[b.name] = snap?.revenue || 0;
    });
    return row;
  });

  const kpis = [
    { label: "Total Revenue", value: totalRevenue, prefix: "$", color: t.green, icon: <TrendingUp size={16} />, suffix: "" },
    { label: "Orders Today", value: totalOrders, prefix: "", color: t.primary, icon: <BarChart3 size={16} />, suffix: "" },
    { label: "Ad Spend", value: totalAdSpend, prefix: "$", color: t.red, icon: <Zap size={16} />, suffix: "" },
    { label: "Avg ROAS", value: avgRoas, prefix: "", color: t.teal, icon: <Target size={16} />, suffix: "x", decimals: 1 },
    { label: "Avg AOV", value: avgAov, prefix: "$", color: t.purple, icon: <Activity size={16} />, suffix: "", decimals: 2 },
    { label: "Active Agents", value: activeAgents, prefix: "", color: t.primary, icon: <Bot size={16} />, suffix: `/${agents.length}` },
  ];

  if (loading && !agents.length) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} h={100} r={20} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Page Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text }}>⚡ Command Center</h1>
          <p style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>Real-time overview of all brands and agents</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {activity.slice(0, 1).map(a => (
            <div key={a.id} style={{ padding: "8px 16px", borderRadius: 12, background: `${t.green}15`, fontSize: 11, color: t.green, fontWeight: 600 }}>
              🟢 Last update {etRelative(a.timestamp)}
            </div>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4 }}
            whileHover={{ y: -4, boxShadow: "0 12px 40px rgba(0,0,0,0.1)" }}
            style={{ background: isDark ? "rgba(26,29,58,0.9)" : "rgba(255,255,255,0.9)", backdropFilter: "blur(20px)", borderRadius: 20, padding: "18px 20px", border: `1px solid ${t.glassBorder}`, boxShadow: "0 4px 20px rgba(0,0,0,0.05)", cursor: "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.text2, textTransform: "uppercase", letterSpacing: 1 }}>{kpi.label}</span>
              <div style={{ color: kpi.color, opacity: 0.8 }}>{kpi.icon}</div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {privacy ? "••••" : (
                <Count value={kpi.value} prefix={kpi.prefix} suffix={kpi.suffix} decimals={kpi.decimals} color={kpi.color} />
              )}
            </div>
            <div style={{ marginTop: 8, height: 2, borderRadius: 2, background: `${kpi.color}20` }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((kpi.value / (kpi.label === "Active Agents" ? agents.length || 14 : kpi.value || 1)) * 100, 100)}%` }}
                transition={{ delay: i * 0.1 + 0.5, duration: 0.8 }}
                style={{ height: "100%", borderRadius: 2, background: kpi.color }} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Task Pipeline Summary ── */}
      {tasks.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
          style={{ marginBottom: 24 }}>
          <div style={{
            display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4,
          }}>
            {[
              { key: "inbox", label: "Inbox", icon: <Inbox size={14} />, color: TASK_STATUSES.inbox.color },
              { key: "in_progress", label: "In Progress", icon: <Activity size={14} />, color: TASK_STATUSES.in_progress.color },
              { key: "blocked", label: "Blocked", icon: <Ban size={14} />, color: TASK_STATUSES.blocked.color },
              { key: "review", label: "Review", icon: <Eye size={14} />, color: TASK_STATUSES.review.color },
              { key: "done_today", label: "Done Today", icon: <CheckCircle2 size={14} />, color: TASK_STATUSES.done.color },
            ].map((item) => {
              const count = item.key === "done_today"
                ? tasks.filter(tk => tk.status === "done" && tk.completed_at &&
                    new Date(tk.completed_at).toDateString() === new Date().toDateString()).length
                : tasks.filter(tk => tk.status === item.key).length;
              return (
                <motion.div key={item.key}
                  whileHover={{ y: -2 }}
                  style={{
                    flex: "1 1 0", minWidth: 130, background: t.card, borderRadius: 14,
                    padding: "14px 16px", border: `1px solid ${t.cardBorder}`,
                    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: `${item.color}15`, color: item.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {item.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{count}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: t.text2, whiteSpace: "nowrap" }}>{item.label}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── Agent Workload Strip ── */}
      {(() => {
        const agentWorkloads = agents
          .map(a => {
            const agentTasks = tasks.filter(tk =>
              tk.assigned_agent === a.name &&
              tk.status !== "done" && tk.status !== "archived"
            );
            const nextDue = agentTasks
              .filter(tk => tk.due_date)
              .sort((x, y) => new Date(x.due_date!).getTime() - new Date(y.due_date!).getTime())[0];
            const cats = [...new Set(agentTasks.map(tk => tk.category))];
            return { agent: a, count: agentTasks.length, nextDue, categories: cats };
          })
          .filter(w => w.count > 0)
          .sort((a, b) => b.count - a.count);

        if (agentWorkloads.length === 0) return null;

        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.47 }}
            style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <Bot size={16} color={t.primary} /> Agent Workload
            </h3>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
              {agentWorkloads.map(w => (
                <motion.div key={w.agent.id}
                  whileHover={{ y: -2 }}
                  style={{
                    minWidth: 160, background: t.card, borderRadius: 14,
                    padding: 14, border: `1px solid ${t.cardBorder}`,
                    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{w.agent.emoji}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{w.agent.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: t.text2, marginBottom: 4 }}>
                    {w.count} active task{w.count !== 1 ? "s" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 6 }}>
                    {w.categories.slice(0, 3).map(cat => {
                      const cfg = TASK_CATEGORIES[cat as keyof typeof TASK_CATEGORIES];
                      return (
                        <span key={cat} style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${cfg?.color || t.text3}15`,
                          color: cfg?.color || t.text3,
                          textTransform: "uppercase",
                        }}>
                          {cfg?.code || cat.slice(0, 3).toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                  {w.nextDue && (
                    <div style={{ fontSize: 10, color: t.text3, display: "flex", alignItems: "center", gap: 4 }}>
                      <Calendar size={9} /> Next: {etDateShort(w.nextDue.due_date)}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        );
      })()}

      {/* ── Critical & Overdue Tasks ── */}
      {(() => {
        const now = new Date();
        const criticalTasks = tasks.filter(tk =>
          tk.priority === "critical" && tk.status !== "done" && tk.status !== "archived"
        );
        const overdueTasks = tasks.filter(tk =>
          tk.due_date && new Date(tk.due_date) < now &&
          tk.status !== "done" && tk.status !== "archived"
        );
        const urgentTasks = [...new Map(
          [...criticalTasks, ...overdueTasks].map(tk => [tk.id, tk])
        ).values()];

        if (urgentTasks.length === 0) return null;

        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48 }}
            style={{
              marginBottom: 24, padding: 20, borderRadius: 16,
              background: `${t.red}08`, border: `1px solid ${t.red}20`,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <AlertTriangle size={16} color={t.red} />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: t.red }}>
                Critical & Overdue ({urgentTasks.length})
              </h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {urgentTasks.slice(0, 5).map(tk => {
                const isOverdue = tk.due_date && new Date(tk.due_date) < now;
                const catCfg = TASK_CATEGORIES[tk.category as keyof typeof TASK_CATEGORIES];
                return (
                  <div key={tk.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: 10,
                    background: t.card, border: `1px solid ${t.cardBorder}`,
                  }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, fontFamily: "monospace",
                      color: catCfg?.color || t.text3,
                      background: `${catCfg?.color || t.text3}12`,
                      padding: "2px 6px", borderRadius: 4,
                    }}>
                      {tk.task_uid}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tk.title}
                    </span>
                    <span style={{ fontSize: 10, color: t.text2 }}>
                      {tk.assigned_agent ? `${AGENT_EMOJIS[tk.assigned_agent] || ""} ${tk.assigned_agent}` : "Unassigned"}
                    </span>
                    {tk.priority === "critical" && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: t.red, padding: "1px 6px", borderRadius: 50, background: `${t.red}15` }}>
                        CRITICAL
                      </span>
                    )}
                    {isOverdue && (
                      <motion.span
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        style={{ fontSize: 9, fontWeight: 700, color: "#EF4444" }}
                      >
                        OVERDUE
                      </motion.span>
                    )}
                  </div>
                );
              })}
              {urgentTasks.length > 5 && (
                <div style={{ fontSize: 11, color: t.text3, textAlign: "center", padding: 4 }}>
                  +{urgentTasks.length - 5} more
                </div>
              )}
            </div>
          </motion.div>
        );
      })()}

      {/* Revenue Trend Chart */}
      {chartData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          style={{ background: t.card, borderRadius: 20, padding: 24, marginBottom: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>📈 Revenue Trend — Last 14 Days</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  {brands.map((b, i) => (
                    <linearGradient key={b.id} id={`g-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND_COLORS[i % BRAND_COLORS.length]} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={BRAND_COLORS[i % BRAND_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={t.tableBorder} />
                <XAxis dataKey="date" tick={{ fill: t.text2, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: t.text2, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip contentStyle={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 12, fontSize: 12 }} />
                {brands.map((b, i) => (
                  <Area key={b.id} type="monotone" dataKey={b.name}
                    stroke={BRAND_COLORS[i % BRAND_COLORS.length]}
                    fill={`url(#g-${i})`} strokeWidth={2} dot={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Goal Gauges */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          style={{ background: t.card, borderRadius: 20, padding: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 20 }}>🎯 $100K Monthly Goal</h3>
          <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
            {brands.filter(b => b.revenue_target > 0).map((b, i) => (
              <GoalRing key={b.id}
                pct={(b.current_revenue / b.revenue_target) * 100}
                label={b.name}
                color={b.current_revenue / b.revenue_target >= 0.8 ? t.green : BRAND_COLORS[i % BRAND_COLORS.length]}
                brand={b.name} />
            ))}
          </div>
        </motion.div>

        {/* Agent Status Grid */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
          style={{ background: t.card, borderRadius: 20, padding: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>
            🤖 Agent Status
            <span style={{ marginLeft: 8, fontSize: 12, color: t.green, fontWeight: 600 }}>{activeAgents} active</span>
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {agents.map((a, i) => (
              <motion.div key={a.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8 + i * 0.03 }}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 10, background: isDark ? t.sidebarHover : "#F8FAFC", border: `1px solid ${t.cardBorder}` }}>
                <span style={{ fontSize: 16 }}>{a.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                </div>
                <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }}
                  style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLORS[a.status] || "#B1B1B1", flexShrink: 0 }} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Morning Brief */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
        style={{ background: `linear-gradient(135deg, ${t.primary}15, ${t.purple}10)`, borderRadius: 20, padding: 24, border: `1px solid ${t.primary}20` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Sun size={18} color={t.primary} />
          <h3 style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Morning Brief</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <div style={{ background: t.card, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, color: t.text2, marginBottom: 4 }}>Tasks in progress</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.primary }}>{tasks.filter(t => t.status === "in_progress").length}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, color: t.text2, marginBottom: 4 }}>Pending review</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.yellow }}>{tasks.filter(t => t.status === "review").length}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, color: t.text2, marginBottom: 4 }}>Completed today</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.green }}>{tasks.filter(t => t.status === "done").length}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, color: t.text2, marginBottom: 4 }}>Agent messages</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.teal }}>{activity.length}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
