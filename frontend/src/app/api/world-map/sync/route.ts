import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SOURCE_TAG = "CODEX_WORLD_MAP_SYNC_COMPAT_ROUTE_20260604";
const STATE_PATH = "/Users/burakokyay/.openclaw/state/world_map/world_map_sync_latest.json";
const REGISTRY_URL = "http://127.0.0.1:8767/api/central-brain/registry";
const CRM_HEALTH_URL = "http://127.0.0.1:4242/healthz";
const RESEARCH_META_URL = "http://127.0.0.1:8799/api/meta";

type RegistryItem = {
  status?: string;
  kpis?: Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const registryMap = (value: unknown): Record<string, RegistryItem> => {
  const source = asRecord(value);
  const out: Record<string, RegistryItem> = {};
  for (const [key, raw] of Object.entries(source)) {
    const item = asRecord(raw);
    out[key] = {
      status: typeof item.status === "string" ? item.status : undefined,
      kpis: asRecord(item.kpis),
    };
  }
  return out;
};

const readExistingState = async () => {
  try {
    return asRecord(JSON.parse(await readFile(STATE_PATH, "utf8")));
  } catch {
    return {};
  }
};

const writeState = async (payload: unknown) => {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const fetchText = async (url: string) => {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
};

const fetchJson = async (url: string) => {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
};

export async function GET() {
  return POST(new Request("http://localhost/api/world-map/sync", { method: "POST" }));
}

export async function POST(request: Request) {
  const now = new Date().toISOString();
  const body = await request.json().catch(() => null);
  const requestSource = asRecord(body);

  const [registry, crm, research] = await Promise.allSettled([
    fetchJson(REGISTRY_URL),
    fetchText(CRM_HEALTH_URL),
    fetchJson(RESEARCH_META_URL),
  ]);

  const registryData = registry.status === "fulfilled" ? asRecord(registry.value.data) : {};
  const agents = registryMap(registryData.agents);
  const houses = registryMap(registryData.houses);
  const vipGateKpis = asRecord(houses.vip_gate?.kpis);
  const vipGateCrmSync = asRecord(vipGateKpis.crm_stripe_sync);

  const crmHttpOk = crm.status === "fulfilled" && crm.value.ok && crm.value.text.trim() === "ok";
  const researchHttpOk = research.status === "fulfilled" && research.value.ok && asRecord(research.value.data).ok !== false;
  const crmRegistryLive = agents.crm_stripe_sync_4242?.status === "LIVE" || houses.vip_gate?.status === "LIVE";
  const researchRegistryLive = agents.research_api_8799?.status === "LIVE";

  const instances = [
    {
      id: "crm_stripe_sync_4242",
      status: crmHttpOk && crmRegistryLive ? "LIVE" : "REPOS",
      port: 4242,
      pid: agents.crm_stripe_sync_4242?.kpis?.pid ?? vipGateCrmSync.pid ?? null,
      health_http: crm.status === "fulfilled" ? crm.value.status : 0,
      registry_status: agents.crm_stripe_sync_4242?.status ?? houses.vip_gate?.status ?? "UNKNOWN",
    },
    {
      id: "research_api_8799",
      status: researchHttpOk && researchRegistryLive ? "LIVE" : "REPOS",
      port: 8799,
      pid: agents.research_api_8799?.kpis?.pid ?? null,
      health_http: research.status === "fulfilled" ? research.value.status : 0,
      registry_status: agents.research_api_8799?.status ?? "UNKNOWN",
    },
  ];

  const liveInstances = instances.filter((item) => item.status === "LIVE").length;
  const existingState = await readExistingState();
  const existingDisplay = asRecord(existingState.world_map_display);
  const githubSync = asRecord(existingState.github_sync);
  const supabaseCloudSync = asRecord(existingState.supabase_cloud_sync);
  const lastGithubSyncAt =
    typeof existingState.last_github_sync_at_utc === "string"
      ? existingState.last_github_sync_at_utc
      : typeof githubSync.checked_at_utc === "string"
        ? githubSync.checked_at_utc
        : null;

  const payload = {
    ok: liveInstances === instances.length,
    status: liveInstances === instances.length ? "LIVE" : "PARTIAL",
    source_tag: SOURCE_TAG,
    synced_at_utc: now,
    state_path: STATE_PATH,
    request_source: body,
    registry_url: REGISTRY_URL,
    hub_endpoint: "/api/world-map/sync",
    world_map_display: {
      transition: "COMPAT_ROUTE_RESTORED",
      active_instances: liveInstances,
      total_instances: instances.length,
      stale_queue_cleared: liveInstances === instances.length,
      github_sync_status: typeof githubSync.sync_status === "string" ? githubSync.sync_status : "UNKNOWN",
      supabase_cloud_schema_status:
        typeof existingDisplay.supabase_cloud_schema_status === "string"
          ? existingDisplay.supabase_cloud_schema_status
          : "UNKNOWN",
      clients_table_status:
        typeof existingDisplay.clients_table_status === "string" ? existingDisplay.clients_table_status : "UNKNOWN",
      whatsapp_tunnels_status:
        typeof existingDisplay.whatsapp_tunnels_status === "string"
          ? existingDisplay.whatsapp_tunnels_status
          : "UNKNOWN",
      last_request_service: typeof requestSource.service === "string" ? requestSource.service : null,
    },
    instances,
    ...(Object.keys(supabaseCloudSync).length ? { supabase_cloud_sync: supabaseCloudSync } : {}),
    ...(Object.keys(githubSync).length ? { github_sync: githubSync, last_github_sync_at_utc: lastGithubSyncAt } : {}),
  };

  await writeState(payload);
  return NextResponse.json(payload, { status: 200 });
}
