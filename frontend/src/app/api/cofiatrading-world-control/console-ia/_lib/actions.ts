import { createHash } from "crypto";
import { mkdir, writeFile, appendFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { asString, isRecord, sanitizeText, SOURCE_TAG, normalizeActionMode, MAX_REPLY_CHARS, type ConsoleModelMode } from "./schema";
import { appendJsonl, fileExists, readJsonFile, readJsonlTail, safeJson, shorten } from "./fsUtils";
import { execFileAsync, RESPONSES_DIR, PACKETS_DIR, DRAFTS_DIR, AGENT_MESH_DIR, TARGET_ROUTES, MODEL_MODES } from "./runtime";
import { createClaudeTask, publishCentralBrainEvent } from "./packetWriters";
import { HUB_URL, buildThread, buildThreadView, countPacketRealReplies } from "./threads";
import { logConversationOutMarker, markTakeover, transcodeVoiceToOggOpus } from "./conversation";
import { recordProofLedgerClaim } from "../../_lib/proofLedgerCoordination";

export async function proxyConversationVoice(body: Record<string, unknown>) {
  const uid = sanitizeText(asString(body.uid), 40);
  const via = sanitizeText(asString(body.via), 20) || "iron";
  const fileB64 = typeof body.fileB64 === "string" ? body.fileB64 : "";
  const filename = sanitizeText(asString(body.filename), 60) || "voice.ogg";
  const caption = sanitizeText(asString(body.caption), 400);
  const dryRun = body.dryRun === true;
  if (!uid || !fileB64) {
    return NextResponse.json({ ok: false, error: "MISSING_UID_OR_AUDIO", sourceTag: SOURCE_TAG }, { status: 400 });
  }
  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, target: uid, via, kind: "voice",
      approxBytes: Math.floor((fileB64.length * 3) / 4),
      wouldCall: `${HUB_URL}/api/agent-oversight/send-media-b64`, sourceTag: SOURCE_TAG,
    });
  }
  try {
    const enc = await transcodeVoiceToOggOpus(fileB64, filename);
    const res = await fetch(`${HUB_URL}/api/agent-oversight/send-media-b64`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: via, chat_id: uid, kind: "voice", file_b64: enc.b64, filename: enc.filename, caption }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await res.json().catch(() => ({})) as { message_id?: number; success?: boolean };
    if (res.ok && result?.message_id) {
      await logConversationOutMarker(uid, via, `🎤 Note vocale envoyée (msg ${result.message_id})`);
      await markTakeover(uid, true);  // Flux 5 — Erwin gère → Iron se tait
    }
    return NextResponse.json(
      { ok: res.ok, status: res.status, result, target: uid, via, kind: "voice", transcoded: enc.filename === "voice.ogg", sourceTag: SOURCE_TAG },
      { status: res.ok ? 200 : 502 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "VOICE_PROXY_FAILED", target: uid, sourceTag: SOURCE_TAG }, { status: 502 });
  }
}

