import { readFile, stat } from "node:fs/promises";

const GOOGLE_360 = "/Users/burakokyay/.openclaw/state/company_os/google_360_snapshot.json";

type GoogleComponent = {
  tool?: string;
  status?: string;
  source?: string;
  summary?: string;
  data_volume?: Record<string, unknown> | null;
  proof_ref?: Record<string, unknown> | null;
  last_success_utc?: string | null;
  last_error?: string | null;
  next_action?: string | null;
};

type Google360 = {
  ok?: boolean;
  source?: string;
  run_utc?: string;
  status?: string;
  account?: { email?: string; domain?: string };
  components?: GoogleComponent[];
};

export type GoogleWorkspaceComponentProof = {
  id: string;
  rawTool: string;
  label: string;
  houseId: string;
  ok: boolean;
  status: "LIVE" | "AMBER" | "AMBER_REVERIFY" | "UNKNOWN";
  actionState: "inspection" | "messagerie" | "traitement" | null;
  capability: string;
  chiefAgent: string;
  workerAgents: string[];
  sourceTag: string;
  runUtc: string | null;
  proof: string;
  summary: string;
  dataVolume: Record<string, unknown> | null;
  nextAction: string | null;
};

export type GoogleWorkspaceProof = {
  ok: boolean;
  sourceTag: string;
  generatedAtUtc: string;
  snapshotPath: string;
  snapshotMtimeUtc: string | null;
  account: Google360["account"] | null;
  status: string;
  summary: { components: number; live: number; amber: number; unknown: number; keyNamesPresent: number };
  keyPresence: Array<{ name: string; present: boolean; valueRedacted: true }>;
  components: GoogleWorkspaceComponentProof[];
};

const KEY_NAMES = [
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "YOUTUBE_API_KEY",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
] as const;

