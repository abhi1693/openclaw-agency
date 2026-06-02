import { headers } from "next/headers";
import { readdir, readFile, stat } from "node:fs/promises";

import { readLocalRevenue } from "../api/cofiatrading-world-control/_lib/localRevenue";
import { readGoogleWorkspaceProof } from "../api/cofiatrading-world-control/_lib/googleWorkspace";
import { readLobsterProof } from "../api/cofiatrading-world-control/_lib/lobster";
import { buildHubWiringSnapshot } from "../api/cofiatrading-world-control/_lib/hubWiring";
import { buildSourceLedgerPayload } from "../api/cofiatrading-world-control/source-ledger/route";
import { WorldControl, type AngelRosterPayload } from "@/components/cofiatrading-world-control/WorldControl";
import { PatrimoinePanel } from "@/components/cofiatrading-world-control/PatrimoinePanel";
import type { ConsoleIAInitialInbox } from "@/components/cofiatrading-world-control/ConsoleIAOverlay";
import type { TruthMapPayload, TruthSource } from "@/components/cofiatrading-world-control/WorldMapLiving";
import type { Snapshot } from "@/components/cofiatrading-world-control/world-control.types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GOOGLE_360 = "/Users/burakokyay/.openclaw/state/company_os/google_360_snapshot.json";
const STATE_ROOT = "/Users/burakokyay/.openclaw/state";
const NOTEBOOKLM_PACKS = "/Users/burakokyay/.openclaw/state/company_os/notebooklm_packs.json";
const NOTEBOOKLM_RESYNC = "/Users/burakokyay/.openclaw/state/company_os/notebooklm_resync_status.json";
const PERPLEXITY_SYNC = "/Users/burakokyay/.openclaw/state/company_os/perplexity_sync_status.json";
const PERPLEXITY_REPORT = "/Users/burakokyay/.openclaw/state/company_os/perplexity_radar_import_report.md";
const NOTION_DESKTOP_DB = "/Users/burakokyay/Library/Application Support/Notion/notion.db";
const NOTION_SYNC_STATE = `${STATE_ROOT}/notion_sync_state.json`;
const LINEAR_CACHE = `${STATE_ROOT}/linear_latest_issues_cache.json`;
const TELEGRAM_BUS = `${STATE_ROOT}/agent_mesh/telegram_bus.jsonl`;
const TELEGRAM_CHANNELS_REGISTRY = `${STATE_ROOT}/bt1_recovery/telegram_channels_registry.json`;
const ADMIN_SDK_LOG = "/Users/burakokyay/.openclaw/logs/admin-sdk-audit.log";
const N8N_MANIFEST = "/Users/burakokyay/cof-trading/config/n8n/clean-workflows-20260428/manifest.json";
const N8N_TRUTH_REFRESH = "/Users/burakokyay/.openclaw/state/company_os/n8n_truth_refresh.json";
const OBSIDIAN_VAULT = "/Users/burakokyay/Obsidian/COF_TRADING";
const AGENTS_CANON_PATH = "/Users/burakokyay/.openclaw/config/agents_visual_identity_canon.json";
const HOUSE_ORCHESTRATOR_STATE = "/Users/burakokyay/.openclaw/state/cofiatrading_world_house_orchestrator.json";
const OPENCLAW_REPO_ROOT = "/Users/burakokyay/.openclaw/mission-control-frontend-restored";
const OPENCLAW_GIT_DIR = `${OPENCLAW_REPO_ROOT}/.git`;
const OPENCLAW_EXPECTED_REMOTE = "https://github.com/abhi1693/openclaw-mission-control.git";
const CONSOLE_IA_PACKETS_DIR = "/Users/burakokyay/.openclaw/state/console_ia/packets";
const CONSOLE_IA_RESPONSES_DIR = "/Users/burakokyay/.openclaw/state/console_ia/responses";
const CONSOLE_IA_PACKETS_JSONL = "/Users/burakokyay/.openclaw/state/console_ia/packets.jsonl";
const REMOTION_OUT_DIR = "/Users/burakokyay/cof-trading/remotion/out";
const CAPTIONS_DIR = "/Users/burakokyay/.openclaw/content/captions/2026-W22-premium-batch";
const ASSETS_INVENTORY_PATH = "/Users/burakokyay/.openclaw/config/assets_inventory_canon.json";

type SourceInput = Omit<TruthSource, "status" | "ok"> & { status?: unknown; ok?: boolean };
type LinearIssue = { id?: string | null; title?: string | null; updatedAt?: string | null };
type LinearPayload = {
  ok?: boolean;
  status?: string;
  apiUsed?: boolean;
  total?: number;
  issues?: LinearIssue[];
  reason?: string;
  error?: string | null;
  cache?: { cachedAtUtc?: string | null; ageSec?: number | null; lastError?: string | null };
};
type LinearCache = {
  cachedAtUtc?: string | null;
  lastError?: string | null;
  payload?: LinearPayload | null;
};
type N8nWorkflow = { active?: boolean };
type N8nManifest = {
  status?: string;
  updated_at_utc?: string;
  validation?: { public_ingress_smoke?: string; paperclip_dispatch_job_id?: string };
  created?: N8nWorkflow[];
};
type N8nTruthRefresh = {
  ok?: boolean;
  generated_at_utc?: string;
  source_tag?: string;
  missing_local_files?: string[];
  missing_artifacts?: string[];
};
type InitialHouseOrchestratorPayload = NonNullable<Snapshot["houseOrchestrator"]>;

