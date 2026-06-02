// VPS Fleet endpoint — 11 agents d'analyse offloadés sur le VPS Hostinger (libère le Mac).
// source_tag: VPS_FLEET_OFFLOAD_PANEL_V1_20260602
// Owner: cof-agent-orchestrator.timer (systemd VPS, 1 agent/cycle, load-gardé ≤4)
// Lit le mirror local ~/.openclaw/vps-mirror/orders/<agent>.jsonl (rapatrié toutes les 5 min par
// com.coftrading.vps-fleet-pull). Statut LIVE dérivé du dernier order "done" = vrai signal de vie.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FALLBACK_AGENTS = [
  "analyste", "quant", "lab", "stratege", "oracle", "fiscal",
  "juriste", "reviewer", "copywriter", "risk", "mirofish",
];
const AGENTS_CONFIG = path.join(os.homedir(), ".openclaw/config/vps_fleet_agents.json");
const MIRROR_DIR = path.join(os.homedir(), ".openclaw/vps-mirror/orders");

// SOURCE UNIQUE des agents VPS — même JSON que l'orchestrateur + le puller (zéro drift).
// Lue par requête (force-dynamic) → ajouter un agent au JSON ne nécessite PAS de rebuild.
async function loadAgents(): Promise<string[]> {
  try {
    const raw = await fs.readFile(AGENTS_CONFIG, "utf-8");
    const data = JSON.parse(raw) as { agents?: unknown } | unknown[];
    const lst = Array.isArray(data) ? data : (data as { agents?: unknown }).agents;
    if (Array.isArray(lst) && lst.length) return lst.map(String);
  } catch {
    // config absente → fallback
  }
  return FALLBACK_AGENTS;
}

type FleetAgent = { id: string; live: boolean; lastResult: string | null; ts: string | null };

async function readAgent(id: string): Promise<FleetAgent> {
  const p = path.join(MIRROR_DIR, `${id}.jsonl`);
  try {
    const raw = await fs.readFile(p, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(lines[i]) as Record<string, unknown>;
      } catch {
        continue;
      }
      const result = (d.result ?? d.output) as string | undefined;
      if (d.status === "done" && result) {
        return {
          id,
          live: true,
          lastResult: String(result).slice(0, 260),
          ts: (d.updated ?? d.ts ?? d.created ?? null) as string | null,
        };
      }
    }
  } catch {
    // pas de mirror pour cet agent (rotation pas encore passée) → en attente
  }
  return { id, live: false, lastResult: null, ts: null };
}

export async function GET() {
  try {
    const fleetAgents = await loadAgents();
    const agents = await Promise.all(fleetAgents.map((a) => readAgent(a)));
    const liveCount = agents.filter((a) => a.live).length;

    let mirrorMtime: string | null = null;
    try {
      const files = await fs.readdir(MIRROR_DIR);
      let newest = 0;
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const st = await fs.stat(path.join(MIRROR_DIR, f));
        if (st.mtimeMs > newest) newest = st.mtimeMs;
      }
      if (newest > 0) mirrorMtime = new Date(newest).toISOString();
    } catch {
      // dossier mirror absent
    }

    return NextResponse.json({
      ok: true,
      sourceTag: "VPS_FLEET_OFFLOAD_PANEL_V1_20260602",
      host: "srv1509602.hstgr.cloud · 187.124.44.173 · Hostinger KVM2 · 2 CPU",
      orchestrator: "cof-agent-orchestrator.timer (systemd · 1 agent/cycle · load-gardé ≤4)",
      llm: "OpenRouter deepseek-v4-flash via shim :11435 (§15 non-Anthropic)",
      pullback: "com.coftrading.vps-fleet-pull (300s) → ~/.openclaw/vps-mirror/",
      total: VPS_AGENTS.length,
      liveCount,
      mirrorMtime,
      agents,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      total: VPS_AGENTS.length,
      liveCount: 0,
      agents: [] as FleetAgent[],
    });
  }
}
