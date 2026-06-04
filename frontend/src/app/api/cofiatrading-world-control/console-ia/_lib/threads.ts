import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { asString, isRecord, normalizeActionMode, sanitizeText, SOURCE_TAG, MAX_REPLY_CHARS, type ConsoleModelMode } from "./schema";
import { buildWhyStatus } from "./proofBuilder";
import { deriveHonestStatus } from "./statusModel";
import { buildPacketTimeline } from "./timeline";
import { buildPathProof, fileExists, readJsonFile, readJsonlTail, safeJson } from "./fsUtils";
import { readGuardSummary } from "./packetWriters";
import { THREADS_DIR, AGENT_INDEX_DIR, DRAFTS_DIR, PACKETS_DIR, RESPONSES_DIR, CLAUDE_TASKS_DIR, CONTROL_LEDGER, type ThreadMessage } from "./runtime";

// ── ÉTAPE 3/4 — couche thread persistante (mémoire multi-tour par agent) ───
// Additif : le packet reste la source des réponses (responses/*.jsonl, écrites par
// le router). Le thread est un index léger {packetIds, summary, meta} ; la vérité
// realReply est toujours recalculée depuis les responses, jamais stockée comme acquis.
export type ThreadFile = {
  threadId: string;
  targetId: string;
  modelId: string;
  status: string;
  packetIds: string[];
  summary: string;
  createdAt: string;
  updatedAt: string;
  lastPacketId: string;
  realReplyCount: number;
};
export type AgentIndex = { targetId: string; activeThreadId: string; threads: { threadId: string; updatedAt: string }[] };

export const threadFilePath = (threadId: string) => path.join(THREADS_DIR, `${threadId}.json`);
export const agentIndexPath = (targetId: string) => path.join(AGENT_INDEX_DIR, `${targetId}.json`);

export async function readAgentIndex(targetId: string): Promise<AgentIndex> {
  return (await readJsonFile<AgentIndex>(agentIndexPath(targetId))) ?? { targetId, activeThreadId: "", threads: [] };
}
export async function writeAgentIndex(idx: AgentIndex) {
  await mkdir(AGENT_INDEX_DIR, { recursive: true });
  await writeFile(agentIndexPath(idx.targetId), safeJson(idx), "utf8");
}
export async function resolveActiveThreadId(targetId: string): Promise<string> {
  const idx = await readAgentIndex(targetId);
  if (idx.activeThreadId && (await fileExists(threadFilePath(idx.activeThreadId)))) return idx.activeThreadId;
  return "";
}
// Résout le thread actif de l'agent (ou le thread demandé s'il existe et appartient
// au même agent), sinon en crée un neuf. Un agent ne mélange jamais les turns d'un autre.
export async function ensureThread(targetId: string, modelId: string, requestedThreadId: string, timestamp: string): Promise<ThreadFile> {
  let threadId = "";
  if (requestedThreadId && (await fileExists(threadFilePath(requestedThreadId)))) {
    const requested = await readJsonFile<ThreadFile>(threadFilePath(requestedThreadId));
    if (requested && requested.targetId === targetId) return requested;
  }
  if (!threadId) threadId = await resolveActiveThreadId(targetId);
  if (threadId) {
    const existing = await readJsonFile<ThreadFile>(threadFilePath(threadId));
    if (existing && existing.targetId === targetId) return existing;
  }
  const newId = `thread_${targetId}_${timestamp.replace(/[^0-9TZ]/g, "").slice(0, 15)}`;
  const fresh: ThreadFile = {
    threadId: newId, targetId, modelId, status: "WAITING",
    packetIds: [], summary: "", createdAt: timestamp, updatedAt: timestamp, lastPacketId: "", realReplyCount: 0,
  };
  await mkdir(THREADS_DIR, { recursive: true });
  await writeFile(threadFilePath(newId), safeJson(fresh), "utf8");
  return fresh;
}
export async function appendUserTurn(thread: ThreadFile, packetId: string, modelId: string, timestamp: string) {
  thread.packetIds = Array.from(new Set([...(thread.packetIds ?? []), packetId]));
  thread.lastPacketId = packetId;
  thread.modelId = modelId;
  thread.updatedAt = timestamp;
  thread.status = "WAITING";
  await mkdir(THREADS_DIR, { recursive: true });
  await writeFile(threadFilePath(thread.threadId), safeJson(thread), "utf8");
  const idx = await readAgentIndex(thread.targetId);
  idx.activeThreadId = thread.threadId;
  idx.threads = [
    { threadId: thread.threadId, updatedAt: timestamp },
    ...idx.threads.filter((t) => t.threadId !== thread.threadId),
  ].slice(0, 20);
  await writeAgentIndex(idx);
}