const BINDINGS: Record<string, Omit<GoogleWorkspaceComponentProof, "ok" | "status" | "sourceTag" | "runUtc" | "proof" | "summary" | "dataVolume" | "nextAction">> = {
  google_account: {
    id: "google-account",
    rawTool: "google_account",
    label: "Google Account",
    houseId: "mission_control_tower",
    actionState: "inspection",
    capability: "Identite Workspace COF, domaine, scope de lecture local.",
    chiefAgent: "Command Tower chief",
    workerAgents: ["Codex", "Jarod", "Oracle"],
  },
  gmail: {
    id: "gmail",
    rawTool: "gmail",
    label: "Gmail",
    houseId: "iron_office",
    actionState: "messagerie",
    capability: "Inbox/labels pour relances, support, alertes agents. Body/envoyé externe reste verrouillé.",
    chiefAgent: "Revenue & CRM chief",
    workerAgents: ["David", "Iron", "VIP Gate agents"],
  },
  drive_docs_sheets_slides: {
    id: "drive-docs-sheets",
    rawTool: "drive_docs_sheets_slides",
    label: "Drive Docs Sheets",
    houseId: "obsidian_library",
    actionState: "inspection",
    capability: "Drive metadata, Docs/Sheets/Slides comme sources et preuves; mutation cloud seulement via bridge dedie.",
    chiefAgent: "Knowledge Vault chief",
    workerAgents: ["Steward", "NotebookLM", "Proof Ledger"],
  },
  calendar: {
    id: "calendar",
    rawTool: "calendar",
    label: "Calendar",
    houseId: "calendar_tower",
    actionState: "inspection",
    capability: "Cadence, rappels, slots publication, missions recurrentes.",
    chiefAgent: "Calendar agent #37",
    workerAgents: ["Command Tower", "Central Brain"],
  },
  google_tasks: {
    id: "google-tasks",
    rawTool: "google_tasks",
    label: "Google Tasks",
    houseId: "mission_control_tower",
    actionState: "traitement",
    capability: "Queue de taches Workspace pointee vers Mission Control.",
    chiefAgent: "Command Tower chief",
    workerAgents: ["Jarod", "Paperclip Factory"],
  },
  search_console: {
    id: "search-console",
    rawTool: "search_console",
    label: "Search Console",
    houseId: "site_seo_lab",
    actionState: "inspection",
    capability: "SEO, requetes, clics, pages a transformer en missions growth.",
    chiefAgent: "Site & SEO chief",
    workerAgents: ["Growth agents", "CofiaPublisher"],
  },
  ga4: {
    id: "ga4",
    rawTool: "ga4",
    label: "GA4",
    houseId: "iron_office",
    actionState: "inspection",
    capability: "Funnel, sources, conversions; cash diagnostics vers Revenue & CRM.",
    chiefAgent: "Revenue & CRM chief",
    workerAgents: ["Iron", "Site & SEO Lab"],
  },
  bigquery: {
    id: "bigquery",
    rawTool: "bigquery",
    label: "BigQuery",
    houseId: "central_brain",
    actionState: "traitement",
    capability: "Entrepot analytique pour Central Brain et preuves KPI.",
    chiefAgent: "Central Brain chief",
    workerAgents: ["Oracle", "Proof Ledger"],
  },
  admin_sdk: {
    id: "admin-sdk",
    rawTool: "admin_sdk",
    label: "Admin SDK",
    houseId: "compliance_port",
    actionState: "inspection",
    capability: "Audit domaine, securite, devices; LIVE seulement quand le snapshot/audit est frais.",
    chiefAgent: "Compliance Gate chief",
    workerAgents: ["Guardian", "Proof Ledger"],
  },
  apps_script: {
    id: "apps-script",
    rawTool: "apps_script",
    label: "Apps Script",
    houseId: "mission_control_tower",
    actionState: "traitement",
    capability: "Pont local vers automations Workspace; deploy externe separe.",
    chiefAgent: "Command Tower chief",
    workerAgents: ["Calendar agent #37", "Central Brain"],
  },
  notebooklm: {
    id: "notebooklm-google",
    rawTool: "notebooklm",
    label: "NotebookLM Google",
    houseId: "notebook_alm",
    actionState: "inspection",
    capability: "Grounding par sources Drive/Docs attachees.",
    chiefAgent: "NotebookLM chief",
    workerAgents: ["Knowledge Vault", "Steward"],
  },
  google_trends_alpha: {
    id: "google-trends-alpha",
    rawTool: "google_trends_alpha",
    label: "Google Trends",
    houseId: "lightrag_observatory",
    actionState: "inspection",
    capability: "Radar tendance; fallback Search Console/RSS tant que Alpha officiel non confirme.",
    chiefAgent: "Lighthouse Observatory chief",
    workerAgents: ["Perplexity Radar", "Site & SEO Lab"],
  },
  youtube_analytics: {
    id: "youtube-analytics",
    rawTool: "youtube_analytics",
    label: "YouTube Analytics",
    houseId: "youtube_studio",
    actionState: "inspection",
    capability: "Stats video et publication; upload OAuth reste un bridge separe.",
    chiefAgent: "COF IA Publisher chief",
    workerAgents: ["Nova", "CofiaPublisher"],
  },
};

