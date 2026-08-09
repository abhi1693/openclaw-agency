import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const PROOF_LEDGER_COORDINATION_SOURCE_TAG = "PROOF_LEDGER_COORDINATION_BUS_LOCAL_V1_20260601";

const HOME = os.homedir();
const STATE_ROOT = path.join(HOME, ".openclaw", "state");
const COORDINATION_DIR = path.join(STATE_ROOT, "proof_ledger_coordination");
const CLAIMS_JSONL = path.join(COORDINATION_DIR, "claims.jsonl");
const STATE_JSON = path.join(COORDINATION_DIR, "state.json");
const HOUSE_ORCHESTRATOR_JSON = path.join(STATE_ROOT, "cofiatrading_world_house_orchestrator.json");
const HOUSE_DISPATCHES_JSONL = path.join(STATE_ROOT, "cofiatrading_world_house_dispatches.jsonl");
const RUNTIME_WORK_JSONL = path.join(STATE_ROOT, "cofiatrading_world_runtime_work.jsonl");
const CONSOLE_PACKETS_JSONL = path.join(STATE_ROOT, "console_ia", "packets.jsonl");
const CENTRAL_BRAIN_LEDGER_JSONL = path.join(STATE_ROOT, "warp", "agent_mesh", "control_ledger.jsonl");

type JsonRecord = Record<string, unknown>;

export type ProofLedgerClaimInput = {
  workerId?: string;
  workerLabel?: string;
  origin?: string;
  sessionId?: string;
  threadId?: string;
  packetId?: string;
  houseId?: string;
  targetId?: string;
  targetPath?: string;
  action?: string;
  summary?: string;
  evidencePaths?: string[];
  ttlSec?: number;
  sourceTag?: string;
};

export type ProofLedgerClaim = Required<
  Pick<ProofLedgerClaimInput, "workerId" | "workerLabel" | "origin" | "sessionId" | "houseId" | "targetId" | "action" | "summary">
> & {
  id: string;
  createdAtUtc: string;
  expiresAtUtc: string;
  threadId: string | null;
  packetId: string | null;
  targetPath: string | null;
  evidencePaths: string[];
  claimKey: string;
  claimKeyHash: string;
  status: "ACTIVE";
  ttlSec: number;
  sourceTag: string;
};

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const asString = (value: unknown, max = 500): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, max);
};

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const safeJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const normalizeKeyPart = (value: string) =>
  value.toLowerCase().replace(/\/users\/burakokyay/g, "~").replace(/[^a-z0-9._~:/-]+/g, "-").slice(0, 180);

const fileStamp = async (filePath: string) => {
  try {
    const s = await stat(filePath);
    return { exists: true, bytes: s.size, mtimeUtc: s.mtime.toISOString() };
  } catch {
    return { exists: false, bytes: 0, mtimeUtc: null };
  }
};

const readJson = async (filePath: string): Promise<JsonRecord> => {
  try {
    return asRecord(JSON.parse(await readFile(filePath, "utf8")));
  } catch {
    return {};
  }
};

const readJsonl = async (filePath: string, limit = 500): Promise<JsonRecord[]> => {
  try {
    const text = await readFile(filePath, "utf8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return asRecord(JSON.parse(line));
        } catch {
          return {};
        }
      })
      .filter((item) => Object.keys(item).length > 0);
  } catch {
    return [];
  }
};

const countJsonl = async (filePath: string) => (await readJsonl(filePath, 5_000)).length;

