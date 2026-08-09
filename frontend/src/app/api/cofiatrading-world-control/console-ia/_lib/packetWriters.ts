import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { asString, isRecord, sanitizeText, SOURCE_TAG, type ConsoleModelMode, type HonestStatus, type StoredAttachment } from "./schema";
import { safeJoinInside, type NormalizedAttachment } from "./securityPolicy";
import { type GuardStatusSummary } from "./statusModel";
import { isFileLike, readJsonFile, safeJson } from "./fsUtils";
import { execFileAsync, MODEL_MODES, UPLOADS_DIR, CHATGPT_BRIEFS_DIR, KEVIN_PACKETS_DIR, PROMPTS_DIR, CLAUDE_TASKS_DIR, EVENT_BUS_SCRIPT_DIR, ROUTE_COHERENCE_REPORT, SESSION_COACH_REPORT, SELF_CHALLENGE_REPORT, PAID_API_GUARD_REPORT, type ParsedRequest } from "./runtime";

export const normalizeModelMode = (body: Record<string, unknown>): ConsoleModelMode => {
  const explicitId = sanitizeText(asString(body.modelModeId), 80);
  const nested = isRecord(body.modelMode) ? sanitizeText(asString(body.modelMode.id), 80) : "";
  const id = explicitId || nested || "spark_5_3";
  return MODEL_MODES[id as keyof typeof MODEL_MODES] ?? MODEL_MODES.spark_5_3;
};

export async function parseRequest(request: Request): Promise<ParsedRequest> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const payloadRaw = asString(formData.get("payload"));
    const body = payloadRaw ? JSON.parse(payloadRaw) as Record<string, unknown> : {};
    const files = Array.from(formData.entries())
      .filter(([key, value]) => key.startsWith("attachment_") && isFileLike(value))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value as File);
    return { body, files };
  }
  return { body: (await request.json()) as Record<string, unknown>, files: [] };
}

export async function storeAttachments(packetId: string, attachments: NormalizedAttachment[]) {
  const uploadDir = path.join(UPLOADS_DIR, packetId);
  await mkdir(uploadDir, { recursive: true });
  const stored: StoredAttachment[] = [];

  for (const attachment of attachments) {
    let storedPath: string | null = null;
    if (attachment.file) {
      const safePath = safeJoinInside(uploadDir, `${attachment.id}_${attachment.name}`);
      if (!safePath.ok) throw new Error(safePath.error);
      storedPath = safePath.path;
      const buffer = Buffer.from(await attachment.file.arrayBuffer());
      await writeFile(storedPath, buffer);
    }
    stored.push({
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      capturedAt: attachment.capturedAt,
      note: attachment.note,
      storedPath,
      trust: "UNTRUSTED_INPUT",
    });
  }
  return { stored, uploadDir };
}

export const statusFromGuardValue = (value: unknown): HonestStatus => {
  const normalized = sanitizeText(asString(value), 80).toUpperCase();
  if (normalized === "GREEN" || normalized === "OK" || normalized === "PASS") return "LOCAL_GREEN";
  if (normalized === "BLOCKED" || normalized === "BLOCK" || normalized === "ERROR" || normalized === "FAIL") return "BLOCKED";
  return "WATCH";
};

export async function readGuardSummary(): Promise<GuardStatusSummary> {
  const route = await readJsonFile<Record<string, unknown>>(ROUTE_COHERENCE_REPORT);
  const sessionCoach = await readJsonFile<Record<string, unknown>>(SESSION_COACH_REPORT);
  const selfChallenge = await readJsonFile<Record<string, unknown>>(SELF_CHALLENGE_REPORT);
  const paidApi = await readJsonFile<Record<string, unknown>>(PAID_API_GUARD_REPORT);
  const routeStatus = statusFromGuardValue(route?.verdict);
  const sessionStatus = statusFromGuardValue(sessionCoach?.status);
  const selfStatus = selfChallenge?.decision_allowed === true
    ? statusFromGuardValue(selfChallenge?.verdict)
    : "WATCH";
  const paidStatus = paidApi?.ok === true && sanitizeText(asString(paidApi.status), 80).toUpperCase() === "GREEN"
    ? "LOCAL_GREEN"
    : statusFromGuardValue(paidApi?.status);

  return {
    routeCoherence: routeStatus,
    sessionCoach: sessionStatus,
    selfChallenge: selfStatus,
    paidApiGuard: paidStatus,
    reasons: [
      `route_coherence ${asString(route?.verdict) || "UNKNOWN"}${routeStatus === "WATCH" ? " non bloquant" : ""}`,
      `session_coach ${asString(sessionCoach?.status) || "UNKNOWN"}${sessionStatus === "WATCH" ? " non bloquant" : ""}`,
      `self_challenge ${asString(selfChallenge?.verdict) || "UNKNOWN"}`,
      `paid_api_guard ${asString(paidApi?.status) || "UNKNOWN"}`,
    ],
  };
}