const normalizeGoogleStatus = (status?: string): GoogleWorkspaceComponentProof["status"] => {
  const upper = String(status ?? "").toUpperCase();
  if (upper === "LIVE_OK") return "LIVE";
  if (upper.includes("STALE")) return "AMBER_REVERIFY";
  if (
    upper.includes("AMBER") ||
    upper.includes("REAUTH") ||
    upper.includes("DEGRADED") ||
    upper.includes("PARTIAL") ||
    upper.includes("TO_WIRE") ||
    upper.includes("MISSING")
  ) return "AMBER";
  return "UNKNOWN";
};
const numberValue = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const downgradeNoFalseLive = (
  component: GoogleComponent,
  status: GoogleWorkspaceComponentProof["status"],
): GoogleWorkspaceComponentProof["status"] => {
  if (status !== "LIVE") return status;
  const summary = String(component.summary ?? "").toLowerCase();
  const nextAction = String(component.next_action ?? "").toLowerCase();
  const tool = String(component.tool ?? "").toLowerCase();
  const proofAgeSec = numberValue(component.proof_ref?.age_sec);
  if (/\bskip\b|asked to skip|fallback|source_count=0 accepted|no active rows/.test(summary)) return "AMBER_REVERIFY";
  if (tool === "calendar" && (proofAgeSec === null || proofAgeSec > 86_400 || !component.last_success_utc)) return "AMBER_REVERIFY";
  if (tool === "google_tasks" && /source_count.*0|task table revient/.test(`${summary} ${nextAction}`)) return "AMBER_REVERIFY";
  return status;
};
const displayGoogleSummary = (summary: string, status: GoogleWorkspaceComponentProof["status"]) => {
  if (status === "LIVE") return summary;
  return summary
    .replace(/fallback live/gi, "fallback evidence")
    .replace(/live_context/gi, "context_radar")
    .replace(/fallbacks active/gi, "fallbacks tracked");
};

const readJsonFile = async <T,>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
};

export async function readGoogleWorkspaceProof(): Promise<GoogleWorkspaceProof> {
  const now = new Date().toISOString();
  const [google, snapshotStat] = await Promise.all([
    readJsonFile<Google360>(GOOGLE_360),
    stat(GOOGLE_360).catch(() => null),
  ]);
  const keyPresence = KEY_NAMES.map((name) => ({ name, present: Boolean(process.env[name]), valueRedacted: true as const }));
  const components = (google?.components ?? []).map((component) => {
    const rawTool = component.tool ?? "unknown";
    const binding = BINDINGS[rawTool] ?? {
      id: rawTool.replaceAll("_", "-"),
      rawTool,
      label: rawTool,
      houseId: "proof_ledger",
      actionState: "inspection" as const,
      capability: "Composant Google non classe; visible dans Proof Ledger.",
      chiefAgent: "Proof Ledger chief",
      workerAgents: ["Codex"],
    };
    const status = downgradeNoFalseLive(component, normalizeGoogleStatus(component.status));
    const ok = status === "LIVE";
    const dataVolume = component.data_volume ?? null;
    const dataTail = dataVolume
      ? Object.entries(dataVolume).map(([key, value]) => `${key}=${String(value)}`).join(" · ")
      : "volume=none";
    const summary = displayGoogleSummary(component.summary ?? "Google component", status);
    const proof = `${summary} · ${dataTail} · chief=${binding.chiefAgent} · agents=${binding.workerAgents.join(", ")} · snapshot=${GOOGLE_360}`;
    return {
      ...binding,
      ok,
      status,
      sourceTag: "GOOGLE_WORKSPACE_LOCAL_AGENT_BINDINGS_20260601",
      runUtc: google?.run_utc ?? now,
      actionState: ok ? binding.actionState : null,
      proof: ok ? proof : `${proof} · downgraded=policy-no-false-green`,
      summary,
      dataVolume,
      nextAction: component.next_action ?? null,
    };
  });

  return {
    ok: components.some((component) => component.ok),
    sourceTag: "GOOGLE_WORKSPACE_LOCAL_AGENT_BINDINGS_20260601",
    generatedAtUtc: now,
    snapshotPath: GOOGLE_360,
    snapshotMtimeUtc: snapshotStat?.mtime.toISOString() ?? null,
    account: google?.account ?? null,
    status: google?.status ?? (google ? "UNKNOWN" : "MISSING"),
    summary: {
      components: components.length,
      live: components.filter((component) => component.status === "LIVE" && component.ok).length,
      amber: components.filter((component) => component.status === "AMBER" || component.status === "AMBER_REVERIFY").length,
      unknown: components.filter((component) => component.status === "UNKNOWN").length,
      keyNamesPresent: keyPresence.filter((key) => key.present).length,
    },
    keyPresence,
    components,
  };
}
