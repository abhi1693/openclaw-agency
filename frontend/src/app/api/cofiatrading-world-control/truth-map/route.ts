import { readFile, readdir, stat } from "node:fs/promises";
import { NextResponse } from "next/server";

import { readLocalRevenue } from "../_lib/localRevenue";
import { readGoogleWorkspaceProof } from "../_lib/googleWorkspace";
import { readLobsterProof } from "../_lib/lobster";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SourceStatus = "LIVE" | "AMBER" | "AMBER_REVERIFY" | "UNKNOWN";
type TruthSource = {
  id: string;
  label: string;
  houseId: string;
  status: SourceStatus;
  ok: boolean;
  proof: string;
  sourceTag: string;
  actionState: "inspection" | "messagerie" | "traitement" | null;
  runUtc: string | null;
};
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
  sourceTag?: string;
  cachedAtUtc?: string | null;
  lastAttemptUtc?: string | null;
  lastError?: string | null;
  payload?: LinearPayload | null;
};
type N8nWorkflow = { name?: string; id?: string; active?: boolean; local_file?: string };
type N8nManifest = {
  status?: string;
  updated_at_utc?: string;
  hub_base_url?: string;
  validation?: { public_ingress_smoke?: string; paperclip_dispatch_job_id?: string };
  created?: N8nWorkflow[];
};
type N8nTruthRefresh = {
  ok?: boolean;
  status?: string;
  generated_at_utc?: string;
  source_tag?: string;
  active_workflows?: number;
  total_workflows?: number;
  public_ingress_smoke?: string;
  paperclip_dispatch_job_id?: string;
  missing_local_files?: string[];
  missing_artifacts?: string[];
};

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
const OBSIDIAN_VAULT = "/Users/burakokyay/Obsidian/COF_TRADING";
const OBSIDIAN_SECTIONS = [
  "00_INBOX",
  "01_DASHBOARD",
  "02_AGENTS",
  "03_KNOWLEDGE",
  "04_OPERATIONS",
  "05_LIVE",
  "06_SYNC",
  "07_RESEARCH",
  "08_REPORTS",
  "09_TEMPLATES",
  "10_PROJECTS",
  "11_ARCHIVES",
];
const N8N_MANIFEST = "/Users/burakokyay/cof-trading/config/n8n/clean-workflows-20260428/manifest.json";
const N8N_TRUTH_REFRESH = "/Users/burakokyay/.openclaw/state/company_os/n8n_truth_refresh.json";
const LEGACY_IGNORED_NOTION_SYNC_SOURCES = new Set([
  "decisions._AGENT_CONTEXT",
  "decisions._TEMPLATE",
  "decisions._immuables-r4-ban-anthropic",
]);

const normalizeStatus = (value: unknown, ok?: boolean): SourceStatus => {
  const upper = String(value ?? "").toUpperCase();
  if (ok === true && (upper === "LIVE" || upper === "LIVE_OK" || upper === "OK")) return "LIVE";
  if (upper === "LIVE" || upper === "LIVE_OK") return "LIVE";
  if (upper.includes("REVERIFY")) return "AMBER_REVERIFY";
  if (upper.includes("AMBER") || upper.includes("PARTIAL") || upper.includes("DEGRADED") || upper.includes("MISSING")) return "AMBER";
  return "UNKNOWN";
};

const rec = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readJsonFile = async <T,>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
};

const countMarkdown = async (path: string): Promise<number> => {
  try {
    const entries = await readdir(path);
    return entries.filter((entry) => typeof entry === "string" && entry.endsWith(".md")).length;
  } catch {
    return 0;
  }
};