export const renderMissionMarkdown = (packet: Record<string, unknown>, packetHash: string) => {
  const target = packet.target as { id: string; label: string };
  const input = packet.input as { message: string; attachments: StoredAttachment[] };
  const routes = packet.routes as Array<{ bus: string; path: string }>;
  const modelMode = packet.modelMode as ConsoleModelMode | undefined;
  const paths = packet.paths as Record<string, string | null | undefined>;
  const coordination = isRecord(packet.proofLedgerCoordination) ? packet.proofLedgerCoordination : {};
  return [
    "---",
    "type: console-ia-packet",
    `source_tag: ${SOURCE_TAG}`,
    `packet_id: ${packet.packetId}`,
    `packet_hash: ${packetHash}`,
    `target: ${target.id}`,
    `created_at: ${packet.createdAt}`,
    "---",
    "",
    `# console.IA packet — ${target.label}`,
    "",
    "## Message",
    "",
    input.message || "(piece jointe sans texte)",
    "",
    "## Modèle / lane demandée",
    "",
    modelMode
      ? `- ${modelMode.label} | provider=${modelMode.provider} | model=${modelMode.model} | reasoning=${modelMode.reasoning} | execution=${modelMode.execution}`
      : "- 5.3 Spark | default local bounded lane",
    "",
    "## Pieces jointes",
    "",
    ...(
      input.attachments.length
        ? input.attachments.map((item) => `- ${item.kind} | ${item.name} | ${item.sizeBytes} bytes | ${item.storedPath ?? "metadata-only"}`)
        : ["- aucune"]
    ),
    "",
    "## Routes locales",
    "",
    ...routes.map((route) => `- ${route.bus}: ${route.path}`),
    paths.chatgptBriefPath ? `- chatgpt_brief: ${paths.chatgptBriefPath}` : "",
    paths.kevinPacketPath ? `- kevin_packet: ${paths.kevinPacketPath}` : "",
    "",
    "## Proof Ledger coordination",
    "",
    `- decision: ${asString(coordination.decision) || asString(coordination.status) || "CLAIM_RECORDED_LOCAL"}`,
    `- claim_id: ${isRecord(coordination.claim) ? asString(coordination.claim.id) : "see proof_ledger_coordination claims.jsonl"}`,
    `- source: ${asString(coordination.sourceTag) || "PROOF_LEDGER_COORDINATION_BUS_LOCAL_V1_20260601"}`,
    "",
    "## Répondre dans le chat console.IA",
    "",
    "Poster une réponse locale, sans API externe :",
    "",
    "```bash",
    `curl -sS -X POST http://127.0.0.1:3000/api/cofiatrading-world-control/console-ia \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  --data '{"action":"agent_reply","packetId":"${packet.packetId}","agentId":"<agent_id>","agentLabel":"<agent_label>","status":"ANSWER","content":"<réponse courte avec preuve>","evidencePaths":["<path>"]}'`,
    "```",
    "",
    "Statuts conseillés : ACK, WORKING, ANSWER, DONE_WITH_WATCH, BLOCKED, ERROR.",
    "",
    "## Hardlocks",
    "",
    "- no Anthropic Cloud/API",
    "- no hidden paid API",
    "- no external send",
    "- no auto-spawn heavy agents from this route",
    "- local files only",
    "",
  ].join("\n");
};

export async function writeChatGptBrief(packet: Record<string, unknown>, packetHash: string, briefPath: string) {
  const target = packet.target as { id: string; label: string };
  const input = packet.input as { message: string; attachments: StoredAttachment[] };
  const modelMode = packet.modelMode as ConsoleModelMode;
  await mkdir(CHATGPT_BRIEFS_DIR, { recursive: true });
  const brief = [
    `source_tag: ${SOURCE_TAG}`,
    `packet_id: ${packet.packetId}`,
    `packet_hash: ${packetHash}`,
    "",
    "# ChatGPT Desktop local brief",
    "",
    "Ce fichier est le pont autorisé vers ChatGPT Desktop/Projet COFIATRADING.",
    "Hardlock: aucune clé OpenAI, aucun SDK, aucun appel api.openai.com depuis Central Brain.",
    "",
    `Target: ${target.label} (${target.id})`,
    `Mode: ${modelMode.label} / ${modelMode.model} / ${modelMode.reasoning}`,
    "",
    "## Message Erwin",
    "",
    input.message || "(pièces jointes sans texte)",
    "",
    "## Pièces jointes locales",
    "",
    ...(
      input.attachments.length
        ? input.attachments.map((item) => `- ${item.kind} | ${item.name} | ${item.storedPath ?? "metadata-only"}`)
        : ["- aucune"]
    ),
    "",
    "## Réponse attendue",
    "",
    `Répondre dans console.IA via POST agent_reply sur packetId=${packet.packetId}.`,
    "",
  ].join("\n");
  await writeFile(briefPath, brief, "utf8");
}

