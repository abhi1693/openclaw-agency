// Verite Trading OS LIVE pour le hub :3000 — surfacee dans la maison central_brain (Trading Tower).
// source_tag: TRADING_READINESS_HUB_3000_20260602
// READ-ONLY : agrege les manifests Trading OS (state/ + design/). Aucun write, aucun broker, aucun secret.
// Convention anti-faux-vert : probe_ok (lecture reussie) != green_allowed (etat reel).
// Invariant : green_allowed===true  <=>  validation_ok===true ET readiness vert ET frais.
// Si un manifest manque/illisible -> ABSENT. Si trop vieux -> STALE. Jamais vert sinon.
// Source de verite = les 3 validators fail-closed (test_broker_readonly / test_signal_board /
// test_paper_forward_shadowbook). Cette route REFLETE leur logique cote lecture, ne la reecrit pas.
// Hub UI = :3000, data = fichiers locaux.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOME = os.homedir();
const STATE = path.join(HOME, ".openclaw/state/trading_os");
const DESIGN = path.join(HOME, ".openclaw/mission-control-frontend-restored/frontend/design");

// Au-dela -> STALE (jamais vert). Manifests Trading OS regeneres en continu => 24h large mais strict.
const MAX_AGE_MIN = 24 * 60;

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
function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

// Lit le 1er chemin existant (state d'abord, design en repli) + mtime pour freshness.
async function readManifest(
  candidates: string[],
): Promise<{ data: JsonRecord | null; sourcePath: string | null; mtimeUtc: string | null; ageMin: number | null }> {
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, "utf-8");
      const data = JSON.parse(raw) as JsonRecord;
      const st = await fs.stat(p);
      const mtimeUtc = st.mtime.toISOString();
      const ageMin = Math.max(0, Math.round((Date.now() - st.mtimeMs) / 60000));
      return { data, sourcePath: p, mtimeUtc, ageMin };
    } catch {
      // essaie le candidat suivant
    }
  }
  return { data: null, sourcePath: null, mtimeUtc: null, ageMin: null };
}

// Statut de lecture d'un manifest : ABSENT (illisible) / STALE (trop vieux) / OK (frais & lu).
type ProbeStatus = "OK" | "STALE" | "ABSENT";
function probeStatus(data: JsonRecord | null, ageMin: number | null): ProbeStatus {
  if (!data) return "ABSENT";
  if (ageMin === null || ageMin > MAX_AGE_MIN) return "STALE";
  return "OK";
}

