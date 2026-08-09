import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { promisify } from "node:util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE = process.env.COF_OPENCLAW_STATE ?? "/Users/burakokyay/.openclaw/state";
const CREDS_PATH =
  process.env.COF_CREDENTIALS_ENV ?? "/Users/burakokyay/cof-trading/config/credentials.env";
const NOTION_APP = "/Applications/Notion.app";
const NOTION_SUPPORT = `${homedir()}/Library/Application Support/Notion`;
const NOTION_DB = `${NOTION_SUPPORT}/notion.db`;
const SYNC_STATE = `${STATE}/notion_sync_state.json`;
const LOCAL_WRITE_QUEUE = `${STATE}/notion_local_write_queue.jsonl`;
const execFileAsync = promisify(execFile);

type FileProof = {
  exists: boolean;
  path: string;
  bytes: number | null;
  mtimeUtc: string | null;
};

type SyncEntry = {
  error_count?: unknown;
  last_error?: unknown;
  last_error_ts?: unknown;
  last_pushed_ts?: unknown;
};

const EXPECTED_SYNC_TARGETS = [
  "activation",
  "agents",
  "blockers",
  "decisions",
  "handoffs",
  "health",
  "inventory",
  "iron_tickets",
  "kpi",
  "memory",
  "mocs",
  "state",
];
const LEGACY_IGNORED_SYNC_SOURCES = new Set([
  "decisions._AGENT_CONTEXT",
  "decisions._TEMPLATE",
  "decisions._immuables-r4-ban-anthropic",
]);

/** clé Notion : env d'abord, sinon credentials.env (lecture server-only, jamais exposée au client) */
async function getNotionKey(): Promise<string | null> {
  if (process.env.NOTION_API_KEY) return process.env.NOTION_API_KEY;
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN;
  try {
    const raw = await readFile(CREDS_PATH, "utf8");
    const m = raw.match(/^(?:NOTION_API_KEY|NOTION_TOKEN|NOTION_SECRET|NOTION_INTERNAL_INTEGRATION_TOKEN)=(.+)$/m);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : null;
  } catch {
    return null;
  }
}

/**
 * Ping live api.notion.com/v1/users/me — preuve que le TOKEN est vivant (no-false-green).
 * Différent du registre filesystem `notion_dbs.json` (qui prouve l'intégration, pas la
 * fraîcheur du token). Le panneau d'auth peut ainsi distinguer GREEN-live de GREEN-cache.
 */
async function notionLivePing(): Promise<{ ok: boolean; status: number | null; who: string | null; reason?: string }> {
  const key = await getNotionKey();
  if (!key) return { ok: false, status: null, who: null, reason: "NOTION_API_KEY absent" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api.notion.com/v1/users/me", {
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Notion-Version": "2022-06-28" },
    });
    let who: string | null = null;
    try {
      const j = (await res.json()) as Record<string, unknown>;
      const bot = j?.bot as Record<string, unknown> | undefined;
      who = (j?.name as string) ?? (bot?.workspace_name as string) ?? (j?.type as string) ?? null;
    } catch {
      // corps non-JSON : on garde who=null, le status fait foi
    }
    return { ok: res.ok, status: res.status, who };
  } catch (e) {
    return { ok: false, status: null, who: null, reason: e instanceof Error ? e.message : "FETCH_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fileProof(path: string): Promise<FileProof> {
  try {
    const s = await stat(path);
    return { exists: true, path, bytes: s.size, mtimeUtc: s.mtime.toISOString() };
  } catch {
    return { exists: false, path, bytes: null, mtimeUtc: null };
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

const daysSince = (iso?: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
};

async function notionDesktopRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,command="], {
      timeout: 1_500,
      maxBuffer: 1_000_000,
    });
    return stdout.split("\n").some((line) => line.includes("/Applications/Notion.app"));
  } catch {
    return false;
  }
}

async function cachedBlockCount(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/sqlite3", [
      NOTION_DB,
      "select count(*) from block where alive=1;",
    ], {
      timeout: 1_500,
      maxBuffer: 20_000,
    });
    const count = Number(stdout.trim());
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