// Destinations (canaux Telegram) — statuts honnêtes. Aucun bridge lecture/écriture
// branché aujourd'hui → BRIDGE_MISSING / READ_MISSING / WRITE_LOCKED. Aucun feed inventé.
export const DESTINATION_IDS = ["telegram_iron", "telegram_free", "telegram_vip", "telegram_aeron", "telegram_erwin"];
export const DESTINATION_LABELS: Record<string, string> = {
  telegram_iron: "Telegram Iron",
  telegram_free: "Telegram Free",
  telegram_vip: "Telegram VIP",
  telegram_aeron: "Aeron Feed",
  telegram_erwin: "Compte perso Erwin",
};
export const DESTINATION_FEED_CHANNELS: Record<string, string> = {
  telegram_iron: "iron",
  telegram_free: "free",
  telegram_vip: "vip",
  telegram_aeron: "aeron",
  telegram_erwin: "erwin",
};
// Hub local existant (telegram-hub-bridge). On LIT seulement (read-only), jamais d'écriture hub.
export const HUB_URL = process.env.COF_HUB_URL ?? "http://127.0.0.1:8430";

// Lit le feed d'un canal depuis la brique LIVE déjà en place. Aucun Telethon recréé,
// aucun envoi. Si le hub ne fournit pas le canal, on garde MISSING au lieu de l'inventer.
export async function fetchTelegramFeed(channel: string): Promise<{ ok: boolean; items: Array<{ id: string; author: string; text: string; ts: string }> }> {
  try {
    const res = await fetch(`${HUB_URL}/api/telegram/${channel}/recent?since=0&limit=20`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { ok: false, items: [] };
    const data = (await res.json()) as { messages?: Array<Record<string, unknown>> };
    const msgs = Array.isArray(data?.messages) ? data.messages : [];
    const items = msgs.map((m, i) => ({
      id: String(m?.msg_id ?? m?.telegram_msg_id ?? `${channel}_${i}`),
      author: typeof m?.username === "string" && m.username
        ? m.username
        : (m?.user_id && m.user_id !== 0 ? String(m.user_id) : channel),
      text: sanitizeText(asString(m?.text), 400) || "[média]",
      ts: String(m?.ts ?? ""),
    }));
    return { ok: true, items };
  } catch {
    return { ok: false, items: [] };
  }
}

// Inbox conversations clients — réutilise l'API hub conversations_api.py (read-only, GET only).
export async function fetchConversationThreads(): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`${HUB_URL}/api/conversations/threads?limit=30&since_hours=336`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { threads?: Record<string, unknown>[] };
    return Array.isArray(data?.threads) ? data.threads : [];
  } catch {
    return [];
  }
}

