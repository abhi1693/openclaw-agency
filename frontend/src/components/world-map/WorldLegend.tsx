"use client";

/**
 * WorldLegend — status colour legend. Status is never conveyed by colour alone;
 * each chip carries its text label too (a11y).
 */

import { STATUS_TOKEN } from "./config/worldAssets";
import type { WorldEntityStatus } from "./types/worldMap.types";

const ORDER: WorldEntityStatus[] = [
  "online",
  "active",
  "available",
  "monitoring",
  "idle",
  "pending",
  "alert",
  "offline",
];

export interface WorldLegendProps {
  className?: string;
}

export function WorldLegend({ className }: WorldLegendProps) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className ?? ""}`} aria-label="Légende des statuts">
      {ORDER.map((status) => {
        const token = STATUS_TOKEN[status];
        return (
          <li key={status} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: token.color, boxShadow: `0 0 6px ${token.glow}` }} />
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{token.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
