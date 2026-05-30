import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { mkdir, open, readFile, stat as statFile, writeFile } from "fs/promises";
import { appendFileSync } from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";

import { buildWhyStatus } from "./_lib/proofBuilder";
import {
  ACTION_MODES,
  ATTACHMENT_KINDS,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_MESSAGE_CHARS,
  MAX_REPLY_CHARS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  SOURCE_TAG,
  asString,
  isRecord,
  normalizeActionMode,
  sanitizeText,
  type ConsoleModelMode,
  type HonestStatus,
  type StoredAttachment,
} from "./_lib/schema";
import { normalizeAttachment, safeJoinInside, type AttachmentInput, type NormalizedAttachment } from "./_lib/securityPolicy";
import { deriveHonestStatus, type GuardStatusSummary } from "./_lib/statusModel";
import { buildPacketTimeline } from "./_lib/timeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOME = os.homedir();
const OPENCLAW_ROOT = path.join(HOME, ".openclaw");
const STATE_ROOT = path.join(OPENCLAW_ROOT, "state");
const CONSOLE_STATE_DIR = path.join(STATE_ROOT, "console_ia");
const PACKETS_DIR = path.join(CONSOLE_STATE_DIR, "packets");
const UPLOADS_DIR = path.join(CONSOLE_STATE_DIR, "uploads");
const PROMPTS_DIR = path.join(CONSOLE_STATE_DIR, "prompts");
const RESPONSES_DIR = path.join(CONSOLE_STATE_DIR, "responses");
const CHATGPT_BRIEFS_DIR = path.join(CONSOLE_STATE_DIR, "chatgpt_briefs");
const KEVIN_PACKETS_DIR = path.join(CONSOLE_STATE_DIR, "kevin_packets");
const PACKETS_JSONL = path.join(CONSOLE_STATE_DIR, "packets.jsonl");
const AGENT_MESH_DIR = path.join(STATE_ROOT, "agent_mesh");
const WARP_AGENT_MESH_DIR = path.join(STATE_ROOT, "warp", "agent_mesh");
const WARP_MISSION_PACKETS_DIR = path.join(STATE_ROOT, "warp", "agent_mesh", "mission_packets");
const CLAUDE_TASKS_DIR = path.join(OPENCLAW_ROOT, "automation", "claude-tasks");
const EVENT_BUS_SCRIPT_DIR = path.join(OPENCLAW_ROOT, "scripts", "central_brain");
const CONTROL_LEDGER = path.join(WARP_AGENT_MESH_DIR, "control_ledger.jsonl");
const ROUTE_COHERENCE_REPORT = path.join(WARP_AGENT_MESH_DIR, "route_coherence_report.json");
const SESSION_COACH_REPORT = path.join(WARP_AGENT_MESH_DIR, "central_brain_session_coach_latest.json");
const SELF_CHALLENGE_REPORT = path.join(WARP_AGENT_MESH_DIR, "self_challenge_report.json");
const PAID_API_GUARD_REPORT = path.join(STATE_ROOT, "central_brain_paid_api_guard", "latest.json");

const ALLOWED_TARGETS = new Set([
  "central_council",
  "codex_local",
  "claude_local",
  "chatgpt_sync",
  "kevin_gemini",
  "qwen_local",
  "jarod_openclaw",
  "agents_by_house",
  "perplexity_local",
  "telegram_iron",
  "telegram_free",
  "telegram_vip",
  "telegram_erwin",
]);

