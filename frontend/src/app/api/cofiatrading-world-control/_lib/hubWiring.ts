import { readFile } from "node:fs/promises";
import { buildSourceLedgerPayload } from "../source-ledger/route";

const CONTRACTS_PATH = "/Users/burakokyay/.openclaw/config/tool_operating_contracts.json";
const SOURCE_TAG = "COFIAT_HUB_WIRING_SPINE_V1_20260601";
const POLICY = "COMMAND_CENTRAL_PROOF_SPINE_NO_FAKE_RUNTIME";

type RawToolOperatingContract = {
  id?: string;
  machine_ids?: string[];
  label?: string;
  short?: string;
  house_id?: string;
  owner?: string;
  purpose?: string;
  used_when?: string;
  agent_rule?: string;
  required_input?: string;
  required_output?: string;
  proof_required?: string;
  work_gate?: string;
  cost_rule?: string;
};

type ContractsFile = {
  source_tag?: string;
  policy?: string;
  generated_at_utc?: string;
  contracts?: RawToolOperatingContract[];
};

type ToolOperatingContract = {
  id: string;
  machineIds: string[];
  label: string;
  short: string;
  houseId: string;
  owner: string;
  purpose: string;
  usedWhen: string;
  agentRule: string;
  requiredInput: string;
  requiredOutput: string;
  proofRequired: string;
  workGate: string;
  costRule: string;
};

type SourceLedgerHouseStats = {
  total?: number;
  connected?: number;
  proofed?: number;
  green?: number;
  amber?: number;
  red?: number;
  unknown?: number;
};

type SourceLedgerPayload = {
  ok?: boolean;
  sourceTag?: string;
  summary?: {
    totalItems?: number;
    connected?: number;
    proofed?: number;
    falseGreenDowngrades?: number;
    declaredCoverageTotal?: number;
    declaredCoverageConnected?: number;
    declaredCoverageProofed?: number;
  };
  byHouse?: Record<string, SourceLedgerHouseStats>;
};

type RuntimeWorkPayload = {
  ok?: boolean;
  sourceTag?: string;
  activeCount?: number;
  uniqueAgents?: number;
  houses?: number;
  active?: unknown[];
  work?: unknown[];
  rows?: unknown[];
};

type RuntimeWorkSession = {
  id: string | null;
  houseId: string;
  houseTitle: string;
  agentId: string;
  agentName: string;
  action: string;
  target: string;
  status: string;
  proof: string;
  startedAtUtc: string | null;
  activeUntilUtc: string | null;
};

type HubWiringEdgeStatus =
  | "CONNECTED_PROOFED"
  | "CONNECTED_WITH_GAPS"
  | "CONNECTED_WITH_RED"
  | "AMBER_REVERIFY"
  | "RUNTIME_ACTIVE_PROVED"
  | "IDLE_NO_RUNTIME";

type HubWiringRuntimeStatus = Extract<HubWiringEdgeStatus, "RUNTIME_ACTIVE_PROVED" | "IDLE_NO_RUNTIME">;
type HubWiringContractStatus = "ACTIVE_PROVED" | "ACTIVE_WITH_GAPS" | "CONNECTED_IDLE" | "CONNECTED_IDLE_WITH_GAPS";

export type HubWiringPayload = {
  ok: boolean;
  status: "READY" | "AMBER_REVERIFY";
  sourceTag: string;
  policy: string;
  generatedAtUtc: string;
  sourcePaths: {
    contracts: string;
    sourceLedgerApi: string;
    runtimeWorkApi: string;
  };
  sourceTags: {
    contracts: string;
    sourceLedger: string | null;
    runtimeWork: string | null;
  };
  summary: {
    contracts: number;
    houses: number;
    commandConnected: number;
    centralConnected: number;
    proofConnected: number;
    homeConnected: number;
    runtimeActiveContracts: number;
    runtimeActiveSessions: number;
    runtimeActiveAgents: number;
    runtimeActiveHouses: number;
    runtimeActiveCore: number;
    sleepingContracts: number;
    totalSpineEdges: number;
    connectedSpineEdges: number;
    sourceLedgerCoverage: string;
    sourceProofCoverage: string;
    falseGreenDowngrades: number;
  };
  core: Array<{
    id: string;
    label: string;
    role: string;
    status: HubWiringEdgeStatus;
    proof: string;
  }>;
  houses: Array<{
    id: string;
    label: string;
    status: HubWiringEdgeStatus;
    proof: string;
  }>;
  contracts: Array<{
    id: string;
    label: string;
    short: string;
    houseId: string;
    owner: string;
    status: HubWiringContractStatus;
    runtimeStatus: HubWiringRuntimeStatus;
    canAnimate: boolean;
    sleeping: boolean;
    proof: string;
    summary: string;
    contract: ToolOperatingContract;
    edges: Array<{
      from: string;
      to: string;
      status: HubWiringEdgeStatus;
      proof: string;
    }>;
  }>;
  runtimeWork: {
    activeCount: number;
    uniqueAgents: number;
    houses: number;
    activeSessions: RuntimeWorkSession[];
  };
  warnings: string[];
};

