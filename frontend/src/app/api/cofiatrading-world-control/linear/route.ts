import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CREDS_PATH =
  process.env.COF_CREDENTIALS_ENV ?? "/Users/burakokyay/cof-trading/config/credentials.env";
const STATE = process.env.COF_OPENCLAW_STATE ?? "/Users/burakokyay/.openclaw/state";
const CACHE_PATH = `${STATE}/linear_latest_issues_cache.json`;
const CACHE_TTL_MS = 15 * 60 * 1000;
const API_COOLDOWN_MS = 30 * 60 * 1000;

type LinearNode = {
  identifier?: string;
  title?: string;
  priority?: number;
  state?: { name?: string; type?: string };
  team?: { key?: string };
  url?: string;
  updatedAt?: string;
};
type LinearIssue = {
  id: string;
  title: string;
  priority: number | null;
  state: string;
  stateType: string;
  team: string;
  url: string | null;
  updatedAt: string | null;
};
type LinearPayload = {
  ok: boolean;
  total: number;
  issues: LinearIssue[];
  error?: string | null;
  reason?: string | null;
};
type LinearCache = {
  sourceTag: "LINEAR_LOCAL_CACHE_V1_20260601";
  cachedAtUtc: string | null;
  lastAttemptUtc: string | null;
  lastError: string | null;
  payload: LinearPayload | null;
};

async function getKey(): Promise<string | null> {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  try {
    const raw = await readFile(CREDS_PATH, "utf8");
    const m = raw.match(/^LINEAR_API_KEY=(.+)$/m);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : null;
  } catch {
    return null;
  }
}

async function readCache(): Promise<LinearCache | null> {
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf8")) as LinearCache;
  } catch {
    return null;
  }
}

async function writeCache(cache: LinearCache) {
  await writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

const ageMs = (iso?: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Date.now() - t : null;
};

function withCacheMeta(payload: LinearPayload, cache: LinearCache, status: string, apiUsed: boolean) {
  const age = ageMs(cache.cachedAtUtc);
  return {
    ...payload,
    status,
    accessMode: "LOCAL_CACHE_FIRST",
    apiUsed,
    cache: {
      path: CACHE_PATH,
      sourceTag: cache.sourceTag,
      cachedAtUtc: cache.cachedAtUtc,
      ageSec: age === null ? null : Math.floor(age / 1000),
      lastAttemptUtc: cache.lastAttemptUtc,
      lastError: cache.lastError,
    },
  };
}

async function fetchLinear(key: string, signal: AbortSignal): Promise<LinearPayload> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    cache: "no-store",
    signal,
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "{ issues(first: 20, orderBy: updatedAt) { nodes { identifier title priority state { name type } team { key } url updatedAt } } }",
    }),
  });
  const data = await res.json();
  const nodes: LinearNode[] = data?.data?.issues?.nodes ?? [];
  const issues = nodes.map((n) => ({
    id: n.identifier ?? "?",
    title: n.title ?? "",
    priority: typeof n.priority === "number" ? n.priority : null,
    state: n.state?.name ?? "?",
    stateType: n.state?.type ?? "?",
    team: n.team?.key ?? "?",
    url: n.url ?? null,
    updatedAt: n.updatedAt ?? null,
  }));
  return {
    ok: !data?.errors,
    total: issues.length,
    issues,
    error: data?.errors ? JSON.stringify(data.errors).slice(0, 220) : null,
  };
}

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const cache = await readCache();
  const cachedAge = ageMs(cache?.cachedAtUtc ?? null);
  const attemptAge = ageMs(cache?.lastAttemptUtc ?? null);
  if (!refresh && cache?.payload && cachedAge !== null && cachedAge <= CACHE_TTL_MS) {
    return NextResponse.json(
      withCacheMeta({ ...cache.payload, ok: cache.payload.ok && cache.payload.total > 0 }, cache, "LIVE_CACHE", false),
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!refresh && cache?.payload && attemptAge !== null && attemptAge <= API_COOLDOWN_MS) {
    return NextResponse.json(
      withCacheMeta({ ...cache.payload, ok: false }, cache, "AMBER_CACHE_COOLDOWN", false),
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!refresh && cache && !cache.payload && attemptAge !== null && attemptAge <= API_COOLDOWN_MS) {
    return NextResponse.json(
      {
        ok: false,
        total: 0,
        issues: [],
        status: "AMBER_CACHE_COOLDOWN",
        accessMode: "LOCAL_CACHE_FIRST",
        apiUsed: false,
        reason: cache.lastError ?? "LINEAR_API_COOLDOWN",
        cache: {
          path: CACHE_PATH,
          sourceTag: cache.sourceTag,
          cachedAtUtc: cache.cachedAtUtc,
          ageSec: null,
          lastAttemptUtc: cache.lastAttemptUtc,
          lastError: cache.lastError,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const key = await getKey();
  if (!key) {
    if (cache?.payload) {
      return NextResponse.json(
        withCacheMeta({ ...cache.payload, ok: false, reason: "LINEAR_API_KEY absent; serving stale local cache" }, cache, "AMBER_CACHE_NO_KEY", false),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, reason: "LINEAR_API_KEY absent", total: 0, issues: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const payload = await fetchLinear(key, controller.signal);
    const now = new Date().toISOString();
    if (payload.ok && payload.total > 0) {
      const freshCache: LinearCache = {
        sourceTag: "LINEAR_LOCAL_CACHE_V1_20260601",
        cachedAtUtc: now,
        lastAttemptUtc: now,
        lastError: null,
        payload,
      };
      await writeCache(freshCache);
      return NextResponse.json(
        withCacheMeta(payload, freshCache, "LIVE_API_REFRESHED", true),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const lastError = payload.error ?? "LINEAR_EMPTY_OR_ERROR";
    const degradedCache: LinearCache = {
      sourceTag: "LINEAR_LOCAL_CACHE_V1_20260601",
      cachedAtUtc: cache?.cachedAtUtc ?? null,
      lastAttemptUtc: now,
      lastError,
      payload: cache?.payload ?? null,
    };
    await writeCache(degradedCache);
    if (cache?.payload) {
      return NextResponse.json(
        withCacheMeta({ ...cache.payload, ok: false, error: lastError }, degradedCache, "AMBER_CACHE_API_ERROR", true),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        ...payload,
        status: "AMBER_API_ERROR",
        accessMode: "LOCAL_CACHE_FIRST",
        apiUsed: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const now = new Date().toISOString();
    const lastError = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const degradedCache: LinearCache = {
      sourceTag: "LINEAR_LOCAL_CACHE_V1_20260601",
      cachedAtUtc: cache?.cachedAtUtc ?? null,
      lastAttemptUtc: now,
      lastError,
      payload: cache?.payload ?? null,
    };
    if (cache?.payload) {
      await writeCache(degradedCache);
      return NextResponse.json(
        withCacheMeta({ ...cache.payload, ok: false, reason: lastError }, degradedCache, "AMBER_CACHE_FETCH_ERROR", true),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "UNKNOWN_ERROR", total: 0, issues: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