const claimFromRecord = (record: JsonRecord): ProofLedgerClaim | null => {
  const id = asString(record.id, 160);
  const createdAtUtc = asString(record.createdAtUtc, 80);
  const expiresAtUtc = asString(record.expiresAtUtc, 80);
  const claimKey = asString(record.claimKey, 600);
  const claimKeyHash = asString(record.claimKeyHash, 90);
  if (!id || !createdAtUtc || !expiresAtUtc || !claimKey || !claimKeyHash) return null;
  return {
    id,
    createdAtUtc,
    expiresAtUtc,
    claimKey,
    claimKeyHash,
    status: "ACTIVE",
    workerId: asString(record.workerId, 120) || "unknown-worker",
    workerLabel: asString(record.workerLabel, 160) || asString(record.workerId, 120) || "unknown-worker",
    origin: asString(record.origin, 80) || "unknown-origin",
    sessionId: asString(record.sessionId, 180) || "unknown-session",
    threadId: asString(record.threadId, 180) || null,
    packetId: asString(record.packetId, 180) || null,
    houseId: asString(record.houseId, 120) || "proof_ledger",
    targetId: asString(record.targetId, 180) || "hub",
    targetPath: asString(record.targetPath, 600) || null,
    action: asString(record.action, 120) || "work",
    summary: asString(record.summary, 500) || "coordination claim",
    evidencePaths: Array.isArray(record.evidencePaths) ? record.evidencePaths.map((item) => asString(item, 600)).filter(Boolean).slice(0, 12) : [],
    ttlSec: asNumber(record.ttlSec) ?? 7200,
    sourceTag: asString(record.sourceTag, 140) || PROOF_LEDGER_COORDINATION_SOURCE_TAG,
  };
};

const isActiveClaim = (claim: ProofLedgerClaim, nowMs = Date.now()) => Date.parse(claim.expiresAtUtc) > nowMs;
const isActiveRuntimeWork = (record: JsonRecord, nowMs = Date.now()) => {
  const status = asString(record.status, 80);
  const activeUntilUtc = asString(record.activeUntilUtc, 80);
  const proof = asString(record.proof, 2_000);
  const until = Date.parse(activeUntilUtc);
  return status === "ACTIVE_RECENT"
    && Number.isFinite(until)
    && until > nowMs
    && /LOCAL_RUNTIME_PROOF=codex_session\+file_mtime\+frontend_build|LOCAL_RUNTIME_PROOF=agent_canon\+inventory\+house_dispatch/i.test(proof);
};

const buildClaimKey = (input: ProofLedgerClaimInput) => {
  const houseId = normalizeKeyPart(asString(input.houseId, 120) || "proof_ledger");
  const target = normalizeKeyPart(asString(input.targetPath, 260) || asString(input.targetId, 180) || "hub");
  const action = normalizeKeyPart(asString(input.action, 120) || "work");
  const summary = normalizeKeyPart(asString(input.summary, 220) || "no-summary");
  return `${houseId}|${target}|${action}|${summary}`;
};

