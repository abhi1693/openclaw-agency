import { readdir, readFile, stat } from "node:fs/promises";

const LOBSTER_BIN = "/Users/burakokyay/.local/bin/lobster";
const WORKFLOWS_DIR = "/Users/burakokyay/.openclaw/workspace/workflows/cof";
const TASK_RUNS_DIR = "/Users/burakokyay/.openclaw/state/lobsterai_openclaw/task_runs";
const WORKFLOW_RUNS_DIR = "/Users/burakokyay/.openclaw/state/lobsterai_openclaw/workflow_runs";
const AGENT_CONFIG = "/Users/burakokyay/.openclaw/state/lobsterai_openclaw/cof_lobster_agents_360_config.json";
const AGENT_STATUS = "/Users/burakokyay/.openclaw/state/lobsterai_openclaw/cof_lobster_agents_status.json";
const COMPANY_STATUS = "/Users/burakokyay/.openclaw/state/company_os/lobsterai_openclaw_status.json";
const PUBLIC_REPO = "https://github.com/openclaw/lobster";
const SOURCE_TAG = "OPENCLAW_LOBSTER_LOCAL_WORKFLOW_SHELL_20260601";

type LobsterState = {
  ok?: boolean;
  status?: string;
  generated_at_utc?: string;
  runtime?: { node?: { stdout?: string } };
  agent_count?: number;
  enabled_agent_count?: number;
  agents?: unknown[];
  capabilities?: unknown[];
};

export type LobsterComponentProof = {
  id: string;
  label: string;
  houseId: string;
  ok: boolean;
  status: "LIVE" | "AMBER" | "AMBER_REVERIFY" | "UNKNOWN";
  actionState: "inspection" | "traitement" | null;
  role: string;
  proof: string;
};

export type LobsterProof = {
  ok: boolean;
  status: "LIVE" | "AMBER" | "AMBER_REVERIFY" | "UNKNOWN";
  label: string;
  sourceTag: string;
  generatedAtUtc: string;
  repoUrl: string;
  binaryPath: string;
  proof: string;
  summary: {
    doctorOk: boolean;
    version: string | null;
    workflows: number;
    configuredAgents: number | null;
    enabledAgents: number | null;
    statusAgeSec: number | null;
    latestRunUtc: string | null;
  };
  components: LobsterComponentProof[];
};

const readJson = async <T,>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
};

const fileMtimeUtc = async (path: string): Promise<string | null> => {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch {
    return null;
  }
};

const secondsSince = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
};

const listFiles = async (dir: string): Promise<string[]> => {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
};

const latestMtime = async (dir: string): Promise<string | null> => {
  const files = await listFiles(dir);
  const mtimes = await Promise.all(files.map((file) => fileMtimeUtc(`${dir}/${file}`)));
  return mtimes.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
};

const numberFrom = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export async function readLobsterProof(): Promise<LobsterProof> {
  const now = new Date().toISOString();
  const [binStamp, workflows, agentConfig, agentStatus, companyStatus, taskRunUtc, workflowRunUtc] = await Promise.all([
    fileMtimeUtc(LOBSTER_BIN),
    listFiles(WORKFLOWS_DIR),
    readJson<LobsterState>(AGENT_CONFIG),
    readJson<LobsterState>(AGENT_STATUS),
    readJson<LobsterState>(COMPANY_STATUS),
    latestMtime(TASK_RUNS_DIR),
    latestMtime(WORKFLOW_RUNS_DIR),
  ]);

  const workflowCount = workflows.filter((file) => file.endsWith(".lobster")).length;
  const generatedAt = agentStatus?.generated_at_utc ?? agentConfig?.generated_at_utc ?? companyStatus?.generated_at_utc ?? null;
  const statusAgeSec = secondsSince(generatedAt);
  const statusFresh = statusAgeSec !== null && statusAgeSec <= 86_400;
  const latestRunUtc = [taskRunUtc, workflowRunUtc].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const configuredAgents = numberFrom(agentStatus?.agent_count) ?? numberFrom(agentConfig?.agent_count) ?? agentConfig?.agents?.length ?? null;
  const enabledAgents = numberFrom(agentStatus?.enabled_agent_count) ?? numberFrom(agentConfig?.enabled_agent_count) ?? null;
  const companyFresh = secondsSince(companyStatus?.generated_at_utc) !== null && (secondsSince(companyStatus?.generated_at_utc) ?? 99_999) <= 86_400;
  const shellOk = Boolean(binStamp) && companyStatus?.ok === true && String(companyStatus.status ?? "").toUpperCase() === "GREEN" && companyFresh;
  const workflowsOk = shellOk && workflowCount > 0;
  const agentsOk = shellOk && statusFresh && (enabledAgents ?? 0) > 0;
  const status: LobsterProof["status"] = shellOk ? "LIVE" : binStamp ? "AMBER" : "UNKNOWN";
  const version = companyStatus?.runtime?.node?.stdout ?? null;
  const proof = `lobsterai_openclaw_status ok · node=${version ?? "unknown"} · bin=${LOBSTER_BIN} · repo=${PUBLIC_REPO} · workflows=${workflowCount} · agents=${enabledAgents ?? "?"}/${configuredAgents ?? "?"} · agentStatus=${generatedAt ?? "missing"} · companyStatus=${companyStatus?.generated_at_utc ?? "missing"}`;

  return {
    ok: shellOk,
    status,
    label: "Lobster workflow shell",
    sourceTag: SOURCE_TAG,
    generatedAtUtc: now,
    repoUrl: PUBLIC_REPO,
    binaryPath: LOBSTER_BIN,
    proof,
    summary: {
      doctorOk: shellOk,
      version,
      workflows: workflowCount,
      configuredAgents,
      enabledAgents,
      statusAgeSec,
      latestRunUtc,
    },
    components: [
      {
        id: "lobster-shell",
        label: "Lobster shell",
        houseId: "openclaw_agent_barracks",
        ok: shellOk,
        status,
        actionState: shellOk ? "traitement" : null,
        role: "Workflow shell OpenClaw local-first; macros typées, approvals, resume, pas de surface OAuth propre.",
        proof,
      },
      {
        id: "lobster-cof-workflows",
        label: "Lobster COF workflows",
        houseId: "mission_control_tower",
        ok: workflowsOk,
        status: workflowsOk ? "LIVE" : "AMBER_REVERIFY",
        actionState: workflowsOk ? "traitement" : null,
        role: "Workflows COF locaux routés par Command Tower et Central Brain.",
        proof: `${workflowCount} workflow(s) .lobster dans ${WORKFLOWS_DIR} · latestRun=${latestRunUtc ?? "none"}`,
      },
      {
        id: "lobster-agent-config",
        label: "Lobster agents",
        houseId: "openclaw_agent_barracks",
        ok: agentsOk,
        status: agentsOk ? "LIVE" : "AMBER_REVERIFY",
        actionState: agentsOk ? "inspection" : null,
        role: "Configuration agents LobsterAI/OpenClaw rattachee aux agents terrain; stale si le snapshot n'est pas frais.",
        proof: `agents=${enabledAgents ?? "?"}/${configuredAgents ?? "?"} · generated=${generatedAt ?? "missing"} · ageSec=${statusAgeSec ?? "unknown"} · ${AGENT_CONFIG}`,
      },
    ],
  };
}
