import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type N8nWorkflow = {
  name?: string;
  id?: string;
  active?: boolean;
  local_file?: string;
};
type N8nManifest = {
  created_at_utc?: string;
  updated_at_utc?: string;
  hub_base_url?: string;
  status?: string;
  validation?: {
    public_ingress_smoke?: string;
    paperclip_dispatch_job_id?: string;
    paperclip_dispatch_artifact?: string;
    error_workflow_id?: string;
  };
  created?: N8nWorkflow[];
};
type N8nTruth = {
  generated_at_utc?: string;
  source_tag?: string;
  ok?: boolean;
  status?: string;
  n8n_base_url?: string;
  n8n_api_probe?: {
    ok?: boolean;
    status?: number | null;
    latency_ms?: number | null;
    workflow_count_returned?: number;
    matched_manifest_workflows?: number;
  };
  hub_health_authenticated?: {
    ok?: boolean;
    status?: number | null;
    latency_ms?: number | null;
  };
  active_workflows?: number;
  total_workflows?: number;
  live_manifest_workflows?: Array<{ id?: string; name?: string; active?: boolean }>;
  missing_local_files?: string[];
  missing_artifacts?: string[];
  checked_without_secret_exposure?: boolean;
  secret_values_exposed?: boolean;
};

const MANIFEST_PATH = "/Users/burakokyay/cof-trading/config/n8n/clean-workflows-20260428/manifest.json";
const README_PATH = "/Users/burakokyay/cof-trading/config/n8n/README.md";
const TRUTH_PATH = "/Users/burakokyay/.openclaw/state/company_os/n8n_truth_refresh.json";

const daysSince = (iso?: string | null) => {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / 86_400_000);
};

const readManifest = async () => {
  try {
    const [raw, manifestStat, readmeStat] = await Promise.all([
      readFile(MANIFEST_PATH, "utf8"),
      stat(MANIFEST_PATH),
      stat(README_PATH).catch(() => null),
    ]);
    const parsed = JSON.parse(raw) as N8nManifest;
    return { manifest: parsed, manifestMtimeUtc: manifestStat.mtime.toISOString(), readmeMtimeUtc: readmeStat?.mtime.toISOString() ?? null };
  } catch (error) {
    return { manifest: null, manifestMtimeUtc: null, readmeMtimeUtc: null, error: error instanceof Error ? error.message : "manifest unreadable" };
  }
};

const readTruth = async () => {
  try {
    const [raw, truthStat] = await Promise.all([
      readFile(TRUTH_PATH, "utf8"),
      stat(TRUTH_PATH),
    ]);
    return { truth: JSON.parse(raw) as N8nTruth, truthMtimeUtc: truthStat.mtime.toISOString() };
  } catch (error) {
    return { truth: null, truthMtimeUtc: null, truthError: error instanceof Error ? error.message : "truth proof unreadable" };
  }
};

