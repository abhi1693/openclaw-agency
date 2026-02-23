"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, RefreshCw, Clock, CheckCircle2, XCircle, Pause } from "lucide-react";
import { toast } from "sonner";
import { useMC, mcApi } from "../context";
import { etDateTime, etRelative } from "../helpers";
import { Skeleton } from "../layout";

const CRON_DESCRIPTIONS: Record<string, string> = {
  "*/5 * * * *": "Every 5 minutes",
  "0 * * * *": "Every hour",
  "0 9 * * *": "Daily at 9 AM ET",
  "0 18 * * *": "Daily at 6 PM ET",
  "0 9 * * 1": "Every Monday 9 AM",
  "0 9,18 * * *": "9 AM & 6 PM daily",
  "*/15 * * * *": "Every 15 minutes",
  "0 0 * * *": "Daily at midnight",
};

function parseCron(expr: string): string {
  return CRON_DESCRIPTIONS[expr] || expr;
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { color: string; icon: any; bg: string }> = {
    active: { color: "#41D4A8", icon: CheckCircle2, bg: "#41D4A815" },
    paused: { color: "#FFBB38", icon: Pause, bg: "#FFBB3815" },
    error: { color: "#FF4B4A", icon: XCircle, bg: "#FF4B4A15" },
    pending: { color: "#B1B1B1", icon: Clock, bg: "#B1B1B115" },
  };
  const cfg = configs[status] || configs.pending;
  const Icon = cfg.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 50, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color }}>
      <Icon size={11} /> {status}
    </span>
  );
}

// Mock next run time from cron expression
function nextRun(cronExpr: string): string {
  const now = new Date();
  const nextDate = new Date(now.getTime() + 5 * 60000); // at least 5 min from now
  return nextDate.toISOString();
}

