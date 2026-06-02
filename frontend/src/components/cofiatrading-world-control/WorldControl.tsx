"use client";

/* eslint-disable @next/next/no-img-element -- This screen uses exact raster slices from the V2 asset pack; Next/Image optimization can change sizing/crop. */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  Building2,
  CircleDollarSign,
  Factory,
  FileCheck2,
  Landmark,
  RadioTower,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { WorldMapLiving, resolveHouseIds, type InvItem, type TruthMapPayload } from "./WorldMapLiving";

import type {
  Snapshot,
  CofiaAgent,
  OpenClawTruck,
  OfferRecord,
  KnowledgeId,
  KnowledgeRecord,
  RouteRecord,
  InvestorRoomSnapshot,
  Status,
  TruckRow,
  HouseId,
  HouseDefinition,
  HouseView,
  HouseWorkforce,
  WorldNode,
  WorldAgent,
  WorldTruck,
  CityDistrict,
  CityRoute,
  RailStep,
  CityMachine,
} from "./world-control.types";

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
    proof: "Gateway loopback canon :18789/health uniquement ; port legacy retiré.",
    nextAction: "Afficher le statut live du snapshot, jamais une preuve Docker statique.",
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

const _disabledActions = ["SEND", "PUBLISH", "DEPLOY", "STRIPE WRITE"];
const northStarImage =
  "/assets/cofiatrading-world-control/cofiatrading-new-york-world-control-100m-arr.png";

