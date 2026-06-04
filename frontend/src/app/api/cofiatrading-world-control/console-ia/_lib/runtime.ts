import { execFile } from "child_process";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { ConsoleModelMode } from "./schema";

export const execFileAsync = promisify(execFile);

export const HOME = os.homedir();
export const OPENCLAW_ROOT = path.join(HOME, ".openclaw");
export const STATE_ROOT = path.join(OPENCLAW_ROOT, "state");
export const CONSOLE_STATE_DIR = path.join(STATE_ROOT, "console_ia");
export const PACKETS_DIR = path.join(CONSOLE_STATE_DIR, "packets");
export const UPLOADS_DIR = path.join(CONSOLE_STATE_DIR, "uploads");
export const PROMPTS_DIR = path.join(CONSOLE_STATE_DIR, "prompts");
export const RESPONSES_DIR = path.join(CONSOLE_STATE_DIR, "responses");
export const CHATGPT_BRIEFS_DIR = path.join(CONSOLE_STATE_DIR, "chatgpt_briefs");
export const KEVIN_PACKETS_DIR = path.join(CONSOLE_STATE_DIR, "kevin_packets");
export const PACKETS_JSONL = path.join(CONSOLE_STATE_DIR, "packets.jsonl");
export const THREADS_DIR = path.join(CONSOLE_STATE_DIR, "threads");
export const AGENT_INDEX_DIR = path.join(CONSOLE_STATE_DIR, "agent_index");
export const DRAFTS_DIR = path.join(CONSOLE_STATE_DIR, "drafts");
export const INBOUND_DIR = path.join(CONSOLE_STATE_DIR, "inbound");
// Flux 5 — takeover : quand Erwin gère une conv, on écrit le user_id ici ; le daemon Iron
// (iron_support_daemon.py) le lit et se tait (anti double-contact). TTL côté daemon (30 min).
export const TAKEOVER_FILE = path.join(CONSOLE_STATE_DIR, "takeover.json");
export const TAKEOVER_TTL_SEC = 1800;  // aligné avec iron_support_daemon.TAKEOVER_TTL_SEC
// Flux 9 — capture email : dès qu'un client donne son email en conversation, on l'enregistre ici
// (append-only, jamais d'écriture dans la DB CRM live). C'est la file de sync + re-contact futur.
export const CAPTURED_EMAILS_FILE = path.join(CONSOLE_STATE_DIR, "captured_emails.jsonl");
export const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
export const AGENT_MESH_DIR = path.join(STATE_ROOT, "agent_mesh");
export const WARP_AGENT_MESH_DIR = path.join(STATE_ROOT, "warp", "agent_mesh");
export const WARP_MISSION_PACKETS_DIR = path.join(STATE_ROOT, "warp", "agent_mesh", "mission_packets");
export const CLAUDE_TASKS_DIR = path.join(OPENCLAW_ROOT, "automation", "claude-tasks");
export const EVENT_BUS_SCRIPT_DIR = path.join(OPENCLAW_ROOT, "scripts", "central_brain");
export const CONTROL_LEDGER = path.join(WARP_AGENT_MESH_DIR, "control_ledger.jsonl");
export const ROUTE_COHERENCE_REPORT = path.join(WARP_AGENT_MESH_DIR, "route_coherence_report.json");
export const SESSION_COACH_REPORT = path.join(WARP_AGENT_MESH_DIR, "central_brain_session_coach_latest.json");
export const SELF_CHALLENGE_REPORT = path.join(WARP_AGENT_MESH_DIR, "self_challenge_report.json");
export const PAID_API_GUARD_REPORT = path.join(STATE_ROOT, "central_brain_paid_api_guard", "latest.json");

export const ALLOWED_TARGETS = new Set([
  "central_council",
  "codex_local",
  "claude_local",
  "chatgpt_sync",
  "gemini_pro_local",
  "kevin_gemini",
  "qwen_local",
  "jarod_openclaw",
  "agents_by_house",
  "perplexity_local",
  "telegram_iron",
  "telegram_free",
  "telegram_vip",
  "telegram_aeron",
  "telegram_erwin",
]);

export const MODEL_MODES = {
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
    label: "Kevin API / Gemini perception",
    provider: "gemini_local_perception",
    model: "gemini-2.5-flash",
    reasoning: "visual",
    execution: "screen_camera_audio_packet_to_kevin_lane",
    hardlock: "on_demand_only_no_continuous_camera",
  },
  gemini_pro_local: {
    id: "gemini_pro_local",
    label: "Gemini Pro local",
    provider: "gemini_desktop_subscription",
    model: "gemini-pro-desktop",
    reasoning: "high",
    execution: "desktop_subscription_queue_no_google_api",
    hardlock: "no_google_api_key_desktop_subscription_only",
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

export const TARGET_ROUTES: Record<string, { buses: string[]; owner: string; house: string; title: string }> = {
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
  gemini_pro_local: {
    buses: ["gemini"],
    owner: "gemini",
    house: "central_brain",
    title: "Gemini Pro local",
  },
  kevin_gemini: {
    buses: ["kevin"],
    owner: "kevin",
    house: "mission_control_tower",
    title: "Kevin API / Gemini perception",
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
  telegram_aeron: {
    buses: ["telegram_aeron"],
    owner: "telegram_aeron",
    house: "iron_office",
    title: "Aeron Feed",
  },
  telegram_erwin: {
    buses: ["telegram_erwin"],
    owner: "telegram_erwin",
    house: "mission_control_tower",
    title: "Telegram Erwin",
  },
};

export type ParsedRequest = {
  body: Record<string, unknown>;
  files: File[];
};

export type ThreadMessage = {
  id: string;
  role: "user" | "central_brain" | "agent" | "system";
  title: string;
  content: string;
  createdAt: string;
  status?: string;
  agentId?: string;
  evidencePaths?: string[];
  source?: string;
};