const MODEL_MODES = {
  spark_5_3: {
    id: "spark_5_3",
    label: "5.3 Spark",
    provider: "codex_local",
    model: "gpt-5.3-codex-spark",
    reasoning: "standard",
    execution: "bounded_local_codex_lane",
    hardlock: "no_api_key_no_external_call",
  },
  codex_5_5: {
    id: "codex_5_5",
    label: "5.5 approfondi",
    provider: "codex_local",
    model: "gpt-5.5",
    reasoning: "high",
    execution: "local_codex_deep_lane",
    hardlock: "no_api_key_no_external_call",
  },
  codex_5_5_xhigh: {
    id: "codex_5_5_xhigh",
    label: "5.5 très approfondi",
    provider: "codex_local",
    model: "gpt-5.5",
    reasoning: "xhigh",
    execution: "local_codex_critical_lane",
    hardlock: "reserved_for_high_risk_or_cross_system_conflicts",
  },
  chatgpt_desktop: {
    id: "chatgpt_desktop",
    label: "ChatGPT Desktop",
    provider: "chatgpt_local_desktop",
    model: "local-app-brief-sync",
    reasoning: "high",
    execution: "brief_sync_no_openai_api",
    hardlock: "no_OPENAI_API_KEY_no_api_openai_com",
  },
  kevin_gemini: {
    id: "kevin_gemini",
    label: "Kevin / Gemini",
    provider: "gemini_local_perception",
    model: "gemini-2.5-flash",
    reasoning: "visual",
    execution: "screen_camera_audio_packet_to_kevin_lane",
    hardlock: "on_demand_only_no_continuous_camera",
  },
  // Lanes par agent (alignées avec ConsoleIAOverlay.tsx MODEL_MODES).
  // Lanes internes COFIATRADING : aucune n'appelle d'API cachée ; le routing
  // adapter réel est porté par l'agent (bus), pas par la lane.
  codex_patch: { id: "codex_patch", label: "Codex patch", provider: "codex_local", model: "gpt-5.3-codex-spark", reasoning: "standard", execution: "bounded_local_codex_patch_lane", hardlock: "no_api_key_no_external_call" },
  codex_tests: { id: "codex_tests", label: "Codex tests", provider: "codex_local", model: "gpt-5.3-codex-spark", reasoning: "standard", execution: "bounded_local_codex_tests_lane", hardlock: "no_api_key_no_external_call" },
  claude_4_7: { id: "claude_4_7", label: "Claude 4.7", provider: "claude_local_oauth", model: "claude-4-7", reasoning: "high", execution: "claude_cli_oauth_lane", hardlock: "no_anthropic_api_oauth_only" },
  claude_4_8: { id: "claude_4_8", label: "Claude 4.8", provider: "claude_local_oauth", model: "claude-4-8", reasoning: "high", execution: "claude_cli_oauth_lane", hardlock: "no_anthropic_api_oauth_only" },
  claude_4_8_high: { id: "claude_4_8_high", label: "Claude 4.8 high", provider: "claude_local_oauth", model: "claude-4-8", reasoning: "high", execution: "claude_cli_oauth_lane", hardlock: "no_anthropic_api_oauth_only" },
  claude_4_8_max_high: { id: "claude_4_8_max_high", label: "Claude 4.8 max high", provider: "claude_local_oauth", model: "claude-4-8", reasoning: "xhigh", execution: "claude_cli_oauth_lane", hardlock: "no_anthropic_api_oauth_only" },
  claude_memory_qa: { id: "claude_memory_qa", label: "Claude mémoire / QA", provider: "claude_local_oauth", model: "claude-cli-local", reasoning: "standard", execution: "claude_cli_oauth_lane", hardlock: "no_anthropic_api_oauth_only" },
  qwen_local: { id: "qwen_local", label: "Qwen local", provider: "qwen_local_proxy", model: "qwen-plus", reasoning: "standard", execution: "rtk_llm_proxy_local_lane", hardlock: "local_proxy_non_anthropic" },
  qwen_cheap_bulk: { id: "qwen_cheap_bulk", label: "Qwen cheap bulk", provider: "qwen_local_proxy", model: "qwen-turbo", reasoning: "standard", execution: "rtk_llm_proxy_local_lane", hardlock: "local_proxy_non_anthropic" },
  qwen_contradiction: { id: "qwen_contradiction", label: "Qwen contradiction", provider: "qwen_local_proxy", model: "qwen-plus", reasoning: "high", execution: "rtk_llm_proxy_local_lane", hardlock: "local_proxy_non_anthropic" },
  qwen_reasoning: { id: "qwen_reasoning", label: "Qwen reasoning local", provider: "qwen_local_proxy", model: "qwen-plus", reasoning: "high", execution: "rtk_llm_proxy_local_lane", hardlock: "local_proxy_non_anthropic" },
  perplexity_bridge: { id: "perplexity_bridge", label: "Perplexity local bridge", provider: "perplexity_local_bridge", model: "app-desktop-bridge", reasoning: "high", execution: "subscription_browser_first", hardlock: "no_hidden_perplexity_api" },
  perplexity_subscription: { id: "perplexity_subscription", label: "Perplexity abonnement", provider: "perplexity_local_bridge", model: "subscription-browser", reasoning: "high", execution: "subscription_browser_first", hardlock: "no_hidden_perplexity_api" },
  perplexity_api_fallback: { id: "perplexity_api_fallback", label: "Perplexity API (fallback)", provider: "perplexity_api_flagged", model: "sonar", reasoning: "high", execution: "api_only_if_CONSOLE_IA_PERPLEXITY_API_ENABLE", hardlock: "explicit_flag_and_cost_log_required" },
  jarod_runtime: { id: "jarod_runtime", label: "Jarod team runtime", provider: "jarod_openclaw_runtime", model: "glm-5.1", reasoning: "high", execution: "openclaw_runtime_lane", hardlock: "local_proxy_non_anthropic" },
  jarod_orchestration: { id: "jarod_orchestration", label: "Jarod orchestration", provider: "jarod_openclaw_runtime", model: "glm-5.1", reasoning: "high", execution: "openclaw_runtime_lane", hardlock: "local_proxy_non_anthropic" },
  jarod_team_synthesis: { id: "jarod_team_synthesis", label: "Team synthesis", provider: "jarod_openclaw_runtime", model: "glm-5.1", reasoning: "high", execution: "openclaw_runtime_lane", hardlock: "local_proxy_non_anthropic" },
  gemini_perception: { id: "gemini_perception", label: "Gemini perception", provider: "gemini_local_perception", model: "gemini-2.5-flash", reasoning: "visual", execution: "perception_packet_to_kevin_lane", hardlock: "on_demand_only_no_continuous_camera" },
  kevin_screen: { id: "kevin_screen", label: "Kevin écran", provider: "gemini_local_perception", model: "gemini-2.5-flash", reasoning: "visual", execution: "screen_packet_to_kevin_lane", hardlock: "on_demand_only_no_continuous_camera" },
  kevin_camera: { id: "kevin_camera", label: "Kevin caméra", provider: "gemini_local_perception", model: "gemini-2.5-flash", reasoning: "visual", execution: "camera_packet_to_kevin_lane", hardlock: "on_demand_only_no_continuous_camera" },
  kevin_audio: { id: "kevin_audio", label: "Kevin audio", provider: "gemini_local_perception", model: "gemini-2.5-flash", reasoning: "visual", execution: "audio_packet_to_kevin_lane", hardlock: "on_demand_only_no_continuous_camera" },
  chatgpt_desktop_brief: { id: "chatgpt_desktop_brief", label: "Desktop brief", provider: "chatgpt_local_desktop", model: "local-app-brief", reasoning: "high", execution: "brief_sync_no_openai_api", hardlock: "no_OPENAI_API_KEY_no_api_openai_com" },
  chatgpt_bridge_only: { id: "chatgpt_bridge_only", label: "Desktop bridge only", provider: "chatgpt_local_desktop", model: "desktop-bridge", reasoning: "high", execution: "brief_sync_no_openai_api", hardlock: "no_OPENAI_API_KEY_no_api_openai_com" },
  council_synthesis: { id: "council_synthesis", label: "Council synthesis", provider: "central_brain_council", model: "codex+claude+jarod", reasoning: "xhigh", execution: "council_sub_bus_synthesis", hardlock: "sub_adapters_real_only" },
  council_arbitration: { id: "council_arbitration", label: "Council arbitration", provider: "central_brain_council", model: "codex+claude+jarod", reasoning: "xhigh", execution: "council_sub_bus_arbitration", hardlock: "sub_adapters_real_only" },
} as const satisfies Record<string, ConsoleModelMode>;