const fileStamp = async (path: string): Promise<{ exists: boolean; mtimeUtc: string | null; bytes: number | null }> => {
  try {
    const s = await stat(path);
    return { exists: true, mtimeUtc: s.mtime.toISOString(), bytes: s.size };
  } catch {
    return { exists: false, mtimeUtc: null, bytes: null };
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

const readLastLine = async (path: string): Promise<string | null> => {
  try {
    const lines = (await readFile(path, "utf8")).split("\n").filter((line) => line.trim());
    return lines.at(-1) ?? null;
  } catch {
    return null;
  }
};

const readLinearIssues = async (): Promise<LinearPayload | null> => {
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

const readObsidianSummary = async () => {
  const [sections, agentsStamp, codexHandoffStamp] = await Promise.all([
    Promise.all(OBSIDIAN_SECTIONS.map(async (section) => ({ section, notes: await countMarkdown(`${OBSIDIAN_VAULT}/${section}`) }))),
    fileStamp(`${OBSIDIAN_VAULT}/AGENTS.md`),
    fileStamp(`${OBSIDIAN_VAULT}/06_SYNC/handoffs-codex/_latest.md`),
  ]);
  const total = sections.reduce((acc, section) => acc + section.notes, 0);
  return {
    total,
    sections: sections.filter((section) => section.notes > 0),
    agentsStamp,
    codexHandoffStamp,
  };
};

const readN8nManifest = async () => {
  try {
    const [manifest, stamp, refresh] = await Promise.all([
      readJsonFile<N8nManifest>(N8N_MANIFEST),
      fileStamp(N8N_MANIFEST),
      readJsonFile<N8nTruthRefresh>(N8N_TRUTH_REFRESH),
    ]);
    return { manifest, stamp, refresh };
  } catch {
    return { manifest: null, stamp: { exists: false, mtimeUtc: null, bytes: null }, refresh: null };
  }
};

const readTelegramBridge = async () => {
  try {
    const lines = (await readFile(TELEGRAM_BUS, "utf8")).split("\n").filter((line) => line.trim());
    const lastLine = lines.at(-1);
    if (!lastLine) return null;
    const parsed = JSON.parse(lastLine) as { t?: number; f?: string; r?: string; s?: string };
    const ts = typeof parsed.t === "number" ? new Date(parsed.t * 1000).toISOString() : null;
    const summary = typeof parsed.s === "string" ? parsed.s : "";
    const sourcesAlive = Number(summary.match(/sources=(\d+)/)?.[1] ?? NaN);
    const eventsNew = Number(summary.match(/events_new=(\d+)/)?.[1] ?? NaN);
    return {
      runUtc: ts,
      summary,
      sourcesAlive: Number.isFinite(sourcesAlive) ? sourcesAlive : null,
      eventsNew: Number.isFinite(eventsNew) ? eventsNew : null,
    };
  } catch {
    return null;
  }
};

const addSource = (
  sources: TruthSource[],
  source: Omit<TruthSource, "status" | "ok"> & { status?: unknown; ok?: boolean },
) => {
  const normalized = normalizeStatus(source.status, source.ok);
  const status: SourceStatus = normalized === "LIVE" && source.ok !== true ? "AMBER_REVERIFY" : normalized;
  sources.push({
    ...source,
    status,
    ok: source.ok === true && status === "LIVE",
  });
};

export async function GET() {
  const now = new Date().toISOString();
  const sources: TruthSource[] = [];

  const [google, googleWorkspace, lobster, notionDbs, notionSync, notionDesktopDb, notebookRaw, notebookResync, perplexity, revenueResult, linear, telegramBridge, telegramRegistryStamp, adminLogStamp, adminLastLine, obsidian, n8n] = await Promise.all([
    readJsonFile<{
      run_utc?: string;
      components?: Array<{
        tool?: string;
        status?: string;
        summary?: string;
        data_volume?: Record<string, unknown>;
        proof_ref?: { age_sec?: number } | null;
        last_success_utc?: string | null;
      }>;
    }>(GOOGLE_360),
    readGoogleWorkspaceProof(),
    readLobsterProof(),
    readJsonFile<Record<string, unknown>>(`${STATE_ROOT}/notion_dbs.json`),
    readJsonFile<Record<string, { error_count?: number; last_error?: string; last_pushed_ts?: string }>>(NOTION_SYNC_STATE),
    fileStamp(NOTION_DESKTOP_DB),
    readJsonFile<Record<string, unknown>>(NOTEBOOKLM_PACKS),
    readJsonFile<Record<string, unknown>>(NOTEBOOKLM_RESYNC),
    readJsonFile<{
      generated_at_utc?: string;
      source_tag?: string;
      ok?: boolean;
      perplexity_control_plane?: { ok?: boolean; live_exported_count?: number; blockers?: string[] };
      expansion_radar?: { ok?: boolean; counts?: { opportunities?: number }; blockers?: string[] };
    }>(PERPLEXITY_SYNC),
    readLocalRevenue(),
    readLinearIssues(),
    readTelegramBridge(),
    fileStamp(TELEGRAM_CHANNELS_REGISTRY),
    fileStamp(ADMIN_SDK_LOG),
    readLastLine(ADMIN_SDK_LOG),
    readObsidianSummary(),
    readN8nManifest(),
  ]);
  const revenue = rec(revenueResult.data);

  const calendar = google?.components?.find((component) => component.tool === "calendar");
  const calendarProofAgeSec =
    typeof calendar?.proof_ref?.age_sec === "number" && Number.isFinite(calendar.proof_ref.age_sec)
      ? calendar.proof_ref.age_sec
      : null;
  const calendarProofStale = calendarProofAgeSec === null || calendarProofAgeSec > 86_400 || !calendar?.last_success_utc;
  const calendarOk = calendar?.status === "LIVE_OK" && !calendarProofStale;
  addSource(sources, {
    id: "calendar-read",
    label: "Calendar read",
    houseId: "calendar_tower",
    ok: calendarOk,
    status: calendarOk ? "LIVE" : calendar?.status === "LIVE_OK" ? "AMBER_REVERIFY" : calendar?.status,
    proof: calendarOk
      ? `${calendar?.summary ?? "bounded read"} · events=${Number(calendar?.data_volume?.events_returned ?? 0)}`
      : `calendar absent/degraded/stale in ${GOOGLE_360} · proofAgeSec=${calendarProofAgeSec ?? "missing"} · lastSuccess=${calendar?.last_success_utc ?? "missing"}`,
    sourceTag: "CALENDAR_GOOGLE_WORKSPACE_360_20260601",
    actionState: calendarOk ? "inspection" : null,
    runUtc: google?.run_utc ?? now,
  });

  const adminAuditFresh = daysSince(adminLogStamp.mtimeUtc) !== null && (daysSince(adminLogStamp.mtimeUtc) ?? 99) <= 1 && /Audit 2026-06/.test(adminLastLine ?? "");
  for (const component of googleWorkspace.components.filter((item) => item.rawTool !== "calendar")) {
    const componentOk = component.rawTool === "admin_sdk" && adminAuditFresh ? true : component.ok;
    const componentStatus = component.rawTool === "admin_sdk" && adminAuditFresh ? "LIVE" : component.status;
    const componentProof = component.rawTool === "admin_sdk" && adminAuditFresh
      ? `${adminLastLine} · log=${ADMIN_SDK_LOG} · snapshot=${GOOGLE_360} · capability=${component.capability}`
      : `${component.proof} · capability=${component.capability}`;
    addSource(sources, {
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

  for (const component of lobster.components) {
    addSource(sources, {
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

  const linearIssues = Array.isArray(linear?.issues) ? linear.issues : [];
  const latestLinear = linearIssues.find((issue) => typeof issue.updatedAt === "string") ?? null;
  const linearFresh = daysSince(latestLinear?.updatedAt ?? null);
  const linearOk = linear?.ok === true
    && typeof linear.total === "number"
    && linear.total > 0
    && linearFresh !== null
    && linearFresh <= 7;
  addSource(sources, {
    id: "linear-issues",
    label: "Linear issues",
    houseId: "paperclip_factory",
    ok: linearOk,
    status: linearOk ? "LIVE" : "AMBER",
    proof: linearOk
      ? `Linear ${linear?.status ?? "READ"} · ${linear.total} issues · latest ${latestLinear?.id ?? "?"} ${latestLinear?.updatedAt ?? "?"} · cache=${linear?.cache?.cachedAtUtc ?? "none"} · apiUsed=${String(linear?.apiUsed ?? false)}`
      : `Linear quick read absent/stale (${linear?.reason ?? linear?.error ?? "timeout"}); AMBER until fresh issue proof.`,
    sourceTag: linearOk ? "LINEAR_LOCAL_CACHE_FIRST_TRUTH_MAP_20260601" : "LINEAR_READ_FAST_TRUTH_MAP_AMBER_20260601",
    actionState: linearOk ? "traitement" : null,
    runUtc: latestLinear?.updatedAt ?? now,
  });

  const n8nWorkflows = Array.isArray(n8n.manifest?.created) ? n8n.manifest.created : [];
  const n8nActive = n8nWorkflows.filter((workflow) => workflow.active === true);
  const n8nUpdatedAt = n8n.manifest?.updated_at_utc ?? n8n.stamp.mtimeUtc;
  const n8nAge = daysSince(n8nUpdatedAt);
  const n8nRefreshFresh = daysSince(n8n.refresh?.generated_at_utc) !== null && (daysSince(n8n.refresh?.generated_at_utc) ?? 99) <= 1;
  const n8nManifestOk = n8n.manifest?.status === "active"
    && n8nActive.length > 0
    && n8n.manifest?.validation?.public_ingress_smoke === "pass"
    && typeof n8n.manifest?.validation?.paperclip_dispatch_job_id === "string";
  const n8nRefreshOk = n8n.refresh?.ok === true
    && n8nRefreshFresh
    && (n8n.refresh.missing_local_files ?? []).length === 0
    && (n8n.refresh.missing_artifacts ?? []).length === 0;
  const n8nLive = n8nManifestOk && ((n8nAge !== null && n8nAge <= 14) || n8nRefreshOk);
  addSource(sources, {
    id: "n8n-cloud",
    label: "n8n Cloud",
    houseId: "paperclip_factory",
    ok: n8nLive,
    status: n8nLive ? "LIVE" : n8nManifestOk ? "AMBER_REVERIFY" : "AMBER",
    proof: n8nManifestOk
      ? `${N8N_MANIFEST} · refresh=${N8N_TRUTH_REFRESH} · active=${n8nActive.length}/${n8nWorkflows.length} · ingress=${n8n.manifest?.validation?.public_ingress_smoke ?? "?"} · paperclip=${n8n.manifest?.validation?.paperclip_dispatch_job_id ?? "missing"} · refreshed=${n8n.refresh?.generated_at_utc ?? "missing"} · manifestAge=${n8nAge ?? "?"}d`
      : `${N8N_MANIFEST} absent/degraded; route hub n8n reste AMBER sans preuve récente.`,
    sourceTag: n8nLive ? n8n.refresh?.source_tag ?? "N8N_CLOUD_LOCAL_MANIFEST_TRUTH_MAP_20260601" : "N8N_LOCAL_MANIFEST_REVERIFY_20260601",
    actionState: n8nLive ? "traitement" : null,
    runUtc: n8n.refresh?.generated_at_utc ?? n8nUpdatedAt ?? now,
  });

  const notionDbCount = notionDbs
    ? Object.values(notionDbs).filter((value) => value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).title === "string").length
    : 0;
  const notionSyncEntries = Object.entries(notionSync ?? {});
  const legacyIgnoredEntries = notionSyncEntries.filter(([src, entry]) =>
    LEGACY_IGNORED_NOTION_SYNC_SOURCES.has(src) && typeof entry.error_count === "number" && entry.error_count > 0,
  );
  const notionSyncEntryValues = notionSyncEntries.map(([, entry]) => entry);
  const archivedAncestorEntries = notionSyncEntryValues.filter((entry) => typeof entry.error_count === "number" && entry.error_count > 0 && /archived ancestor/i.test(entry.last_error ?? ""));
  const notionBlockingEntries = notionSyncEntryValues.filter((entry) => typeof entry.error_count === "number" && entry.error_count > 0);
  const notionSyncErrors = notionBlockingEntries.length;
  const newestNotionSync = notionSyncEntryValues
    .map((entry) => entry.last_pushed_ts)
    .filter((value): value is string => typeof value === "string")
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const notionSyncFresh = daysSince(newestNotionSync);
  const notionDesktopFresh = daysSince(notionDesktopDb.mtimeUtc) !== null && (daysSince(notionDesktopDb.mtimeUtc) ?? 99) <= 1;
  const notionLocalLive = notionDesktopDb.exists
    && notionDbCount > 0
    && notionSyncErrors === 0
    && ((notionSyncFresh !== null && notionSyncFresh <= 1) || notionDesktopFresh);
  const notionProofRunUtc =
    (notionSyncFresh !== null && notionSyncFresh <= 1 ? newestNotionSync : null)
    ?? (notionDesktopFresh ? notionDesktopDb.mtimeUtc : null)
    ?? newestNotionSync
    ?? (typeof notionDbs?.bootstrap_at_utc === "string" ? notionDbs.bootstrap_at_utc : null);
  addSource(sources, {
    id: "notion-index",
    label: "Notion Desktop",
    houseId: "obsidian_library",
    ok: notionLocalLive,
    status: notionLocalLive ? "LIVE" : "AMBER",
    proof: `local-first · ${notionDbCount} DBs · desktopDb=${notionDesktopDb.mtimeUtc ?? "missing"} · blockingSyncErrors=${notionSyncErrors} · archivedAncestorErrors=${archivedAncestorEntries.length} · legacyIgnoredErrors=${legacyIgnoredEntries.length} · newestSync=${newestNotionSync ?? "none"} · proofRun=${notionProofRunUtc ?? "none"}`,
    sourceTag: "NOTION_DESKTOP_LOCAL_FIRST_TRUTH_MAP_20260601",
    actionState: notionLocalLive ? "inspection" : null,
    runUtc: notionProofRunUtc ?? now,
  });

  const obsidianFresh = daysSince(obsidian.codexHandoffStamp.mtimeUtc ?? obsidian.agentsStamp.mtimeUtc);
  const obsidianLive = obsidian.total > 0
    && obsidian.agentsStamp.exists
    && obsidian.codexHandoffStamp.exists
    && obsidianFresh !== null
    && obsidianFresh <= 14;
  addSource(sources, {
    id: "obsidian-vault",
    label: "Obsidian Vault",
    houseId: "obsidian_library",
    ok: obsidianLive,
    status: obsidianLive ? "LIVE" : "AMBER_REVERIFY",
    proof: `${OBSIDIAN_VAULT} · read=${now} · notes=${obsidian.total} · sections=${obsidian.sections.length} · AGENTS=${obsidian.agentsStamp.mtimeUtc ?? "missing"} · codexHandoff=${obsidian.codexHandoffStamp.mtimeUtc ?? "missing"}`,
    sourceTag: "OBSIDIAN_LOCAL_VAULT_TRUTH_MAP_20260601",
    actionState: obsidianLive ? "inspection" : null,
    runUtc: obsidianLive ? now : obsidian.codexHandoffStamp.mtimeUtc ?? obsidian.agentsStamp.mtimeUtc ?? now,
  });

  const packs = Array.isArray(notebookRaw?.packs) ? notebookRaw.packs : [];
  const packsTotal = typeof notebookRaw?.packs_total === "number" ? notebookRaw.packs_total : packs.length;
  const packsSynced = typeof notebookRaw?.packs_synced === "number"
    ? notebookRaw.packs_synced
    : packs.filter((pack) => pack && typeof pack === "object" && ["created", "synced"].includes(String((pack as Record<string, unknown>).status))).length;
  const packsAwaiting = typeof notebookRaw?.packs_awaiting_notebook_creation === "number" ? notebookRaw.packs_awaiting_notebook_creation : Math.max(0, packsTotal - packsSynced);
  const renderValidation = rec(notebookResync?.render_validation);
  const lastAuditUtc = typeof notebookResync?.generated_at_utc === "string" ? notebookResync.generated_at_utc : typeof notebookRaw?.last_audit_utc === "string" ? notebookRaw.last_audit_utc : null;
  const notebookFresh = daysSince(lastAuditUtc);
  const notebookRecords = Array.isArray(notebookResync?.records) ? notebookResync.records : [];
  const notebookAttached = notebookRecords.filter((record) => record && typeof record === "object" && typeof (record as Record<string, unknown>).notebook_id === "string").length;
  const notebookLive = notebookFresh !== null && notebookFresh <= 7 && renderValidation.status === "PASS" && packsSynced > 0 && notebookAttached > 0;
  addSource(sources, {
    id: "notebooklm-index",
    label: "NotebookLM",
    houseId: "notebook_alm",
    ok: notebookLive,
    status: notebookLive ? "LIVE" : "AMBER_REVERIFY",
    proof: `source layer live · attached=${notebookAttached} · packs=${packsSynced}/${packsTotal} · pendingShells=${packsAwaiting} · audit=${lastAuditUtc ?? "?"} · render=${renderValidation.status ?? "UNKNOWN"}`,
    sourceTag: "NOTEBOOKLM_INDEX_FAST_TRUTH_MAP",
    actionState: notebookLive ? "inspection" : null,
    runUtc: lastAuditUtc ?? now,
  });

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
  const perplexityLive = perplexity?.ok === true
    && perplexity.perplexity_control_plane?.ok === true
    && perplexity.expansion_radar?.ok === true
    && perplexityBlockers.length === 0
    && perplexityFresh !== null
    && perplexityFresh <= 7;
  addSource(sources, {
    id: "perplexity-radar",
    label: "Perplexity",
    houseId: "lightrag_observatory",
    ok: perplexityLive,
    status: perplexityLive ? "LIVE" : "AMBER_REVERIFY",
    proof: `${PERPLEXITY_SYNC}; ${PERPLEXITY_REPORT}; live_exported=${perplexity?.perplexity_control_plane?.live_exported_count ?? "?"}; opportunities=${perplexity?.expansion_radar?.counts?.opportunities ?? "?"}`,
    sourceTag: perplexity?.source_tag ?? "PERPLEXITY_LOCAL_FAST_TRUTH_MAP",
    actionState: perplexityLive ? "inspection" : null,
    runUtc: perplexity?.generated_at_utc ?? reportMtimeUtc ?? now,
  });

  const telegramBridgeFresh = secondsSince(telegramBridge?.runUtc ?? null);
  const telegramBridgeLive = telegramBridge?.sourcesAlive != null
    && telegramBridge.sourcesAlive > 0
    && telegramBridgeFresh !== null
    && telegramBridgeFresh <= 180;
  const telegramRegistryFresh = daysSince(telegramRegistryStamp.mtimeUtc) !== null && (daysSince(telegramRegistryStamp.mtimeUtc) ?? 99) <= 14;
  [
    ["telegram_iron", "Telegram Iron", "Iron DM/agents covered by Telegram bus + registry."],
    ["telegram_free", "Telegram Free", "FREE support/channel covered by Telegram bus + registry."],
    ["telegram_vip", "Telegram VIP", "VIP channel covered by Telegram bus + registry."],
    ["telegram_erwin", "Compte perso Erwin", "Erwin personal/DM pool covered by Telegram bus + registry."],
  ].forEach(([id, label, detail]) => addSource(sources, {
    id: `telegram-${id}`,
    label,
    houseId: "vip_gate",
    ok: telegramBridgeLive && telegramRegistryFresh,
    status: telegramBridgeLive && telegramRegistryFresh ? "LIVE" : "AMBER",
    proof: telegramBridgeLive && telegramRegistryFresh
      ? `${detail} · bus=${TELEGRAM_BUS} · ${telegramBridge?.summary ?? "no summary"} · registry=${TELEGRAM_CHANNELS_REGISTRY} · age=${telegramBridgeFresh ?? "?"}s`
      : `${detail} · bus/registry non frais; no false-green.`,
    sourceTag: "TELEGRAM_HUB_BUS_AND_REGISTRY_TRUTH_MAP_20260601",
    actionState: telegramBridgeLive && telegramRegistryFresh ? "messagerie" : null,
    runUtc: telegramBridge?.runUtc ?? now,
  }));

  addSource(sources, {
    id: "telegram-bridge",
    label: "Telegram bridge",
    houseId: "vip_gate",
    ok: telegramBridgeLive,
    status: telegramBridgeLive ? "LIVE" : "AMBER",
    proof: telegramBridge
      ? `${TELEGRAM_BUS} · ${telegramBridge.summary} · age=${telegramBridgeFresh ?? "?"}s`
      : `${TELEGRAM_BUS} absent ou illisible`,
    sourceTag: "TELEGRAM_HUB_BRIDGE_LOCAL_HEARTBEAT_20260601",
    actionState: telegramBridgeLive ? "messagerie" : null,
    runUtc: telegramBridge?.runUtc ?? now,
  });

  const activeVip = num(revenue.active_vip);
  if (activeVip !== null) {
    const currentMrrEur = num(revenue.mrr_eur) ?? num(revenue.current_mrr_eur);
    const overlayRunUtc = typeof revenue.stripe_overlay_read_utc === "string" ? revenue.stripe_overlay_read_utc : null;
    const cofStateRunUtc = typeof revenue.cof_state_ts === "string" ? revenue.cof_state_ts : null;
    const revenueRunUtc = overlayRunUtc ?? cofStateRunUtc;
    const revenueAgeSec = secondsSince(revenueRunUtc);
    const revenueFresh = revenueAgeSec !== null && revenueAgeSec >= 0 && revenueAgeSec <= 600;
    const revenueProofMode = overlayRunUtc ? "stripe_overlay_backend_8000" : "cof_state_local";
    const vipLive = activeVip > 0 && revenueFresh;
    addSource(sources, {
      id: "vip-active",
      label: "VIP actifs",
      houseId: "vip_gate",
      ok: vipLive,
      status: vipLive ? "LIVE" : activeVip > 0 ? "AMBER_REVERIFY" : "AMBER",
      proof: `activeVip=${activeVip}; MRR=${currentMrrEur ?? "UNKNOWN"} EUR; mode=${revenueProofMode}; ageSec=${revenueAgeSec ?? "unknown"}; ttlSec=600`,
      sourceTag: String(revenue.source_tag ?? "LOCAL_REVENUE_TRUTH_MAP"),
      actionState: vipLive ? "messagerie" : null,
      runUtc: revenueRunUtc ?? now,
    });
  }

  const houses = sources.reduce<Record<string, TruthSource[]>>((acc, source) => {
    (acc[source.houseId] ||= []).push(source);
    return acc;
  }, {});

  return NextResponse.json(
    {
      ok: true,
      sourceTag: "COFIAT_WORLD_TRUTH_MAP_FAST_LOCAL_V3_20260601",
      generatedAtUtc: now,
      summary: {
        sources: sources.length,
        live: sources.filter((source) => source.status === "LIVE" && source.ok === true).length,
        amber: sources.filter((source) => source.status === "AMBER" || source.status === "AMBER_REVERIFY").length,
        unknown: sources.filter((source) => source.status === "UNKNOWN").length,
      },
      houses,
      events: sources
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
        })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