export default function SchedulesPage() {
  const { cronJobs, t, isDark, loading, refreshTabData } = useMC();
  const [triggering, setTriggering] = useState<string | null>(null);
  const [jobHistory, setJobHistory] = useState<Record<string, any[]>>({});

  useEffect(() => { refreshTabData("schedules"); }, []);

  const handleTrigger = async (jobName: string) => {
    setTriggering(jobName);
    try {
      await mcApi(`/cron/${encodeURIComponent(jobName)}/trigger`, { method: "POST" });
      toast.success(`✅ ${jobName} triggered`);
    } catch {
      toast.error(`Failed to trigger ${jobName}`);
    } finally {
      setTimeout(() => setTriggering(null), 2000);
    }
  };

  if (loading) return <div style={{ padding: 24 }}><Skeleton h={400} r={20} /></div>;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text }}>⏰ Schedules</h1>
        <p style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>
          {cronJobs.length} scheduled jobs · {cronJobs.filter(j => j.status === "active").length} active
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Jobs", value: cronJobs.length, color: t.primary },
          { label: "Active", value: cronJobs.filter(j => j.status === "active").length, color: t.green },
          { label: "Paused", value: cronJobs.filter(j => j.status === "paused").length, color: t.yellow },
          { label: "Errors", value: cronJobs.filter(j => j.status === "error").length, color: t.red },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: t.text2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Jobs Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        style={{ background: t.card, borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: isDark ? t.sidebarHover : "#F8FAFC" }}>
              {["Job Name", "Schedule", "Description", "Last Run", "Next Run", "Status", "Action"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "12px 16px", color: t.text2, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `2px solid ${t.tableBorder}`, whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cronJobs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 48, textAlign: "center", color: t.text3, fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>⏸️</div>
                  No scheduled jobs configured
                </td>
              </tr>
            ) : (
              cronJobs.map((job: any, i: number) => (
                <motion.tr key={job.name || i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  style={{ borderBottom: `1px solid ${t.tableBorder}` }}
                  onMouseOver={e => (e.currentTarget.style.background = isDark ? t.sidebarHover : "#F8FAFC")}
                  onMouseOut={e => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 600, color: t.text }}>{job.name}</div>
                    {job.agent && (
                      <div style={{ fontSize: 10, color: t.text3, marginTop: 2 }}>→ {job.agent}</div>
                    )}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <code style={{ fontSize: 11, background: isDark ? t.sidebarHover : "#F0F3F8", padding: "3px 7px", borderRadius: 6, color: t.text }}>{job.schedule}</code>
                  </td>
                  <td style={{ padding: "14px 16px", color: t.text2, maxWidth: 200 }}>
                    <div>{job.description}</div>
                    <div style={{ fontSize: 10, color: t.text3, marginTop: 2 }}>{parseCron(job.schedule)}</div>
                  </td>
                  <td style={{ padding: "14px 16px", color: t.text2, whiteSpace: "nowrap" }}>
                    {job.last_run ? (
                      <>
                        <div style={{ fontSize: 11 }}>{etRelative(job.last_run)}</div>
                        <div style={{ fontSize: 10, color: t.text3 }}>{etDateTime(job.last_run)}</div>
                      </>
                    ) : <span style={{ color: t.text3, fontSize: 11 }}>Never run</span>}
                  </td>
                  <td style={{ padding: "14px 16px", color: t.text2, whiteSpace: "nowrap" }}>
                    {job.status === "active" ? (
                      <>
                        <div style={{ fontSize: 11 }}>{etRelative(nextRun(job.schedule))}</div>
                        <div style={{ fontSize: 10, color: t.text3 }}>{etDateTime(nextRun(job.schedule))}</div>
                      </>
                    ) : <span style={{ color: t.text3, fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusBadge status={job.status || "active"} />
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleTrigger(job.name)}
                      disabled={!!triggering}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 50, border: "none", background: triggering === job.name ? t.green : `${t.primary}18`, color: triggering === job.name ? "#fff" : t.primary, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s" }}>
                      {triggering === job.name ? <RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={11} />}
                      {triggering === job.name ? "Running..." : "Trigger"}
                    </motion.button>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </motion.div>

      {/* 24H Timeline Visualization */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        style={{ background: t.card, borderRadius: 20, padding: 24, marginTop: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 16 }}>⏱ 24h Schedule Timeline</h3>
        <div style={{ position: "relative", height: cronJobs.length > 0 ? cronJobs.length * 36 + 40 : 80 }}>
          {/* Hour markers */}
          <div style={{ display: "flex", gap: 0, marginBottom: 8, paddingLeft: 180 }}>
            {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => (
              <div key={h} style={{ flex: h === 24 ? 0 : 1, fontSize: 9, color: t.text3, textAlign: "center" }}>
                {h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`}
              </div>
            ))}
          </div>
          {/* Timeline bars */}
          {cronJobs.map((job, i) => {
            const color = job.status === "active" ? t.green : job.status === "paused" ? t.yellow : t.red;
            // Parse simple occurrence patterns
            const hours: number[] = [];
            if (job.schedule.includes("0 9 *")) hours.push(9);
            else if (job.schedule.includes("0 18 *")) hours.push(18);
            else if (job.schedule.includes("0 9,18 *")) hours.push(9, 18);
            else if (job.schedule.includes("0 9 * * 1")) hours.push(9);
            else if (job.schedule.includes("*/5")) for (let h = 0; h < 24; h += 0.083) hours.push(h);
            else if (job.schedule.includes("*/15")) for (let h = 0; h < 24; h += 0.25) hours.push(h);
            else if (job.schedule.includes("0 * *")) for (let h = 0; h < 24; h++) hours.push(h);
            else if (job.schedule.includes("0 0 *")) hours.push(0);

            return (
              <div key={job.name} style={{ display: "flex", alignItems: "center", marginBottom: 6, height: 30 }}>
                <div style={{ width: 180, fontSize: 11, fontWeight: 600, color: t.text, paddingRight: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
                  {job.name}
                </div>
                <div style={{ flex: 1, height: 20, background: isDark ? t.sidebarHover : "#F8FAFC", borderRadius: 10, position: "relative", overflow: "hidden" }}>
                  {hours.slice(0, 200).map((h, hi) => (
                    <div key={hi} style={{ position: "absolute", left: `${(h / 24) * 100}%`, top: 4, width: hours.length > 100 ? 2 : 4, height: 12, borderRadius: 2, background: color }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