// Attribution canonique service -> maison (sûre uniquement ; les non listés ne s'affichent dans aucune maison)
const SERVICE_HOUSE: Partial<Record<string, HouseId>> = {
  hub_8430: "mission_control_tower",
  mission_control_3000: "mission_control_tower",
  central_brain_8767: "central_brain",
  llm_proxy_11435: "central_brain",
  cofiapublisher_native_8000: "youtube_studio",
  cofiapublisher_8540: "youtube_studio",
  openclaw_gateway_18789: "openclaw_agent_barracks",
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
    owners: ["Jarod", "Claude", "Codex"],
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
    workers: ["Codex", "Atlas", "Claude", "Guardian"],
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
    mission: "Produire, certifier et preparer les renders COF IA Publisher.",
    nextAction: "Prouver les renders orphelins puis preparer le publish pack local.",
    impact: "acquisition",
    blocker: "Publication externe verrouillee; renders non prouves a certifier",
    proof: "publisherNative :8000 + assetsWarehouse + publisher legacy :8540.",
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
    mission: "Assets utilisables lus depuis snapshot live.",
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
  { id: "assets_warehouse", label: "Assets Warehouse", zone: "factory", x: 42, y: 82, icon: "AW", owner: "Lab / Brand", mission: "Assets source live -> posts", status: "LIVE", assetKey: "snapshot assetsWarehouse" },
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
  { name: "Reviewer", from: "compliance_port", to: "youtube_studio", mission: "Reviewer proof gate", payload: "compliance", color: "#fde68a", duration: 20, delay: -10 },
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
    workers: ["Codex", "Atlas", "Claude", "Guardian"],
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
    role: "Certifier renders puis publish pack local",
    next: "renders -> proof -> R8 publish lock",
    blocker: "publish externe verrouille",
    metric: "99 renders",
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
    machines: ["MP4 source live", "captions source live", "assets source live"],
    role: "Nourrir la production",
    next: "Assets -> posts / vidéos",
    blocker: "stock pas encore consommé",
    metric: "snapshot assetsWarehouse",
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

const _CITY_ROUTES: CityRoute[] = [
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

const _MOVING_AGENTS: MovingAgent[] = [
  { name: "Nova", from: "assets_warehouse", to: "youtube_studio", mission: "prépare video-01", payload: "MP4", color: "#67e8f9", duration: 12, delay: 0 },
  { name: "Isrāfīl", from: "youtube_studio", to: "site_seo_lab", mission: "publish / cross-post", payload: "vidéo", color: "#fbbf24", duration: 13, delay: -2 },
  { name: "Sonic", from: "youtube_studio", to: "vip_gate", mission: "short / Telegram", payload: "contenu", color: "#60a5fa", duration: 14, delay: -3 },
  { name: "Reviewer", from: "compliance_port", to: "youtube_studio", mission: "Reviewer proof gate", payload: "legal", color: "#fde68a", duration: 17, delay: -4 },
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

const _MOVING_TRUCKS: MovingTruck[] = [
  { name: "MP4 Truck", points: ["assets_warehouse", "youtube_studio"], payload: "renders natifs / proof", tone: "cyan", duration: 11, delay: 0 },
  { name: "Cash Truck", points: ["iron_office", "vip_gate"], payload: "291 EUR / 3 clients", tone: "amber", duration: 10, delay: -2 },
  { name: "Broker Truck", points: ["iron_office", "site_seo_lab"], payload: "CellXpert / IP / drafts", tone: "rose", duration: 15, delay: -4 },
  { name: "Signal Truck", points: ["mt4_signal_tower", "vip_gate"], payload: "STRAT signal", tone: "emerald", duration: 9, delay: -6 },
  { name: "Compliance Truck", points: ["compliance_port", "youtube_studio", "site_seo_lab"], payload: "Reviewer proof gate", tone: "rose", duration: 18, delay: -8 },
  { name: "Memory Truck", points: ["obsidian_library", "central_brain"], payload: "canon / memory", tone: "cyan", duration: 16, delay: -10 },
  { name: "Dispatch Truck", points: ["openclaw_agent_barracks", "mission_control_tower"], payload: "orders / 38 angels / 59 trucks", tone: "cyan", duration: 13, delay: -12 },
];

const CLIENT_FUNNEL_STEPS: RailStep[] = [
  { label: "Socials", value: "9 canaux", tone: "cyan" },
  { label: "Site", value: "runtime à connecter", tone: "cyan" },
  { label: "Telegram FREE", value: "à vérifier", tone: "amber" },
  { label: "Telegram VIP", value: "à vérifier", tone: "amber" },
  { label: "Stripe VIP", value: "source down", tone: "amber" },
  { label: "Copy Trading", value: "FXcess Mirror", tone: "amber" },
  { label: "Retention", value: "support David", tone: "cyan" },
  { label: "Upsell", value: "Premium / Elite", tone: "amber" },
];

const PRODUCTION_STEPS: RailStep[] = [
  { label: "Ideas", value: "ready", tone: "cyan" },
  { label: "Scripts", value: "drafts", tone: "cyan" },
  { label: "Captions", value: "source down", tone: "amber" },
  { label: "MP4", value: "source down", tone: "amber" },
  { label: "Reviewer", value: "proof req.", tone: "amber" },
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

// ── T10 EXACT IMAGE PACK V2 — backplate image + hotspots lus du manifest (zéro position inventée) ──
const EXACT_ASSET_BASE = "/cofiatrading/exact-image-pack-v2";
const EXACT_SRC_W = 1536;
const EXACT_SRC_H = 1024;
const EXACT_EXPECTED_ASSET_COUNT = 84;

type ManifestAsset = {
  id: string;
  name: string;
  category: string;
  box_xyxy: [number, number, number, number];
  width: number;
  height: number;
  description?: string;
  role?: string;
  click_action?: string;
  image: string;
};
type ManifestPayload = { source_size: [number, number]; assets: ManifestAsset[] };

function exactAssetZ(asset: ManifestAsset): number {
  if (asset.category === "01_layout_sections") return 10;
  if (asset.category === "07_icons_nav") return 20;
  if (asset.category === "02_city_buildings_15") return 30;
  if (asset.category === "04_trucks_routes_flows") return 40;
  if (asset.category === "03_agents_and_people") return 50;
  if (asset.category === "05_kpis_panels_ui") return 60;
  if (asset.category === "06_bottom_operating_panels") return 70;
  return 80;
}

const EXACT_BUILDING_HOUSE: Record<string, HouseId> = {
  mission_control_tower: "mission_control_tower",
  central_brain: "central_brain",
  iron_office: "iron_office",
  vip_gate: "vip_gate",
  trading_tower: "mt4_signal_tower",
  youtube_studio: "youtube_studio",
  site_seo_lab: "site_seo_lab",
  assets_warehouse: "assets_warehouse",
  openclaw_barracks: "openclaw_agent_barracks",
  paperclip_factory: "paperclip_factory",
  lightrag_observatory: "lightrag_observatory",
  obsidian_library: "obsidian_library",
  calendar_tower: "calendar_tower",
  compliance_port: "compliance_port",
  trading_academy: "trading_academy",
};

function exactBuildingHouse(assetId: string): HouseId | null {
  const m = assetId.match(/^building_\d+_(.+)$/);
  return m ? EXACT_BUILDING_HOUSE[m[1]] ?? null : null;
}

function exactKpiLive(id: string, s: Snapshot | null): string {
  const r = s?.revenue;
  switch (id) {
    case "kpi_mrr":
      return formatEur(r?.currentMrrEur ?? null);
    case "kpi_arr":
      return formatEur(r?.currentArrEur ?? null);
    case "kpi_vip":
      return formatNumber(r?.activeVip ?? null);
    case "kpi_assets_94":
      return `${formatNumber(s?.assetsWarehouse?.mp4Count ?? null)} MP4`;
    case "kpi_services_5_8":
      return `${(s?.services ?? []).filter((x) => x.ok).length}/${(s?.services ?? []).length}`;
    case "kpi_maisons_15":
      return formatNumber(s?.centralBrain?.housesCount ?? null);
    default:
      return "UNKNOWN";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Legacy exact raster renderer retained as a non-rendered rollback reference.

// ── T11 — scène = SECTION map centrale depuis le ZIP V2, pas le full screenshot ──
const MAP_SECTION_X1 = 170;
const MAP_SECTION_Y1 = 70;
const MAP_SECTION_W = 1095; // 1265 - 170
const MAP_SECTION_H = 570; // 640 - 70

// Statut canon par maison (jamais UNKNOWN si le canon donne l'info) — T11
const HOUSE_CANON_STATUS: Record<HouseId, Status> = {
  mission_control_tower: "LIVE",
  central_brain: "LIVE",
  iron_office: "AMBER",
  vip_gate: "AMBER",
  mt4_signal_tower: "AMBER",
  youtube_studio: "AMBER",
  site_seo_lab: "AMBER",
  assets_warehouse: "LIVE",
  openclaw_agent_barracks: "PAUSED",
  paperclip_factory: "PAUSED",
  lightrag_observatory: "AMBER",
  obsidian_library: "PAUSED",
  calendar_tower: "AMBER",
  compliance_port: "QUARANTINE",
  trading_academy: "AMBER",
};
const STATUS_DOT_COLOR: Record<Status, string> = {
  GREEN: "#34d399",
  LIVE: "#34d399",
  AMBER: "#f59e0b",
  UNKNOWN: "#64748b",
  PAUSED: "#64748b",
  QUARANTINE: "#ef4444",
  LOCKED: "#ef4444",
};

type T11HouseAsset = {
  assetId: string;
  houseId: HouseId;
  name: string;
  box: [number, number, number, number];
};

const T11_HOUSE_ASSETS: T11HouseAsset[] = [
  { assetId: "building_01_mission_control_tower", houseId: "mission_control_tower", name: "Mission Control Tower", box: [335, 85, 575, 290] },
  { assetId: "building_02_central_brain", houseId: "central_brain", name: "Central Brain", box: [585, 95, 810, 275] },
  { assetId: "building_03_iron_office", houseId: "iron_office", name: "Iron Office", box: [845, 92, 1055, 275] },
  { assetId: "building_04_vip_gate", houseId: "vip_gate", name: "VIP Gate", box: [1035, 155, 1240, 360] },
  { assetId: "building_05_trading_tower", houseId: "mt4_signal_tower", name: "Trading Tower", box: [210, 218, 390, 430] },
  { assetId: "building_06_youtube_studio", houseId: "youtube_studio", name: "YouTube Studio", box: [425, 245, 600, 440] },
  { assetId: "building_07_site_seo_lab", houseId: "site_seo_lab", name: "Site SEO Lab", box: [625, 285, 810, 465] },
  { assetId: "building_08_assets_warehouse", houseId: "assets_warehouse", name: "Assets Warehouse", box: [870, 295, 1075, 480] },
  { assetId: "building_09_openclaw_barracks", houseId: "openclaw_agent_barracks", name: "OpenClaw Barracks", box: [220, 440, 390, 580] },
  { assetId: "building_10_paperclip_factory", houseId: "paperclip_factory", name: "Paperclip Factory", box: [400, 380, 555, 545] },
  { assetId: "building_11_lightrag_observatory", houseId: "lightrag_observatory", name: "LightRAG Observatory", box: [575, 420, 760, 585] },
  { assetId: "building_12_obsidian_library", houseId: "obsidian_library", name: "Obsidian Library", box: [755, 405, 925, 575] },
  { assetId: "building_13_calendar_tower", houseId: "calendar_tower", name: "Calendar Tower", box: [985, 445, 1185, 620] },
  { assetId: "building_14_compliance_port", houseId: "compliance_port", name: "Compliance Port", box: [360, 520, 525, 685] },
  { assetId: "building_15_trading_academy", houseId: "trading_academy", name: "Trading Academy", box: [695, 525, 895, 710] },
];

const T11_HOUSE_BY_ID = new Map(T11_HOUSE_ASSETS.map((house) => [house.houseId, house]));

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const t11BoxInMap = (box: [number, number, number, number]) => {
  const [x1, y1, x2, y2] = box;
  const leftPx = clampNumber(x1 - MAP_SECTION_X1, 0, MAP_SECTION_W);
  const topPx = clampNumber(y1 - MAP_SECTION_Y1, 0, MAP_SECTION_H);
  const rightPx = clampNumber(x2 - MAP_SECTION_X1, 0, MAP_SECTION_W);
  const bottomPx = clampNumber(y2 - MAP_SECTION_Y1, 0, MAP_SECTION_H);
  return {
    left: `${(leftPx / MAP_SECTION_W) * 100}%`,
    top: `${(topPx / MAP_SECTION_H) * 100}%`,
    width: `${(Math.max(26, rightPx - leftPx) / MAP_SECTION_W) * 100}%`,
    height: `${(Math.max(26, bottomPx - topPx) / MAP_SECTION_H) * 100}%`,
  };
};

const t11HousePoint = (houseId: HouseId) => {
  const house = T11_HOUSE_BY_ID.get(houseId);
  if (!house) return { x: 0, y: 0 };
  const [x1, y1, x2, y2] = house.box;
  return {
    x: clampNumber((x1 + x2) / 2 - MAP_SECTION_X1, 16, MAP_SECTION_W - 16),
    y: clampNumber((y1 + y2) / 2 - MAP_SECTION_Y1, 18, MAP_SECTION_H - 18),
  };
};

const _t11RoutePath = (points: HouseId[]) =>
  points
    .map((houseId, index) => {
      const point = t11HousePoint(houseId);
      return `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    })
    .join(" ");

const formatVisualEur = (value: number | null | undefined, fallback: string) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${moneyFormatter.format(value)} €`
    : fallback;

const T11_AGENT_OVERLAYS = [
  { name: "Codex", from: "central_brain", to: "mission_control_tower", houseId: "central_brain", color: "#a855f7", box: [530, 140, 585, 205] },
  { name: "Claude", from: "mission_control_tower", to: "openclaw_agent_barracks", houseId: "central_brain", color: "#f87171", box: [720, 120, 775, 185] },
  { name: "Iron", from: "iron_office", to: "vip_gate", houseId: "iron_office", color: "#fb923c", box: [955, 135, 1010, 195] },
  { name: "Jarod", from: "openclaw_agent_barracks", to: "mission_control_tower", houseId: "openclaw_agent_barracks", color: "#f59e0b", box: [295, 380, 350, 455] },
  { name: "Atlas", from: "site_seo_lab", to: "mission_control_tower", houseId: "mt4_signal_tower", color: "#38bdf8", box: [750, 320, 805, 390] },
  { name: "Kevin", from: "calendar_tower", to: "mission_control_tower", houseId: "central_brain", color: "#34d399", box: [1135, 465, 1190, 545] },
  { name: "Marco", from: "mt4_signal_tower", to: "vip_gate", houseId: "mt4_signal_tower", color: "#22c55e", box: [855, 555, 910, 625] },
  { name: "Nova", from: "assets_warehouse", to: "youtube_studio", houseId: "youtube_studio", color: "#67e8f9", box: [548, 658, 620, 693] },
] as Array<{ name: string; from: HouseId; to: HouseId; houseId: HouseId; color: string; box: [number, number, number, number] }>;

const T11_TRUCK_OVERLAYS = [
  { name: "Assets", route: ["assets_warehouse", "youtube_studio"], color: "#f97316", box: [962, 365, 1045, 430] },
  { name: "Cash", route: ["iron_office", "vip_gate"], color: "#38bdf8", box: [740, 255, 820, 322] },
  { name: "Signal", route: ["mt4_signal_tower", "vip_gate"], color: "#34d399", box: [260, 334, 397, 390] },
  { name: "Calendar", route: ["calendar_tower", "mission_control_tower"], color: "#e5e7eb", box: [1075, 525, 1150, 585] },
] as Array<{ name: string; route: HouseId[]; color: string; box: [number, number, number, number] }>;




function WorldControlFrame({
  children,
  snapshot,
  error,
  secondsSinceSync,
}: {
  children: ReactNode;
  snapshot: Snapshot | null;
  error: string | null;
  secondsSinceSync: number;
}) {
  const serviceOk = (snapshot?.services ?? []).filter((service) => service.ok).length;
  const serviceTotal = snapshot?.services?.length ?? 0;
  const runtimeServiceOk = snapshot?.openclawRuntime?.counts?.servicesOk ?? null;
  const runtimeServiceTotal = snapshot?.openclawRuntime?.counts?.servicesTotal ?? null;
  const localControlReady = Boolean(snapshot?.openclawRepo?.ok && snapshot?.consoleIa?.ok);
  const controlLabel = serviceTotal
    ? `${serviceOk}/${serviceTotal}`
    : runtimeServiceTotal
      ? `${runtimeServiceOk ?? 0}/${runtimeServiceTotal}`
      : localControlReady
        ? "local ready"
        : "source down";
  const controlTone = controlLabel === "source down"
    ? "border-slate-600/40 bg-slate-950/70 text-slate-200"
    : runtimeServiceTotal && runtimeServiceOk === runtimeServiceTotal
      ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100"
      : localControlReady
        ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100"
      : "border-amber-300/30 bg-amber-300/10 text-amber-100";
  const fetched = snapshot?.fetchedAt ? formatRelativeTime(snapshot.fetchedAt) : "sync...";
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#02040a] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-cyan-300/15 bg-[#030712]/95 shadow-[0_12px_45px_rgba(2,6,23,0.55)] backdrop-blur-xl">
        <div className="flex min-h-[64px] flex-wrap items-center gap-3 px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-cyan-300/35 bg-cyan-300/10 text-[10px] font-black tracking-[0.18em] text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.16)]">
              COF
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/90">COFIATRADING WORLD CONTROL</p>
              <h1 className="truncate text-lg font-black uppercase tracking-[0.08em] text-white">Living World Map · canon preuves</h1>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] sm:flex sm:flex-wrap sm:justify-end">
            <span className={`rounded-md border px-2 py-1 font-black uppercase ${error ? "border-red-400/50 bg-red-500/10 text-red-200" : "border-emerald-400/35 bg-emerald-400/10 text-emerald-200"}`}>
              {error ? `ERR ${error}` : `SYNC ${secondsSinceSync}s`}
            </span>
            <span className="rounded-md border border-cyan-300/25 bg-cyan-300/8 px-2 py-1 font-bold text-cyan-100">
              snapshot {fetched}
            </span>
            <span className={`rounded-md border px-2 py-1 font-bold ${controlTone}`}>
              contrôle {controlLabel}
            </span>
            <span className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1 font-bold text-amber-100">
              no-false-green
            </span>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-cyan-400/0 via-cyan-300/45 to-amber-300/0" />
      </header>
      <main className="min-h-[calc(100vh+220px)] overflow-visible bg-[radial-gradient(circle_at_22%_0%,rgba(34,211,238,0.12),transparent_34%),radial-gradient(circle_at_76%_0%,rgba(251,191,36,0.08),transparent_28%),#02040a] pb-24">
        {children}
      </main>
    </div>
  );
}

type WorldControlProps = {
  initialSnapshot?: Snapshot | null;
  initialAngelRoster?: AngelRosterPayload | null;
  initialTruthMap?: TruthMapPayload | null;
};

export function WorldControl({ initialSnapshot = null, initialAngelRoster = null, initialTruthMap = null }: WorldControlProps = {}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [drawerTruckName, setDrawerTruckName] = useState<string | null>(null);
  const [selectedHouseId, setSelectedHouseId] = useState<HouseId | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<KnowledgeId | null>(null);
  const [showCastleDrawer, setShowCastleDrawer] = useState(false);
  const [showInvestorDrawer, setShowInvestorDrawer] = useState(false);
  // P10b · LIVE indicator visible (Al-Hayy + Al-Qarīb Sourate III)
  const [lastFetchTs, setLastFetchTs] = useState<number>(() => {
    const parsed = initialSnapshot?.fetchedAt ? Date.parse(initialSnapshot.fetchedAt) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  });
  const [secondsSinceSync, setSecondsSinceSync] = useState<number>(0);
  // CORAN V8 Sourate LVI · Angel Roster Manāzil al-Malā'ikah runtime sync
  const [angelRoster, setAngelRoster] = useState<AngelRosterPayload | null>(initialAngelRoster);

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
          setSnapshot(data);
          setError(null);
          setLastFetchTs(Date.now());
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
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const tickInterval = window.setInterval(() => {
      setSecondsSinceSync(Math.floor((Date.now() - lastFetchTs) / 1000));
    }, 1_000);
    return () => {
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
  const [_mutaqibCounts, setMutaqibCounts] = useState<{ total: number; last_1h: number; by_level: Record<string, number> } | null>(null);
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

  const openclawTrucks = snapshot?.openclaw?.garageTrucks ?? [];
  const offers = snapshot?.offers ?? [];
  const routes = snapshot?.routes ?? null;
  const routeRecords = routes ? (Object.values(routes) as RouteRecord[]) : [];
  const investorRoom = snapshot?.investor_room ?? null;
  const knowledgeRecords = Object.values(snapshot?.knowledge ?? {}) as KnowledgeRecord[];
  const _truckRows: TruckRow[] =
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

  const _openTruckDrawer = (truckName: string) => {
    setDrawerTruckName(truckName);
    setSelectedHouseId(null);
    setSelectedOfferId(null);
    setSelectedKnowledgeId(null);
    setShowCastleDrawer(false);
    setShowInvestorDrawer(false);
  };

  const keepHouseInspectionInsideMap = (_houseId: HouseId) => {
    setSelectedHouseId(null);
    setDrawerTruckName(null);
    setSelectedOfferId(null);
    setSelectedKnowledgeId(null);
    setShowCastleDrawer(false);
    setShowInvestorDrawer(false);
  };

  const _openOfferDrawer = (offerId: string) => {
    setSelectedOfferId(offerId);
    setSelectedHouseId(null);
    setDrawerTruckName(null);
    setSelectedKnowledgeId(null);
    setShowCastleDrawer(false);
    setShowInvestorDrawer(false);
  };

  const _openKnowledgeDrawer = (knowledgeId: KnowledgeId) => {
    setSelectedKnowledgeId(knowledgeId);
    setSelectedOfferId(null);
    setSelectedHouseId(null);
    setDrawerTruckName(null);
    setShowCastleDrawer(false);
    setShowInvestorDrawer(false);
  };

  const _openCastleDrawer = () => {
    setShowCastleDrawer(true);
    setShowInvestorDrawer(false);
    setSelectedKnowledgeId(null);
    setSelectedOfferId(null);
    setSelectedHouseId(null);
    setDrawerTruckName(null);
  };

  const _openInvestorDrawer = () => {
    setShowInvestorDrawer(true);
    setShowCastleDrawer(false);
    setSelectedKnowledgeId(null);
    setSelectedOfferId(null);
    setSelectedHouseId(null);
    setDrawerTruckName(null);
  };

  const rosterStatusByName = new Map(
    (angelRoster?.anges ?? []).map((angel) => [angel.name.toLowerCase(), angel.status]),
  );

  return (
    <WorldControlFrame
      snapshot={snapshot}
      error={error}
      secondsSinceSync={secondsSinceSync}
    >
        <div className="p-3 text-slate-100">
          {/* ── HERO : Living World Map est le rendu principal ──
           * ville iso SVG, maisons + agents cliquables, KPIs lus depuis les sources.
           * Les inspections maison restent dans WorldMapLiving; aucun drawer externe
           * n'est ouvert depuis la carte.
           * (Le poster ExactImageWorldControl est retiré du rendu — Erwin verbatim
           *  2026-05-29 : "tout intégré dans la map".) */}
          <div
            data-world-control-ready="living-world-hero"
            className="grid gap-3"
          >
            <div className="grid min-w-0 gap-3">
              <WorldMapLiving
                snapshot={snapshot}
                angelRoster={angelRoster}
                initialTruthMap={initialTruthMap}
                onSelectHouse={(id) => keepHouseInspectionInsideMap(id as HouseId)}
              />
            </div>
          </div>
      {drawerTruck ? (
        <TruckDrawer
          truck={drawerTruck}
          onClose={() => setDrawerTruckName(null)}
        />
      ) : null}
      {selectedHouse ? (
        <HouseDrawer
          house={selectedHouse}
          snapshot={snapshot}
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
    </WorldControlFrame>
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














type CalendarEventView = {
  ts: string | null;
  from: string | null;
  role: string | null;
  kind: string | null;
  summary: string;
};
type CalendarPayload = {
  ok: boolean;
  status?: string;
  freshness?: string;
  totalLines?: number | null;
  eventsReturned?: number | null;
  runAgeSec?: number | null;
  proofAgeSec?: number | null;
  emptyState?: string | null;
  proof?: { source?: string | null; snapshotPath?: string | null };
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
type LinearPayload = { ok: boolean; total?: number; issues?: LinearIssueView[]; reason?: string; status?: string; apiUsed?: boolean; cache?: { cachedAtUtc?: string | null; ageSec?: number | null; lastError?: string | null } };
type NotionDbView = { key: string; title: string; id: string | null };
type NotionPayload = {
  ok: boolean;
  status?: string;
  accessMode?: string;
  local?: {
    ok?: boolean;
    desktopRunning?: boolean;
    notionDbMtimeUtc?: string | null;
    cachedAliveBlocks?: number | null;
    proof?: string;
  };
  sync?: {
    ok?: boolean;
    errorCount?: number;
    newestPushUtc?: string | null;
    queuedLocalWrites?: number;
    proof?: string;
    errors?: { src: string; errorCount: number; lastError: string | null; lastPushedUtc: string | null }[];
  };
  writePath?: { mode?: string; queuePath?: string; consumer?: string; directSqliteWrite?: boolean };
  bootstrapAt?: string | null;
  databases?: NotionDbView[];
  sections?: string[];
  reason?: string;
};
type ObsidianPayload = {
  ok: boolean;
  total?: number;
  sections?: { section: string; notes: number }[];
  handoffs?: { codex: string | null; claude: string | null; openclaw: string | null };
  reason?: string;
};

// Couleur par statut de la flotte VPS (panel openclaw_agent_barracks).
// FAILED en rouge = la vérité n'est plus masquée derrière un "STALE" trompeur.
function vpsStatusColor(status: string): string {
  switch (status) {
    case "LIVE": return "#34d399"; // vert : done <=15min
    case "ROTATING": return "#38bdf8"; // bleu : attend son tour (normal)
    case "RUNNING": return "#fbbf24"; // ambre : exécution en cours
    case "STALE": return "#fb923c"; // orange : vrai retard >35min
    case "FAILED": return "#fb7185"; // rouge : agent en erreur
    default: return "#64748b"; // gris : WAITING / inconnu
  }
}

function HouseDrawer({
  house,
  snapshot,
  canonAgents,
  commerce,
  services,
  rosterStatusByName,
  onClose,
}: {
  house: HouseView;
  snapshot: Snapshot | null;
  canonAgents: CofiaAgent[];
  commerce: NonNullable<Snapshot["commerce_machine"]>;
  services: Snapshot["services"];
  rosterStatusByName: Map<string, string>;
  onClose: () => void;
}) {
  const workforce = HOUSE_WORKFORCE[house.id];
  const workerPool = snapshot?.workerPool;
  const workerPoolSummary = workerPool?.summary;
  const activeLaneText = workerPool?.activeLaneDistribution
    ? Object.entries(workerPool.activeLaneDistribution)
        .map(([lane, count]) => `${lane}:${String(count)}`)
        .join(" · ")
    : "SOURCE_MISSING";
  // Santé système LIVE — surfacée dans la maison central_brain (§54, tout dans la map)
	  const [sysHealth, setSysHealth] = useState<{
	    services?: Array<{ id: string; label: string; status: string }>;
	    servicesUp?: number;
	    servicesTotal?: number;
	    cofState?: {
	      ts_utc?: string | null;
	      freshMin?: number | null;
	      sections_ok?: number | null;
	      sections_total?: number | null;
	      stale_sections?: string[];
	      mrr_eur?: number | null;
	      active_vip?: number | null;
	      cost_month_eur?: number | null;
	      cost_budget_eur?: number | null;
	      cost_pct?: number | null;
	      agents_alive?: number | null;
	      agents_total?: number | null;
	      agents_blocked?: number | null;
	    } | null;
	    revenueCurrent?: {
	      mrr_eur?: number | null;
	      active_vip?: number | null;
	      cof_state_mrr_eur?: number | null;
	      cof_state_active_vip?: number | null;
	      revenue_delta_mrr_eur?: number | null;
	      revenue_delta_active_vip?: number | null;
	      revenue_consistency?: string | null;
	    } | null;
	    coordination?: {
	      overheat_archive?: { total_archived?: number; restored_this_session?: number };
	      restored_coordination_services?: string[];
	    };
	    vpsFleetAgents?: number | null;
  } | null>(null);
  useEffect(() => {
    if (house.id !== "central_brain") return;
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/system-health", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setSysHealth(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [house.id]);
  // Flotte VPS (offload Mac) — rendue dans la caserne openclaw_agent_barracks.
  const [vpsFleet, setVpsFleet] = useState<{
    status?: string;
    host?: string;
    total?: number;
    liveCount?: number;
    rotatingCount?: number;
    runningCount?: number;
    staleCount?: number;
    failedCount?: number;
    mirrorFresh?: boolean;
    mirrorAgeSec?: number | null;
    agents?: Array<{
      id: string;
      status: string;
      live: boolean;
      lastResult: string | null;
      lastError: string | null;
      ageSec: number | null;
    }>;
  } | null>(null);
  useEffect(() => {
    if (house.id !== "openclaw_agent_barracks") return;
    let cancelled = false;
    const load = () => {
      fetch("/api/cofiatrading-world-control/vps-fleet", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!cancelled) setVpsFleet(j);
        })
        .catch(() => {});
    };
    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [house.id]);
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
  const [notion, setNotion] = useState<NotionPayload | null>(null);
  useEffect(() => {
    if (house.id !== "obsidian_library") return;
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/notion", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setNotion(j as NotionPayload);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [house.id]);
  const [obsidian, setObsidian] = useState<ObsidianPayload | null>(null);
  useEffect(() => {
    if (house.id !== "obsidian_library") return;
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/obsidian", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setObsidian(j as ObsidianPayload);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [house.id]);
  const [inventory, setInventory] = useState<InvItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/inventory-matrix", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && Array.isArray(d?.items)) setInventory(d.items as InvItem[]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const houseInventory = inventory.filter((it) => resolveHouseIds(it).includes(house.id));
  const runtimeTone = house.status === "LIVE" ? "LIVE" : workforce.tone;
  const runtimeBadge = house.status === "LIVE" ? "LIVE" : workforce.badge;
  const trucksLabel = house.trucks.length > 0
    ? `${house.trucks.length} trucks runtime`
    : "camions: source non câblée";
  const ownerNames = workforce.owner.split("/").map((name) => name.trim().toLowerCase()).filter(Boolean);
  const chiefAgents = canonAgents.filter((agent) => {
    const rank = (agent.rankLayer ?? "").toLowerCase();
    const name = agent.name.toLowerCase();
    const orgRole = (agent.orgRole ?? "").toLowerCase();
    const rankWeight = typeof agent.rankLayerWeight === "number" ? agent.rankLayerWeight : 0;
    return (
      ownerNames.some((owner) => owner.includes(name) || name.includes(owner))
      || ["owner", "co_ceo", "manager", "chief", "voice"].includes(orgRole)
      || rankWeight >= 66
      || rank.startsWith("l0")
      || rank.startsWith("l1")
      || rank.startsWith("l2")
      || rank.startsWith("l3")
    );
  });
  const workerAgents = canonAgents.filter((agent) => !chiefAgents.some((chief) => chief.id === agent.id));
  const missionRows = [
    { label: "Mission creee par la maison", value: workforce.mission, tone: "text-emerald-100" },
    { label: "Ordre donne aux agents", value: workforce.nextAction, tone: "text-cyan-100" },
    { label: "Impact attendu", value: workforce.impact, tone: "text-amber-100" },
    { label: "Blocage a lever", value: workforce.blocker, tone: "text-rose-100" },
    { label: "Preuve de cloture", value: workforce.proof, tone: "text-slate-200" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/68 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col border-l border-amber-300/20 bg-slate-950/96 shadow-[-20px_0_55px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200">
              Maison mission factory · organigramme vivant
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">{workforce.businessName}</h2>
            <p className="mt-1 text-xs text-slate-400">{house.id}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusClass[runtimeTone]}`}>
                {runtimeBadge}
              </span>
              <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                {chiefAgents.length} chefs · {workerAgents.length} ouvriers
              </span>
              <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                {trucksLabel}
              </span>
              <span className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                mission active
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
            <InspectorRow label="chef principal" value={workforce.owner} />
            <InspectorRow label="nom business" value={workforce.businessName} />
            <InspectorRow label="board mission" value={house.primaryBoardSlug} />
            <InspectorRow label="boards relies" value={house.boards.map((board) => board.slug).join(", ") || "UNKNOWN"} />
            <InspectorRow label="tasks source" value={`${house.activeTasks} board tasks · mission runtime ci-dessous`} />
          </div>

          <div className="mt-4 grid grid-cols-4 gap-1 rounded-md border border-cyan-300/20 bg-slate-950/70 p-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-300">
            {["Mission", "Chefs", "Agents", "Preuves"].map((label, i) => (
              <span key={label} className={`rounded px-2 py-1 text-center ${i === 0 ? "bg-cyan-300/12 text-cyan-100" : "bg-slate-900/70"}`}>{label}</span>
            ))}
          </div>

          <div className="mt-4 grid gap-4">
            <section className="rounded-md border border-emerald-300/20 bg-emerald-300/8 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                Maison createur de mission
              </h3>
              <div className="grid gap-2 text-xs">
                {missionRows.map((row) => (
                  <div key={row.label} className="rounded-md border border-slate-700/60 bg-slate-950/72 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{row.label}</p>
                    <p className={`mt-1 leading-snug ${row.tone}`}>{row.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                Organigramme maison · chefs grands, ouvriers relies
              </h3>
              {canonAgents.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun ange canon attribué à cette maison.</p>
              ) : (
                <div className="grid gap-3">
                  {chiefAgents.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {chiefAgents.map((agent) => {
                        const liveStatus = rosterStatusByName.get(agent.name.toLowerCase());
                        return (
                          <div
                            key={`${house.id}-${agent.id}-chief`}
                            className="flex items-center gap-3 rounded-md border px-3 py-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                            style={{ borderColor: `${agent.colorPrimary}88`, background: `${agent.colorPrimary}18` }}
                          >
                            <span
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-base font-black"
                              style={{
                                background: `${agent.colorPrimary}26`,
                                color: agent.colorPrimary,
                                border: `1px solid ${agent.colorPrimary}88`,
                                boxShadow: `0 0 18px ${agent.colorAccent}33`,
                              }}
                            >
                              {agent.avatarEmoji || agent.no || "·"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-black text-slate-50">{agent.name}</span>
                                <span className="shrink-0 rounded border border-amber-300/40 bg-amber-300/10 px-1.5 py-0.5 text-[8.5px] font-black uppercase text-amber-100">
                                  chef
                                </span>
                              </div>
                              <p className="truncate text-[10px] text-slate-300">{agent.roleBadge || "—"} · {liveStatus ?? "org"}</p>
                              <p className="mt-1 line-clamp-2 text-[9.5px] text-slate-400">{agent.responsibilities?.[0] ?? workforce.nextAction}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                  {workerAgents.map((agent) => {
                    const liveStatus = rosterStatusByName.get(agent.name.toLowerCase());
                    return (
                      <div
                        key={`${house.id}-${agent.id}-worker`}
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

            {house.id === "central_brain" && (
              <section className="rounded-md border border-violet-300/25 bg-violet-300/5 p-3">
                <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
                  <span>Santé système · coordination</span>
                  <span className="text-[9px] font-normal text-slate-400">
                    {sysHealth ? `${sysHealth.servicesUp ?? 0}/${sysHealth.servicesTotal ?? 0} services UP` : "…"}
                  </span>
                </h3>
                {sysHealth ? (
                  <>
                    <div className="mb-3 grid gap-1.5 sm:grid-cols-2">
                      {(sysHealth.services ?? []).map((s) => (
                        <InspectorRow key={s.id} label={s.label} value={s.status} />
                      ))}
	                    </div>
	                    <div className="grid gap-1.5">
	                      <InspectorRow label="agents VPS (offload Mac)" value={String(sysHealth.vpsFleetAgents ?? "?")} />
	                      <InspectorRow
	                        label="cof_state"
	                        value={
	                          sysHealth.cofState
	                            ? `${sysHealth.cofState.sections_ok ?? "?"}/${sysHealth.cofState.sections_total ?? "?"} sections OK · age ${sysHealth.cofState.freshMin ?? "?"} min · stale ${(sysHealth.cofState.stale_sections ?? []).length}`
	                            : "SOURCE_MISSING"
	                        }
	                      />
	                      <InspectorRow
	                        label="cash / cout"
	                        value={
	                          sysHealth.cofState
	                            ? `MRR ${sysHealth.cofState.mrr_eur ?? "?"} EUR · VIP ${sysHealth.cofState.active_vip ?? "?"} · cout ${sysHealth.cofState.cost_month_eur ?? "?"}/${sysHealth.cofState.cost_budget_eur ?? "?"} EUR (${sysHealth.cofState.cost_pct ?? "?"}%)`
	                            : "SOURCE_MISSING"
	                        }
	                      />
	                      <InspectorRow
	                        label="revenue live overlay"
	                        value={
	                          sysHealth.revenueCurrent
	                            ? `backend ${sysHealth.revenueCurrent.mrr_eur ?? "?"} EUR/${sysHealth.revenueCurrent.active_vip ?? "?"} VIP · cof_state ${sysHealth.revenueCurrent.cof_state_mrr_eur ?? "?"} EUR/${sysHealth.revenueCurrent.cof_state_active_vip ?? "?"} VIP · ${sysHealth.revenueCurrent.revenue_consistency ?? "UNKNOWN"}`
	                            : "SOURCE_MISSING"
	                        }
	                      />
	                      <InspectorRow
	                        label="agents globaux"
	                        value={
	                          sysHealth.cofState
	                            ? `${sysHealth.cofState.agents_alive ?? "?"}/${sysHealth.cofState.agents_total ?? "?"} connected · ${sysHealth.cofState.agents_blocked ?? "?"} blocked`
	                            : "SOURCE_MISSING"
	                        }
	                      />
	                      <InspectorRow
	                        label="surchauffe 26/05"
	                        value={`${sysHealth.coordination?.overheat_archive?.total_archived ?? "?"} archivés · ${sysHealth.coordination?.overheat_archive?.restored_this_session ?? 0} coordination rebranchés`}
	                      />
	                      <InspectorRow
	                        label="Claude Keep7"
	                        value={
	                          workerPoolSummary
	                            ? `${workerPoolSummary.running ?? "?"} running · ${workerPoolSummary.completed ?? "?"} done · ${workerPoolSummary.distinctActiveLanes ?? "?"} lanes · queued ${workerPoolSummary.queuedTasks ?? "?"} · ${workerPool?.controlLoop?.verdict ?? workerPool?.status ?? "WATCH"}`
	                            : "SOURCE_MISSING"
	                        }
	                      />
	                      <InspectorRow label="Claude lanes actives" value={activeLaneText} />
	                    </div>
                    <p className="mt-2 text-[9px] text-slate-500">
                      Source live : /api/cofiatrading-world-control/system-health (probe ports + cof_state + coordination). Hub UI = :3000 (§54).
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-slate-500">chargement santé système…</p>
                )}
              </section>
            )}

            {house.id === "calendar_tower" && (
              <section className="rounded-md border border-cyan-300/20 bg-cyan-300/8 p-3">
                <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
	                  <span>Cadence opérations</span>
	                  <span className="text-[9px] font-normal text-slate-400">
	                    {cadence?.status ?? "…"} · {cadence?.freshness ?? "…"} · {cadence?.totalLines ?? "—"} lignes
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
	                    <p className="text-[11px] text-slate-500">
	                      {cadence ? `${cadence.emptyState ?? "NO_EVENTS"} · eventsReturned=${cadence.eventsReturned ?? 0}` : "chargement cadence…"}
	                    </p>
	                  )}
	                </div>
	                <p className="mt-2 text-[9px] text-slate-500">
	                  Source réelle : {cadence?.proof?.source ?? "Google Workspace 360 local"} · {cadence?.proof?.snapshotPath ?? "/Users/burakokyay/.openclaw/state/company_os/google_360_snapshot.json"} · runAge={cadence?.runAgeSec ?? "?"}s · proofAge={cadence?.proofAgeSec ?? "?"}s
	                </p>
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
                <p className="mt-2 text-[9px] text-slate-500">
                  Source locale-first : cache ~/.openclaw/state/linear_latest_issues_cache.json · API Linear seulement pour refresh contrôlé.
                  {linear?.cache?.cachedAtUtc ? ` Cache ${linear.cache.cachedAtUtc} · apiUsed=${String(linear.apiUsed ?? false)}` : ""}
                </p>
              </section>
            )}

            {house.id === "obsidian_library" && (
              <section className="rounded-md border border-slate-300/15 bg-slate-300/5 p-3">
                <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                  <span>Notion Desktop · local-first</span>
                  <span className="text-[9px] font-normal text-slate-400">
                    {notion
                      ? notion.ok
                        ? `${notion.databases?.length ?? 0} DBs · ${notion.sections?.length ?? 0} sections`
                        : notion.reason ?? "source down"
                      : "…"}
                  </span>
                </h3>
                {notion && (
                  <div className="mb-3 grid gap-1.5 sm:grid-cols-2">
                    <InspectorRow label="mode" value={notion.accessMode ?? "LOCAL_FIRST"} />
                    <InspectorRow label="desktop" value={notion.local?.desktopRunning ? "Notion.app ouvert" : "cache local seulement"} />
                    <InspectorRow label="cache" value={`${notion.local?.cachedAliveBlocks ?? "?"} blocks · ${notion.local?.notionDbMtimeUtc ?? "mtime ?"}`} />
                    <InspectorRow label="sync" value={`${notion.status ?? "UNKNOWN"} · errors=${notion.sync?.errorCount ?? "?"} · queue=${notion.sync?.queuedLocalWrites ?? 0}`} />
                  </div>
                )}
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {(notion?.databases ?? []).map((db) => (
                    <div
                      key={db.key}
                      className="truncate rounded border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-[11px] text-slate-300"
                    >
                      {db.title}
                    </div>
                  ))}
                </div>
                {notion && (notion.databases ?? []).length === 0 && (
                  <p className="text-[11px] text-slate-500">{notion.reason ?? "aucune DB"}</p>
                )}
                {!notion && <p className="text-[11px] text-slate-500">chargement Notion…</p>}
                <p className="mt-2 text-[9px] text-slate-500">
                  Source locale : Notion Desktop cache + ~/.openclaw/state/notion_dbs.json + notion_sync_state.json. API ignorée sauf probe explicite.
                </p>
                {notion?.sync?.errors && notion.sync.errors.length > 0 && (
                  <div className="mt-2 rounded border border-amber-300/20 bg-amber-300/8 p-2 text-[10px] text-amber-100">
                    {notion.sync.errors.slice(0, 3).map((err) => (
                      <p key={err.src} className="truncate">
                        {err.src}: {err.lastError ?? `${err.errorCount} erreurs`}
                      </p>
                    ))}
                  </div>
                )}
              </section>
            )}

            {house.id === "obsidian_library" && (
              <section className="rounded-md border border-emerald-300/15 bg-emerald-300/5 p-3">
                <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                  <span>Obsidian · vault canon (local)</span>
                  <span className="text-[9px] font-normal text-slate-400">
                    {obsidian ? (obsidian.ok ? `${obsidian.total} notes` : obsidian.reason ?? "source down") : "…"}
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {(obsidian?.sections ?? []).map((s) => (
                    <div
                      key={s.section}
                      className="flex items-center justify-between gap-1 rounded border border-slate-800 bg-slate-900/70 px-2 py-1 text-[10px]"
                    >
                      <span className="truncate text-slate-300">{s.section}</span>
                      <span className="shrink-0 font-mono text-emerald-200">{s.notes}</span>
                    </div>
                  ))}
                </div>
                {obsidian?.handoffs && (
                  <div className="mt-2 space-y-1 text-[10px] text-slate-400">
                    {obsidian.handoffs.codex && <p className="truncate">handoff codex: {obsidian.handoffs.codex}</p>}
                    {obsidian.handoffs.claude && <p className="truncate">handoff claude: {obsidian.handoffs.claude}</p>}
                    {obsidian.handoffs.openclaw && <p className="truncate">handoff openclaw: {obsidian.handoffs.openclaw}</p>}
                  </div>
                )}
                {!obsidian && <p className="text-[11px] text-slate-500">chargement vault…</p>}
                <p className="mt-2 text-[9px] text-slate-500">Source réelle locale : ~/Obsidian/COF_TRADING</p>
              </section>
            )}

            {houseInventory.length > 0 && (() => {
              const order = ["GREEN", "LIVE", "AMBER", "AMBER_REVERIFY", "RED", "QUARANTINE", "UNKNOWN"];
              const byStatus: Record<string, number> = {}; for (const it of houseInventory) byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
              const byCat: Record<string, InvItem[]> = {}; for (const it of houseInventory) (byCat[it.category] ||= []).push(it);
              const invC = (s: string) => s === "GREEN" || s === "LIVE" ? "#34d399" : s === "AMBER" || s === "AMBER_REVERIFY" ? "#f59e0b" : s === "RED" ? "#ef4444" : s === "QUARANTINE" ? "#fb7185" : "#64748b";
              return (
                <section className="rounded-md border border-cyan-300/20 bg-cyan-300/5 p-3">
                  <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100"><span>Inventaire rattaché</span><span className="text-[10px] font-normal text-slate-300">{houseInventory.length} items</span></h3>
                  <div className="mb-3 flex flex-wrap gap-1.5">{order.filter((s) => byStatus[s]).map((s) => (<span key={s} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold" style={{ borderColor: `${invC(s)}55`, color: invC(s) }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: invC(s) }} />{s} {byStatus[s]}</span>))}</div>
                  <div className="space-y-2">{Object.entries(byCat).sort((a, b) => b[1].length - a[1].length).map(([cat, list]) => (
                    <div key={cat}>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200/80">{cat} <span className="text-slate-500">· {list.length}</span></p>
                      <div className="grid gap-1 sm:grid-cols-2">{list.slice(0, 40).map((it) => (
                        <div key={it.id} className="flex items-start gap-1.5 rounded border border-slate-800 bg-slate-900/60 px-2 py-1" title={it.proof || it.blocker || it.nextAction || ""}>
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: invC(it.status) }} />
                          <span className="min-w-0 flex-1"><span className="block truncate text-[10.5px] text-slate-200">{it.name}</span>{(it.blocker || it.nextAction) && <span className="block truncate text-[8.5px] text-slate-500">{it.blocker || it.nextAction}</span>}</span>
                          <span className="shrink-0 text-[8px] font-bold" style={{ color: invC(it.status) }}>{it.status}</span>
                        </div>
                      ))}</div>
                      {list.length > 40 && <p className="mt-1 text-[8.5px] text-slate-500">+{list.length - 40} de plus…</p>}
                    </div>
                  ))}</div>
                  <p className="mt-2 text-[9px] text-slate-500">Source : /api/inventory-matrix ({inventory.length} items au total) · rattachés par houseId/catégorie · statut honnête (jamais GREEN par défaut)</p>
                </section>
              );
            })()}

            {house.id === "openclaw_agent_barracks" && (
              <section className="rounded-md border border-amber-300/25 bg-amber-300/5 p-3">
                <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
                  <span>Flotte VPS · offload Mac</span>
                  <span className="text-[9px] font-normal text-slate-400">
                    {vpsFleet ? `${vpsFleet.liveCount ?? 0}/${vpsFleet.total ?? 0} LIVE` : "…"}
                  </span>
                </h3>
                {vpsFleet ? (
                  <>
                    <p className="mb-2 text-[9px] text-slate-400">{vpsFleet.host ?? "VPS Hostinger"}</p>
                    <div className="mb-2 flex flex-wrap gap-1.5 text-[9px]">
                      {([
                        ["LIVE", vpsFleet.liveCount, "text-emerald-200 border-emerald-300/40 bg-emerald-300/10"],
                        ["ROTATING", vpsFleet.rotatingCount, "text-sky-200 border-sky-300/40 bg-sky-300/10"],
                        ["RUNNING", vpsFleet.runningCount, "text-amber-200 border-amber-300/40 bg-amber-300/10"],
                        ["STALE", vpsFleet.staleCount, "text-orange-200 border-orange-300/40 bg-orange-300/10"],
                        ["FAILED", vpsFleet.failedCount, "text-rose-200 border-rose-300/40 bg-rose-300/10"],
                      ] as Array<[string, number | undefined, string]>).map(([label, n, cls]) => (
                        <span key={label} className={`rounded border px-1.5 py-0.5 ${cls}`}>
                          {label} {n ?? 0}
                        </span>
                      ))}
                    </div>
                    {(vpsFleet.failedCount ?? 0) > 0 && (
                      <div className="mb-2 rounded border border-rose-400/40 bg-rose-500/10 p-2">
                        <p className="text-[10px] font-semibold text-rose-200">{"⚠ Agents en échec (vérité non masquée) :"}</p>
                        {(vpsFleet.agents ?? [])
                          .filter((a) => a.status === "FAILED")
                          .map((a) => (
                            <p key={a.id} className="truncate text-[9px] text-rose-100/90" title={a.lastError ?? ""}>
                              {a.id} — {a.lastError ?? "erreur"}
                            </p>
                          ))}
                      </div>
                    )}
                    <div className="grid gap-1 sm:grid-cols-2">
                      {(vpsFleet.agents ?? []).map((a) => (
                        <div
                          key={a.id}
                          className="flex items-start gap-1.5 rounded border border-slate-800 bg-slate-900/60 px-2 py-1"
                          title={a.lastError || a.lastResult || ""}
                        >
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: vpsStatusColor(a.status) }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[10.5px] text-slate-200">{a.id}</span>
                            <span className="block truncate text-[8.5px] text-slate-500">{a.lastResult ?? a.lastError ?? "—"}</span>
                          </span>
                          <span className="shrink-0 text-[8px] font-bold" style={{ color: vpsStatusColor(a.status) }}>
                            {a.status}
                            {typeof a.ageSec === "number" ? ` ${Math.round(a.ageSec / 60)}m` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[9px] text-slate-500">
                      {`Source live : /api/cofiatrading-world-control/vps-fleet · mirror ${vpsFleet.mirrorFresh ? "frais" : "périmé"} (${vpsFleet.mirrorAgeSec ?? "?"}s) · LIVE<=15min · ROTATING=attend son tour · FAILED jamais masqué. Hub :3000 (§54).`}
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-slate-500">chargement flotte VPS…</p>
                )}
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
}: {
  truck: OpenClawTruck;
  onClose: () => void;
}) {
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

        <div className="space-y-2 border-t border-slate-800 px-5 py-4">
          <div className="rounded-md border border-red-300/25 bg-red-500/10 px-4 py-3 text-xs text-red-100">
            Read-only proof drawer: refresh Stripe, mission composer, send, publish and deploy are disabled from this cockpit.
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs text-slate-400">
            Next action source: {truck.nextAction || "UNKNOWN"} · approval gate: {truck.approvalGate || "UNKNOWN"}
          </div>
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

export type AngelRosterPayload = {
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

// P11 Sourate LVI · Agents Freshness Bar — fresh/stale ratio compact widget
