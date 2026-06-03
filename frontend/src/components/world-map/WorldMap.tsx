"use client";

/**
 * WorldMap — top-level composition. Wraps everything in the provider and lays
 * out the header, the living canvas, the telemetry roll-up and the console.
 * Responsive: console docks right on desktop, stacks below on mobile.
 */

import { WorldConsole } from "./WorldConsole";
import { WorldLegend } from "./WorldLegend";
import { MMrDashboardCard } from "./MMrDashboardCard";
import { WorldMapCanvas } from "./WorldMapCanvas";
import { WorldMapProvider } from "./WorldMapProvider";
import { WorldTelemetryPanel } from "./WorldTelemetryPanel";
import { useWorldMap } from "./hooks/useWorldMap";
import type { WorldMapConfig } from "./types/worldMap.types";

function WorldMapHeader() {
  const { config, houses, agents, links } = useWorldMap();
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950/80 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
        </span>
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-white">
            {config.meta.brand} <span className="text-cyan-300">World Map</span>
          </h1>
          <p className="text-[11px] text-slate-500">
            {houses.length} maisons · {agents.length} agents · {links.length} liens ·{" "}
            <span className="uppercase tracking-wide text-slate-400">{config.meta.mode}</span>
          </p>
        </div>
      </div>
      <WorldLegend className="hidden md:flex" />
    </header>
  );
}

export interface WorldMapProps {
  config?: WorldMapConfig;
  /** Pull real house statuses from the registry proxy (default true). */
  live?: boolean;
}

export function WorldMap({ config, live = true }: WorldMapProps) {
  return (
    <WorldMapProvider config={config} live={live}>
      <div className="flex h-screen w-full flex-col bg-[#02040a] text-slate-200">
        <WorldMapHeader />
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <main className="relative min-h-0 flex-[3] lg:flex-1">
            <WorldMapCanvas />
          </main>
          <aside className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-t border-slate-800/80 p-3 lg:w-[372px] lg:flex-none lg:border-l lg:border-t-0">
            <WorldTelemetryPanel />
            <div className="min-h-[320px] flex-1">
              <WorldConsole />
            </div>
          </aside>
        </div>
      </div>
    </WorldMapProvider>
  );
}

export default WorldMap;
