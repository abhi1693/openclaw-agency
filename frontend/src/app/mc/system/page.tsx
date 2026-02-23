"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useMC } from "../context";
import { Skeleton } from "../layout";

function GoalRing({ pct, size = 100, stroke = 9, color = "#396AFF", label, sub }: {
  pct: number; size?: number; stroke?: number; color?: string; label: string; sub?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(pct, 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative" }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F0F0F0" strokeWidth={stroke} />
          <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - (clamped / 100) * circ }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{clamped.toFixed(0)}%</div>
          </div>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#343C6A" }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "#718EBF", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function SystemPage() {
  const { sysInfo, t, isDark, refreshTabData } = useMC();

  useEffect(() => { refreshTabData("system"); }, []);

  if (!sysInfo) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text, marginBottom: 24 }}>⚙️ System</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} h={200} r={20} />)}
        </div>
      </div>
    );
  }

  const gauges = [
    {
      label: "CPU", value: sysInfo.cpu_percent, sub: `${sysInfo.cpu_percent.toFixed(1)}% used`,
      color: sysInfo.cpu_percent > 80 ? t.red : sysInfo.cpu_percent > 60 ? t.yellow : t.green,
    },
    {
      label: "Memory", value: sysInfo.memory_percent,
      sub: `${sysInfo.memory_used_gb.toFixed(1)} / ${sysInfo.memory_total_gb.toFixed(1)} GB`,
      color: sysInfo.memory_percent > 80 ? t.red : sysInfo.memory_percent > 60 ? t.yellow : t.teal,
    },
    {
      label: "Disk", value: sysInfo.disk_percent,
      sub: `${sysInfo.disk_used_gb.toFixed(0)} / ${sysInfo.disk_total_gb.toFixed(0)} GB`,
      color: sysInfo.disk_percent > 90 ? t.red : sysInfo.disk_percent > 70 ? t.yellow : t.primary,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text, marginBottom: 4 }}>⚙️ System Vitals</h1>
      <p style={{ fontSize: 13, color: t.text2, marginBottom: 24 }}>Infrastructure health and resource utilization</p>

      {/* Gauges */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {gauges.map((g, i) => (
          <motion.div key={g.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            style={{ background: t.card, borderRadius: 20, padding: "24px 20px", textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
            <GoalRing pct={g.value} color={g.color} label={g.label} sub={g.sub} />
            {/* Mini bar */}
            <div style={{ marginTop: 12, height: 4, borderRadius: 2, background: `${g.color}20` }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(g.value, 100)}%` }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                style={{ height: "100%", borderRadius: 2, background: g.color }} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* System info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          style={{ background: t.card, borderRadius: 20, padding: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 16 }}>🖥️ Platform Info</h3>
          {[
            { label: "Platform", value: sysInfo.platform },
            { label: "Uptime", value: sysInfo.uptime },
            { label: "Status", value: "Operational" },
          ].map(info => (
            <div key={info.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${t.tableBorder}`, fontSize: 13 }}>
              <span style={{ color: t.text2 }}>{info.label}</span>
              <span style={{ fontWeight: 600, color: info.label === "Status" ? t.green : t.text }}>{info.value}</span>
            </div>
          ))}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          style={{ background: t.card, borderRadius: 20, padding: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 16 }}>⚡ Resource Summary</h3>
          {[
            { label: "CPU Usage", value: `${sysInfo.cpu_percent.toFixed(1)}%`, color: gauges[0].color },
            { label: "Memory Used", value: `${sysInfo.memory_used_gb.toFixed(1)} GB`, color: gauges[1].color },
            { label: "Disk Used", value: `${sysInfo.disk_used_gb.toFixed(0)} GB`, color: gauges[2].color },
            { label: "Memory Total", value: `${sysInfo.memory_total_gb.toFixed(1)} GB`, color: t.text },
            { label: "Disk Total", value: `${sysInfo.disk_total_gb.toFixed(0)} GB`, color: t.text },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${t.tableBorder}`, fontSize: 13 }}>
              <span style={{ color: t.text2 }}>{r.label}</span>
              <span style={{ fontWeight: 600, color: r.color }}>{r.value}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
