"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Building2,
  Castle,
  CircleDollarSign,
  Factory,
  FileCheck2,
  Landmark,
  Lock,
  RadioTower,
  ShieldCheck,
  Truck,
  Users,
  X,
} from "lucide-react";

type Snapshot = {
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
  };
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
  services: Array<{ id: string; label: string; ok: boolean; status: number | null }>;
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
  writeBlocked: boolean;
  piiBlocked: boolean;
  dangerousActions: string[];
};

type OpenClawTruck = {
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

type OfferRecord = {
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

type KnowledgeId = "obsidian" | "notion" | "drive";

type KnowledgeRecord = {
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

type RouteRecord = {
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

type RoutesSnapshot = {
  revenue_route: RouteRecord;
  acquisition_route: RouteRecord;
  knowledge_route: RouteRecord;
  broker_route: RouteRecord;
  support_route: RouteRecord;
  compliance_route: RouteRecord;
};

type InvestorRoomSnapshot = {
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

type Status = "GREEN" | "LIVE" | "AMBER" | "UNKNOWN" | "PAUSED" | "QUARANTINE" | "LOCKED";

type TruckRow = {
  label: string;
  status: Status;
  owner: string;
  proof: string;
  nextAction: string;
  writeBlocked: boolean;
};

type OpenClawBoard = NonNullable<Snapshot["openclaw"]>["boards"][number];
type OpenClawAgent = NonNullable<Snapshot["openclaw"]>["agents"][number];
type OpenClawBuilding = NonNullable<Snapshot["openclaw"]>["buildings"][number];

type HouseId =
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

type HouseDefinition = {
  id: HouseId;
  name: string;
  owners: string[];
  primaryBoardSlug: string;
  boardAliases: string[];
};

type HouseView = HouseDefinition & {
  boards: OpenClawBoard[];
  buildings: OpenClawBuilding[];
  agents: OpenClawAgent[];
  trucks: OpenClawTruck[];
  activeTasks: number;
  status: Status;
};

const TARGET_ARR_EUR = 100_000_000;
const TARGET_DATE = "2026-12-31";
const TARGET_MRR_EQUIVALENT_EUR = 8_333_333;

const moneyFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});
const compactFormatter = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const formatEur = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${moneyFormatter.format(value)} EUR`
    : "UNKNOWN";

const formatUsd = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${moneyFormatter.format(value)} USD`
    : "UNKNOWN";

const formatNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? moneyFormatter.format(value)
    : "UNKNOWN";

const formatRelativeTime = (value: string | null | undefined) => {
  if (!value) return "UNKNOWN";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "UNKNOWN";
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "il y a <1 min";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `il y a ${diffHours} h`;
  return `il y a ${Math.floor(diffHours / 24)} j`;
};

const truncateText = (value: string | null | undefined, maxLength = 80) => {
  const text = value?.trim() || "UNKNOWN";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

const formatMetricValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "UNKNOWN";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${formatMetricValue(item)}`)
      .join(" · ");
  }
  return String(value);
};

const statusClass: Record<Status, string> = {
  GREEN: "border-emerald-300/50 bg-emerald-400/12 text-emerald-100",
  LIVE: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  AMBER: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  UNKNOWN: "border-slate-400/30 bg-slate-400/10 text-slate-300",
  PAUSED: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  QUARANTINE: "border-red-400/40 bg-red-500/10 text-red-200",
  LOCKED: "border-red-400/50 bg-red-500/15 text-red-100",
};

const normalizeStatus = (status: string | null | undefined): Status => {
  const upper = (status ?? "").toUpperCase();
  if (upper === "GREEN" || upper === "LIVE" || upper === "AMBER" || upper === "UNKNOWN" || upper === "PAUSED" || upper === "QUARANTINE" || upper === "LOCKED") {
    return upper;
  }
  return "UNKNOWN";
};

const normalizeOfferStatus = (status: string | null | undefined): Status => {
  const upper = (status ?? "").toUpperCase();
  if (upper.includes("NEEDS")) return "AMBER";
  if (upper.includes("CANON_ACTIVE")) return "LIVE";
  if (upper.includes("LOCKED")) return "LOCKED";
  return "UNKNOWN";
};

const offerHref = (offer: OfferRecord) =>
  offer.stripeLinks.find((link) => link.startsWith("https://")) ??
  (offer.stripeLink.startsWith("https://") ? offer.stripeLink.split(",")[0].trim() : null);

const coreTrucks: TruckRow[] = [
  {
    label: "Stripe",
    status: "AMBER",
    owner: "Iron / Director",
    proof: "Revenue summary aggregate only; Stripe write locked.",
    nextAction: "Read MRR/ARR/VIP/past_due only.",
    writeBlocked: true,
  },
  {
    label: "Gmail",
    status: "AMBER",
    owner: "Support Ops",
    proof: "Counts only, no body rendered.",
    nextAction: "Expose unread/important counts after read proof.",
    writeBlocked: true,
  },
  {
    label: "Calendar",
    status: "AMBER",
    owner: "Jarod / Steward",
    proof: "Read-only sprint calendar target.",
    nextAction: "Show event counts, never private titles by default.",
    writeBlocked: true,
  },
  {
    label: "Drive / Sheets",
    status: "AMBER",
    owner: "Steward",
    proof: "Recent Drive boards exist; row writes blocked.",
    nextAction: "Show document/sheet health only.",
    writeBlocked: true,
  },
  {
    label: "Notion",
    status: "LIVE",
    owner: "Steward",
    proof: "Notion connector search available; investor pages are read source.",
    nextAction: "Show sync trace and page health.",
    writeBlocked: true,
  },
  {
    label: "GitHub",
    status: "LIVE",
    owner: "Codex / Atlas",
    proof: "Local repo and branch proofs only; main merge locked.",
    nextAction: "Show current branch and proof commands.",
    writeBlocked: true,
  },
  {
    label: "Vercel",
    status: "AMBER",
    owner: "Atlas",
    proof: "Hosting source, deploy blocked.",
    nextAction: "Preview/status only; no deploy.",
    writeBlocked: true,
  },
  {
    label: "Vantage",
    status: "UNKNOWN",
    owner: "Cost Controller",
    proof: "Needs auth/probe before burn/runway GREEN.",
    nextAction: "Display UNKNOWN until cost proof.",
    writeBlocked: true,
  },
  {
    label: "Supabase",
    status: "AMBER",
    owner: "Atlas / Guardian",
    proof: "Remote referenced, schemas not displayed.",
    nextAction: "Read schema health only.",
    writeBlocked: true,
  },
  {
    label: "GA4 / Search Console / BigQuery",
    status: "AMBER",
    owner: "Atlas",
    proof: "LaunchAgent/passive traces exist; dashboards not GREEN.",
    nextAction: "Show status counts only.",
    writeBlocked: true,
  },
  {
    label: "Sentry",
    status: "UNKNOWN",
    owner: "Sentinel",
    proof: "Auth/probe missing.",
    nextAction: "UNKNOWN until error source proven.",
    writeBlocked: true,
  },
  {
    label: "Canva / Figma",
    status: "AMBER",
    owner: "Design Steward",
    proof: "Design connectors are references, not runtime proof.",
    nextAction: "Read design status only.",
    writeBlocked: true,
  },
  {
    label: "CofiaPublisher",
    status: "LIVE",
    owner: "Publishing Gate",
    proof: "Local :8540 status read; publish lock active.",
    nextAction: "Queue/status only.",
    writeBlocked: true,
  },
  {
    label: "Telegram status-only",
    status: "PAUSED",
    owner: "Iron / Sonic",
    proof: "External send is locked.",
    nextAction: "Show status, no send.",
    writeBlocked: true,
  },
  {
    label: "Iron CRM",
    status: "AMBER",
    owner: "Iron / Jarod",
    proof: "Aggregate clients/revenue only; no raw client records.",
    nextAction: "Show active clients aggregate and blockers.",
    writeBlocked: true,
  },
  {
    label: "Brokers FXcess / IronFX / Libertex",
    status: "LIVE",
    owner: "Jack / Iron",
    proof: "Lifetime broker aggregates in revenue summary.",
    nextAction: "Show aggregate only.",
    writeBlocked: true,
  },
  {
    label: "RaiseFX / TMGM",
    status: "QUARANTINE",
    owner: "Jack",
    proof: "RaiseFX key issue; TMGM missing key.",
    nextAction: "Keep out of GREEN metrics.",
    writeBlocked: true,
  },
  {
    label: "Central Brain Registry",
    status: "LIVE",
    owner: "Atlas / Codex",
    proof: "Registry :8767 returns 15 houses.",
    nextAction: "Show houses as read-only operating state.",
    writeBlocked: true,
  },
  {
    label: "Hub API read-only",
    status: "LIVE",
    owner: "Atlas",
    proof: "Hub aggregate endpoints only.",
    nextAction: "Consume sanitized numbers; never patch UI.",
    writeBlocked: true,
  },
  {
    label: "ack-server / rtk-llm-proxy / Qwen",
    status: "AMBER",
    owner: "Jarod / Sentinel",
    proof: "Health endpoints respond; route detail still proof-gated.",
    nextAction: "Show service health, not model claims.",
    writeBlocked: true,
  },
  {
    label: "Codex / Claude",
    status: "AMBER",
    owner: "Director",
    proof: "Worker status must be proof-gated.",
    nextAction: "Codex guards; Claude builds only on accepted scope.",
    writeBlocked: true,
  },
  {
    label: "OpenClaw Gateway",
    status: "LIVE",
    owner: "Jarod",
    proof: "Docker frontend/backend/db/redis/worker active.",
    nextAction: "Use as engine and control plane.",
    writeBlocked: true,
  },
  {
    label: "LaunchAgents",
    status: "AMBER",
    owner: "Sentinel",
    proof: "Core live, exits require triage.",
    nextAction: "Display degraded count only.",
    writeBlocked: true,
  },
  {
    label: "Cloudflare Tunnel",
    status: "AMBER",
    owner: "Atlas",
    proof: "Tunnel source exists, exposure audit pending.",
    nextAction: "Show tunnel status only.",
    writeBlocked: true,
  },
  {
    label: "YouTube / TikTok / Instagram / X / TradingView",
    status: "PAUSED",
    owner: "Publishing Gate",
    proof: "Auto-publish not audited.",
    nextAction: "Keep paused until reviewer + compliance + proof.",
    writeBlocked: true,
  },
];

const districts = [
  {
    label: "Revenue Command",
    icon: CircleDollarSign,
    x: "43%",
    y: "55%",
    status: "AMBER" as Status,
    metric: "MRR live",
  },
  {
    label: "Acquisition Engine",
    icon: RadioTower,
    x: "20%",
    y: "62%",
    status: "AMBER" as Status,
    metric: "0 checkout intents",
  },
  {
    label: "Offer Factory",
    icon: Factory,
    x: "33%",
    y: "45%",
    status: "AMBER" as Status,
    metric: "97 / 297 / 997",
  },
  {
    label: "AgentOps / Skills",
    icon: Bot,
    x: "58%",
    y: "41%",
    status: "AMBER" as Status,
    metric: "Proof-gated",
  },
  {
    label: "Proof Ledger",
    icon: FileCheck2,
    x: "64%",
    y: "66%",
    status: "LIVE" as Status,
    metric: "No fake GREEN",
  },
  {
    label: "Investor Room",
    icon: Landmark,
    x: "74%",
    y: "32%",
    status: "AMBER" as Status,
    metric: "Accountability",
  },
  {
    label: "Asset Factory",
    icon: Building2,
    x: "28%",
    y: "74%",
    status: "AMBER" as Status,
    metric: "47 assets",
  },
  {
    label: "Support Ops",
    icon: Users,
    x: "76%",
    y: "59%",
    status: "AMBER" as Status,
    metric: "No PII",
  },
];

const disabledActions = ["SEND", "PUBLISH", "DEPLOY", "STRIPE WRITE"];
const northStarImage =
  "/assets/cofiatrading-world-control/cofiatrading-new-york-world-control-100m-arr.png";

const ssotHouses: HouseDefinition[] = [
  {
    id: "mission_control_tower",
    name: "Command Tower",
    owners: ["Erwin", "Codex", "ChatGPT"],
    primaryBoardSlug: "mission_control_tower",
    boardAliases: ["investor-accountability", "investor-room"],
  },
  {
    id: "youtube_studio",
    name: "COF IA Publisher",
    owners: ["Nova", "Copywriter", "Codex"],
    primaryBoardSlug: "cofiapublisher-studio",
    boardAliases: ["cofiapublisher", "social-distribution", "acquisition-engine"],
  },
  {
    id: "iron_office",
    name: "Revenue & CRM",
    owners: ["Iron", "David", "Codex"],
    primaryBoardSlug: "revenue-command",
    boardAliases: ["broker-reclaim", "support-recovery", "support-ops"],
  },
  {
    id: "vip_gate",
    name: "Telegram Community",
    owners: ["Antho", "Codex"],
    primaryBoardSlug: "vip_gate",
    boardAliases: ["offer-factory"],
  },
  {
    id: "mt4_signal_tower",
    name: "Trading Tower",
    owners: ["Risk", "Quant", "Marco", "Codex"],
    primaryBoardSlug: "mt4_signal_tower",
    boardAliases: [],
  },
  {
    id: "site_seo_lab",
    name: "Site & SEO Lab",
    owners: ["Atlas", "Doctor", "Codex"],
    primaryBoardSlug: "product-new-york",
    boardAliases: ["new-york-build", "release-gate", "site_seo_lab"],
  },
  {
    id: "openclaw_agent_barracks",
    name: "Agents Village",
    owners: ["Jarod", "Luffy", "Codex"],
    primaryBoardSlug: "agentops-skills",
    boardAliases: ["agentops", "garage-trucks", "toolchain"],
  },
  {
    id: "paperclip_factory",
    name: "Paperclip Factory",
    owners: ["Paperclip", "Steward", "Codex"],
    primaryBoardSlug: "dispatch-queue",
    boardAliases: ["paperclip_factory"],
  },
  {
    id: "lightrag_observatory",
    name: "LightRAG Observatory",
    owners: ["Guardian", "Oracle", "Steward", "Codex"],
    primaryBoardSlug: "lightrag_observatory",
    boardAliases: [],
  },
  {
    id: "obsidian_library",
    name: "Knowledge Vault",
    owners: ["Guardian", "Steward", "Codex"],
    primaryBoardSlug: "obsidian_library",
    boardAliases: ["notion-ops"],
  },
  {
    id: "calendar_tower",
    name: "Calendar Tower",
    owners: ["Jarod", "Codex"],
    primaryBoardSlug: "calendar_tower",
    boardAliases: [],
  },
  {
    id: "compliance_port",
    name: "Compliance Gate",
    owners: ["Juriste", "Fiscal", "Codex"],
    primaryBoardSlug: "compliance-gate",
    boardAliases: ["compliance_port"],
  },
  {
    id: "central_brain",
    name: "Central Brain",
    owners: ["Codex", "Guardian", "Steward"],
    primaryBoardSlug: "central_brain",
    boardAliases: ["proof-ledger", "cost-runway", "old-city-quarantine"],
  },
  {
    id: "trading_academy",
    name: "Trading Academy",
    owners: ["Atlas", "Brand Manager", "Marco", "Lab", "Copywriter", "Codex"],
    primaryBoardSlug: "trading_academy",
    boardAliases: [],
  },
  {
    id: "assets_warehouse",
    name: "Publisher Suite",
    owners: ["Paul MKT", "Paul Réseau", "Nova", "Codex"],
    primaryBoardSlug: "asset-factory",
    boardAliases: ["content-factory", "assets_warehouse"],
  },
];

const houseIdByBoardSlug: Record<string, HouseId> = ssotHouses.reduce(
  (acc, house) => {
    acc[house.primaryBoardSlug] = house.id;
    house.boardAliases.forEach((slug) => {
      acc[slug] = house.id;
    });
    return acc;
  },
  {} as Record<string, HouseId>,
);

export function WorldControl() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTruckName, setSelectedTruckName] = useState<string | null>(null);
  const [drawerTruckName, setDrawerTruckName] = useState<string | null>(null);
  const [selectedHouseId, setSelectedHouseId] = useState<HouseId | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<KnowledgeId | null>(null);
  const [showCastleDrawer, setShowCastleDrawer] = useState(false);
  const [showInvestorDrawer, setShowInvestorDrawer] = useState(false);
  const [stripeRefreshStatus, setStripeRefreshStatus] = useState<string | null>(null);
  const [refreshingStripeProof, setRefreshingStripeProof] = useState(false);
  // P10 Al-Khāliq · Qudrah pulse : détecter changements valeurs revenue → animation 1.2s
  const [pulsingFields, setPulsingFields] = useState<Set<string>>(new Set());
  const previousSnapshotRef = useRef<Snapshot | null>(null);
  // P10b · LIVE indicator visible (Al-Hayy + Al-Qarīb Sourate III)
  const [lastFetchTs, setLastFetchTs] = useState<number>(Date.now());
  const [secondsSinceSync, setSecondsSinceSync] = useState<number>(0);
  const [fetchPulse, setFetchPulse] = useState<boolean>(false);
  // CORAN V8 Sourate LVI · Angel Roster Manāzil al-Malā'ikah runtime sync
  const [angelRoster, setAngelRoster] = useState<AngelRosterPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/cofiatrading-world-control/snapshot", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const data = (await response.json()) as Snapshot;
        if (!cancelled) {
          // P10 · Détecter changements vs précédent snapshot (jugulaire Sourate XXXII)
          const prev = previousSnapshotRef.current;
          if (prev) {
            const changes = new Set<string>();
            if (prev.revenue?.currentArrEur !== data.revenue?.currentArrEur) changes.add("arr");
            if (prev.revenue?.currentMrrEur !== data.revenue?.currentMrrEur) changes.add("mrr");
            if (prev.revenue?.activeVip !== data.revenue?.activeVip) changes.add("vip");
            if (prev.revenue?.pastDueCount !== data.revenue?.pastDueCount) changes.add("pastDue");
            if (prev.revenue?.pastDueEur !== data.revenue?.pastDueEur) changes.add("pastDueEur");
            if (changes.size > 0) {
              setPulsingFields(changes);
              window.setTimeout(() => setPulsingFields(new Set()), 1200);
            }
          }
          previousSnapshotRef.current = data;
          setSnapshot(data);
          setError(null);
          // P10b · LIVE indicator pulse à chaque fetch successful
          setLastFetchTs(Date.now());
          setFetchPulse(true);
          window.setTimeout(() => setFetchPulse(false), 600);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "UNKNOWN_ERROR");
        }
      }
    };

    void load();
    // P10 · Polling jugulaire 5s (Sourate XXXII:5 — plus proche que veine jugulaire)
    const interval = window.setInterval(load, 5_000);
    // P10b · Tick "seconds since sync" toutes les 1s pour affichage live
    const tickInterval = window.setInterval(() => {
      setSecondsSinceSync(Math.floor((Date.now() - lastFetchTs) / 1000));
    }, 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearInterval(tickInterval);
    };
  }, [lastFetchTs]);

  // CORAN V8 Sourate LVI · Angel Roster fetch (polling 30s · moins critique que snapshot)
  useEffect(() => {
    let cancelled = false;
    const loadAngels = async () => {
      try {
        const r = await fetch("/api/cofiatrading-world-control/angel-roster", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as AngelRosterPayload;
        if (!cancelled) setAngelRoster(data);
      } catch { /* silent */ }
    };
    void loadAngels();
    const interval = window.setInterval(loadAngels, 30_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  // Mu'taqib doctrine drift warnings — advisor non-blocking (Guardian agent operates)
  // source_tag: MUTAQIB_COCKPIT_WIDGET_V1_20260526T1248Z
  const [mutaqibCounts, setMutaqibCounts] = useState<{ total: number; last_1h: number; by_level: Record<string, number> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loadMutaqib = async () => {
      try {
        const r = await fetch("/api/cofiatrading-world-control/mutaqib-warnings", { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && data?.ok) setMutaqibCounts(data.counts);
      } catch { /* silent */ }
    };
    void loadMutaqib();
    const interval = window.setInterval(loadMutaqib, 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  const currentArr = snapshot?.revenue.currentArrEur ?? null;
  const arrGap =
    typeof currentArr === "number" ? Math.max(0, TARGET_ARR_EUR - currentArr) : null;
  const progressPct =
    typeof currentArr === "number" ? Math.min(100, (currentArr / TARGET_ARR_EUR) * 100) : null;

  const endpointStatus = useMemo(() => {
    const endpoints = snapshot?.endpoints ?? {};
    const live = Object.values(endpoints).filter((entry) => entry.ok).length;
    const total = Object.values(endpoints).length;
    return total > 0 ? `${live}/${total}` : "UNKNOWN";
  }, [snapshot]);
  const openclawTrucks = snapshot?.openclaw?.garageTrucks ?? [];
  const offers = snapshot?.offers ?? [];
  const routes = snapshot?.routes ?? null;
  const routeRecords = routes ? (Object.values(routes) as RouteRecord[]) : [];
  const investorRoom = snapshot?.investor_room ?? null;
  const knowledgeRecords = Object.values(snapshot?.knowledge ?? {}) as KnowledgeRecord[];
  const truckRows: TruckRow[] =
    openclawTrucks.length > 0
      ? openclawTrucks.map((truck) => ({
          label: truck.truckName ?? truck.title,
          status: normalizeStatus(truck.truckStatus),
          owner: truck.driverAgent,
          proof: truck.lastProof,
          nextAction: truck.nextAction,
          writeBlocked: truck.writeLock,
        }))
      : coreTrucks;
  const selectedTruck =
    openclawTrucks.find((truck) => truck.truckName === selectedTruckName) ??
    openclawTrucks.find((truck) => truck.truckName === "StripeTruck") ??
    openclawTrucks[0] ??
    null;
  const drawerTruck =
    openclawTrucks.find((truck) => truck.truckName === drawerTruckName) ?? null;

  const houses = useMemo<HouseView[]>(() => {
    const openclaw = snapshot?.openclaw;
    if (!openclaw) {
      return ssotHouses.map((house) => ({
        ...house,
        boards: [],
        buildings: [],
        agents: [],
        trucks: [],
        activeTasks: 0,
        status: "UNKNOWN",
      }));
    }

    const boardsById = new Map(openclaw.boards.map((board) => [board.id, board]));

    return ssotHouses.map((house) => {
      const boards = openclaw.boards.filter(
        (board) => houseIdByBoardSlug[board.slug] === house.id,
      );
      const buildings = openclaw.buildings.filter(
        (building) => houseIdByBoardSlug[building.slug] === house.id,
      );
      const agents = openclaw.agents.filter((agent) => {
        const boardSlug = agent.boardId ? boardsById.get(agent.boardId)?.slug : null;
        const homeHouseId = boardSlug ? houseIdByBoardSlug[boardSlug] : null;
        return homeHouseId === house.id || (house.id === "mission_control_tower" && agent.name === "Kevin");
      });
      const trucks = openclaw.garageTrucks.filter(
        (truck) => truck.destinationBoard === house.id,
      );
      const activeTasks = buildings.reduce((total, building) => total + building.activeTasks, 0);
      const status: Status =
        boards.length === 0
          ? "UNKNOWN"
          : agents.length > 0 || trucks.length > 0 || activeTasks > 0
            ? "LIVE"
            : "AMBER";

      return {
        ...house,
        boards,
        buildings,
        agents,
        trucks,
        activeTasks,
        status,
      };
    });
  }, [snapshot]);

  const selectedHouse = houses.find((house) => house.id === selectedHouseId) ?? null;
  const selectedOffer = offers.find((offer) => offer.offerId === selectedOfferId) ?? null;
  const selectedKnowledge =
    knowledgeRecords.find((record) => record.id === selectedKnowledgeId) ?? null;

  const openTruckDrawer = (truckName: string) => {
    setSelectedTruckName(truckName);
    setDrawerTruckName(truckName);
    setSelectedHouseId(null);
    setSelectedOfferId(null);
    setSelectedKnowledgeId(null);
    setShowCastleDrawer(false);
    setShowInvestorDrawer(false);
    setStripeRefreshStatus(null);
  };

  const openHouseDrawer = (houseId: HouseId) => {
    setSelectedHouseId(houseId);
    setDrawerTruckName(null);
    setSelectedOfferId(null);
    setSelectedKnowledgeId(null);
    setShowCastleDrawer(false);
    setShowInvestorDrawer(false);
    setStripeRefreshStatus(null);
  };

  const openOfferDrawer = (offerId: string) => {
    setSelectedOfferId(offerId);
    setSelectedHouseId(null);
    setDrawerTruckName(null);
    setSelectedKnowledgeId(null);
    setShowCastleDrawer(false);
    setShowInvestorDrawer(false);
    setStripeRefreshStatus(null);
  };

  const openKnowledgeDrawer = (knowledgeId: KnowledgeId) => {
    setSelectedKnowledgeId(knowledgeId);
    setSelectedOfferId(null);
    setSelectedHouseId(null);
    setDrawerTruckName(null);
    setShowCastleDrawer(false);
    setShowInvestorDrawer(false);
    setStripeRefreshStatus(null);
  };

  const openCastleDrawer = () => {
    setShowCastleDrawer(true);
    setShowInvestorDrawer(false);
    setSelectedKnowledgeId(null);
    setSelectedOfferId(null);
    setSelectedHouseId(null);
    setDrawerTruckName(null);
    setStripeRefreshStatus(null);
  };

  const openInvestorDrawer = () => {
    setShowInvestorDrawer(true);
    setShowCastleDrawer(false);
    setSelectedKnowledgeId(null);
    setSelectedOfferId(null);
    setSelectedHouseId(null);
    setDrawerTruckName(null);
    setStripeRefreshStatus(null);
  };

  const refreshStripeProof = async () => {
    if (drawerTruck?.truckName !== "StripeTruck") return;
    setRefreshingStripeProof(true);
    setStripeRefreshStatus("refreshing");
    try {
      const response = await fetch("/api/cofiatrading-world-control/refresh-stripe-proof", {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? `HTTP_${response.status}`);
      const snapshotResponse = await fetch("/api/cofiatrading-world-control/snapshot", {
        cache: "no-store",
      });
      if (snapshotResponse.ok) {
        setSnapshot((await snapshotResponse.json()) as Snapshot);
      }
      setStripeRefreshStatus(payload?.lastProof ?? "Stripe proof refreshed");
    } catch (refreshError) {
      setStripeRefreshStatus(
        refreshError instanceof Error ? refreshError.message : "UNKNOWN_REFRESH_ERROR",
      );
    } finally {
      setRefreshingStripeProof(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#02040a] text-slate-100">
      <section className="relative min-h-screen overflow-hidden">
        <img
          src={northStarImage}
          alt="COFIATRADING New York World Control 100M ARR visual north star"
          className="absolute inset-x-0 top-0 mx-auto block h-auto max-h-[92vh] w-auto max-w-full object-contain object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/5 to-black/62" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,4,10,0.08)_58%,rgba(2,4,10,0.62)_100%)]" />
        <button
          type="button"
          onClick={openCastleDrawer}
          className="absolute left-1/2 top-[24%] z-10 h-[210px] w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300/0 bg-amber-300/0 text-transparent outline-none transition hover:border-amber-200/35 hover:bg-amber-300/8 focus-visible:border-amber-200/70 focus-visible:bg-amber-300/10"
          aria-label="Open 100M ARR Castle route aggregation"
        >
          100M ARR Castle route aggregation
        </button>

        <header className="absolute inset-x-0 top-0 z-20 border-b border-amber-300/20 bg-black/62 px-4 py-3 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-[260px] items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-amber-300/35 bg-amber-300/10 text-amber-100">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-bold uppercase tracking-[0.18em] text-white">
                  COFIATRADING
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  New York World Control
                </p>
                {/* P10b · LIVE indicator jugulaire (Al-Hayy + Al-Qarīb) */}
                <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-emerald-300">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${fetchPulse ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]" : "bg-emerald-500/70"} transition-all duration-200`}
                    style={{ animation: fetchPulse ? "qudrah-pulse 0.6s ease-out" : undefined }}
                  />
                  <span className="uppercase">
                    LIVE · synced {secondsSinceSync}s ago · jugulaire 5s
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openCastleDrawer}
              className="rounded-md border border-amber-300/35 bg-black/55 px-5 py-2 text-center shadow-[0_0_35px_rgba(251,191,36,0.22)] transition hover:border-amber-100/70 hover:bg-amber-300/10"
            >
              <div className="flex items-center justify-center gap-2 text-amber-100">
                <Castle className="h-5 w-5" />
                <p className="text-2xl font-black uppercase tracking-wide">
                  100M ARR Target
                </p>
              </div>
              <p className="text-xs uppercase tracking-[0.22em] text-amber-100/75">
                {TARGET_DATE} · 8.33M MRR only as secondary run-rate math
              </p>
            </button>

            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <TopMetric label="Current ARR" value={formatEur(snapshot?.revenue.currentArrEur)} isPulsing={pulsingFields.has("arr")} />
              <TopMetric label="Current MRR" value={formatEur(snapshot?.revenue.currentMrrEur)} isPulsing={pulsingFields.has("mrr")} />
              <TopMetric label="VIP" value={formatNumber(snapshot?.revenue.activeVip)} isPulsing={pulsingFields.has("vip")} />
              <TopMetric label="Proof" value={endpointStatus} isPulsing={pulsingFields.has("proof")} />
            </div>
          </div>
        </header>

        <div className="absolute left-4 top-[94px] z-20 hidden w-[260px] rounded-md border border-red-400/35 bg-red-950/45 p-3 backdrop-blur-sm md:block">
          <div className="flex items-center gap-2 text-red-100">
            <Lock className="h-4 w-4" />
            <p className="text-xs font-bold uppercase tracking-[0.18em]">Old City locked</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-red-100/80">
            Abidjan reste read-only. On extrait les diamants; aucun mur pourri ne rentre dans New York.
          </p>
        </div>

        <aside className="absolute right-4 top-[108px] z-20 hidden w-[300px] space-y-3 xl:block">
          <Panel title="Investor truth" tone="gold">
            <button
              type="button"
              onClick={openInvestorDrawer}
              className="block w-full rounded-md text-left transition hover:bg-amber-300/8 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-200/70"
            >
              <MetricGrid
                metrics={[
                  ["Current ARR", formatEur(snapshot?.revenue.currentArrEur)],
                  ["ARR gap", formatEur(arrGap)],
                  ["Current MRR", formatEur(snapshot?.revenue.currentMrrEur)],
                  ["Past due", formatEur(snapshot?.revenue.pastDueEur)],
                  ["Broker lifetime", formatUsd(snapshot?.revenue.brokersLifetimeUsd)],
                  ["Iron clients", formatNumber(snapshot?.revenue.clientsActive)],
                ]}
              />
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/75">
                ouvrir Investor Room
              </p>
            </button>
          </Panel>
          <OfferFactoryPanel offers={offers} onSelect={openOfferDrawer} />
          <KnowledgeLayerPanel records={knowledgeRecords} onSelect={openKnowledgeDrawer} />
          <Panel title="15 maisons habitées" tone="cyan">
            <div className="max-h-[310px] space-y-2 overflow-auto pr-1">
              {houses.map((house) => (
                <button
                  type="button"
                  key={house.id}
                  onClick={() => openHouseDrawer(house.id)}
                  className="w-full rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-left transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-100">
                      {house.name}
                    </span>
                    <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold ${statusClass[house.status]}`}>
                      {house.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{house.id}</p>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-slate-300">
                    <span>{house.agents.length} agents</span>
                    <span>{house.trucks.length} trucks</span>
                    <span>{house.activeTasks} tasks</span>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Proof ledger" tone="cyan">
            <ProofRow label="OpenClaw Docker" status="LIVE" proof="frontend :3000 / backend :8000" />
            <ProofRow label="Custom fields" status={(snapshot?.openclaw?.customFields.length ?? 0) >= 23 ? "LIVE" : "UNKNOWN"} proof={`${formatNumber(snapshot?.openclaw?.customFields.length)} truck fields`} />
            <ProofRow label="Garage trucks" status={(snapshot?.openclaw?.garageTrucks.length ?? 0) >= 40 ? "LIVE" : "UNKNOWN"} proof={`${formatNumber(snapshot?.openclaw?.garageTrucks.length)} OpenClaw truck records`} />
            <ProofRow label="Approval gates" status={(snapshot?.openclaw?.approvals.length ?? 0) >= 8 ? "LIVE" : "UNKNOWN"} proof={`${formatNumber(snapshot?.openclaw?.approvals.length)} pending gates`} />
            <ProofRow label="Central Brain" status={snapshot?.centralBrain.housesCount ? "LIVE" : "UNKNOWN"} proof={`${formatNumber(snapshot?.centralBrain.housesCount)} houses`} />
            <ProofRow label="CofiaPublisher" status={snapshot?.publisher.ok ? "LIVE" : "UNKNOWN"} proof={`${snapshot?.publisher.status ?? "UNKNOWN"} / ${formatNumber(snapshot?.publisher.outputDirCount)} renders`} />
            <ProofRow label="Writes" status="LOCKED" proof="send/publish/deploy/Stripe disabled" />
          </Panel>
        </aside>

        <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-amber-300/20 bg-black/70 p-3 backdrop-blur-md">
          <div className="grid gap-3 xl:grid-cols-[1fr_360px]">
            <div className="rounded-md border border-cyan-300/20 bg-slate-950/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                <Truck className="h-4 w-4 text-cyan-200" />
                MCP live network
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
                {truckRows.slice(0, 16).map((truck) => (
                  <button
                    type="button"
                    key={truck.label}
                    onClick={() => openTruckDrawer(truck.label)}
                    className="min-w-0 rounded border border-slate-700 bg-slate-900/75 px-2 py-2 text-left transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                  >
                    <p className="truncate text-[11px] font-semibold text-white">{truck.label}</p>
                    <span className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold ${statusClass[truck.status]}`}>
                      {truck.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-amber-300/35 bg-amber-300/10 p-4 shadow-[0_0_35px_rgba(251,191,36,0.18)]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-200/40 bg-amber-300/20 text-amber-100">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-lg font-black uppercase tracking-wide text-amber-100">
                    Next action
                  </p>
                  <p className="text-sm text-white">
                    Recover past_due + activate VIP funnel
                  </p>
                  <p className="text-[11px] text-amber-100/70">
                    Draft only · no send · no publish · no Stripe write
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 px-4 py-4 lg:grid-cols-[1.45fr_0.95fr] lg:px-6">
        <Panel title="All trucks / tools control" tone="cyan">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {truckRows.map((truck) => (
              <TruckCard
                key={truck.label}
                truck={truck}
                selected={selectedTruck?.truckName === truck.label}
                onSelect={() => openTruckDrawer(truck.label)}
              />
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Living object inspector" tone="gold">
            {selectedTruck ? (
              <div className="space-y-2 text-xs">
                <InspectorRow label="Truck" value={selectedTruck.truckName ?? selectedTruck.title} />
                <InspectorRow label="Driver" value={selectedTruck.driverAgent} />
                <InspectorRow label="Destination" value={selectedTruck.destinationBoard} />
                <InspectorRow label="Current job" value={selectedTruck.currentJob} />
                <InspectorRow label="Route" value={selectedTruck.route} />
                <InspectorRow label="Payload" value={selectedTruck.payloadType} />
                <InspectorRow label="Source" value={selectedTruck.sourceOfTruth} />
                <InspectorRow label="Proof" value={selectedTruck.lastProof} />
                <InspectorRow label="Gate" value={selectedTruck.approvalGate} />
                <InspectorRow label="ARR impact" value={selectedTruck.arrImpact} />
                <InspectorRow label="Next action" value={selectedTruck.nextAction} />
              </div>
            ) : (
              <p className="text-sm text-slate-400">UNKNOWN until Garage / Trucks records load.</p>
            )}
          </Panel>

          <OfferFactoryPanel offers={offers} onSelect={openOfferDrawer} />
          <KnowledgeLayerPanel records={knowledgeRecords} onSelect={openKnowledgeDrawer} />
          <Panel title="100M gravity controls" tone="gold">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={openCastleDrawer}
                className="rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-3 text-left transition hover:border-amber-100/70"
              >
                <p className="text-sm font-bold uppercase text-amber-100">100M ARR Castle</p>
                <p className="mt-1 text-xs text-amber-100/70">
                  Routes revenue, acquisition, knowledge, brokers, support, compliance.
                </p>
              </button>
              <button
                type="button"
                onClick={openInvestorDrawer}
                className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-3 text-left transition hover:border-cyan-100/60"
              >
                <p className="text-sm font-bold uppercase text-cyan-100">Investor Room</p>
                <p className="mt-1 text-xs text-cyan-100/70">
                  ARR/MRR/gap, blockers, next 7 days, proof per route.
                </p>
              </button>
            </div>
          </Panel>

          <Panel title="15 maisons SSOT peuplées" tone="cyan">
            <div className="grid gap-2 sm:grid-cols-2">
              {houses.map((house) => (
                <button
                  type="button"
                  key={house.id}
                  onClick={() => openHouseDrawer(house.id)}
                  className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-left transition hover:border-amber-300/50 hover:bg-amber-300/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-100">{house.name}</span>
                    <span className={`rounded border px-2 py-0.5 text-[10px] ${statusClass[house.status]}`}>
                      {house.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{house.id}</p>
                  <p className="mt-2 text-[11px] text-slate-300">
                    {house.agents.length} résidents · {house.trucks.length} camions · {house.activeTasks} tâches
                  </p>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Buildings / active tasks" tone="cyan">
            <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
              {(snapshot?.openclaw?.buildings ?? []).slice(0, 18).map((building) => (
                <div key={building.id} className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-100">{building.name}</span>
                    <span className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-amber-100">
                      {building.activeTasks} tasks
                    </span>
                  </div>
                  <p className="mt-1 truncate text-slate-500">
                    Trucks: {building.trucks.length ? building.trucks.join(", ") : "UNKNOWN"} · Proof: {building.proof} · ARR: {building.arrImpact}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Agent drivers" tone="cyan">
            <div className="max-h-[340px] space-y-2 overflow-auto pr-1">
              {(snapshot?.openclaw?.agents ?? []).slice(0, 14).map((agent) => (
                <div key={agent.id} className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-100">{agent.name}</span>
                    <span className={`rounded border px-2 py-0.5 text-[10px] ${agent.status === "online" || agent.status === "active" ? statusClass.LIVE : statusClass.AMBER}`}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-500">{agent.authorizedTrucks}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Approval gates" tone="locked">
            <div className="space-y-2">
              {(snapshot?.openclaw?.approvals ?? []).slice(0, 12).map((approval) => (
                <ProofRow
                  key={approval.id}
                  label={approval.actionType}
                  status={approval.status === "pending" ? "LOCKED" : "UNKNOWN"}
                  proof={(approval.taskTitles ?? []).join(", ") || "pending gate"}
                />
              ))}
            </div>
          </Panel>

          <Panel title="Central Brain houses" tone="cyan">
            <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
              {(snapshot?.centralBrain.houses ?? []).length > 0 ? (
                snapshot?.centralBrain.houses.map((house) => (
                  <div
                    key={`${house.key}-${house.title}`}
                    className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
                  >
                    <span className="max-w-[220px] truncate font-medium text-slate-200">
                      {house.title}
                    </span>
                    <span className="rounded border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-cyan-200">
                      {house.status}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">UNKNOWN until registry proof returns.</p>
              )}
            </div>
          </Panel>

          <Panel title="Quarantine register" tone="locked">
            <ul className="space-y-2 text-sm text-slate-300">
              {[
                "Old hub visual UI",
                "Old internal strategy aliases blocked from public UI",
                "Old prices and fake dashboards",
                "Old renders not tagged",
                "Auto-publish not audited",
                "Concept-only agents A/B/C/D/E",
                "Lobster claims without proof",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </section>

      {/* CORAN V8 Sourate LVI · Angel Roster Manāzil al-Malā'ikah */}
      <AngelRosterPanel roster={angelRoster} />

      {drawerTruck ? (
        <TruckDrawer
          truck={drawerTruck}
          onClose={() => setDrawerTruckName(null)}
          onRefreshStripeProof={refreshStripeProof}
          refreshStatus={stripeRefreshStatus}
          refreshing={refreshingStripeProof}
        />
      ) : null}
      {selectedHouse ? <HouseDrawer house={selectedHouse} onClose={() => setSelectedHouseId(null)} /> : null}
      {selectedOffer ? <OfferDrawer offer={selectedOffer} onClose={() => setSelectedOfferId(null)} /> : null}
      {selectedKnowledge ? (
        <KnowledgeDrawer
          record={selectedKnowledge}
          onClose={() => setSelectedKnowledgeId(null)}
        />
      ) : null}
      {showCastleDrawer ? (
        <CastleDrawer
          routes={routeRecords}
          investorRoom={investorRoom}
          onClose={() => setShowCastleDrawer(false)}
        />
      ) : null}
      {showInvestorDrawer ? (
        <InvestorRoomDrawer
          room={investorRoom}
          revenue={snapshot?.revenue ?? null}
          onClose={() => setShowInvestorDrawer(false)}
        />
      ) : null}
    </div>
  );
}

function HeaderPanel({
  snapshot,
  error,
  arrGap,
  progressPct,
  endpointStatus,
}: {
  snapshot: Snapshot | null;
  error: string | null;
  arrGap: number | null;
  progressPct: number | null;
  endpointStatus: string;
}) {
  return (
    <div className="rounded-md border border-cyan-300/20 bg-slate-950/80 p-4 shadow-[0_0_40px_rgba(34,211,238,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
            COFIATRADING.COM
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold leading-tight text-white">
            New York World Control
          </h1>
          <p className="mt-1 text-xs text-slate-400">OpenClaw-powered 100M ARR War Room</p>
        </div>
        <span className="rounded-md border border-emerald-300/40 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-200">
          READ ONLY
        </span>
      </div>

      <div className="mt-4 rounded-md border border-amber-300/25 bg-amber-300/10 p-3">
        <div className="flex items-center gap-2 text-amber-100">
          <Castle className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">North Star</span>
        </div>
        <p className="mt-2 text-3xl font-semibold text-white">100M EUR ARR</p>
        <p className="mt-1 text-xs text-amber-100/80">
          Target date {TARGET_DATE}. Run-rate math secondary:{" "}
          {compactFormatter.format(TARGET_MRR_EQUIVALENT_EUR)} EUR MRR.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <HudValue label="Current ARR" value={formatEur(snapshot?.revenue.currentArrEur)} />
        <HudValue label="ARR gap" value={formatEur(arrGap)} />
        <HudValue label="Proof endpoints" value={endpointStatus} />
        <HudValue label="Progress" value={progressPct === null ? "UNKNOWN" : `${progressPct.toFixed(4)}%`} />
      </div>

      <div className="mt-3 text-[11px] text-slate-500">
        Snapshot: {snapshot?.fetchedAt ?? "PENDING"} · {error ? `Error ${error}` : snapshot?.sourceTag ?? "PENDING"}
      </div>
    </div>
  );
}

function CityWorld({
  snapshot,
  progressPct,
  arrGap,
}: {
  snapshot: Snapshot | null;
  progressPct: number | null;
  arrGap: number | null;
}) {
  return (
    <div className="relative h-full min-h-[600px]">
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-cyan-500/10 to-transparent" />
      <div className="absolute left-1/2 top-8 z-20 w-[300px] -translate-x-1/2 rounded-md border border-amber-200/30 bg-amber-300/10 p-3 text-center shadow-[0_0_40px_rgba(251,191,36,0.22)]">
        <div className="mx-auto flex h-14 w-16 items-end justify-center gap-1">
          {[24, 38, 54, 34, 44].map((height, index) => (
            <span
              key={index}
              className="w-2 rounded-sm bg-gradient-to-t from-amber-600 to-amber-100"
              style={{ height }}
            />
          ))}
        </div>
        <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-amber-100">
          100M ARR Castle
        </p>
        <p className="text-xs text-amber-100/75">
          Current {formatEur(snapshot?.revenue.currentArrEur)} · Gap {formatEur(arrGap)}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-amber-950">
          <span
            className="block h-full rounded bg-gradient-to-r from-amber-400 to-white"
            style={{ width: `${Math.max(0.15, progressPct ?? 0.15)}%` }}
          />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 top-20">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 620" role="img" aria-label="COFIATRADING New York operating world">
          <defs>
            <linearGradient id="water" x1="0" x2="1">
              <stop offset="0" stopColor="#07101f" />
              <stop offset="1" stopColor="#091a2a" />
            </linearGradient>
            <linearGradient id="street" x1="0" x2="1">
              <stop offset="0" stopColor="#22d3ee" stopOpacity="0.08" />
              <stop offset="0.5" stopColor="#a78bfa" stopOpacity="0.22" />
              <stop offset="1" stopColor="#fbbf24" stopOpacity="0.08" />
            </linearGradient>
          </defs>
          <polygon points="70,450 500,170 930,450 500,610" fill="url(#water)" stroke="#164e63" strokeOpacity="0.55" />
          <polygon points="155,430 500,210 845,430 500,558" fill="#071827" stroke="#22d3ee" strokeOpacity="0.22" />
          {Array.from({ length: 9 }).map((_, index) => (
            <path
              key={`road-a-${index}`}
              d={`M ${190 + index * 70} 410 L ${500 + index * 14} 245 L ${810 - index * 46} 430`}
              fill="none"
              stroke="url(#street)"
              strokeWidth="4"
            />
          ))}
          {Array.from({ length: 7 }).map((_, index) => (
            <path
              key={`road-b-${index}`}
              d={`M ${250 + index * 58} 520 L ${450 + index * 24} 260 L ${705 - index * 18} 530`}
              fill="none"
              stroke="#22d3ee"
              strokeOpacity="0.16"
              strokeWidth="3"
            />
          ))}
          {Array.from({ length: 10 }).map((_, index) => (
            <circle
              key={`truck-${index}`}
              cx={240 + index * 58}
              cy={444 - (index % 3) * 46}
              r="5"
              fill={index % 2 ? "#a78bfa" : "#22d3ee"}
            >
              <animate attributeName="opacity" values="0.35;1;0.35" dur={`${2.2 + index * 0.18}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </svg>

        {districts.map((district) => {
          const Icon = district.icon;
          return (
            <div
              key={district.label}
              className="absolute z-30 w-[150px] -translate-x-1/2 -translate-y-1/2"
              style={{ left: district.x, top: district.y }}
            >
              <div className="rounded-md border border-cyan-300/20 bg-slate-950/80 p-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{district.label}</p>
                    <p className="truncate text-[10px] text-slate-400">{district.metric}</p>
                  </div>
                </div>
                <div className="mt-2 h-10 rounded-sm bg-gradient-to-t from-slate-900 to-slate-700 shadow-[inset_0_8px_0_rgba(255,255,255,0.03)]" />
                <span className={`mt-2 inline-flex rounded border px-1.5 py-0.5 text-[10px] ${statusClass[district.status]}`}>
                  {district.status}
                </span>
              </div>
            </div>
          );
        })}

        <div className="absolute bottom-8 right-8 z-40 w-[220px] rounded-md border border-red-400/35 bg-red-950/60 p-3 shadow-[0_0_35px_rgba(239,68,68,0.22)]">
          <div className="flex items-center gap-2 text-red-100">
            <Lock className="h-4 w-4" />
            <p className="text-xs font-bold uppercase tracking-[0.18em]">Old City Abidjan</p>
          </div>
          <p className="mt-2 text-xs text-red-100/80">LOCKED · Diamond extraction only · no hub patch</p>
        </div>

        <div className="absolute bottom-8 left-8 z-40 flex items-center gap-2 rounded-md border border-cyan-300/20 bg-slate-950/80 px-3 py-2 text-xs text-cyan-100">
          <Truck className="h-4 w-4" />
          MCP trucks circulate read-only
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "cyan" | "amber" | "gold" | "locked";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "locked"
      ? "border-red-400/25 bg-red-950/20"
      : tone === "gold"
        ? "border-amber-300/25 bg-amber-300/5"
        : tone === "amber"
          ? "border-amber-300/25 bg-slate-950/80"
          : "border-cyan-300/15 bg-slate-950/75";

  return (
    <section className={`rounded-md border p-3 ${toneClass}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
          {title}
        </h2>
        <ShieldCheck className="h-4 w-4 text-cyan-200" />
      </div>
      {children}
    </section>
  );
}

function HudValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function TopMetric({ label, value, isPulsing }: { label: string; value: string; isPulsing?: boolean }) {
  return (
    <div className={`min-w-[112px] rounded-md border border-slate-600/60 bg-black/55 px-3 py-2 ${isPulsing ? "qudrah-pulse" : ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-black text-white">{value}</p>
    </div>
  );
}

function MetricGrid({ metrics }: { metrics: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {metrics.map(([label, value]) => (
        <HudValue key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function ProofRow({
  label,
  status,
  proof,
}: {
  label: string;
  status: Status;
  proof: string;
}) {
  return (
    <div className="mb-2 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-100">{label}</span>
        <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusClass[status]}`}>
          {status}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{proof}</p>
    </div>
  );
}

function TruckCard({
  truck,
  selected = false,
  onSelect,
}: {
  truck: TruckRow;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-md border p-3 text-left transition hover:border-cyan-300/50 hover:bg-cyan-300/10 ${
        selected ? "border-amber-300/60 bg-amber-300/10" : "border-slate-800 bg-slate-950/70"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{truck.label}</p>
          <p className="mt-0.5 text-xs text-slate-500">{truck.owner}</p>
        </div>
        <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusClass[truck.status]}`}>
          {truck.status}
        </span>
      </div>
      <p className="mt-2 min-h-10 text-xs leading-5 text-slate-400">{truck.proof}</p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800 pt-2 text-[11px] text-slate-500">
        <span className="truncate">{truck.nextAction}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-red-200">
          <Lock className="h-3 w-3" />
          {truck.writeBlocked ? "write blocked" : "write?"}
        </span>
      </div>
    </button>
  );
}

function OfferFactoryPanel({
  offers,
  onSelect,
}: {
  offers: OfferRecord[];
  onSelect: (offerId: string) => void;
}) {
  return (
    <Panel title="Offer Factory — 8 offres canon" tone="gold">
      {offers.length === 8 ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
          {offers.map((offer) => {
            const href = offerHref(offer);
            const status = normalizeOfferStatus(offer.statusCanon);
            return (
              <article
                key={offer.offerId}
                className="rounded-md border border-slate-800 bg-slate-950/75 p-2 text-xs"
              >
                <button
                  type="button"
                  onClick={() => onSelect(offer.offerId)}
                  className="block w-full text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold text-white">
                      {offer.offerName}
                    </span>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] ${statusClass[status]}`}>
                      {offer.statusCanon}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-400">
                    {offer.priceLabel} · {offer.billingPeriod}
                  </p>
                  <p className="mt-1 text-[11px] text-cyan-100">
                    Subs: {offer.subsCount === null ? "UNKNOWN" : offer.subsCount}
                  </p>
                </button>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex max-w-full truncate rounded border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold text-cyan-100 hover:border-cyan-200/60"
                  >
                    Stripe link
                  </a>
                ) : (
                  <span className="mt-2 inline-flex rounded border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] text-slate-400">
                    No public Stripe link
                  </span>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-400">
          UNKNOWN until snapshot.offers returns exactly 8 canon offer records.
        </p>
      )}
    </Panel>
  );
}

function KnowledgeLayerPanel({
  records,
  onSelect,
}: {
  records: KnowledgeRecord[];
  onSelect: (id: KnowledgeId) => void;
}) {
  return (
    <Panel title="Knowledge Layer — Cervelle" tone="cyan">
      {records.length >= 3 ? (
        <div className="grid gap-2">
          {records.map((record) => {
            const status = normalizeStatus(record.status);
            return (
              <button
                key={record.id}
                type="button"
                onClick={() => onSelect(record.id)}
                className="rounded-md border border-slate-800 bg-slate-950/75 p-2 text-left text-xs transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{record.truckName}</p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                      {record.id} · {formatRelativeTime(record.lastRunAt)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] ${statusClass[status]}`}>
                    {record.status}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-slate-400">
                  {truncateText(record.lastProof, 80)}
                </p>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-400">
          UNKNOWN until snapshot.knowledge returns Obsidian / Notion / Drive.
        </p>
      )}
    </Panel>
  );
}

function OfferDrawer({ offer, onClose }: { offer: OfferRecord; onClose: () => void }) {
  const status = normalizeOfferStatus(offer.statusCanon);
  const links = offer.stripeLinks.length > 0 ? offer.stripeLinks : [offer.stripeLink];

  return (
    <div className="fixed inset-0 z-50 bg-black/68 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col border-l border-amber-300/20 bg-slate-950/96 shadow-[-20px_0_55px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200">
              Canon offer living record
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">{offer.offerName}</h2>
            <p className="mt-1 text-xs text-slate-400">{offer.offerId}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusClass[status]}`}>
                {offer.statusCanon}
              </span>
              <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                {offer.priceLabel}
              </span>
              <span className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                subs {offer.subsCount === null ? "UNKNOWN" : offer.subsCount}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900/90 p-2 text-slate-300 transition hover:border-amber-300/50 hover:text-white"
            aria-label="Close offer drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {status === "AMBER" ? (
            <div className="mb-4 rounded-md border border-amber-300/35 bg-amber-300/10 p-3 text-xs text-amber-100">
              NEEDS_CONFIRMATION : l’offre reste visible mais pas GREEN tant que le proof Stripe par offre n’est pas confirmé.
            </div>
          ) : null}

          <div className="grid gap-2">
            <InspectorRow label="offer_id" value={offer.offerId} />
            <InspectorRow label="offer_name" value={offer.offerName} />
            <InspectorRow label="price_eur" value={offer.priceEur === null ? "UNKNOWN" : String(offer.priceEur)} />
            <InspectorRow label="billing_period" value={offer.billingPeriod} />
            <InspectorRow label="status_canon" value={offer.statusCanon} />
            <InspectorRow label="subs_count_last_proof" value={offer.subsCountLastProof} />
            <InspectorRow label="public_use_blocked_alias" value={String(offer.publicUseBlockedAlias)} />
            <InspectorRow label="home_house_canon" value={offer.homeHouseCanon} />
            <InspectorRow label="arr_impact" value={offer.arrImpact} />
            <InspectorRow label="next_action" value={offer.nextAction} />
            <InspectorRow label="source_tag" value={offer.sourceTag} />
          </div>

          <section className="mt-4 rounded-md border border-slate-800 bg-slate-950/70 p-3">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
              Stripe links
            </h3>
            <div className="space-y-2">
              {links.map((link) =>
                link.startsWith("https://") ? (
                  <a
                    key={link}
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100 hover:border-cyan-200/60"
                  >
                    {link}
                  </a>
                ) : (
                  <div key={link} className="rounded border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-400">
                    {link || "n/a"}
                  </div>
                ),
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function KnowledgeDrawer({
  record,
  onClose,
}: {
  record: KnowledgeRecord;
  onClose: () => void;
}) {
  const status = normalizeStatus(record.status);

  return (
    <div className="fixed inset-0 z-50 bg-black/68 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col border-l border-cyan-300/20 bg-slate-950/96 shadow-[-20px_0_55px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
              Knowledge truck read-only record
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">{record.truckName}</h2>
            <p className="mt-1 text-xs text-slate-400">{record.truckTaskId}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusClass[status]}`}>
                {record.status}
              </span>
              <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                {formatRelativeTime(record.lastRunAt)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900/90 p-2 text-slate-300 transition hover:border-cyan-300/50 hover:text-white"
            aria-label="Close knowledge drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="mb-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100">
            Lecture seule sanitizée : compteurs, chemins relatifs et preuves techniques seulement. Aucun texte de note, email ou nom client affiché.
          </div>
          <div className="grid gap-2">
            <InspectorRow label="knowledge_id" value={record.id} />
            <InspectorRow label="truck_name" value={record.truckName} />
            <InspectorRow label="status" value={record.status} />
            <InspectorRow label="last_run_at" value={record.lastRunAt ?? "UNKNOWN"} />
            <InspectorRow label="last_proof" value={record.lastProof} />
            <InspectorRow label="source_tag" value={record.sourceTag} />
            <InspectorRow label="source_of_truth" value={record.sourceOfTruth} />
            <InspectorRow label="next_action" value={record.nextAction} />
            <InspectorRow label="proof_required" value={record.proofRequired} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CastleDrawer({
  routes,
  investorRoom,
  onClose,
}: {
  routes: RouteRecord[];
  investorRoom: InvestorRoomSnapshot | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/68 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-[760px] flex-col border-l border-amber-300/25 bg-slate-950/96 shadow-[-20px_0_55px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200">
              100M ARR Castle — route aggregation
            </p>
            <h2 className="mt-1 text-3xl font-black text-white">100M EUR ARR</h2>
            <p className="mt-2 text-sm font-semibold text-amber-100">
              GAP: {formatEur(investorRoom?.gap_eur)} ·{" "}
              {typeof investorRoom?.gap_pct === "number" ? `${investorRoom.gap_pct.toFixed(3)}% remaining` : "UNKNOWN"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Current ARR {formatEur(investorRoom?.current_arr_eur)} · Current MRR {formatEur(investorRoom?.current_mrr_eur)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900/90 p-2 text-slate-300 transition hover:border-amber-300/50 hover:text-white"
            aria-label="Close 100M Castle drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {routes.length === 6 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {routes.map((route) => {
                const status = normalizeStatus(route.status);
                return (
                  <section key={route.id} className="rounded-md border border-slate-800 bg-slate-950/75 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-white">{route.label}</h3>
                        <p className="mt-1 text-[11px] text-slate-500">{route.source}</p>
                      </div>
                      <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold ${statusClass[status]}`}>
                        {route.status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-1 text-[11px]">
                      {Object.entries(route.key_metrics).slice(0, 5).map(([key, value]) => (
                        <div key={key} className="flex gap-2 rounded border border-slate-800 bg-slate-900/70 px-2 py-1">
                          <span className="w-28 shrink-0 uppercase tracking-wide text-slate-500">{key}</span>
                          <span className="min-w-0 break-words text-slate-200">{formatMetricValue(value)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] leading-4 text-slate-400">
                      {truncateText(route.last_proof, 150)}
                    </p>
                    <p className="mt-2 text-[11px] text-amber-100/85">
                      Next: {truncateText(route.next_checkpoint, 120)}
                    </p>
                    <p className="mt-1 text-[11px] text-red-100/75">
                      Gate: {route.gate_required}
                    </p>
                  </section>
                );
              })}
            </div>
          ) : (
            <p className="rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
              AMBER: snapshot.routes ne contient pas encore les 6 routes attendues.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function InvestorRoomDrawer({
  room,
  revenue,
  onClose,
}: {
  room: InvestorRoomSnapshot | null;
  revenue: Snapshot["revenue"] | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/68 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-[720px] flex-col border-l border-cyan-300/20 bg-slate-950/96 shadow-[-20px_0_55px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
              Investor Room — weekly truth
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">Investor accountability</h2>
            <p className="mt-1 text-xs text-slate-400">
              Read-only investor truth. Pas de send. Pas de Stripe write. Pas de promesse gains.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900/90 p-2 text-slate-300 transition hover:border-cyan-300/50 hover:text-white"
            aria-label="Close Investor Room drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <InspectorRow label="current_arr" value={formatEur(room?.current_arr_eur ?? revenue?.currentArrEur)} />
            <InspectorRow label="current_mrr" value={formatEur(room?.current_mrr_eur ?? revenue?.currentMrrEur)} />
            <InspectorRow label="target_arr" value={formatEur(room?.target_arr_eur ?? TARGET_ARR_EUR)} />
            <InspectorRow label="gap" value={formatEur(room?.gap_eur)} />
            <InspectorRow label="past_due" value={formatEur(revenue?.pastDueEur)} />
            <InspectorRow label="broker_lifetime" value={formatUsd(revenue?.brokersLifetimeUsd)} />
            <InspectorRow label="iron_clients" value={formatNumber(revenue?.clientsActive)} />
            <InspectorRow label="vip" value={formatNumber(revenue?.activeVip)} />
          </div>

          <section className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/8 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">Top blockers</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-200">
              {(room?.top_blockers ?? []).length > 0 ? (
                (room?.top_blockers ?? []).map((blocker) => (
                  <li key={blocker} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                    <span>{blocker}</span>
                  </li>
                ))
              ) : (
                <li className="text-slate-500">UNKNOWN: aucun blocker agrégé dans snapshot.investor_room.</li>
              )}
            </ul>
          </section>

          <section className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/8 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Next 7 days tasks</h3>
            <div className="mt-3 space-y-2">
              {(room?.next_7_days_tasks ?? []).length > 0 ? (
                (room?.next_7_days_tasks ?? []).map((task) => (
                  <div key={`${task.title}-${task.due_time}`} className="rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-100">{task.title}</span>
                      <span className={`rounded border px-2 py-0.5 text-[9px] ${statusClass[normalizeStatus(task.status)]}`}>
                        {task.status}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-500">
                      due {task.due_time ?? "UNKNOWN"} · priority {task.priority} · ARR {task.arr_impact}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
                  [] honnête : aucun champ due_within_7d exploitable dans les tasks OpenClaw actuelles.
                </p>
              )}
            </div>
          </section>

          <section className="mt-4 rounded-md border border-slate-800 bg-slate-950/70 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Last proof per route</h3>
            <div className="mt-3 grid gap-2">
              {Object.entries(room?.last_proof_per_route ?? {}).map(([route, proof]) => (
                <InspectorRow key={route} label={route} value={truncateText(proof, 180)} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function HouseDrawer({ house, onClose }: { house: HouseView; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/68 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col border-l border-amber-300/20 bg-slate-950/96 shadow-[-20px_0_55px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200">
              SSOT house living record
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">{house.name}</h2>
            <p className="mt-1 text-xs text-slate-400">{house.id}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusClass[house.status]}`}>
                {house.status}
              </span>
              <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                {house.agents.length} agents
              </span>
              <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                {house.trucks.length} trucks
              </span>
              <span className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                {house.activeTasks} tasks
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900/90 p-2 text-slate-300 transition hover:border-amber-300/50 hover:text-white"
            aria-label="Close house drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <InspectorRow label="owners" value={house.owners.join(", ")} />
            <InspectorRow label="primary_board" value={house.primaryBoardSlug} />
            <InspectorRow label="boards" value={house.boards.map((board) => board.slug).join(", ") || "UNKNOWN"} />
            <InspectorRow label="active_tasks" value={String(house.activeTasks)} />
          </div>

          <div className="mt-4 grid gap-4">
            <section className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                Résidents agents
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {house.agents.length > 0 ? (
                  house.agents.slice(0, 16).map((agent) => (
                    <div key={agent.id} className="rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100">{agent.name}</span>
                        <span className={`rounded border px-2 py-0.5 text-[9px] ${agent.status === "online" || agent.status === "active" ? statusClass.LIVE : statusClass.AMBER}`}>
                          {agent.status}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-slate-500">{agent.role}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">Aucun agent résident prouvé dans le snapshot.</p>
                )}
              </div>
            </section>

            <section className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                Camions garés
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {house.trucks.length > 0 ? (
                  house.trucks.slice(0, 18).map((truck) => (
                    <div key={truck.id} className="rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-slate-100">{truck.truckName ?? truck.title}</span>
                        <span className={`rounded border px-2 py-0.5 text-[9px] ${statusClass[normalizeStatus(truck.truckStatus)]}`}>
                          {truck.truckStatus}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-slate-500">{truck.driverAgent}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">Aucun camion garé prouvé dans le snapshot.</p>
                )}
              </div>
            </section>

            <section className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                Boards / appartements
              </h3>
              <div className="space-y-2">
                {house.buildings.length > 0 ? (
                  house.buildings.map((building) => (
                    <div key={building.id} className="rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100">{building.name}</span>
                        <span className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[9px] text-amber-100">
                          {building.activeTasks} tasks
                        </span>
                      </div>
                      <p className="mt-1 truncate text-slate-500">
                        Proof: {building.proof} · ARR: {building.arrImpact}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">Aucun board actif prouvé dans le snapshot.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function TruckDrawer({
  truck,
  onClose,
  onRefreshStripeProof,
  refreshStatus,
  refreshing,
}: {
  truck: OpenClawTruck;
  onClose: () => void;
  onRefreshStripeProof: () => void;
  refreshStatus: string | null;
  refreshing: boolean;
}) {
  const isStripe = truck.truckName === "StripeTruck";

  return (
    <div className="fixed inset-0 z-50 bg-black/68 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-cyan-300/20 bg-slate-950/96 shadow-[-20px_0_55px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
              Living truck record
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">{truck.truckName ?? truck.title}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusClass[normalizeStatus(truck.truckStatus)]}`}>
                {truck.truckStatus}
              </span>
              <span className="rounded border border-red-300/40 bg-red-400/10 px-2 py-0.5 text-[10px] font-semibold text-red-100">
                {truck.writeLock ? "WRITE LOCKED" : "WRITE UNKNOWN"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900/90 p-2 text-slate-300 transition hover:border-cyan-300/50 hover:text-white"
            aria-label="Close StripeTruck drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="grid gap-2">
            <InspectorRow label="driver_agent" value={truck.driverAgent} />
            <InspectorRow label="destination_board" value={truck.destinationBoard} />
            <InspectorRow label="route" value={truck.route} />
            <InspectorRow label="payload_type" value={truck.payloadType} />
            <InspectorRow label="source_of_truth" value={truck.sourceOfTruth} />
            <InspectorRow label="last_run_at" value={truck.lastRunAt ?? "UNKNOWN"} />
            <InspectorRow label="last_proof" value={truck.lastProof} />
            <InspectorRow label="approval_gate" value={truck.approvalGate} />
            <InspectorRow label="arr_impact" value={truck.arrImpact} />
            <InspectorRow label="risk_level" value={truck.riskLevel} />
            <InspectorRow label="next_action" value={truck.nextAction} />
            <InspectorRow label="failure_mode" value={truck.failureMode || "none"} />
            <InspectorRow label="owner" value={truck.owner} />
          </div>
        </div>

        <div className="border-t border-slate-800 px-5 py-4 space-y-3">
          {isStripe ? (
            <button
              type="button"
              onClick={onRefreshStripeProof}
              disabled={refreshing}
              className="w-full rounded-md border border-amber-300/45 bg-amber-300/12 px-4 py-3 text-sm font-bold uppercase tracking-wide text-amber-100 transition hover:bg-amber-300/18 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {refreshing ? "Refreshing Stripe proof" : "Refresh Stripe proof from Hub Iron"}
            </button>
          ) : (
            <div className="rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs text-slate-400">
              Proof refresh réservé à StripeTruck en Phase 2.
            </div>
          )}
          {/* P12 Al-Mahdī · Mission Composer câblé · Bismillāh 2026-05-26T10:10Z */}
          <button
            type="button"
            onClick={async () => {
              const missionText = window.prompt(
                `Donner mission à ${truck.truckName} (DRAFT ONLY — compliance gates enforced)\n\nExemples :\n• Recover past_due 194€ Lajungle COF-104\n• Reclaim broker_account 1234 vers CellXpert\n• Render video-02 anti-faux-gourou 90s`,
                "",
              );
              if (!missionText || !missionText.trim()) return;
              const levierRoi = window.prompt(
                "Levier ROI (L1=CofiaPublisher · L2=Diamond · L3=Brokers · L4=B2B · L0=indirect)",
                "L0_indirect",
              ) ?? "L0_indirect";
              const arrImpactRaw = window.prompt("ARR impact mensuel estimé (EUR, nombre)", "0");
              const arrImpact = Number.parseFloat(arrImpactRaw ?? "0") || 0;
              try {
                const response = await fetch("/api/cofiatrading-world-control/mission-composer", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  cache: "no-store",
                  body: JSON.stringify({
                    truck_name: truck.truckName ?? truck.title,
                    mission_text: missionText.trim(),
                    levier_roi: levierRoi,
                    arr_impact_eur: arrImpact,
                    lock_policy: "DRAFT_ONLY",
                  }),
                });
                const data = await response.json();
                if (data.ok) {
                  alert(
                    `Alhamdulillah · Mission canon créée\n\n${data.message ?? ""}\n\nMission ID: ${data.missionId}\nTask ID: ${data.taskId ?? "PENDING"}`,
                  );
                } else {
                  alert(
                    `Astaghfirullah · Mission rejetée\n\nErreur: ${data.error}\n${data.violations ? "Violations: " + JSON.stringify(data.violations) : ""}\n${data.iblis_detected ?? ""}\n${data.message ?? ""}`,
                  );
                }
              } catch (e) {
                alert(`Astaghfirullah · Network error: ${e instanceof Error ? e.message : "unknown"}`);
              }
            }}
            className="w-full rounded-md border border-cyan-300/45 bg-cyan-300/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/18"
          >
            🕌 Donner mission (Al-Mahdī DRAFT ONLY)
          </button>
          {refreshStatus ? (
            <p className="mt-3 rounded-md border border-slate-800 bg-slate-900/70 p-2 text-xs text-slate-300">
              {refreshStatus}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-slate-100">{value || "UNKNOWN"}</p>
    </div>
  );
}

function Guardian({ name, role }: { name: string; role: string }) {
  return (
    <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-200/30 bg-slate-950 text-cyan-100">
        <ShieldCheck className="h-5 w-5" />
      </div>
      <p className="font-semibold text-white">{name}</p>
      <p className="text-[11px] text-slate-400">{role}</p>
    </div>
  );
}

// ============================================================
// CORAN V8 Sourate LVI · Angel Roster Manāzil al-Malā'ikah
// 38 Anges canon (cap §45) avec plateforme assignée + statut runtime
// source_tag: CORAN_V8_ANGEL_ROSTER_RUNTIME_SYNC_20260526T1130Z
// ============================================================

type Angel = {
  id: number;
  name: string;
  name_ar: string;
  platform: string;
  manzilah: string;
  status: "LIVE" | "OPERATIONAL_PARTIAL" | "CANON_GATE" | "AWAITING_SETUP" | "DEGRADED" | "BROKEN";
  mission: string;
  stack?: string;
  proof_url?: string;
  arr_impact_eur_year?: number;
};

type AngelRosterPayload = {
  source_tag: string;
  total_anges: number;
  counts: { live: number; operational_partial: number; canon_gate: number; awaiting_setup: number; degraded: number; broken: number };
  arr_impact_total_eur_year: number;
  canon_sourate: string;
  runtime_ts: string;
  anges: Angel[];
};

// CORAN V9 Sourate LXI · Sidq al-Mutlaq honest-by-design 6 statuts
// "Dieu ne ment jamais" : green LIVE, cyan OPERATIONAL/CANON_GATE, slate AWAITING, amber DEGRADED, red BROKEN (refus de cacher)
function AngelRosterPanel({ roster }: { roster: AngelRosterPayload | null }) {
  if (!roster) return null;
  const statusStyle: Record<Angel["status"], string> = {
    LIVE: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    OPERATIONAL_PARTIAL: "border-cyan-400/35 bg-cyan-400/10 text-cyan-200",
    CANON_GATE: "border-cyan-300/30 bg-cyan-300/5 text-cyan-100",
    AWAITING_SETUP: "border-slate-400/30 bg-slate-400/5 text-slate-300",
    DEGRADED: "border-amber-400/50 bg-amber-400/10 text-amber-200",
    BROKEN: "border-red-500/60 bg-red-500/10 text-red-200",
  };
  const statusLabel: Record<Angel["status"], string> = {
    LIVE: "LIVE",
    OPERATIONAL_PARTIAL: "OPERATIONAL",
    CANON_GATE: "CANON GATE",
    AWAITING_SETUP: "AWAITING",
    DEGRADED: "DEGRADED",
    BROKEN: "BROKEN",
  };
  return (
    <section className="mt-6 rounded-md border border-amber-300/30 bg-slate-950/80 p-5 shadow-[0_0_40px_rgba(245,158,11,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
            🕌 ANGEL ROSTER · Manāzil al-Malā'ikah · Honest-by-design Sidq
          </p>
          <h2 className="mt-1 font-heading text-xl font-semibold leading-tight text-white">
            38 Anges canon — chaque ange à sa place sur sa plateforme
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">
            Sync runtime ↔ CORAN V9 Sourate LVI + LXI · cap §45 strict · {roster.runtime_ts.slice(11, 19)}Z
          </p>
        </div>
        <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wide flex-wrap">
          <span className="rounded border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-emerald-200">
            LIVE {roster.counts.live}
          </span>
          <span className="rounded border border-cyan-400/35 bg-cyan-400/10 px-2 py-1 text-cyan-200">
            OPERATIONAL {roster.counts.operational_partial}
          </span>
          <span className="rounded border border-cyan-300/30 bg-cyan-300/5 px-2 py-1 text-cyan-100">
            CANON GATE {roster.counts.canon_gate}
          </span>
          <span className="rounded border border-slate-400/30 bg-slate-400/5 px-2 py-1 text-slate-300">
            AWAITING {roster.counts.awaiting_setup}
          </span>
          <span className="rounded border border-amber-400/50 bg-amber-400/10 px-2 py-1 text-amber-200">
            DEGRADED {roster.counts.degraded}
          </span>
          <span className="rounded border border-red-500/60 bg-red-500/10 px-2 py-1 text-red-200">
            BROKEN {roster.counts.broken}
          </span>
          {roster.arr_impact_total_eur_year !== 0 && (
            <span className="rounded border border-red-500/60 bg-red-500/15 px-2 py-1 text-red-200">
              ARR loss: {roster.arr_impact_total_eur_year.toLocaleString("fr-FR")} €/an
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {roster.anges.map((angel) => (
          <div
            key={angel.id}
            className={`rounded-md border p-3 ${statusStyle[angel.status]}`}
            title={`${angel.manzilah} · ${angel.mission}${angel.stack ? ` · ${angel.stack}` : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">
                  <span className="text-amber-300">#{angel.id.toString().padStart(2, "0")}</span>{" "}
                  {angel.name}{" "}
                  <span className="text-amber-200/70 text-[10px] italic">{angel.name_ar}</span>
                </p>
                <p className="mt-1 truncate text-[11px] text-cyan-300">→ {angel.platform}</p>
              </div>
              <span className="rounded border border-current/40 bg-slate-950/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                {statusLabel[angel.status]}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-[10.5px] text-slate-300 leading-snug">
              {angel.mission}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] text-slate-500">
        source_tag: <code className="text-cyan-300">{roster.source_tag}</code>
      </p>
    </section>
  );
}