const recordFrom = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const numberFrom = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeSourceStatus = (value: unknown, ok?: boolean): TruthSource["status"] => {
  const upper = String(value ?? "").toUpperCase();
  if (ok === true && (upper === "LIVE" || upper === "LIVE_OK" || upper === "OK")) return "LIVE";
  if (upper.includes("REVERIFY")) return "AMBER_REVERIFY";
  if (upper.includes("AMBER") || upper.includes("PARTIAL") || upper.includes("DEGRADED") || upper.includes("MISSING")) return "AMBER";
  if (upper === "LIVE" || upper === "LIVE_OK") return "AMBER_REVERIFY";
  return "UNKNOWN";
};

const readJsonFile = async <T,>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
};

const daysSince = (iso?: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
};

const secondsSince = (iso?: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 1000);
};

const fileStamp = async (path: string): Promise<{ exists: boolean; mtimeUtc: string | null; bytes: number | null }> => {
  try {
    const s = await stat(path);
    return { exists: true, mtimeUtc: s.mtime.toISOString(), bytes: s.size };
  } catch {
    return { exists: false, mtimeUtc: null, bytes: null };
  }
};

const readLastLine = async (path: string): Promise<string | null> => {
  try {
    const lines = (await readFile(path, "utf8")).split("\n").filter((line) => line.trim());
    return lines.at(-1) ?? null;
  } catch {
    return null;
  }
};

const readTelegramBridge = async () => {
  try {
    const lines = (await readFile(TELEGRAM_BUS, "utf8")).split("\n").filter((line) => line.trim());
    const lastLine = lines.at(-1);
    if (!lastLine) return null;
    const parsed = JSON.parse(lastLine) as { t?: number; s?: string };
    const runUtc = typeof parsed.t === "number" ? new Date(parsed.t * 1000).toISOString() : null;
    const summary = typeof parsed.s === "string" ? parsed.s : "";
    const sourcesAlive = Number(summary.match(/sources=(\d+)/)?.[1] ?? NaN);
    return {
      runUtc,
      summary,
      sourcesAlive: Number.isFinite(sourcesAlive) ? sourcesAlive : null,
    };
  } catch {
    return null;
  }
};

const readInitialLinearIssues = async (): Promise<LinearPayload | null> => {
  const cache = await readJsonFile<LinearCache>(LINEAR_CACHE);
  if (!cache?.payload) return null;
  const age = cache.cachedAtUtc ? Math.floor((Date.now() - Date.parse(cache.cachedAtUtc)) / 1000) : null;
  return {
    ...cache.payload,
    status: "LIVE_CACHE",
    apiUsed: false,
    cache: {
      cachedAtUtc: cache.cachedAtUtc ?? null,
      ageSec: Number.isFinite(age) ? age : null,
      lastError: cache.lastError ?? null,
    },
  };
};

const addInitialSource = (sources: TruthSource[], source: SourceInput) => {
  const normalized = normalizeSourceStatus(source.status, source.ok);
  const status = normalized === "LIVE" && source.ok !== true ? "AMBER_REVERIFY" : normalized;
  sources.push({ ...source, status, ok: source.ok === true && status === "LIVE" });
};

const orgRoleForRankLayer = (rankLayer: string): NonNullable<Snapshot["agentsCanon"]>["agents"][number]["orgRole"] => {
  const normalized = rankLayer.toLowerCase();
  if (normalized.startsWith("l0")) return "owner";
  if (normalized.startsWith("l1")) return "co_ceo";
  if (normalized.includes("auxiliaire")) return "voice";
  if (normalized.startsWith("l2")) return "manager";
  if (normalized.startsWith("l3")) return "chief";
  if (normalized.includes("executor")) return "worker";
  return "specialist";
};

const rankLayerWeightFor = (rankLayer: string) => {
  const normalized = rankLayer.toLowerCase();
  if (normalized.startsWith("l0")) return 100;
  if (normalized.startsWith("l1")) return 90;
  if (normalized.startsWith("l2")) return 78;
  if (normalized.startsWith("l3")) return 66;
  if (normalized.includes("specialist")) return 48;
  if (normalized.includes("executor")) return 40;
  return 30;
};

