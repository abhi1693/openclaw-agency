// Santé système LIVE pour le hub :3000 — surfacé dans la maison central_brain (drawer).
// source_tag: SYSTEM_HEALTH_HUB_3000_20260602
// Additif/lecture seule : curl les ports canon + lit cof_state + l'état coordination écrit par
// le sweep santé. Ne casse RIEN dans la map (route séparée). Hub UI = :3000 (§54), data = :8430.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readLocalRevenue } from "../_lib/localRevenue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOST = "http://127.0.0.1";
const SERVICES: { id: string; port: number; path: string; label: string }[] = [
  { id: "hub_backend", port: 8430, path: "/health", label: "Hub backend (API/data)" },
  { id: "central_brain_spine", port: 8767, path: "/api/central-brain/registry", label: "Central Brain registry" },
  { id: "cofiapublisher", port: 8540, path: "/health", label: "CofiaPublisher" },
  { id: "lightrag", port: 9621, path: "/health", label: "LightRAG" },
  { id: "paperclip", port: 3100, path: "/", label: "Paperclip" },
  { id: "rtk_proxy", port: 11435, path: "/health", label: "rtk-llm-proxy" },
];

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

async function probe(url: string): Promise<{ ok: boolean; code: number | null }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return { ok: r.status >= 200 && r.status < 400, code: r.status };
  } catch {
    return { ok: false, code: null };
  }
}

async function readJson(p: string): Promise<JsonRecord | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as JsonRecord;
  } catch {
    return null;
  }
}

export async function GET() {
  const home = os.homedir();
  // 1) services live (probe ports)
  const services = await Promise.all(
    SERVICES.map(async (s) => {
      const ep = `${HOST}:${s.port}${s.path}`;
      const r = await probe(ep);
      return { ...s, endpoint: ep, status: r.ok ? "UP" : "DOWN", code: r.code };
    }),
  );
  const servicesUp = services.filter((s) => s.status === "UP").length;

  // 2) cof_state (source de vérité : MRR/VIP/cost/agents)
  const cofPath = path.join(home, ".openclaw/state/cof_state/cof_state.json");
  const cof = await readJson(cofPath);
  const cofMeta = asRecord(cof?.meta);
  const hubHome = asRecord(cof?.hub_home);
  const revenue = asRecord(hubHome.revenue);
  const cost = asRecord(hubHome.cost);
  const agentsSummary = asRecord(hubHome.agents_summary);
  const cofTsUtc = stringOrNull(cofMeta.ts_utc);
  const cofTsMs = cofTsUtc ? Date.parse(cofTsUtc) : NaN;
  const cofAgeMin = Number.isFinite(cofTsMs) ? Math.max(0, Math.round((Date.now() - cofTsMs) / 60000)) : null;

  // 3) état coordination (écrit par le sweep santé — restored services + archive surchauffe)
  const coord = await readJson(path.join(home, ".openclaw/state/system_coordination.json"));

  // 3b) revenu courant : readLocalRevenue garde cof_state brut + overlay backend local :8000 si disponible.
  const revenueResult = await readLocalRevenue();
  const revenueCurrent = asRecord(revenueResult.data);

  // 4) flotte VPS (réutilise le mirror)
  const vpsCfg = await readJson(path.join(home, ".openclaw/config/vps_fleet_agents.json"));
  const vpsAgents = Array.isArray((vpsCfg as { agents?: unknown })?.agents)
    ? ((vpsCfg as { agents: unknown[] }).agents.length as number)
    : null;

  return NextResponse.json({
    ok: true,
    sourceTag: "SYSTEM_HEALTH_HUB_3000_20260602",
    fetchedAt: new Date().toISOString(),
    services,
    servicesUp,
    servicesTotal: services.length,
    cofState: cof
      ? {
          sourcePath: cofPath,
          ts_utc: cofTsUtc,
          freshMin: cofAgeMin,
          sections_ok: numberOrNull(cofMeta.sections_ok),
          sections_total: numberOrNull(cofMeta.sections_total),
          stale_sections: stringArray(cofMeta.stale_sections),
          mrr_eur: numberOrNull(revenue.mrr_eur),
          active_vip: numberOrNull(revenue.active_vip),
          cost_month_eur: numberOrNull(cost.month_eur),
          cost_budget_eur: numberOrNull(cost.budget_monthly_eur),
          cost_pct: numberOrNull(cost.pct_used),
          agents_alive: numberOrNull(agentsSummary.alive),
          agents_total: numberOrNull(agentsSummary.total),
          agents_blocked: numberOrNull(agentsSummary.blocked),
        }
      : null,
    revenueCurrent: revenueResult.ok
      ? {
          sourceTag: stringOrNull(revenueCurrent.source_tag),
          readUtc: stringOrNull(revenueCurrent.read_utc),
          stripeOverlayOk: booleanOrNull(revenueCurrent.stripe_overlay_ok),
          stripeOverlayReadUtc: stringOrNull(revenueCurrent.stripe_overlay_read_utc),
          mrr_eur: numberOrNull(revenueCurrent.mrr_eur),
          active_vip: numberOrNull(revenueCurrent.active_vip),
          cof_state_mrr_eur: numberOrNull(revenueCurrent.cof_state_mrr_eur),
          cof_state_active_vip: numberOrNull(revenueCurrent.cof_state_active_vip),
          backend_8000_mrr_eur: numberOrNull(revenueCurrent.backend_8000_mrr_eur),
          backend_8000_active_vip: numberOrNull(revenueCurrent.backend_8000_active_vip),
          revenue_delta_mrr_eur: numberOrNull(revenueCurrent.revenue_delta_mrr_eur),
          revenue_delta_active_vip: numberOrNull(revenueCurrent.revenue_delta_active_vip),
          revenue_consistency: stringOrNull(revenueCurrent.revenue_consistency),
        }
      : {
          error: revenueResult.error ?? "LOCAL_REVENUE_UNAVAILABLE",
        },
    coordination: coord ?? { note: "system_coordination.json absent — lancer le sweep santé" },
    vpsFleetAgents: vpsAgents,
  });
}