export async function readProofLedgerCoordination() {
  await mkdir(COORDINATION_DIR, { recursive: true });

  const claims = (await readJsonl(CLAIMS_JSONL, 1000)).map(claimFromRecord).filter(Boolean) as ProofLedgerClaim[];
  const runtimeWork = await readJsonl(RUNTIME_WORK_JSONL, 1000);
  const nowMs = Date.now();
  const activeClaims = claims.filter((claim) => isActiveClaim(claim, nowMs));
  const activeRuntimeWorkByKey = new Map<string, JsonRecord>();
  for (const record of runtimeWork.filter((entry) => isActiveRuntimeWork(entry, nowMs))) {
    const key = `${asString(record.houseId, 120)}:${asString(record.agentId, 120)}:${asString(record.action, 180)}`;
    const previous = activeRuntimeWorkByKey.get(key);
    if (!previous || asString(record.startedAtUtc, 80).localeCompare(asString(previous.startedAtUtc, 80)) > 0) {
      activeRuntimeWorkByKey.set(key, record);
    }
  }
  const activeRuntimeWork = [...activeRuntimeWorkByKey.values()];
  const sessions = new Set(activeClaims.map((claim) => claim.sessionId).filter(Boolean));
  for (const record of activeRuntimeWork) sessions.add(`runtime:${asString(record.agentId, 120) || "unknown"}:${asString(record.houseId, 120) || "house"}`);
  const byClaimKey = new Map<string, ProofLedgerClaim[]>();
  for (const claim of activeClaims) {
    const group = byClaimKey.get(claim.claimKeyHash) ?? [];
    group.push(claim);
    byClaimKey.set(claim.claimKeyHash, group);
  }
  const duplicateGroups = Array.from(byClaimKey.values()).filter((group) => group.length > 1);
  const houseOrchestrator = await readJson(HOUSE_ORCHESTRATOR_JSON);
  const houseSummary = asRecord(houseOrchestrator.summary);

  const state = {
    ok: true,
    status: duplicateGroups.length ? "LOCAL_COORDINATION_REVIEW" : "LOCAL_COORDINATION_READY",
    mode: "LOCAL_FIRST_NON_BLOCKING_CLAIM_BUS",
    concept: "Proof Ledger Air-Traffic Control: chaque agent declare son claim local, le ledger detecte doublons/collisions, Central Brain route sans bloquer le travail reversible.",
    sourceTag: PROOF_LEDGER_COORDINATION_SOURCE_TAG,
    generatedAtUtc: new Date().toISOString(),
    summary: {
      activeClaims: activeClaims.length + activeRuntimeWork.length,
      explicitClaims: activeClaims.length,
      runtimeClaims: activeRuntimeWork.length,
      activeSessions: sessions.size,
      duplicateGroups: duplicateGroups.length,
      totalClaims: claims.length,
      totalRuntimeRecords: runtimeWork.length,
      consolePackets: await countJsonl(CONSOLE_PACKETS_JSONL),
      houseDispatches: await countJsonl(HOUSE_DISPATCHES_JSONL),
      orchestratedHouses: asNumber(houseSummary.houses) ?? 0,
      queuedDispatches: asNumber(houseSummary.queuedDispatches) ?? 0,
      coveredAgents: asNumber(houseSummary.coveredAgents) ?? 0,
      totalAgents: asNumber(houseSummary.totalAgents) ?? 0,
    },
    policy: [
      "preflight: chaque session/agent poste un claim local avant dispatch",
      "dedupe: meme maison + target + action + resume => MERGE/WARN, pas doublon silencieux",
      "no-false-green: le ledger coordonne, il ne marque jamais execution runtime sans preuve",
      "non-blocking: les actions reversibles continuent; seules collisions/R8 exigent escalade",
      "source-tag: chaque claim garde packet/thread/paths/evidencePaths quand disponibles",
    ],
    duplicateGroups: duplicateGroups.slice(0, 12).map((group) => ({
      claimKeyHash: group[0]?.claimKeyHash,
      count: group.length,
      workers: group.map((claim) => claim.workerLabel),
      claims: group.map((claim) => ({ id: claim.id, workerId: claim.workerId, sessionId: claim.sessionId, targetId: claim.targetId, action: claim.action, createdAtUtc: claim.createdAtUtc })),
    })),
    latestClaims: claims.slice(-20).reverse().map((claim) => ({
      id: claim.id,
      workerId: claim.workerId,
      workerLabel: claim.workerLabel,
      origin: claim.origin,
      sessionId: claim.sessionId,
      houseId: claim.houseId,
      targetId: claim.targetId,
      action: claim.action,
      summary: claim.summary,
      createdAtUtc: claim.createdAtUtc,
      expiresAtUtc: claim.expiresAtUtc,
      claimKeyHash: claim.claimKeyHash,
    })),
    activeRuntimeWork: activeRuntimeWork.slice(0, 20).map((record) => ({
      id: asString(record.id, 200),
      agentId: asString(record.agentId, 120),
      agentName: asString(record.agentName, 160),
      houseId: asString(record.houseId, 120),
      houseTitle: asString(record.houseTitle, 160),
      action: asString(record.action, 180),
      target: asString(record.target, 260),
      activeUntilUtc: asString(record.activeUntilUtc, 80),
      sourceTag: asString(record.sourceTag, 160),
    })),
    channels: [
      { id: "proof-ledger-claims", label: "Proof Ledger claims", status: "LOCAL_APPEND_ONLY", path: CLAIMS_JSONL, stamp: await fileStamp(CLAIMS_JSONL) },
      { id: "central-brain-ledger", label: "Central Brain control ledger", status: "READ_ONLY_SIGNAL", path: CENTRAL_BRAIN_LEDGER_JSONL, stamp: await fileStamp(CENTRAL_BRAIN_LEDGER_JSONL) },
      { id: "console-ia-packets", label: "Console IA packets", status: "READ_ONLY_SIGNAL", path: CONSOLE_PACKETS_JSONL, stamp: await fileStamp(CONSOLE_PACKETS_JSONL) },
      { id: "house-dispatches", label: "House dispatches", status: "READ_ONLY_SIGNAL", path: HOUSE_DISPATCHES_JSONL, stamp: await fileStamp(HOUSE_DISPATCHES_JSONL) },
      { id: "runtime-work", label: "Runtime work", status: activeRuntimeWork.length > 0 ? "ACTIVE_RUNTIME_SIGNAL" : "READ_ONLY_SIGNAL", path: RUNTIME_WORK_JSONL, stamp: await fileStamp(RUNTIME_WORK_JSONL) },
    ],
    paths: {
      claimsJsonl: CLAIMS_JSONL,
      stateJson: STATE_JSON,
      houseOrchestratorJson: HOUSE_ORCHESTRATOR_JSON,
      houseDispatchesJsonl: HOUSE_DISPATCHES_JSONL,
      runtimeWorkJsonl: RUNTIME_WORK_JSONL,
      consolePacketsJsonl: CONSOLE_PACKETS_JSONL,
      centralBrainLedgerJsonl: CENTRAL_BRAIN_LEDGER_JSONL,
    },
  };

  await writeFile(STATE_JSON, safeJson(state), "utf8");
  return state;
}