async function buildInitialAgentsCanon(): Promise<NonNullable<Snapshot["agentsCanon"]>> {
  const parsed = await readJsonFile<{ agents?: Array<Record<string, unknown>> }>(AGENTS_CANON_PATH);
  const list = Array.isArray(parsed?.agents) ? parsed.agents : [];
  const agents = list.map((agent) => {
    const rankLayer = typeof agent.rank_layer === "string" ? agent.rank_layer : "";
    return {
      no: typeof agent.no === "number" ? agent.no : null,
      id: String(agent.id ?? "unknown"),
      name: String(agent.name ?? "Unknown"),
      glyph: typeof agent.glyph === "string" ? agent.glyph : "",
      avatarEmoji: typeof agent.avatar_emoji === "string" ? agent.avatar_emoji : "",
      colorPrimary: typeof agent.color_primary === "string" ? agent.color_primary : "#888888",
      colorAccent: typeof agent.color_accent === "string" ? agent.color_accent : "#aaaaaa",
      roleBadge: typeof agent.role_badge === "string" ? agent.role_badge : "",
      house: typeof agent.house_attached === "string" ? agent.house_attached : "central_brain",
      houseColor: typeof agent.house_color === "string" ? agent.house_color : "#888888",
      rankLayer,
      rankLayerWeight: rankLayerWeightFor(rankLayer),
      orgRole: orgRoleForRankLayer(rankLayer),
      boss: typeof agent.boss === "string" ? agent.boss : "",
      engine: typeof agent.engine === "string" ? agent.engine : "",
      responsibilities: Array.isArray(agent.responsibilities)
        ? agent.responsibilities.filter((item): item is string => typeof item === "string")
        : [],
    };
  });
  return { ok: agents.length > 0, count: agents.length, sourceTag: "agents_visual_identity_canon_fast_ssr", agents };
}

async function buildInitialAssetsWarehouse(): Promise<Snapshot["assetsWarehouse"]> {
  const errors: string[] = [];
  let mp4Count: number | null = null;
  let captionsCount: number | null = null;
  let assetsInventoryCount: number | null = null;

  try {
    const files = await readdir(REMOTION_OUT_DIR);
    mp4Count = files.filter((file) => file.toLowerCase().endsWith(".mp4")).length;
  } catch (error) {
    errors.push(`mp4:${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const files = await readdir(CAPTIONS_DIR);
    captionsCount = files.filter((file) => !file.startsWith(".")).length;
  } catch (error) {
    errors.push(`captions:${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const parsed = await readJsonFile<unknown>(ASSETS_INVENTORY_PATH);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { assets?: unknown[] }).assets)) {
      assetsInventoryCount = (parsed as { assets: unknown[] }).assets.length;
    } else if (parsed && typeof parsed === "object" && typeof (parsed as { assets_count_actual?: unknown }).assets_count_actual === "number") {
      assetsInventoryCount = (parsed as { assets_count_actual: number }).assets_count_actual;
    } else if (Array.isArray(parsed)) {
      assetsInventoryCount = parsed.length;
    }
  } catch (error) {
    errors.push(`assets_inventory:${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    ok: errors.length === 0,
    sourceTag: "filesystem_assets_warehouse_fast_ssr",
    mp4Count,
    captionsCount,
    assetsInventoryCount,
    paths: { remotionOutDir: REMOTION_OUT_DIR, captionsDir: CAPTIONS_DIR, assetsInventoryPath: ASSETS_INVENTORY_PATH },
    errors,
  };
}

async function buildInitialConsoleIa(): Promise<NonNullable<Snapshot["consoleIa"]>> {
  try {
    const packetsStat = await stat(CONSOLE_IA_PACKETS_DIR);
    return {
      ok: true,
      status: "LOCAL_PACKET_ROUTE_READY",
      sourceTag: "CONSOLE_IA_LOCAL_PACKET_ROUTE_SSR_20260601",
      mode: "LOCAL_PACKET_READY",
      proof: `${CONSOLE_IA_PACKETS_DIR} · mtime=${packetsStat.mtime.toISOString()}`,
      paths: {
        packetsDir: CONSOLE_IA_PACKETS_DIR,
        responsesDir: CONSOLE_IA_RESPONSES_DIR,
        packetsJsonl: CONSOLE_IA_PACKETS_JSONL,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: "AMBER_REVERIFY",
      sourceTag: "CONSOLE_IA_LOCAL_PACKET_ROUTE_SSR_20260601",
      mode: "LOCAL_PACKET_UNAVAILABLE",
      proof: error instanceof Error ? error.message : "Console IA packets dir unavailable",
      paths: {
        packetsDir: CONSOLE_IA_PACKETS_DIR,
        responsesDir: CONSOLE_IA_RESPONSES_DIR,
        packetsJsonl: CONSOLE_IA_PACKETS_JSONL,
      },
    };
  }
}

async function readInitialHouseOrchestrator(): Promise<InitialHouseOrchestratorPayload | null> {
  const payload = await readJsonFile<InitialHouseOrchestratorPayload>(HOUSE_ORCHESTRATOR_STATE);
  return payload?.ok === true && Array.isArray(payload.houseMissions) ? payload : null;
}

async function buildInitialOpenClawRepo(): Promise<NonNullable<Snapshot["openclawRepo"]>> {
  try {
    const [config, head] = await Promise.all([
      readFile(`${OPENCLAW_GIT_DIR}/config`, "utf8"),
      readFile(`${OPENCLAW_GIT_DIR}/HEAD`, "utf8"),
    ]);
    const remoteUrl = config.match(/url\s*=\s*(.+)/)?.[1]?.trim() ?? null;
    const headValue = head.trim();
    const branch = headValue.startsWith("ref: refs/heads/") ? headValue.replace("ref: refs/heads/", "") : null;
    let commit: string | null = null;
    if (branch) {
      commit = (await readFile(`${OPENCLAW_GIT_DIR}/refs/heads/${branch}`, "utf8")).trim();
    } else if (/^[a-f0-9]{40}$/i.test(headValue)) {
      commit = headValue;
    }
    const ok = remoteUrl === OPENCLAW_EXPECTED_REMOTE && Boolean(commit);
    return {
      ok,
      status: ok ? "GREEN_LOCAL_REMOTE" : "AMBER_REVERIFY",
      sourceTag: "OPENCLAW_MISSION_CONTROL_GITHUB_FAST_SSR_20260601",
      repoRoot: OPENCLAW_REPO_ROOT,
      remoteUrl: remoteUrl ?? "missing",
      branch,
      commit,
      proof: `${OPENCLAW_GIT_DIR}/config · origin=${remoteUrl ?? "missing"} · branch=${branch ?? "detached"} · commit=${commit?.slice(0, 12) ?? "missing"}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: "AMBER_REVERIFY",
      sourceTag: "OPENCLAW_MISSION_CONTROL_GITHUB_FAST_SSR_20260601",
      repoRoot: OPENCLAW_REPO_ROOT,
      remoteUrl: "missing",
      branch: null,
      commit: null,
      proof: error instanceof Error ? error.message : "openclaw repo proof unavailable",
    };
  }
}

