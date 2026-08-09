// Types extraits de WorldControl.tsx (refactor 2026-05-29) — pure types, zéro runtime.
// MovingAgent / MovingTruck restent dans WorldControl.tsx (collision avec composants homonymes).

import type { ConsoleIAInitialInbox } from "./ConsoleIAOverlay";

export type AssetsWarehouseSnapshot = {
  ok?: boolean;
  sourceTag?: string;
  mp4Count?: number | null;
  captionsCount?: number | null;
  assetsInventoryCount?: number | null;
  paths?: {
    remotionOutDir?: string;
    captionsDir?: string;
    assetsInventoryPath?: string;
  };
  errors?: string[];
};

export type PublisherNativeProgressBucket = {
  current?: number | string | null;
  total?: number | string | null;
  done?: number | string | null;
  completed?: number | string | null;
  rendered?: number | string | null;
  renders?: number | string | null;
  frames?: number | string | null;
  keyframes?: number | string | null;
  counts?: PublisherNativeProgressBucket | null;
  batch?: PublisherNativeProgressBucket | null;
  sourceTag?: string | null;
  source_tag?: string | null;
};

export type PublisherNativeWorkorder = {
  id?: string | null;
  label?: string | null;
  name?: string | null;
  title?: string | null;
  status?: string | null;
  state?: string | null;
  phase?: string | null;
  current?: number | string | null;
  total?: number | string | null;
  done?: number | string | null;
  completed?: number | string | null;
  rendered?: number | string | null;
  renders?: number | string | null;
  frames?: number | string | null;
  keyframes?: PublisherNativeProgressBucket | number | string | null;
  counts?: PublisherNativeProgressBucket | null;
  batch?: PublisherNativeProgressBucket | null;
  sourceTag?: string | null;
  source_tag?: string | null;
};

export type PublisherNativeSnapshot = {
  ok?: boolean;
  sourceTag?: string | null;
  mode?: string | null;
  state?: string | null;
  global_alert?: boolean | null;
  globalAlert?: boolean | null;
  outputDir?: string | null;
  counts?: {
    renders?: number | null;
    archived?: number | null;
    orphan?: number | null;
    nonArchived?: number | null;
    goldProved?: number | null;
    unproven?: number | null;
  };
  batch?: PublisherNativeProgressBucket | null;
  workorders?: PublisherNativeWorkorder[] | Record<string, PublisherNativeWorkorder | null> | null;
  qualityTruth?: { falseGreenPatched?: boolean | null; goldenCandidateScore?: number | null; goldenCandidateStatus?: string | null };
  publishLock?: { allowed?: boolean | null; reason?: string | null };
  tiers?: {
    ok?: boolean;
    sourceTag?: string | null;
    localFirst?: boolean | null;
    secretValuesRead?: boolean | null;
    plans?: Record<string, unknown>;
  };
};

export type PublisherBridgeSnapshot = {
  ok?: boolean;
  status?: string;
  sourceTag?: string | null;
  endpoint?: string | null;
  clientScriptUrl?: string | null;
  exportedAssetCount?: number | null;
  fullAssetCount?: number | null;
  rawFileCandidates?: number | null;
  sha256IndexCount?: number | null;
  physicalDuplicateCount?: number | null;
  rootCount?: number | null;
  accessErrorCount?: number | null;
  bridgeContract?: string | null;
  sampleAssets?: Array<Record<string, unknown>>;
};

export type VideoAvailabilitySnapshot = {
  ok?: boolean;
  status?: string;
  sourceTag?: string | null;
  outputDir?: string | null;
  scannedCount?: number | null;
  motionProofCount?: number | null;
  latest?: Record<string, unknown> | null;
  latestMotionProof?: Record<string, unknown> | null;
  items?: Array<Record<string, unknown>>;
};

