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
  Settings,
  ShieldCheck,
  Truck,
  Users,
  X,
} from "lucide-react";

import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { WorldMapLiving, type CofiaSnapshot } from "./WorldMapLiving";

type AssetsWarehouseSnapshot = {
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

type CofiaAgent = NonNullable<Snapshot["agentsCanon"]>["agents"][number];

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

type HouseWorkforceStatus = "LIVE" | "ACTION" | "BACKSTAGE" | "RISK";

type HouseWorkforce = {
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

type WorldNode = {
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

type WorldAgent = {
  name: string;
  from: HouseId;
  to: HouseId;
  mission: string;
  payload: string;
  color: string;
  duration: number;
  delay: number;
};

type WorldTruck = {
  label: string;
  route: HouseId[];
  status: "urgent" | "blocked" | "live" | "build";
  duration: number;
  delay: number;
};

type CityDistrict = {
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

type CityRoute = {
  id: string;
  points: HouseId[];
  label: string;
  tone: "cyan" | "emerald" | "amber" | "rose";
};

type MovingAgent = {
  name: string;
  from: HouseId;
  to: HouseId;
  mission: string;
  payload: string;
  color: string;
  duration: number;
  delay: number;
};

type MovingTruck = {
  name: string;
  points: HouseId[];
  payload: string;
  tone: "cyan" | "emerald" | "amber" | "rose";
  duration: number;
  delay: number;
};

type RailStep = {
  label: string;
  value: string;
  tone?: "cyan" | "emerald" | "amber" | "rose";
};

type CityMachine = {
  label: string;
  district: HouseId;
  tone: "cyan" | "emerald" | "amber" | "rose" | "slate";
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

const formatCityEur = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${moneyFormatter.format(value)} EUR`
    : "source down";

const formatCityNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? moneyFormatter.format(value)
    : "source down";

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

// Attribution canonique service -> maison (sûre uniquement ; les non listés ne s'affichent dans aucune maison)
const SERVICE_HOUSE: Partial<Record<string, HouseId>> = {
  hub_8430: "mission_control_tower",
  mission_control_3000: "mission_control_tower",
  central_brain_8767: "central_brain",
  llm_proxy_11435: "central_brain",
  cofiapublisher_8540: "youtube_studio",
  inventory_8433: "assets_warehouse",
  lightrag_9621: "lightrag_observatory",
  paperclip_3100: "paperclip_factory",
};

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

const HOUSE_WORKFORCE: Record<HouseId, HouseWorkforce> = {
  mission_control_tower: {
    businessName: "Mission Control Tower",
    owner: "Codex / Atlas",
    workers: ["Codex", "Atlas", "Luffy", "Guardian"],
    mission: "Piloter le cockpit, preuves, décisions Erwin.",
    nextAction: "Stabiliser first screen et proof ledger.",
    impact: "pilotage",
    blocker: "dirty state + hook auto-commit",
    proof: "Mapping organisationnel T4C + runtime snapshot si disponible.",
    badge: "LIVE",
    tone: "LIVE",
  },
  youtube_studio: {
    businessName: "YouTube Studio",
    owner: "Nova / Isrāfīl",
    workers: ["Nova", "Isrāfīl", "Sonic", "Sonic-X", "Malik al-Insta", "Luna", "Brand Manager", "Reviewer"],
    mission: "Publier video-01 puis cadence YouTube / IG / TikTok / X.",
    nextAction: "OAuth YouTube + Reviewer GREEN + publish video-01.",
    impact: "acquisition",
    blocker: "OAuth expiré + 0 vidéo publiée",
    proof: "assetsWarehouse + publisher + reviewer proof attendu.",
    badge: "ACTION",
    tone: "AMBER",
  },
  iron_office: {
    businessName: "Iron Office",
    owner: "Iron / Mikā'īl / Jack",
    workers: ["Iron", "Mikā'īl", "Jack", "David", "Antho", "'Izrā'īl"],
    mission: "Récupérer cash, past_due, brokers, commissions.",
    nextAction: "Relancer Jérôme + Albina + Jérémy et broker drafts.",
    impact: "cash immédiat",
    blocker: "past_due 291 + IP broker + drafts non envoyés",
    proof: "Stripe aggregate + broker proof source attendus.",
    badge: "ACTION",
    tone: "AMBER",
  },
  vip_gate: {
    businessName: "VIP Gate",
    owner: "Mikā'īl / Ridwān",
    workers: ["Mikā'īl", "Ridwān", "David", "Antho", "Marco"],
    mission: "Checkout, welcome flow, Telegram VIP, rétention.",
    nextAction: "Tester onboarding Stripe → Telegram VIP → WhatsApp.",
    impact: "MRR / retention",
    blocker: "WhatsApp template pending + welcome flow à prouver",
    proof: "Stripe VIP + onboarding proof attendu.",
    badge: "ACTION",
    tone: "AMBER",
  },
  mt4_signal_tower: {
    businessName: "MT4 Signal Tower",
    owner: "Marco / Risk / Quant",
    workers: ["Marco", "Risk", "Quant", "MiroFish", "Quant-TV", "Sonic"],
    mission: "Trading réel, signaux, copy trading, preuves Rithmic.",
    nextAction: "Afficher dernier signal + Mirror PM000697 + Rithmic proof.",
    impact: "confiance / produit",
    blocker: "PnL runtime non exposé",
    proof: "Rithmic / MT4 / FXcess Mirror proof attendu.",
    badge: "ACTION",
    tone: "AMBER",
  },
  site_seo_lab: {
    businessName: "Site SEO Lab",
    owner: "Atlas / Paul MKT / Antho",
    workers: ["Atlas", "Paul MKT", "Paul Réseau", "Antho", "Reddit Angel", "Sentinel", "Brand Manager"],
    mission: "Site, landing, SEO, B2B, pages brokers.",
    nextAction: "Auditer pages et créer page B2B / brokers claire.",
    impact: "funnel / leads",
    blocker: "tracking et pages business incomplètes",
    proof: "Site audit + tracking proof attendus.",
    badge: "ACTION",
    tone: "AMBER",
  },
  openclaw_agent_barracks: {
    businessName: "OpenClaw Agent Barracks",
    owner: "Jarod / Codex",
    workers: ["Jarod", "Guardian", "Steward", "Sentinel", "Reviewer"],
    mission: "Orchestrer 38 anges et 59 camions.",
    nextAction: "Câbler agents/trucks runtime après T4C.",
    impact: "exécution",
    blocker: "agents/trucks backend non connectés au premier écran",
    proof: "Runtime roster plus bas + mapping organisationnel affiché ici.",
    badge: "BACKSTAGE",
    tone: "PAUSED",
  },
  paperclip_factory: {
    businessName: "Paperclip Factory",
    owner: "Sentinel / Lab",
    workers: ["Sentinel", "Lab", "Steward", "Brand Manager"],
    mission: "Automatisations, n8n, launch agents, assets pipeline.",
    nextAction: "Diagnostiquer Paperclip :3100 et workflows n8n.",
    impact: "vitesse opérationnelle",
    blocker: "Paperclip down",
    proof: "Service probe + workflow proof attendu.",
    badge: "BACKSTAGE",
    tone: "PAUSED",
  },
  lightrag_observatory: {
    businessName: "LightRAG Observatory",
    owner: "Lab / Quant",
    workers: ["Lab", "Quant", "Oracle", "Stratège", "Guardian"],
    mission: "Research, LightRAG, knowledge graph, Databento.",
    nextAction: "Corriger probe LightRAG et produire research utile.",
    impact: "qualité décision",
    blocker: "LightRAG probe 404 / Lobster non prouvé",
    proof: "LightRAG probe + research output attendus.",
    badge: "BACKSTAGE",
    tone: "PAUSED",
  },
  obsidian_library: {
    businessName: "Obsidian Library",
    owner: "Steward / Guardian",
    workers: ["Steward", "Guardian", "Reviewer", "Antho"],
    mission: "Mémoire, docs, Notion, Linear, Drive.",
    nextAction: "Réduire doublons et mapper Linear aux maisons.",
    impact: "qualité / mémoire",
    blocker: "sync Notion/Linear non visible",
    proof: "Knowledge sync proof attendu, sans ouvrir Obsidian ici.",
    badge: "BACKSTAGE",
    tone: "PAUSED",
  },
  calendar_tower: {
    businessName: "Calendar Tower",
    owner: "Calendar / Kevin",
    workers: ["Calendar", "Kevin", "Antho"],
    mission: "Rythme, 1on1, calendar, voix.",
    nextAction: "Afficher prochains events et 1on1.",
    impact: "discipline",
    blocker: "calendar non câblé au hub",
    proof: "Calendar aggregate proof attendu.",
    badge: "ACTION",
    tone: "AMBER",
  },
  compliance_port: {
    businessName: "Compliance Port",
    owner: "Juriste / Fiscal / Reviewer",
    workers: ["Juriste", "Fiscal", "Reviewer", "Munkar", "Nakīr", "Mālik", "Sentinel"],
    mission: "ESMA, AEPD, CNMV, disclaimers, no fake green.",
    nextAction: "Afficher warnings compliance et pages legal.",
    impact: "risque",
    blocker: "legal pages non visibles",
    proof: "Compliance page proof attendu.",
    badge: "RISK",
    tone: "QUARANTINE",
  },
  central_brain: {
    businessName: "Central Brain",
    owner: "Codex / Guardian",
    workers: ["Codex", "Guardian", "Steward", "Sentinel", "Jibrīl"],
    mission: "Registry 15 maisons, cross-IA, routing.",
    nextAction: "Relier cross-IA status au cockpit.",
    impact: "cohérence",
    blocker: "cross-IA non visible",
    proof: "Registry + snapshot sourceTag.",
    badge: "LIVE",
    tone: "LIVE",
  },
  trading_academy: {
    businessName: "Trading Academy",
    owner: "Quant / Marco / Stratège",
    workers: ["Quant", "Marco", "Stratège", "Antho", "Reviewer", "Brand Manager"],
    mission: "Academy, modules STRAT, Kelly, order flow.",
    nextAction: "Publier 4 modules et page Academy claire.",
    impact: "upsell / rétention",
    blocker: "curriculum incomplet",
    proof: "Academy modules + page proof attendus.",
    badge: "ACTION",
    tone: "AMBER",
  },
  assets_warehouse: {
    businessName: "Assets Warehouse",
    owner: "Lab / Brand Manager",
    workers: ["Lab", "Brand Manager", "Nova", "Steward", "Sentinel"],
    mission: "94 MP4, 51 captions, 193 assets utilisables.",
    nextAction: "Transformer assets en posts, vidéos, pages.",
    impact: "acquisition",
    blocker: "assets visibles mais pas encore consommés",
    proof: "assetsWarehouse snapshot + publisher output.",
    badge: "LIVE",
    tone: "LIVE",
  },
};

const WORLD_NODES: WorldNode[] = [
  { id: "mission_control_tower", label: "Mission Control", zone: "command", x: 50, y: 14, icon: "MC", owner: "Codex / Atlas", mission: "Commander le monde COF", status: "LIVE", assetKey: "sprite temporaire building" },
  { id: "central_brain", label: "Central Brain", zone: "command", x: 38, y: 18, icon: "CB", owner: "Codex / Guardian", mission: "Registry + routing", status: "LIVE", assetKey: "sprite temporaire building" },
  { id: "compliance_port", label: "Compliance Port", zone: "risk", x: 62, y: 18, icon: "CP", owner: "Juriste / Reviewer", mission: "Reviewer + legal gate", status: "QUARANTINE", assetKey: "sprite temporaire building" },
  { id: "mt4_signal_tower", label: "Trading Tower", zone: "trading", x: 22, y: 38, icon: "TT", owner: "Marco / Risk", mission: "Signal + proof", status: "AMBER", assetKey: "sprite temporaire tower" },
  { id: "lightrag_observatory", label: "LightRAG", zone: "research", x: 18, y: 62, icon: "LR", owner: "Lab / Quant", mission: "Research utile", status: "PAUSED", assetKey: "sprite temporaire observatory" },
  { id: "youtube_studio", label: "YouTube Studio", zone: "production", x: 50, y: 38, icon: "YT", owner: "Nova / Isrāfīl", mission: "Publier video-01", status: "AMBER", assetKey: "MP4/captions Remotion listed" },
  { id: "site_seo_lab", label: "Site SEO Lab", zone: "funnel", x: 50, y: 66, icon: "SEO", owner: "Atlas / Paul MKT", mission: "Site + leads", status: "AMBER", assetKey: "sprite temporaire lab" },
  { id: "assets_warehouse", label: "Assets Warehouse", zone: "factory", x: 42, y: 82, icon: "AW", owner: "Lab / Brand", mission: "193 assets -> posts", status: "LIVE", assetKey: "94 MP4 / 51 captions / 193 assets" },
  { id: "iron_office", label: "Iron Office", zone: "cash", x: 76, y: 36, icon: "IR", owner: "Iron / Jack", mission: "Cash + brokers", status: "AMBER", assetKey: "broker proof listed" },
  { id: "vip_gate", label: "VIP Gate", zone: "clients", x: 76, y: 55, icon: "VIP", owner: "Mikā'īl / Ridwān", mission: "VIP + retention", status: "AMBER", assetKey: "sprite temporaire gate" },
  { id: "trading_academy", label: "Trading Academy", zone: "clients", x: 72, y: 78, icon: "TA", owner: "Quant / Marco", mission: "Upsell + modules", status: "AMBER", assetKey: "sprite temporaire academy" },
  { id: "openclaw_agent_barracks", label: "OpenClaw Barracks", zone: "ops", x: 12, y: 78, icon: "OC", owner: "Jarod / Codex", mission: "38 anges / 59 camions", status: "PAUSED", assetKey: "sprite temporaire barracks" },
  { id: "paperclip_factory", label: "Paperclip Factory", zone: "ops", x: 30, y: 82, icon: "PF", owner: "Sentinel / Lab", mission: "Automations", status: "PAUSED", assetKey: "sprite temporaire machine" },
  { id: "obsidian_library", label: "Knowledge Vault", zone: "knowledge", x: 58, y: 82, icon: "KV", owner: "Steward / Guardian", mission: "Mémoire canon", status: "PAUSED", assetKey: "sprite temporaire vault" },
  { id: "calendar_tower", label: "Calendar Tower", zone: "ops", x: 86, y: 76, icon: "CA", owner: "Calendar / Kevin", mission: "Rythme", status: "AMBER", assetKey: "sprite temporaire tower" },
];

const WORLD_AGENTS: WorldAgent[] = [
  { name: "Nova", from: "assets_warehouse", to: "youtube_studio", mission: "prépare video-01", payload: "MP4", color: "#67e8f9", duration: 13, delay: 0 },
  { name: "Isrāfīl", from: "youtube_studio", to: "site_seo_lab", mission: "publish / cross-post", payload: "vidéo", color: "#fbbf24", duration: 15, delay: -2 },
  { name: "Sonic", from: "youtube_studio", to: "vip_gate", mission: "short / Telegram broadcast", payload: "contenu", color: "#60a5fa", duration: 12, delay: -4 },
  { name: "Iron", from: "iron_office", to: "vip_gate", mission: "past_due recovery", payload: "291 EUR", color: "#fb7185", duration: 11, delay: -1 },
  { name: "Mikā'īl", from: "iron_office", to: "vip_gate", mission: "Stripe / Customer Portal", payload: "paiement", color: "#34d399", duration: 17, delay: -6 },
  { name: "Jack", from: "iron_office", to: "site_seo_lab", mission: "brokers reclaim", payload: "CellXpert", color: "#f97316", duration: 19, delay: -5 },
  { name: "David", from: "vip_gate", to: "iron_office", mission: "support / DM peer_context", payload: "client", color: "#a78bfa", duration: 14, delay: -3 },
  { name: "Marco", from: "mt4_signal_tower", to: "vip_gate", mission: "signal VIP", payload: "signal", color: "#22c55e", duration: 10, delay: -7 },
  { name: "Risk", from: "mt4_signal_tower", to: "compliance_port", mission: "risk gate", payload: "validation", color: "#f43f5e", duration: 18, delay: -9 },
  { name: "Atlas", from: "site_seo_lab", to: "mission_control_tower", mission: "site / Vercel / hub", payload: "deploy status", color: "#38bdf8", duration: 16, delay: -8 },
  { name: "Reviewer", from: "compliance_port", to: "youtube_studio", mission: "Reviewer GREEN", payload: "compliance", color: "#fde68a", duration: 20, delay: -10 },
  { name: "Jarod", from: "openclaw_agent_barracks", to: "mission_control_tower", mission: "dispatch OpenClaw", payload: "order", color: "#c084fc", duration: 21, delay: -11 },
];

const WORLD_TRUCKS: WorldTruck[] = [
  { label: "Past_due truck · 291 EUR / 3 clients", route: ["iron_office", "vip_gate"], status: "urgent", duration: 10, delay: 0 },
  { label: "Video truck · video-01", route: ["assets_warehouse", "youtube_studio"], status: "urgent", duration: 12, delay: -3 },
  { label: "Broker reclaim truck · brokers IP / drafts", route: ["iron_office", "site_seo_lab"], status: "blocked", duration: 16, delay: -5 },
  { label: "Signal truck · signal VIP", route: ["mt4_signal_tower", "vip_gate"], status: "live", duration: 9, delay: -2 },
  { label: "Funnel truck · socials -> site -> VIP", route: ["youtube_studio", "site_seo_lab", "vip_gate"], status: "build", duration: 18, delay: -7 },
  { label: "Compliance patrol · reviewer / legal", route: ["compliance_port", "youtube_studio", "site_seo_lab"], status: "live", duration: 20, delay: -9 },
  { label: "Memory sync truck · memory / canon", route: ["obsidian_library", "central_brain", "mission_control_tower"], status: "build", duration: 22, delay: -12 },
];

const CITY_DISTRICTS: CityDistrict[] = [
  {
    id: "mission_control_tower",
    title: "Command Castle",
    subtitle: "Mission Control",
    x: 40,
    y: 3,
    width: 18,
    height: 16,
    visual: "castle",
    accent: "#67e8f9",
    glow: "rgba(103,232,249,.42)",
    workers: ["Codex", "Atlas", "Luffy", "Guardian"],
    machines: ["Proof", "Orders", "HUD"],
    role: "Commander le monde",
    next: "Décision Erwin -> dispatch",
    blocker: "aucun fake GREEN",
    metric: "owner: Erwin",
  },
  {
    id: "central_brain",
    title: "Central Brain",
    subtitle: "Registry / cross-IA",
    x: 2,
    y: 3,
    width: 14,
    height: 12,
    visual: "tower",
    accent: "#22d3ee",
    glow: "rgba(34,211,238,.34)",
    workers: ["Codex", "Guardian", "Steward", "Jibrīl"],
    machines: ["Registry", "Routes", "Canon"],
    role: "Routes + mémoire",
    next: "Relier statuts cross-IA",
    blocker: "runtime partiel",
  },
  {
    id: "iron_office",
    title: "Revenue Command",
    subtitle: "Iron Office",
    x: 21,
    y: 36,
    width: 18,
    height: 15,
    visual: "tower",
    accent: "#f97316",
    glow: "rgba(249,115,22,.42)",
    workers: ["Iron", "Mikā'īl", "Jack", "David", "Antho"],
    machines: ["Stripe", "CellXpert", "Gmail", "WhatsApp"],
    role: "Cash / past_due / brokers",
    next: "Relances + broker drafts",
    blocker: "291 EUR / 3 clients",
    metric: "brokers 2.38M USD",
  },
  {
    id: "vip_gate",
    title: "VIP Gate",
    subtitle: "Clients / onboarding",
    x: 40,
    y: 36,
    width: 15,
    height: 13,
    visual: "gate",
    accent: "#34d399",
    glow: "rgba(52,211,153,.38)",
    workers: ["Ridwān", "Mikā'īl", "David", "Antho", "Marco"],
    machines: ["Stripe checkout", "Telegram VIP", "Resend"],
    role: "Conversion + rétention",
    next: "Tester welcome flow",
    blocker: "WhatsApp template pending",
    metric: "VIP 7",
  },
  {
    id: "mt4_signal_tower",
    title: "Trading Tower",
    subtitle: "Signal / copy trading",
    x: 2,
    y: 36,
    width: 16,
    height: 16,
    visual: "tower",
    accent: "#a78bfa",
    glow: "rgba(167,139,250,.42)",
    workers: ["Marco", "Risk", "Quant", "MiroFish", "Quant-TV"],
    machines: ["Rithmic", "MT4", "MT5", "FXcess"],
    role: "Signal VIP + risk gate",
    next: "Afficher dernier signal",
    blocker: "PnL source à connecter",
    metric: "PM000697",
  },
  {
    id: "youtube_studio",
    title: "CofiaPublisher",
    subtitle: "YouTube Studio",
    x: 21,
    y: 69,
    width: 16,
    height: 14,
    visual: "factory",
    accent: "#fbbf24",
    glow: "rgba(251,191,36,.38)",
    workers: ["Nova", "Isrāfīl", "Sonic", "Reviewer", "Brand"],
    machines: ["CofiaPublisher", "YouTube OAuth", "n8n", "Hedra"],
    role: "Publier video-01",
    next: "MP4 -> Reviewer -> publish",
    blocker: "OAuth YouTube blocked",
    metric: "94 MP4",
  },
  {
    id: "site_seo_lab",
    title: "Site SEO Lab",
    subtitle: "Traffic -> leads",
    x: 59,
    y: 69,
    width: 15,
    height: 12,
    visual: "lab",
    accent: "#38bdf8",
    glow: "rgba(56,189,248,.34)",
    workers: ["Atlas", "Paul MKT", "Paul Réseau", "Antho", "Reddit"],
    machines: ["Vercel", "Supabase", "SEO", "LinkedIn"],
    role: "Traffic -> leads",
    next: "Page B2B / brokers",
    blocker: "tracking incomplet",
  },
  {
    id: "assets_warehouse",
    title: "Asset Factory",
    subtitle: "Assets Warehouse",
    x: 40,
    y: 69,
    width: 18,
    height: 14,
    visual: "factory",
    accent: "#2dd4bf",
    glow: "rgba(45,212,191,.38)",
    workers: ["Lab", "Brand Manager", "Nova", "Steward"],
    machines: ["94 MP4", "51 captions", "193 assets"],
    role: "Nourrir la production",
    next: "Assets -> posts / vidéos",
    blocker: "stock pas encore consommé",
    metric: "193 assets",
  },
  {
    id: "paperclip_factory",
    title: "Paperclip Factory",
    subtitle: "Automation line",
    x: 78,
    y: 69,
    width: 13,
    height: 11,
    visual: "factory",
    accent: "#94a3b8",
    glow: "rgba(148,163,184,.28)",
    workers: ["Sentinel", "Lab", "Steward"],
    machines: ["n8n", "LaunchAgents", "Paperclip"],
    role: "Automations",
    next: "Diagnostiquer :3100",
    blocker: "Paperclip down",
  },
  {
    id: "openclaw_agent_barracks",
    title: "OpenClaw Barracks",
    subtitle: "AgentOps",
    x: 59,
    y: 3,
    width: 17,
    height: 14,
    visual: "barracks",
    accent: "#c084fc",
    glow: "rgba(192,132,252,.4)",
    workers: ["Jarod", "Codex", "Sentinel", "Guardian", "Reviewer"],
    machines: ["38 angels", "59 trucks", "RTK"],
    role: "Dispatch agents",
    next: "Ordres -> Mission Control",
    blocker: "runtime camion à connecter",
    metric: "38 / 59",
  },
  {
    id: "lightrag_observatory",
    title: "LightRAG Observatory",
    subtitle: "Research",
    x: 2,
    y: 69,
    width: 13,
    height: 12,
    visual: "tower",
    accent: "#60a5fa",
    glow: "rgba(96,165,250,.32)",
    workers: ["Oracle", "Lab", "Quant", "Guardian"],
    machines: ["LightRAG", "Databento", "Lobster", "NotebookLM"],
    role: "Research utile",
    next: "Corriger probe",
    blocker: "source research partielle",
  },
  {
    id: "obsidian_library",
    title: "Knowledge Vault",
    subtitle: "Memory",
    x: 21,
    y: 3,
    width: 14,
    height: 11,
    visual: "vault",
    accent: "#64748b",
    glow: "rgba(100,116,139,.28)",
    workers: ["Steward", "Guardian", "Reviewer", "Antho"],
    machines: ["Obsidian", "Notion", "Linear", "Drive"],
    role: "Mémoire canon",
    next: "Mapper doublons",
    blocker: "sync non visible",
  },
  {
    id: "calendar_tower",
    title: "Calendar Tower",
    subtitle: "Rhythm",
    x: 78,
    y: 3,
    width: 13,
    height: 11,
    visual: "tower",
    accent: "#f59e0b",
    glow: "rgba(245,158,11,.32)",
    workers: ["Calendar", "Kevin", "Antho"],
    machines: ["Google Calendar", "Wispr Flow"],
    role: "Rythme",
    next: "Afficher prochains events",
    blocker: "calendar non câblé",
  },
  {
    id: "compliance_port",
    title: "Proof Ledger Port",
    subtitle: "Compliance",
    x: 78,
    y: 36,
    width: 15,
    height: 12,
    visual: "port",
    accent: "#fb7185",
    glow: "rgba(251,113,133,.38)",
    workers: ["Juriste", "Fiscal", "Reviewer", "Munkar", "Nakīr", "Mālik"],
    machines: ["Mu'taqib", "Legal", "Disclaimers"],
    role: "Risk gate",
    next: "Warnings compliance",
    blocker: "legal pages à prouver",
  },
  {
    id: "trading_academy",
    title: "Trading Academy",
    subtitle: "Product New York",
    x: 59,
    y: 36,
    width: 15,
    height: 12,
    visual: "castle",
    accent: "#eab308",
    glow: "rgba(234,179,8,.34)",
    workers: ["Quant", "Marco", "Stratège", "Antho", "Reviewer"],
    machines: ["Academy", "Kelly", "STRAT"],
    role: "Education / upsell",
    next: "4 modules + page Academy",
    blocker: "curriculum incomplet",
  },
];

const CITY_ROUTES: CityRoute[] = [
  { id: "assets-youtube", points: ["assets_warehouse", "youtube_studio"], label: "Assets -> CofiaPublisher", tone: "cyan" },
  { id: "youtube-site", points: ["youtube_studio", "site_seo_lab"], label: "YouTube -> Site", tone: "cyan" },
  { id: "site-vip", points: ["site_seo_lab", "vip_gate"], label: "Leads -> VIP", tone: "emerald" },
  { id: "iron-vip", points: ["iron_office", "vip_gate"], label: "Cash -> VIP", tone: "amber" },
  { id: "iron-site", points: ["iron_office", "site_seo_lab"], label: "Brokers -> Site", tone: "amber" },
  { id: "trading-vip", points: ["mt4_signal_tower", "vip_gate"], label: "Signal -> VIP", tone: "emerald" },
  { id: "compliance-youtube", points: ["compliance_port", "youtube_studio"], label: "Reviewer -> Publisher", tone: "rose" },
  { id: "compliance-site", points: ["compliance_port", "site_seo_lab"], label: "Legal -> Site", tone: "rose" },
  { id: "openclaw-command", points: ["openclaw_agent_barracks", "mission_control_tower"], label: "OpenClaw -> Mission Control", tone: "cyan" },
  { id: "knowledge-brain", points: ["obsidian_library", "central_brain"], label: "Knowledge -> Central Brain", tone: "cyan" },
  { id: "brain-command", points: ["central_brain", "mission_control_tower"], label: "Central Brain -> Command", tone: "cyan" },
  { id: "calendar-command", points: ["calendar_tower", "mission_control_tower"], label: "Calendar -> Command", tone: "amber" },
];

const MOVING_AGENTS: MovingAgent[] = [
  { name: "Nova", from: "assets_warehouse", to: "youtube_studio", mission: "prépare video-01", payload: "MP4", color: "#67e8f9", duration: 12, delay: 0 },
  { name: "Isrāfīl", from: "youtube_studio", to: "site_seo_lab", mission: "publish / cross-post", payload: "vidéo", color: "#fbbf24", duration: 13, delay: -2 },
  { name: "Sonic", from: "youtube_studio", to: "vip_gate", mission: "short / Telegram", payload: "contenu", color: "#60a5fa", duration: 14, delay: -3 },
  { name: "Reviewer", from: "compliance_port", to: "youtube_studio", mission: "Reviewer GREEN", payload: "legal", color: "#fde68a", duration: 17, delay: -4 },
  { name: "Iron", from: "iron_office", to: "vip_gate", mission: "past_due recovery", payload: "291 EUR", color: "#fb7185", duration: 11, delay: -1 },
  { name: "Mikā'īl", from: "iron_office", to: "vip_gate", mission: "Stripe portal", payload: "pay", color: "#34d399", duration: 16, delay: -6 },
  { name: "Jack", from: "iron_office", to: "site_seo_lab", mission: "brokers reclaim", payload: "CellXpert", color: "#f97316", duration: 18, delay: -5 },
  { name: "David", from: "vip_gate", to: "iron_office", mission: "support", payload: "client", color: "#a78bfa", duration: 15, delay: -7 },
  { name: "Marco", from: "mt4_signal_tower", to: "vip_gate", mission: "signal VIP", payload: "signal", color: "#22c55e", duration: 10, delay: -8 },
  { name: "Risk", from: "mt4_signal_tower", to: "compliance_port", mission: "risk gate", payload: "risk", color: "#f43f5e", duration: 19, delay: -9 },
  { name: "Quant", from: "mt4_signal_tower", to: "trading_academy", mission: "module STRAT", payload: "STRAT", color: "#c4b5fd", duration: 20, delay: -10 },
  { name: "Atlas", from: "site_seo_lab", to: "mission_control_tower", mission: "site / Vercel", payload: "site", color: "#38bdf8", duration: 16, delay: -11 },
  { name: "Jarod", from: "openclaw_agent_barracks", to: "mission_control_tower", mission: "dispatch OpenClaw", payload: "orders", color: "#c084fc", duration: 12, delay: -12 },
  { name: "Codex", from: "central_brain", to: "mission_control_tower", mission: "architecture", payload: "plan", color: "#e0f2fe", duration: 14, delay: -4 },
  { name: "Claude", from: "mission_control_tower", to: "openclaw_agent_barracks", mission: "worker borné", payload: "task", color: "#fca5a5", duration: 18, delay: -6 },
  { name: "GPT", from: "mission_control_tower", to: "compliance_port", mission: "reviewer externe", payload: "review", color: "#86efac", duration: 19, delay: -8 },
  { name: "Kevin", from: "calendar_tower", to: "mission_control_tower", mission: "voice rhythm", payload: "voice", color: "#facc15", duration: 21, delay: -14 },
];

const MOVING_TRUCKS: MovingTruck[] = [
  { name: "MP4 Truck", points: ["assets_warehouse", "youtube_studio"], payload: "video-01 / 94 MP4", tone: "cyan", duration: 11, delay: 0 },
  { name: "Cash Truck", points: ["iron_office", "vip_gate"], payload: "291 EUR / 3 clients", tone: "amber", duration: 10, delay: -2 },
  { name: "Broker Truck", points: ["iron_office", "site_seo_lab"], payload: "CellXpert / IP / drafts", tone: "rose", duration: 15, delay: -4 },
  { name: "Signal Truck", points: ["mt4_signal_tower", "vip_gate"], payload: "STRAT signal", tone: "emerald", duration: 9, delay: -6 },
  { name: "Compliance Truck", points: ["compliance_port", "youtube_studio", "site_seo_lab"], payload: "Reviewer GREEN", tone: "rose", duration: 18, delay: -8 },
  { name: "Memory Truck", points: ["obsidian_library", "central_brain"], payload: "canon / memory", tone: "cyan", duration: 16, delay: -10 },
  { name: "Dispatch Truck", points: ["openclaw_agent_barracks", "mission_control_tower"], payload: "orders / 38 angels / 59 trucks", tone: "cyan", duration: 13, delay: -12 },
];

const CLIENT_FUNNEL_STEPS: RailStep[] = [
  { label: "Socials", value: "9 canaux", tone: "cyan" },
  { label: "Site", value: "runtime à connecter", tone: "cyan" },
  { label: "Telegram FREE", value: "4 891", tone: "emerald" },
  { label: "Telegram VIP", value: "29", tone: "emerald" },
  { label: "Stripe VIP", value: "7", tone: "emerald" },
  { label: "Copy Trading", value: "FXcess Mirror", tone: "amber" },
  { label: "Retention", value: "support David", tone: "cyan" },
  { label: "Upsell", value: "Premium / Elite", tone: "amber" },
];

const PRODUCTION_STEPS: RailStep[] = [
  { label: "Ideas", value: "ready", tone: "cyan" },
  { label: "Scripts", value: "drafts", tone: "cyan" },
  { label: "Captions", value: "51", tone: "emerald" },
  { label: "MP4", value: "94", tone: "emerald" },
  { label: "Reviewer", value: "GREEN req.", tone: "amber" },
  { label: "Publish", value: "0 live", tone: "rose" },
  { label: "Cross-post", value: "locked", tone: "rose" },
  { label: "Metrics", value: "after live", tone: "cyan" },
];

const CITY_MACHINES: CityMachine[] = [
  { label: "Stripe Machine", district: "iron_office", tone: "emerald" },
  { label: "Telegram FREE", district: "vip_gate", tone: "cyan" },
  { label: "Telegram VIP", district: "vip_gate", tone: "emerald" },
  { label: "YouTube OAuth", district: "youtube_studio", tone: "rose" },
  { label: "CofiaPublisher", district: "youtube_studio", tone: "amber" },
  { label: "n8n fan-out", district: "paperclip_factory", tone: "slate" },
  { label: "CellXpert", district: "iron_office", tone: "amber" },
  { label: "Gmail Brokers", district: "iron_office", tone: "amber" },
  { label: "WhatsApp WABA", district: "vip_gate", tone: "rose" },
  { label: "Rithmic", district: "mt4_signal_tower", tone: "cyan" },
  { label: "MT4 / MT5", district: "mt4_signal_tower", tone: "cyan" },
  { label: "FXcess Mirror PM000697", district: "mt4_signal_tower", tone: "emerald" },
  { label: "Vercel", district: "site_seo_lab", tone: "cyan" },
  { label: "Supabase", district: "site_seo_lab", tone: "cyan" },
  { label: "Resend", district: "vip_gate", tone: "slate" },
  { label: "Notion / Linear / Obsidian", district: "obsidian_library", tone: "slate" },
  { label: "LightRAG", district: "lightrag_observatory", tone: "slate" },
  { label: "Jarod Gateway", district: "openclaw_agent_barracks", tone: "cyan" },
  { label: "RTK LLM Proxy", district: "openclaw_agent_barracks", tone: "cyan" },
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
  const selectedHouseCanonAgents = selectedHouse
    ? (snapshot?.agentsCanon?.agents ?? []).filter((a) => a.house === selectedHouse.id)
    : [];
  const selectedHouseCommerce = selectedHouse
    ? (snapshot?.commerce_machine ?? []).filter((shop) =>
        selectedHouseCanonAgents.some((a) => shop.owner_agent.includes(a.name)),
      )
    : [];
  const selectedHouseServices = selectedHouse
    ? (snapshot?.services ?? []).filter((svc) => SERVICE_HOUSE[svc.id] === selectedHouse.id)
    : [];
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

  const services = snapshot?.services ?? [];
  const servicesOk = services.filter((service) => service.ok).length;
  const servicesTotal = services.length;
  const serviceStatus = servicesTotal > 0 ? `${servicesOk}/${servicesTotal}` : "UNKNOWN";
  const primaryActions = snapshot?.investor_room?.next_7_days_tasks?.slice(0, 3) ?? [];
  const assetsProof = `${formatNumber(snapshot?.assetsWarehouse?.mp4Count)} MP4 · ${formatNumber(snapshot?.assetsWarehouse?.captionsCount)} captions · ${formatNumber(snapshot?.assetsWarehouse?.assetsInventoryCount)} assets`;
  const centralBrainTitlesByKey = new Map(
    (snapshot?.centralBrain.houses ?? []).map((house) => [house.key, house.title]),
  );
  const visibleHouseCards = houses.slice(0, 15).map((house) => ({
    ...house,
    displayName:
      HOUSE_WORKFORCE[house.id].businessName ??
      centralBrainTitlesByKey.get(house.id) ??
      centralBrainTitlesByKey.get(house.primaryBoardSlug) ??
      house.name,
    workforce: HOUSE_WORKFORCE[house.id],
  }));
  const mappedWorkers = Array.from(
    new Set(Object.values(HOUSE_WORKFORCE).flatMap((house) => house.workers)),
  );
  const topWorkforceHouses = [...visibleHouseCards]
    .sort((a, b) => b.workforce.workers.length - a.workforce.workers.length)
    .slice(0, 3);
  const rosterStatusByName = new Map(
    (angelRoster?.anges ?? []).map((angel) => [angel.name.toLowerCase(), angel.status]),
  );
  const rosterRuntimeLabel = angelRoster
    ? `runtime roster: LIVE ${angelRoster.counts.live} · awaiting ${angelRoster.counts.awaiting_setup}`
    : "runtime roster plus bas, mapping organisationnel affiché ici.";

  return (
    <DashboardShell>
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto bg-slate-950">
        <div className="bg-[#02040a] p-3 text-slate-100">
          <WorldMapLiving snapshot={snapshot} angelRoster={angelRoster} onSelectHouse={(id) => openHouseDrawer(id as HouseId)} />


      {drawerTruck ? (
        <TruckDrawer
          truck={drawerTruck}
          onClose={() => setDrawerTruckName(null)}
          onRefreshStripeProof={refreshStripeProof}
          refreshStatus={stripeRefreshStatus}
          refreshing={refreshingStripeProof}
        />
      ) : null}
      {selectedHouse ? (
        <HouseDrawer
          house={selectedHouse}
          canonAgents={selectedHouseCanonAgents}
          commerce={selectedHouseCommerce}
          services={selectedHouseServices}
          rosterStatusByName={rosterStatusByName}
          onClose={() => setSelectedHouseId(null)}
        />
      ) : null}
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
      </main>
    </DashboardShell>
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
          // P11 Al-Muharrik · bind district status sur snapshot.routes LIVE (Sourate LXVIII)
          const liveStatusRaw =
            district.label === "Revenue Command" ? snapshot?.routes?.revenue_route?.status :
            district.label === "Acquisition Engine" || district.label === "Asset Factory" ? snapshot?.routes?.acquisition_route?.status :
            district.label === "Support Ops" ? snapshot?.routes?.support_route?.status :
            district.label === "Proof Ledger" ? snapshot?.routes?.compliance_route?.status :
            district.label === "Offer Factory" ? snapshot?.routes?.revenue_route?.status :
            undefined;
          const liveStatus = (liveStatusRaw as Status | undefined) ?? district.status;
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
                <span className={`mt-2 inline-flex rounded border px-1.5 py-0.5 text-[10px] ${statusClass[liveStatus]}`}>
                  {liveStatus}
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

function CofiaLivingCity({
  snapshot,
  angelRoster,
  onSelectHouse,
}: {
  snapshot: Snapshot | null;
  angelRoster: AngelRosterPayload | null;
  onSelectHouse: (houseId: HouseId) => void;
}) {
  const agentsByHouse = new Map<string, CofiaAgent[]>();
  for (const agent of snapshot?.agentsCanon?.agents ?? []) {
    const list = agentsByHouse.get(agent.house) ?? [];
    list.push(agent);
    agentsByHouse.set(agent.house, list);
  }
  const services = snapshot?.services ?? [];
  const servicesOk = services.filter((service) => service.ok).length;
  const servicesTotal = services.length;

  return (
    <section className="relative min-h-[calc(100vh-180px)] overflow-hidden rounded-xl border border-cyan-300/20 bg-[#02040a] px-4 py-4 text-slate-100 shadow-[0_18px_60px_rgba(2,6,23,.55)] lg:px-6">
      <style>{`
        @keyframes t6-city-scan { 0% { transform: translateX(-20%); opacity: .14; } 50% { opacity: .55; } 100% { transform: translateX(118%); opacity: .14; } }
        @keyframes t6-city-pulse { 0%, 100% { box-shadow: 0 0 12px rgba(34,211,238,.12), 0 22px 44px rgba(0,0,0,.52); } 50% { box-shadow: 0 0 34px var(--t6-glow), 0 28px 58px rgba(0,0,0,.62); } }
        @keyframes t6-window-flow { 0% { opacity: .25; } 45% { opacity: .9; } 100% { opacity: .35; } }
        @keyframes t6-client-flow { 0% { transform: translateX(0); opacity: .18; } 12% { opacity: 1; } 100% { transform: translateX(calc(100vw - 300px)); opacity: .25; } }
        @keyframes t6-crate-flow { 0% { transform: translateX(-10px) translateY(0); } 50% { transform: translateX(12px) translateY(-3px); } 100% { transform: translateX(-10px) translateY(0); } }
        @keyframes t6-orbit { from { transform: rotate(0deg) translateX(38px) rotate(0deg); } to { transform: rotate(360deg) translateX(38px) rotate(-360deg); } }
        .t6-city-scan { animation: t6-city-scan 9s linear infinite; }
        .t6-city-building { animation: t6-city-pulse 4.8s ease-in-out infinite; transform: translate(-50%, -50%) perspective(760px) rotateX(7deg) rotateZ(-1.5deg); }
        .t6-city-building:nth-of-type(2n) { transform: translate(-50%, -50%) perspective(760px) rotateX(7deg) rotateZ(1.5deg); }
        .t6-city-window { animation: t6-window-flow 2.8s ease-in-out infinite; }
        .t6-city-client { animation: t6-client-flow 9.5s linear infinite; }
        .t6-city-crate { animation: t6-crate-flow 4.2s ease-in-out infinite; }
        .t6-city-orbit { animation: t6-orbit 8.5s linear infinite; transform-origin: center; }
      `}</style>

      <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:radial-gradient(circle_at_22%_26%,rgba(14,165,233,.24),transparent_27%),radial-gradient(circle_at_68%_38%,rgba(16,185,129,.16),transparent_22%),linear-gradient(rgba(45,212,191,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.06)_1px,transparent_1px)] [background-size:auto,auto,44px_44px,44px_44px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,4,10,.1)_46%,rgba(2,4,10,.76)_100%)]" />
      <img
        src={northStarImage}
        alt="Vision Map blueprint"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.16] mix-blend-screen"
      />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-cyan-300/10 blur-3xl t6-city-scan" />

      <div className="relative mx-auto grid min-h-[calc(100vh-220px)] max-w-[1780px] grid-rows-[auto_1fr_auto] gap-3">
        <CityHUD snapshot={snapshot} servicesOk={servicesOk} servicesTotal={servicesTotal} />

        <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="rounded-lg border border-cyan-300/25 bg-slate-950/55 p-3 shadow-[0_0_80px_rgba(8,145,178,.13)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-cyan-300/20 bg-slate-950/75 px-3 py-2">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100">COFIATRADING Living City · 15 quartiers réels</p>
                <p className="mt-0.5 text-[11px] text-slate-300">Clique un quartier → ouvre la maison réelle · 38 agents canon en poste (registre live).</p>
              </div>
              <span className="shrink-0 rounded border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[10px] font-semibold text-emerald-100">59 camions · runtime à câbler</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
              {CITY_DISTRICTS.map((district) => (
                <CityBuilding
                  key={district.id}
                  district={district}
                  agents={agentsByHouse.get(district.id) ?? []}
                  onSelect={() => onSelectHouse(district.id)}
                />
              ))}
            </div>
          </div>

          <aside className="grid min-h-0 gap-3">
            <OpenClawCommandPanel angelRoster={angelRoster} />
            <MachineStationsPanel />
            <TradingTowerPanel />
            <div className="rounded-lg border border-amber-300/25 bg-slate-950/78 p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-100">Vision Map blueprint</p>
              <div className="mt-3 grid grid-cols-[104px_1fr] gap-3">
                <img src={northStarImage} alt="Vision Map blueprint mini" className="h-[74px] w-[104px] rounded-md border border-amber-300/25 object-cover opacity-65" />
                <p className="text-[11px] leading-5 text-slate-300">
                  Sous-couche et mini-carte seulement. Le produit visible est la ville animée COFIATRADING.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <ClientFunnelRail />
          <ProductionFactoryRail snapshot={snapshot} />
        </div>
      </div>
    </section>
  );
}

function CityHUD({
  snapshot,
  servicesOk,
  servicesTotal,
}: {
  snapshot: Snapshot | null;
  servicesOk: number;
  servicesTotal: number;
}) {
  const assets = snapshot?.assetsWarehouse;
  const hudItems = [
    ["MRR", formatCityEur(snapshot?.revenue.currentMrrEur), "emerald"],
    ["ARR", formatCityEur(snapshot?.revenue.currentArrEur), "cyan"],
    ["VIP", formatCityNumber(snapshot?.revenue.activeVip), "emerald"],
    ["Past due", `${formatCityEur(snapshot?.revenue.pastDueEur)} / ${formatCityNumber(snapshot?.revenue.pastDueCount)}`, "rose"],
    ["Houses", formatCityNumber(snapshot?.centralBrain.housesCount), "cyan"],
    ["Services", servicesTotal ? `${servicesOk}/${servicesTotal}` : "source down", "amber"],
  ];
  return (
    <header className="grid gap-3 rounded-lg border border-cyan-300/25 bg-slate-950/84 p-3 backdrop-blur xl:grid-cols-[minmax(0,1fr)_minmax(720px,0.95fr)]">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-100">
          COFIATRADING Living City · Mission Control relié à OpenClaw
        </p>
        <h1 className="mt-1 font-heading text-2xl font-black uppercase text-white lg:text-3xl">
          Mission Control City
        </h1>
        <p className="mt-1 text-xs text-slate-300">
          15 quartiers · 38 anges · 59 camions · 30 outils · agents, missions, clients et économie en mouvement.
        </p>
        <p className="mt-2 text-[11px] text-slate-500">Sync {snapshot?.fetchedAt ?? "source down"}</p>
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-3 xl:grid-cols-6">
        {hudItems.map(([label, value, tone]) => (
          <div key={label} className={`rounded-md border px-3 py-2 ${tone === "emerald" ? "border-emerald-300/30 bg-emerald-300/10" : tone === "cyan" ? "border-cyan-300/30 bg-cyan-300/10" : tone === "rose" ? "border-rose-300/35 bg-rose-400/10" : "border-amber-300/30 bg-amber-300/10"}`}>
            <p className="text-[10px] uppercase text-slate-300">{label}</p>
            <p className="mt-1 text-base font-black text-white">{value}</p>
          </div>
        ))}
        <div className="rounded-md border border-teal-300/30 bg-teal-300/10 px-3 py-2 sm:col-span-3 xl:col-span-6">
          <p className="text-[10px] uppercase text-teal-100">Assets</p>
          <p className="mt-1 text-sm font-black text-white">
            {formatCityNumber(assets?.mp4Count)} MP4 · {formatCityNumber(assets?.captionsCount)} captions · {formatCityNumber(assets?.assetsInventoryCount)} assets
          </p>
        </div>
      </div>
    </header>
  );
}

function CityRoad({ route, path }: { route: CityRoute; path: string }) {
  const color = {
    cyan: "#67e8f9",
    emerald: "#34d399",
    amber: "#fbbf24",
    rose: "#fb7185",
  }[route.tone];
  return (
    <g>
      <path d={path} fill="none" stroke="rgba(15,23,42,.78)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="0.72"
        strokeLinecap="round"
        strokeOpacity="0.72"
        strokeDasharray="1.4 1.1"
        filter="url(#t6-road-glow)"
        vectorEffect="non-scaling-stroke"
      />
      <text fontSize="1.25" fill={color} opacity="0.85">
        <textPath href={`#${route.id}`} />
      </text>
    </g>
  );
}

function MovingAgent({ agent, path }: { agent: MovingAgent; path: string }) {
  return (
    <g filter="url(#t6-road-glow)">
      <animateMotion dur={`${agent.duration}s`} begin={`${agent.delay}s`} repeatCount="indefinite" path={path} />
      <circle r="1.35" fill={agent.color} stroke="rgba(255,255,255,.9)" strokeWidth="0.26" vectorEffect="non-scaling-stroke" />
      <circle r="2.05" fill="none" stroke={agent.color} strokeOpacity="0.32" strokeWidth="0.18" vectorEffect="non-scaling-stroke" />
      <text x="0" y="-2.5" textAnchor="middle" fontSize="2.0" fontWeight="900" fill="#f8fafc" stroke="rgba(2,6,23,.92)" strokeWidth="0.24" vectorEffect="non-scaling-stroke">
        {agent.name}
      </text>
      <text x="0" y="3.6" textAnchor="middle" fontSize="1.2" fill={agent.color} stroke="rgba(2,6,23,.92)" strokeWidth="0.16" vectorEffect="non-scaling-stroke">
        {agent.payload}
      </text>
      <title>{`${agent.name} · ${agent.mission}`}</title>
    </g>
  );
}

function MovingTruck({ truck, path }: { truck: MovingTruck; path: string }) {
  const color = {
    cyan: "#67e8f9",
    emerald: "#34d399",
    amber: "#f97316",
    rose: "#fb7185",
  }[truck.tone];
  return (
    <g>
      <animateMotion dur={`${truck.duration}s`} begin={`${truck.delay}s`} repeatCount="indefinite" path={path} />
      <rect x="-3.1" y="-1.25" width="6.2" height="2.5" rx="0.55" fill={color} stroke="rgba(255,255,255,.9)" strokeWidth="0.18" vectorEffect="non-scaling-stroke" />
      <rect x="-1.1" y="-2.05" width="2.2" height="1" rx="0.28" fill="rgba(255,255,255,.78)" />
      <circle cx="-1.8" cy="1.45" r="0.42" fill="#020617" />
      <circle cx="1.8" cy="1.45" r="0.42" fill="#020617" />
      <text x="0" y="-2.9" textAnchor="middle" fontSize="1.38" fontWeight="900" fill="#f8fafc" stroke="rgba(2,6,23,.92)" strokeWidth="0.18" vectorEffect="non-scaling-stroke">
        {truck.name}
      </text>
      <title>{truck.payload}</title>
    </g>
  );
}

function CityBuilding({
  district,
  agents,
  onSelect,
}: {
  district: CityDistrict;
  agents: CofiaAgent[];
  onSelect: () => void;
}) {
  const windows = Array.from({ length: district.visual === "castle" ? 8 : 6 });
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className="group relative cursor-pointer rounded-lg text-left transition duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
      style={{
        background: `linear-gradient(145deg, rgba(15,23,42,.95), rgba(2,6,23,.84)), radial-gradient(circle at 50% 0%, ${district.glow}, transparent 62%)`,
        boxShadow: `0 0 22px ${district.glow}, 0 14px 32px rgba(0,0,0,.5)`,
        ["--t6-glow" as string]: district.glow,
      }}
    >
      <div className={`relative overflow-hidden rounded-lg border bg-slate-950/82 p-2 ${district.visual === "castle" ? "border-cyan-300/35" : district.visual === "port" ? "border-rose-300/35" : "border-white/15"}`}>
        <div
          className="absolute -top-5 left-1/2 h-8 w-2/3 -translate-x-1/2 skew-x-[-18deg] rounded-t-lg border border-white/10"
          style={{ background: `linear-gradient(90deg, ${district.glow}, rgba(15,23,42,.96))` }}
        />
        <div className="relative flex items-start justify-between gap-2">
          <span className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
            {district.visual}
          </span>
          {district.metric ? <span className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[9px] font-bold text-slate-200">{district.metric}</span> : null}
        </div>
        <p className="relative mt-1 truncate text-[12px] font-black uppercase tracking-[0.02em] text-white">{district.title}</p>
        <p className="relative truncate text-[10px] text-slate-300">{district.subtitle}</p>
        <div className="relative mt-2 grid grid-cols-4 gap-1">
          {windows.map((_, index) => (
            <span
              key={index}
              className="t6-city-window h-2 rounded-[2px]"
              style={{ backgroundColor: district.accent, opacity: 0.32 + (index % 3) * 0.12, animationDelay: `${index * -0.28}s` }}
            />
          ))}
        </div>
        <p className="relative mt-2 line-clamp-2 text-[10px] leading-3 text-slate-200">{district.role}</p>
        <p className="relative mt-1 truncate text-[9px] text-amber-100">Next: {district.next}</p>
        <div className="relative mt-1 flex flex-wrap items-center gap-1">
          {agents.slice(0, 6).map((agent) => (
            <span
              key={`${district.id}-${agent.id}`}
              title={`${agent.name} — ${agent.roleBadge}`}
              className="inline-flex h-4 items-center gap-0.5 rounded border px-1 text-[8px] font-semibold"
              style={{ borderColor: `${agent.colorPrimary}55`, backgroundColor: `${agent.colorPrimary}1f`, color: agent.colorPrimary }}
            >
              <span>{agent.avatarEmoji || agent.glyph}</span>
              <span className="max-w-[46px] truncate">{agent.name}</span>
            </span>
          ))}
          {agents.length > 6 ? (
            <span className="rounded border border-white/15 bg-white/5 px-1 py-0.5 text-[8px] text-slate-300">+{agents.length - 6}</span>
          ) : null}
          {agents.length === 0
            ? district.workers.slice(0, 3).map((worker) => (
                <span key={`${district.id}-${worker}`} className="rounded border border-cyan-300/25 bg-cyan-300/10 px-1 py-0.5 text-[8px] font-semibold text-cyan-100">
                  {worker}
                </span>
              ))
            : null}
        </div>
        <div className="relative mt-1 flex flex-wrap gap-1">
          {district.machines.slice(0, 3).map((machine) => (
            <span key={`${district.id}-${machine}`} className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[8px] text-slate-300">
              {machine}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClientFunnelRail() {
  return (
    <section className="rounded-lg border border-cyan-300/20 bg-slate-950/76 p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100">Client funnel · visual funnel layer · runtime conversion à connecter</h2>
        <ShieldCheck className="h-4 w-4 text-cyan-200" />
      </div>
      <div className="relative mt-3 overflow-hidden rounded-md border border-slate-800 bg-slate-950/72 p-3">
        <div className="grid grid-cols-4 gap-2 text-[11px] lg:grid-cols-8">
          {CLIENT_FUNNEL_STEPS.map((step) => (
            <RailCard key={step.label} step={step} />
          ))}
        </div>
        {Array.from({ length: 7 }).map((_, index) => (
          <span
            key={index}
            className="t6-city-client absolute bottom-2 left-4 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(52,211,153,.78)]"
            style={{ animationDelay: `${index * -1.25}s` }}
          />
        ))}
      </div>
    </section>
  );
}

function ProductionFactoryRail({ snapshot }: { snapshot: Snapshot | null }) {
  const assets = snapshot?.assetsWarehouse;
  return (
    <section className="rounded-lg border border-amber-300/20 bg-slate-950/76 p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-100">Production factory · CofiaPublisher vivant</h2>
        <Factory className="h-4 w-4 text-amber-200" />
      </div>
      <div className="mt-3 overflow-hidden rounded-md border border-slate-800 bg-slate-950/72 p-3">
        <div className="grid grid-cols-4 gap-2 text-[11px] lg:grid-cols-8">
          {PRODUCTION_STEPS.map((step, index) => (
            <div key={step.label} className="t6-city-crate" style={{ animationDelay: `${index * -0.32}s` }}>
              <RailCard step={step} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-amber-100/75">
          video-01 visible · YouTube OAuth blocked · Reviewer gate pulse · {formatCityNumber(assets?.mp4Count)} MP4 / {formatCityNumber(assets?.captionsCount)} captions / {formatCityNumber(assets?.assetsInventoryCount)} assets.
        </p>
      </div>
    </section>
  );
}

function RailCard({ step }: { step: RailStep }) {
  const toneClass = step.tone === "emerald"
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    : step.tone === "amber"
      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
      : step.tone === "rose"
        ? "border-rose-300/25 bg-rose-400/10 text-rose-100"
        : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return (
    <div className={`rounded-md border px-2 py-2 ${toneClass}`}>
      <p className="truncate font-black text-white">{step.label}</p>
      <p className="mt-1 truncate">{step.value}</p>
    </div>
  );
}

function MachineStationsPanel() {
  return (
    <section className="rounded-lg border border-cyan-300/20 bg-slate-950/78 p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100">CITY_MACHINES · tools stations</h2>
        <Settings className="h-4 w-4 text-cyan-200" />
      </div>
      <div className="mt-3 grid max-h-[132px] grid-cols-2 gap-2 overflow-auto pr-1 text-[10px]">
        {CITY_MACHINES.map((machine) => {
          const toneClass = machine.tone === "emerald"
            ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
            : machine.tone === "amber"
              ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
              : machine.tone === "rose"
                ? "border-rose-300/25 bg-rose-400/10 text-rose-100"
                : machine.tone === "cyan"
                  ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
                  : "border-slate-600/40 bg-slate-800/50 text-slate-200";
          return (
            <span key={`${machine.district}-${machine.label}`} className={`rounded border px-2 py-1 font-semibold ${toneClass}`}>
              {machine.label}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function TradingTowerPanel() {
  return (
    <section className="rounded-lg border border-cyan-300/20 bg-slate-950/78 p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100">Trading Tower</h2>
        <RadioTower className="h-4 w-4 text-cyan-200" />
      </div>
      <div className="relative mt-3 min-h-[142px] rounded-md border border-emerald-300/20 bg-slate-950/70 p-3">
        <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/35 bg-emerald-300/10" />
        {["Marco", "Risk", "Quant"].map((name, index) => (
          <span
            key={name}
            className="t6-city-orbit absolute left-1/2 top-1/2 -ml-6 -mt-3 rounded border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[10px] font-bold text-emerald-100"
            style={{ animationDelay: `${index * -2}s` }}
          >
            {name}
          </span>
        ))}
        <div className="relative z-10 grid gap-1 text-[11px] text-slate-300">
          <span>Rithmic · MT4 · MT5</span>
          <span>FXcess Mirror PM000697</span>
          <span>Signal Truck vers VIP Gate</span>
          <span className="text-amber-200">PnL source à connecter</span>
        </div>
      </div>
    </section>
  );
}

function OpenClawCommandPanel({ angelRoster }: { angelRoster: AngelRosterPayload | null }) {
  const mappedWorkers = Array.from(new Set(Object.values(HOUSE_WORKFORCE).flatMap((house) => house.workers)));
  return (
    <section className="rounded-lg border border-cyan-300/20 bg-slate-950/78 p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100">OpenClaw / Mission Control</h2>
        <Bot className="h-4 w-4 text-cyan-200" />
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-200">
        <div className="rounded-md border border-emerald-300/25 bg-emerald-300/10 p-3">
          <p className="font-black uppercase text-emerald-100">38 anges canon · workforce visible</p>
          <p className="mt-1 text-emerald-100/70">
            {mappedWorkers.length} ouvriers affectés · runtime roster {angelRoster ? `LIVE ${angelRoster.counts.live} / awaiting ${angelRoster.counts.awaiting_setup}` : "à connecter"}
          </p>
        </div>
        <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3">
          <p className="font-black uppercase text-amber-100">59 camions canon · 7 camions visuels animés</p>
          <p className="mt-1 text-amber-100/70">Jarod dispatch · Codex architecte · Claude worker borné · GPT reviewer externe.</p>
        </div>
      </div>
    </section>
  );
}

function LivingWorldEngine({ snapshot, angelRoster }: { snapshot: Snapshot | null; angelRoster: AngelRosterPayload | null }) {
  const nodeById = new Map(WORLD_NODES.map((node) => [node.id, node]));
  const routePath = (route: HouseId[]) =>
    route
      .map((id, index) => {
        const node = nodeById.get(id);
        if (!node) return "";
        return `${index === 0 ? "M" : "L"} ${node.x} ${node.y}`;
      })
      .filter(Boolean)
      .join(" ");
  const directRoutes = [
    ["mission_control_tower", "central_brain"],
    ["mission_control_tower", "compliance_port"],
    ["mission_control_tower", "youtube_studio"],
    ["mission_control_tower", "iron_office"],
    ["mission_control_tower", "openclaw_agent_barracks"],
    ["youtube_studio", "assets_warehouse"],
    ["youtube_studio", "site_seo_lab"],
    ["youtube_studio", "vip_gate"],
    ["iron_office", "vip_gate"],
    ["iron_office", "site_seo_lab"],
    ["mt4_signal_tower", "vip_gate"],
    ["mt4_signal_tower", "compliance_port"],
    ["site_seo_lab", "vip_gate"],
    ["site_seo_lab", "assets_warehouse"],
    ["obsidian_library", "central_brain"],
    ["paperclip_factory", "openclaw_agent_barracks"],
    ["calendar_tower", "mission_control_tower"],
  ] as Array<[HouseId, HouseId]>;
  const mappedWorkers = Array.from(new Set(Object.values(HOUSE_WORKFORCE).flatMap((house) => house.workers)));
  const services = snapshot?.services ?? [];
  const servicesOk = services.filter((service) => service.ok).length;
  const servicesTotal = services.length;
  const truckTone: Record<WorldTruck["status"], string> = {
    urgent: "#f97316",
    blocked: "#fb7185",
    live: "#34d399",
    build: "#67e8f9",
  };

  return (
    <section className="relative min-h-screen overflow-hidden border-b border-emerald-300/15 bg-[#03060a] px-4 py-4 lg:px-6">
      <style>{`
        @keyframes t5b-world-scan { 0% { transform: translateX(-16%); opacity: .25; } 50% { opacity: .75; } 100% { transform: translateX(116%); opacity: .25; } }
        @keyframes t5b-client-flow { 0% { transform: translateX(0); opacity: .25; } 12% { opacity: 1; } 100% { transform: translateX(calc(100vw - 260px)); opacity: .25; } }
        @keyframes t5b-conveyor { 0% { transform: translateX(-12px); } 50% { transform: translateX(12px); } 100% { transform: translateX(-12px); } }
        @keyframes t5b-orbit { from { transform: rotate(0deg) translateX(34px) rotate(0deg); } to { transform: rotate(360deg) translateX(34px) rotate(-360deg); } }
        @keyframes t5b-pulse { 0%, 100% { box-shadow: 0 0 0 rgba(52,211,153,0); } 50% { box-shadow: 0 0 22px rgba(52,211,153,.34); } }
        .t5b-scan { animation: t5b-world-scan 8s linear infinite; }
        .t5b-client-dot { animation: t5b-client-flow 9s linear infinite; }
        .t5b-conveyor { animation: t5b-conveyor 4s ease-in-out infinite; }
        .t5b-orbit { animation: t5b-orbit 9s linear infinite; transform-origin: center; }
        .t5b-pulse { animation: t5b-pulse 2.5s ease-in-out infinite; }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.06)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-cyan-300/10 blur-3xl t5b-scan" />

      <div className="relative mx-auto grid min-h-[calc(100vh-32px)] max-w-[1760px] grid-rows-[auto_1fr_auto] gap-3">
        <header className="grid gap-3 rounded-md border border-emerald-300/20 bg-slate-950/85 p-3 shadow-[0_0_50px_rgba(16,185,129,0.08)] xl:grid-cols-[1fr_auto]">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200">
              Living World Engine · Mission Control relié à OpenClaw
            </p>
            <h1 className="mt-1 font-heading text-2xl font-black uppercase text-white lg:text-3xl">
              COFIATRADING World Control
            </h1>
            <p className="mt-1 text-xs text-slate-300">
              Couche visuelle canonique animée · agents/camions = animation organisationnelle si runtime non câblé · 15 maisons · 38 anges · 59 camions canon.
            </p>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-4 xl:min-w-[720px]">
            <div className="rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2">
              <p className="text-[10px] uppercase text-emerald-200">MRR</p>
              <p className="text-lg font-black text-white">{formatEur(snapshot?.revenue.currentMrrEur)}</p>
            </div>
            <div className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-2">
              <p className="text-[10px] uppercase text-cyan-200">ARR</p>
              <p className="text-lg font-black text-white">{formatEur(snapshot?.revenue.currentArrEur)}</p>
            </div>
            <div className="rounded-md border border-rose-300/35 bg-rose-400/10 px-3 py-2">
              <p className="text-[10px] uppercase text-rose-200">Past due</p>
              <p className="text-lg font-black text-white">{formatEur(snapshot?.revenue.pastDueEur)} / {formatNumber(snapshot?.revenue.pastDueCount)}</p>
            </div>
            <div className="rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2">
              <p className="text-[10px] uppercase text-amber-200">OpenClaw</p>
              <p className="text-lg font-black text-white">{servicesTotal ? `${servicesOk}/${servicesTotal}` : "source"}</p>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1.35fr)_400px]">
          <div className="relative min-h-[620px] overflow-hidden rounded-md border border-cyan-300/20 bg-slate-950/72">
            <div className="absolute left-4 top-4 z-20 rounded-md border border-cyan-300/25 bg-slate-950/85 px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">Mission Control map</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Codex architecte · Jarod dispatcher · Claude worker borné · GPT reviewer externe · Erwin commandant.
              </p>
            </div>

            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Animated routes between COFIATRADING houses">
              <defs>
                <filter id="t5b-glow">
                  <feGaussianBlur stdDeviation="1.2" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {directRoutes.map((route) => (
                <path
                  key={route.join("-")}
                  d={routePath(route)}
                  fill="none"
                  stroke="rgba(125, 211, 252, 0.24)"
                  strokeWidth="0.28"
                  strokeDasharray="1.1 1.1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {WORLD_TRUCKS.map((truck, index) => (
                <path
                  key={`truck-route-${truck.label}`}
                  d={routePath(truck.route)}
                  fill="none"
                  stroke={truckTone[truck.status]}
                  strokeWidth="0.42"
                  strokeOpacity="0.52"
                  vectorEffect="non-scaling-stroke"
                  filter="url(#t5b-glow)"
                  strokeDasharray={index % 2 === 0 ? "1.4 1.1" : "0.7 1.2"}
                />
              ))}
              {WORLD_AGENTS.map((agent) => (
                <g key={agent.name} filter="url(#t5b-glow)">
                  <animateMotion
                    dur={`${agent.duration}s`}
                    begin={`${agent.delay}s`}
                    repeatCount="indefinite"
                    path={routePath([agent.from, agent.to])}
                  />
                  <circle r="1.15" fill={agent.color} stroke="rgba(255,255,255,.9)" strokeWidth="0.24" vectorEffect="non-scaling-stroke" />
                  <text x="0" y="-2.1" textAnchor="middle" fontSize="2.2" fontWeight="800" fill="#f8fafc" stroke="rgba(2,6,23,.9)" strokeWidth="0.24" vectorEffect="non-scaling-stroke">
                    {agent.name}
                  </text>
                  <text x="0" y="3.3" textAnchor="middle" fontSize="1.35" fill={agent.color} stroke="rgba(2,6,23,.92)" strokeWidth="0.18" vectorEffect="non-scaling-stroke">
                    {agent.payload}
                  </text>
                </g>
              ))}
              {WORLD_TRUCKS.map((truck) => (
                <g key={truck.label}>
                  <animateMotion
                    dur={`${truck.duration}s`}
                    begin={`${truck.delay}s`}
                    repeatCount="indefinite"
                    path={routePath(truck.route)}
                  />
                  <rect x="-2.4" y="-1" width="4.8" height="2" rx="0.7" fill={truckTone[truck.status]} stroke="rgba(255,255,255,.85)" strokeWidth="0.18" vectorEffect="non-scaling-stroke" />
                  <circle cx="-1.35" cy="1.15" r="0.38" fill="#020617" />
                  <circle cx="1.35" cy="1.15" r="0.38" fill="#020617" />
                  <text x="0" y="-2.1" textAnchor="middle" fontSize="1.45" fontWeight="800" fill="#f8fafc" stroke="rgba(2,6,23,.88)" strokeWidth="0.18" vectorEffect="non-scaling-stroke">
                    {truck.label.split("·")[0].trim()}
                  </text>
                </g>
              ))}
            </svg>

            {WORLD_NODES.map((node) => {
              const workforce = HOUSE_WORKFORCE[node.id];
              const urgent = node.id === "iron_office" || node.id === "youtube_studio" || node.id === "mt4_signal_tower";
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`absolute z-10 w-[132px] -translate-x-1/2 -translate-y-1/2 rounded-md border bg-slate-950/88 px-2 py-2 text-left shadow-[0_10px_28px_rgba(0,0,0,.36)] transition hover:z-30 hover:scale-[1.04] ${statusClass[node.status]} ${urgent ? "t5b-pulse" : ""}`}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  title={`${node.label} · ${node.mission} · ${node.assetKey}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] font-black text-white">
                      {node.icon}
                    </span>
                    <span className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[8px] font-bold uppercase">
                      {node.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] font-black text-white">{node.label}</p>
                  <p className="truncate text-[9px] text-slate-300">{node.owner}</p>
                  <p className="mt-1 line-clamp-2 text-[9px] leading-3 text-slate-200">{node.mission}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {workforce.workers.slice(0, 3).map((worker) => (
                      <span key={`${node.id}-${worker}`} className="rounded border border-cyan-300/25 bg-cyan-300/10 px-1 py-0.5 text-[8px] font-semibold text-cyan-100">
                        {worker}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <aside className="grid min-h-0 gap-3">
            <Panel title="OpenClaw / Mission Control" tone="cyan">
              <div className="grid gap-2 text-xs text-slate-200">
                <div className="rounded-md border border-emerald-300/25 bg-emerald-300/10 p-3">
                  <p className="font-black uppercase text-emerald-100">38 anges visibles en workforce</p>
                  <p className="mt-1 text-emerald-100/70">{mappedWorkers.length} ouvriers affectés · runtime roster {angelRoster ? `LIVE ${angelRoster.counts.live} / awaiting ${angelRoster.counts.awaiting_setup}` : "à connecter"}</p>
                </div>
                <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3">
                  <p className="font-black uppercase text-amber-100">59 camions canon · runtime source à connecter</p>
                  <p className="mt-1 text-amber-100/70">7 camions visuels animés maintenant, sans prétendre au runtime camion final.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {["Codex architecte", "Jarod dispatch", "Claude worker", "GPT reviewer"].map((label) => (
                    <span key={label} className="rounded border border-slate-700 bg-slate-950/70 px-2 py-1 text-[11px] font-semibold text-slate-200">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Vision Map secondaire" tone="gold">
              <div className="grid grid-cols-[120px_1fr] gap-3">
                <img src={northStarImage} alt="Vision Map secondaire" className="h-[82px] w-[120px] rounded border border-slate-700 object-cover opacity-70" />
                <div>
                  <p className="text-xs font-bold text-slate-100">Poster Manhattan réduit à une mini-carte.</p>
                  <p className="mt-1 text-[11px] text-slate-500">Le produit visible est le monde animé Mission Control.</p>
                </div>
              </div>
            </Panel>

            <Panel title="Trading Tower" tone="cyan">
              <div className="relative min-h-[128px] rounded-md border border-emerald-300/20 bg-slate-950/70 p-3">
                <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/35 bg-emerald-300/10" />
                {["Marco", "Risk", "Quant"].map((name, index) => (
                  <span
                    key={name}
                    className="t5b-orbit absolute left-1/2 top-1/2 -ml-5 -mt-3 rounded border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[10px] font-bold text-emerald-100"
                    style={{ animationDelay: `${index * -2}s` }}
                  >
                    {name}
                  </span>
                ))}
                <div className="relative z-10 grid gap-1 text-[11px] text-slate-300">
                  <span>Rithmic · MT4 · MT5</span>
                  <span>FXcess Mirror PM000697</span>
                  <span>Signal VIP en route vers VIP Gate</span>
                  <span className="text-amber-200">PnL source à connecter</span>
                </div>
              </div>
            </Panel>
          </aside>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Client funnel · visual funnel layer · runtime conversion à connecter" tone="cyan">
            <div className="relative overflow-hidden rounded-md border border-slate-800 bg-slate-950/72 p-3">
              <div className="grid grid-cols-7 gap-2 text-[11px]">
                {[
                  ["Socials", "9 canaux"],
                  ["Site", "à connecter"],
                  ["Telegram FREE", "4 891"],
                  ["Telegram VIP", "29"],
                  ["Stripe VIP", "7"],
                  ["Copy Trading", "FXcess"],
                  ["Upsell", "Premium"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded border border-slate-700 bg-slate-900/70 px-2 py-2">
                    <p className="font-bold text-white">{label}</p>
                    <p className="mt-1 text-emerald-300">{value}</p>
                  </div>
                ))}
              </div>
              {[0, 1, 2, 3, 4].map((dot) => (
                <span
                  key={dot}
                  className="t5b-client-dot absolute bottom-2 left-4 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(52,211,153,.7)]"
                  style={{ animationDelay: `${dot * -1.7}s` }}
                />
              ))}
            </div>
          </Panel>

          <Panel title="Factory strip · Production factory animée" tone="gold">
            <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950/72 p-3">
              <div className="grid grid-cols-8 gap-2 text-[11px]">
                {[
                  ["Ideas", "ready"],
                  ["Scripts", "draft"],
                  ["Captions", "51"],
                  ["MP4", "94"],
                  ["Reviewer", "GREEN req."],
                  ["Publish", "0 live"],
                  ["Cross-post", "locked"],
                  ["Metrics", "after live"],
                ].map(([label, value], index) => (
                  <div key={label} className="t5b-conveyor rounded border border-amber-300/25 bg-amber-300/10 px-2 py-2" style={{ animationDelay: `${index * -0.35}s` }}>
                    <p className="font-bold text-white">{label}</p>
                    <p className="mt-1 text-amber-200">{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-amber-100/70">
                193 assets · YouTube OAuth blocked · Reviewer GREEN required.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

type CalendarEventView = {
  ts: string | null;
  from: string | null;
  role: string | null;
  kind: string | null;
  summary: string;
};
type CalendarPayload = {
  ok: boolean;
  freshness?: string;
  totalLines?: number | null;
  events?: CalendarEventView[];
};
type LinearIssueView = {
  id: string;
  title: string;
  priority: number | null;
  state: string;
  stateType: string;
  team: string;
  url: string | null;
  updatedAt: string | null;
};
type LinearPayload = { ok: boolean; total?: number; issues?: LinearIssueView[]; reason?: string };

function HouseDrawer({
  house,
  canonAgents,
  commerce,
  services,
  rosterStatusByName,
  onClose,
}: {
  house: HouseView;
  canonAgents: CofiaAgent[];
  commerce: NonNullable<Snapshot["commerce_machine"]>;
  services: Snapshot["services"];
  rosterStatusByName: Map<string, string>;
  onClose: () => void;
}) {
  const workforce = HOUSE_WORKFORCE[house.id];
  const [cadence, setCadence] = useState<CalendarPayload | null>(null);
  useEffect(() => {
    if (house.id !== "calendar_tower") return;
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/calendar", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setCadence(j as CalendarPayload);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [house.id]);
  const [linear, setLinear] = useState<LinearPayload | null>(null);
  useEffect(() => {
    if (house.id !== "mission_control_tower") return;
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/linear", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setLinear(j as LinearPayload);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [house.id]);
  const runtimeTone = house.status === "LIVE" ? "LIVE" : workforce.tone;
  const runtimeBadge = house.status === "LIVE" ? "LIVE" : workforce.badge;
  const trucksLabel = house.trucks.length > 0
    ? `${house.trucks.length} trucks runtime`
    : "camions: source non câblée";

  return (
    <div className="fixed inset-0 z-50 bg-black/68 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col border-l border-amber-300/20 bg-slate-950/96 shadow-[-20px_0_55px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200">
              SSOT house living record
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">{workforce.businessName}</h2>
            <p className="mt-1 text-xs text-slate-400">{house.id}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusClass[runtimeTone]}`}>
                {runtimeBadge}
              </span>
              <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                {canonAgents.length} anges canon
              </span>
              <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                {trucksLabel}
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
            <InspectorRow label="owner principal" value={workforce.owner} />
            <InspectorRow label="nom business" value={workforce.businessName} />
            <InspectorRow label="primary_board" value={house.primaryBoardSlug} />
            <InspectorRow label="boards" value={house.boards.map((board) => board.slug).join(", ") || "UNKNOWN"} />
            <InspectorRow label="active_tasks" value={String(house.activeTasks)} />
          </div>

          <div className="mt-4 grid gap-4">
            <section className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                Mission maison
              </h3>
              <div className="grid gap-2 text-xs text-slate-200">
                <p><span className="text-slate-400">Mission:</span> {workforce.mission}</p>
                <p><span className="text-slate-400">Next:</span> {workforce.nextAction}</p>
                <p><span className="text-slate-400">Impact:</span> {workforce.impact}</p>
                <p><span className="text-slate-400">Blocage:</span> {workforce.blocker}</p>
                <p><span className="text-slate-400">Preuve attendue:</span> {workforce.proof}</p>
              </div>
            </section>

            <section className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                Anges canon en poste ({canonAgents.length}) · attribution canonique
              </h3>
              {canonAgents.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun ange canon attribué à cette maison.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {canonAgents.map((agent) => {
                    const liveStatus = rosterStatusByName.get(agent.name.toLowerCase());
                    return (
                      <div
                        key={`${house.id}-${agent.id}`}
                        className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs"
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                          style={{
                            background: `${agent.colorPrimary}22`,
                            color: agent.colorPrimary,
                            border: `1px solid ${agent.colorPrimary}66`,
                          }}
                        >
                          {agent.avatarEmoji || agent.no || "·"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold text-slate-100">{agent.name}</span>
                            <span className="shrink-0 rounded border border-slate-700 px-1.5 py-0.5 text-[8.5px] text-slate-300">
                              {liveStatus ?? "org"}
                            </span>
                          </div>
                          <p className="truncate text-[10px] text-slate-500">{agent.roleBadge || "—"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {commerce.length > 0 && (
              <section className="rounded-md border border-amber-300/20 bg-amber-300/8 p-3">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
                  Commerce / boutiques ({commerce.length})
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {commerce.map((shop) => (
                    <div key={shop.id} className="rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-slate-100">{shop.name}</span>
                        <span
                          className={`shrink-0 rounded border px-1.5 py-0.5 text-[8.5px] ${
                            shop.status === "LIVE"
                              ? statusClass.LIVE
                              : shop.status === "BROKEN"
                                ? statusClass.QUARANTINE
                                : statusClass.AMBER
                          }`}
                        >
                          {shop.status}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-slate-500">{shop.next_action}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {services.length > 0 && (
              <section className="rounded-md border border-cyan-300/20 bg-cyan-300/8 p-3">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                  Endpoints / services ({services.length})
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {services.map((svc) => (
                    <div
                      key={svc.id}
                      className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs"
                    >
                      <span className="truncate text-slate-200">{svc.label}</span>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[8.5px] ${svc.ok ? statusClass.LIVE : statusClass.AMBER}`}
                      >
                        {svc.status ?? (svc.ok ? "LIVE" : "?")}
                        {typeof svc.http_code === "number" ? ` ${svc.http_code}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {house.id === "calendar_tower" && (
              <section className="rounded-md border border-cyan-300/20 bg-cyan-300/8 p-3">
                <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                  <span>Cadence opérations (live)</span>
                  <span className="text-[9px] font-normal text-slate-400">
                    {cadence?.freshness ?? "…"} · {cadence?.totalLines ?? "—"}
                  </span>
                </h3>
                <div className="space-y-1.5">
                  {(cadence?.events ?? []).slice(0, 10).map((e, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-[11px]"
                    >
                      <span className="shrink-0 rounded bg-cyan-300/10 px-1.5 py-0.5 font-mono text-[9px] text-cyan-200">
                        {e.kind ?? "·"}
                      </span>
                      <span className="shrink-0 font-mono text-[9.5px] text-slate-400">
                        {e.ts ? new Date(e.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                      <span className="truncate text-slate-300">{e.summary}</span>
                    </div>
                  ))}
                  {(cadence?.events ?? []).length === 0 && (
                    <p className="text-[11px] text-slate-500">chargement cadence…</p>
                  )}
                </div>
                <p className="mt-2 text-[9px] text-slate-500">Source réelle : hub :8430 /api/calendar/upcoming</p>
              </section>
            )}

            {house.id === "mission_control_tower" && (
              <section className="rounded-md border border-violet-300/20 bg-violet-300/8 p-3">
                <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-violet-100">
                  <span>Linear · issues live (team COF)</span>
                  <span className="text-[9px] font-normal text-slate-400">
                    {linear ? (linear.ok ? `${linear.total} issues` : linear.reason ?? "source down") : "…"}
                  </span>
                </h3>
                <div className="space-y-1.5">
                  {(linear?.issues ?? []).slice(0, 12).map((iss) => (
                    <a
                      key={iss.id}
                      href={iss.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-[11px] hover:border-violet-300/40"
                    >
                      <span className="shrink-0 rounded bg-violet-300/10 px-1.5 py-0.5 font-mono text-[9px] text-violet-200">
                        {iss.id}
                      </span>
                      <span className="shrink-0 rounded border border-slate-700 px-1.5 py-0.5 text-[8.5px] text-slate-300">
                        {iss.state}
                      </span>
                      <span className="truncate text-slate-300">{iss.title}</span>
                    </a>
                  ))}
                  {linear && (linear.issues ?? []).length === 0 && (
                    <p className="text-[11px] text-slate-500">
                      {linear.ok ? "aucune issue" : linear.reason ?? "source down — pas d'invention"}
                    </p>
                  )}
                  {!linear && <p className="text-[11px] text-slate-500">chargement Linear…</p>}
                </div>
                <p className="mt-2 text-[9px] text-slate-500">Source réelle : api.linear.app (clé locale, jamais exposée)</p>
              </section>
            )}

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
                  <p className="text-xs text-slate-500">camions: source non câblée</p>
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

// P11 Sourate LXVIII Al-Muharrik · Commerce Machine Grid — 21 boutiques canon machine 100M€
type CommerceShop = {
  id: string;
  name: string;
  status: "LIVE" | "PARTIAL" | "CANON_GATE" | "AWAITING_SETUP" | "BROKEN";
  problem: string;
  next_action: string;
  owner_agent: string;
  proof_source: string;
};
const commerceStatusTone: Record<CommerceShop["status"], string> = {
  LIVE: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  PARTIAL: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
  CANON_GATE: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  AWAITING_SETUP: "border-slate-400/40 bg-slate-400/10 text-slate-300",
  BROKEN: "border-red-500/60 bg-red-500/15 text-red-200",
};
function CommerceMachineGrid({ shops }: { shops: CommerceShop[] }) {
  if (!shops || shops.length === 0) return null;
  const counts = shops.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <section className="mx-4 my-6 rounded-md border border-amber-400/35 bg-slate-950/85 p-5 shadow-[0_0_40px_rgba(245,158,11,0.18)] lg:mx-6">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
            COMMERCE MACHINE · {shops.length} boutiques canon Hub Vivant
          </p>
          <h2 className="mt-1 font-heading text-xl font-semibold text-white">
            Sourate LXV Adwāt · machine 100M€ Déc 2026
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
          {(["LIVE", "PARTIAL", "CANON_GATE", "AWAITING_SETUP", "BROKEN"] as const).map((s) => (
            <span key={s} className={`rounded border px-2 py-1 ${commerceStatusTone[s]}`}>
              {s} {counts[s] ?? 0}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shops.map((shop) => (
          <div
            key={shop.id}
            className={`rounded-md border p-3 transition hover:border-white/30 ${commerceStatusTone[shop.status]}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold text-white text-sm">{shop.name}</p>
              <span className="rounded border border-current/40 bg-slate-950/60 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                {shop.status}
              </span>
            </div>
            <p className="mt-2 text-[10.5px] text-slate-300 leading-snug line-clamp-3">
              <span className="text-red-300 font-semibold">⚠ </span>
              {shop.problem}
            </p>
            <p className="mt-2 text-[10.5px] text-emerald-200 leading-snug line-clamp-3">
              <span className="text-emerald-300 font-semibold">→ </span>
              {shop.next_action}
            </p>
            <div className="mt-2 flex items-center justify-between text-[9.5px] text-slate-400">
              <span>👤 {shop.owner_agent}</span>
              <span className="truncate max-w-[55%] text-right" title={shop.proof_source}>
                {shop.proof_source.slice(0, 30)}{shop.proof_source.length > 30 ? "…" : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] text-slate-500">
        source_tag: <code className="text-amber-300">COMMERCE_MACHINE_CANON_20260527</code> · 21 boutiques outbound vers 100M€
      </p>
    </section>
  );
}

// P11 Sourate LXVIII · Services Status Bar — 8 services canon LIVE probes
type ServiceProbe = { id: string; label: string; ok: boolean; status?: string | number | null; http_code?: number | null; url?: string; role?: string };
const serviceStatusTone: Record<string, string> = {
  LIVE: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  REDIRECT: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
  AUTH_REQUIRED: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  NOT_FOUND: "border-orange-400/40 bg-orange-400/10 text-orange-200",
  DEGRADED: "border-orange-500/50 bg-orange-500/15 text-orange-200",
  DOWN: "border-red-500/60 bg-red-500/15 text-red-200",
};
function ServicesStatusBar({ services }: { services: ServiceProbe[] }) {
  if (!services || services.length === 0) return null;
  return (
    <section className="mx-4 mt-4 rounded-md border border-cyan-400/30 bg-slate-950/80 p-4 lg:mx-6">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
          SERVICES LIVE · {services.length} endpoints canon Hub Vivant
        </p>
        <span className="text-[10px] text-slate-400">
          probe HTTP every snapshot poll · Sidq §35
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {services.map((svc) => {
          const statusKey = typeof svc.status === "string" ? svc.status : svc.ok ? "LIVE" : "DOWN";
          const tone = serviceStatusTone[statusKey] ?? serviceStatusTone.DOWN;
          return (
            <div key={svc.id} className={`rounded border p-2 ${tone}`} title={`${svc.role ?? ""} · ${svc.url ?? ""}`}>
              <div className="flex items-center justify-between gap-1">
                <p className="truncate text-[10px] font-semibold text-white">{svc.label}</p>
                <span className="text-[9px] font-mono">{svc.http_code ?? "—"}</span>
              </div>
              <p className="mt-1 text-[9px] uppercase tracking-wide">{statusKey}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// P11 Sourate LVI · Agents Freshness Bar — fresh/stale ratio compact widget
function AgentsFreshnessBar({ agents }: { agents?: Snapshot["agents"] }) {
  if (!agents) return null;
  const pct = Math.round(agents.freshness_ratio * 100);
  const tone = pct >= 50 ? "text-emerald-300" : pct >= 20 ? "text-amber-300" : "text-red-300";
  return (
    <section className="mx-4 mt-4 rounded-md border border-purple-400/30 bg-slate-950/80 p-4 lg:mx-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-300">
          AGENTS FRESHNESS · {agents.total} anges canon
        </p>
        <span className={`text-lg font-bold ${tone}`}>
          {agents.fresh}/{agents.total} fresh · {pct}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full ${pct >= 50 ? "bg-emerald-400" : pct >= 20 ? "bg-amber-400" : "bg-red-500"} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-[10.5px]">
        <div>
          <p className="text-emerald-300 font-semibold mb-1">FRESH ({agents.fresh}):</p>
          <p className="text-slate-300 leading-snug">
            {agents.fresh_names.length > 0 ? agents.fresh_names.slice(0, 10).join(" · ") : "—"}
          </p>
        </div>
        <div>
          <p className="text-red-300 font-semibold mb-1">STALE ({agents.stale}):</p>
          <p className="text-slate-400 leading-snug">
            {agents.stale_names_top.slice(0, 10).join(" · ")}
            {agents.stale > 10 ? ` · +${agents.stale - 10} more` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