export async function fetchConversationMessages(uid: string): Promise<{ agent: string; messages: Record<string, unknown>[] }> {
  try {
    const res = await fetch(`${HUB_URL}/api/conversations/${encodeURIComponent(uid)}/messages?limit=50`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { agent: "", messages: [] };
    const data = (await res.json()) as { agent?: unknown; messages?: Record<string, unknown>[] };
    return { agent: asString(data?.agent), messages: Array.isArray(data?.messages) ? data.messages : [] };
  } catch {
    return { agent: "", messages: [] };
  }
}

export async function buildDestinations() {
  return Promise.all(DESTINATION_IDS.map(async (id) => {
    const draftPath = path.join(DRAFTS_DIR, `${id}.jsonl`);
    const drafts = (await readJsonlTail<Record<string, unknown>>(draftPath, 20, 64 * 1024))
      .map((d) => ({
        draftId: sanitizeText(asString(d.draftId), 80),
        text: sanitizeText(asString(d.text), MAX_REPLY_CHARS),
        status: sanitizeText(asString(d.status), 40) || "DRAFT_ONLY",
        createdAt: sanitizeText(asString(d.createdAt), 80),
      }))
      .filter((d) => d.text);
    let feed: Array<{ id: string; author: string; text: string; ts: string }> = [];
    let readStatus = "READ_MISSING";
    let bridgeStatus = "BRIDGE_MISSING";
    const feedChannel = DESTINATION_FEED_CHANNELS[id];
    if (feedChannel) {
      const r = await fetchTelegramFeed(feedChannel);
      if (r.ok && r.items.length > 0) {
        feed = r.items;
        bridgeStatus = "BRIDGE_LIVE";
        readStatus = "READ_CONNECTED";
      } else if (r.ok) {
        bridgeStatus = "BRIDGE_EMPTY";
        readStatus = "READ_EMPTY";
      }
    }
    const endpoint = `${HUB_URL}/api/telegram/${feedChannel ?? id}/recent`;
    const note = readStatus === "READ_CONNECTED"
      ? `Feed ${DESTINATION_LABELS[id] ?? id} lu depuis ${endpoint} · ${feed.length} messages.`
      : readStatus === "READ_EMPTY"
        ? `Endpoint ${DESTINATION_LABELS[id] ?? id} ${endpoint} connecté mais vide.`
        : id === "telegram_free"
      ? (readStatus === "READ_CONNECTED"
          ? `Feed Telegram Free lu depuis ${HUB_URL}/api/telegram/free/recent · ${feed.length} messages.`
          : `Endpoint Telegram Free ${HUB_URL}/api/telegram/free/recent indisponible ou vide; AMBER sans état messagerie.`)
      : `Endpoint ${DESTINATION_LABELS[id] ?? id} ${endpoint} absent ou indisponible — MISSING honnête. Aucun bridge ni message inventé.`;
    return {
      destinationId: id,
      label: DESTINATION_LABELS[id] ?? id,
      kind: "telegram",
      readStatus,
      writeStatus: "WRITE_LOCKED",
      bridgeStatus,
      note,
      feed,
      drafts,
      summary: "",
      updatedAt: new Date().toISOString(),
    };
  }));
}

export async function buildThread(packetId: string) {
  const packetPath = path.join(PACKETS_DIR, `${packetId}.json`);
  const responsePath = path.join(RESPONSES_DIR, `${packetId}.jsonl`);
  const packet = await readJsonFile<Record<string, unknown>>(packetPath);
  if (!packet) return null;

  const input = isRecord(packet.input) ? packet.input : {};
  const target = isRecord(packet.target) ? packet.target : {};
  const modelMode = isRecord(packet.modelMode) ? packet.modelMode : {};
  const paths = isRecord(packet.paths) ? packet.paths : {};
  const routes = Array.isArray(packet.routes) ? packet.routes.filter(isRecord) : [];
  const attachments = Array.isArray(input.attachments) ? input.attachments.filter(isRecord) : [];
  const responses = await readJsonlTail<Record<string, unknown>>(responsePath, 120, 256 * 1024);
  const actionMode = normalizeActionMode(packet.actionMode, packet.requestedMode);
  const approval = isRecord(packet.approval) ? packet.approval : {};
  const approvalRequired = approval.required === true;
  // Flux 4 — honore le cycle : granted=true → LOCAL_GREEN ; decision=REJECTED → BLOCKED ;
  // sinon (en attente) → APPROVAL_REQUIRED. Sans ça le thread resterait bloqué APPROVAL_REQUIRED après le 1-tap.
  const approvalDecision = sanitizeText(asString(approval.decision), 40).toUpperCase();
  const approvalGranted = approval.granted === true || !approvalRequired;
  const guardSummary = await readGuardSummary();
  const routeBuses = routes.map((route) => sanitizeText(asString(route.bus), 80)).filter(Boolean);
  const statusProjection = deriveHonestStatus({
    actionMode,
    approvalGranted,
    guardSummary,
    modelMode: isRecord(packet.modelMode) ? packet.modelMode as ConsoleModelMode : null,
    routeBuses,
  });
  if (approvalDecision === "REJECTED") {
    statusProjection.honestStatus.execute = "BLOCKED";
    const executeBadge = statusProjection.statusBadges.find((b) => b.id === "execute");
    if (executeBadge) { executeBadge.status = "BLOCKED"; executeBadge.tone = "red"; executeBadge.detail = "Rejeté par Erwin"; }
  }
  const whyStatus = buildWhyStatus({
    chatgptBriefPath: asString(paths.chatgptBriefPath) || null,
    executeApprovalRequired: approvalRequired,
    guardSummary,
    honestStatus: statusProjection.honestStatus,
    kevinPacketPath: asString(paths.kevinPacketPath) || null,
    packetPath,
    responsePath,
  });
  const timeline = buildPacketTimeline({
    actionMode,
    approvalRequired,
    guardStatus: statusProjection.honestStatus.guards,
    packet,
    packetHash: asString(packet.packetHash),
    responses,
  });
  const terminalReplyStatuses = new Set(["ANSWER", "DONE", "DONE_WITH_WATCH", "BLOCKED", "ERROR"]);
  const workingReplyStatuses = new Set(["ACK", "WORKING", "QUEUED", "PACKET_READY"]);

  // Une réponse est une VRAIE réponse agent uniquement si realReply===true,
  // kind==="AGENT_REPLY", ou (legacy) source===console_ia_local_agent_reply.
  // Tout le reste = accusé de réception worker (WORKER_ACK / ACK_LOCAL), pas une réponse agent.
  const isRealAgentReply = (response: Record<string, unknown>) => {
    if (response.realReply === true) return true;
    if (response.realReply === false) return false;
    const kind = sanitizeText(asString(response.kind), 40).toUpperCase();
    if (kind === "AGENT_REPLY") return true;
    if (kind === "WORKER_ACK" || kind === "ACK_LOCAL") return false;
    return asString(response.source) === "console_ia_local_agent_reply";
  };
  const realReplies = responses.filter(isRealAgentReply);

  const agentReplyStatus = new Map<string, string>();
  for (const response of realReplies) {
    const agentId = sanitizeText(asString(response.agentId), 80);
    const status = sanitizeText(asString(response.status), 80).toUpperCase();
    if (!agentId) continue;
    const previous = agentReplyStatus.get(agentId);
    if (!previous || terminalReplyStatuses.has(status) || (!terminalReplyStatuses.has(previous) && workingReplyStatuses.has(status))) {
      agentReplyStatus.set(agentId, status || "ANSWER");
    }
  }

  const adapterStatusToParticipantStatus = (status: string) => {
    const normalized = status.toUpperCase();
    if (normalized === "DESKTOP_QUEUE_READY" || normalized === "DESKTOP_BRIEF_READY") return "desktop_queue_ready";
    if (normalized === "ADAPTER_ERROR" || normalized === "ERROR") return "adapter_error";
    if (normalized === "ADAPTER_MISSING") return "adapter_missing";
    if (normalized === "DRAFT_ONLY") return "draft_only";
    if (normalized === "ACK" || normalized === "ACK_LOCAL") return "ack_local";
    if (normalized === "QUEUED" || normalized === "PACKET_READY") return "queued";
    return normalized ? normalized.toLowerCase() : "";
  };

  const agentAdapterStatus = new Map<string, string>();
  for (const response of responses) {
    if (isRealAgentReply(response)) continue;
    const agentId = sanitizeText(asString(response.agentId), 80);
    const status = sanitizeText(asString(response.status), 80);
    const kind = sanitizeText(asString(response.kind), 80).toUpperCase();
    if (!agentId || !status) continue;
    if (kind === "ADAPTER_STATUS" || asString(response.source) === "console_ia_agent_router") {
      agentAdapterStatus.set(agentId, status);
    }
  }

  // Statut honnête par bus quand AUCUNE vraie réponse (realReply=true) n'existe.
  // Les queues Desktop restent visibles, mais ne sont jamais comptées comme réponse agent.
  const busHonestStatus: Record<string, string> = {
    codex: "adapter_missing",
    claude: "adapter_missing",
    jarod: "adapter_missing",
    perplexity: "adapter_missing",
    tasks: "adapter_missing",
    central_council: "adapter_missing",
    chatgpt: "desktop_queue_ready",
    gemini: "desktop_queue_ready",
    qwen: "queued",
    kevin: "desktop_queue_ready",
    telegram_iron: "draft_only",
    telegram_free: "draft_only",
    telegram_vip: "draft_only",
    telegram_aeron: "draft_only",
    telegram_erwin: "draft_only",
  };

  const participants = await Promise.all(routes.map(async (route) => {
    const bus = sanitizeText(asString(route.bus), 80);
    const routePath = asString(route.path);
    const busLines = routePath ? await readJsonlTail<Record<string, unknown>>(routePath, 360, 256 * 1024) : [];
    const queued = busLines.some((line) => asString(line.packet_id) === packetId || asString(line.packetId) === packetId);
    const realStatus = agentReplyStatus.get(bus) ?? "";
    const adapterStatus = adapterStatusToParticipantStatus(agentAdapterStatus.get(bus) ?? "");
    // Une vraie réponse (realReply=true) gagne; sinon statut honnête du bus; sinon file/attente.
    const status = terminalReplyStatuses.has(realStatus)
      ? "answered"
      : workingReplyStatuses.has(realStatus)
        ? "working"
        : adapterStatus || (busHonestStatus[bus] ?? (queued ? "queued" : "pending"));
    return {
      id: bus,
      label: bus ? `${bus[0]?.toUpperCase() ?? ""}${bus.slice(1)}` : "Agent",
      status,
      path: routePath || null,
    };
  }));

  const ledgerEvents = (await readJsonlTail<Record<string, unknown>>(CONTROL_LEDGER, 240, 768 * 1024))
    .filter((entry) => (
      asString(entry.correlation_id) === packetId
      || (isRecord(entry.payload) && asString(entry.payload.packet_id) === packetId)
      || JSON.stringify(entry).includes(packetId)
    ))
    .slice(-16);

  const createdAt = sanitizeText(asString(packet.createdAt), 80) || new Date().toISOString();
  const attachmentSummary = attachments.length
    ? attachments
      .map((attachment) => {
        const kind = asString(attachment.kind) || "file";
        const name = asString(attachment.name) || "unnamed";
        const storedPath = asString(attachment.storedPath);
        return `- ${kind}: ${name}${storedPath ? ` (${storedPath})` : ""}`;
      })
      .join("\n")
    : "- aucune";

  const messages: ThreadMessage[] = [
    {
      id: `${packetId}:user`,
      role: "user",
      title: "Erwin",
      content: asString(packet.source)
        ? (asString(input.message) || "(commande vide)")
        : [
            asString(input.message) || "(message sans texte)",
            "",
            `Mode demandé: ${asString(modelMode.label) || "5.3 Spark"} (${asString(modelMode.model) || "gpt-5.3-codex-spark"} / ${asString(modelMode.reasoning) || "standard"})`,
            "",
            "Pièces jointes:",
            attachmentSummary,
          ].join("\n"),
      source: asString(packet.source) || undefined,
      createdAt,
      status: "sent",
    },
    {
      id: `${packetId}:router`,
      role: "central_brain",
      title: "Central Brain",
      content: [
        `Packet local créé pour ${asString(target.label) || asString(target.id) || "cible inconnue"}.`,
        `Mode: ${asString(modelMode.label) || "5.3 Spark"} · ${asString(modelMode.execution) || "bounded local lane"}.`,
        `Routes: ${routes.map((route) => asString(route.bus)).filter(Boolean).join(", ") || "aucune"}.`,
        `Mission packet: ${asString(paths.missionPath) || "unknown"}.`,
        asString(paths.chatgptBriefPath) ? `ChatGPT brief: ${asString(paths.chatgptBriefPath)}.` : "",
        asString(paths.kevinPacketPath) ? `Kevin packet: ${asString(paths.kevinPacketPath)}.` : "",
        "Aucun spawn lourd, aucun envoi externe, aucune API payante cachée.",
      ].filter(Boolean).join("\n"),
      createdAt,
      status: "queued",
    },
  ];

  for (const response of responses) {
    const agentId = sanitizeText(asString(response.agentId), 80) || "agent";
    const evidencePaths = Array.isArray(response.evidencePaths)
      ? response.evidencePaths.map((item) => sanitizeText(asString(item), 500)).filter(Boolean).slice(0, 12)
      : [];
    messages.push({
      id: sanitizeText(asString(response.responseId), 120) || `${packetId}:reply:${messages.length}`,
      role: "agent",
      title: sanitizeText(asString(response.agentLabel), 120) || agentId,
      content: sanitizeText(asString(response.content) || asString(response.message) || "(réponse vide)", MAX_REPLY_CHARS),
      createdAt: sanitizeText(asString(response.createdAt), 80) || createdAt,
      status: sanitizeText(asString(response.status), 80) || "ANSWER",
      agentId,
      evidencePaths,
    });
  }

  for (const event of ledgerEvents) {
    const payload = isRecord(event.payload) ? event.payload : {};
    const kind = sanitizeText(asString(event.kind) || asString(event.event), 120) || "central_brain_event";
    const eventHash = sanitizeText(asString(event.event_hash), 120);
    messages.push({
      id: `${packetId}:event:${eventHash || messages.length}`,
      role: "system",
      title: "Ledger Central Brain",
      content: [
        kind,
        asString(payload.summary) || asString(payload.next_action) || asString(payload.status) || "",
        eventHash ? `hash: ${eventHash}` : "",
      ].filter(Boolean).join("\n"),
      createdAt: sanitizeText(asString(event.ts) || asString(event.ts_utc), 80) || createdAt,
      status: sanitizeText(asString(event.status), 80) || "event",
      evidencePaths: Array.isArray(event.evidence_paths)
        ? event.evidence_paths.map((item) => sanitizeText(asString(item), 500)).filter(Boolean).slice(0, 8)
        : [],
    });
  }

	  const claudeTaskPath = path.join(CLAUDE_TASKS_DIR, `${packetId}.json`);
	  const chatgptBriefPath = asString(paths.chatgptBriefPath) || null;
	  const kevinPacketPath = asString(paths.kevinPacketPath) || null;
	  const workerAck = timeline.find((event) => event.type === "worker_ack");
	  const proofItems = await Promise.all([
	    buildPathProof({ id: "packet_file", label: "Packet file", path: packetPath }),
	    buildPathProof({ id: "response_jsonl", label: "Response JSONL", path: responsePath }),
	    buildPathProof({ id: "mission_packet", label: "Mission packet", path: asString(paths.missionPath) }),
	    ...(kevinPacketPath ? [buildPathProof({ id: "kevin_packet", label: "Kevin packet", path: kevinPacketPath })] : []),
	    ...(chatgptBriefPath ? [buildPathProof({ id: "chatgpt_brief", label: "ChatGPT brief", path: chatgptBriefPath })] : []),
	    buildPathProof({ id: "claude_task", label: "Claude task", path: await fileExists(claudeTaskPath) ? claudeTaskPath : null }),
	  ]);
	  const proofSummary = {
	    generatedAt: new Date().toISOString(),
	    sourceTag: SOURCE_TAG,
	    apiLive: {
	      status: "OK",
	      label: "API 3000 thread GET",
	      detail: "Thread chargé depuis /api/cofiatrading-world-control/console-ia",
	    },
	    items: [
	      ...proofItems,
	      {
	        id: "worker_ack",
	        label: "Worker ACK",
	        status: workerAck ? "OK" : "MISSING",
	        checkedAt: new Date().toISOString(),
	        timestamp: workerAck?.timestamp ?? null,
	        detail: workerAck ? workerAck.details ?? "ACK worker présent dans timeline" : "aucun worker_ack dans timeline",
	      },
	      {
	        id: "honest_status",
	        label: "Honest status",
	        status: "OK",
	        checkedAt: new Date().toISOString(),
	        detail: JSON.stringify(statusProjection.honestStatus),
	      },
	    ],
	  };
	  return {
	    packetId,
	    sourceTag: SOURCE_TAG,
	    status: realReplies.length > 0
      ? "THREAD_HAS_AGENT_REPLIES"
      : participants.some((participant) => participant.status === "adapter_error")
        ? "THREAD_ADAPTER_ERROR"
      : participants.some((participant) => participant.status === "adapter_missing")
        ? "THREAD_ADAPTER_MISSING"
        : participants.some((participant) => participant.status === "desktop_queue_ready")
          ? "THREAD_DESKTOP_QUEUE_READY"
        : participants.some((participant) => participant.status === "draft_only")
          ? "THREAD_DRAFT_ONLY"
          : participants.some((participant) => participant.status === "waiting")
            ? "THREAD_WAITING_FOR_AGENT"
            : "THREAD_WAITING_FOR_AGENT_REPLIES",
	    actionMode,
	    honestStatus: statusProjection.honestStatus,
	    statusBadges: statusProjection.statusBadges,
	    whyStatus,
	    timeline,
	    proofSummary,
	    target: {
      id: asString(target.id),
      label: asString(target.label),
      house: asString(target.house),
      owner: asString(target.owner),
    },
    modelMode: {
      id: asString(modelMode.id),
      label: asString(modelMode.label),
      provider: asString(modelMode.provider),
      model: asString(modelMode.model),
      reasoning: asString(modelMode.reasoning),
      scope: asString(modelMode.scope) || asString(modelMode.execution),
    },
    participants,
    messages: messages
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-80),
    paths: {
      packetPath,
      responsePath,
      missionPath: asString(paths.missionPath),
      uploadDir: asString(paths.uploadDir),
      chatgptBriefPath,
      kevinPacketPath,
      claudeTaskPath: await fileExists(claudeTaskPath) ? claudeTaskPath : null,
      controlLedger: CONTROL_LEDGER,
    },
    counts: {
      attachments: attachments.length,
      responses: responses.length,
      ledgerEvents: ledgerEvents.length,
    },
  };
}

