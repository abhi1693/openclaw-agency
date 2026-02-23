"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMC, STATUS_COLORS } from "../context";
import type { MCAgent } from "../types";

// Department layout positions for org chart
const DEPT_LAYOUT: Record<string, { x: number; y: number; agents: string[] }> = {
  Command: { x: 50, y: 0, agents: ["Jarvis"] },
  Growth: { x: 5, y: 180, agents: ["Scout", "Sage", "Ghost", "Atlas"] },
  Revenue: { x: 30, y: 180, agents: ["Blade", "Forge", "Ember"] },
  Operations: { x: 58, y: 180, agents: ["Vault", "Shield", "Prism", "Keeper"] },
  Quality: { x: 82, y: 180, agents: ["Sentinel"] },
  Engineering: { x: 92, y: 180, agents: ["Pixel"] },
};

const DEPT_COLORS: Record<string, string> = {
  Command: "#396AFF",
  Growth: "#41D4A8",
  Revenue: "#FFBB38",
  Operations: "#0891B2",
  Quality: "#FC68A2",
  Engineering: "#7B61FF",
};

const FLOW_LABELS = [
  { from: "Jarvis", to: "Scout", label: "keyword intel" },
  { from: "Jarvis", to: "Blade", label: "campaign briefs" },
  { from: "Jarvis", to: "Vault", label: "ops directives" },
  { from: "Jarvis", to: "Sentinel", label: "QA checkpoints" },
  { from: "Jarvis", to: "Pixel", label: "dev requests" },
  { from: "Scout", to: "Sage", label: "keyword data" },
  { from: "Sage", to: "Ghost", label: "content" },
  { from: "Blade", to: "Forge", label: "creative briefs" },
  { from: "Prism", to: "Jarvis", label: "analytics" },
  { from: "Ember", to: "Vault", label: "order data" },
];

function AgentNode({ agent, x, y, isSelected, onSelect, deptColor, t }: {
  agent: MCAgent; x: number; y: number; isSelected: boolean;
  onSelect: (a: MCAgent) => void; deptColor: string; t: any;
}) {
  const isJarvis = agent.name === "Jarvis";
  const size = isJarvis ? 80 : 64;
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
      style={{ cursor: "pointer" }}
      onClick={() => onSelect(agent)}>
      {/* Glow on selected */}
      {isSelected && (
        <circle cx={x} cy={y} r={size / 2 + 8} fill={deptColor} opacity={0.15} />
      )}
      {/* Status ring */}
      <motion.circle cx={x} cy={y} r={size / 2 + 3} fill="none" stroke={STATUS_COLORS[agent.status] || "#B1B1B1"} strokeWidth={2}
        animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
      {/* Agent circle */}
      <circle cx={x} cy={y} r={size / 2}
        fill={isSelected ? deptColor : (isJarvis ? "#1B1F3B" : t.card)}
        stroke={deptColor} strokeWidth={isJarvis ? 3 : 2} />
      {/* Emoji */}
      <text x={x} y={y + 6} textAnchor="middle" fontSize={isJarvis ? 28 : 22}>{agent.emoji}</text>
      {/* Name below */}
      <text x={x} y={y + size / 2 + 16} textAnchor="middle" fontSize={10} fontWeight="600" fill={t.text}>{agent.name}</text>
      <text x={x} y={y + size / 2 + 28} textAnchor="middle" fontSize={8} fill={t.text2}>{agent.status}</text>
    </motion.g>
  );
}

