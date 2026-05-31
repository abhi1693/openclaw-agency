// Types extraits de WorldControl.tsx (refactor 2026-05-29) — pure types, zéro runtime.
// MovingAgent / MovingTruck restent dans WorldControl.tsx (collision avec composants homonymes).

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
      boss: string;
      engine: string;
      responsibilities: string[];
    }>;
  };
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