const CANON_HOUSES: Record<string, string> = {
  obsidian_library: "Knowledge Vault",
  lightrag_observatory: "Lighthouse Observatory",
  paperclip_factory: "Paperclip Factory",
  mt4_signal_tower: "Trading Tower",
  trading_academy: "Trading Academy",
  central_brain: "Central Brain",
  mission_control_tower: "Command Tower",
  openclaw_agent_barracks: "Agents Village",
  youtube_studio: "COF IA Publisher",
  assets_warehouse: "Publisher Suite",
  site_seo_lab: "Site & SEO Lab",
  iron_office: "Revenue & CRM",
  vip_gate: "VIP Gate",
  compliance_port: "Compliance Gate",
  calendar_tower: "Calendar Tower",
  notebook_alm: "NotebookLM",
  proof_ledger: "Proof Ledger",
};

const CORE = [
  { id: "mission_control_tower", label: "Command Tower", role: "Priorites, GitHub/OpenClaw, boards, ordres et routing GO." },
  { id: "central_brain", label: "Central Brain", role: "Memoire, orchestration, console IA, routage et controle transverse." },
  { id: "proof_ledger", label: "Proof Ledger", role: "Qualite mission, preuve, no-false-green et gates d'execution." },
] as const;

const str = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  const out = String(value).trim();
  return out.length ? out : undefined;
};

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const edgeStatusForStats = (stats?: SourceLedgerHouseStats): HubWiringEdgeStatus => {
  if (!stats || num(stats.total) <= 0) return "AMBER_REVERIFY";
  if (num(stats.red) > 0) return "CONNECTED_WITH_RED";
  if (
    num(stats.connected) < num(stats.total)
    || num(stats.proofed) < num(stats.total)
    || num(stats.amber) > 0
    || num(stats.unknown) > 0
  ) return "CONNECTED_WITH_GAPS";
  return "CONNECTED_PROOFED";
};

const isConnectedStatus = (status: HubWiringEdgeStatus) =>
  status === "CONNECTED_PROOFED" || status === "CONNECTED_WITH_GAPS" || status === "CONNECTED_WITH_RED";

const statsProof = (houseId: string, stats?: SourceLedgerHouseStats) => {
  if (!stats) return `${houseId}: source-ledger absent`;
  return `${houseId}: items=${num(stats.total)} connectes=${num(stats.connected)}/${num(stats.total)} preuves=${num(stats.proofed)}/${num(stats.total)} red=${num(stats.red)} amber=${num(stats.amber)} unknown=${num(stats.unknown)}`;
};

async function readContracts() {
  const file = JSON.parse(await readFile(CONTRACTS_PATH, "utf8")) as ContractsFile;
  const contracts = (Array.isArray(file.contracts) ? file.contracts : [])
    .filter((contract) => str(contract.id) && str(contract.label))
    .map((contract) => {
      const label = str(contract.label)!;
      return {
        id: str(contract.id)!,
        machineIds: Array.isArray(contract.machine_ids)
          ? contract.machine_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
          : [],
        label,
        short: str(contract.short) ?? label.slice(0, 3).toUpperCase(),
        houseId: str(contract.house_id) ?? "central_brain",
        owner: str(contract.owner) ?? "Central Brain",
        purpose: str(contract.purpose) ?? "Utilite a documenter.",
        usedWhen: str(contract.used_when) ?? "Quand une mission le demande.",
        agentRule: str(contract.agent_rule) ?? "Usage controle par Proof Ledger.",
        requiredInput: str(contract.required_input) ?? "Mission sourcee.",
        requiredOutput: str(contract.required_output) ?? "Artefact verifiable.",
        proofRequired: str(contract.proof_required) ?? "Preuve locale + Proof Ledger.",
        workGate: str(contract.work_gate) ?? "Ne compte pas comme travail sans execution prouvee.",
        costRule: str(contract.cost_rule) ?? "Cout a justifier par mission.",
      } satisfies ToolOperatingContract;
    });

  return {
    sourceTag: str(file.source_tag) ?? "COFIAT_TOOL_OPERATING_CONTRACTS",
    policy: str(file.policy) ?? "NO_FAKE_WORK_TOOL_CONTRACT",
    contracts,
  };
}