export default function OrgFlowPage() {
  const { agents, t, isDark } = useMC();
  const [selectedAgent, setSelectedAgent] = useState<MCAgent | null>(null);
  const [linesDrawn, setLinesDrawn] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setLinesDrawn(true), 400);
    return () => clearTimeout(timer);
  }, []);

  const W = 1200;
  const H = 600;

  // Build agent position map
  const agentPos: Record<string, { x: number; y: number }> = {};

  // Jarvis at center top
  const jarvis = agents.find(a => a.name === "Jarvis");
  agentPos["Jarvis"] = { x: W / 2, y: 90 };

  // Department groupings
  const deptGroups: Record<string, MCAgent[]> = {};
  agents.forEach(a => {
    if (a.name === "Jarvis") return;
    if (!deptGroups[a.department]) deptGroups[a.department] = [];
    deptGroups[a.department].push(a);
  });

  // Position departments evenly across the bottom
  const depts = Object.keys(deptGroups);
  const deptStartX = 80;
  const deptSpacing = (W - 160) / Math.max(depts.length - 1, 1);

  depts.forEach((dept, di) => {
    const deptCenterX = deptStartX + di * deptSpacing;
    const deptAgents = deptGroups[dept];
    const agentSpacing = 80;
    const startX = deptCenterX - ((deptAgents.length - 1) * agentSpacing) / 2;
    deptAgents.forEach((a, ai) => {
      agentPos[a.name] = { x: startX + ai * agentSpacing, y: 380 };
    });
  });

  // Render flow lines from Jarvis to dept "head" agents
  const renderLine = (from: string, to: string, label?: string, color = "#396AFF", dashArray?: string) => {
    const p1 = agentPos[from];
    const p2 = agentPos[to];
    if (!p1 || !p2) return null;

    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const d = `M ${p1.x} ${p1.y + 35} Q ${mx} ${my + 30} ${p2.x} ${p2.y - 35}`;

    return (
      <g key={`${from}-${to}`}>
        <motion.path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray={dashArray || "none"}
          opacity={0.5}
          initial={{ pathLength: 0 }}
          animate={linesDrawn ? { pathLength: 1 } : { pathLength: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }} />
        {label && (
          <text x={mx} y={my + 30} textAnchor="middle" fontSize={8} fill={t.text3}
            style={{ userSelect: "none" }}>{label}</text>
        )}
      </g>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text, marginBottom: 4 }}>🔀 Org Flow</h1>
      <p style={{ fontSize: 13, color: t.text2, marginBottom: 20 }}>Interactive org chart with live agent status & data flow visualization</p>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(DEPT_COLORS).map(([dept, color]) => (
          <div key={dept} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.text2 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
            {dept}
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.text2 }}>
          <div style={{ width: 10, height: 2, background: t.text3, opacity: 0.5 }} /> Data flow
        </div>
      </div>

      {/* SVG Org Chart */}
      <div style={{ background: t.card, borderRadius: 20, padding: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.04)", overflow: "auto" }}>
        <svg ref={svgRef} width={W} height={H} style={{ display: "block", maxWidth: "100%" }}
          viewBox={`0 0 ${W} ${H}`}>
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Flow lines: Jarvis to each dept's first agent */}
          {depts.map((dept, di) => {
            const deptAgents = deptGroups[dept];
            const headAgent = deptAgents[0];
            const headPos = agentPos[headAgent?.name];
            const jarvisPos = agentPos["Jarvis"];
            if (!headPos || !jarvisPos) return null;
            return renderLine("Jarvis", headAgent.name, dept.toLowerCase(), DEPT_COLORS[dept]);
          })}

          {/* Cross-agent flow lines */}
          {FLOW_LABELS.filter(fl => fl.from !== "Jarvis" && agentPos[fl.from] && agentPos[fl.to]).map(fl => (
            renderLine(fl.from, fl.to, fl.label, "#718EBF", "4 3")
          ))}

          {/* Department labels */}
          {depts.map((dept, di) => {
            const deptAgents = deptGroups[dept];
            const poses = deptAgents.map(a => agentPos[a.name]).filter(Boolean);
            if (poses.length === 0) return null;
            const cx = poses.reduce((s, p) => s + p.x, 0) / poses.length;
            const color = DEPT_COLORS[dept] || t.primary;
            return (
              <g key={dept}>
                <rect x={cx - 50} y={300} width={100} height={22} rx={11}
                  fill={`${color}20`} />
                <text x={cx} y={315} textAnchor="middle" fontSize={10} fontWeight="700" fill={color}>{dept}</text>
              </g>
            );
          })}

          {/* Agent nodes */}
          {jarvis && (
            <AgentNode key={jarvis.id} agent={jarvis}
              x={agentPos["Jarvis"]?.x || W / 2} y={agentPos["Jarvis"]?.y || 90}
              isSelected={selectedAgent?.id === jarvis.id}
              onSelect={setSelectedAgent}
              deptColor={DEPT_COLORS["Command"] || "#396AFF"}
              t={t} />
          )}
          {agents.filter(a => a.name !== "Jarvis").map(a => {
            const pos = agentPos[a.name];
            if (!pos) return null;
            const deptColor = DEPT_COLORS[a.department] || t.primary;
            return (
              <AgentNode key={a.id} agent={a} x={pos.x} y={pos.y}
                isSelected={selectedAgent?.id === a.id}
                onSelect={setSelectedAgent}
                deptColor={deptColor} t={t} />
            );
          })}
        </svg>
      </div>

      {/* Selected agent details */}
      <AnimatePresence>
        {selectedAgent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{ background: t.card, borderRadius: 20, padding: 24, marginTop: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.08)", border: `2px solid ${DEPT_COLORS[selectedAgent.department] || t.primary}40` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 40 }}>{selectedAgent.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: t.text }}>{selectedAgent.name}</div>
                <div style={{ fontSize: 13, color: t.text2 }}>{selectedAgent.role} · {selectedAgent.department}</div>
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 10, color: t.text3 }}>STATUS</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLORS[selectedAgent.status] || "#B1B1B1", textTransform: "capitalize" }}>{selectedAgent.status}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: t.text3 }}>MODEL</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{selectedAgent.model_used || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: t.text3 }}>TOKENS</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.primary }}>{selectedAgent.tokens_today.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: t.text3 }}>COST TODAY</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.teal }}>${selectedAgent.cost_today.toFixed(3)}</div>
                </div>
              </div>
              <button onClick={() => setSelectedAgent(null)}
                style={{ padding: "8px 16px", borderRadius: 50, border: `1px solid ${t.inputBorder}`, background: "transparent", color: t.text2, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