const TARGET_ROUTES: Record<string, { buses: string[]; owner: string; house: string; title: string }> = {
  central_council: {
    buses: ["codex", "claude", "jarod"],
    owner: "central_brain",
    house: "central_brain",
    title: "Central Council",
  },
  codex_local: {
    buses: ["codex"],
    owner: "codex",
    house: "central_brain",
    title: "Codex local",
  },
  claude_local: {
    buses: ["claude"],
    owner: "claude",
    house: "central_brain",
    title: "Claude local",
  },
  chatgpt_sync: {
    buses: ["chatgpt"],
    owner: "chatgpt",
    house: "central_brain",
    title: "ChatGPT sync",
  },
  kevin_gemini: {
    buses: ["kevin"],
    owner: "kevin",
    house: "mission_control_tower",
    title: "Kevin / Gemini",
  },
  qwen_local: {
    buses: ["qwen"],
    owner: "qwen",
    house: "central_brain",
    title: "Qwen local",
  },
  jarod_openclaw: {
    buses: ["jarod"],
    owner: "jarod",
    house: "openclaw_agent_barracks",
    title: "Jarod / OpenClaw",
  },
  agents_by_house: {
    buses: ["tasks", "jarod"],
    owner: "agents_by_house",
    house: "openclaw_agent_barracks",
    title: "Agents par maison",
  },
  perplexity_local: {
    buses: ["perplexity"],
    owner: "perplexity",
    house: "central_brain",
    title: "Perplexity",
  },
  telegram_iron: {
    buses: ["telegram_iron"],
    owner: "telegram_iron",
    house: "iron_office",
    title: "Telegram Iron",
  },
  telegram_free: {
    buses: ["telegram_free"],
    owner: "telegram_free",
    house: "iron_office",
    title: "Telegram Free",
  },
  telegram_vip: {
    buses: ["telegram_vip"],
    owner: "telegram_vip",
    house: "vip_gate",
    title: "Telegram VIP",
  },
  telegram_erwin: {
    buses: ["telegram_erwin"],
    owner: "telegram_erwin",
    house: "mission_control_tower",
    title: "Telegram Erwin",
  },
};