export async function writeKevinPacket(packet: Record<string, unknown>, packetHash: string, kevinPacketPath: string) {
  const input = packet.input as { message: string; attachments: StoredAttachment[] };
  await mkdir(KEVIN_PACKETS_DIR, { recursive: true });
  const attachmentKinds = input.attachments.map((item) => item.kind);
  await writeFile(
    kevinPacketPath,
    safeJson({
      sourceTag: SOURCE_TAG,
      packetId: packet.packetId,
      packetHash,
      target: packet.target,
      modelMode: packet.modelMode,
      createdAt: packet.createdAt,
      message: input.message,
      attachments: input.attachments,
      kevin: {
        identity: "Kevin = Gemini perception lane",
        house: "mission_control_tower",
        capabilities: {
          screen: attachmentKinds.includes("screen"),
          camera: attachmentKinds.includes("camera"),
          audioAttachment: attachmentKinds.includes("audio"),
          geminiVisionModel: "gemini-2.5-flash",
          onDemandOnly: true,
          noContinuousCamera: true,
          noHiddenPaidOpenAiOrAnthropicApi: true,
        },
        note: "Le hub fournit les captures volontaires. Le runtime Kevin/Gemini peut consommer ce packet sans activer une caméra permanente.",
      },
    }),
    "utf8",
  );
}

export async function createClaudeTask(
  packetId: string,
  packetPath: string,
  missionPath: string,
  message: string,
  modelMode: ConsoleModelMode,
) {
  const promptPath = path.join(PROMPTS_DIR, `${packetId}.md`);
  const taskPath = path.join(CLAUDE_TASKS_DIR, `${packetId}.json`);
  await mkdir(PROMPTS_DIR, { recursive: true });
  await mkdir(CLAUDE_TASKS_DIR, { recursive: true });

  const prompt = [
    `source_tag: ${SOURCE_TAG}`,
    "",
    "Tu es Claude local via Claude Code CLI Erwin. Interdiction Anthropic Cloud/API.",
    "Mission: traiter ce packet console.IA en local, lire les preuves, repondre par handoff court, ne pas envoyer externe.",
    "",
    `Packet JSON: ${packetPath}`,
    `Mission packet: ${missionPath}`,
    `Mode demandé: ${modelMode.label} / ${modelMode.model} / ${modelMode.reasoning}`,
    "",
    "Quand ta réponse est prête, poste-la dans le thread console.IA via POST /api/cofiatrading-world-control/console-ia avec action=agent_reply, packetId, agentId, content, evidencePaths.",
    "",
    "Message Erwin:",
    message || "(piece jointe sans texte)",
  ].join("\n");
  await writeFile(promptPath, prompt, "utf8");

  const task = {
    task_id: packetId,
    type: "codex_claude_order",
    source: "CONSOLE_IA_CENTRAL_BRAIN",
    source_tag: SOURCE_TAG,
    created_at_utc: new Date().toISOString(),
    status: "queued_console_ia_local",
    title: `console.IA packet ${packetId}`,
    objective: "Traiter un packet console.IA local avec preuves et handoff, sans API cloud ni envoi externe.",
    owner: "Claude local",
    reviewer: "Codex",
    runtime: "local_claude_cli",
    requested_model_mode: modelMode,
    requested_account: "current_local_claude_auth",
    requires_go: false,
    max_turns: 50,
    timeout_sec: 1800,
    permission_mode: "acceptEdits",
    prompt_path: promptPath,
    packet_path: packetPath,
    mission_packet_path: missionPath,
    forbidden_paths: [
      "ANTHROPIC_API_KEY",
      "api.anthropic.com",
      "anthropic/*",
      "claude_oauth.py",
    ],
  };
  await writeFile(taskPath, safeJson(task), "utf8");
  return { taskPath, promptPath };
}

export async function publishCentralBrainEvent(kind: string, payload: Record<string, unknown>, evidencePaths: string[]) {
  const script = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(EVENT_BUS_SCRIPT_DIR)})`,
    "from event_bus import publish_event",
    "payload = json.loads(sys.argv[1])",
    "res = publish_event(",
    "  payload.get('kind', 'console_ia_event'),",
    "  payload,",
    "  agent_id='codex',",
    "  house_id='central_brain',",
    "  severity='INFO',",
    "  evidence_paths=payload.get('evidence_paths', []),",
    "  correlation_id=payload.get('packet_id'),",
    ")",
    "print(json.dumps(res, ensure_ascii=False))",
  ].join("\n");
  try {
    const result = await execFileAsync("/usr/bin/python3", ["-c", script, JSON.stringify({ kind, ...payload, evidence_paths: evidencePaths })], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    return JSON.parse(String(result.stdout ?? "")) as { ok?: boolean; event_hash?: string };
  } catch (error) {
    return {
      ok: false,
      event_hash: null,
      error: error instanceof Error ? error.message : "EVENT_BUS_FAILED",
    };
  }
}