async function lineCount(path: string): Promise<number> {
  try {
    const raw = await readFile(path, "utf8");
    return raw.split("\n").filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

async function localDesktopProof() {
  const [app, supportDir, db, running, blocks] = await Promise.all([
    fileProof(NOTION_APP),
    fileProof(NOTION_SUPPORT),
    fileProof(NOTION_DB),
    notionDesktopRunning(),
    cachedBlockCount(),
  ]);
  const ok = app.exists && supportDir.exists && db.exists;
  return {
    ok,
    appInstalled: app.exists,
    desktopRunning: running,
    dataDirExists: supportDir.exists,
    notionDbExists: db.exists,
    notionDbMtimeUtc: db.mtimeUtc,
    notionDbBytes: db.bytes,
    cachedAliveBlocks: blocks,
    proof: ok
      ? `Notion Desktop local · app=${app.exists} · running=${running} · notion.db=${db.mtimeUtc ?? "mtime?"} · cachedBlocks=${blocks ?? "?"}`
      : `Notion Desktop local incomplete · app=${app.exists} · dataDir=${supportDir.exists} · notion.db=${db.exists}`,
    sourceTag: "NOTION_DESKTOP_LOCAL_FIRST_20260601",
  };
}

async function syncProof() {
  const raw = await readJsonFile<Record<string, SyncEntry>>(SYNC_STATE);
  const queue = await fileProof(LOCAL_WRITE_QUEUE);
  if (!raw) {
    return {
      ok: false,
      status: "AMBER",
      statePath: SYNC_STATE,
      queuePath: LOCAL_WRITE_QUEUE,
      queuedLocalWrites: await lineCount(LOCAL_WRITE_QUEUE),
      expected: EXPECTED_SYNC_TARGETS,
      seenTargets: [],
      missing: EXPECTED_SYNC_TARGETS,
      healthyCount: 0,
      errorCount: 0,
      newestPushUtc: null,
      newestAgeDays: null,
      errors: [],
      proof: `sync state missing · ${SYNC_STATE}`,
      queue,
    };
  }

  const seenTargets = new Set<string>();
  const errors: Array<{
    src: string;
    errorCount: number;
    lastError: string | null;
    lastErrorUtc: string | null;
    lastPushedUtc: string | null;
    legacyIgnored: boolean;
  }> = [];
  const recoveredLastErrors: Array<{
    src: string;
    lastError: string | null;
    lastErrorUtc: string | null;
    lastPushedUtc: string | null;
  }> = [];
  let healthyCount = 0;
  let newestPushUtc: string | null = null;

  for (const [src, entry] of Object.entries(raw)) {
    const target = src.split(".", 1)[0];
    if (target) seenTargets.add(target);
    const errorCount = typeof entry.error_count === "number" ? entry.error_count : 0;
    const lastError = typeof entry.last_error === "string" ? entry.last_error.slice(0, 280) : null;
    const lastErrorUtc = typeof entry.last_error_ts === "string" ? entry.last_error_ts : null;
    const lastPushedUtc = typeof entry.last_pushed_ts === "string" ? entry.last_pushed_ts : null;
    if (lastPushedUtc && (!newestPushUtc || Date.parse(lastPushedUtc) > Date.parse(newestPushUtc))) {
      newestPushUtc = lastPushedUtc;
    }
    if (errorCount > 0) {
      errors.push({
        src,
        errorCount,
        lastError,
        lastErrorUtc,
        lastPushedUtc,
        legacyIgnored: LEGACY_IGNORED_SYNC_SOURCES.has(src),
      });
    } else if (lastError) {
      recoveredLastErrors.push({
        src,
        lastError,
        lastErrorUtc,
        lastPushedUtc,
      });
    } else {
      healthyCount += 1;
    }
  }

  const missing = EXPECTED_SYNC_TARGETS.filter((target) => !seenTargets.has(target));
  const newestAgeDays = daysSince(newestPushUtc);
  const legacyIgnoredErrorCount = errors.filter((entry) => entry.legacyIgnored).length;
  const ok = missing.length === 0 && errors.length === 0 && newestAgeDays !== null && newestAgeDays <= 1;
  return {
    ok,
    status: ok ? "LIVE_LOCAL" : "AMBER",
    statePath: SYNC_STATE,
    queuePath: LOCAL_WRITE_QUEUE,
    queuedLocalWrites: await lineCount(LOCAL_WRITE_QUEUE),
    expected: EXPECTED_SYNC_TARGETS,
    seenTargets: Array.from(seenTargets).sort(),
    missing,
    healthyCount,
    errorCount: errors.length,
    legacyIgnoredErrorCount,
    recoveredLastErrorCount: recoveredLastErrors.length,
    lastErrorPresentCount: errors.length + recoveredLastErrors.length,
    newestPushUtc,
    newestAgeDays,
    errors: errors.slice(0, 8),
    recoveredLastErrors: recoveredLastErrors.slice(0, 8),
    proof: ok
      ? `notion_sync_state green · newest=${newestPushUtc}`
      : `notion_sync_state amber · missing=${missing.length} · blockingErrors=${errors.length} · legacyIgnoredErrors=${legacyIgnoredErrorCount} · recoveredLastErrors=${recoveredLastErrors.length} · newest=${newestPushUtc ?? "none"}`,
    queue,
  };
}

function isLocalRequest(request: Request) {
  const host = request.headers.get("host") ?? "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
}

export async function GET(request: Request) {
  const probeApi = new URL(request.url).searchParams.get("probe") === "api";
  const [live, local, sync] = await Promise.all([
    probeApi
      ? notionLivePing()
      : Promise.resolve({
          ok: false,
          status: null,
          who: null,
          skipped: true,
          reason: "API probe skipped: local-first. Use ?probe=api only when API unlocks write/search capability.",
        }),
    localDesktopProof(),
    syncProof(),
  ]);
  try {
    const dbsRaw = await readFile(`${STATE}/notion_dbs.json`, "utf8");
    const dbs = JSON.parse(dbsRaw) as Record<string, unknown>;
    const databases = Object.entries(dbs)
      .filter(
        ([, v]) =>
          v !== null &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          typeof (v as Record<string, unknown>).title === "string",
      )
      .map(([key, v]) => {
        const o = v as Record<string, unknown>;
        return {
          key,
          title: o.title as string,
          id:
            typeof o.id === "string"
              ? o.id
              : typeof o.database_id === "string"
                ? (o.database_id as string)
                : null,
        };
      });
    let sections: string[] = [];
    try {
      const secRaw = await readFile(`${STATE}/notion_section_pages.json`, "utf8");
      const sec = JSON.parse(secRaw) as unknown;
      sections = sec && typeof sec === "object" && !Array.isArray(sec) ? Object.keys(sec) : [];
    } catch {
      // section pages optional
    }
    const syncErrors = Array.isArray(sync.errors) ? sync.errors : [];
    const archivedAncestorCount = syncErrors.filter((entry) =>
      String(entry.lastError ?? "").toLowerCase().includes("archived ancestor"),
    ).length;
    const schemaErrorCount = syncErrors.filter((entry) =>
      String(entry.lastError ?? "").toLowerCase().includes("property that exists"),
    ).length;
    const blocker = local.ok && sync.ok
      ? null
      : local.ok
        ? `Notion local OK, sync AMBER: blockingErrors=${sync.errorCount}, legacyIgnoredErrors=${sync.legacyIgnoredErrorCount}, recoveredLastErrors=${sync.recoveredLastErrorCount}, queuedLocalWrites=${sync.queuedLocalWrites}, newest=${sync.newestPushUtc ?? "none"}, archivedAncestor=${archivedAncestorCount}, schemaErrors=${schemaErrorCount}`
        : "Notion Desktop/cache local non prouvé";
    const nextAction = local.ok && sync.ok
      ? "keep local-first mirror and sync monitor running"
      : archivedAncestorCount > 0 || schemaErrorCount > 0
        ? "retarget/unarchive archived ancestors and fix decisions DB schema mapping, then rerun notion_sync_all.py once"
        : "rerun notion_sync_all.py once and inspect the newest sync error";
    return NextResponse.json(
      {
        ok: local.ok && sync.ok && databases.length > 0,
        status: local.ok && sync.ok ? "LIVE_LOCAL" : local.ok ? "AMBER_LOCAL" : "UNKNOWN",
        accessMode: "LOCAL_FIRST",
        live,
        local,
        sync,
        blocker,
        nextAction,
        writePath: {
          mode: "LOCAL_QUEUE_THEN_CANON_SYNC",
          queuePath: LOCAL_WRITE_QUEUE,
          consumer: "/Users/burakokyay/.openclaw/scripts/notion/notion_sync_all.py",
          directSqliteWrite: false,
          apiAllowedOnlyFor: "structured Notion DB/page mutations unavailable through Desktop local cache",
        },
        bootstrapAt: typeof dbs.bootstrap_at_utc === "string" ? dbs.bootstrap_at_utc : null,
        parent: typeof dbs.parent_control_tower === "string" ? dbs.parent_control_tower : null,
        databases,
        sections,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: local.ok ? "AMBER_LOCAL" : "UNKNOWN",
        accessMode: "LOCAL_FIRST",
        live,
        local,
        sync,
        reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        databases: [],
        sections: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ ok: false, reason: "LOCAL_ONLY" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reason: "INVALID_JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const markdown = typeof body.markdown === "string" ? body.markdown.trim() : "";
  if (!title || !markdown) {
    return NextResponse.json({ ok: false, reason: "title and markdown are required" }, { status: 400 });
  }
  if (title.length > 180 || markdown.length > 40_000) {
    return NextResponse.json({ ok: false, reason: "payload too large for local queue" }, { status: 413 });
  }

  const packet = {
    id: `notion-local-${randomUUID()}`,
    tsUtc: new Date().toISOString(),
    target: typeof body.target === "string" ? body.target.trim().slice(0, 120) : "obsidian_library",
    mode: typeof body.mode === "string" ? body.mode.trim().slice(0, 40) : "mirror_note",
    title,
    markdown,
    agentId: typeof body.agentId === "string" ? body.agentId.trim().slice(0, 80) : "unknown_agent",
    sourceTag: typeof body.sourceTag === "string" ? body.sourceTag.trim().slice(0, 140) : "NOTION_LOCAL_WRITE_QUEUE",
    status: "QUEUED_LOCAL_ONLY",
    apiUsed: false,
    proof: `queued in ${LOCAL_WRITE_QUEUE}; Notion Desktop sqlite is read-only; canonical writer is notion_sync_all.py`,
  };

  await appendFile(LOCAL_WRITE_QUEUE, `${JSON.stringify(packet)}\n`, "utf8");
  return NextResponse.json(
    {
      ok: true,
      status: "QUEUED_LOCAL_ONLY",
      packet: {
        id: packet.id,
        target: packet.target,
        mode: packet.mode,
        title: packet.title,
        sourceTag: packet.sourceTag,
      },
      path: LOCAL_WRITE_QUEUE,
      apiUsed: false,
      nextConsumer: "/Users/burakokyay/.openclaw/scripts/notion/notion_sync_all.py",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