type ParsedRequest = {
  body: Record<string, unknown>;
  files: File[];
};

type ThreadMessage = {
  id: string;
  role: "user" | "central_brain" | "agent" | "system";
  title: string;
  content: string;
  createdAt: string;
  status?: string;
  agentId?: string;
  evidencePaths?: string[];
};

const shorten = (value: string, maxChars = 240) => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
};

const appendJsonl = (filePath: string, value: unknown) => {
  appendFileSync(filePath, `${JSON.stringify(value)}\n`, { encoding: "utf8" });
};

const safeJson = (value: unknown) => JSON.stringify(value, null, 2);

async function fileExists(filePath: string) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildPathProof({ id, label, path: filePath }: { id: string; label: string; path?: string | null }) {
  const checkedAt = new Date().toISOString();
  if (!filePath) {
    return {
      id,
      label,
      status: "WATCH",
      checkedAt,
      detail: "non routé / non applicable",
    };
  }
  try {
    const stats = await statFile(filePath);
    return {
      id,
      label,
      status: "OK",
      checkedAt,
      path: filePath,
      sizeBytes: stats.size,
      mtime: stats.mtime.toISOString(),
    };
  } catch {
    return {
      id,
      label,
      status: "MISSING",
      checkedAt,
      path: filePath,
    };
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function readTail(filePath: string, maxBytes = 512 * 1024) {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(filePath, "r");
    const stats = await handle.stat();
    const length = Math.min(stats.size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, Math.max(0, stats.size - length));
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    await handle?.close();
  }
}

async function readJsonlTail<T = Record<string, unknown>>(filePath: string, maxLines = 240, maxBytes = 512 * 1024) {
  const text = await readTail(filePath, maxBytes);
  return text
    .split("\n")
    .filter(Boolean)
    .slice(-maxLines)
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((item): item is T => item !== null);
}

const isFileLike = (value: FormDataEntryValue): value is File =>
  typeof value === "object"
  && value !== null
  && "arrayBuffer" in value
  && "name" in value
  && "size" in value;

const normalizeModelMode = (body: Record<string, unknown>): ConsoleModelMode => {
  const explicitId = sanitizeText(asString(body.modelModeId), 80);
  const nested = isRecord(body.modelMode) ? sanitizeText(asString(body.modelMode.id), 80) : "";
  const id = explicitId || nested || "spark_5_3";
  return MODEL_MODES[id as keyof typeof MODEL_MODES] ?? MODEL_MODES.spark_5_3;
};

async function parseRequest(request: Request): Promise<ParsedRequest> {
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

async function storeAttachments(packetId: string, attachments: NormalizedAttachment[]) {
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

const statusFromGuardValue = (value: unknown): HonestStatus => {
  const normalized = sanitizeText(asString(value), 80).toUpperCase();
  if (normalized === "GREEN" || normalized === "OK" || normalized === "PASS") return "LOCAL_GREEN";
  if (normalized === "BLOCKED" || normalized === "BLOCK" || normalized === "ERROR" || normalized === "FAIL") return "BLOCKED";
  return "WATCH";
};

async function readGuardSummary(): Promise<GuardStatusSummary> {
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

const renderMissionMarkdown = (packet: Record<string, unknown>, packetHash: string) => {
  const target = packet.target as { id: string; label: string };
  const input = packet.input as { message: string; attachments: StoredAttachment[] };
  const routes = packet.routes as Array<{ bus: string; path: string }>;
  const modelMode = packet.modelMode as ConsoleModelMode | undefined;
  const paths = packet.paths as Record<string, string | null | undefined>;
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

async function writeChatGptBrief(packet: Record<string, unknown>, packetHash: string, briefPath: string) {
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

async function writeKevinPacket(packet: Record<string, unknown>, packetHash: string, kevinPacketPath: string) {
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

async function createClaudeTask(
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

function publishCentralBrainEvent(kind: string, payload: Record<string, unknown>, evidencePaths: string[]) {
  const script = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(EVENT_BUS_SCRIPT_DIR)})`,
    "from event_bus import publish_event",
    "payload = json.load(sys.stdin)",
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
    const result = execFileSync("/usr/bin/python3", ["-c", script], {
      input: JSON.stringify({ kind, ...payload, evidence_paths: evidencePaths }),
      encoding: "utf8",
      timeout: 5000,
    });
    return JSON.parse(result) as { ok?: boolean; event_hash?: string };
  } catch (error) {
    return {
      ok: false,
      event_hash: null,
      error: error instanceof Error ? error.message : "EVENT_BUS_FAILED",
    };
  }
}

async function buildThread(packetId: string) {
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
  const guardSummary = await readGuardSummary();
  const routeBuses = routes.map((route) => sanitizeText(asString(route.bus), 80)).filter(Boolean);
  const statusProjection = deriveHonestStatus({
    actionMode,
    approvalGranted: approvalRequired ? false : true,
    guardSummary,
    modelMode: isRecord(packet.modelMode) ? packet.modelMode as ConsoleModelMode : null,
    routeBuses,
  });
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

  // Statut honnête par bus quand AUCUNE vraie réponse (realReply=true) n'existe.
  // Aucun adapter réel aujourd'hui: chaque bus est marqué selon sa nature, jamais "réponse".
  const busHonestStatus: Record<string, string> = {
    codex: "adapter_missing",
    claude: "adapter_missing",
    jarod: "adapter_missing",
    perplexity: "adapter_missing",
    tasks: "adapter_missing",
    central_council: "adapter_missing",
    chatgpt: "draft_only",
    qwen: "draft_only",
    kevin: "waiting",
    telegram_iron: "draft_only",
    telegram_free: "draft_only",
    telegram_vip: "draft_only",
    telegram_erwin: "draft_only",
  };

  const participants = await Promise.all(routes.map(async (route) => {
    const bus = sanitizeText(asString(route.bus), 80);
    const routePath = asString(route.path);
    const busLines = routePath ? await readJsonlTail<Record<string, unknown>>(routePath, 360, 256 * 1024) : [];
    const queued = busLines.some((line) => asString(line.packet_id) === packetId || asString(line.packetId) === packetId);
    const realStatus = agentReplyStatus.get(bus) ?? "";
    // Une vraie réponse (realReply=true) gagne; sinon statut honnête du bus; sinon file/attente.
    const status = terminalReplyStatuses.has(realStatus)
      ? "answered"
      : workingReplyStatuses.has(realStatus)
        ? "working"
        : busHonestStatus[bus] ?? (queued ? "queued" : "pending");
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
      content: [
        asString(input.message) || "(message sans texte)",
        "",
        `Mode demandé: ${asString(modelMode.label) || "5.3 Spark"} (${asString(modelMode.model) || "gpt-5.3-codex-spark"} / ${asString(modelMode.reasoning) || "standard"})`,
        "",
        "Pièces jointes:",
        attachmentSummary,
      ].join("\n"),
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
      : participants.some((participant) => participant.status === "adapter_missing")
        ? "THREAD_ADAPTER_MISSING"
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

async function recordAgentReply(body: Record<string, unknown>) {
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

  await mkdir(RESPONSES_DIR, { recursive: true });
  appendJsonl(responsePath, { ...response, responseHash });

  const event = publishCentralBrainEvent(
    "console_ia_agent_reply_recorded",
    {
      packet_id: packetId,
      response_id: responseId,
      response_hash: responseHash,
      agent_id: agentId,
      agent_label: agentLabel,
      status,
      response_path: responsePath,
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
      eventHash: event.event_hash ?? null,
      thread,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let parsed: ParsedRequest;
  try {
    parsed = await parseRequest(request);
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_PACKET_BODY", sourceTag: SOURCE_TAG }, { status: 400 });
  }

  const body = parsed.body;
  if (sanitizeText(asString(body.action), 80) === "agent_reply") {
    return recordAgentReply(body);
  }

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
  const responseStatus = approvalRequired ? "APPROVAL_REQUIRED_PACKET_STORED_LOCAL" : "GREEN_PACKET_QUEUED_LOCAL";
  const responseMode = approvalRequired ? "LOCAL_PACKET_APPROVAL_REQUIRED" : "LOCAL_PACKET_QUEUED";

  const packet = {
    packetId,
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
  appendJsonl(PACKETS_JSONL, { ...packet, packetHash });

  for (const route of routes) {
    appendJsonl(route.path, {
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

  const event = publishCentralBrainEvent(
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
  const thread = await buildThread(packetId);

  return NextResponse.json(
    {
	      ok: true,
	      sourceTag: SOURCE_TAG,
	      status: responseStatus,
	      mode: responseMode,
	      actionMode,
	      packetId,
	      packetHash,
	      modelMode,
	      honestStatus: statusProjection.honestStatus,
	      statusBadges: statusProjection.statusBadges,
	      whyStatus,
	      timeline,
	      approval: packet.approval,
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

export async function GET(request: Request) {
  const url = new URL(request.url);
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
	    mode: "LOCAL_PACKET_QUEUED",
	    status: "GREEN_PACKET_ROUTE_READY",
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
