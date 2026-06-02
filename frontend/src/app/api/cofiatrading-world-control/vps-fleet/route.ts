// VPS Fleet endpoint — agents d'analyse offloadés sur le VPS Hostinger.
// source_tag: VPS_FLEET_OFFLOAD_PANEL_V1_20260602
// Owner: cof-agent-orchestrator.timer (systemd VPS, 1 agent/cycle, load-gardé ≤4)
// Lit le mirror local ~/.openclaw/vps-mirror/orders/<agent>.jsonl (rapatrié toutes les 5 min par
// com.coftrading.vps-fleet-pull). Statut LIVE uniquement si dernier order "done" est frais.

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
const LIVE_TTL_MS = 15 * 60 * 1000;
// L'orchestrateur tourne 1 agent/~40s → rotation complète des 24 ≈ 16 min. Un agent "done" il y a
// 15-35 min n'est donc PAS en panne : il attend simplement son tour (ROTATING). Au-delà de 2 cycles
// (35 min) sans repasser = vrai retard (STALE). Sépare la file d'attente normale d'un agent bloqué.
const ROTATION_TTL_MS = 35 * 60 * 1000;
const MIRROR_TTL_MS = 10 * 60 * 1000;

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

type FleetStatus =
  | "LIVE" // done frais <=15min
  | "ROTATING" // done 15-35min : attend son tour dans la rotation, normal
  | "STALE" // done >35min : vrai retard
  | "RUNNING" // dernière ligne pending/started : exécution en cours
  | "FAILED" // dernière ligne failed : agent en erreur (budget, LLM, etc.)
  | "WAITING" // aucun order encore
  | "AMBER_REVERIFY"; // done mais timestamp absent

type FleetAgent = {
  id: string;
  live: boolean;
  status: FleetStatus;
  lastResult: string | null;
  lastError: string | null; // message d'erreur si la dernière ligne est failed — NE PLUS masquer
  rawStatus: string | null; // statut brut de la toute dernière ligne (done/failed/pending)
  ts: string | null;
  ageSec: number | null;
  proof: string;
};

const parseTimeMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

async function readAgent(id: string): Promise<FleetAgent> {
  const p = path.join(MIRROR_DIR, `${id}.jsonl`);
  try {
    const st = await fs.stat(p);
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
        const doneMs = parseTimeMs(d.updated ?? d.ts ?? d.created);
        if (!doneMs) {
          return {
            id,
            live: false,
            status: "AMBER_REVERIFY",
            lastResult: String(result).slice(0, 260),
            ts: null,
            ageSec: null,
            proof: `${p} · status=done mais timestamp absent; mtime=${st.mtime.toISOString()}`,
          };
        }
        const ageMs = Date.now() - doneMs;
        const live = ageMs >= 0 && ageMs <= LIVE_TTL_MS;
        return {
          id,
          live,
          status: live ? "LIVE" : "STALE",
          lastResult: String(result).slice(0, 260),
          ts: new Date(doneMs).toISOString(),
          ageSec: Math.max(0, Math.round(ageMs / 1000)),
          proof: `${p} · status=done · ts=${new Date(doneMs).toISOString()} · ageSec=${Math.max(0, Math.round(ageMs / 1000))} · ttlSec=${LIVE_TTL_MS / 1000}`,
        };
      }
    }
    return {
      id,
      live: false,
      status: "WAITING",
      lastResult: null,
      ts: null,
      ageSec: null,
      proof: `${p} · mirror=${st.mtime.toISOString()} · aucun order done prouvé`,
    };
  } catch {
    // pas de mirror pour cet agent (rotation pas encore passée) → en attente
  }
  return { id, live: false, status: "WAITING", lastResult: null, ts: null, ageSec: null, proof: `${p} absent` };
}

export async function GET() {
  try {
    const generatedAt = new Date().toISOString();
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
    const mirrorAgeMs = mirrorMtime ? Date.now() - Date.parse(mirrorMtime) : null;
    const mirrorFresh = typeof mirrorAgeMs === "number" && Number.isFinite(mirrorAgeMs) && mirrorAgeMs >= 0 && mirrorAgeMs <= MIRROR_TTL_MS;
    const status = mirrorFresh && liveCount > 0 ? "LIVE" : mirrorMtime ? "AMBER_REVERIFY" : "UNKNOWN";

    return NextResponse.json({
      ok: true,
      status,
      sourceTag: "VPS_FLEET_OFFLOAD_PANEL_V1_20260602",
      generatedAt,
      generatedAtUtc: generatedAt,
      host: "srv1509602.hstgr.cloud · 187.124.44.173 · Hostinger KVM2 · 2 CPU",
      orchestrator: "cof-agent-orchestrator.timer (systemd · 1 agent/cycle · load-gardé ≤4)",
      llm: "OpenRouter deepseek-v4-flash via shim :11435 (§15 non-Anthropic)",
      pullback: "com.coftrading.vps-fleet-pull (300s) → ~/.openclaw/vps-mirror/",
      proofPolicy: "NO_FALSE_LIVE: agent LIVE seulement si order done frais <=15min et mirror <=10min",
      total: fleetAgents.length,
      liveCount,
      mirrorMtime,
      mirrorFresh,
      mirrorAgeSec: mirrorAgeMs === null || !Number.isFinite(mirrorAgeMs) ? null : Math.max(0, Math.round(mirrorAgeMs / 1000)),
      agents,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: "UNKNOWN",
      generatedAt: new Date().toISOString(),
      generatedAtUtc: new Date().toISOString(),
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      total: FALLBACK_AGENTS.length,
      liveCount: 0,
      agents: [] as FleetAgent[],
    });
  }
}