export async function countPacketRealReplies(packetId: string): Promise<number> {
  const responsePath = path.join(RESPONSES_DIR, `${packetId}.jsonl`);
  const responses = await readJsonlTail<Record<string, unknown>>(responsePath, 120, 256 * 1024);
  return responses.filter((response) => {
    if (response.realReply === true) return true;
    if (response.realReply === false) return false;
    const kind = sanitizeText(asString(response.kind), 40).toUpperCase();
    if (kind === "AGENT_REPLY") return true;
    if (kind === "WORKER_ACK" || kind === "ACK_LOCAL") return false;
    return asString(response.source) === "console_ia_local_agent_reply";
  }).length;
}

// Vue multi-tour : assemble les turns user+agent de TOUS les packets du thread,
// méta depuis le dernier packet. realReplyCount recalculé live depuis responses (vérité,
// jamais stocké comme acquis ; un ACK worker ne compte jamais comme réponse).
export async function buildThreadView(threadId: string) {
  const trec = await readJsonFile<ThreadFile>(threadFilePath(threadId));
  if (!trec) return null;
  const packetIds = Array.isArray(trec.packetIds) ? trec.packetIds : [];
  if (!packetIds.length) return null;
  const built = await Promise.all(packetIds.map((pid) => buildThread(pid)));
  const valid = built.filter((item): item is NonNullable<typeof item> => item !== null);
  if (!valid.length) return null;
  const last = valid[valid.length - 1];
  const messages = valid
    .flatMap((view) => view.messages.filter((message) => message.role === "user" || message.role === "agent"))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
    .slice(-120);
  const realReplyCount = (await Promise.all(packetIds.map(countPacketRealReplies))).reduce((sum, count) => sum + count, 0);
  return {
    ...last,
    threadId,
    packetId: last.packetId,
    packetIds,
    turns: packetIds.length,
    realReplyCount,
    summary: trec.summary ?? "",
    status: realReplyCount > 0 ? "THREAD_HAS_AGENT_REPLIES" : last.status,
    messages,
  };
}