// Flux 2 — Envoi d'une PHOTO à un client depuis la dashboard. Proxy vers la brique média
// EXISTANTE du hub /api/telegram/send-media (type=photo → sendPhoto, Content-Type image/jpeg).
// Zéro hub modifié. NB : on N'UTILISE PAS /api/agent-oversight/send-media-b64 pour la photo —
// cet endpoint force Content-Type application/octet-stream, ce que Telegram sendPhoto refuse
// (IMAGE_PROCESS_FAILED) ; send-media met le bon image/jpeg (server.py:36352). La vocale reste
// sur send-media-b64 (octet-stream toléré par sendVoice). Caption non supportée par send-media.
// Gated : déclenché par un clic explicite (preview + double-confirm UI). dryRun=true prouve
// le câblage sans envoyer (pas de spam client en test).
export async function proxyConversationPhoto(body: Record<string, unknown>) {
  const uid = sanitizeText(asString(body.uid), 40);
  const via = sanitizeText(asString(body.via), 20) || "iron";
  const fileB64 = typeof body.fileB64 === "string" ? body.fileB64 : "";
  const dryRun = body.dryRun === true;
  if (!uid || !fileB64) {
    return NextResponse.json({ ok: false, error: "MISSING_UID_OR_PHOTO", sourceTag: SOURCE_TAG }, { status: 400 });
  }
  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, target: uid, via, kind: "photo",
      approxBytes: Math.floor((fileB64.length * 3) / 4),
      wouldCall: `${HUB_URL}/api/telegram/send-media`, sourceTag: SOURCE_TAG,
    });
  }
  try {
    const res = await fetch(`${HUB_URL}/api/telegram/send-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: via, type: "photo", chat_id: uid, media: fileB64, channel: "direct" }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await res.json().catch(() => ({})) as { message_id?: number; success?: boolean };
    const ok = res.ok && result.success === true;
    if (ok) {
      await logConversationOutMarker(uid, via, `📷 Photo envoyée${result.message_id ? ` (msg ${result.message_id})` : ""}`);
      await markTakeover(uid, true);  // Flux 5 — Erwin gère → Iron se tait
    }
    return NextResponse.json(
      { ok, status: res.status, result, target: uid, via, kind: "photo", sourceTag: SOURCE_TAG },
      { status: ok ? 200 : 502 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "PHOTO_PROXY_FAILED", target: uid, sourceTag: SOURCE_TAG }, { status: 502 });
  }
}

export async function recordAgentReply(body: Record<string, unknown>) {
  const packetId = sanitizeText(asString(body.packetId), 140);
  const agentId = sanitizeText(asString(body.agentId), 80) || "agent";
  const agentLabel = sanitizeText(asString(body.agentLabel), 120) || agentId;
  const status = sanitizeText(asString(body.status), 80) || "ANSWER";
  const content = sanitizeText(asString(body.content) || asString(body.message), MAX_REPLY_CHARS);
  const packetPath = path.join(PACKETS_DIR, `${packetId}.json`);

  if (!packetId || !(await fileExists(packetPath))) {
    return NextResponse.json({ ok: false, error: "PACKET_NOT_FOUND", packetId, sourceTag: SOURCE_TAG }, { status: 404 });
  }
  if (!content) {
    return NextResponse.json({ ok: false, error: "EMPTY_AGENT_REPLY", packetId, sourceTag: SOURCE_TAG }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const responseId = `ciar_${timestamp.replace(/[^0-9TZ]/g, "").slice(0, 15)}_${agentId}`;
  const evidencePaths = Array.isArray(body.evidencePaths)
    ? body.evidencePaths.map((item) => sanitizeText(asString(item), 500)).filter(Boolean).slice(0, 12)
    : [];
  const response = {
    responseId,
    packetId,
    sourceTag: SOURCE_TAG,
    createdAt: timestamp,
    agentId,
    agentLabel,
    status,
    kind: "AGENT_REPLY",
    realReply: true,
    content,
    evidencePaths,
    source: "console_ia_local_agent_reply",
  };
  const responseHash = createHash("sha256").update(JSON.stringify(response)).digest("hex");
  const responsePath = path.join(RESPONSES_DIR, `${packetId}.jsonl`);
  const proofLedgerCoordination = await recordProofLedgerClaim({
    workerId: agentId,
    workerLabel: agentLabel,
    origin: "console-ia-agent-reply",
    sessionId: packetId,
    packetId,
    houseId: "proof_ledger",
    targetId: packetId,
    targetPath: responsePath,
    action: status,
    summary: content.slice(0, 260),
    evidencePaths: [packetPath, responsePath, ...evidencePaths],
    ttlSec: 7200,
    sourceTag: SOURCE_TAG,
  }).catch((error) => ({
    ok: false,
    status: "COORDINATION_CLAIM_FAILED",
    error: error instanceof Error ? error.message : "unknown coordination error",
  }));

  await mkdir(RESPONSES_DIR, { recursive: true });
  await appendJsonl(responsePath, { ...response, responseHash });

  const event = await publishCentralBrainEvent(
    "console_ia_agent_reply_recorded",
    {
      packet_id: packetId,
      response_id: responseId,
      response_hash: responseHash,
      agent_id: agentId,
      agent_label: agentLabel,
      status,
      response_path: responsePath,
      proof_ledger_coordination: proofLedgerCoordination,
      summary: `${agentLabel} a répondu au packet console.IA ${packetId}`,
      source_tag: SOURCE_TAG,
    },
    [packetPath, responsePath, ...evidencePaths],
  );

  const thread = await buildThread(packetId);
  return NextResponse.json(
    {
      ok: true,
      sourceTag: SOURCE_TAG,
      status: "AGENT_REPLY_RECORDED_LOCAL",
      packetId,
      response: { ...response, responseHash },
      responsePath,
      proofLedgerCoordination,
      eventHash: event.event_hash ?? null,
      thread,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

// Flux 4 — buses de routage d'un packet (même logique qu'à la création). Un packet
// APPROVAL_REQUIRED naît avec routes=[] (aucun dispatch). Le dispatch n'a lieu qu'au
// 1-tap d'approbation → c'est ça "aucun send/exec sans 1-tap".
export function computeRouteBuses(targetId: string, modelModeId: string): string[] {
  const routeConfig = TARGET_ROUTES[targetId] ?? TARGET_ROUTES.central_council;
  return Array.from(new Set([
    ...routeConfig.buses,
    ...(modelModeId === "chatgpt_desktop" ? ["chatgpt"] : []),
    ...(modelModeId === "kevin_gemini" ? ["kevin"] : []),
  ]));
}

// Flux 4 — APPROBATION 1-tap : APPROVAL_REQUIRED → APPROVED, puis (et seulement alors)
// dispatch sur les buses agents. Idempotent. Réservé à un packet réellement en attente.
export async function approvePacket(body: Record<string, unknown>) {
  const packetId = sanitizeText(asString(body.packetId), 140);
  const approver = sanitizeText(asString(body.approver), 40) || "erwin";
  const packetPath = path.join(PACKETS_DIR, `${packetId}.json`);
  if (!packetId || !(await fileExists(packetPath))) {
    return NextResponse.json({ ok: false, error: "PACKET_NOT_FOUND", packetId, sourceTag: SOURCE_TAG }, { status: 404 });
  }
  const packet = await readJsonFile<Record<string, unknown>>(packetPath);
  if (!packet) {
    return NextResponse.json({ ok: false, error: "PACKET_UNREADABLE", packetId, sourceTag: SOURCE_TAG }, { status: 422 });
  }
  const approval = isRecord(packet.approval) ? packet.approval : {};
  if (approval.required !== true) {
    return NextResponse.json({ ok: false, error: "NO_APPROVAL_REQUIRED", packetId, status: asString(packet.status), sourceTag: SOURCE_TAG }, { status: 409 });
  }
  if (approval.granted === true) {
    return NextResponse.json({ ok: true, status: "ALREADY_APPROVED", packetId, thread: await buildThread(packetId), sourceTag: SOURCE_TAG });
  }
  if (asString(approval.decision).toUpperCase() === "REJECTED") {
    return NextResponse.json({ ok: false, error: "ALREADY_REJECTED", packetId, sourceTag: SOURCE_TAG }, { status: 409 });
  }
  const timestamp = new Date().toISOString();
  const targetId = isRecord(packet.target) ? asString(packet.target.id) : "";
  const modelModeId = isRecord(packet.modelMode) ? asString(packet.modelMode.id) : "";
  const routeConfig = TARGET_ROUTES[targetId] ?? TARGET_ROUTES.central_council;
  const routeBuses = computeRouteBuses(targetId, modelModeId);
  const routes = routeBuses.map((bus) => ({ bus, path: path.join(AGENT_MESH_DIR, `${bus}_bus.jsonl`) }));
  const message = isRecord(packet.input) ? asString(packet.input.message) : "";
  // Dispatch RÉEL seulement maintenant (post-approbation). Agents = travail local + reply
  // (hardlock noExternalSend reste vrai : aucun envoi externe déclenché par ce dispatch).
  await mkdir(AGENT_MESH_DIR, { recursive: true });
  for (const route of routes) {
    await appendJsonl(route.path, {
      t: Math.floor(Date.now() / 1000),
      iso: timestamp,
      f: "console-ia",
      r: route.bus,
      k: "TASK",
      s: shorten(`[APPROVED ${routeConfig.title}] ${message || "(sans texte)"} | packet=${packetId}`),
      packet_id: packetId,
      packet_path: packetPath,
      approved_by: approver,
      approved_at: timestamp,
      source_tag: SOURCE_TAG,
    });
  }
  if (routeBuses.includes("claude") && isRecord(packet.modelMode)) {
    const missionPath = isRecord(packet.paths) ? asString(packet.paths.missionPath) : "";
    await createClaudeTask(packetId, packetPath, missionPath, message, packet.modelMode as ConsoleModelMode);
  }
  packet.approval = { ...approval, required: true, granted: true, grantedBy: approver, grantedAt: timestamp, reason: null, decision: "APPROVED" };
  packet.status = "APPROVED_PACKET_ROUTED_LOCAL";
  packet.mode = "LOCAL_PACKET_APPROVED_ROUTED";
  packet.routes = routes;
  if (isRecord(packet.honestStatus)) packet.honestStatus.execute = "LOCAL_GREEN";
  if (Array.isArray(packet.statusBadges)) {
    packet.statusBadges = packet.statusBadges.map((b) =>
      isRecord(b) && b.id === "execute" ? { ...b, status: "LOCAL_GREEN", tone: "green", detail: `Approuvé par ${approver}` } : b);
  }
  const packetHash = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
  await writeFile(packetPath, safeJson({ ...packet, packetHash }), "utf8");
  await publishCentralBrainEvent("console_ia_packet_approved", {
    packet_id: packetId, approved_by: approver, approved_at: timestamp,
    routes: routeBuses, summary: `Packet ${packetId} approuvé par ${approver} → dispatché (${routeBuses.join(", ") || "aucun bus"})`,
    source_tag: SOURCE_TAG,
  }, [packetPath]);
  return NextResponse.json({ ok: true, status: "APPROVED", packetId, approvedBy: approver, routes: routeBuses, thread: await buildThread(packetId), sourceTag: SOURCE_TAG });
}

// Flux 4 — REJET 1-tap : APPROVAL_REQUIRED → REJECTED. Jamais dispatché, jamais exécuté.
export async function rejectPacket(body: Record<string, unknown>) {
  const packetId = sanitizeText(asString(body.packetId), 140);
  const approver = sanitizeText(asString(body.approver), 40) || "erwin";
  const packetPath = path.join(PACKETS_DIR, `${packetId}.json`);
  if (!packetId || !(await fileExists(packetPath))) {
    return NextResponse.json({ ok: false, error: "PACKET_NOT_FOUND", packetId, sourceTag: SOURCE_TAG }, { status: 404 });
  }
  const packet = await readJsonFile<Record<string, unknown>>(packetPath);
  if (!packet) {
    return NextResponse.json({ ok: false, error: "PACKET_UNREADABLE", packetId, sourceTag: SOURCE_TAG }, { status: 422 });
  }
  const approval = isRecord(packet.approval) ? packet.approval : {};
  if (approval.required !== true) {
    return NextResponse.json({ ok: false, error: "NO_APPROVAL_REQUIRED", packetId, sourceTag: SOURCE_TAG }, { status: 409 });
  }
  if (approval.granted === true) {
    return NextResponse.json({ ok: false, error: "ALREADY_APPROVED_CANNOT_REJECT", packetId, sourceTag: SOURCE_TAG }, { status: 409 });
  }
  const timestamp = new Date().toISOString();
  packet.approval = { ...approval, required: true, granted: false, reason: `Rejeté par ${approver}`, decision: "REJECTED", rejectedBy: approver, rejectedAt: timestamp };
  packet.status = "REJECTED_BY_ERWIN_LOCAL";
  packet.mode = "LOCAL_PACKET_REJECTED";
  packet.routes = [];
  if (isRecord(packet.honestStatus)) packet.honestStatus.execute = "BLOCKED";
  if (Array.isArray(packet.statusBadges)) {
    packet.statusBadges = packet.statusBadges.map((b) =>
      isRecord(b) && b.id === "execute" ? { ...b, status: "BLOCKED", tone: "red", detail: `Rejeté par ${approver}` } : b);
  }
  const packetHash = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
  await writeFile(packetPath, safeJson({ ...packet, packetHash }), "utf8");
  await publishCentralBrainEvent("console_ia_packet_rejected", {
    packet_id: packetId, rejected_by: approver, rejected_at: timestamp,
    summary: `Packet ${packetId} rejeté par ${approver} — jamais dispatché`, source_tag: SOURCE_TAG,
  }, [packetPath]);
  return NextResponse.json({ ok: true, status: "REJECTED", packetId, rejectedBy: approver, thread: await buildThread(packetId), sourceTag: SOURCE_TAG });
}

