"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "@/lib/i18n";

export type GraphNode = {
  id: string;
  name: string;
  status: string;
  gateway_id: string | null;
};

export type GraphEdge = {
  from_agent_id: string;
  to_agent_id: string;
  weight: number;
  interaction_count: number;
};

type NodeWithPos = GraphNode & { x: number; y: number; vx: number; vy: number };

const STATUS_COLORS: Record<string, string> = {
  active: "#16a34a",
  provisioning: "#d97706",
  paused: "#6b7280",
  retired: "#dc2626",
  offline: "#94a3b8",
};

function runForceSimulation(
  nodes: NodeWithPos[],
  edges: GraphEdge[],
  width: number,
  height: number,
): NodeWithPos[] {
  const result: NodeWithPos[] = nodes.map((n) => ({ ...n }));
  const iterations = 80;
  const repulsion = 3500;
  const attraction = 0.04;
  const damping = 0.8;

  for (let i = 0; i < iterations; i++) {
    // Repulsion between all nodes
    for (let a = 0; a < result.length; a++) {
      for (let b = a + 1; b < result.length; b++) {
        const na = result[a]!;
        const nb = result[b]!;
        const dx = na.x - nb.x;
        const dy = na.y - nb.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        na.vx += fx;
        na.vy += fy;
        nb.vx -= fx;
        nb.vy -= fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const from = result.find((n) => n.id === edge.from_agent_id);
      const to = result.find((n) => n.id === edge.to_agent_id);
      if (!from || !to) continue;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      from.vx += dx * attraction;
      from.vy += dy * attraction;
      to.vx -= dx * attraction;
      to.vy -= dy * attraction;
    }

    // Apply velocity with damping, clamp to bounds
    for (const node of result) {
      node.vx *= damping;
      node.vy *= damping;
      node.x = Math.max(30, Math.min(width - 30, node.x + node.vx));
      node.y = Math.max(30, Math.min(height - 30, node.y + node.vy));
    }
  }

  return result;
}

export function AgentCommunicationGraph({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    if (nodes.length === 0) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(t("commandCenter.noGraphData"), width / 2, height / 2);
      return;
    }

    // Seed random positions in a circle
    const radius = Math.min(width, height) * 0.35;
    const cx = width / 2;
    const cy = height / 2;
    const nodePositions: NodeWithPos[] = nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      return {
        ...node,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      };
    });

    const settled = runForceSimulation(nodePositions, edges, width, height);

    // Render
    ctx.clearRect(0, 0, width, height);

    // Draw edges
    const maxWeight = Math.max(...edges.map((e) => e.weight), 1);
    for (const edge of edges) {
      const from = settled.find((n) => n.id === edge.from_agent_id);
      const to = settled.find((n) => n.id === edge.to_agent_id);
      if (!from || !to) continue;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      const alpha = 0.15 + (edge.weight / maxWeight) * 0.55;
      ctx.strokeStyle = `rgba(37, 99, 235, ${alpha})`;
      ctx.lineWidth = 1 + (edge.weight / maxWeight) * 3;
      ctx.stroke();
    }

    // Draw nodes
    const NODE_R = 14;
    for (const node of settled) {
      const color = STATUS_COLORS[node.status] ?? "#94a3b8";
      ctx.beginPath();
      ctx.arc(node.x, node.y, NODE_R, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      const label =
        node.name.length > 14 ? `${node.name.slice(0, 14)}…` : node.name;
      ctx.fillText(label, node.x, node.y + NODE_R + 14);
    }
  }, [nodes, edges, t]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <canvas
        ref={canvasRef}
        width={700}
        height={340}
        className="w-full"
        style={{ maxHeight: 340 }}
      />
    </div>
  );
}
