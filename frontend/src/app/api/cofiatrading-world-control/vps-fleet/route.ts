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

    // Parse toutes les lignes JSON valides une seule fois.
    const parsed: Record<string, unknown>[] = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // ligne corrompue ignorée
      }
    }
    if (!parsed.length) {
      return {
        id, live: false, status: "WAITING", lastResult: null, lastError: null, rawStatus: null,
        ts: null, ageSec: null, proof: `${p} · mirror=${st.mtime.toISOString()} · aucun order parsable`,
      };
    }

    const last = parsed[parsed.length - 1];
    const rawStatus = typeof last.status === "string" ? last.status : null;
    // Dernier order RÉUSSI (pour le contexte/insight), même si la dernière ligne est failed/pending.
    const lastDone = [...parsed].reverse().find(
      (d) => d.status === "done" && (d.result ?? d.output),
    );
    const doneResult = lastDone ? String(lastDone.result ?? lastDone.output).slice(0, 260) : null;

    // CAS 1 — la dernière ligne est une ERREUR : ne JAMAIS la masquer derrière un vieux "done".
    if (rawStatus === "failed") {
      const failMs = parseTimeMs(last.done_ts ?? last.updated ?? last.ts ?? last.created);
      const ageSec = failMs ? Math.max(0, Math.round((Date.now() - failMs) / 1000)) : null;
      return {
        id, live: false, status: "FAILED",
        lastResult: doneResult,
        lastError: String(last.result ?? last.error ?? "erreur non détaillée").slice(0, 200),
        rawStatus,
        ts: failMs ? new Date(failMs).toISOString() : null,
        ageSec,
        proof: `${p} · DERNIÈRE ligne status=failed · err=${String(last.result ?? "").slice(0, 80)} · ageSec=${ageSec ?? "?"}`,
      };
    }

    // CAS 2 — exécution en cours (pending/started/running).
    if (rawStatus && ["pending", "started", "running"].includes(rawStatus)) {
      const startMs = parseTimeMs(last.started_ts ?? last.ts ?? last.created);
      const ageSec = startMs ? Math.max(0, Math.round((Date.now() - startMs) / 1000)) : null;
      return {
        id, live: false, status: "RUNNING",
        lastResult: doneResult,
        lastError: null, rawStatus,
        ts: startMs ? new Date(startMs).toISOString() : null,
        ageSec,
        proof: `${p} · DERNIÈRE ligne status=${rawStatus} (exécution en cours) · ageSec=${ageSec ?? "?"}`,
      };
    }

    // CAS 3 — dernier état = done : taxonomie LIVE / ROTATING / STALE selon la fraîcheur.
    if (lastDone) {
      const doneMs = parseTimeMs(lastDone.done_ts ?? lastDone.updated ?? lastDone.ts ?? lastDone.created);
      if (!doneMs) {
        return {
          id, live: false, status: "AMBER_REVERIFY", lastResult: doneResult, lastError: null, rawStatus,
          ts: null, ageSec: null,
          proof: `${p} · status=done mais timestamp absent; mtime=${st.mtime.toISOString()}`,
        };
      }
      const ageMs = Date.now() - doneMs;
      const ageSec = Math.max(0, Math.round(ageMs / 1000));
      const live = ageMs >= 0 && ageMs <= LIVE_TTL_MS;
      const status: FleetStatus = live ? "LIVE" : ageMs <= ROTATION_TTL_MS ? "ROTATING" : "STALE";
      return {
        id, live, status, lastResult: doneResult, lastError: null, rawStatus,
        ts: new Date(doneMs).toISOString(), ageSec,
        proof: `${p} · status=done · ts=${new Date(doneMs).toISOString()} · ageSec=${ageSec} · liveTtl=${LIVE_TTL_MS / 1000}s · rotTtl=${ROTATION_TTL_MS / 1000}s`,
      };
    }

    return {
      id, live: false, status: "WAITING", lastResult: null, lastError: null, rawStatus,
      ts: null, ageSec: null, proof: `${p} · mirror=${st.mtime.toISOString()} · aucun order done prouvé`,
    };
  } catch {
    // pas de mirror pour cet agent (rotation pas encore passée) → en attente
  }
  return { id, live: false, status: "WAITING", lastResult: null, lastError: null, rawStatus: null, ts: null, ageSec: null, proof: `${p} absent` };
}

export async function GET() {
  try {
    const generatedAt = new Date().toISOString();
    const fleetAgents = await loadAgents();
    const agents = await Promise.all(fleetAgents.map((a) => readAgent(a)));
    const liveCount = agents.filter((a) => a.live).length;
    const countBy = (s: FleetStatus) => agents.filter((a) => a.status === s).length;
    const failedCount = countBy("FAILED");
    const rotatingCount = countBy("ROTATING");
    const runningCount = countBy("RUNNING");
    const staleCount = countBy("STALE");
    const failedAgents = agents.filter((a) => a.status === "FAILED").map((a) => ({ id: a.id, lastError: a.lastError }));

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