async function buildFastInitialSnapshot(): Promise<Snapshot> {
  const now = new Date().toISOString();
  const [revenueResult, agentsCanon, assetsWarehouse, houseOrchestrator, consoleIa, openclawRepo, hubSourceLedger, hubWiring] = await Promise.all([
    readLocalRevenue(),
    buildInitialAgentsCanon(),
    buildInitialAssetsWarehouse(),
    readInitialHouseOrchestrator(),
    buildInitialConsoleIa(),
    buildInitialOpenClawRepo(),
    buildSourceLedgerPayload().catch(() => null),
    buildHubWiringSnapshot().catch(() => null),
  ]);
  const revenue = recordFrom(revenueResult.data);
  const currentMrrEur = numberFrom(revenue.mrr_eur) ?? numberFrom(revenue.mrr_active_eur) ?? numberFrom(revenue.current_mrr_eur);
  const currentArrEur = numberFrom(revenue.arr_eur) ?? (currentMrrEur !== null ? currentMrrEur * 12 : null);

  return {
    ok: true,
    fetchedAt: now,
    sourceTag: "COFIAT_WORLD_FAST_SSR_SEED_V1_20260601",
    endpoints: { revenue: { ok: revenueResult.ok, status: revenueResult.status } },
    revenue: {
      sourceTag: typeof revenue.source_tag === "string" ? revenue.source_tag : null,
      currentMrrEur,
      currentArrEur,
      activeVip: numberFrom(revenue.active_vip),
      pastDueCount: numberFrom(revenue.past_due_count),
      pastDueEur: numberFrom(revenue.past_due_eur) ?? numberFrom(revenue.past_due_eur_total),
      ftdCumul: numberFrom(revenue.ftd_cumul),
      brokersLifetimeUsd: numberFrom(revenue.brokers_commission_lifetime_usd),
      clientsActive: numberFrom(revenue.clients_active),
    },
    centralBrain: { housesCount: 15, houses: [] },
    publisher: { ok: false, status: "AMBER", service: "fast-ssr-seed", outputDirCount: null },
    services: [],
    offers: [],
    assetsWarehouse,
    agentsCanon,
    openclawRepo,
    consoleIa,
    houseOrchestrator: houseOrchestrator ?? undefined,
    hubSourceLedger,
    hubWiring,
    houseMissions: houseOrchestrator?.houseMissions ?? [],
    writeBlocked: true,
    piiBlocked: true,
    dangerousActions: [],
  };
}

