/**
 * CofiaTrading World Map — telemetry.
 *
 * Two clearly separated sources, never conflated (honesty-by-design):
 *  • `generateTelemetrySnapshot` — SIMULATED metrics that drift smoothly so the
 *    map looks alive immediately, always tagged `source: "simulated"`.
 *  • `fetchLiveHouseStatuses`    — REAL house statuses pulled from the existing
 *    server proxy `/api/cofiatrading-world-control/registry`. Best-effort: on
 *    any failure or unrecognised shape it returns `{}` (never fabricates).
 *
 * To wire real per-metric values later, extend `fetchLiveHouseStatuses` (or add
 * a sibling) to read `/api/cofiatrading-world-control/house-kpis` and map the
 * fields onto `WorldHouseMetrics` — see the report for the exact contract.
 */

import type {
  WorldAgentMetrics,
  WorldEntityStatus,
  WorldHouseMetrics,
  WorldLinkTelemetry,
  WorldMapConfig,
  WorldTelemetrySnapshot,
} from "../types/worldMap.types";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Drift a value around a baseline; pulls gently back toward `base`. */
function drift(base: number, prev: number | undefined, min: number, max: number, volatility: number): number {
  const from = prev ?? base;
  const noise = (Math.random() - 0.5) * 2 * volatility;
  const pull = (base - from) * 0.12; // mean-reversion toward seed
  return Math.round(clamp(from + noise + pull, min, max));
}

/**
 * Simulated snapshot. Pass the previous snapshot to get smooth, lively drift
 * instead of independent jitter every tick.
 */
export function generateTelemetrySnapshot(
  config: WorldMapConfig,
  prev: WorldTelemetrySnapshot | null = null,
  now: number = Date.now(),
): WorldTelemetrySnapshot {
  const agents: Record<string, WorldAgentMetrics> = {};
  const houses: Record<string, WorldHouseMetrics> = {};
  const links: Record<string, WorldLinkTelemetry> = {};

  for (const agent of config.agents) {
    const p = prev?.agents[agent.id];
    agents[agent.id] = {
      signals: drift(agent.metrics.signals, p?.signals, 0, 99, 3),
      accuracy: drift(agent.metrics.accuracy, p?.accuracy, 60, 100, 1.5),
      responseTime: drift(agent.metrics.responseTime, p?.responseTime, 60, 400, 12),
      load: drift(agent.metrics.load ?? 50, p?.load, 0, 100, 5),
    };
  }

  for (const house of config.houses) {
    const p = prev?.houses[house.id];
    houses[house.id] = {
      activity: drift(house.metrics.activity, p?.activity, 0, 100, 4),
      latency: drift(house.metrics.latency, p?.latency, 5, 200, 6),
      load: drift(house.metrics.load, p?.load, 0, 100, 5),
      agents: config.agents.filter((a) => a.homeId === house.id).length,
    };
  }

  for (const link of config.links) {
    const p = prev?.links[link.id];
    const baseIntensity = link.strength * 100;
    links[link.id] = {
      intensity: drift(baseIntensity, p?.intensity, 0, 100, 6),
      health: drift((link.health ?? link.strength) * 100, p?.health, 0, 100, 3),
      frequency: drift(baseIntensity * 0.6, p?.frequency, 0, 100, 8),
    };
  }

  return { ts: now, source: "simulated", agents, houses, links };
}

/* ───────────────────────────── Live status adapter ───────────────────────────── */

const REGISTRY_ENDPOINT = "/api/cofiatrading-world-control/registry";

/** Normalises various registry status tokens to a WorldEntityStatus. */
function normaliseStatus(raw: unknown): WorldEntityStatus | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.toLowerCase();
  if (["online", "up", "live", "green", "healthy", "ok"].includes(t)) return "online";
  if (["active", "running", "busy"].includes(t)) return "active";
  if (["monitoring", "degraded", "amber", "warn", "warning"].includes(t)) return "monitoring";
  if (["idle", "standby", "sleep", "on_demand"].includes(t)) return "idle";
  if (["pending", "starting", "boot"].includes(t)) return "pending";
  if (["alert", "error", "red", "critical", "fail", "failed"].includes(t)) return "alert";
  if (["offline", "down", "dead", "stopped"].includes(t)) return "offline";
  return undefined;
}

/** Recursively collect {houseId -> status} pairs for ids we recognise. */
function harvestStatuses(node: unknown, known: Set<string>, out: Record<string, WorldEntityStatus>): void {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) harvestStatuses(item, known, out);
    return;
  }

  const obj = node as Record<string, unknown>;
  const id = (obj.id ?? obj.slug ?? obj.house ?? obj.key ?? obj.name) as unknown;
  if (typeof id === "string" && known.has(id)) {
    const status = normaliseStatus(obj.status ?? obj.state ?? obj.health);
    if (status) out[id] = status;
  }

  // Object keyed by houseId -> value(status string or object)
  for (const [k, v] of Object.entries(obj)) {
    if (known.has(k)) {
      const direct = normaliseStatus(v);
      if (direct) out[k] = direct;
      else if (v && typeof v === "object") harvestStatuses(v, known, out);
    } else if (v && typeof v === "object") {
      harvestStatuses(v, known, out);
    }
  }
}

/**
 * Best-effort real house statuses from the existing server proxy.
 * Returns `{}` on any network error or unrecognised payload — never throws,
 * never invents a status for a house it didn't actually see.
 */
export async function fetchLiveHouseStatuses(
  config: WorldMapConfig,
  signal?: AbortSignal,
): Promise<Record<string, WorldEntityStatus>> {
  try {
    const res = await fetch(REGISTRY_ENDPOINT, { signal, cache: "no-store" });
    if (!res.ok) return {};
    const data: unknown = await res.json();
    const known = new Set(config.houses.map((h) => h.id));
    const out: Record<string, WorldEntityStatus> = {};
    harvestStatuses(data, known, out);
    return out;
  } catch {
    return {};
  }
}