export async function recordProofLedgerClaim(input: ProofLedgerClaimInput) {
  await mkdir(COORDINATION_DIR, { recursive: true });
  const now = new Date();
  const ttlSec = Math.max(300, Math.min(86_400, input.ttlSec ?? 7200));
  const expiresAt = new Date(now.getTime() + ttlSec * 1000);
  const claimKey = buildClaimKey(input);
  const claimKeyHash = hash(claimKey).slice(0, 24);
  const workerId = asString(input.workerId, 120) || "unknown-worker";
  const sessionId = asString(input.sessionId || input.threadId || input.packetId, 180) || `session_${now.toISOString()}`;
  const id = `plc_${now.toISOString().replace(/[^0-9TZ]/g, "").slice(0, 15)}_${claimKeyHash}`;

  const activeBefore = (await readJsonl(CLAIMS_JSONL, 1000))
    .map(claimFromRecord)
    .filter(Boolean)
    .filter((claim) => isActiveClaim(claim as ProofLedgerClaim)) as ProofLedgerClaim[];
  const duplicates = activeBefore.filter((claim) => claim.claimKeyHash === claimKeyHash);
  const decision = duplicates.length > 0 ? "MERGE_WITH_ACTIVE_CLAIM" : "ALLOW_NEW_CLAIM";

  const claim: ProofLedgerClaim = {
    id,
    workerId,
    workerLabel: asString(input.workerLabel, 160) || workerId,
    origin: asString(input.origin, 80) || "hub",
    sessionId,
    threadId: asString(input.threadId, 180) || null,
    packetId: asString(input.packetId, 180) || null,
    houseId: asString(input.houseId, 120) || "proof_ledger",
    targetId: asString(input.targetId, 180) || "hub",
    targetPath: asString(input.targetPath, 600) || null,
    action: asString(input.action, 120) || "work",
    summary: asString(input.summary, 500) || "coordination claim",
    evidencePaths: Array.isArray(input.evidencePaths) ? input.evidencePaths.map((item) => asString(item, 600)).filter(Boolean).slice(0, 12) : [],
    ttlSec,
    createdAtUtc: now.toISOString(),
    expiresAtUtc: expiresAt.toISOString(),
    claimKey,
    claimKeyHash,
    status: "ACTIVE",
    sourceTag: asString(input.sourceTag, 140) || PROOF_LEDGER_COORDINATION_SOURCE_TAG,
  };

  await appendFile(CLAIMS_JSONL, `${JSON.stringify(claim)}\n`, "utf8");
  const coordination = await readProofLedgerCoordination();
  return {
    ok: true,
    status: decision === "ALLOW_NEW_CLAIM" ? "CLAIM_ACCEPTED_LOCAL" : "CLAIM_MERGED_LOCAL",
    decision,
    sourceTag: PROOF_LEDGER_COORDINATION_SOURCE_TAG,
    claim,
    duplicateClaims: duplicates.map((item) => ({ id: item.id, workerId: item.workerId, sessionId: item.sessionId, createdAtUtc: item.createdAtUtc })),
    paths: coordination.paths,
    summary: coordination.summary,
  };
}