async function buildInitialTruthMap(snapshot: Snapshot | null): Promise<TruthMapPayload> {
  const now = new Date().toISOString();
  const sources: TruthSource[] = [];

  const google = await readJsonFile<{
    run_utc?: string;
    source?: string;
    components?: Array<{ tool?: string; status?: string; summary?: string; source?: string; data_volume?: Record<string, unknown> }>;
  }>(GOOGLE_360);
  const calendar = google?.components?.find((component) => component.tool === "calendar");
  const calendarOk = calendar?.status === "LIVE_OK";
  addInitialSource(sources, {
    id: "calendar-read",
    label: "Calendar read",
    houseId: "calendar_tower",
    ok: calendarOk,
    status: calendarOk ? "LIVE" : calendar?.status,
    proof: calendarOk
      ? `${calendar?.summary ?? "bounded read"} · events=${Number(calendar?.data_volume?.events_returned ?? 0)}`
      : `calendar absent/degraded in ${GOOGLE_360}`,
    sourceTag: "CALENDAR_GOOGLE_WORKSPACE_360_20260601",
    actionState: calendarOk ? "inspection" : null,
    runUtc: google?.run_utc ?? now,
  });

  const googleWorkspace = await readGoogleWorkspaceProof();
  const [adminLogStamp, adminLastLine] = await Promise.all([fileStamp(ADMIN_SDK_LOG), readLastLine(ADMIN_SDK_LOG)]);
  const adminAuditFresh = daysSince(adminLogStamp.mtimeUtc) !== null && (daysSince(adminLogStamp.mtimeUtc) ?? 99) <= 1 && /Audit 2026-06/.test(adminLastLine ?? "");
  for (const component of googleWorkspace.components.filter((item) => item.rawTool !== "calendar")) {
    const componentOk = component.rawTool === "admin_sdk" && adminAuditFresh ? true : component.ok;
    const componentStatus = component.rawTool === "admin_sdk" && adminAuditFresh ? "LIVE" : component.status;
    const componentProof = component.rawTool === "admin_sdk" && adminAuditFresh
      ? `${adminLastLine} · log=${ADMIN_SDK_LOG} · snapshot=${GOOGLE_360} · capability=${component.capability}`
      : `${component.proof} · capability=${component.capability}`;
    addInitialSource(sources, {
      id: `google-${component.id}`,
      label: component.label,
      houseId: component.houseId,
      ok: componentOk,
      status: componentStatus,
      proof: componentProof,
      sourceTag: component.sourceTag,
      actionState: componentOk ? component.actionState : null,
      runUtc: component.runUtc,
    });
  }

  const lobster = await readLobsterProof();
  for (const component of lobster.components) {
    addInitialSource(sources, {
      id: `lobster-${component.id}`,
      label: component.label,
      houseId: component.houseId,
      ok: component.ok,
      status: component.status,
      proof: component.proof,
      sourceTag: lobster.sourceTag,
      actionState: component.ok ? component.actionState : null,
      runUtc: lobster.generatedAtUtc,
    });
  }

  const linear = await readInitialLinearIssues();
  const linearIssues = Array.isArray(linear?.issues) ? linear.issues : [];
  const latestLinear = linearIssues.find((issue) => typeof issue.updatedAt === "string") ?? null;
  const linearFresh = daysSince(latestLinear?.updatedAt ?? null);
  const linearOk = linear?.ok === true
    && typeof linear.total === "number"
    && linear.total > 0
    && linearFresh !== null
    && linearFresh <= 7;
  addInitialSource(sources, {
    id: "linear-issues",
    label: "Linear issues",
    houseId: "paperclip_factory",
    ok: linearOk,
    status: linearOk ? "LIVE" : "AMBER",
    proof: linearOk
      ? `Linear ${linear?.status ?? "READ"} · ${linear.total} issues · latest ${latestLinear?.id ?? "?"} ${latestLinear?.updatedAt ?? "?"} · cache=${linear?.cache?.cachedAtUtc ?? "none"} · apiUsed=${String(linear?.apiUsed ?? false)}`
      : `SSR Linear quick read absent/stale (${linear?.reason ?? linear?.error ?? "timeout"}); AMBER until fresh issue proof.`,
    sourceTag: linearOk ? "LINEAR_LOCAL_CACHE_FIRST_SSR_20260601" : "LINEAR_READ_SSR_AMBER",
    actionState: linearOk ? "traitement" : null,
    runUtc: latestLinear?.updatedAt ?? now,
  });

  const n8nManifest = await readJsonFile<N8nManifest>(N8N_MANIFEST);
  const n8nRefresh = await readJsonFile<N8nTruthRefresh>(N8N_TRUTH_REFRESH);
  const n8nWorkflows = Array.isArray(n8nManifest?.created) ? n8nManifest.created : [];
  const n8nActive = n8nWorkflows.filter((workflow) => workflow.active === true);
  const n8nRefreshFresh = daysSince(n8nRefresh?.generated_at_utc) !== null && (daysSince(n8nRefresh?.generated_at_utc) ?? 99) <= 1;
  const n8nManifestOk = n8nManifest?.status === "active"
    && n8nActive.length > 0
    && n8nManifest.validation?.public_ingress_smoke === "pass"
    && typeof n8nManifest.validation?.paperclip_dispatch_job_id === "string";
  const n8nLive = n8nManifestOk
    && n8nRefresh?.ok === true
    && n8nRefreshFresh
    && (n8nRefresh.missing_local_files ?? []).length === 0
    && (n8nRefresh.missing_artifacts ?? []).length === 0;
  addInitialSource(sources, {
    id: "n8n-cloud",
    label: "n8n Cloud",
    houseId: "paperclip_factory",
    ok: n8nLive,
    status: n8nLive ? "LIVE" : "AMBER_REVERIFY",
    proof: `${N8N_MANIFEST} · refresh=${N8N_TRUTH_REFRESH} · active=${n8nActive.length}/${n8nWorkflows.length} · ingress=${n8nManifest?.validation?.public_ingress_smoke ?? "?"} · paperclip=${n8nManifest?.validation?.paperclip_dispatch_job_id ?? "missing"} · refreshed=${n8nRefresh?.generated_at_utc ?? "missing"}`,
    sourceTag: n8nLive ? n8nRefresh?.source_tag ?? "N8N_TRUTH_REFRESH_LOCAL_PROOF_20260601" : "N8N_LOCAL_MANIFEST_REVERIFY_20260601",
    actionState: n8nLive ? "traitement" : null,
    runUtc: n8nRefresh?.generated_at_utc ?? n8nManifest?.updated_at_utc ?? now,
  });

  const notionDbs = await readJsonFile<Record<string, unknown>>(`${STATE_ROOT}/notion_dbs.json`);
  const notionSync = await readJsonFile<Record<string, { error_count?: number; last_error?: string; last_pushed_ts?: string }>>(NOTION_SYNC_STATE);
  const notionDesktopDb = await fileStamp(NOTION_DESKTOP_DB);
  const notionDbCount = notionDbs
    ? Object.values(notionDbs).filter((value) => value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).title === "string").length
    : 0;
  const notionSyncEntries = Object.entries(notionSync ?? {})
    .filter(([src]) => !["decisions._AGENT_CONTEXT", "decisions._TEMPLATE", "decisions._immuables-r4-ban-anthropic"].includes(src))
    .map(([, entry]) => entry);
  const archivedAncestorEntries = notionSyncEntries.filter((entry) => typeof entry.error_count === "number" && entry.error_count > 0 && /archived ancestor/i.test(entry.last_error ?? ""));
  const notionBlockingEntries = notionSyncEntries.filter((entry) => typeof entry.error_count === "number" && entry.error_count > 0 && !/archived ancestor/i.test(entry.last_error ?? ""));
  const newestNotionSync = notionSyncEntries
    .map((entry) => entry.last_pushed_ts)
    .filter((value): value is string => typeof value === "string")
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const notionDesktopFresh = daysSince(notionDesktopDb.mtimeUtc) !== null && (daysSince(notionDesktopDb.mtimeUtc) ?? 99) <= 1;
  const notionLocalLive = notionDesktopDb.exists && notionDbCount > 0 && notionBlockingEntries.length === 0 && notionDesktopFresh;
  addInitialSource(sources, {
    id: "notion-index",
    label: "Notion",
    houseId: "obsidian_library",
    ok: notionLocalLive,
    status: notionLocalLive ? "LIVE" : "AMBER",
    proof: `local-first · ${notionDbCount} DBs · desktopDb=${notionDesktopDb.mtimeUtc ?? "missing"} · blockingSyncErrors=${notionBlockingEntries.length} · archivedAncestorIgnored=${archivedAncestorEntries.length} · newestSync=${newestNotionSync ?? "none"}`,
    sourceTag: "NOTION_DESKTOP_LOCAL_FIRST_SSR_20260601",
    actionState: notionLocalLive ? "inspection" : null,
    runUtc: typeof notionDbs?.bootstrap_at_utc === "string" ? notionDbs.bootstrap_at_utc : now,
  });

  const [obsidianAgentsStamp, obsidianCodexHandoffStamp] = await Promise.all([
    fileStamp(`${OBSIDIAN_VAULT}/AGENTS.md`),
    fileStamp(`${OBSIDIAN_VAULT}/06_SYNC/handoffs-codex/_latest.md`),
  ]);
  const obsidianFresh = daysSince(obsidianCodexHandoffStamp.mtimeUtc ?? obsidianAgentsStamp.mtimeUtc);
  const obsidianLive = obsidianAgentsStamp.exists
    && obsidianCodexHandoffStamp.exists
    && obsidianFresh !== null
    && obsidianFresh <= 14;
  addInitialSource(sources, {
    id: "obsidian-vault",
    label: "Obsidian Vault",
    houseId: "obsidian_library",
    ok: obsidianLive,
    status: obsidianLive ? "LIVE" : "AMBER_REVERIFY",
    proof: `${OBSIDIAN_VAULT} · AGENTS=${obsidianAgentsStamp.mtimeUtc ?? "missing"} · codexHandoff=${obsidianCodexHandoffStamp.mtimeUtc ?? "missing"}`,
    sourceTag: "OBSIDIAN_LOCAL_VAULT_SSR_20260601",
    actionState: obsidianLive ? "inspection" : null,
    runUtc: obsidianCodexHandoffStamp.mtimeUtc ?? obsidianAgentsStamp.mtimeUtc ?? now,
  });

  const notebookRaw = await readJsonFile<Record<string, unknown>>(NOTEBOOKLM_PACKS);
  const notebookResync = await readJsonFile<Record<string, unknown>>(NOTEBOOKLM_RESYNC);
  const packs = Array.isArray(notebookRaw?.packs) ? notebookRaw.packs : [];
  const packsTotal = typeof notebookRaw?.packs_total === "number" ? notebookRaw.packs_total : packs.length;
  const packsSynced = typeof notebookRaw?.packs_synced === "number"
    ? notebookRaw.packs_synced
    : packs.filter((pack) => pack && typeof pack === "object" && ["created", "synced"].includes(String((pack as Record<string, unknown>).status))).length;
  const packsAwaiting = typeof notebookRaw?.packs_awaiting_notebook_creation === "number" ? notebookRaw.packs_awaiting_notebook_creation : Math.max(0, packsTotal - packsSynced);
  const renderValidation = (notebookResync?.render_validation ?? {}) as Record<string, unknown>;
  const lastAuditUtc = typeof notebookResync?.generated_at_utc === "string" ? notebookResync.generated_at_utc : typeof notebookRaw?.last_audit_utc === "string" ? notebookRaw.last_audit_utc : null;
  const notebookFresh = daysSince(lastAuditUtc);
  const notebookRecords = Array.isArray(notebookResync?.records) ? notebookResync.records : [];
  const notebookAttached = notebookRecords.filter((record) => record && typeof record === "object" && typeof (record as Record<string, unknown>).notebook_id === "string").length;
  const notebookLive = notebookFresh !== null && notebookFresh <= 7 && renderValidation.status === "PASS" && packsSynced > 0 && notebookAttached > 0;
  addInitialSource(sources, {
    id: "notebooklm-index",
    label: "NotebookLM",
    houseId: "notebook_alm",
    ok: notebookLive,
    status: notebookLive ? "LIVE" : "AMBER_REVERIFY",
    proof: `source layer live · attached=${notebookAttached} · packs=${packsSynced}/${packsTotal} · pendingShells=${packsAwaiting} · audit=${lastAuditUtc ?? "?"} · render=${renderValidation.status ?? "UNKNOWN"}`,
    sourceTag: "NOTEBOOKLM_INDEX_SSR",
    actionState: notebookLive ? "inspection" : null,
    runUtc: lastAuditUtc ?? now,
  });

  const perplexity = await readJsonFile<{
    generated_at_utc?: string;
    source_tag?: string;
    ok?: boolean;
    perplexity_control_plane?: { ok?: boolean; live_exported_count?: number; blockers?: string[] };
    expansion_radar?: { ok?: boolean; counts?: { opportunities?: number }; blockers?: string[] };
  }>(PERPLEXITY_SYNC);
  let reportMtimeUtc: string | null = null;
  try {
    reportMtimeUtc = (await stat(PERPLEXITY_REPORT)).mtime.toISOString();
  } catch {
    reportMtimeUtc = null;
  }
  const perplexityBlockers = [
    ...(perplexity?.perplexity_control_plane?.blockers ?? []),
    ...(perplexity?.expansion_radar?.blockers ?? []),
  ];
  const perplexityFresh = daysSince(perplexity?.generated_at_utc);
  const perplexityLive = perplexity?.ok === true && perplexity.perplexity_control_plane?.ok === true && perplexity.expansion_radar?.ok === true && perplexityBlockers.length === 0 && perplexityFresh !== null && perplexityFresh <= 7;
  addInitialSource(sources, {
    id: "perplexity-radar",
    label: "Perplexity",
    houseId: "lightrag_observatory",
    ok: perplexityLive,
    status: perplexityLive ? "LIVE" : "AMBER_REVERIFY",
    proof: `${PERPLEXITY_SYNC}; ${PERPLEXITY_REPORT}; live_exported=${perplexity?.perplexity_control_plane?.live_exported_count ?? "?"}; opportunities=${perplexity?.expansion_radar?.counts?.opportunities ?? "?"}`,
    sourceTag: perplexity?.source_tag ?? "PERPLEXITY_LOCAL_STATUS_SSR",
    actionState: perplexityLive ? "inspection" : null,
    runUtc: perplexity?.generated_at_utc ?? reportMtimeUtc ?? now,
  });

  const [telegramBridge, telegramRegistryStamp] = await Promise.all([readTelegramBridge(), fileStamp(TELEGRAM_CHANNELS_REGISTRY)]);
  const telegramBridgeFresh = secondsSince(telegramBridge?.runUtc ?? null);
  const telegramBridgeLive = telegramBridge?.sourcesAlive != null && telegramBridge.sourcesAlive > 0 && telegramBridgeFresh !== null && telegramBridgeFresh <= 180;
  const telegramRegistryFresh = daysSince(telegramRegistryStamp.mtimeUtc) !== null && (daysSince(telegramRegistryStamp.mtimeUtc) ?? 99) <= 14;
  [
    ["telegram_iron", "Telegram Iron", "Iron DM/agents covered by Telegram bus + registry."],
    ["telegram_free", "Telegram Free", "FREE support/channel covered by Telegram bus + registry."],
    ["telegram_vip", "Telegram VIP", "VIP channel covered by Telegram bus + registry."],
    ["telegram_erwin", "Compte perso Erwin", "Erwin personal/DM pool covered by Telegram bus + registry."],
  ].forEach(([id, label, detail]) => addInitialSource(sources, {
    id: `telegram-${id}`,
    label,
    houseId: "vip_gate",
    ok: telegramBridgeLive && telegramRegistryFresh,
    status: telegramBridgeLive && telegramRegistryFresh ? "LIVE" : "AMBER",
    proof: telegramBridgeLive && telegramRegistryFresh
      ? `${detail} · bus=${TELEGRAM_BUS} · ${telegramBridge?.summary ?? "no summary"} · registry=${TELEGRAM_CHANNELS_REGISTRY} · age=${telegramBridgeFresh ?? "?"}s`
      : `${detail} · bus/registry non frais; no false-green.`,
    sourceTag: "TELEGRAM_HUB_BUS_AND_REGISTRY_SSR_20260601",
    actionState: telegramBridgeLive && telegramRegistryFresh ? "messagerie" : null,
    runUtc: telegramBridge?.runUtc ?? now,
  }));

  addInitialSource(sources, {
    id: "telegram-bridge",
    label: "Telegram bridge",
    houseId: "vip_gate",
    ok: telegramBridgeLive,
    status: telegramBridgeLive ? "LIVE" : "AMBER",
    proof: telegramBridge
      ? `${TELEGRAM_BUS} · ${telegramBridge.summary} · age=${telegramBridgeFresh ?? "?"}s`
      : `${TELEGRAM_BUS} absent ou illisible`,
    sourceTag: "TELEGRAM_HUB_BRIDGE_LOCAL_HEARTBEAT_SSR_20260601",
    actionState: telegramBridgeLive ? "messagerie" : null,
    runUtc: telegramBridge?.runUtc ?? now,
  });

  if (typeof snapshot?.revenue?.activeVip === "number") {
    const activeVip = snapshot.revenue.activeVip;
    addInitialSource(sources, {
      id: "vip-active",
      label: "VIP actifs",
      houseId: "vip_gate",
      ok: activeVip > 0,
      status: activeVip > 0 ? "LIVE" : "AMBER",
      proof: `activeVip=${activeVip}; MRR=${snapshot.revenue.currentMrrEur ?? "UNKNOWN"} EUR`,
      sourceTag: snapshot.sourceTag ?? "SNAPSHOT_REVENUE_SSR",
      actionState: activeVip > 0 ? "messagerie" : null,
      runUtc: snapshot.fetchedAt ?? now,
    });
  }

  const houses = sources.reduce<Record<string, TruthSource[]>>((acc, source) => {
    (acc[source.houseId] ||= []).push(source);
    return acc;
  }, {});
  const events = sources
    .filter((source) => source.status === "LIVE" && source.ok === true && source.actionState)
    .map((source) => ({
      id: `truth-${source.id}`,
      house_id: source.houseId,
      kind: "truth_source",
      status: "LIVE",
      label: `${source.label} · ${source.actionState}`,
      source: source.sourceTag,
      proof: source.proof,
      ts: source.runUtc ?? now,
    }));

  return {
    sourceTag: "COFIAT_WORLD_TRUTH_MAP_SSR_SEED_V2_20260601",
    generatedAtUtc: now,
    summary: {
      sources: sources.length,
      live: sources.filter((source) => source.status === "LIVE" && source.ok === true).length,
      amber: sources.filter((source) => source.status === "AMBER" || source.status === "AMBER_REVERIFY").length,
      unknown: sources.filter((source) => source.status === "UNKNOWN").length,
    },
    houses,
    events,
  };
}

