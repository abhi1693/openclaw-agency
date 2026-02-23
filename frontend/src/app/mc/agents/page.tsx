"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown } from "lucide-react";
import { useMC, STATUS_COLORS } from "../context";
import { etRelative } from "../helpers";
import type { MCAgent } from "../types";

const DEPT_ICONS: Record<string, string> = {
  Command: "🎖️",
  Growth: "🚀",
  Revenue: "💰",
  Operations: "⚙️",
  Quality: "✅",
  Engineering: "💻",
  Strategy: "🧠",
};

const DEPT_COLORS: Record<string, string> = {
  Command: "#396AFF",
  Growth: "#41D4A8",
  Revenue: "#FFBB38",
  Operations: "#0891B2",
  Quality: "#FC68A2",
  Engineering: "#7B61FF",
  Strategy: "#F5A623",
};

function AgentModal({ agent, t, tasks, onClose }: { agent: MCAgent; t: any; tasks: any[]; onClose: () => void }) {
  const agentTasks = tasks.filter(ta => ta.assigned_agent === agent.name);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        style={{ background: t.card, borderRadius: 24, padding: 32, width: 480, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 48 }}>{agent.emoji}</div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text }}>{agent.name}</h2>
              <div style={{ fontSize: 13, color: t.text2 }}>{agent.role}</div>
              <div style={{ fontSize: 11, color: t.text3, marginTop: 2 }}>{agent.department}</div>
            </div>
          </div>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: t.bg, color: t.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>

        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, padding: "12px 16px", borderRadius: 14, background: `${STATUS_COLORS[agent.status] || "#B1B1B1"}15` }}>
          <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity }}
            style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_COLORS[agent.status] || "#B1B1B1" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: STATUS_COLORS[agent.status] || "#B1B1B1", textTransform: "capitalize" }}>{agent.status}</span>
          {agent.last_active && <span style={{ fontSize: 11, color: t.text3 }}>· {etRelative(agent.last_active)}</span>}
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Model", value: agent.model_used || "—" },
            { label: "Tokens Today", value: agent.tokens_today.toLocaleString() },
            { label: "Cost Today", value: `$${agent.cost_today.toFixed(3)}` },
          ].map(s => (
            <div key={s.label} style={{ background: t.bg, borderRadius: 12, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: t.text2, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Assigned tasks */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 10 }}>Tasks ({agentTasks.length})</h4>
          {agentTasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: t.text3, fontSize: 12 }}>No tasks assigned</div>
          ) : agentTasks.slice(0, 8).map(task => (
            <div key={task.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: t.bg, marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: t.text, fontWeight: 500 }}>{task.title}</div>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${t.primary}15`, color: t.primary, fontWeight: 600 }}>{task.status}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function AgentsPage() {
  const { agents, tasks, t, isDark, priv, loading } = useMC();
  const [selectedAgent, setSelectedAgent] = useState<MCAgent | null>(null);

  const depts = [...new Set(agents.map(a => a.department))];
  const totalCost = agents.reduce((s, a) => s + a.cost_today, 0);
  const totalTokens = agents.reduce((s, a) => s + a.tokens_today, 0);
  const activeCount = agents.filter(a => a.status === "active").length;

  return (
    <div style={{ padding: 24 }}>
      {/* Agent Detail Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentModal agent={selectedAgent} t={t} tasks={tasks} onClose={() => setSelectedAgent(null)} />
        )}
      </AnimatePresence>

      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text, marginBottom: 4 }}>🤖 Agents</h1>
      <p style={{ fontSize: 13, color: t.text2, marginBottom: 24 }}>14 AI agents across 5 departments</p>

      {/* AI Cost Intelligence Banner */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.purple})`, borderRadius: 20, padding: "20px 28px", marginBottom: 28, color: "#fff", display: "flex", alignItems: "center", gap: 40 }}>
        <div>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Total AI Cost Today</div>
          <div style={{ fontSize: 32, fontWeight: 800 }}>{priv(`$${totalCost.toFixed(3)}`)}</div>
        </div>
        <div style={{ width: 1, height: 50, background: "rgba(255,255,255,0.2)" }} />
        <div>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Tokens Used</div>
          <div style={{ fontSize: 32, fontWeight: 800 }}>{totalTokens.toLocaleString()}</div>
        </div>
        <div style={{ width: 1, height: 50, background: "rgba(255,255,255,0.2)" }} />
        <div>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Active / Total</div>
          <div style={{ fontSize: 32, fontWeight: 800 }}>{activeCount}<span style={{ fontSize: 18, opacity: 0.7 }}>/{agents.length}</span></div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <div style={{ fontSize: 48, opacity: 0.15 }}>🤖</div>
        </div>
      </motion.div>

      {/* By Department */}
      {depts.map((dept, di) => {
        const deptAgents = agents.filter(a => a.department === dept);
        const deptColor = DEPT_COLORS[dept] || t.primary;
        const deptIcon = DEPT_ICONS[dept] || "🏢";
        return (
          <motion.div key={dept}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: di * 0.08 }}
            style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: `${deptColor}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                {deptIcon}
              </div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: t.text2, textTransform: "uppercase", letterSpacing: 2 }}>{dept}</h3>
              <div style={{ height: 1, flex: 1, background: `${t.tableBorder}` }} />
              <span style={{ fontSize: 11, color: t.text3, fontWeight: 600 }}>{deptAgents.length} agents</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {deptAgents.map((a, ai) => (
                <motion.div key={a.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: di * 0.08 + ai * 0.05 }}
                  whileHover={{ y: -4, boxShadow: "0 12px 40px rgba(0,0,0,0.1)" }}
                  onClick={() => setSelectedAgent(a)}
                  style={{ background: t.card, borderRadius: 18, padding: "18px 20px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", border: `1px solid ${t.cardBorder}`, cursor: "pointer", transition: "box-shadow 0.2s" }}>
                  {/* Agent header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 36, width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", background: `${deptColor}12`, borderRadius: 14 }}>{a.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: t.text2 }}>{a.role}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity, delay: ai * 0.1 }}
                        style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_COLORS[a.status] || "#B1B1B1", boxShadow: a.status === "active" ? `0 0 8px ${STATUS_COLORS.active}` : "none" }} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_COLORS[a.status] || "#B1B1B1", textTransform: "capitalize" }}>{a.status}</span>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <div style={{ background: isDark ? t.sidebarHover : "#F8FAFC", borderRadius: 10, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, color: t.text3, marginBottom: 2 }}>MODEL</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.model_used || "—"}</div>
                    </div>
                    <div style={{ background: isDark ? t.sidebarHover : "#F8FAFC", borderRadius: 10, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, color: t.text3, marginBottom: 2 }}>TOKENS</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: t.primary }}>{a.tokens_today.toLocaleString()}</div>
                    </div>
                    <div style={{ background: isDark ? t.sidebarHover : "#F8FAFC", borderRadius: 10, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, color: t.text3, marginBottom: 2 }}>COST</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: t.teal }}>{priv(`$${a.cost_today.toFixed(3)}`)}</div>
                    </div>
                  </div>

                  {/* Tasks bar */}
                  {tasks.filter(ta => ta.assigned_agent === a.name).length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 10, color: t.text2 }}>
                      {tasks.filter(ta => ta.assigned_agent === a.name).length} task{tasks.filter(ta => ta.assigned_agent === a.name).length !== 1 ? "s" : ""} assigned
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