async function fetchJson<T>(origin: string | undefined, path: string): Promise<T | null> {
  if (!origin) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`${origin}${path}`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const runtimeRows = (runtimeWork: RuntimeWorkPayload | null): unknown[] => {
  if (!runtimeWork) return [];
  if (Array.isArray(runtimeWork.active)) return runtimeWork.active;
  if (Array.isArray(runtimeWork.work)) return runtimeWork.work;
  if (Array.isArray(runtimeWork.rows)) return runtimeWork.rows;
  return [];
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const runtimeSessions = (runtimeWork: RuntimeWorkPayload | null): RuntimeWorkSession[] => {
  const seen = new Set<string>();
  return runtimeRows(runtimeWork).flatMap((row) => {
    const raw = asRecord(row);
    const houseId = str(raw.houseId) ?? str(raw.house_id);
    const agentId = str(raw.agentId) ?? str(raw.agent_id);
    if (!houseId || !agentId) return [];
    const session = {
      id: str(raw.id) ?? null,
      houseId,
      houseTitle: str(raw.houseTitle) ?? str(raw.house_title) ?? CANON_HOUSES[houseId] ?? houseId,
      agentId,
      agentName: str(raw.agentName) ?? str(raw.agent_name) ?? agentId,
      action: str(raw.action) ?? "runtime local actif",
      target: str(raw.target) ?? "",
      status: str(raw.status) ?? "ACTIVE_RECENT",
      proof: str(raw.proof) ?? "runtime-work proof absent",
      startedAtUtc: str(raw.startedAtUtc) ?? str(raw.started_at_utc) ?? null,
      activeUntilUtc: str(raw.activeUntilUtc) ?? str(raw.active_until_utc) ?? null,
    } satisfies RuntimeWorkSession;
    const key = `${session.houseId}:${session.agentId}:${session.action}:${session.activeUntilUtc ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [session];
  });
};

const runtimeProofForHouse = (houseId: string, sessions: RuntimeWorkSession[]): string | null => {
  const houseSessions = sessions.filter((session) => session.houseId === houseId);
  if (!houseSessions.length) return null;
  const first = houseSessions[0];
  return `runtime-work actif=${houseSessions.length} · agent=${first.agentName} · action=${first.action} · target=${first.target || "local"} · until=${first.activeUntilUtc ?? "unknown"} · preuve=${first.proof}`;
};

const contractHasRuntime = (contract: ToolOperatingContract, runtimeWork: RuntimeWorkPayload | null): boolean => {
  if (!runtimeWork || num(runtimeWork.activeCount) <= 0) return false;
  const rows = runtimeRows(runtimeWork);
  if (!rows.length) return false;
  const tokens = [contract.id, contract.label, contract.short, ...contract.machineIds]
    .map((token) => token.toLowerCase())
    .filter(Boolean);
  return rows.some((row) => {
    const hay = JSON.stringify(row).toLowerCase();
    return tokens.some((token) => hay.includes(token));
  });
};

export async function buildHubWiringSnapshot({
  origin,
  sourceLedger,
  runtimeWork,
}: {
  origin?: string;
  sourceLedger?: SourceLedgerPayload | null;
  runtimeWork?: RuntimeWorkPayload | null;
} = {}): Promise<HubWiringPayload> {
  const [contractsFile, sourceLedgerPayload, runtimeWorkPayload] = await Promise.all([
    readContracts(),
    sourceLedger !== undefined
      ? Promise.resolve(sourceLedger)
      : origin
        ? fetchJson<SourceLedgerPayload>(origin, "/api/cofiatrading-world-control/source-ledger")
        : buildSourceLedgerPayload().catch(() => null) as Promise<SourceLedgerPayload | null>,
    runtimeWork !== undefined ? Promise.resolve(runtimeWork) : fetchJson<RuntimeWorkPayload>(origin, "/api/cofiatrading-world-control/runtime-work"),
  ]);

  const ledger = sourceLedgerPayload ?? null;
  const runtime = runtimeWorkPayload ?? null;
  const activeRuntimeSessions = runtimeSessions(runtime);
  const runtimeHouseIds = new Set(activeRuntimeSessions.map((session) => session.houseId));
  const runtimeAgentIds = new Set(activeRuntimeSessions.map((session) => session.agentId));
  const sourceByHouse = ledger?.byHouse ?? {};
  const sourceSummary = ledger?.summary ?? {};
  const allHouseIds = Array.from(new Set([
    ...Object.keys(CANON_HOUSES),
    ...Object.keys(sourceByHouse),
    ...contractsFile.contracts.map((contract) => contract.houseId),
  ])).filter(Boolean).sort((a, b) => (CANON_HOUSES[a] ?? a).localeCompare(CANON_HOUSES[b] ?? b));

  const core = CORE.map((entry) => {
    const stats = sourceByHouse[entry.id];
    const runtimeProof = runtimeProofForHouse(entry.id, activeRuntimeSessions);
    const baseStatus = edgeStatusForStats(stats);
    return {
      ...entry,
      status: runtimeProof ? "RUNTIME_ACTIVE_PROVED" as const : baseStatus,
      proof: runtimeProof ? `${statsProof(entry.id, stats)} · ${runtimeProof}` : statsProof(entry.id, stats),
    };
  });

  const houses = allHouseIds.map((id) => {
    const stats = sourceByHouse[id];
    const runtimeProof = runtimeProofForHouse(id, activeRuntimeSessions);
    const baseStatus = edgeStatusForStats(stats);
    return {
      id,
      label: CANON_HOUSES[id] ?? id,
      status: runtimeProof ? "RUNTIME_ACTIVE_PROVED" as const : baseStatus,
      proof: runtimeProof ? `${statsProof(id, stats)} · ${runtimeProof}` : statsProof(id, stats),
    };
  });

  const contracts = contractsFile.contracts.map((contract) => {
    const commandStatus = edgeStatusForStats(sourceByHouse.mission_control_tower);
    const centralStatus = edgeStatusForStats(sourceByHouse.central_brain);
    const proofStatus = edgeStatusForStats(sourceByHouse.proof_ledger);
    const homeStatus = edgeStatusForStats(sourceByHouse[contract.houseId]);
    const active = contractHasRuntime(contract, runtime);
    const runtimeStatus: HubWiringRuntimeStatus = active ? "RUNTIME_ACTIVE_PROVED" : "IDLE_NO_RUNTIME";
    const hasGaps = [commandStatus, centralStatus, proofStatus, homeStatus].some((status) => status !== "CONNECTED_PROOFED");
    const status: HubWiringContractStatus = active
      ? (hasGaps ? "ACTIVE_WITH_GAPS" : "ACTIVE_PROVED")
      : (hasGaps ? "CONNECTED_IDLE_WITH_GAPS" : "CONNECTED_IDLE");
    const summary = `command=${commandStatus} · central=${centralStatus} · proof=${proofStatus} · home=${homeStatus} · runtime=${runtimeStatus}`;
    const proof = `contract=${contract.id} · house=${contract.houseId} · sourceLedger=${num(sourceSummary.declaredCoverageConnected)}/${num(sourceSummary.declaredCoverageTotal)} · proofed=${num(sourceSummary.declaredCoverageProofed)}/${num(sourceSummary.declaredCoverageTotal)} · runtimeSessions=${activeRuntimeSessions.length} · runtimeAgents=${runtimeAgentIds.size} · contractRuntime=${active}`;

    return {
      id: contract.id,
      label: contract.label,
      short: contract.short,
      houseId: contract.houseId,
      owner: contract.owner,
      status,
      runtimeStatus,
      canAnimate: active,
      sleeping: !active,
      proof,
      summary,
      contract,
      edges: [
        { from: "mission_control_tower", to: contract.id, status: commandStatus, proof: statsProof("mission_control_tower", sourceByHouse.mission_control_tower) },
        { from: "central_brain", to: contract.id, status: centralStatus, proof: statsProof("central_brain", sourceByHouse.central_brain) },
        { from: "proof_ledger", to: contract.id, status: proofStatus, proof: statsProof("proof_ledger", sourceByHouse.proof_ledger) },
        { from: contract.houseId, to: contract.id, status: homeStatus, proof: statsProof(contract.houseId, sourceByHouse[contract.houseId]) },
        { from: "runtime_work", to: contract.id, status: runtimeStatus, proof: `runtime-work activeCount=${num(runtime?.activeCount)} sessions=${activeRuntimeSessions.length} uniqueAgents=${runtimeAgentIds.size} houses=${runtimeHouseIds.size} contractRuntime=${active}` },
      ],
    };
  });

  const countEdge = (from: string) => contracts.filter((contract) => contract.edges.some((edge) => edge.from === from && isConnectedStatus(edge.status))).length;
  const homeConnected = contracts.filter((contract) => contract.edges.some((edge) => edge.from === contract.houseId && isConnectedStatus(edge.status))).length;
  const runtimeActiveContracts = contracts.filter((contract) => contract.runtimeStatus === "RUNTIME_ACTIVE_PROVED").length;
  const runtimeActiveCore = CORE.filter((entry) => runtimeHouseIds.has(entry.id)).length;
  const connectedSpineEdges = contracts.reduce((total, contract) => total + contract.edges.filter((edge) => isConnectedStatus(edge.status) || edge.status === "RUNTIME_ACTIVE_PROVED").length, 0);
  const warnings = [
    ...(ledger?.ok ? [] : ["source-ledger indisponible: câblage construit depuis contrats seuls"]),
    ...(runtime?.ok ? [] : ["runtime-work indisponible ou vide: aucun outil ne passe actif prouvé"]),
    ...(activeRuntimeSessions.length === 0 ? ["runtime-work activeSessions=0: outils branchés mais agents au repos, pas d'animation de travail"] : []),
    ...(activeRuntimeSessions.length > 0 && runtimeActiveContracts === 0 ? ["runtime-work actif sur agent/maison, mais aucun contrat outil ne matche une preuve machine stricte"] : []),
  ];

  return {
    ok: true,
    status: ledger?.ok === false ? "AMBER_REVERIFY" : "READY",
    sourceTag: SOURCE_TAG,
    policy: POLICY,
    generatedAtUtc: new Date().toISOString(),
    sourcePaths: {
      contracts: CONTRACTS_PATH,
      sourceLedgerApi: "/api/cofiatrading-world-control/source-ledger",
      runtimeWorkApi: "/api/cofiatrading-world-control/runtime-work",
    },
    sourceTags: {
      contracts: contractsFile.sourceTag,
      sourceLedger: ledger?.sourceTag ?? null,
      runtimeWork: runtime?.sourceTag ?? null,
    },
    summary: {
      contracts: contracts.length,
      houses: allHouseIds.length,
      commandConnected: countEdge("mission_control_tower"),
      centralConnected: countEdge("central_brain"),
      proofConnected: countEdge("proof_ledger"),
      homeConnected,
      runtimeActiveContracts,
      runtimeActiveSessions: activeRuntimeSessions.length,
      runtimeActiveAgents: runtimeAgentIds.size,
      runtimeActiveHouses: runtimeHouseIds.size,
      runtimeActiveCore,
      sleepingContracts: contracts.length - runtimeActiveContracts,
      totalSpineEdges: contracts.length * 5,
      connectedSpineEdges,
      sourceLedgerCoverage: `${num(sourceSummary.declaredCoverageConnected)}/${num(sourceSummary.declaredCoverageTotal)}`,
      sourceProofCoverage: `${num(sourceSummary.declaredCoverageProofed)}/${num(sourceSummary.declaredCoverageTotal)}`,
      falseGreenDowngrades: num(sourceSummary.falseGreenDowngrades),
    },
    core,
    houses,
    contracts,
    runtimeWork: {
      activeCount: num(runtime?.activeCount),
      uniqueAgents: num(runtime?.uniqueAgents),
      houses: num(runtime?.houses),
      activeSessions: activeRuntimeSessions,
    },
    warnings,
  };
}
