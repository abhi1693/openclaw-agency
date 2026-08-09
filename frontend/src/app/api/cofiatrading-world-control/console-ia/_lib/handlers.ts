import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import { ACTION_MODES, ATTACHMENT_KINDS, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, MAX_MESSAGE_CHARS, MAX_TOTAL_ATTACHMENT_BYTES, SOURCE_TAG, asString, normalizeActionMode, sanitizeText } from "./schema";
import { normalizeAttachment, safeJoinInside, type AttachmentInput, type NormalizedAttachment } from "./securityPolicy";
import { deriveHonestStatus } from "./statusModel";
import { buildWhyStatus } from "./proofBuilder";
import { buildPacketTimeline } from "./timeline";
import { recordProofLedgerClaim } from "../../_lib/proofLedgerCoordination";
import { appendJsonl, readJsonFile, readJsonlTail, safeJson, shorten } from "./fsUtils";
import { ALLOWED_TARGETS, MODEL_MODES, TARGET_ROUTES, PACKETS_DIR, UPLOADS_DIR, RESPONSES_DIR, CHATGPT_BRIEFS_DIR, KEVIN_PACKETS_DIR, PACKETS_JSONL, AGENT_MESH_DIR, WARP_MISSION_PACKETS_DIR, CLAUDE_TASKS_DIR, INBOUND_DIR, EMAIL_RE, type ParsedRequest } from "./runtime";
import { normalizeModelMode, storeAttachments, readGuardSummary, renderMissionMarkdown, writeChatGptBrief, writeKevinPacket, createClaudeTask, publishCentralBrainEvent } from "./packetWriters";
import { ensureThread, appendUserTurn, buildThread, buildThreadView, resolveActiveThreadId, threadFilePath, buildDestinations, fetchConversationThreads, fetchConversationMessages, type ThreadFile } from "./threads";
import { crmLiteByTg, crmTotals, buildAllClients, buildDmPool, buildCockpit, buildClient360, readCapturedEmails, captureEmail } from "./crm";
import { isTakeoverActive } from "./conversation";

