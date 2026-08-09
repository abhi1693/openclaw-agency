import { createHash } from "crypto";
import { mkdir, writeFile, appendFile, readFile, unlink } from "fs/promises";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { asString, isRecord, sanitizeText, SOURCE_TAG, MAX_REPLY_CHARS } from "./schema";
import { appendJsonl, readJsonFile, readJsonlTail, safeJson } from "./fsUtils";
import { execFileAsync, HOME, INBOUND_DIR, CONSOLE_STATE_DIR, TAKEOVER_FILE, TAKEOVER_TTL_SEC, AGENT_MESH_DIR, PACKETS_DIR, PACKETS_JSONL, MODEL_MODES, TARGET_ROUTES } from "./runtime";
import { publishCentralBrainEvent } from "./packetWriters";
import { HUB_URL, appendUserTurn, ensureThread } from "./threads";

// Répondre à un client depuis la dashboard — proxy vers le POST send EXISTANT du hub.
// Gated : déclenché uniquement par un clic explicite (double-confirm UI). dryRun=true prouve
// le câblage sans envoyer (pas de spam client en test). Aucun nouveau système d'envoi.
export async function proxyConversationSend(body: Record<string, unknown>) {
  const uid = sanitizeText(asString(body.uid), 40);
  const text = sanitizeText(asString(body.text), MAX_REPLY_CHARS);
  const via = sanitizeText(asString(body.via), 20) || "iron";
  const dryRun = body.dryRun === true;
  if (!uid || !text) {
    return NextResponse.json({ ok: false, error: "MISSING_UID_OR_TEXT", sourceTag: SOURCE_TAG }, { status: 400 });
  }
  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, target: uid, via, by: "erwin", text,
      wouldCall: `${HUB_URL}/api/conversations/${uid}/send`, sourceTag: SOURCE_TAG,
    });
  }
  try {
    const res = await fetch(`${HUB_URL}/api/conversations/${encodeURIComponent(uid)}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, via, by: "erwin" }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok) await markTakeover(uid, true);  // Flux 5 — Erwin gère → Iron se tait
    return NextResponse.json(
      { ok: res.ok, status: res.status, result, target: uid, via, sourceTag: SOURCE_TAG },
      { status: res.ok ? 200 : 502 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "SEND_PROXY_FAILED", target: uid, sourceTag: SOURCE_TAG }, { status: 502 });
  }
}

// Commande Telegram (@agent) → target console + lane par défaut de l'agent.
export const AGENT_ID_TO_TARGET: Record<string, string> = {
  jarod: "jarod_openclaw", claude: "claude_local", codex: "codex_local", qwen: "qwen_local",
  kevin: "kevin_gemini", gemini: "gemini_pro_local", perplexity: "perplexity_local", chatgpt: "chatgpt_sync", council: "central_council",
};
export const AGENT_LANE: Record<string, string> = {
  jarod_openclaw: "jarod_runtime", claude_local: "claude_4_8_max_high", codex_local: "spark_5_3",
  qwen_local: "qwen_local", kevin_gemini: "gemini_perception", gemini_pro_local: "gemini_pro_local", perplexity_local: "perplexity_bridge",
  chatgpt_sync: "chatgpt_desktop", central_council: "council_synthesis",
};

// P1.1 — Ingestion d'une commande Erwin (Telegram) dans le thread de l'agent visé, SANS exécution.
// Réutilise ensureThread/appendUserTurn (Phase 3B). routes=[] → aucun dispatch agent (no exec, no send).
export async function ingestCommand(body: Record<string, unknown>) {
  const agentId = sanitizeText(asString(body.agentId), 40).toLowerCase();
  const targetId = AGENT_ID_TO_TARGET[agentId] ?? "";
  const text = sanitizeText(asString(body.text), MAX_REPLY_CHARS);
  const fullText = sanitizeText(asString(body.fullText), MAX_REPLY_CHARS) || text;
  const source = sanitizeText(asString(body.source), 40) || "telegram_group";
  const authorId = String(body.authorId ?? "");
  const authorName = sanitizeText(asString(body.authorName), 80) || "Erwin";
  if (!targetId || !text) {
    return NextResponse.json({ ok: false, error: "UNKNOWN_AGENT_OR_EMPTY", agentId, sourceTag: SOURCE_TAG }, { status: 400 });
  }
  const timestamp = new Date().toISOString();
  const packetId = `cia_${timestamp.replace(/[^0-9TZ]/g, "").slice(0, 15)}_${targetId}`;
  const modelId = AGENT_LANE[targetId] ?? "spark_5_3";
  const modelMode = MODEL_MODES[modelId as keyof typeof MODEL_MODES] ?? MODEL_MODES.spark_5_3;
  const routeConfig = TARGET_ROUTES[targetId] ?? TARGET_ROUTES.central_council;
  const threadRecord = await ensureThread(targetId, modelId, "", timestamp);
  const threadId = threadRecord.threadId;
  await mkdir(PACKETS_DIR, { recursive: true });
  const packetPath = path.join(PACKETS_DIR, `${packetId}.json`);
  const packet = {
    packetId, threadId, sourceTag: SOURCE_TAG,
    source, authorId, authorName,
    status: "INGESTED_COMMAND_LOCAL", mode: "TELEGRAM_INGEST", actionMode: "ASK", requestedMode: "telegram_command",
    createdAt: timestamp, modelMode,
    approval: { required: false, granted: true, reason: null },
    target: { id: targetId, label: routeConfig.title, owner: routeConfig.owner, house: routeConfig.house },
    input: { message: fullText, messageChars: fullText.length, attachments: [], attachmentCount: 0, attachmentBytes: 0 },
    paths: { packetPath, missionPath: "", uploadDir: "", packetsJsonl: PACKETS_JSONL, chatgptBriefPath: null, kevinPacketPath: null },
    routes: [],
    hardlocks: { noExternalSend: true, ingestOnlyNoExecution: true },
  };
  const packetHash = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
  await writeFile(packetPath, safeJson({ ...packet, packetHash }), "utf8");
  await appendJsonl(PACKETS_JSONL, { ...packet, packetHash });
  await appendUserTurn(threadRecord, packetId, modelId, timestamp);

  const envelope = {
    envelopeId: packetId, source, chatId: String(body.chatId ?? ""),
    authorId, authorIsErwin: authorId === "5494896169", authorName,
    targetAgent: agentId, targetId, text, fullText,
    ts: timestamp, threadId, execution: "NONE",
  };
  await mkdir(INBOUND_DIR, { recursive: true });
  await writeFile(path.join(INBOUND_DIR, `${packetId}.json`), safeJson(envelope), "utf8");
  await appendJsonl(path.join(INBOUND_DIR, "_index.jsonl"), envelope);
  return NextResponse.json({ ok: true, sourceTag: SOURCE_TAG, threadId, packetId, envelope }, { status: 201 });
}

// Le navigateur (MediaRecorder) capte du webm/opus. Telegram sendVoice ne rend une
// VRAIE note vocale jouable qu'avec un OGG/OPUS. On transcode localement (ffmpeg, §15
// local-only) avant l'envoi. Fallback : si ffmpeg échoue, on renvoie l'original (jamais
// de crash). Retourne {b64, filename}.
export async function transcodeVoiceToOggOpus(fileB64: string, fallbackName: string): Promise<{ b64: string; filename: string }> {
  const ffmpeg = path.join(HOME, "bin", "ffmpeg");
  const stamp = `${Date.now()}_${Math.floor((fileB64.length || 1))}`;
  const tmpIn = path.join(os.tmpdir(), `cia_voice_${stamp}.in`);
  const tmpOut = path.join(os.tmpdir(), `cia_voice_${stamp}.ogg`);
  try {
    await writeFile(tmpIn, Buffer.from(fileB64, "base64"));
    await execFileAsync(ffmpeg, ["-y", "-i", tmpIn, "-ac", "1", "-c:a", "libopus", "-b:a", "32k", tmpOut], {
      timeout: 12000,
      maxBuffer: 1024 * 1024,
    });
    const out = await readFile(tmpOut);
    if (!out.length) throw new Error("EMPTY_OGG");
    return { b64: out.toString("base64"), filename: "voice.ogg" };
  } catch {
    return { b64: fileB64, filename: fallbackName };
  } finally {
    await unlink(tmpIn).catch(() => {});
    await unlink(tmpOut).catch(() => {});
  }
}

// Après un envoi média réussi, journalise un marqueur OUT dans le transcript Obsidian du
// client (même fichier que les réponses texte, `05_LIVE/<agent>-conversations/<uid>.md`),
// via l'endpoint hub EXISTANT /api/obsidian/append. Sinon le média part vers Telegram mais
// n'apparaît jamais dans la console → impression "ça marche pas". Best-effort, jamais bloquant.
export async function logConversationOutMarker(uid: string, via: string, markerText: string) {
  try {
    const agentDir = via === "david" ? "david-conversations" : "iron-conversations";
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    await fetch(`${HUB_URL}/api/obsidian/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: `05_LIVE/${agentDir}/${uid}.md`,
        content: `\n## [${ts}] OUT | by=erwin | manual_admin\n\n${markerText}\n`,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // best-effort : le marqueur transcript ne doit jamais faire échouer un envoi réussi
  }
}