export type PublisherCanonSnapshot = {
  ok?: boolean;
  status?: string;
  sourceTag?: string | null;
  canonical?: { path?: string | null; url?: string | null; exists?: boolean | null };
  counts?: {
    assetsTotal?: number | null;
    assetsWiredOrAvailable?: number | null;
    assetsToWire?: number | null;
    duplicatePublisherHtml?: number | null;
    activeRenders?: number | null;
    brollTotal?: number | null;
    pexelsBroll?: number | null;
    pixabayBroll?: number | null;
    unsplashBroll?: number | null;
    producedProven?: number | null;
    producedProvenConditional?: number | null;
    goldenProven?: number | null;
    failedGate?: number | null;
    unprovenPartial?: number | null;
    provenTotalPublishableLocked?: number | null;
  };
  surfaces?: Array<{ id: string; label: string; status: string; url?: string | null; path?: string | null }>;
  stations?: Array<{ id: string; label: string; owner: string; status: string; endpoint?: string | null }>;
  assets?: Array<{ id: string; label: string; state: string; role: string; count?: number | null; path?: string | null }>;
  blockers?: Array<{ id: string; status: string; impact: string; patch: string }>;
  officialDocs?: Array<{ id: string; label: string; url: string }>;
};

export type WorkerPoolSnapshot = {
  ok?: boolean;
  status?: string;
  sourceTag?: string | null;
  snapshotId?: string | null;
  sourcePath?: string;
  fileMtimeUtc?: string | null;
  fileAgeSec?: number | null;
  freshnessStatus?: string;
  summary?: {
    workers?: number | null;
    active?: number | null;
    running?: number | null;
    runningRealPool?: number | null;
    completed?: number | null;
    failed?: number | null;
    queuedTasks?: number | null;
    queuedTasksTotal?: number | null;
    queuedTasksDeferred?: number | null;
    queuedTasksResolvedByHandoff?: number | null;
    withProof?: number | null;
    blockedSessionLimit?: number | null;
    sessionLimitParkedDuplicate?: number | null;
    staleProcessReaped?: number | null;
    runningProcessUnverified?: number | null;
    distinctActiveLanes?: number | null;
    duplicateRunning?: number | null;
    laneSkew?: boolean | null;
  } | null;
  laneDistribution?: Record<string, unknown>;
  activeLaneDistribution?: Record<string, unknown>;
  controlLoop?: {
    snapshotId?: string | null;
    status?: string | null;
    verdict?: string | null;
    decisionAllowed?: boolean | null;
    handoffCounts?: Record<string, unknown>;
  } | null;
};

export type HouseMissionAgent = {
  id: string;
  name: string;
  orgRole?: string;
  rankLayer?: string;
  rankLayerWeight?: number;
  roleBadge?: string;
  status?: string;
  responsibilities?: string[];
};

export type HouseMissionRecord = {
  houseId: string;
  houseTitle: string;
  status: string;
  sourceTag?: string;
  mission: {
    id: string;
    title: string;
    status: string;
    nextAction: string;
    impact?: string;
    blocker?: string;
    proof: string;
    proofStatus?: string;
    sourceTag?: string;
    route?: string | null;
  };
  chief?: HouseMissionAgent | null;
  chiefs?: HouseMissionAgent[];
  workers?: HouseMissionAgent[];
  agents?: HouseMissionAgent[];
  counts?: { agents?: number; chiefs?: number; workers?: number; activeTasks?: number; trucks?: number };
  localQueue?: { path?: string; dispatchLog?: string; status?: string; dispatches?: number; executedAtUtc?: string | null };
  assetSummary?: { total?: number; sleeping?: number; green?: number; amber?: number; red?: number; topSleeping?: string[] };
  toolSummary?: { total?: number; live?: number; amber?: number; unknown?: number; labels?: string[] };
  dispatches?: Array<{ agentId: string; agentName: string; role: string; action: string; target: string; status: string; proof?: string }>;
  revenueMissions?: Array<{ id: string; houseId: string; title: string; proof: string; status: string; target: string; agents: string[] }>;
  proofs?: Array<{ label: string; source: string; status: string }>;
};