export async function GET() {
  // ---- 1) Lecture des 5 manifests (state prioritaire, design en repli) ----
  const liveRead = await readManifest([
    path.join(STATE, "live_readiness_latest.json"),
    path.join(DESIGN, "trading_os_live_readiness_latest.json"),
  ]);
  const validationRead = await readManifest([
    path.join(DESIGN, "trading_os_validation_manifest_latest.json"),
    path.join(STATE, "validation_manifest_latest.json"),
  ]);
  const brokerRead = await readManifest([
    path.join(STATE, "broker_readonly_status_latest.json"),
    path.join(DESIGN, "trading_os_broker_readonly_status_latest.json"),
  ]);
  const signalRead = await readManifest([
    path.join(STATE, "research_signal_board_latest.json"),
    path.join(DESIGN, "trading_os_research_signal_board_latest.json"),
  ]);
  const shadowRead = await readManifest([
    path.join(STATE, "shadowbook_manifest_latest.json"),
    path.join(DESIGN, "trading_os_shadowbook_manifest_latest.json"),
  ]);

  // ---- 2) Extraction defensive ----
  const live = asRecord(liveRead.data);
  const validation = asRecord(validationRead.data);
  const broker = asRecord(brokerRead.data);
  const signal = asRecord(signalRead.data);
  const shadow = asRecord(shadowRead.data);

  const liveProbe = probeStatus(liveRead.data, liveRead.ageMin);
  const validationProbe = probeStatus(validationRead.data, validationRead.ageMin);
  const brokerProbe = probeStatus(brokerRead.data, brokerRead.ageMin);
  const signalProbe = probeStatus(signalRead.data, signalRead.ageMin);
  const shadowProbe = probeStatus(shadowRead.data, shadowRead.ageMin);

  // validation_ok = pivot dur. Doit etre lu, frais, et === true. Sinon false.
  const validationOk = validationProbe === "OK" ? boolOrNull(validation.validation_ok) === true : false;
  const realMoneyGateOk = liveProbe === "OK" ? boolOrNull(live.real_money_gate_ok) === true : false;
  const businessGreenAllowed =
    validationProbe === "OK" ? boolOrNull(asRecord(validation.summary).business_green_allowed) === true : false;

  // ---- 3) Quant gate (verdict dans live_readiness.inputs.verdict) ----
  const verdict = asRecord(asRecord(live.inputs).verdict);
  const quantVerdict = stringOrNull(verdict.verdict); // "KILL" attendu
  const quantPassed = numberOrNull(verdict.passed);
  const quantN = numberOrNull(verdict.n_criteria);
  const quantPbo = numberOrNull(verdict.pbo);
  const quantDsr = numberOrNull(verdict.dsr);
  const quantGreen = liveProbe === "OK" && quantVerdict === "PROMOTE" && quantPassed === quantN && quantN !== null;

  // ---- 4) Paper-forward shadowbook (closed/100) ----
  const shadowSummary = asRecord(shadow.summary);
  const shadowClosed = numberOrNull(shadowSummary.closed);
  const shadowQueued = numberOrNull(shadowSummary.queued);
  const shadowPending = numberOrNull(shadowSummary.pending);
  const shadowCritPassed = numberOrNull(shadowSummary.criteria_passed);
  const SHADOW_TARGET = 100;
  // green_allowed = all criteria (cf. test_paper_forward_shadowbook_fail_closed.py:50)
  const shadowGreen =
    shadowProbe === "OK" &&
    shadowClosed !== null &&
    shadowClosed >= SHADOW_TARGET &&
    shadowCritPassed !== null &&
    shadowCritPassed >= 4 &&
    validationOk;

  // ---- 5) Broker read-only (green seulement si status === READONLY_OK ; cf. validator:18) ----
  const brokerStatus = stringOrNull(broker.status); // "ABSENT" attendu
  const brokerReadiness = stringOrNull(broker.readiness);
  const brokerConnected = boolOrNull(broker.connected);
  const brokerWriteAllowed = boolOrNull(broker.broker_write_allowed);
  const brokerGreen = brokerProbe === "OK" && brokerStatus === "READONLY_OK" && brokerWriteAllowed === false;

  // ---- 6) Signal board (research/detect-only ; jamais vert business) ----
  const signalMode = stringOrNull(signal.mode); // "DETECT_ONLY"
  const signalSummary = asRecord(signal.summary);
  const signalTriggered = numberOrNull(signalSummary.setups_triggered_recent);
  const signalQueue = asRecord(signal.paper_forward_queue);
  const signalQueueCount = numberOrNull(signalQueue.count);
  const signalTradeAllowed = boolOrNull(signal.trade_signal_allowed);

  // ---- 7) Readiness global HONNETE ----
  // GREEN business interdit tant que validation_ok=false OU gate reel ferme.
  // green_allowed global = TOUT vert ET validation_ok ET real_money_gate_ok.
  const allComponentProbesOk =
    liveProbe === "OK" && validationProbe === "OK" && brokerProbe === "OK" && signalProbe === "OK" && shadowProbe === "OK";
  const anyAbsent =
    liveProbe === "ABSENT" ||
    validationProbe === "ABSENT" ||
    brokerProbe === "ABSENT" ||
    signalProbe === "ABSENT" ||
    shadowProbe === "ABSENT";
  const anyStale =
    liveProbe === "STALE" ||
    validationProbe === "STALE" ||
    brokerProbe === "STALE" ||
    signalProbe === "STALE" ||
    shadowProbe === "STALE";

  const greenAllowed =
    allComponentProbesOk &&
    validationOk &&
    realMoneyGateOk &&
    businessGreenAllowed &&
    quantGreen &&
    shadowGreen &&
    brokerGreen;

  // Label honnete pour le badge UI.
  let readinessLabel: string;
  let tone: "green" | "amber" | "red";
  if (greenAllowed) {
    readinessLabel = "READY_FOR_REAL_MONEY";
    tone = "green";
  } else if (anyAbsent) {
    readinessLabel = "ABSENT — source manquante";
    tone = "red";
  } else if (anyStale) {
    readinessLabel = "STALE — source perimee";
    tone = "amber";
  } else {
    // lu & frais mais gate ferme : on remonte la verite du manifest.
    readinessLabel = stringOrNull(live.readiness) ?? "NOT_READY_FOR_REAL_MONEY";
    tone = "red";
  }

  // probe_ok = au moins les sources critiques lues & fraiches (pour distinguer "je lis" de "c'est vert").
  const probeOk = liveProbe === "OK" && validationProbe === "OK";

  return NextResponse.json({
    ok: true, // ok = la ROUTE a repondu (lecture). N'IMPLIQUE PAS green. Voir green_allowed.
    sourceTag: "TRADING_READINESS_HUB_3000_20260602",
    fetchedAt: new Date().toISOString(),

    // --- Verite globale ---
    probe_ok: probeOk,
    green_allowed: greenAllowed, // FALSE tant que validation_ok=false / gate ferme / broker absent / sample insuffisant
    readiness: readinessLabel,
    tone,
    validation_ok: validationOk,
    real_money_gate_ok: realMoneyGateOk,
    business_green_allowed: businessGreenAllowed,
    invariant: "green_allowed===true <=> validation_ok===true & real_money_gate_ok===true & readiness vert & frais",

    // --- Quant gate ---
    quant: {
      probe: liveProbe,
      green_allowed: quantGreen,
      verdict: quantVerdict, // "KILL"
      passed: quantPassed,
      n_criteria: quantN,
      pbo: quantPbo,
      dsr: quantDsr,
    },

    // --- Paper-forward (shadowbook) closed/100 ---
    paper_forward: {
      probe: shadowProbe,
      green_allowed: shadowGreen,
      readiness: stringOrNull(shadow.readiness),
      closed: shadowClosed,
      target: SHADOW_TARGET,
      queued: shadowQueued,
      pending: shadowPending,
      criteria_passed: shadowCritPassed,
      label: shadowClosed !== null ? `${shadowClosed}/${SHADOW_TARGET} fermes` : "ABSENT",
    },

    // --- Broker read-only ---
    broker_readonly: {
      probe: brokerProbe,
      green_allowed: brokerGreen,
      status: brokerStatus, // "ABSENT"
      readiness: brokerReadiness,
      connected: brokerConnected,
      write_enabled: boolOrNull(broker.write_enabled),
      broker_write_allowed: brokerWriteAllowed,
    },

    // --- Signal board (research/detect-only) ---
    signal_board: {
      probe: signalProbe,
      green_allowed: false, // detect-only : jamais vert business par construction
      mode: signalMode, // "DETECT_ONLY"
      setups_triggered_recent: signalTriggered,
      paper_queue_count: signalQueueCount,
      trade_signal_allowed: signalTradeAllowed, // false
    },

    // --- Provenance / freshness (anti-faux-vert : on montre l'age) ---
    sources: {
      live_readiness: { probe: liveProbe, path: liveRead.sourcePath, mtimeUtc: liveRead.mtimeUtc, ageMin: liveRead.ageMin },
      validation: { probe: validationProbe, path: validationRead.sourcePath, mtimeUtc: validationRead.mtimeUtc, ageMin: validationRead.ageMin },
      broker_readonly: { probe: brokerProbe, path: brokerRead.sourcePath, mtimeUtc: brokerRead.mtimeUtc, ageMin: brokerRead.ageMin },
      signal_board: { probe: signalProbe, path: signalRead.sourcePath, mtimeUtc: signalRead.mtimeUtc, ageMin: signalRead.ageMin },
      shadowbook: { probe: shadowProbe, path: shadowRead.sourcePath, mtimeUtc: shadowRead.mtimeUtc, ageMin: shadowRead.ageMin },
    },

    // --- Garde dure (toujours fail-closed cote lecture) ---
    guard: {
      broker_write: false,
      external_send: false,
      real_account: false,
      claim_edge: false,
      trade_signal: false,
      max_age_min: MAX_AGE_MIN,
    },
  });
}