// Flux 5 — marque/retire un takeover : Erwin gère cette conv → Iron se tait. Écrit le fichier
// que le daemon Iron lit (anti double-contact). Best-effort, jamais bloquant pour l'envoi.
export async function markTakeover(uid: string, on: boolean) {
  try {
    if (!uid) return;
    await mkdir(CONSOLE_STATE_DIR, { recursive: true });
    const data = (await readJsonFile<Record<string, unknown>>(TAKEOVER_FILE)) ?? {};
    if (on) {
      data[uid] = { since: Math.floor(Date.now() / 1000), by: "erwin" };
    } else {
      delete data[uid];
    }
    await writeFile(TAKEOVER_FILE, safeJson(data), "utf8");
  } catch {
    // best-effort
  }
}

// Flux 5 — statut takeover d'une conv (même logique TTL que le daemon Iron) pour l'afficher dans l'UI.
export async function isTakeoverActive(uid: string): Promise<boolean> {
  try {
    if (!uid) return false;
    const data = await readJsonFile<Record<string, unknown>>(TAKEOVER_FILE);
    const entry = data && isRecord(data[uid]) ? data[uid] as Record<string, unknown> : null;
    if (!entry) return false;
    const since = Number(entry.since) || 0;
    return since > 0 && (Math.floor(Date.now() / 1000) - since) < TAKEOVER_TTL_SEC;
  } catch {
    return false;
  }
}

// Flux 7 — SOURCE CRM = iron_crm_ultra_runtime.db si la requête sqlite fraîche répond.
// Les compteurs clients/brokers ne sont pas répétés ici pour éviter de figer un état runtime.