const probeHubHealth = async (hubBaseUrl?: string | null) => {
  if (!hubBaseUrl) return { attempted: false, ok: false, status: null, body: "hub_base_url missing" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_500);
  try {
    const response = await fetch(`${hubBaseUrl.replace(/\/$/, "")}/api/automation/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const body = (await response.text()).slice(0, 120);
    return { attempted: true, ok: response.ok, status: response.status, body };
  } catch (error) {
    return { attempted: true, ok: false, status: null, body: error instanceof Error ? error.message : "probe failed" };
  } finally {
    clearTimeout(timer);
  }
};

export async function GET() {
  const now = new Date().toISOString();
  const [{ manifest, manifestMtimeUtc, readmeMtimeUtc, error }, { truth, truthMtimeUtc, truthError }] = await Promise.all([
    readManifest(),
    readTruth(),
  ]);
  const publicHubHealth = await probeHubHealth(manifest?.hub_base_url ?? null);
  const workflows = Array.isArray(manifest?.created) ? manifest.created : [];
  const active = workflows.filter((workflow) => workflow.active === true);
  const updatedAtUtc = manifest?.updated_at_utc ?? manifestMtimeUtc;
  const ageDays = daysSince(updatedAtUtc);
  const truthAgeDays = daysSince(truth?.generated_at_utc ?? truthMtimeUtc);
  const validation = manifest?.validation ?? {};
  const localManifestOk = manifest?.status === "active"
    && active.length > 0
    && validation.public_ingress_smoke === "pass"
    && typeof validation.paperclip_dispatch_job_id === "string";
  const fresh = ageDays !== null && ageDays <= 14;
  const liveApiProofOk = truth?.ok === true
    && truth.secret_values_exposed !== true
    && truth.n8n_api_probe?.ok === true
    && truth.hub_health_authenticated?.ok === true
    && (truth.active_workflows ?? 0) >= active.length
    && (truth.missing_local_files?.length ?? 0) === 0
    && (truth.missing_artifacts?.length ?? 0) === 0
    && truthAgeDays !== null
    && truthAgeDays <= 1;
  const ok = localManifestOk && (fresh || liveApiProofOk);
  const status = ok ? "LIVE" : localManifestOk ? "AMBER_REVERIFY" : "AMBER";
  const blocker = ok
    ? null
    : localManifestOk
      ? `local manifest active, but proof is stale (${ageDays ?? "?"}d), live API proof is ${truth?.status ?? truthError ?? "missing"}, and public hub health is ${publicHubHealth.status ?? publicHubHealth.body}`
      : `manifest not green: active=${active.length}/${workflows.length}, ingress=${validation.public_ingress_smoke ?? "missing"}, paperclip=${validation.paperclip_dispatch_job_id ?? "missing"}`;
  const nextAction = ok
    ? "keep monitoring /api/automation/health and workflow manifest freshness"
    : "refresh n8n workflow manifest, run an authenticated hub health probe, then re-export proof without exposing secrets";

  return NextResponse.json(
    {
      ok,
      localManifestOk,
      status,
      sourceTag: "N8N_LOCAL_MANIFEST_WORLD_CONTROL_20260601",
      generatedAtUtc: now,
      updatedAtUtc,
      ageDays,
      hubBaseUrl: manifest?.hub_base_url ?? null,
      activeWorkflows: active.length,
      totalWorkflows: workflows.length,
      blocker,
      nextAction,
      workflows: (liveApiProofOk && Array.isArray(truth?.live_manifest_workflows) ? truth.live_manifest_workflows : active).map((workflow) => ({
        id: workflow.id ?? null,
        name: workflow.name ?? "unnamed",
        active: workflow.active !== false,
        localFile: "local_file" in workflow ? workflow.local_file ?? null : active.find((item) => item.id === workflow.id || item.name === workflow.name)?.local_file ?? null,
      })),
      validation: {
        publicIngressSmoke: validation.public_ingress_smoke ?? null,
        paperclipDispatchJobId: validation.paperclip_dispatch_job_id ?? null,
        paperclipDispatchArtifact: validation.paperclip_dispatch_artifact ?? null,
        errorWorkflowId: validation.error_workflow_id ?? null,
      },
      hubHealth: liveApiProofOk ? truth?.hub_health_authenticated : publicHubHealth,
      publicHubHealth,
      apiProbe: truth?.n8n_api_probe ?? "missing_live_api_proof",
      liveApiProof: truth
        ? {
            ok: truth.ok === true,
            status: truth.status ?? null,
            generatedAtUtc: truth.generated_at_utc ?? truthMtimeUtc,
            ageDays: truthAgeDays,
            sourceTag: truth.source_tag ?? null,
            checkedWithoutSecretExposure: truth.checked_without_secret_exposure === true,
            secretValuesExposed: truth.secret_values_exposed === true,
            proofPath: TRUTH_PATH,
          }
        : { ok: false, status: "missing", generatedAtUtc: null, ageDays: null, sourceTag: null, checkedWithoutSecretExposure: false, secretValuesExposed: false, proofPath: TRUTH_PATH, error: truthError ?? null },
      proof: manifest
        ? `${MANIFEST_PATH} · active=${active.length}/${workflows.length} · ingress=${validation.public_ingress_smoke ?? "unknown"} · paperclip=${validation.paperclip_dispatch_job_id ?? "missing"} · updated=${updatedAtUtc ?? "missing"} · age=${ageDays ?? "?"}d · liveApi=${truth?.n8n_api_probe?.status ?? "missing"} · hubAuth=${truth?.hub_health_authenticated?.status ?? "missing"} · proof=${TRUTH_PATH}`
        : `${MANIFEST_PATH} unreadable: ${error ?? "missing"}`,
      paths: {
        manifest: MANIFEST_PATH,
        readme: README_PATH,
        readmeMtimeUtc,
        liveProof: TRUTH_PATH,
        liveProofMtimeUtc: truthMtimeUtc,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