// Construction + persistance d'un packet console.IA (chemin POST par défaut, hors actions).
// Validation de sécurité (cibles, tailles, pièces jointes) incluse, puis écriture locale only.
export async function submitConsolePacket(parsed: ParsedRequest) {
  const body = parsed.body;
  const message = sanitizeText(asString(body.message));
  const targetId = sanitizeText(asString(body.targetId), 80);
  const targetLabel = sanitizeText(asString(body.targetLabel), 120) || targetId;
  const modelMode = normalizeModelMode(body);
  const requestedMode = sanitizeText(asString(body.requestedMode), 80) || "local_queue_packet";
  const actionMode = normalizeActionMode(body.actionMode, requestedMode);
  const approvalGranted = body.approval === true || body.approvalGranted === true;
  const approvalRequired = actionMode === "EXECUTE" && !approvalGranted;
  const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!message && rawAttachments.length === 0 && parsed.files.length === 0) {
    return NextResponse.json(
      { ok: false, error: "EMPTY_PACKET", required: ["message", "attachments"] },
      { status: 400 },
    );
  }
  if (!ALLOWED_TARGETS.has(targetId)) {
    return NextResponse.json(
      { ok: false, error: "TARGET_BLOCKED_OR_UNKNOWN", targetId, sourceTag: SOURCE_TAG },
      { status: 422 },
    );
  }
  if (Math.max(rawAttachments.length, parsed.files.length) > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { ok: false, error: `MAX_${MAX_ATTACHMENTS}_ATTACHMENTS`, sourceTag: SOURCE_TAG },
      { status: 413 },
    );
  }

  const attachmentCount = Math.max(rawAttachments.length, parsed.files.length);
  const attachmentsWithFiles: NormalizedAttachment[] = [];
  for (let index = 0; index < attachmentCount; index += 1) {
    const raw = (rawAttachments[index] ?? {}) as AttachmentInput;
    const normalized = normalizeAttachment(raw, parsed.files[index], index);
    if (!normalized.ok) {
      return NextResponse.json({ ok: false, error: normalized.error, sourceTag: SOURCE_TAG }, { status: 422 });
    }
    attachmentsWithFiles.push(normalized.value);
  }

  const totalBytes = attachmentsWithFiles.reduce((sum, item) => sum + item.sizeBytes, 0);
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { ok: false, error: "TOTAL_ATTACHMENT_BYTES_BLOCKED", sourceTag: SOURCE_TAG },
      { status: 413 },
    );
  }

  const timestamp = new Date().toISOString();
  const packetId = `cia_${timestamp.replace(/[^0-9TZ]/g, "").slice(0, 15)}_${targetId}`;
  // ÉTAPE 4 — résout/crée le thread de cet agent et y rattache ce packet (1 tour).
  const requestedThreadId = sanitizeText(asString(body.threadId), 140);
  const threadRecord = await ensureThread(targetId, modelMode.id, requestedThreadId, timestamp);
  const threadId = threadRecord.threadId;
  await mkdir(PACKETS_DIR, { recursive: true });
  await mkdir(AGENT_MESH_DIR, { recursive: true });
  await mkdir(WARP_MISSION_PACKETS_DIR, { recursive: true });

  const { stored: attachments, uploadDir } = await storeAttachments(packetId, attachmentsWithFiles);
  const routeConfig = TARGET_ROUTES[targetId] ?? TARGET_ROUTES.central_council;
  const routeBuses = approvalRequired
    ? []
    : Array.from(new Set([
      ...routeConfig.buses,
      ...(modelMode.id === "chatgpt_desktop" ? ["chatgpt"] : []),
      ...(modelMode.id === "kevin_gemini" ? ["kevin"] : []),
    ]));
  const routes = routeBuses.map((bus) => ({
    bus,
    path: path.join(AGENT_MESH_DIR, `${bus}_bus.jsonl`),
  }));
  const packetPath = path.join(PACKETS_DIR, `${packetId}.json`);
  const missionPath = path.join(WARP_MISSION_PACKETS_DIR, `${packetId}.md`);
  const shouldWriteChatGptBrief = routeBuses.includes("chatgpt");
  const shouldWriteKevinPacket = routeBuses.includes("kevin");
  const chatgptBriefPath = shouldWriteChatGptBrief ? path.join(CHATGPT_BRIEFS_DIR, `${packetId}.md`) : null;
  const kevinPacketPath = shouldWriteKevinPacket ? path.join(KEVIN_PACKETS_DIR, `${packetId}.json`) : null;
  const guardSummary = await readGuardSummary();
  const statusProjection = deriveHonestStatus({
    actionMode,
    approvalGranted,
    guardSummary,
    modelMode,
    routeBuses,
  });
  const whyStatus = buildWhyStatus({
    chatgptBriefPath,
    executeApprovalRequired: approvalRequired,
    guardSummary,
    honestStatus: statusProjection.honestStatus,
    kevinPacketPath,
    packetPath,
    responsePath: path.join(RESPONSES_DIR, `${packetId}.jsonl`),
  });
  const proofLedgerCoordination = await recordProofLedgerClaim({
    workerId: `console-ia:${targetId}`,
    workerLabel: `Console IA → ${targetLabel}`,
    origin: "console-ia-packet",
    sessionId: threadId,
    threadId,
    packetId,
    houseId: routeConfig.house || "central_brain",
    targetId,
    targetPath: packetPath,
    action: actionMode,
    summary: message || `${attachments.length} attachment(s)`,
    evidencePaths: [packetPath, missionPath],
    ttlSec: approvalRequired ? 86_400 : 7200,
    sourceTag: SOURCE_TAG,
  }).catch((error) => ({
    ok: false,
    status: "COORDINATION_CLAIM_FAILED",
    error: error instanceof Error ? error.message : "unknown coordination error",
  }));
  const responseStatus = approvalRequired ? "APPROVAL_REQUIRED_PACKET_STORED_LOCAL" : "PACKET_QUEUED_LOCAL";
  const responseMode = approvalRequired ? "LOCAL_PACKET_APPROVAL_REQUIRED" : "LOCAL_PACKET_RECORDED";

  const packet = {
    packetId,
    threadId,
    sourceTag: SOURCE_TAG,
    status: responseStatus,
    mode: responseMode,
    actionMode,
    requestedMode,
    createdAt: timestamp,
    modelMode,
    honestStatus: statusProjection.honestStatus,
    statusBadges: statusProjection.statusBadges,
    guardSummary,
    whyStatus,
    approval: {
      required: approvalRequired,
      granted: approvalGranted,
      reason: approvalRequired ? "EXECUTE requires explicit human approval" : null,
    },
    target: {
      id: targetId,
      label: targetLabel,
      owner: routeConfig.owner,
      house: routeConfig.house,
    },
    input: {
      message,
      messageChars: message.length,
      attachments,
      attachmentCount: attachments.length,
      attachmentBytes: totalBytes,
    },
    paths: {
      packetPath,
      missionPath,
      uploadDir,
      packetsJsonl: PACKETS_JSONL,
      chatgptBriefPath,
      kevinPacketPath,
    },
    routes,
    hardlocks: {
      noExternalSend: true,
      noPaidApiHiddenCall: true,
      noAnthropicCloud: true,
      noAutoSpawnHeavyAgentsFromRoute: true,
      executeRequiresApproval: true,
      browserPermissionRequiredForMicrophoneAndScreen: true,
      browserPermissionRequiredForCamera: true,
      chatGptLaneIsDesktopBriefOnlyNoOpenAiApi: true,
      kevinLaneIsGeminiPerceptionOnDemandOnly: true,
      filesStoredLocalOnly: true,
    },
    governor: {
      maxAttachments: MAX_ATTACHMENTS,
      maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
      maxTotalAttachmentBytes: MAX_TOTAL_ATTACHMENT_BYTES,
      maxMessageChars: MAX_MESSAGE_CHARS,
      routing: "agent_bus_and_claude_task_only_no_mission_queue_spawn",
    },
    proofLedgerCoordination,
  };
  const packetHash = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
  const missionMarkdown = renderMissionMarkdown(packet, packetHash);
  const timeline = buildPacketTimeline({
    actionMode,
    approvalRequired,
    guardStatus: statusProjection.honestStatus.guards,
    packet: { ...packet, packetHash },
    packetHash,
    responses: [],
  });

  await writeFile(packetPath, safeJson({ ...packet, packetHash }), "utf8");
  await writeFile(missionPath, missionMarkdown, "utf8");
  if (chatgptBriefPath) {
    await writeChatGptBrief(packet, packetHash, chatgptBriefPath);
  }
  if (kevinPacketPath) {
    await writeKevinPacket(packet, packetHash, kevinPacketPath);
  }
  await appendJsonl(PACKETS_JSONL, { ...packet, packetHash });
  await appendUserTurn(threadRecord, packetId, modelMode.id, timestamp);

  for (const route of routes) {
    await appendJsonl(route.path, {
      t: Math.floor(Date.now() / 1000),
      iso: timestamp,
      f: "console-ia",
      r: route.bus,
      k: "TASK",
      s: shorten(`[${routeConfig.title}] ${message || `${attachments.length} attachment(s)`} | packet=${packetId}`),
      packet_id: packetId,
      packet_path: packetPath,
      mission_packet_path: missionPath,
      model_mode: modelMode.id,
      model_label: modelMode.label,
      chatgpt_brief_path: chatgptBriefPath,
      kevin_packet_path: kevinPacketPath,
      source_tag: SOURCE_TAG,
    });
  }

  const claudeTask = routeBuses.includes("claude")
    ? await createClaudeTask(packetId, packetPath, missionPath, message, modelMode)
    : null;

  const event = await publishCentralBrainEvent(
    "console_ia_packet_queued",
    {
      packet_id: packetId,
      status: responseStatus,
      target_id: targetId,
      target_label: targetLabel,
      model_mode: modelMode,
      routes,
      packet_path: packetPath,
      mission_packet_path: missionPath,
      upload_dir: uploadDir,
      chatgpt_brief_path: chatgptBriefPath,
      kevin_packet_path: kevinPacketPath,
      claude_task: claudeTask,
      honest_status: statusProjection.honestStatus,
      approval_required: approvalRequired,
      proof_ledger_coordination: proofLedgerCoordination,
      summary: approvalRequired
        ? `console.IA EXECUTE packet stored for ${targetLabel}; approval required before dispatch`
        : `console.IA packet queued for ${targetLabel}`,
      next_action: approvalRequired
        ? "Human approval required before any real execution; no route bus dispatched."
        : "Agent local reads bus/task packet; no external send and no paid API.",
      source_tag: SOURCE_TAG,
    },
    [
      packetPath,
      missionPath,
      ...(chatgptBriefPath ? [chatgptBriefPath] : []),
      ...(kevinPacketPath ? [kevinPacketPath] : []),
      ...(claudeTask ? [claudeTask.taskPath, claudeTask.promptPath] : []),
    ],
  );
  const thread = (await buildThreadView(threadId)) ?? (await buildThread(packetId));

  return NextResponse.json(
    {
	      ok: true,
	      sourceTag: SOURCE_TAG,
	      status: responseStatus,
	      mode: responseMode,
	      actionMode,
	      packetId,
	      threadId,
	      turns: threadRecord.packetIds.length,
	      packetHash,
	      modelMode,
	      honestStatus: statusProjection.honestStatus,
	      statusBadges: statusProjection.statusBadges,
	      whyStatus,
	      timeline,
	      approval: packet.approval,
	      proofLedgerCoordination,
	      packet,
      files: attachments.map((item) => ({
        name: item.name,
        kind: item.kind,
        storedPath: item.storedPath,
        sizeBytes: item.sizeBytes,
      })),
      routes,
      chatgptBriefPath,
      kevinPacketPath,
      claudeTask,
      eventHash: event.event_hash ?? null,
      thread,
      warnings: [
        "NO_EXTERNAL_SEND",
        "NO_HIDDEN_PAID_API_CALL",
        "NO_ANTHROPIC_CLOUD",
        "NO_AUTO_SPAWN_HEAVY_AGENTS_FROM_ROUTE",
      ],
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

// Lectures read-only console.IA (destinations, conversations, CRM, threads, packet, info route).
export async function handleConsoleGet(request: Request) {
  const url = new URL(request.url);

  // ÉTAPE 3 — destinations (canaux opérationnels) ; statuts honnêtes, aucun feed inventé.
  if (url.searchParams.get("destinations")) {
    const destinations = await buildDestinations();
    return NextResponse.json(
      { ok: true, sourceTag: SOURCE_TAG, destinations },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Commandes Erwin entrantes (Telegram) ingérées — read-only.
  if (url.searchParams.get("commands")) {
    let commands: Record<string, unknown>[] = [];
    try {
      commands = await readJsonlTail<Record<string, unknown>>(path.join(INBOUND_DIR, "_index.jsonl"), 50, 128 * 1024);
    } catch {
      commands = [];
    }
    commands = commands.slice(-30).reverse();
    return NextResponse.json({ ok: true, sourceTag: SOURCE_TAG, commands }, { headers: { "Cache-Control": "no-store" } });
  }

  // Inbox conversations clients (read-only). Liste des threads.
  if (url.searchParams.get("conversations")) {
    const raw = await fetchConversationThreads();
    const byTg = await crmLiteByTg();  // Flux 7 — heat-map depuis la DB CRM live
    const threads = raw.map((t) => {
      const userId = String(t.user_id ?? "");
      const c = byTg[userId] ?? null;
      return {
        userId,
        name: asString(t.first_name) || asString(t.username) || `#${String(t.user_id ?? "?")}`,
        username: asString(t.username),
        agent: asString(t.agent),
        stage: asString(t.stage),
        unread: Number(t.unread_count ?? 0) || 0,
        vip: t.vip_flag === 1 || t.vip_flag === true,
        intentScore: typeof t.intent_score === "number" ? t.intent_score : null,
        lastPreview: sanitizeText(asString(t.last_msg_preview), 90),
        lastDirection: asString(t.last_msg_direction),
        lastTs: asString(t.last_msg_ts_str),
        totalMessages: Number(t.total_messages ?? 0) || 0,
        sourceChannel: asString(t.source_channel),
        muted: t.muted === true,
        // Flux 7 — données CRM live (heat-map avant clic)
        crmFound: !!c,
        crmTemp: c?.temp ?? "",
        crmScore: c?.score ?? null,
        crmTier: c?.tier ?? "",
        crmStripe: c?.stripe ?? "",
        crmIsClient: c?.isClient ?? false,
        depositUsd: c?.firstDep ?? null,
      };
    });
    return NextResponse.json({ ok: true, sourceTag: SOURCE_TAG, threads, totals: await crmTotals() }, { headers: { "Cache-Control": "no-store" } });
  }

  // Flux 7 — vue "Tous les clients" : toute la base CRM live classée chaud + dépôt.
  if (url.searchParams.get("allclients")) {
    return NextResponse.json(
      { ok: true, sourceTag: SOURCE_TAG, clients: await buildAllClients(), totals: await crmTotals() },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Flux 8 — pool DM Telethon : contacts Telegram réels contactables (hors clients CRM).
  if (url.searchParams.get("dmpool")) {
    return NextResponse.json(
      { ok: true, sourceTag: SOURCE_TAG, clients: await buildDmPool(), totals: await crmTotals() },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Flux 11 — cockpit vue d'ensemble (argent + santé), repris de l'ancien hub (endpoints vivants).
  if (url.searchParams.get("cockpit")) {
    return NextResponse.json(
      { ok: true, sourceTag: SOURCE_TAG, cockpit: await buildCockpit() },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Transcript d'un client (read-only).
  const conversationUid = sanitizeText(url.searchParams.get("conversation") ?? "", 40);
  if (conversationUid) {
    const conv = await fetchConversationMessages(conversationUid);
    const messages = conv.messages.map((m) => ({
      ts: asString(m.ts),
      direction: asString(m.direction),
      by: asString(m.by),
      text: sanitizeText(asString(m.text), 1200),
    }));
    // Flux 9 — capture l'email si le client l'a donné (messages entrants). Dernier email = courant.
    let capturedEmail = (await readCapturedEmails())[conversationUid] || "";
    for (const m of messages) {
      if (m.direction.toUpperCase() === "IN") {
        const found = m.text.match(EMAIL_RE);
        if (found) { capturedEmail = found[0].toLowerCase(); await captureEmail(conversationUid, capturedEmail, "conversation_in"); }
      }
    }
    return NextResponse.json(
      { ok: true, sourceTag: SOURCE_TAG, userId: conversationUid, agent: conv.agent, messages, takeover: await isTakeoverActive(conversationUid), capturedEmail },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Flux 6 — profil CRM 360 d'un client par telegram_id.
  const clientUid = sanitizeText(url.searchParams.get("client") ?? "", 40);
  if (clientUid) {
    return NextResponse.json(
      { ok: true, sourceTag: SOURCE_TAG, profile: await buildClient360(clientUid) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ÉTAPE 3/4 — thread par threadId ou agent actif (targetId). threadId stable :
  // un refresh recharge le thread, un retour sur un agent reprend SON thread.
  const threadIdParam = sanitizeText(url.searchParams.get("threadId") ?? "", 140);
  const targetIdParam = sanitizeText(url.searchParams.get("targetId") ?? "", 80);
  if (threadIdParam || targetIdParam) {
    let tid = threadIdParam;
    if (!tid && targetIdParam) tid = await resolveActiveThreadId(targetIdParam);
    const trec = tid ? await readJsonFile<ThreadFile>(threadFilePath(tid)) : null;
    if (!trec || !trec.lastPacketId) {
      return NextResponse.json(
        { ok: true, sourceTag: SOURCE_TAG, status: "THREAD_EMPTY", threadId: tid || null, turns: 0, thread: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const thread = await buildThreadView(tid);
    if (!thread) {
      return NextResponse.json(
        { ok: true, sourceTag: SOURCE_TAG, status: "THREAD_EMPTY", threadId: tid, turns: 0, thread: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, sourceTag: SOURCE_TAG, status: thread.status, threadId: tid, turns: thread.turns, thread },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const packetId = sanitizeText(url.searchParams.get("packetId") ?? "", 140);
  if (packetId) {
    const thread = await buildThread(packetId);
    if (!thread) {
      return NextResponse.json({ ok: false, error: "PACKET_NOT_FOUND", packetId, sourceTag: SOURCE_TAG }, { status: 404 });
    }
    return NextResponse.json(
      {
        ok: true,
        sourceTag: SOURCE_TAG,
        status: "THREAD_READY_LOCAL",
        thread,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
	  }

  const guardSummary = await readGuardSummary();
  const statusProjection = deriveHonestStatus({
    actionMode: "ASK",
    approvalGranted: true,
    guardSummary,
    modelMode: null,
    routeBuses: [],
  });
  const whyStatus = buildWhyStatus({
    executeApprovalRequired: false,
    guardSummary,
    honestStatus: statusProjection.honestStatus,
    packetPath: PACKETS_DIR,
    responsePath: RESPONSES_DIR,
  });

	  return NextResponse.json({
	    ok: true,
	    sourceTag: SOURCE_TAG,
	    endpoint: "POST /api/cofiatrading-world-control/console-ia",
	    mode: "LOCAL_PACKET_READY",
	    status: "LOCAL_PACKET_ROUTE_READY",
	    honestStatus: statusProjection.honestStatus,
	    statusBadges: statusProjection.statusBadges,
	    whyStatus,
	    actionModes: ACTION_MODES,
	    targets: Array.from(ALLOWED_TARGETS),
	    modelModes: Object.values(MODEL_MODES),
	    attachmentKinds: ATTACHMENT_KINDS,
    paths: {
      packetsDir: PACKETS_DIR,
      uploadsDir: UPLOADS_DIR,
      responsesDir: RESPONSES_DIR,
      chatgptBriefsDir: CHATGPT_BRIEFS_DIR,
      kevinPacketsDir: KEVIN_PACKETS_DIR,
      packetsJsonl: PACKETS_JSONL,
      agentMeshDir: AGENT_MESH_DIR,
      missionPacketsDir: WARP_MISSION_PACKETS_DIR,
      claudeTasksDir: CLAUDE_TASKS_DIR,
    },
    limits: {
      maxMessageChars: MAX_MESSAGE_CHARS,
      maxAttachments: MAX_ATTACHMENTS,
      maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
      maxTotalAttachmentBytes: MAX_TOTAL_ATTACHMENT_BYTES,
    },
    hardlocks: [
      "no external send",
      "no hidden paid API call",
      "no Anthropic Cloud/API",
      "no OpenAI API for ChatGPT Central Brain lane",
      "no auto-spawn heavy agents from this route",
      "browser permission required for microphone/camera/screen",
      "Kevin/Gemini perception is on-demand only, no continuous camera",
    ],
  });
}