export const metadata = {
  title: "COFIATRADING — Living World Control",
  description: "Living World Map canon — maisons, agents, machines et preuves sourçables sans faux LIVE.",
};

const emptyInitialTruthMap = (generatedAtUtc: string): TruthMapPayload => ({
  sourceTag: "TRUTH_MAP_CLIENT_PROGRESSIVE_NO_BLOCKING_SSR_20260601",
  generatedAtUtc,
  summary: { sources: 0, live: 0, amber: 0, unknown: 0 },
  houses: {},
  events: [],
});

async function withSsrBudget<T>(promise: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

export default async function CofiatradingWorldControlPage() {
  await headers();
  const fastSnapshot = await buildFastInitialSnapshot();
  const initialConsoleIaInbox: ConsoleIAInitialInbox = {
    sourceTag: "CONSOLE_IA_CLIENT_PROGRESSIVE_NO_BLOCKING_SSR_20260601",
    destinations: [],
    conversations: [],
    totals: null,
  };
  const initialSnapshot = {
    ...fastSnapshot,
    consoleIaInbox: initialConsoleIaInbox,
  };
  const initialAngelRoster: AngelRosterPayload | null = null;
  const initialTruthMap = await withSsrBudget(
    buildInitialTruthMap(initialSnapshot),
    emptyInitialTruthMap(new Date().toISOString()),
    650,
  );

  return (
    <>
      <WorldControl initialSnapshot={initialSnapshot} initialAngelRoster={initialAngelRoster} initialTruthMap={initialTruthMap} />
      <PatrimoinePanel />
    </>
  );
}
