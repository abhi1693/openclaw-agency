import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Lit le flux d'ordonnancement RÉEL du superviseur (central_brain_session_coach_latest.json).
// Fraîcheur via generated_at_utc + max_age (jamais mtime) : si périmé → stale=true (le drawer
// l'affiche STALE, jamais "à jour" déguisé). Aucune donnée inventée.
const SOURCE_TAG = "CLAUDE_SUPERVISION_COACH_PROXY_20260603";
const COACH = "/Users/burakokyay/.openclaw/state/warp/agent_mesh/central_brain_session_coach_latest.json";
const MAX_AGE_SEC = 3 * 3600;

export async function GET() {
  const asOf = new Date().toISOString();
  try {
    const d = JSON.parse(await readFile(COACH, "utf8")) as {
      generated_at_utc?: string;
      mode?: string;
      active_warn_count?: number;
      nudges?: Array<{ severity?: string; house?: string; nudge?: string; action?: string }>;
    };
    const generatedAtUtc = typeof d.generated_at_utc === "string" ? d.generated_at_utc : null;
    const ageSec = generatedAtUtc ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(generatedAtUtc)) / 1000)) : null;
    const stale = ageSec === null || ageSec > MAX_AGE_SEC;
    const nudges = Array.isArray(d.nudges)
      ? d.nudges.slice(0, 12).map((n) => ({
          severity: String(n?.severity ?? "INFO"),
          house: String(n?.house ?? ""),
          nudge: String(n?.nudge ?? ""),
          action: String(n?.action ?? ""),
        }))
      : [];
    return NextResponse.json(
      { ok: true, mode: d.mode ?? null, activeWarnCount: d.active_warn_count ?? null, generatedAtUtc, ageSec, stale, nudges, source: COACH, sourceTag: SOURCE_TAG, asOf },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, mode: null, activeWarnCount: null, generatedAtUtc: null, ageSec: null, stale: true, nudges: [], source: COACH, error: error instanceof Error ? error.message : "read_failed", sourceTag: SOURCE_TAG, asOf },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
