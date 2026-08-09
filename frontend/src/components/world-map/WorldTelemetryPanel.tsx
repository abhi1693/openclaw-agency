"use client";

/**
 * WorldTelemetryPanel — network-wide telemetry roll-up. Honest source badge:
 * SIMULÉ (amber) vs LIVE (emerald) so a simulated feed is never read as real.
 */

import { useMemo } from "react";

import { useWorldMap } from "./hooks/useWorldMap";
import { useWorldTelemetry } from "./hooks/useWorldTelemetry";

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-900/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: accent ?? "#e2e8f0" }}>
        {value}
      </div>
    </div>
  );
}

export function WorldTelemetryPanel() {
  const { agents, houses, links, telemetry } = useWorldMap();
  const { source, lastUpdated, refresh } = useWorldTelemetry();

  const agg = useMemo(() => {
    let signals = 0;
    let accSum = 0;
    for (const a of agents) {
      const t = telemetry?.agents[a.id] ?? a.metrics;
      signals += t.signals ?? 0;
      accSum += t.accuracy ?? 0;
    }
    let activeHouses = 0;
    for (const h of houses) {
      const t = telemetry?.houses[h.id] ?? h.metrics;
      if ((t.activity ?? 0) > 55) activeHouses += 1;
    }
    let healthSum = 0;
    for (const l of links) {
      healthSum += telemetry?.links[l.id]?.health ?? (l.health ?? l.strength) * 100;
    }
    return {
      signals,
      avgAccuracy: agents.length ? Math.round(accSum / agents.length) : 0,
      activeHouses,
      totalHouses: houses.length,
      netHealth: links.length ? Math.round(healthSum / links.length) : 0,
    };
  }, [agents, houses, links, telemetry]);

  const isLive = source === "live" || source === "registry";
  const updated = lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "—";

  return (
    <section className="rounded-xl border border-slate-700/50 bg-slate-950/60 p-3 backdrop-blur">
      <header className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Télémétrie réseau</h3>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{
            color: isLive ? "#34d399" : "#f59e0b",
            backgroundColor: isLive ? "rgba(52,211,153,0.12)" : "rgba(245,158,11,0.12)",
            border: `1px solid ${isLive ? "rgba(52,211,153,0.4)" : "rgba(245,158,11,0.4)"}`,
          }}
        >
          {isLive ? "Live" : "Simulé"}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Signaux" value={String(agg.signals)} accent="#00B9FF" />
        <Stat label="Précision moy." value={`${agg.avgAccuracy}%`} accent="#34d399" />
        <Stat label="Maisons actives" value={`${agg.activeHouses}/${agg.totalHouses}`} accent="#a78bfa" />
        <Stat label="Santé réseau" value={`${agg.netHealth}%`} accent="#22d3ee" />
      </div>

      <footer className="mt-2.5 flex items-center justify-between text-[10px] text-slate-500">
        <span>Maj {updated}</span>
        <button type="button" onClick={refresh} className="rounded px-2 py-0.5 text-cyan-300 transition hover:bg-cyan-400/10 hover:text-cyan-100">
          Rafraîchir
        </button>
      </footer>
    </section>
  );
}
