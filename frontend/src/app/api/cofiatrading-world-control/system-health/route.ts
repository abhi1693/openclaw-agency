// Santé système LIVE pour le hub :3000 — surfacé dans la maison central_brain (drawer).
// source_tag: SYSTEM_HEALTH_HUB_3000_20260602
// Additif/lecture seule : curl les ports canon + lit cof_state + l'état coordination écrit par
// le sweep santé. Ne casse RIEN dans la map (route séparée). Hub UI = :3000 (§54), data = :8430.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOST = "http://127.0.0.1";
const SERVICES: { id: string; port: number; label: string }[] = [
  { id: "hub_backend", port: 8430, label: "Hub backend (API/data)" },
  { id: "central_brain_spine", port: 8430, label: "Central Brain spine /api/cb" },
  { id: "cofiapublisher", port: 8540, label: "CofiaPublisher" },
  { id: "lightrag", port: 9621, label: "LightRAG" },
  { id: "paperclip", port: 3100, label: "Paperclip" },
  { id: "rtk_proxy", port: 11435, label: "rtk-llm-proxy" },
];

async function probe(url: string): Promise<{ ok: boolean; code: number | null }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return { ok: r.status > 0 && r.status < 500, code: r.status };
  } catch {
    return { ok: false, code: null };
  }
}

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  const home = os.homedir();
  // 1) services live (probe ports)
  const services = await Promise.all(
    SERVICES.map(async (s) => {
      const ep = s.id === "central_brain_spine" ? `${HOST}:${s.port}/api/cb/health` : `${HOST}:${s.port}/`;
      const r = await probe(ep);
      return { ...s, status: r.ok ? "UP" : "DOWN", code: r.code };
    }),
  );
  const servicesUp = services.filter((s) => s.status === "UP").length;

  // 2) cof_state (source de vérité : MRR/VIP/cost/agents)
  const cof = await readJson(path.join(home, ".openclaw/state/cof_state/cof_state.json"));
  const cofAgeMin =
    cof && typeof cof.ts_epoch === "number" ? Math.round((Date.now() / 1000 - (cof.ts_epoch as number)) / 60) : null;

  // 3) état coordination (écrit par le sweep santé — restored services + archive surchauffe)
  const coord = await readJson(path.join(home, ".openclaw/state/system_coordination.json"));

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
          freshMin: cofAgeMin,
          mrr_eur: cof.mrr_eur ?? null,
          active_vip: cof.active_vip ?? null,
          cost_month_eur: cof.cost_month_eur ?? null,
          cost_budget_eur: cof.cost_budget_eur ?? null,
          cost_pct: cof.cost_pct ?? null,
          agents_alive: cof.agents_alive ?? null,
          agents_total: cof.agents_total ?? null,
        }
      : null,
    coordination: coord ?? { note: "system_coordination.json absent — lancer le sweep santé" },
    vpsFleetAgents: vpsAgents,
  });
}