export type HouseOrchestratorPayload = {
  ok?: boolean;
  sourceTag?: string;
  generatedAtUtc?: string;
  executedAtUtc?: string | null;
  summary?: {
    houses?: number;
    queuedDispatches?: number;
    expiredQueuedDispatches?: number;
    localQueueTtlMinutes?: number;
    coveredAgents?: number;
    totalAgents?: number;
    assetsAssigned?: number;
    housesWithLocalQueue?: number;
    runtimeActiveDispatches?: number;
    paperclipLivingOrgActive?: number;
    paperclipLivingOrgCheckedAt?: string | null;
    paperclipLivingOrgProof?: string;
  };
  houseMissions?: HouseMissionRecord[];
};

export type ConsoleIaSnapshot = {
  ok?: boolean;
  status?: string;
  sourceTag?: string;
  mode?: string;
  proof?: string;
  paths?: { packetsDir?: string; responsesDir?: string; packetsJsonl?: string };
};

export type OpenClawRepoSnapshot = {
  ok?: boolean;
  status?: string;
  sourceTag?: string;
  proof?: string;
  repoRoot?: string;
  branch?: string | null;
  commit?: string | null;
  remoteUrl?: string | null;
};

export type ToolOperatingContract = {
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

export type ToolOperatingContractsPayload = {
  ok?: boolean;
  sourceTag?: string;
  policy?: string;
  summary?: { contracts?: number; machineAliases?: number; houses?: number };
  sourcePath?: string;
  contracts?: ToolOperatingContract[];
};

export type HubWiringPayload = {
  ok?: boolean;
  status?: string;
  sourceTag?: string;
  policy?: string;
  generatedAtUtc?: string;
  sourceTags?: { contracts?: string | null; sourceLedger?: string | null; runtimeWork?: string | null };
  summary?: {
    contracts?: number;
    houses?: number;
    commandConnected?: number;
    centralConnected?: number;
    proofConnected?: number;
    homeConnected?: number;
    runtimeActiveContracts?: number;
    runtimeActiveSessions?: number;
    runtimeActiveAgents?: number;
    runtimeActiveHouses?: number;
    runtimeActiveCore?: number;
    sleepingContracts?: number;
    totalSpineEdges?: number;
    connectedSpineEdges?: number;
    sourceLedgerCoverage?: string;
    sourceProofCoverage?: string;
    falseGreenDowngrades?: number;
  };
  core?: Array<{ id: string; label: string; role: string; status: string; proof: string }>;
  houses?: Array<{ id: string; label: string; status: string; proof: string }>;
  contracts?: Array<{
    id: string;
    label: string;
    short: string;
    houseId: string;
    owner: string;
    status: string;
    runtimeStatus: string;
    canAnimate: boolean;
    sleeping: boolean;
    proof: string;
    summary: string;
    contract?: ToolOperatingContract;
    edges?: Array<{ from: string; to: string; status: string; proof: string }>;
  }>;
  runtimeWork?: {
    activeCount?: number;
    uniqueAgents?: number;
    houses?: number;
    activeSessions?: Array<{
      id?: string | null;
      houseId?: string;
      houseTitle?: string;
      agentId?: string;
      agentName?: string;
      action?: string;
      target?: string;
      status?: string;
      proof?: string;
      startedAtUtc?: string | null;
      activeUntilUtc?: string | null;
    }>;
  };
  warnings?: string[];
};

export type HubLedgerHouseStats = {
  total: number;
  connected: number;
  proofed: number;
  green: number;
  amber: number;
  red: number;
  unknown: number;
  kinds: Record<string, number>;
};

export type HubLedgerItem = {
  id: string;
  name: string;
  kind: string;
  category: string;
  houseId: string;
  ownerAgentId?: string;
  status: string;
  ok: boolean;
  connected: boolean;
  proofed: boolean;
  proof: string;
  sourceTag: string;
  sourcePath: string;
  blocker?: string;
  nextAction?: string;
};

export type HubSourceLedgerPayload = {
  ok?: boolean;
  sourceTag?: string;
  policy?: string;
  summary?: {
    totalItems?: number;
    connected?: number;
    proofed?: number;
    green?: number;
    amber?: number;
    red?: number;
    unknown?: number;
    falseGreenDowngrades?: number;
    declaredCoverageTotal?: number;
    declaredCoverageConnected?: number;
    declaredCoverageProofed?: number;
    assetVaultRemainderCoveredByRoots?: number;
  };
  declared?: {
    truthSources?: number;
    patrimoineEntries?: number;
    canonAssets?: number;
    runtimeSections?: number;
    assetVaultRoots?: number;
    assetVaultAssetsReturned?: number;
    assetVaultAssetsDeclared?: number;
    assetVaultRawFiles?: number | null;
  };
  byHouse?: Record<string, HubLedgerHouseStats>;
  byKind?: Record<string, { label?: string; total?: number; connected?: number; proofed?: number; green?: number; amber?: number; red?: number; unknown?: number }>;
  warnings?: string[];
  items?: HubLedgerItem[];
};

export type Snapshot = {
  ok: boolean;
  fetchedAt: string;
  sourceTag: string;
  endpoints: Record<string, { ok: boolean; status: number | null }>;
  revenue: {
    sourceTag: string | null;
    currentMrrEur: number | null;
    currentArrEur: number | null;
    activeVip: number | null;
    pastDueCount: number | null;
    pastDueEur: number | null;
    ftdCumul: number | null;
    brokersLifetimeUsd: number | null;
    clientsActive: number | null;
    revenue_drift_detected?: boolean;
  };
  agents?: {
    total: number;
    fresh: number;
    stale: number;
    fresh_names: string[];
    stale_names_top: string[];
    freshness_ratio: number;
  };
  openclawRuntime?: {
    sourceTag: string;
    status: "LIVE" | "AMBER" | "QUARANTINE" | string;
    sourcePaths: Record<string, string>;
    counts: {
      total: number;
      fresh: number;
      stale: number;
      noHeartbeat: number;
      disabled: number;
      tickEnabled: number;
      tickExpected: number;
      servicesOk: number;
      servicesTotal: number;
      lobsterConfigured: number | null;
      lobsterEnabled: number | null;
    };
    jarod: OpenClawRuntimeAgent | null;
    services: Array<{
      id: string;
      label: string;
      url: string;
      ok: boolean;
      status: string;
      http_code: number | null;
    }>;
    agents: OpenClawRuntimeAgent[];
    problems: Array<{
      severity: string;
      title: string;
      proof: string;
      patch: string;
    }>;
  };
  workerPool?: WorkerPoolSnapshot;
  commerce_machine?: Array<{
    id: string;
    name: string;
    status: "LIVE" | "PARTIAL" | "CANON_GATE" | "AWAITING_SETUP" | "BROKEN";
    problem: string;
    next_action: string;
    owner_agent: string;
    proof_source: string;
  }>;
  centralBrain: {
    housesCount: number | null;
    houses: Array<{ key: string; title: string; status: string }>;
  };
  publisher: {
    ok: boolean;
    status: string;
    service: string;
    outputDirCount: number | null;
  };
  publisherNative?: PublisherNativeSnapshot;
  publisherBridge?: PublisherBridgeSnapshot;
  videoAvailability?: VideoAvailabilitySnapshot;
  publisherCanon?: PublisherCanonSnapshot;
  services: Array<{ id: string; label: string; ok: boolean; status?: string; http_code?: number | null; url?: string; role?: string }>;
  knowledge?: Record<KnowledgeId, KnowledgeRecord>;
  offers: OfferRecord[];
  routes?: RoutesSnapshot;
  investor_room?: InvestorRoomSnapshot;
  openclaw?: {
    sourceTag: string;
    boards: Array<{ id: string; name: string; slug: string }>;
    agents: Array<{
      id: string;
      name: string;
      status: string;
      boardId: string | null;
      role: string;
      authorizedTrucks: string;
      dailyOutput: string;
      forbiddenActions: string;
    }>;
    customFields: Array<{ key: string; label: string; type: string }>;
    garageTrucks: OpenClawTruck[];
    approvals: Array<{ id: string; actionType: string; status: string; taskTitles: unknown[] }>;
    buildings: Array<{
      id: string;
      name: string;
      slug: string;
      activeTasks: number;
      trucks: string[];
      proof: string;
      arrImpact: string;
    }>;
  };
  assetsWarehouse?: AssetsWarehouseSnapshot;
  agentsCanon?: {
    ok: boolean;
    count: number;
    sourceTag: string;
    agents: Array<{
      no: number | null;
      id: string;
      name: string;
      glyph: string;
      avatarEmoji: string;
      colorPrimary: string;
      colorAccent: string;
      roleBadge: string;
      house: string;
      houseColor: string;
      rankLayer: string;
      rankLayerWeight?: number;
      orgRole?: string;
      boss: string;
      engine: string;
      responsibilities: string[];
    }>;
  };
  houseOrchestrator?: HouseOrchestratorPayload;
  houseMissions?: HouseMissionRecord[];
  consoleIa?: ConsoleIaSnapshot;
  consoleIaInbox?: ConsoleIAInitialInbox | null;
  openclawRepo?: OpenClawRepoSnapshot;
  toolOperatingContracts?: ToolOperatingContractsPayload;
  hubSourceLedger?: HubSourceLedgerPayload | null;
  hubWiring?: HubWiringPayload | null;
  writeBlocked: boolean;
  piiBlocked: boolean;
  dangerousActions: string[];
};

export type OpenClawRuntimeAgent = {
  id: string;
  name: string;
  team: string;
  enabled: boolean;
  homeHouse: string;
  primaryModel: string;
  heartbeat: {
    ok: boolean;
    path: string | null;
    rawStatus: string;
    ts: string | null;
    ageSeconds: number | null;
    fresh: boolean;
  };
  tickLabel: string | null;
  tickEnabled: boolean;
  runtimeStatus: "FRESH" | "STALE" | "NO_HEARTBEAT" | "DISABLED" | string;
  proof: string;
  nextAction: string;
};

export type CofiaAgent = NonNullable<Snapshot["agentsCanon"]>["agents"][number];

export type OpenClawTruck = {
  id: string;
  title: string;
  status: string;
  priority: string;
  boardId: string | null;
  assignedAgentId: string | null;
  truckId: string | null;
  truckName: string | null;
  truckType: string | null;
  truckStatus: string;
  driverAgent: string;
  destinationBoard: string;
  currentJob: string;
  route: string;
  payloadType: string;
  sourceOfTruth: string;
  lastRunAt: string | null;
  lastPayloadSummary: string;
  lastProof: string;
  writeLock: boolean;
  approvalGate: string;
  arrImpact: string;
  riskLevel: string;
  nextAction: string;
  failureMode: string;
  owner: string;
  proofRequired: string;
  oldCityFlag: boolean;
};

export type OfferRecord = {
  id: string;
  taskTitle: string;
  offerId: string;
  offerName: string;
  priceEur: number | null;
  priceLabel: string;
  billingPeriod: string;
  stripeLink: string;
  stripeLinks: string[];
  statusCanon: string;
  subsCount: number | null;
  subsCountLastProof: string;
  publicUseBlockedAlias: boolean;
  homeHouseCanon: string;
  arrImpact: string;
  nextAction: string;
  sourceTag: string;
  lastRunAt: string | null;
  lastProof: string;
};

export type KnowledgeId = "obsidian" | "notion" | "drive";

export type KnowledgeRecord = {
  id: KnowledgeId;
  truckTaskId: string;
  truckName: string;
  status: string;
  lastProof: string;
  lastRunAt: string | null;
  sourceTag: string;
  sourceOfTruth: string;
  nextAction: string;
  proofRequired: string;
};

export type RouteRecord = {
  id: string;
  label: string;
  source: string;
  status: string;
  key_metrics: Record<string, unknown>;
  last_proof: string;
  next_checkpoint: string;
  gate_required: string;
  blockers: string[];
};

export type RoutesSnapshot = {
  revenue_route: RouteRecord;
  acquisition_route: RouteRecord;
  knowledge_route: RouteRecord;
  broker_route: RouteRecord;
  support_route: RouteRecord;
  compliance_route: RouteRecord;
};

export type InvestorRoomSnapshot = {
  current_arr_eur: number | null;
  current_mrr_eur: number | null;
  target_arr_eur: number;
  target_date: string;
  gap_eur: number | null;
  gap_pct: number | null;
  top_blockers: string[];
  next_7_days_tasks: Array<{
    title: string;
    board_id: string | null;
    status: string;
    priority: string;
    due_time: string | null;
    arr_impact: string;
    source_tag: string;
    next_action: string;
  }>;
  last_proof_per_route: Record<string, string>;
};

export type Status = "GREEN" | "LIVE" | "AMBER" | "UNKNOWN" | "PAUSED" | "QUARANTINE" | "LOCKED";

export type TruckRow = {
  label: string;
  status: Status;
  owner: string;
  proof: string;
  nextAction: string;
  writeBlocked: boolean;
};

export type OpenClawBoard = NonNullable<Snapshot["openclaw"]>["boards"][number];
export type OpenClawAgent = NonNullable<Snapshot["openclaw"]>["agents"][number];
export type OpenClawBuilding = NonNullable<Snapshot["openclaw"]>["buildings"][number];

export type HouseId =
  | "mission_control_tower"
  | "youtube_studio"
  | "iron_office"
  | "vip_gate"
  | "mt4_signal_tower"
  | "site_seo_lab"
  | "openclaw_agent_barracks"
  | "paperclip_factory"
  | "lightrag_observatory"
  | "obsidian_library"
  | "calendar_tower"
  | "compliance_port"
  | "central_brain"
  | "trading_academy"
  | "assets_warehouse";

export type HouseDefinition = {
  id: HouseId;
  name: string;
  owners: string[];
  primaryBoardSlug: string;
  boardAliases: string[];
};

export type HouseView = HouseDefinition & {
  boards: OpenClawBoard[];
  buildings: OpenClawBuilding[];
  agents: OpenClawAgent[];
  trucks: OpenClawTruck[];
  activeTasks: number;
  status: Status;
};

export type HouseWorkforceStatus = "LIVE" | "ACTION" | "BACKSTAGE" | "RISK";

export type HouseWorkforce = {
  businessName: string;
  owner: string;
  workers: string[];
  mission: string;
  nextAction: string;
  impact: string;
  blocker: string;
  proof: string;
  badge: HouseWorkforceStatus;
  tone: Status;
};

export type WorldNode = {
  id: HouseId;
  label: string;
  zone: string;
  x: number;
  y: number;
  icon: string;
  owner: string;
  mission: string;
  status: Status;
  assetKey: string;
};

export type WorldAgent = {
  name: string;
  from: HouseId;
  to: HouseId;
  mission: string;
  payload: string;
  color: string;
  duration: number;
  delay: number;
};

export type WorldTruck = {
  label: string;
  route: HouseId[];
  status: "urgent" | "blocked" | "live" | "build";
  duration: number;
  delay: number;
};

export type CityDistrict = {
  id: HouseId;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visual: "castle" | "tower" | "factory" | "gate" | "vault" | "port" | "lab" | "barracks";
  accent: string;
  glow: string;
  workers: string[];
  machines: string[];
  role: string;
  next: string;
  blocker: string;
  metric?: string;
};

export type CityRoute = {
  id: string;
  points: HouseId[];
  label: string;
  tone: "cyan" | "emerald" | "amber" | "rose";
};

export type RailStep = {
  label: string;
  value: string;
  tone?: "cyan" | "emerald" | "amber" | "rose";
};

export type CityMachine = {
  label: string;
  district: HouseId;
  tone: "cyan" | "emerald" | "amber" | "rose" | "slate";
};
