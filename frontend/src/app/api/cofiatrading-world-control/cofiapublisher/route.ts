// CofiaPublisher -> hub :3000 (maison youtube_studio). Read-only proxy de :8540.
// source_tag: COFIAPUBLISHER_HUB_3000_20260602
// Pattern copie de system-health/route.ts (probe AbortController 2.5s, fail-closed, NextResponse.json).
// INVARIANT ANTI-FAUX-VERT : probe_ok (fetch ok) != green_allowed (moteur produit vraiment).
// green_allowed=true SEULEMENT si live + dernier render frais (<FRESH_HOURS) + renders>0.
// :8540 down => status DOWN, ok:false. Jamais ok:true masquant. Hub UI :3000 (S54), data :8540.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOST = "http://127.0.0.1:8540";
const FRESH_HOURS = 26; // cadence 1 video/jour + marge ; au-dela = moteur PAS frais (pas vert)

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

async function fetchJson(
  path: string,
): Promise<{ ok: boolean; code: number | null; data: unknown }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`${HOST}${path}`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    const code = r.status;
    if (!(code >= 200 && code < 400)) return { ok: false, code, data: null };
    const data = await r.json().catch(() => null);
    return { ok: true, code, data };
  } catch {
    return { ok: false, code: null, data: null };
  }
}

export async function GET() {
  // 1) Probes paralleles read-only (status, renders, production-map).
  const [statusR, rendersR, mapR] = await Promise.all([
    fetchJson("/api/status"),
    fetchJson("/api/renders"),
    fetchJson("/api/production-map"),
  ]);

  // probe_ok = le service a repondu (status est le probe primaire).
  const probe_ok = statusR.ok;

  // 2) :8540 DOWN -> fail-closed honnete, jamais de faux-vert.
  if (!probe_ok) {
    return NextResponse.json(
      {
        ok: false,
        sourceTag: "COFIAPUBLISHER_HUB_3000_20260602",
        fetchedAt: new Date().toISOString(),
        probe_ok: false,
        green_allowed: false,
        status: "DOWN",
        reason: "CofiaPublisher :8540 ne repond pas (probe status echoue).",
        endpoint: `${HOST}/api/status`,
        httpCode: statusR.code,
      },
      { status: 200 },
    );
  }

  const status = asRecord(statusR.data);
  const renders = Array.isArray(rendersR.data) ? (rendersR.data as JsonRecord[]) : [];
  const map = asRecord(mapR.data);
  const mapSummary = asRecord(map.summary);

  // 3) Compteurs reels.
  const rendersCount = renders.length || numberOrNull(status.output_dir_count) || 0;
  const activeRenders = renders.filter((x) => !x.archived).length;
  const outputDirCount = numberOrNull(status.output_dir_count);
  const scenariosCount = numberOrNull(mapSummary.scenarios);
  const engineState = stringOrNull(status.status) ?? "unknown"; // "live" attendu
  const version = stringOrNull(status.version);

  // 4) Dernier render + fraicheur (determinant anti-faux-vert).
  const active = renders.filter((x) => !x.archived);
  active.sort((a, b) => String(b.mtime ?? "").localeCompare(String(a.mtime ?? "")));
  const latest = active[0] ?? null;
  const latestStem = latest ? stringOrNull(latest.stem) : null;
  const latestMtime = latest ? stringOrNull(latest.mtime) : null;
  let latestAgeHours: number | null = null;
  if (latestMtime) {
    const ms = Date.parse(latestMtime);
    if (Number.isFinite(ms)) latestAgeHours = Math.max(0, (Date.now() - ms) / 3_600_000);
  }
  const renderFresh = latestAgeHours !== null && latestAgeHours <= FRESH_HOURS;

  // 5) INVARIANT : green_allowed = moteur live ET produit frais ET inventaire non vide.
  const engineLive = engineState === "live";
  const green_allowed = probe_ok && engineLive && renderFresh && rendersCount > 0;

  // 6) Statut hub : LIVE seulement si green_allowed. Sinon AMBER (vivant pas frais) ou DOWN.
  const hubStatus = green_allowed ? "LIVE" : engineLive ? "AMBER" : "DOWN";

  return NextResponse.json({
    ok: green_allowed, // INVARIANT : ok===true <=> LIVE (moteur produit vraiment)
    sourceTag: "COFIAPUBLISHER_HUB_3000_20260602",
    fetchedAt: new Date().toISOString(),
    probe_ok,
    green_allowed,
    status: hubStatus,
    engineState,
    version,
    rendersCount,
    activeRenders,
    outputDirCount,
    scenariosCount,
    latestRender: latest
      ? { stem: latestStem, mtime: latestMtime, ageHours: latestAgeHours !== null ? Math.round(latestAgeHours * 10) / 10 : null, fresh: renderFresh }
      : null,
    freshThresholdHours: FRESH_HOURS,
    productionMap: {
      renders: numberOrNull(mapSummary.renders),
      scenarios: scenariosCount,
      stageDirs: numberOrNull(mapSummary.stage_dirs),
      reviewDirs: numberOrNull(mapSummary.review_dirs),
      missingScenarioRecords: numberOrNull(mapSummary.missing_scenario_records),
      sourceTag: stringOrNull(map.source_tag),
    },
    notFresh: !renderFresh
      ? `Dernier render il y a ${latestAgeHours !== null ? Math.round(latestAgeHours) : "?"}h (> ${FRESH_HOURS}h) — moteur PAS frais, pas vert.`
      : null,
    dataSource: `${HOST} (status+renders+production-map, read-only)`,
  });
}
