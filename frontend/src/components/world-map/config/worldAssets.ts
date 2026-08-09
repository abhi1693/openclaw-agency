/**
 * CofiaTrading World Map — Asset registry + visual tokens.
 *
 * Centralises every visual reference so the renderer never hardcodes a path or
 * a colour. Real PNG/SVG assets can be dropped into `/public/assets/world/**`
 * later; until then the renderer draws stylised SVG nodes and uses the glyph +
 * colour tokens below. `resolveAsset()` returns a path with graceful fallback.
 */

import type {
  WorldAgentRank,
  WorldEntityStatus,
  WorldHouseType,
  WorldZoneType,
} from "../types/worldMap.types";

export const WORLD_ASSET_BASE = "/assets/world";

export const worldAssets = {
  map: {
    id: "cofiatrading-world-map",
    src: `${WORLD_ASSET_BASE}/map/world-map.svg`,
    fallback: `${WORLD_ASSET_BASE}/map/world-map.png`,
  },
  houses: {
    headquarters: `${WORLD_ASSET_BASE}/houses/hq.png`,
    centralBrain: `${WORLD_ASSET_BASE}/houses/central-brain.png`,
    ironOffice: `${WORLD_ASSET_BASE}/houses/iron-office.png`,
    vipGate: `${WORLD_ASSET_BASE}/houses/vip-gate.png`,
    signalTower: `${WORLD_ASSET_BASE}/houses/signal-tower.png`,
    youtubeStudio: `${WORLD_ASSET_BASE}/houses/youtube-studio.png`,
    seoLab: `${WORLD_ASSET_BASE}/houses/seo-lab.png`,
    academy: `${WORLD_ASSET_BASE}/houses/academy.png`,
    observatory: `${WORLD_ASSET_BASE}/houses/observatory.png`,
    library: `${WORLD_ASSET_BASE}/houses/library.png`,
    calendar: `${WORLD_ASSET_BASE}/houses/calendar.png`,
    compliance: `${WORLD_ASSET_BASE}/houses/compliance.png`,
    barracks: `${WORLD_ASSET_BASE}/houses/barracks.png`,
    factory: `${WORLD_ASSET_BASE}/houses/factory.png`,
    warehouse: `${WORLD_ASSET_BASE}/houses/warehouse.png`,
  },
  agents: {
    sovereign: `${WORLD_ASSET_BASE}/agents/sovereign.png`,
    manager: `${WORLD_ASSET_BASE}/agents/manager.png`,
    trader: `${WORLD_ASSET_BASE}/agents/trader.png`,
    analyst: `${WORLD_ASSET_BASE}/agents/analyst.png`,
    riskManager: `${WORLD_ASSET_BASE}/agents/risk-manager.png`,
    signalAgent: `${WORLD_ASSET_BASE}/agents/signal-agent.png`,
    operator: `${WORLD_ASSET_BASE}/agents/operator.png`,
    marketer: `${WORLD_ASSET_BASE}/agents/marketer.png`,
    guardian: `${WORLD_ASSET_BASE}/agents/guardian.png`,
    voice: `${WORLD_ASSET_BASE}/agents/voice.png`,
  },
  effects: {
    glow: `${WORLD_ASSET_BASE}/effects/glow.svg`,
    pulse: `${WORLD_ASSET_BASE}/effects/pulse.svg`,
    routeLine: `${WORLD_ASSET_BASE}/effects/route-line.svg`,
    nodeHalo: `${WORLD_ASSET_BASE}/effects/node-halo.svg`,
  },
} as const;

export type WorldHouseAssetKey = keyof typeof worldAssets.houses;
export type WorldAgentAssetKey = keyof typeof worldAssets.agents;

/** Returns the asset path or the provided fallback when the key is unknown. */
export function resolveHouseAsset(key: string): string {
  return (worldAssets.houses as Record<string, string>)[key] ?? worldAssets.map.fallback;
}

export function resolveAgentAsset(key: string): string {
  return (worldAssets.agents as Record<string, string>)[key] ?? worldAssets.map.fallback;
}

/* ───────────────────────── Visual tokens (canon palette) ─────────────────────────
 * Navy #051026 · Electric Blue #0066FF · Flow Cyan #00B9FF · Silver.
 * Status colours are accessible (paired with text/badge, never colour-only). */

export interface StatusToken {
  label: string;
  /** Solid dot / ring colour. */
  color: string;
  /** Soft glow colour (rgba). */
  glow: string;
  /** Whether this status should pulse. */
  pulse: boolean;
}

export const STATUS_TOKEN: Record<WorldEntityStatus, StatusToken> = {
  online: { label: "Online", color: "#34d399", glow: "rgba(52,211,153,0.45)", pulse: false },
  active: { label: "Active", color: "#00B9FF", glow: "rgba(0,185,255,0.50)", pulse: true },
  available: { label: "Available", color: "#0066FF", glow: "rgba(0,102,255,0.45)", pulse: false },
  monitoring: { label: "Monitoring", color: "#a78bfa", glow: "rgba(167,139,250,0.45)", pulse: true },
  idle: { label: "Idle", color: "#64748b", glow: "rgba(100,116,139,0.30)", pulse: false },
  pending: { label: "Pending", color: "#f59e0b", glow: "rgba(245,158,11,0.45)", pulse: true },
  alert: { label: "Alert", color: "#fb7185", glow: "rgba(251,113,133,0.55)", pulse: true },
  offline: { label: "Offline", color: "#475569", glow: "rgba(71,85,105,0.20)", pulse: false },
};

/** Glyphs used by the SVG renderer until real raster assets are supplied. */
export const HOUSE_GLYPH: Record<WorldHouseType, string> = {
  headquarters: "★",
  intelligence: "◈",
  revenue: "€",
  gateway: "⬡",
  trading: "▲",
  content: "▶",
  education: "✦",
  infrastructure: "⬢",
  compliance: "⚖",
  warehouse: "▣",
};

export const RANK_GLYPH: Record<WorldAgentRank, string> = {
  sovereign: "♛",
  manager: "♜",
  lead: "♞",
  senior: "●",
  core: "•",
  support: "◦",
};

export const ZONE_ACCENT: Record<WorldZoneType, string> = {
  operations: "#00B9FF",
  revenue: "#facc15",
  content: "#f97316",
  trading: "#34d399",
  intelligence: "#a78bfa",
  infrastructure: "#22d3ee",
};

export const LINK_COLOR: Record<string, string> = {
  assignment: "#38bdf8",
  data: "#22d3ee",
  command: "#0066FF",
  alert: "#fb7185",
  network: "#64748b",
};
