"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveAgentType, avatarSeed, skinHex, hairHex, type AgentAvatarType } from "@/config/cofiatWorldIdentity";
import { ConsoleIAOverlay, type ConsoleIAInitialInbox } from "./ConsoleIAOverlay";
import { MrrKpiChip } from "./MrrKpiChip";
import { SupervisionDrawer } from "./SupervisionDrawer";
import { SiteVercelPanel } from "./SiteVercelPanel";

/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — CARTE ISO TACTIQUE (Cof-Island)
 * v3 (2026-05-31) — correction scale + états pilotés par mission.
 * Même emplacement, même shell, même contrat de props.
 * RÈGLES DURES appliquées :
 *   • MAISONS > AGENTS : bâtiments grands/premium ; persos scalés avec la
 *     carte, ≤ ~40% de la hauteur de leur maison, ancrés sur des slots
 *     devant leur porte (agents canon visibles + reliés, panneau complet).
 *   • ZÉRO mouvement gratuit : aucun déplacement au hasard. Un agent
 *     reste dans le parc repos SAUF si une donnée RÉELLE l'active :
 *       statut degraded/down/err → alerte
 *       event feed (message/VIP/Telegram → téléphone ; ticket/service/
 *       reply/publish → clavier ; check/probe/gateway/audit → inspection ;
 *       autre → travail). Sinon : idle.
 *   • Carte propre : terrain iso DOUX (districts en dégradé, pas de damier),
 *     routes de pierre fonctionnelles (highlight si maison sélectionnée),
 *     pas de contour/cercle/courbe décoratif, pas de camion, pas de halo géant.
 * Bind runtime : registry :8767 (statut), snapshot (KPIs + agents canon),
 * truth-map (événements prouvés qui pilotent les états actifs).
 * ════════════════════════════════════════════════════════════════ */

export type CanonAgent = {
  no: number | null; id: string; name: string; glyph: string; avatarEmoji: string;
  colorPrimary: string; colorAccent: string; roleBadge: string; house: string; houseColor: string;
  rankLayer: string; rankLayerWeight?: number; orgRole?: string; boss: string; engine: string; responsibilities: string[];
};
type HouseMissionAgent = {
  id: string; name: string; orgRole?: string; rankLayer?: string; rankLayerWeight?: number; roleBadge?: string; status?: string; responsibilities?: string[];
};
type HouseMissionRecord = {
  houseId: string; houseTitle: string; status: string; sourceTag?: string;
  mission: { id: string; title: string; status: string; nextAction: string; impact?: string; blocker?: string; proof: string; proofStatus?: string; sourceTag?: string; route?: string | null };
  chief?: HouseMissionAgent | null; chiefs?: HouseMissionAgent[]; workers?: HouseMissionAgent[]; agents?: HouseMissionAgent[];
  counts?: { agents?: number; chiefs?: number; workers?: number; activeTasks?: number; trucks?: number };
  localQueue?: { path?: string; dispatchLog?: string; status?: string; dispatches?: number; executedAtUtc?: string | null };
  assetSummary?: { total?: number; sleeping?: number; green?: number; amber?: number; red?: number; topSleeping?: string[] };
  toolSummary?: { total?: number; live?: number; amber?: number; unknown?: number; labels?: string[] };
  dispatches?: Array<{ agentId: string; agentName: string; role: string; action: string; target: string; status: string; proof?: string }>;
  revenueMissions?: Array<{ id: string; houseId: string; title: string; proof: string; status: string; target: string; agents: string[] }>;
  proofs?: Array<{ label: string; source: string; status: string }>;
};
type HouseOrchestratorPayload = {
  ok?: boolean; sourceTag?: string; generatedAtUtc?: string; executedAtUtc?: string | null;
  summary?: { houses?: number; queuedDispatches?: number; expiredQueuedDispatches?: number; localQueueTtlMinutes?: number; coveredAgents?: number; totalAgents?: number; assetsAssigned?: number; housesWithLocalQueue?: number; runtimeActiveDispatches?: number; paperclipLivingOrgActive?: number; paperclipLivingOrgCheckedAt?: string | null; paperclipLivingOrgProof?: string };
  houseMissions?: HouseMissionRecord[];
};
type SystemHealthPayload = {
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
  coordination?: {
    overheat_archive?: { total_archived?: number; restored_this_session?: number };
    restored_coordination_services?: string[];
  };
  vpsFleetAgents?: number | null;
};
type PublisherNativeProgressBucket = {
  current?: number | string | null;
  total?: number | string | null;
  done?: number | string | null;
  completed?: number | string | null;
  rendered?: number | string | null;
  renders?: number | string | null;
  frames?: number | string | null;
  keyframes?: number | string | null;
};
type PublisherNativeWorkorder = {
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
export type CofiaSnapshot = {
  sourceTag?: string;
  revenue?: { currentMrrEur?: number | null; currentArrEur?: number | null; activeVip?: number | null; pastDueEur?: number | null; pastDueCount?: number | null };
  centralBrain?: { housesCount?: number | null };
  assetsWarehouse?: { mp4Count?: number | null; captionsCount?: number | null; assetsInventoryCount?: number | null };
  publisherNative?: {
    ok?: boolean;
    sourceTag?: string | null;
    mode?: string | null;
    state?: string | null;
    global_alert?: boolean | null;
    globalAlert?: boolean | null;
    outputDir?: string | null;
    counts?: { renders?: number | null; archived?: number | null; orphan?: number | null; goldProved?: number | null; unproven?: number | null };
    batch?: PublisherNativeProgressBucket | null;
    workorders?: PublisherNativeWorkorder[] | Record<string, PublisherNativeWorkorder | null> | null;
    qualityTruth?: { falseGreenPatched?: boolean | null; goldenCandidateScore?: number | null; goldenCandidateStatus?: string | null };
    publishLock?: { allowed?: boolean | null; reason?: string | null };
  };
  publisherBridge?: {
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
  videoAvailability?: {
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
  services?: Array<{ id?: string; label?: string; ok?: boolean; status?: string; role?: string; url?: string; http_code?: number | null }>;
  fetchedAt?: string;
  agentsCanon?: { ok?: boolean; count?: number; sourceTag?: string; agents?: CanonAgent[] };
  houseMissions?: HouseMissionRecord[];
  openclawRuntime?: {
    sourceTag: string; status: string;
    counts: { total: number; fresh: number; stale: number; noHeartbeat: number; disabled: number; tickEnabled: number; tickExpected: number; servicesOk: number; servicesTotal: number; lobsterConfigured: number | null; lobsterEnabled: number | null };
    jarod: { name: string; runtimeStatus: string; proof: string; nextAction: string } | null;
    services: Array<{ id: string; label: string; ok: boolean; status: string; http_code: number | null }>;
    agents: Array<{ id: string; name: string; team: string; homeHouse: string; runtimeStatus: string; tickEnabled: boolean; proof: string; nextAction: string }>;
    problems: Array<{ severity: string; title: string; proof: string; patch: string }>;
  };
  openclawRepo?: { ok?: boolean; status?: string; sourceTag?: string; proof?: string; branch?: string | null; commit?: string | null; remoteUrl?: string | null };
  consoleIa?: { ok?: boolean; status?: string; sourceTag?: string; mode?: string; proof?: string; paths?: { packetsDir?: string; responsesDir?: string; packetsJsonl?: string } };
  consoleIaInbox?: ConsoleIAInitialInbox | null;
  houseOrchestrator?: HouseOrchestratorPayload;
  toolOperatingContracts?: ToolOperatingContractsPayload;
  hubSourceLedger?: HubSourceLedgerPayload | null;
  hubWiring?: HubWiringPayload | null;
};
export type AngelStatus = "LIVE" | "OPERATIONAL_PARTIAL" | "CANON_GATE" | "AWAITING_SETUP" | "DEGRADED" | "BROKEN";
export type Angel = { id: number; name: string; name_ar: string; platform: string; manzilah: string; status: AngelStatus; mission: string; stack?: string; proof_url?: string; arr_impact_eur_year?: number };
export type FeedEvent = { id: string; kind?: string; status?: string; label: string; source?: string; proof?: string; ts?: string; house_id?: string | null };
type ToolBadge = { key: string; label: string; short: string; color: string; monthlyEur?: number | null; source: string };
const WORLD_MAP_STRICT_CLIP_ID = "cof-world-map-strict-clip";
const WORLD_MAP_VISUAL_GUARD_SOURCE_TAG = "CODEX_WORLD_MAP_VISUAL_GUARD_20260603";
const CAMERA_Z_EPSILON = 0.0005;
const CAMERA_XY_EPSILON = 0.03;
const COFIAPUBLISHER_KEYFRAME_BATCH_TOTAL = 56;
const COFIAPUBLISHER_ALERT_HOUSES = new Set(["youtube_studio", "assets_warehouse", "cofiapublisher_render_farm", "cofiapublisher_diffusion"]);
type AgentTelemetry = { idleSec: number; activeSec: number; currentState: AgentState; stateSince: number; lastAction?: string };
type AgentWorkProfile = {
  currentAction: string;
  lastAction: string;
  nextAction: string;
  proof: string;
  tool: ToolBadge | null;
  costDailyLabel: string;
  costMissionLabel: string;
  costProof: string;
};
export type Truck = { id: string; name: string; from: string; to: string; payload: string; owner: string; cadence?: string; kind?: string; source?: string };
export type AngelRoster = { total_anges?: number; counts?: { live: number; operational_partial: number; canon_gate: number; awaiting_setup: number; degraded: number; broken: number }; anges?: Angel[] };

/* ════════ Projection iso ════════ */
const ISO_W = 32, ISO_H = 16;
const WORLD_Y_OFFSET = 0;
const isoProject = (wx: number, wy: number) => ({ sx: (wx - wy) * (ISO_W / 2), sy: (wx + wy) * (ISO_H / 2) });
const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/* ════════ Districts (zones douces) ════════ */
type ZoneId = "core" | "knowledge" | "publishing" | "academy" | "revenue" | "risk";
const ZONES: Record<ZoneId, { label: string; sub: string; floor: string; edge: string }> = {
  core:       { label: "CORE",       sub: "Command & Brain",         floor: "#1c3358", edge: "#2f9bff" },
  knowledge:  { label: "KNOWLEDGE",  sub: "Vault · Graph · Backlog", floor: "#2a2160", edge: "#a78bfa" },
  publishing: { label: "PUBLISHING", sub: "Studio · Assets · Site",  floor: "#48203a", edge: "#ff5b7f" },
  academy:    { label: "ACADEMY",    sub: "Markets & Education",      floor: "#173f36", edge: "#2dd4bf" },
  revenue:    { label: "REVENUE",    sub: "CRM · VIP · Brokers",      floor: "#3e3318", edge: "#ffc93c" },
  risk:       { label: "RISK",       sub: "Compliance & Cadence",     floor: "#43202a", edge: "#ff5470" },
};
/* ════════ 15 maisons ════════ */
type BuildingType = "command_tower" | "brain" | "village" | "vault" | "observatory" | "factory" | "studio" | "warehouse" | "lab" | "signal_tower" | "academy" | "business" | "gate" | "compliance" | "calendar" | "notebook_alm" | "proof_ledger";
type House = { id: string; name: string; sub: string; x: number; y: number; w: number; h: number; type: BuildingType; zone: ZoneId; roof: "flat" | "pitch" | "saw" | "dome" | "stepped"; levels: number; wall: string; roofColor: string; accent: string; role: string };
const HOUSES: House[] = [
  { id: "obsidian_library", name: "Knowledge Vault", sub: "Obsidian & Drive", x: 50, y: 11, w: 6, h: 5, type: "vault", zone: "knowledge", roof: "flat", levels: 4, wall: "#222b46", roofColor: "#0b1022", accent: "#cbd5f5", role: "Canon, Drive index et bundles sources" },
  { id: "lightrag_observatory", name: "Lighthouse Observatory", sub: "Semantic graph", x: 60, y: 18, w: 6, h: 5, type: "observatory", zone: "knowledge", roof: "dome", levels: 6, wall: "#281e54", roofColor: "#120a28", accent: "#a78bfa", role: "Mémoire sémantique LightRAG, recall sourcé" },
  { id: "paperclip_factory", name: "Paperclip Factory", sub: "Backlog scoring", x: 43, y: 21, w: 7, h: 5, type: "factory", zone: "knowledge", roof: "saw", levels: 4, wall: "#2e1a4d", roofColor: "#140a24", accent: "#7c5cff", role: "Scoring tâches Paperclip et nettoyage backlog" },
  { id: "mt4_signal_tower", name: "Trading Tower", sub: "Markets & Research", x: 22, y: 26, w: 6, h: 6, type: "signal_tower", zone: "academy", roof: "stepped", levels: 8, wall: "#0e261d", roofColor: "#04100a", accent: "#00e676", role: "Recherche trading, paper analytics; STRAT-17/18 AMBER tant que dernier signal runtime, compte et risk gate ne sont pas prouves" },
  { id: "trading_academy", name: "Trading Academy", sub: "cofiatrading Academy", x: 34, y: 44, w: 8, h: 5, type: "academy", zone: "academy", roof: "pitch", levels: 5, wall: "#163a5b", roofColor: "#081726", accent: "#38bdf8", role: "Académie : site public → modules → preuves → Trading Tower" },
  { id: "central_brain", name: "Central Brain", sub: "AI Meta-Surveillance", x: 47, y: 32, w: 7, h: 7, type: "brain", zone: "core", roof: "dome", levels: 7, wall: "#2a1455", roofColor: "#100522", accent: "#8b5cf6", role: "Orchestration cross-IA, mémoire vivante, routing missions" },
  { id: "mission_control_tower", name: "Command Tower", sub: "Command & Control", x: 57, y: 36, w: 7, h: 6, type: "command_tower", zone: "core", roof: "stepped", levels: 9, wall: "#103354", roofColor: "#05131f", accent: "#2f9bff", role: "Tour de contrôle, board, priorités, routing GO" },
  { id: "openclaw_agent_barracks", name: "Agents Village", sub: "OpenClaw agents", x: 70, y: 50, w: 9, h: 5, type: "village", zone: "core", roof: "pitch", levels: 3, wall: "#412608", roofColor: "#160a03", accent: "#ff7a00", role: "Runtime OpenClaw et performance agents" },
  { id: "youtube_studio", name: "COF IA Publisher", sub: "Video Production Machine", x: 90, y: 23, w: 7, h: 5, type: "studio", zone: "publishing", roof: "flat", levels: 5, wall: "#46131d", roofColor: "#15050a", accent: "#ff2d55", role: "Machine vidéo : scénarios, render, review, timeline, drafts" },
  { id: "assets_warehouse", name: "Publisher Suite", sub: "Assets · Voice · Distribution", x: 95, y: 39, w: 7, h: 5, type: "warehouse", zone: "publishing", roof: "saw", levels: 4, wall: "#073634", roofColor: "#021413", accent: "#14b8a6", role: "Assets brand, render gallery, voix, packaging, distribution" },
  { id: "site_seo_lab", name: "Site & SEO Lab", sub: "Website & Growth", x: 12, y: 49, w: 6, h: 5, type: "lab", zone: "publishing", roof: "flat", levels: 5, wall: "#122036", roofColor: "#dbe6f5", accent: "#7dd3fc", role: "Site, SEO, tests locaux et deploy readiness" },
  { id: "iron_office", name: "Revenue & CRM", sub: "MRR / VIP / Brokers", x: 30, y: 56, w: 6, h: 5, type: "business", zone: "revenue", roof: "stepped", levels: 6, wall: "#564013", roofColor: "#1d1305", accent: "#ffd400", role: "Revenue, CRM, VIP, FTD et diagnostic brokers" },
  { id: "vip_gate", name: "VIP Gate", sub: "Telegram Free / VIP", x: 40, y: 70, w: 6, h: 5, type: "gate", zone: "revenue", roof: "pitch", levels: 4, wall: "#0e4576", roofColor: "#05182c", accent: "#00d9ff", role: "Porte communautaire Telegram Free/VIP, accès et rétention" },
  { id: "compliance_port", name: "Compliance Gate", sub: "CNMV · AEPD · ESMA", x: 82, y: 71, w: 6, h: 5, type: "compliance", zone: "risk", roof: "pitch", levels: 5, wall: "#460914", roofColor: "#150206", accent: "#ff3b52", role: "Compliance CNMV/AEPD/ESMA, safety, DLP, GO packets" },
  { id: "calendar_tower", name: "Calendar Tower", sub: "Recurring missions", x: 94, y: 57, w: 6, h: 5, type: "calendar", zone: "risk", roof: "stepped", levels: 7, wall: "#432b00", roofColor: "#120b00", accent: "#ffb000", role: "Cadence missions et tâches agents récurrentes" },
];
/* ════════ Modules opérationnels (HORS 15 maisons canon) — ALM + Proof Ledger ════════
 * Bâtiments inspectables, statut HONNÊTE config (no-false-green) : non branchés au
 * registry :8767 → statut "MODULE" (violet, ni LIVE ni RED). Placés au centre (zone
 * core) pour remplir le cœur de carte et rester command-adjacent (§23 ALM / §24 Proof). */
const MODULES: House[] = [
  { id: "notebook_alm", name: "NotebookLM", sub: "Google NotebookLM · grounding · 8 notebooks", x: 50, y: 44, w: 6, h: 5, type: "notebook_alm", zone: "core", roof: "flat", levels: 4, wall: "#2d2440", roofColor: "#161226", accent: "#f3e2b3", role: "Google NotebookLM (knowledge grounding). État live (notebooks/fraîcheur) lu via /api/cofiatrading-world-control/notebooklm — voir Proof Ledger › NotebookLM. 0 API publique → push via Chrome cowork." },
  { id: "proof_ledger", name: "Proof Ledger", sub: "Preuve · Audit · No-False-Green", x: 63, y: 48, w: 7.2, h: 5.8, type: "proof_ledger", zone: "core", roof: "stepped", levels: 6, wall: "#1b2230", roofColor: "#0b1018", accent: "#cbd5e1", role: "Registre de preuves : tout GREEN/LIVE porte sa preuve sourçable (no-false-green). Source config — vert seulement si preuve réelle." },
];
/* ════════ Maisons PRÉVUES (à construire) — expansion CofiaPublisher (moteur 100M€ déc 2026). ════════
 * Statut honnête "PLANNED" (🚧 PRÉVUE, ambre), PAS branchées au registry :8767 (n'existent pas encore).
 * Erwin GO 2026-06-02 « invente-le, prends des initiatives ». Les 2 maisons que la roadmap prévoit. */
const PLANNED_HOUSES: House[] = [
  { id: "cofiapublisher_render_farm", name: "CofiaPublisher · Render Farm", sub: "🚧 PRÉVUE · scale render 1 vidéo/jour → flotte", x: 80, y: 14, w: 7, h: 5, type: "factory", zone: "publishing", roof: "saw", levels: 5, wall: "#3a1228", roofColor: "#140309", accent: "#ff7ab0", role: "PRÉVUE / à construire : ferme de rendu pour scaler la production vidéo CofiaPublisher (moteur 100M€)." },
  { id: "cofiapublisher_diffusion", name: "CofiaPublisher · Diffusion", sub: "🚧 PRÉVUE · multi-plateforme · scheduling viral", x: 84, y: 49, w: 7, h: 5, type: "studio", zone: "publishing", roof: "stepped", levels: 5, wall: "#3a1228", roofColor: "#140309", accent: "#ff7ab0", role: "PRÉVUE / à construire : diffusion multi-plateforme (YouTube/IG/TikTok), scheduling viral CofiaPublisher." },
];
const PLANNED_IDS = new Set<string>(["cofiapublisher_render_farm", "cofiapublisher_diffusion"]);
const ALL_HOUSES: House[] = [...HOUSES, ...MODULES, ...PLANNED_HOUSES];
const MODULE_IDS = new Set<string>(["notebook_alm", "proof_ledger"]);
const HOUSE_BY_ID: Record<string, House> = Object.fromEntries(ALL_HOUSES.map((h) => [h.id, h]));
type HouseTab = "live" | "vue" | "kpis" | "anges" | "machines" | "inventaire" | "hub";
type CanonicalEmbed = { accent: string; label: string; title: string; url: string; canonicalUrl: string };
const TRADING_RESEARCH_OS_URL = "http://127.0.0.1:8799/trading_research_os_v3.html?tab=vip&page=v-compliance";
const CANONICAL_EMBEDS_BY_HOUSE: Partial<Record<string, CanonicalEmbed>> = {
  youtube_studio: {
    accent: "#ff2d55",
    label: "CofiaPublisher :8540",
    title: "CofiaPublisher - rendu et Asset Vault",
    url: "/api/cofiatrading-world-control/cofiapublisher?view=html",
    canonicalUrl: "http://127.0.0.1:8540",
  },
  mt4_signal_tower: {
    accent: "#00e676",
    label: "Trading Research OS :8799",
    title: "Trading Research OS - Data & Finances",
    url: TRADING_RESEARCH_OS_URL,
    canonicalUrl: TRADING_RESEARCH_OS_URL,
  },
  // De-dup (bug patron) : iron_office (Revenue/CRM) + site_seo_lab (Site/SEO) NE partagent PLUS
  // l'iframe Trading :8799 ; chacun affiche SA donnée dans son volet (MRR réel / Vercel).
  // Seul mt4_signal_tower (Trading) reste mappé sur Trading Research OS :8799.
};
const defaultHouseTab = (houseId: string): HouseTab => CANONICAL_EMBEDS_BY_HOUSE[houseId] ? "live" : "vue";

/* ════════ Routes (chemins réels entre maisons) ════════ */
const ROAD_LINKS: Array<[string, string, "main" | "second"]> = [
  ["central_brain", "mission_control_tower", "main"], ["mission_control_tower", "openclaw_agent_barracks", "main"], ["central_brain", "openclaw_agent_barracks", "second"],
  ["central_brain", "paperclip_factory", "main"], ["paperclip_factory", "lightrag_observatory", "second"], ["lightrag_observatory", "obsidian_library", "second"], ["paperclip_factory", "obsidian_library", "second"],
  ["central_brain", "trading_academy", "main"], ["trading_academy", "mt4_signal_tower", "second"], ["mt4_signal_tower", "site_seo_lab", "second"],
  ["mission_control_tower", "iron_office", "main"], ["iron_office", "trading_academy", "second"], ["iron_office", "vip_gate", "main"], ["vip_gate", "compliance_port", "second"],
  ["mission_control_tower", "youtube_studio", "main"], ["youtube_studio", "assets_warehouse", "main"], ["assets_warehouse", "calendar_tower", "second"], ["calendar_tower", "compliance_port", "second"],
  ["site_seo_lab", "trading_academy", "second"], ["openclaw_agent_barracks", "assets_warehouse", "second"],
  // modules ALM + Proof reliés au cœur (Command/Brain/Compliance) — intégrés, pas flottants
  ["mission_control_tower", "notebook_alm", "main"], ["notebook_alm", "proof_ledger", "main"], ["proof_ledger", "central_brain", "second"], ["proof_ledger", "compliance_port", "second"],
  // Proof Ledger = bus de preuve: audit argent, publication, site, backlog, Notion/Knowledge et agents.
  ["proof_ledger", "paperclip_factory", "second"], ["proof_ledger", "obsidian_library", "second"], ["proof_ledger", "youtube_studio", "second"], ["proof_ledger", "site_seo_lab", "second"], ["proof_ledger", "iron_office", "second"], ["proof_ledger", "openclaw_agent_barracks", "second"],
];

const ANGEL_HOME_BY_ID: Record<number, string> = {
  1: "central_brain", 2: "central_brain", 3: "youtube_studio", 4: "iron_office", 5: "compliance_port", 6: "compliance_port", 7: "compliance_port", 8: "vip_gate",
  9: "youtube_studio", 10: "youtube_studio", 11: "site_seo_lab", 12: "youtube_studio", 13: "assets_warehouse", 14: "site_seo_lab", 15: "site_seo_lab", 16: "site_seo_lab",
  17: "trading_academy", 18: "vip_gate", 19: "iron_office", 20: "iron_office", 21: "calendar_tower", 22: "mt4_signal_tower", 23: "mt4_signal_tower", 24: "site_seo_lab",
  25: "openclaw_agent_barracks", 26: "assets_warehouse", 27: "trading_academy", 28: "compliance_port", 29: "compliance_port", 30: "paperclip_factory", 31: "obsidian_library", 32: "lightrag_observatory",
  33: "central_brain", 34: "compliance_port", 35: "mt4_signal_tower", 36: "mt4_signal_tower", 37: "calendar_tower", 38: "mission_control_tower",
};
const SERVICE_HOME_BY_ID: Record<string, string> = {
  hub_8430: "mission_control_tower", mission_control_3000: "mission_control_tower", central_brain_8767: "central_brain", llm_proxy_11435: "central_brain",
  cofiapublisher_native_8000: "youtube_studio", cofiapublisher_8540: "youtube_studio", openclaw_gateway_18789: "openclaw_agent_barracks", inventory_8433: "assets_warehouse", lightrag_9621: "lightrag_observatory", paperclip_3100: "paperclip_factory",
  search_api_8799: "site_seo_lab", api_search_8799: "site_seo_lab", recherche_api_8799: "site_seo_lab",
  crm_stripe_4242: "iron_office", stripe_crm_4242: "iron_office", iron_crm_4242: "iron_office",
};

/* mots-clés event → maison (matching feed réel) */
const HOUSE_KEYWORDS: Record<string, string[]> = {
  iron_office: ["iron", "revenue", "crm", "mrr", "ftd", "broker", "stripe", "past_due", "past due"],
  youtube_studio: ["publish", "video", "render", "youtube", "cofiapublisher", "mp4", "studio"],
  central_brain: ["brain", "registry", "route", "orchestr", "memory", "central"],
  mt4_signal_tower: ["trade", "signal", "strat", "mt4", "rithmic", "market", "tower"],
  compliance_port: ["complian", "cnmv", "aepd", "esma", "legal", "dlp", "safety", "gate"],
  vip_gate: ["telegram", "vip", "channel", "broadcast", "dm", "community"],
  site_seo_lab: ["site", "seo", "deploy", "web", "lab"],
  assets_warehouse: ["asset", "voice", "distribution", "inventory", "warehouse", "caption"],
  openclaw_agent_barracks: ["openclaw", "lobster", "gateway", "heartbeat", "barrack", "agent"],
  lightrag_observatory: ["lightrag", "graph", "embedding", "recall", "observ"],
  obsidian_library: ["obsidian", "drive", "vault", "canon", "library"],
  paperclip_factory: ["paperclip", "backlog", "scoring", "factory"],
  calendar_tower: ["calendar", "cadence", "recurring", "schedule"],
  trading_academy: ["academy", "course", "module", "education"],
  mission_control_tower: ["command", "mission", "board", "priorit", "control", "hub"],
  notebook_alm: ["notebook", "notebooklm", "grounding", "pack", "resync"],
  proof_ledger: ["proof", "ledger", "evidence", "no-false-green", "audit"],
};

type RuntimeAgent = NonNullable<CofiaSnapshot["openclawRuntime"]>["agents"][number];
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
type ToolOperatingContractsPayload = {
  ok?: boolean;
  sourceTag?: string;
  policy?: string;
  summary?: { contracts?: number; machineAliases?: number; houses?: number };
  sourcePath?: string;
  contracts?: ToolOperatingContract[];
};
type HubWiringPayload = {
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
type WorldMachine = {
  id: string;
  label: string;
  homeHouse: string;
  ok: boolean;
  status: string;
  role?: string;
  proof?: string;
  sourceTag?: string;
  contract?: ToolOperatingContract;
  contractSourceTag?: string;
};
export type TruthSource = { id: string; label: string; houseId: string; status: string; ok: boolean; proof: string; sourceTag: string; actionState?: string | null; runUtc?: string | null };
export type TruthMapPayload = { houses?: Record<string, TruthSource[]>; events?: FeedEvent[]; sourceTag?: string; generatedAtUtc?: string; summary?: { sources: number; live: number; amber: number; unknown: number } };
type GoogleWorkspaceComponent = {
  id: string; label: string; houseId: string; status: string; ok: boolean; proof: string; capability: string; chiefAgent: string; workerAgents: string[]; sourceTag: string;
};
type GoogleWorkspacePayload = {
  ok?: boolean; status?: string; sourceTag?: string;
  summary?: { components?: number; live?: number; amber?: number; unknown?: number; keyNamesPresent?: number };
  keyPresence?: Array<{ name: string; present: boolean; valueRedacted: true }>;
  components?: GoogleWorkspaceComponent[];
};
type LobsterComponent = { id: string; label: string; houseId: string; status: string; ok: boolean; proof: string; role: string };
type LobsterPayload = {
  ok?: boolean; status?: string; sourceTag?: string; proof?: string;
  summary?: { doctorOk?: boolean; version?: string | null; workflows?: number; configuredAgents?: number | null; enabledAgents?: number | null; statusAgeSec?: number | null; latestRunUtc?: string | null };
  components?: LobsterComponent[];
};
type ProofLedgerCoordinationPayload = {
  ok?: boolean;
  status?: string;
  sourceTag?: string;
  summary?: { activeClaims?: number; activeSessions?: number; duplicateGroups?: number; queuedDispatches?: number; coveredAgents?: number; totalAgents?: number };
  paths?: { claimsJsonl?: string; stateJson?: string };
};
/* item d'inventaire (matrice 742) — déjà rattaché à sa maison (houseId) + agent (ownerAgentId) */
export type InvItem = { id: string; name: string; category: string; houseId: string; ownerAgentId?: string; cost?: string; monthlyCostEur?: number; monthly_cost_eur?: number; monthly_cost?: number | string; pricing?: string; status: string; statusSource?: string; proof?: string; blocker?: string; nextAction?: string; house?: string; ownerHouse?: string };
type HubLedgerItem = {
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
  coveredCount?: number;
};
type HubLedgerHouseStats = {
  total: number;
  connected: number;
  proofed: number;
  green: number;
  amber: number;
  red: number;
  unknown: number;
  kinds: Record<string, number>;
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
type WorldCamera = { z: number; tx: number; ty: number };
type SharedWorldLayout = {
  pos?: Record<string, { x: number; y: number }>;
  cam?: Partial<WorldCamera>;
  viewport?: { cw?: number; ch?: number; windowW?: number; windowH?: number; dpr?: number };
  updatedAt?: string;
  clientId?: string;
};
type PublisherCriticalState = {
  active: boolean;
  source: string;
  sourceTag: string;
  status: string;
  reason: string;
};
type PublisherNativeSnapshot = NonNullable<CofiaSnapshot["publisherNative"]>;
type PublisherWorkorderView = {
  id: string;
  label: string;
  status: string;
  current: number | null;
  total: number | null;
  source: string;
};
type PublisherKeyframeProgress = {
  current: number;
  total: number;
  percent: number;
  filledTicks: number;
  tickCount: number;
  source: string;
  status: string;
  activeWorkorders: number;
  totalWorkorders: number;
  workorders: PublisherWorkorderView[];
};
const stabilizeCamera = (camera: WorldCamera): WorldCamera => ({
  z: Number(camera.z.toFixed(4)),
  tx: Number(camera.tx.toFixed(2)),
  ty: Number(camera.ty.toFixed(2)),
});
const cameraChanged = (a: WorldCamera, b: WorldCamera) =>
  Math.abs(a.z - b.z) >= CAMERA_Z_EPSILON
  || Math.abs(a.tx - b.tx) >= CAMERA_XY_EPSILON
  || Math.abs(a.ty - b.ty) >= CAMERA_XY_EPSILON;
const criticalExternalStatus = (value: string | null | undefined) => {
  const status = String(value ?? "").trim().toUpperCase();
  if (!status) return false;
  return /\b(CRITICAL|CRITIQUE|ALERTE_ROUGE|RED_ALERT|SOURCE_DOWN|DOWN|BROKEN|ERR|ERROR|FAILED|FAIL|FATAL|SEV0|SEV1)\b/.test(status);
};
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const publisherNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};
const publisherText = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};
const publisherNumberFrom = (record: Record<string, unknown> | null, keys: string[]): number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = publisherNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
};
const firstPublisherNumber = (...values: Array<number | null | undefined>): number | null => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
};
const publisherGlobalAlertActive = (native: PublisherNativeSnapshot | null | undefined) =>
  native?.global_alert === true || native?.globalAlert === true;
const normalizePublisherWorkorders = (input: unknown): PublisherWorkorderView[] => {
  const entries: Array<[string, unknown]> = Array.isArray(input)
    ? input.map((value, index) => [String(index + 1), value])
    : isPlainRecord(input)
      ? Object.entries(input)
      : [];
  return entries.flatMap(([fallbackId, value]) => {
    if (!isPlainRecord(value)) return [];
    const keyframes = isPlainRecord(value.keyframes) ? value.keyframes : null;
    const counts = isPlainRecord(value.counts) ? value.counts : null;
    const batch = isPlainRecord(value.batch) ? value.batch : null;
    const id = publisherText(value, ["id", "workorder_id", "workorderId"]) ?? fallbackId;
    const label = publisherText(value, ["label", "title", "name"]) ?? `workorder ${fallbackId}`;
    const status = (publisherText(value, ["status", "state", "phase"]) ?? "UNKNOWN").toUpperCase();
    const current = firstPublisherNumber(
      publisherNumberFrom(value, ["current", "done", "completed", "rendered", "renders", "frames"]),
      publisherNumber(value.keyframes),
      publisherNumberFrom(keyframes, ["current", "done", "completed", "rendered", "renders", "frames"]),
      publisherNumberFrom(counts, ["keyframes", "renders", "current", "done", "completed", "frames"]),
      publisherNumberFrom(batch, ["current", "done", "completed", "rendered", "renders", "frames"]),
    );
    const total = firstPublisherNumber(
      publisherNumberFrom(value, ["total", "target", "expected", "frames_total", "framesTotal"]),
      publisherNumberFrom(keyframes, ["total", "target", "expected"]),
      publisherNumberFrom(counts, ["total", "target", "expected"]),
      publisherNumberFrom(batch, ["total", "target", "expected"]),
    );
    const source = publisherText(value, ["sourceTag", "source_tag", "source"]) ?? "publisherNative.workorders";
    return [{ id, label, status, current, total, source }];
  });
};
const workorderIsActive = (workorder: PublisherWorkorderView) => {
  if (/\b(DONE|COMPLETE|COMPLETED|SUCCESS|FINISHED|FAILED|ERROR|BROKEN|CANCELLED)\b/.test(workorder.status)) return false;
  if (typeof workorder.current === "number" && typeof workorder.total === "number" && workorder.current >= workorder.total) return false;
  return /\b(ACTIVE|RUNNING|RENDER|PROCESS|WORK|IN_PROGRESS|PENDING|QUEUED|STARTED|UNKNOWN)\b/.test(workorder.status);
};
const workorderTone = (status: string) => {
  if (/\b(FAILED|ERROR|BROKEN|CANCELLED)\b/.test(status)) return "#fb7185";
  if (/\b(DONE|COMPLETE|COMPLETED|SUCCESS|FINISHED)\b/.test(status)) return "#34d399";
  if (/\b(ACTIVE|RUNNING|RENDER|PROCESS|WORK|IN_PROGRESS)\b/.test(status)) return "#38bdf8";
  return "#f59e0b";
};
const derivePublisherKeyframeProgress = (native: PublisherNativeSnapshot | null | undefined): PublisherKeyframeProgress => {
  const workorders = normalizePublisherWorkorders(native?.workorders);
  const renders = publisherNumber(native?.counts?.renders);
  const batchRecord = isPlainRecord(native?.batch) ? native.batch : null;
  const batchCurrent = publisherNumberFrom(batchRecord, ["current", "done", "completed", "rendered", "renders", "frames", "keyframes"]);
  const batchTotal = publisherNumberFrom(batchRecord, ["total", "target", "expected"]);
  const activeWorkorders = workorders.filter(workorderIsActive);
  const visibleWorkorder = activeWorkorders.find((item) => item.total !== null || item.current !== null)
    ?? workorders.find((item) => item.total !== null || item.current !== null)
    ?? null;
  const totalRaw = firstPublisherNumber(visibleWorkorder?.total, batchTotal, COFIAPUBLISHER_KEYFRAME_BATCH_TOTAL);
  const total = Math.max(1, Math.round(totalRaw ?? COFIAPUBLISHER_KEYFRAME_BATCH_TOTAL));
  const currentRaw = firstPublisherNumber(visibleWorkorder?.current, batchCurrent, renders, 0);
  const current = Math.round(clampNumber(currentRaw ?? 0, 0, total));
  const percent = clampNumber((current / total) * 100, 0, 100);
  const tickCount = Math.min(total, COFIAPUBLISHER_KEYFRAME_BATCH_TOTAL);
  const filledTicks = Math.round((percent / 100) * tickCount);
  const source = visibleWorkorder
    ? `${visibleWorkorder.id} · ${visibleWorkorder.source}`
    : renders !== null
      ? "publisherNative.counts.renders"
      : "publisherNative.batch";
  return {
    current,
    total,
    percent,
    filledTicks,
    tickCount,
    source,
    status: visibleWorkorder?.status ?? native?.state ?? "UNKNOWN",
    activeWorkorders: activeWorkorders.length,
    totalWorkorders: workorders.length,
    workorders: workorders.slice(0, 4),
  };
};
const derivePublisherCriticalState = (snapshot: CofiaSnapshot | null | undefined): PublisherCriticalState => {
  const native = snapshot?.publisherNative;
  const bridge = snapshot?.publisherBridge;
  const video = snapshot?.videoAvailability;
  const service = snapshot?.services?.find((svc) => /cofiapublisher|8540|publisher/i.test(`${svc.id ?? ""} ${svc.label ?? ""} ${svc.url ?? ""}`));
  if (publisherGlobalAlertActive(native)) {
    return {
      active: true,
      source: "publisherNative.global_alert",
      sourceTag: native?.sourceTag ?? "publisher-native-global-alert",
      status: "GLOBAL_ALERT",
      reason: "COF : LA CITADELLE demande alerte rouge via publisherNative.global_alert",
    };
  }
  const checks = [
    { source: "publisherNative.state", status: native?.state, sourceTag: native?.sourceTag },
    { source: "publisherBridge.status", status: bridge?.status, sourceTag: bridge?.sourceTag },
    { source: "videoAvailability.status", status: video?.status, sourceTag: video?.sourceTag },
    { source: "publisherNative.publishLock.reason", status: native?.publishLock?.reason, sourceTag: native?.sourceTag },
    { source: "services.cofiapublisher.status", status: service?.status, sourceTag: service?.url },
  ];
  const hit = checks.find((item) => criticalExternalStatus(item.status));
  if (!hit) return { active: false, source: "none", sourceTag: "no-critical-external-indicator", status: "NORMAL", reason: "Aucun indicateur externe critique" };
  return {
    active: true,
    source: hit.source,
    sourceTag: hit.sourceTag ?? "publisher-external-state",
    status: String(hit.status ?? "CRITICAL"),
    reason: `COF : LA CITADELLE demande alerte rouge via ${hit.source}`,
  };
};
const invColor = (s: string) => s === "GREEN" || s === "LIVE" ? "#34d399" : s === "AMBER" || s === "AMBER_REVERIFY" || s === "STALE" || s === "DEGRADED" ? "#f59e0b" : s === "RED" ? "#ef4444" : s === "QUARANTINE" ? "#fb7185" : "#64748b";
/* mapping catégorie → maison — FALLBACK uniquement (si l'item n'a ni houseId/house/ownerHouse).
 * Basé sur les 26 catégories réelles des 742 items (les 57 sans houseId = tous "subscription"). */
const CATEGORY_TO_HOUSE: Record<string, string> = {
  "1. Mission Control / OpenClaw": "mission_control_tower", "2. Repos GitHub": "site_seo_lab", "3. Frontends / backends / hubs": "mission_control_tower",
  "4. Services locaux / ports": "openclaw_agent_barracks", "5. Outils IA": "central_brain", "6. Outils dev / code": "site_seo_lab",
  "7. Outils trading": "mt4_signal_tower", "8. Brokers / affiliation": "vip_gate", "9. Outils revenue / paiement": "iron_office",
  "12. Réseaux sociaux": "vip_gate", "13. Production vidéo / IA vidéo": "youtube_studio", "15. Assets médias": "assets_warehouse",
  "16. MP4": "assets_warehouse", "17. Captions / scripts": "assets_warehouse", "18. Documents / vision / plans": "obsidian_library",
  "19. Obsidian / Notion / Linear / Drive": "obsidian_library", "20. Automations / n8n / LaunchAgents": "openclaw_agent_barracks", "22. Agents / operators": "openclaw_agent_barracks",
  "24. Funnels clients": "iron_office", "25. Parcours business": "iron_office", "26. Abonnements payants": "iron_office",
  "27. Comptes externes": "mission_control_tower", "28. Secrets / credentials": "compliance_port", "29. Archives / doublons": "central_brain",
  "agent": "openclaw_agent_barracks", "subscription": "iron_office",
};
/* alias maison non-canon de l'inventaire → maison visible la plus proche */
const HOUSE_ALIAS: Record<string, string> = { erwin_perso_ceo: "mission_control_tower" };
const inventoryNameHouseOverride = (item: InvItem): string | null => {
  const hay = `${item.name} ${item.id} ${item.category}`.toLowerCase();
  if (/google workspace|icloud|apple one|google drive/.test(hay)) return "obsidian_library";
  if (/linear/.test(hay)) return "paperclip_factory";
  if (/telegram|cofbot|free_group|vip channel/.test(hay)) return "vip_gate";
  return null;
};
/* resolveHouseId — priorité : houseId → house → ownerHouse → catégorie → "unassigned" (gère le multi-maison "a,b") */
export function resolveHouseIds(item: InvItem): string[] {
  const override = inventoryNameHouseOverride(item);
  if (override) return [override];
  const raw = (item.houseId || item.house || item.ownerHouse || "").trim();
  const ids = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean).map((h) => HOUSE_ALIAS[h] ?? h) : [];
  if (ids.length) return ids;
  const cat = CATEGORY_TO_HOUSE[item.category];
  return cat ? [cat] : ["unassigned"];
}

/** true si l'item appartient à cet agent (un token de ownerAgentId == nom/id de l'agent). */
function ownerMatchesAgent(ownerAgentId: string | undefined, agent: CanonAgent): boolean {
  if (!ownerAgentId) return false;
  const tokens = ownerAgentId.toLowerCase().split(/[/,]/).map((s) => s.trim()).filter(Boolean);
  const name = (agent.name || "").toLowerCase();
  const idd = (agent.id || "").toLowerCase();
  return tokens.includes(name) || (!!idd && tokens.includes(idd));
}

const runtimeColor = (s: string) => {
  const status = String(s ?? "").toUpperCase();
  if (status === "FRESH" || status === "LIVE" || status === "GREEN" || status === "LIVE_LOCAL") return "#34d399";
  if (status === "CONNECTED_PROOFED" || status === "CONNECTED_IDLE") return "#22d3ee";
  if (status === "ACTIVE_PROVED" || status === "RUNTIME_ACTIVE_PROVED") return "#34d399";
  if (status.includes("WITH_GAPS") || status === "CONNECTED_WITH_GAPS" || status === "CONNECTED_WITH_RED") return "#f59e0b";
  if (status === "IDLE_NO_RUNTIME" || status.includes("IDLE")) return "#64748b";
  if (status === "LOCAL_READY") return "#22d3ee";
  if (status === "SLEEPING" || status === "PAUSED" || status === "UNKNOWN") return "#64748b";
  if (status.includes("AMBER") || status === "STALE" || status === "DEGRADED" || status === "PARTIAL") return "#f59e0b";
  return "#ef4444";
};
function houseStatusStyle(status: string): { color: string; label: string } {
  switch (status) {
    case "GREEN":
    case "LIVE": return { color: "#34d399", label: "LIVE" };
    case "LOCAL_DISPATCH": return { color: "#22d3ee", label: "ORDRE LOCAL" };
    case "AMBER_REVERIFY": return { color: "#f59e0b", label: "AMBER_REVERIFY" };
    case "AMBER_LOCAL": return { color: "#f59e0b", label: "AMBER_LOCAL" };
    case "UNKNOWN": return { color: "#64748b", label: "UNKNOWN" };
    case "SLEEPING": return { color: "#64748b", label: "EN VEILLE" };
    case "SOURCE_DOWN": return { color: "#ef4444", label: "SOURCE DOWN" };
    case "DEGRADED": return { color: "#f59e0b", label: "DEGRADED" };
    case "REGISTERED": return { color: "#f59e0b", label: "REGISTERED" };
    case "LOADING": return { color: "#64748b", label: "…" };
    case "ERR": return { color: "#fb7185", label: "ERR" };
    case "MODULE": return { color: "#a78bfa", label: "MODULE" };
    case "PLANNED": return { color: "#fbbf24", label: "🚧 PRÉVUE" };
    case "AMBER": return { color: "#f59e0b", label: "AMBER" };
    default: return { color: "#fb7185", label: status || "ERR" };
  }
}
const ANGEL_STATUS: Record<AngelStatus, { color: string; label: string }> = {
  LIVE: { color: "#10b981", label: "LIVE" }, OPERATIONAL_PARTIAL: { color: "#22d3ee", label: "PARTIEL" }, CANON_GATE: { color: "#38bdf8", label: "CANON GATE" },
  AWAITING_SETUP: { color: "#64748b", label: "À ACTIVER" }, DEGRADED: { color: "#f59e0b", label: "DEGRADED" }, BROKEN: { color: "#ef4444", label: "CASSÉ" },
};
const fmtNum = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) ? new Intl.NumberFormat("fr-FR").format(v) : "source down";

/* ════════ géométrie ════════ */
type Pt = { x: number; y: number };
const P = (pt: Pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const centroid = (pts: Pt[]): Pt => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
const insetTowards = (pts: Pt[], k: number): Pt[] => { const c = centroid(pts); return pts.map((p) => lerpPt(p, c, k)); };
const rseed = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
const stableHash = (value: string) => [...value].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
const stableRouteBend = (a: string, b: string, kind: "main" | "second") => {
  const sign = Math.abs(stableHash(`${a}->${b}`)) % 2 === 0 ? 1 : -1;
  return (kind === "main" ? 34 : 22) * sign;
};
function shade(hex: string, amt: number): string {
  if (!hex || typeof hex !== "string") return "#64748b";
  const h = hex.replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
type Win = { pts: string; lit: boolean };
function faceWindows(BL: Pt, BR: Pt, TL: Pt, TR: Pt, cols: number, rows: number, seed: number): Win[] {
  const out: Win[] = []; const mx = 0.24, my = 0.26; const at = (u: number, v: number): Pt => lerpPt(lerpPt(BL, BR, u), lerpPt(TL, TR, u), v);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = at((c + mx) / cols, (r + my) / rows), b = at((c + 1 - mx) / cols, (r + my) / rows), d = at((c + 1 - mx) / cols, (r + 1 - my) / rows), e = at((c + mx) / cols, (r + 1 - my) / rows);
    out.push({ pts: `${P(a)} ${P(b)} ${P(d)} ${P(e)}`, lit: ((c * 7 + r * 13 + seed) % 5) !== 0 });
  }
  return out;
}
function block(basePts: Pt[], height: number) {
  const top: Pt[] = basePts.map((p) => ({ x: p.x, y: p.y - height }));
  return { top, leftStr: [basePts[3], basePts[2], top[2], top[3]].map(P).join(" "), rightStr: [basePts[1], basePts[2], top[2], top[1]].map(P).join(" "), roofPoly: top.map(P).join(" ") };
}
function smoothClosedPath(pts: Pt[]): string {
  const n = pts.length; if (n < 3) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d + " Z";
}
const houseFrontWorld = (h: House) => ({ wx: h.x + h.w / 2 + 0.4, wy: h.y + h.h + 2.0 });
const BUILDING_FOOT = 3.05;
type StructureProfile = { footX: number; footY: number; coreInset: number; height: number; shadow: number };
const STRUCTURE_PROFILES: Record<BuildingType, StructureProfile> = {
  command_tower: { footX: 0.72, footY: 0.72, coreInset: 0.32, height: 1.72, shadow: 0.86 },
  brain: { footX: 1.08, footY: 1.02, coreInset: 0.18, height: 1.18, shadow: 1.12 },
  village: { footX: 1.42, footY: 1.12, coreInset: 0.46, height: 0.64, shadow: 1.2 },
  vault: { footX: 1.06, footY: 0.98, coreInset: 0.16, height: 1.16, shadow: 1.08 },
  observatory: { footX: 1.02, footY: 0.9, coreInset: 0.25, height: 1.24, shadow: 1.08 },
  factory: { footX: 1.42, footY: 1.02, coreInset: 0.08, height: 0.92, shadow: 1.22 },
  studio: { footX: 1.44, footY: 0.9, coreInset: 0.08, height: 0.98, shadow: 1.2 },
  warehouse: { footX: 1.48, footY: 1.06, coreInset: 0.08, height: 0.9, shadow: 1.25 },
  lab: { footX: 1.0, footY: 0.92, coreInset: 0.22, height: 1.14, shadow: 1.02 },
  signal_tower: { footX: 0.72, footY: 0.72, coreInset: 0.38, height: 1.82, shadow: 0.86 },
  academy: { footX: 1.22, footY: 0.98, coreInset: 0.12, height: 1.02, shadow: 1.12 },
  business: { footX: 1.14, footY: 0.96, coreInset: 0.14, height: 1.1, shadow: 1.08 },
  gate: { footX: 1.26, footY: 0.82, coreInset: 0.18, height: 1.02, shadow: 1.12 },
  compliance: { footX: 1.08, footY: 0.92, coreInset: 0.14, height: 1.22, shadow: 1.08 },
  calendar: { footX: 0.78, footY: 0.74, coreInset: 0.32, height: 1.62, shadow: 0.9 },
  notebook_alm: { footX: 1.28, footY: 0.96, coreInset: 0.16, height: 0.96, shadow: 1.18 },
  proof_ledger: { footX: 1.16, footY: 1.04, coreInset: 0.12, height: 1.2, shadow: 1.12 },
};
const structureProfile = (h: House) => STRUCTURE_PROFILES[h.type];
const buildingBodyH = (h: House) => Math.round((72 + h.levels * 30) * structureProfile(h).height);
const structuralGround = (h: House, ground: Pt[]) => insetTowards(ground, structureProfile(h).coreInset);

type Rank = "crown" | "diadem" | "captain" | "agent";
function rankFor(a: CanonAgent): Rank { const r = a.rankLayer || ""; if (r.includes("L0")) return "crown"; if (r.includes("L1")) return "diadem"; if (r.includes("L2")) return "captain"; return "agent"; }
const rankPriority = (a: CanonAgent) => ({ crown: 0, diadem: 1, captain: 2, agent: 3 }[rankFor(a)]);
const rankVisualBoost = (a: CanonAgent) => ({ crown: 14, diadem: 10, captain: 6, agent: 0 }[rankFor(a)]);
const missionTone = (status?: string) => {
  const s = (status ?? "").toUpperCase();
  if (s === "LOCAL_DISPATCH" || s === "QUEUED_LOCAL_ONLY") return "#22d3ee";
  if (s === "LIVE" || s === "ACTIVE" || s === "RUNTIME_PROOF") return "#34d399";
  if (s === "AMBER" || s === "AMBER_LOCAL" || s === "SOURCE_LIVE_READ" || s === "CANON" || s === "SOURCE_ONLY" || s === "FALLBACK_ONLY") return "#fbbf24";
  if (s === "SOURCE_GAP" || s === "MISSING_PROOF") return "#fb7185";
  return "#67e8f9";
};
const truncateMission = (value?: string, max = 82) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const isRuntimeMission = (mission?: HouseMissionRecord | null) =>
  Boolean(mission && mission.status === "ACTIVE" && mission.mission.proofStatus === "RUNTIME_PROOF" && (mission.counts?.activeTasks ?? 0) > 0);
const isLocalDispatchMission = (mission?: HouseMissionRecord | null) =>
  Boolean(mission && mission.mission.proofStatus === "LOCAL_DISPATCH" && (mission.localQueue?.dispatches ?? mission.counts?.activeTasks ?? 0) > 0);
type MissionQualitySignal = { label: string; value: string; status: "ok" | "warn" | "block" };
type MissionQuality = {
  score: number;
  completion: number;
  method: number;
  proof: number;
  tools: number;
  verdict: "VERIFIED" | "CONTROLLED" | "PARTIAL" | "BLOCKED";
  tone: string;
  signals: MissionQualitySignal[];
};
const qualityStatus = (score: number): MissionQualitySignal["status"] => score >= 70 ? "ok" : score >= 35 ? "warn" : "block";
const qualityColor = (status: MissionQualitySignal["status"]) => status === "ok" ? "#34d399" : status === "warn" ? "#fbbf24" : "#fb7185";
const computeMissionQuality = (mission: HouseMissionRecord, machines: WorldMachine[], truthSources: TruthSource[]): MissionQuality => {
  const dispatches = mission.dispatches ?? [];
  const workingDispatches = dispatches.filter((dispatch) => isWorkingDispatchStatus(dispatch.status));
  const queuedDispatches = dispatches.filter((dispatch) => isQueuedDispatchStatus(dispatch.status));
  const completion = isRuntimeMission(mission)
    ? 100
    : workingDispatches.length > 0
      ? 82
    : isLocalDispatchMission(mission) || queuedDispatches.length > 0
        ? 24
        : mission.mission.status === "ACTIVE"
          ? 36
          : 18;
  const hasPrompt = Boolean(mission.mission.title?.trim() && mission.mission.nextAction?.trim());
  const hasOwner = Boolean(mission.chief || mission.chiefs?.length || mission.workers?.length || mission.agents?.length || dispatches.length);
  const method = Math.min(100,
    (hasPrompt ? 28 : 0)
    + (hasOwner ? 24 : 0)
    + (workingDispatches.length ? 32 : 0)
    + (mission.mission.route || mission.sourceTag ? 16 : 0),
  );
  const proofBits = [
    proofLooksUsable(mission.mission.proof) ? 34 : 0,
    mission.proofs?.length ? 18 : 0,
    proofLooksUsable(mission.localQueue?.path) || proofLooksUsable(mission.localQueue?.dispatchLog) ? 16 : 0,
    truthSources.some((source) => source.ok && proofLooksUsable(source.proof)) ? 18 : 0,
    mission.mission.proofStatus === "RUNTIME_PROOF" ? 14 : mission.mission.proofStatus === "LOCAL_DISPATCH" ? 8 : 0,
  ];
  const proof = Math.min(100, proofBits.reduce((total, value) => total + value, 0));
  const liveTools = machines.filter((machine) => machine.ok && proofLooksUsable(machine.proof)).length;
  const declaredTools = mission.toolSummary?.total ?? machines.length;
  const tools = Math.min(100,
    (liveTools ? 44 : 0)
    + (declaredTools ? 24 : 0)
    + (mission.toolSummary?.labels?.length ? 16 : 0)
    + (mission.assetSummary?.total ? 16 : 0),
  );
  const score = Math.round(completion * 0.34 + method * 0.22 + proof * 0.26 + tools * 0.18);
  const verdict = score >= 82 && completion >= 80 && proof >= 65 ? "VERIFIED" : score >= 62 ? "CONTROLLED" : score >= 35 ? "PARTIAL" : "BLOCKED";
  const tone = verdict === "VERIFIED" ? "#34d399" : verdict === "CONTROLLED" ? "#22d3ee" : verdict === "PARTIAL" ? "#fbbf24" : "#fb7185";
  return {
    score,
    completion,
    method,
    proof,
    tools,
    verdict,
    tone,
    signals: [
      { label: "Accomplie", value: `${completion}%`, status: qualityStatus(completion) },
      { label: "Méthode", value: `${method}%`, status: qualityStatus(method) },
      { label: "Preuve", value: `${proof}%`, status: qualityStatus(proof) },
      { label: "Outils", value: `${tools}%`, status: qualityStatus(tools) },
      { label: "Agents", value: workingDispatches.length ? `${workingDispatches.length} runtime` : queuedDispatches.length ? `${queuedDispatches.length} ordre(s) non exécuté(s)` : "aucun runtime", status: workingDispatches.length ? "ok" : "block" },
    ],
  };
};
const isFallbackEventText = (value: string) => /fallback|local fallback|trucks rendered|rendered from local|openclaw_api_down|read_only_fallback/i.test(value);
const freshApiUrl = (path: string) => `${path}${path.includes("?") ? "&" : "?"}ts=${Date.now()}`;
const isLiveStatus = (status?: string | null) => String(status ?? "").toUpperCase() === "LIVE";
const proofLooksUsable = (value?: string | null) => {
  const text = (value ?? "").trim();
  return Boolean(text) && !/fallback|indisponible|unavailable|source missing|source down|read unavailable|no listener|timeout|non branche|unavailable|missing\/down/i.test(text);
};
const findToolContractForMachine = (machine: WorldMachine, contracts: ToolOperatingContract[]): ToolOperatingContract | undefined => {
  if (!contracts.length) return undefined;
  const direct = contracts.find((contract) => contract.machineIds.includes(machine.id));
  if (direct) return direct;
  const hay = `${machine.id} ${machine.label} ${machine.role ?? ""} ${machine.proof ?? ""}`.toLowerCase();
  const idMatch = contracts.find((contract) => hay.includes(contract.id.toLowerCase()));
  if (idMatch) return idMatch;
  if (/drive|docs|sheets|slides|google workspace/.test(hay)) return contracts.find((contract) => contract.id === "google_workspace");
  if (/calendar|agenda/.test(hay)) return contracts.find((contract) => contract.id === "google_calendar");
  if (/telegram|vip|free channel|bridge/.test(hay)) return contracts.find((contract) => contract.id === "telegram");
  if (/proof ledger|no-false-green|claims/.test(hay)) return contracts.find((contract) => contract.id === "proof_ledger");
  if (/console ia|central brain local packet/.test(hay)) return contracts.find((contract) => contract.id === "console_ia");
  if (/openclaw git|github|repo/.test(hay)) return contracts.find((contract) => contract.id === "openclaw_github");
  return undefined;
};
const enrichMachineWithContract = (
  machine: WorldMachine,
  contracts: ToolOperatingContract[],
  sourceTag?: string,
): WorldMachine => {
  const contract = findToolContractForMachine(machine, contracts);
  if (!contract) return machine;
  return {
    ...machine,
    homeHouse: HOUSE_BY_ID[machine.homeHouse] ? machine.homeHouse : contract.houseId,
    role: machine.role ?? contract.purpose,
    contract,
    contractSourceTag: sourceTag,
  };
};
const isTruthLive = (source: TruthSource) => source.ok === true && isLiveStatus(source.status);
const isMachineLiveWithProof = (machine: WorldMachine) =>
  machine.ok === true && isLiveStatus(machine.status) && proofLooksUsable(machine.proof) && !isFallbackEventText(machine.proof ?? "");

/* état d'un agent dérivé de données RÉELLES (jamais aléatoire) */
type AgentState = "idle" | "queued" | "alert" | "phone" | "keyboard" | "inspect" | "work";
type VisibleAgent = { agent: CanonAgent; wx: number; wy: number; state: AgentState; parkedVehicleOnly?: boolean };
type HouseActivity = { state: AgentState; label?: string };
const isQueuedDispatchStatus = (status?: string | null) => /QUEUED|LOCAL_ONLY|PENDING|AWAITING|PARKED|READY|DRAFT|REVIEW/.test(String(status ?? "").toUpperCase());
const isWorkingDispatchStatus = (status?: string | null) => {
  const s = String(status ?? "").toUpperCase();
  if (!s || /QUEUED|LOCAL_ONLY|PENDING|AWAITING|PARKED|READY|DRAFT|REVIEW/.test(s)) return false;
  return /RUNNING|IN_PROGRESS|EXECUTING|PROCESSING|CLAIMED|ACTIVE|LIVE|WORKING/.test(s);
};
const dispatchStateForHouse = (houseId: string, text = ""): AgentState => {
  const hay = `${houseId} ${text}`.toLowerCase();
  if (/messag|telegram|whatsapp|vip|\bdm\b|broadcast|channel/.test(hay)) return "phone";
  if (/linear|issue|ticket|task|backlog|paperclip|code|site|seo|publish|render|caption|console|packet|repo|github|openclaw/.test(hay)) return "keyboard";
  if (/calendar|audit|proof|compliance|risk|legal|fiscal|notion|notebook|reverify|sync|inspect/.test(hay)) return "inspect";
  return "work";
};
const isAgentWorkingState = (state: AgentState) => state !== "idle" && state !== "queued" && state !== "alert";
const isAgentAssignedState = (state: AgentState) => isAgentWorkingState(state);
const TOOL_BADGES: ToolBadge[] = [
  { key: "linear", label: "Linear", short: "LIN", color: "#5e6ad2", monthlyEur: null, source: "Patrimoine Total C2 Linear Plus: montant non chiffré" },
  { key: "notion", label: "Notion", short: "NOT", color: "#f8fafc", monthlyEur: null, source: "Patrimoine Total C1 Notion Plus: montant non chiffré" },
  { key: "obsidian", label: "Obsidian", short: "OBS", color: "#a78bfa", monthlyEur: 0, source: "Obsidian vault local" },
  { key: "n8n", label: "n8n", short: "N8N", color: "#ff6d5a", monthlyEur: 50, source: "Patrimoine Total X7 n8n Cloud Pro €50/mo" },
  { key: "calendar", label: "Calendar", short: "CAL", color: "#fbbf24", monthlyEur: null, source: "Google Workspace: montant non chiffré" },
  { key: "workspace", label: "Google Workspace", short: "GWS", color: "#34d399", monthlyEur: null, source: "Google Workspace 360 local snapshot" },
  { key: "gmail", label: "Gmail", short: "GML", color: "#ef4444", monthlyEur: null, source: "Google Workspace Gmail local snapshot" },
  { key: "drive", label: "Drive", short: "DRV", color: "#22c55e", monthlyEur: null, source: "Google Drive/Docs/Sheets local snapshot" },
  { key: "ga4", label: "GA4", short: "GA4", color: "#f97316", monthlyEur: null, source: "GA4 local snapshot" },
  { key: "search", label: "Search Console", short: "SEO", color: "#38bdf8", monthlyEur: null, source: "Search Console local snapshot" },
  { key: "admin", label: "Admin SDK", short: "ADM", color: "#fb7185", monthlyEur: null, source: "Google Admin SDK snapshot" },
  { key: "bigquery", label: "BigQuery", short: "BQ", color: "#60a5fa", monthlyEur: null, source: "BigQuery local evidence" },
  { key: "apps-script", label: "Apps Script", short: "APP", color: "#facc15", monthlyEur: null, source: "Apps Script local projects" },
  { key: "notebooklm", label: "NotebookLM", short: "NLM", color: "#60a5fa", monthlyEur: null, source: "NotebookLM packs: coût inclus/non chiffré" },
  { key: "github", label: "GitHub", short: "GIT", color: "#94a3b8", monthlyEur: null, source: "GitHub/OpenClaw repo local: montant non chiffré" },
  { key: "vps", label: "Hostinger VPS", short: "VPS", color: "#67e8f9", monthlyEur: null, source: "Hostinger VPS mirror local; LIVE uniquement si order frais" },
  { key: "console", label: "Console IA", short: "CIA", color: "#22d3ee", monthlyEur: 0, source: "Console IA locale packet router" },
  { key: "publisher", label: "Publisher", short: "PUB", color: "#fb7185", monthlyEur: null, source: "Publisher/media stack: montant non chiffré" },
  { key: "pixel", label: "Pixel", short: "PIX", color: "#38bdf8", monthlyEur: null, source: "Pixel/ad platform: montant non chiffré" },
  { key: "telegram", label: "Telegram", short: "TEL", color: "#2dd4bf", monthlyEur: 0, source: "Telegram owned/local channel surface" },
  { key: "stripe", label: "Stripe", short: "STR", color: "#818cf8", monthlyEur: null, source: "Stripe fees variables; pas de forfait agent chiffré ici" },
  { key: "trading", label: "Trading", short: "MT4", color: "#34d399", monthlyEur: null, source: "Trading runtime: coût broker/infra non chiffré par agent" },
];
const detectToolBadge = (text = "", houseId = ""): ToolBadge | null => {
  const hay = `${text} ${houseId}`.toLowerCase();
  if (/n8n|workflow|automation/.test(hay)) return TOOL_BADGES.find((t) => t.key === "n8n") ?? null;
  if (/linear|issue|ticket|cycle|backlog/.test(hay)) return TOOL_BADGES.find((t) => t.key === "linear") ?? null;
  if (/notion/.test(hay)) return TOOL_BADGES.find((t) => t.key === "notion") ?? null;
  if (/obsidian|vault|handoff|canon/.test(hay)) return TOOL_BADGES.find((t) => t.key === "obsidian") ?? null;
  if (/calendar|cadence|schedule|recurring|rappel/.test(hay)) return TOOL_BADGES.find((t) => t.key === "calendar") ?? null;
  if (/gmail/.test(hay)) return TOOL_BADGES.find((t) => t.key === "gmail") ?? null;
  if (/drive|docs|sheets|slides/.test(hay)) return TOOL_BADGES.find((t) => t.key === "drive") ?? null;
  if (/ga4|analytics/.test(hay)) return TOOL_BADGES.find((t) => t.key === "ga4") ?? null;
  if (/8799|search api|api recherche|recherche|search console|seo/.test(hay)) return TOOL_BADGES.find((t) => t.key === "search") ?? null;
  if (/admin sdk/.test(hay)) return TOOL_BADGES.find((t) => t.key === "admin") ?? null;
  if (/bigquery/.test(hay)) return TOOL_BADGES.find((t) => t.key === "bigquery") ?? null;
  if (/apps script/.test(hay)) return TOOL_BADGES.find((t) => t.key === "apps-script") ?? null;
  if (/google tasks|google account|youtube analytics|google workspace/.test(hay)) return TOOL_BADGES.find((t) => t.key === "workspace") ?? null;
  if (/notebook|notebooklm|grounding|alm/.test(hay)) return TOOL_BADGES.find((t) => t.key === "notebooklm") ?? null;
  if (/github|repo|openclaw|pull request|commit/.test(hay)) return TOOL_BADGES.find((t) => t.key === "github") ?? null;
  if (/hostinger|vps|srv1509602|vps[-_\s]?fleet|mirror local rapatri/.test(hay)) return TOOL_BADGES.find((t) => t.key === "vps") ?? null;
  if (/console|packet|central brain|router/.test(hay)) return TOOL_BADGES.find((t) => t.key === "console") ?? null;
  if (/publisher|publish|render|caption|youtube|video|voice|asset/.test(hay)) return TOOL_BADGES.find((t) => t.key === "publisher") ?? null;
  if (/pixel|meta|facebook|ads|tracking/.test(hay)) return TOOL_BADGES.find((t) => t.key === "pixel") ?? null;
  if (/telegram|whatsapp|vip|broadcast|dm/.test(hay)) return TOOL_BADGES.find((t) => t.key === "telegram") ?? null;
  if (/4242|crm|stripe|checkout|invoice|payment|mrr/.test(hay)) return TOOL_BADGES.find((t) => t.key === "stripe") ?? null;
  if (/mt4|trading|signal|broker|copy trading|fxcess|atas/.test(hay)) return TOOL_BADGES.find((t) => t.key === "trading") ?? null;
  return null;
};
const compactStatus = (status = "UNKNOWN") => {
  const raw = String(status || "UNKNOWN").toUpperCase();
  if (raw === "AMBER_REVERIFY") return "REVERIFY";
  if (raw === "AMBER_LOCAL") return "LOCAL";
  if (raw === "LIVE_LOCAL") return "LIVE";
  if (raw === "LOCAL_PACKET_ROUTE_READY") return "LOCAL";
  return raw.length > 9 ? raw.slice(0, 9) : raw;
};
const labelAcronym = (value = "TOOL") => {
  const words = value.replace(/[^a-z0-9]+/gi, " ").trim().split(/\s+/).filter(Boolean);
  const acronym = words.length >= 2 ? words.slice(0, 3).map((word) => word[0]).join("") : (words[0] ?? "TOOL").slice(0, 3);
  return acronym.toUpperCase();
};
const badgeForMachine = (machine: WorldMachine, houseId: string): ToolBadge => {
  const detected = detectToolBadge(`${machine.id} ${machine.label} ${machine.role ?? ""} ${machine.proof ?? ""}`, houseId);
  return detected ?? {
    key: `machine-${machine.id}`,
    label: machine.label,
    short: labelAcronym(machine.label || machine.id),
    color: runtimeColor(machine.status),
    monthlyEur: null,
    source: machine.sourceTag ?? "WorldMachine proof surface",
  };
};
type ServiceIconKind = "search" | "crm_stripe" | "publisher" | "gateway" | "generic";
const serviceIconKind = (machine: WorldMachine, badge: ToolBadge): ServiceIconKind => {
  const hay = `${machine.id} ${machine.label} ${machine.role ?? ""} ${machine.proof ?? ""} ${badge.key} ${badge.label}`.toLowerCase();
  if (/8799|search api|api recherche|recherche|search console|seo/.test(hay)) return "search";
  if (/4242|crm|stripe|checkout|invoice|payment|mrr/.test(hay)) return "crm_stripe";
  if (/publisher|8540|8000|render|video|youtube/.test(hay)) return "publisher";
  if (/gateway|hub|router|18789|8430|8767/.test(hay)) return "gateway";
  return "generic";
};
function ServiceToolIcon({ machine, badge, color, scale = 1 }: { machine: WorldMachine; badge: ToolBadge; color: string; scale?: number }) {
  const kind = serviceIconKind(machine, badge);
  const muted = machine.ok ? 1 : 0.58;
  return (
    <g data-service-icon-kind={kind} transform={`scale(${scale})`} opacity={muted}>
      <circle r="10" fill="#07111f" stroke={color} strokeWidth="1.15" vectorEffect="non-scaling-stroke" />
      <circle r="7.2" fill={badge.color} opacity="0.12" />
      {kind === "search" ? (
        <g fill="none" stroke={badge.color} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="-2" cy="-2" r="3.7" strokeWidth="1.75" />
          <path d="M1.1 1.1 L5.7 5.7" strokeWidth="2" />
        </g>
      ) : kind === "crm_stripe" ? (
        <g>
          <rect x="-6.2" y="-4.7" width="12.4" height="9.4" rx="2" fill="#0f172a" stroke={badge.color} strokeWidth="1.25" />
          <path d="M-5.5 -1.7 H5.5" stroke={badge.color} strokeWidth="1" opacity="0.72" />
          <text x="0" y="3.5" textAnchor="middle" fontSize="7.4" fontWeight="950" fill={badge.color}>S</text>
        </g>
      ) : kind === "publisher" ? (
        <g fill="none" stroke={badge.color} strokeLinecap="round" strokeLinejoin="round">
          <rect x="-5.8" y="-4.6" width="11.6" height="9.2" rx="1.8" strokeWidth="1.2" />
          <path d="M-1.4 -2.5 L3.3 0 L-1.4 2.5 Z" fill={badge.color} stroke="none" />
        </g>
      ) : kind === "gateway" ? (
        <g fill="none" stroke={badge.color} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="-4.4" cy="-3.5" r="2" strokeWidth="1.35" />
          <circle cx="4.4" cy="-3.5" r="2" strokeWidth="1.35" />
          <circle cx="0" cy="4.4" r="2.1" strokeWidth="1.35" />
          <path d="M-2.6 -2.2 L-0.9 2.6 M2.6 -2.2 L0.9 2.6 M-2.4 -3.5 H2.4" strokeWidth="1.05" opacity="0.78" />
        </g>
      ) : (
        <g fill="none" stroke={badge.color} strokeLinecap="round" strokeLinejoin="round">
          <path d="M-5.5 -3.8 H5.5 V3.8 H-5.5 Z" strokeWidth="1.25" />
          <path d="M-3 0 H3 M0 -3.8 V3.8" strokeWidth="0.85" opacity="0.76" />
        </g>
      )}
    </g>
  );
}
const monthlyCostFromItem = (item: InvItem): number | null => {
  const direct = item.monthlyCostEur ?? item.monthly_cost_eur;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  if (typeof item.monthly_cost === "number" && Number.isFinite(item.monthly_cost)) return item.monthly_cost;
  const text = `${item.name} ${item.cost ?? ""} ${item.pricing ?? ""} ${typeof item.monthly_cost === "string" ? item.monthly_cost : ""}`;
  const match = text.match(/(?:€|eur\s*)\s*(\d+(?:[.,]\d+)?)/i) ?? text.match(/(\d+(?:[.,]\d+)?)\s*(?:€|eur)\s*\/\s*(?:mo|month|mois)/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
};
const agentIsLocalNoVariableCost = (agent: CanonAgent) => /codex|claude|luffy|jarod|openclaw|local|desktop|cli|qwen/i.test(`${agent.id} ${agent.name} ${agent.engine} ${agent.roleBadge}`);
const formatEurCost = (value: number) => `${value.toFixed(2).replace(".", ",")} €`;
const buildCostProfile = (agent: CanonAgent, agentItems: InvItem[], tool: ToolBadge | null, state: AgentState) => {
  const itemMonthly = agentItems.map(monthlyCostFromItem).filter((v): v is number => typeof v === "number");
  const sharedMonthly = itemMonthly.length ? itemMonthly.reduce((a, b) => a + b, 0) : null;
  const active = isAgentWorkingState(state);
  if (!active) {
    return {
      daily: "0 €/j variable",
      mission: "0 € mission",
      proof: sharedMonthly
        ? `agent au repos: abonnement(s) partagé(s) ${formatEurCost(sharedMonthly)}/mois détecté(s), non imputé(s) à cet agent sans action runtime; justification Proof Ledger requise`
        : "agent au repos: aucun coût variable imputé",
    };
  }
  if (agentIsLocalNoVariableCost(agent) || tool?.monthlyEur === 0) {
    return { daily: "0 €/j variable", mission: "0 € variable", proof: tool?.source ?? "rail local/headless déjà payé; pas de coût variable par mission" };
  }
  if (typeof tool?.monthlyEur === "number" && Number.isFinite(tool.monthlyEur)) {
    const daily = tool.monthlyEur / 30;
    const hourly = daily / 8;
    return { daily: `${formatEurCost(daily)}/j`, mission: `${formatEurCost(hourly)}/h mission`, proof: tool.source };
  }
  return {
    daily: "non chiffré",
    mission: "non chiffré",
    proof: sharedMonthly
      ? `abonnement(s) partagé(s) ${formatEurCost(sharedMonthly)}/mois détecté(s), mais aucun coût variable d'action agent prouvé`
      : tool?.source ?? "aucun coût EUR sourçable pour cette action agent",
  };
};
const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
};
const AGENT_SLOTS: Array<{ dx: number; dy: number }> = [
  { dx: 0, dy: 0.2 },
  { dx: -2.6, dy: -0.5 },
  { dx: 2.6, dy: -0.5 },
  { dx: -5.1, dy: -1.1 },
  { dx: 5.1, dy: -1.1 },
  { dx: -1.4, dy: 1.8 },
  { dx: 1.4, dy: 1.8 },
  { dx: 0, dy: -2.3 },
];
const _LEISURE_AGENT_SLOTS: Array<{ dx: number; dy: number }> = [
  { dx: -16.8, dy: -7.8 }, { dx: -12.5, dy: -10.4 }, { dx: -7.8, dy: -8.2 }, { dx: -3.1, dy: -11.2 }, { dx: 2.4, dy: -8.8 }, { dx: 7.5, dy: -10.2 }, { dx: 12.6, dy: -7.4 }, { dx: 17.3, dy: -3.8 },
  { dx: -18.2, dy: -1.7 }, { dx: -13.4, dy: 1.2 }, { dx: -8.4, dy: -1.2 }, { dx: -3.3, dy: 1.9 }, { dx: 2.1, dy: -0.8 }, { dx: 7.6, dy: 2.3 }, { dx: 12.9, dy: -0.5 }, { dx: 18.4, dy: 2.2 },
  { dx: -15.6, dy: 6.2 }, { dx: -10.2, dy: 8.4 }, { dx: -5.1, dy: 5.7 }, { dx: 0.4, dy: 8.8 }, { dx: 5.6, dy: 5.9 }, { dx: 10.7, dy: 8.6 }, { dx: 15.9, dy: 5.8 }, { dx: 20.2, dy: 7.8 },
];

export function WorldMapLiving({ snapshot, angelRoster, initialTruthMap, onSelectHouse }: { snapshot: CofiaSnapshot | null; angelRoster?: AngelRoster | null; initialTruthMap?: TruthMapPayload | null; onSelectHouse: (houseId: string) => void }) {
  const [localSnapshot, setLocalSnapshot] = useState<CofiaSnapshot | null>(null);
  const [houseStatuses, setHouseStatuses] = useState<Record<string, string> | null>(null);
  const [onDemandSet, setOnDemandSet] = useState<Set<string>>(new Set());
  const [worldStateEvents, setEvents] = useState<FeedEvent[]>([]);
  const [toolMachines, setToolMachines] = useState<WorldMachine[]>([]); // outils SaaS rattachés à leur maison (Notion/Linear…), statut depuis probe live
  const sourceEvents = useMemo<FeedEvent[]>(() => [], []); // probes directs conservés en machines; aucune activité maison hors truth-map.
  const [truthByHouse, setTruthByHouse] = useState<Record<string, TruthSource[]>>(initialTruthMap?.houses ?? {}); // sources canon intégrées aux bâtiments
  const [truthEvents, setTruthEvents] = useState<FeedEvent[]>(initialTruthMap?.events ?? []);
  const [truthReady, setTruthReady] = useState(Boolean(initialTruthMap?.houses));
  const [inventory, setInventory] = useState<InvItem[]>([]); // matrice inventaire 742 items, rattachés à leur maison (houseId)
  const [hubSourceLedger, setHubSourceLedger] = useState<HubSourceLedgerPayload | null>(() => snapshot?.hubSourceLedger ?? null);
  const [toolContracts, setToolContracts] = useState<ToolOperatingContractsPayload | null>(() => snapshot?.toolOperatingContracts ?? null);
  const [hubWiring, setHubWiring] = useState<HubWiringPayload | null>(() => snapshot?.hubWiring ?? null);
  const [registryError, setRegistryError] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<string | null>(null);
  const [selectedAngel, setSelectedAngel] = useState<Angel | null>(null);
  const [selectedRuntimeAgent, setSelectedRuntimeAgent] = useState<RuntimeAgent | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<WorldMachine | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<CanonAgent | null>(null);
  const [hoverHouse, setHoverHouse] = useState<string | null>(null);
  const [hoverAgent, setHoverAgent] = useState<string | null>(null);
  const [agentTelemetry, setAgentTelemetry] = useState<Record<string, AgentTelemetry>>({});
  const [telemetryNow, setTelemetryNow] = useState(() => Date.now());
  const [houseTab, setHouseTab] = useState<HouseTab>("vue");
  const [houseKpiData, setHouseKpiData] = useState<Record<string, { kpis: Array<{ label: string; value: string; source?: string }>; gap?: string }> | null>(null);
  const [houseOrchestrator, setHouseOrchestrator] = useState<HouseOrchestratorPayload | null>(() => snapshot?.houseOrchestrator ?? null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthPayload | null>(null);
  const [systemHealthError, setSystemHealthError] = useState(false);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ cw: number; ch: number }>({ cw: 0, ch: 0 });
  const parentAgentCount = snapshot?.agentsCanon?.agents?.length ?? snapshot?.agentsCanon?.count ?? 0;
  const localAgentCount = localSnapshot?.agentsCanon?.agents?.length ?? localSnapshot?.agentsCanon?.count ?? 0;
  const viewSnapshot = parentAgentCount > 0 ? snapshot : localAgentCount > 0 ? localSnapshot : snapshot ?? localSnapshot;
  const publisherCritical = useMemo(() => derivePublisherCriticalState(viewSnapshot), [viewSnapshot]);

  useEffect(() => {
    if (snapshot?.houseOrchestrator?.ok && snapshot.houseOrchestrator.sourceTag !== houseOrchestrator?.sourceTag) {
      setHouseOrchestrator(snapshot.houseOrchestrator);
    }
  }, [houseOrchestrator?.sourceTag, snapshot?.houseOrchestrator]);
  useEffect(() => {
    if (snapshot?.toolOperatingContracts?.ok && snapshot.toolOperatingContracts.sourceTag !== toolContracts?.sourceTag) {
      setToolContracts(snapshot.toolOperatingContracts);
    }
  }, [snapshot?.toolOperatingContracts, toolContracts?.sourceTag]);
  useEffect(() => {
    if (snapshot?.hubSourceLedger?.ok && snapshot.hubSourceLedger.sourceTag !== hubSourceLedger?.sourceTag) {
      setHubSourceLedger(snapshot.hubSourceLedger);
    }
  }, [hubSourceLedger?.sourceTag, snapshot?.hubSourceLedger]);
  useEffect(() => {
    if (snapshot?.hubWiring?.ok && snapshot.hubWiring.sourceTag !== hubWiring?.sourceTag) {
      setHubWiring(snapshot.hubWiring);
    }
  }, [hubWiring?.sourceTag, snapshot?.hubWiring]);

  useEffect(() => {
    if (parentAgentCount > 0) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/cofiatrading-world-control/snapshot", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as CofiaSnapshot;
        if (!cancelled) setLocalSnapshot(data);
      } catch {
        /* parent WorldControl keeps the main error state; this is a map-local self-heal. */
      }
    };
    void load();
    const iv = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [parentAgentCount]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/cofiatrading-world-control/registry", { cache: "no-store" }); if (!r.ok) throw new Error(`HTTP_${r.status}`);
        const data = await r.json(); const houses = (data?.houses ?? {}) as Record<string, { status?: unknown; on_demand?: unknown }>;
        const map: Record<string, string> = {}; const onDemand = new Set<string>();
        for (const [id, v] of Object.entries(houses)) { if (typeof v?.status === "string") map[id] = v.status; if (v?.on_demand === true) onDemand.add(id); }
        if (!cancelled) { setHouseStatuses(map); setOnDemandSet(onDemand); setRegistryError(false); }
      } catch { if (!cancelled) setRegistryError(true); }
    };
    void load(); const iv = window.setInterval(load, 90_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => {
    if (selectedHouse !== "central_brain") return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/cofiatrading-world-control/system-health", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP_${r.status}`);
        const data = (await r.json()) as SystemHealthPayload;
        if (!cancelled) { setSystemHealth(data); setSystemHealthError(false); }
      } catch {
        if (!cancelled) setSystemHealthError(true);
      }
    };
    void load();
    const iv = window.setInterval(load, 90_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [selectedHouse]);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/world-state", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && Array.isArray(d?.events)) setEvents(d.events); }).catch(() => {});
    void load(); const iv = window.setInterval(load, 90_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch(freshApiUrl("/api/cofiatrading-world-control/truth-map"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.houses) setTruthByHouse(d.houses as Record<string, TruthSource[]>);
        if (Array.isArray(d?.events)) setTruthEvents(d.events as FeedEvent[]);
        setTruthReady(Boolean(d?.houses));
      })
      .catch(() => { if (!cancelled) setTruthReady(false); });
    const refreshVisible = () => { if (document.visibilityState !== "hidden") void load(); };
    void load();
    const iv = window.setInterval(load, 45_000);
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("resize", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("resize", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/house-kpis", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && d?.houses) setHouseKpiData(d.houses); }).catch(() => {});
    void load(); const iv = window.setInterval(load, 180_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/house-orchestrator", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HouseOrchestratorPayload | null) => {
        if (!cancelled && d?.ok && Array.isArray(d.houseMissions)) setHouseOrchestrator(d);
      })
      .catch(() => {});
    void load(); const iv = window.setInterval(load, 180_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const runProofLedgerWork = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(freshApiUrl("/api/cofiatrading-world-control/house-orchestrator"), { cache: "no-store" });
        const data = response.ok ? await response.json() as HouseOrchestratorPayload : null;
        if (!cancelled && data?.ok && Array.isArray(data.houseMissions)) setHouseOrchestrator(data);
      } catch { /* la map reste honnete: sans preuve runtime fraiche, les agents retombent au repos */ }
    };
    const refreshVisible = () => { if (document.visibilityState !== "hidden") void runProofLedgerWork(); };
    void runProofLedgerWork();
    const iv = window.setInterval(runProofLedgerWork, 240_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);
  // inventaire 742 items rattachés à leur maison (houseId) — clic maison → onglet Inventaire
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/inventory-matrix", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && Array.isArray(d?.items)) setInventory(d.items as InvItem[]); }).catch(() => {});
    void load(); const iv = window.setInterval(load, 360_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  // Source Ledger global : sources live + patrimoine + canon assets + runtime + Asset Vault, garde no-false-green.
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/source-ledger", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HubSourceLedgerPayload | null) => { if (!cancelled && d?.ok) setHubSourceLedger(d); })
      .catch(() => {});
    void load(); const iv = window.setInterval(load, 360_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  // Contrats d'usage outils : a quoi sert chaque outil, quand l'agent doit l'utiliser, quelle preuve bloque le faux travail.
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/tool-operating-contracts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ToolOperatingContractsPayload | null) => { if (!cancelled && d?.ok) setToolContracts(d); })
      .catch(() => {});
    void load(); const iv = window.setInterval(load, 360_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  // Cablage spine reel : Command Tower + Central Brain + Proof Ledger vers chaque contrat d'outil, avec runtime-work comme gate d'animation.
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/hub-wiring", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HubWiringPayload | null) => { if (!cancelled && d?.ok) setHubWiring(d); })
      .catch(() => {});
    void load(); const iv = window.setInterval(load, 180_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  // outils SaaS/subscriptions rattachés à LEUR maison — statut depuis probes live/locales (jamais faux-vert)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const out: WorldMachine[] = [];
      try {
        const r = await fetch("/api/cofiatrading-world-control/linear", { cache: "no-store" });
        const d = r.ok ? await r.json() as { ok?: boolean; status?: string; total?: number; apiUsed?: boolean; cache?: { cachedAtUtc?: string | null; ageSec?: number | null; lastError?: string | null } } : null; const ok = d?.ok === true;
        out.push({ id: "tool_linear", label: "Linear", homeHouse: "paperclip_factory", ok, status: ok ? "LIVE" : "AMBER", role: "Issue/task tracking local-cache-first; API Linear seulement pour refresh contrôlé.", proof: ok ? `${d?.status ?? "LINEAR"} · ${d?.total ?? "?"} issues · cache=${d?.cache?.cachedAtUtc ?? "fresh"} · apiUsed=${String(d?.apiUsed ?? false)}` : `${d?.status ?? "AMBER"} · ${d?.cache?.lastError ?? "linear cache/probe indisponible"}` });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/n8n", { cache: "no-store" });
	        const d = r.ok ? await r.json() as { ok?: boolean; status?: string; activeWorkflows?: number; totalWorkflows?: number; proof?: string; blocker?: string | null; nextAction?: string | null; updatedAtUtc?: string | null; ageDays?: number | null; hubHealth?: { status?: number | null; body?: string | null }; validation?: { publicIngressSmoke?: string | null; paperclipDispatchJobId?: string | null } } : null;
	        const ok = d?.ok === true;
	        out.push({
	          id: "tool_n8n",
	          label: "n8n Cloud",
	          homeHouse: "paperclip_factory",
	          ok,
	          status: ok ? "LIVE" : (d?.status ?? "AMBER_REVERIFY"),
	          role: `Automation cloud/local manifest : hub ingress, heartbeat, queue agents, Paperclip dispatch. Blocage: ${d?.blocker ?? `age=${d?.ageDays ?? "?"}j / hub=${d?.hubHealth?.status ?? "?"}`}. Aucun secret affiché.`,
	          proof: `${d?.proof ?? `manifest n8n absent/stale · workflows=${d?.activeWorkflows ?? 0}/${d?.totalWorkflows ?? 0}`}${d?.nextAction ? ` · next=${d.nextAction}` : ""}`,
	        });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/notion", { cache: "no-store" });
	        const d = r.ok ? await r.json() as {
	          status?: string;
	          local?: { ok?: boolean; desktopRunning?: boolean; notionDbMtimeUtc?: string | null; cachedAliveBlocks?: number | null; proof?: string };
	          sync?: { ok?: boolean; errorCount?: number; newestPushUtc?: string | null; queuedLocalWrites?: number; proof?: string };
	          blocker?: string | null;
	          nextAction?: string | null;
	          databases?: unknown[];
	        } : null;
        const dbs = Array.isArray(d?.databases) ? d.databases.length : 0;
        const localLive = d?.status === "LIVE_LOCAL" && d?.local?.ok === true && d?.sync?.ok === true;
        const localKnown = d?.local?.ok === true || dbs > 0;
        const syncTail = d?.sync ? `sync errors=${d.sync.errorCount ?? "?"} · queue=${d.sync.queuedLocalWrites ?? 0} · newest=${d.sync.newestPushUtc ?? "none"}` : "sync inconnu";
        out.push({
	          id: "tool_notion",
	          label: "Notion Desktop",
	          homeHouse: "obsidian_library",
	          ok: localLive,
	          status: localLive ? "LIVE" : localKnown ? (d?.status ?? "AMBER_LOCAL") : "UNKNOWN",
	          role: `Mirror knowledge local-first : Obsidian canon, Notion Desktop/cache local. Blocage: ${d?.blocker ?? "sync non prouvé"}.`,
          proof: localLive
            ? `${d?.local?.proof ?? "Notion Desktop local"} · ${syncTail}`
            : `${d?.local?.proof ?? "Notion Desktop non prouvé"} · ${syncTail} · ${dbs} DBs mappées${d?.nextAction ? ` · next=${d.nextAction}` : ""}`,
        });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/obsidian", { cache: "no-store" });
        const d = r.ok ? await r.json() as { ok?: boolean; total?: number; sections?: Array<{ section?: string; notes?: number }>; handoffs?: Record<string, string | null> } : null;
        const ok = d?.ok === true && typeof d.total === "number" && d.total > 0;
        const handoffs = d?.handoffs ? Object.entries(d.handoffs).filter(([, value]) => typeof value === "string" && value.length > 0).length : 0;
        out.push({
          id: "tool_obsidian",
          label: "Obsidian Vault",
          homeHouse: "obsidian_library",
          ok,
          status: ok ? "LIVE" : "AMBER",
          role: "Canon mémoire locale COF : décisions, handoffs, agents, preuves. Source locale lue par chaque agent via hub.",
          proof: ok ? `${d?.total ?? 0} notes · ${d?.sections?.length ?? 0} sections · handoffs=${handoffs}` : "Vault Obsidian non prouvé",
        });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/calendar", { cache: "no-store" });
        const d = r.ok ? await r.json() as { ok?: boolean; status?: string; eventsReturned?: number; runUtc?: string | null; summary?: string | null; proof?: { snapshotPath?: string } } : null;
        const ok = d?.ok === true;
        out.push({ id: "tool_google_calendar", label: "Google Calendar", homeHouse: "calendar_tower", ok, status: ok ? "LIVE" : (d?.status ?? "AMBER"), role: "Google Workspace Pro — cadence, events, runs agents.", proof: ok ? `${d?.summary ?? "Calendar bounded read"} · events=${d?.eventsReturned ?? 0} · ${d?.runUtc ?? ""}` : "Google Calendar snapshot indisponible" });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/google-workspace", { cache: "no-store" });
        const d = r.ok ? await r.json() as GoogleWorkspacePayload : null;
        const presentKeys = (d?.keyPresence ?? []).filter((key) => key.present).map((key) => key.name);
        for (const component of d?.components ?? []) {
          out.push({
            id: `tool_google_workspace_${component.id}`,
            label: component.label,
            homeHouse: HOUSE_BY_ID[component.houseId] ? component.houseId : "proof_ledger",
            ok: component.ok,
            status: component.status,
            role: `${component.capability} Chef: ${component.chiefAgent}. Agents: ${component.workerAgents.join(", ")}.`,
            proof: component.proof,
            sourceTag: component.sourceTag,
          });
        }
        out.push({
          id: "tool_google_api_keys",
          label: "Google API keys",
          homeHouse: "central_brain",
          ok: false,
          status: presentKeys.length > 0 ? "AMBER_REVERIFY" : "UNKNOWN",
          role: "Presence env redacted only. Les valeurs ne sont jamais exposees; les composants Workspace portent le statut LIVE quand la preuve locale existe.",
          proof: presentKeys.length ? `present=${presentKeys.join(", ")} · values=redacted · connectorLive=${d?.summary?.live ?? 0}/${d?.summary?.components ?? 0}` : `no env key exposed; connectorLive=${d?.summary?.live ?? 0}/${d?.summary?.components ?? 0}; keys not marked LIVE`,
          sourceTag: d?.sourceTag,
        });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/notebooklm", { cache: "no-store" });
        const d = r.ok ? await r.json() as { ok?: boolean; status?: string; packsSynced?: number; packsTotal?: number; packsAwaiting?: number; proof?: string; lastAuditUtc?: string | null; blocker?: string } : null;
        const status = d?.status ?? "UNKNOWN";
        const ok = status === "LIVE";
        out.push({ id: "tool_notebooklm", label: "NotebookLM", homeHouse: "notebook_alm", ok, status, role: "Google NotebookLM — grounding et synthèse; pas d'API publique, preuve via index local.", proof: d?.proof ?? d?.blocker ?? "notebooklm_packs.json" });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/perplexity", { cache: "no-store" });
        const d = r.ok ? await r.json() as { ok?: boolean; status?: string; counts?: { opportunities?: number; action_packets?: number; outcomes?: number }; controlPlane?: { liveExported?: number; pendingQueue?: number }; proof?: string; generatedAtUtc?: string | null; nextAction?: string } : null;
        const status = d?.status ?? "UNKNOWN";
        const ok = status === "LIVE";
        out.push({ id: "tool_perplexity", label: "Perplexity Radar", homeHouse: "lightrag_observatory", ok, status, role: "Research/radar externe — abonnement local, pas d'appel API caché.", proof: d?.proof ?? d?.nextAction ?? "perplexity_sync_status.json" });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/console-ia", { cache: "no-store" });
        const d = r.ok ? await r.json() as { ok?: boolean; status?: string; mode?: string; sourceTag?: string; endpoint?: string; paths?: { packetsDir?: string; responsesDir?: string } } : null;
        const ok = d?.ok === true && d?.status === "LOCAL_PACKET_ROUTE_READY";
        out.push({
          id: "tool_console_ia",
          label: "Console IA",
          homeHouse: "central_brain",
          ok,
          status: ok ? "LOCAL_READY" : "AMBER",
          role: "Central Brain local packet router : agents, packets, réponses. Aucun envoi externe automatique.",
          proof: ok ? `LOCAL_PACKET_ROUTE_READY · ${d?.mode ?? "LOCAL_PACKET_READY"} · ${d?.paths?.packetsDir ?? "packets local"}` : "Console IA route locale indisponible",
          sourceTag: d?.sourceTag,
        });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/proof-ledger-coordination", { cache: "no-store" });
        const d = r.ok ? await r.json() as ProofLedgerCoordinationPayload : null;
        const ok = d?.ok === true && d?.status === "LOCAL_COORDINATION_READY";
        out.push({
          id: "tool_proof_ledger_coordination",
          label: "Proof Ledger Coordinator",
          homeHouse: "proof_ledger",
          ok,
          status: ok ? "LOCAL_READY" : "AMBER_REVIEW",
          role: "Coordination locale Codex / Console IA / agents : claims, anti-doublon, routage Central Brain; ne transforme jamais un backlog en agent actif.",
          proof: `claims=${d?.summary?.activeClaims ?? 0} · sessions=${d?.summary?.activeSessions ?? 0} · doublons=${d?.summary?.duplicateGroups ?? 0} · ordres_non_exécutes=${d?.summary?.queuedDispatches ?? 0} · ${d?.paths?.claimsJsonl ?? "claims.jsonl"}`,
          sourceTag: d?.sourceTag,
        });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/openclaw-repo", { cache: "no-store" });
        const d = r.ok ? await r.json() as { ok?: boolean; status?: string; proof?: string; sourceTag?: string } : null;
        const ok = d?.ok === true;
        out.push({
          id: "tool_openclaw_repo",
          label: "OpenClaw GitHub",
          homeHouse: "mission_control_tower",
          ok,
          status: ok ? "GREEN" : "AMBER_REVERIFY",
          role: "Repo origin abhi1693/openclaw-mission-control relié à Command Tower; preuve locale git, pas panneau externe.",
          proof: d?.proof ?? "openclaw repo remote non prouvé",
          sourceTag: d?.sourceTag,
        });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/lobster", { cache: "no-store" });
        const d = r.ok ? await r.json() as LobsterPayload : null;
        for (const component of d?.components ?? []) {
          out.push({
            id: `tool_lobster_${component.id}`,
            label: component.label,
            homeHouse: HOUSE_BY_ID[component.houseId] ? component.houseId : "openclaw_agent_barracks",
            ok: component.ok,
            status: component.status,
            role: component.role,
            proof: component.proof,
            sourceTag: d?.sourceTag,
          });
        }
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/vps-fleet", { cache: "no-store" });
        const d = r.ok ? await r.json() as {
          ok?: boolean;
          status?: string;
          sourceTag?: string;
          host?: string;
          orchestrator?: string;
          llm?: string;
          pullback?: string;
          proofPolicy?: string;
          total?: number;
          liveCount?: number;
          mirrorMtime?: string | null;
          mirrorFresh?: boolean;
          mirrorAgeSec?: number | null;
          agents?: Array<{ id?: string; live?: boolean; status?: string; ts?: string | null; ageSec?: number | null; proof?: string }>;
        } : null;
        const status = d?.status ?? "UNKNOWN";
        const liveCount = d?.liveCount ?? 0;
        const total = d?.total ?? 0;
        const live = status === "LIVE" && d?.mirrorFresh === true && liveCount > 0;
        const freshest = (d?.agents ?? [])
          .filter((agent) => agent.live === true && typeof agent.ageSec === "number")
          .sort((a, b) => (a.ageSec ?? Number.POSITIVE_INFINITY) - (b.ageSec ?? Number.POSITIVE_INFINITY))[0];
        out.push({
          id: "tool_vps_fleet",
          label: "Hostinger VPS Fleet",
          homeHouse: "openclaw_agent_barracks",
          ok: live,
          status: live ? "LIVE" : status === "LIVE" ? "AMBER_REVERIFY" : status,
          role: "Flotte agents VPS rattachée à Agents Village; preuve par mirror local rapatrié, jamais par badge externe.",
          proof: live
            ? `${liveCount}/${total} agents VPS frais · mirrorAgeSec=${d?.mirrorAgeSec ?? "?"} · freshest=${freshest?.id ?? "unknown"}:${freshest?.ageSec ?? "?"}s · ${d?.proofPolicy ?? ""}`
            : `${status} · live=${liveCount}/${total} · mirrorFresh=${String(d?.mirrorFresh ?? false)} · mirrorAgeSec=${d?.mirrorAgeSec ?? "?"} · ${d?.proofPolicy ?? "NO_FALSE_LIVE"}`,
          sourceTag: d?.sourceTag,
        });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/console-ia?destinations=1", { cache: "no-store" });
        const d = r.ok ? await r.json() as { destinations?: Array<{ destinationId?: string; label?: string; readStatus?: string; bridgeStatus?: string; feed?: unknown[]; note?: string }> } : null;
        const destinations = d?.destinations ?? [];
        for (const dest of destinations) {
          const id = dest.destinationId ?? "telegram";
          const feedCount = Array.isArray(dest.feed) ? dest.feed.length : 0;
          const liveRead = feedCount > 0 && (dest.readStatus === "READ_CONNECTED" || dest.bridgeStatus === "BRIDGE_LIVE");
          out.push({ id: `tool_${id}`, label: dest.label ?? id, homeHouse: "vip_gate", ok: liveRead, status: liveRead ? "LIVE" : "AMBER", role: "Telegram read-only; ecriture verrouillee hors action explicite.", proof: liveRead ? `${dest.bridgeStatus} · ${feedCount} messages lus` : dest.note ?? "feed non branche" });
        }
      } catch { /* ignore */ }
      if (!cancelled) setToolMachines(out);
    };
    void load(); const iv = window.setInterval(load, 180_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => {
    const el = sceneRef.current; if (!el) return;
    let raf = 0;
    const measure = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        setSize({ cw: rect.width, ch: rect.height });
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      ro.disconnect();
    };
  }, []);

  // ════════ Caméra (pan/zoom) + mode Édition (drag des maisons) + persistance ════════
  const [cam, setCam] = useState<WorldCamera>({ z: 1, tx: 0, ty: 0 });
  const [editMode, setEditMode] = useState(false);
  const [posOverride, setPosOverride] = useState<Record<string, { x: number; y: number }>>({});
  const dragRef = useRef<{ mode: "pan" | "house" | null; id?: string; sx: number; sy: number; camTx: number; camTy: number; hx: number; hy: number; moved: boolean }>({ mode: null, sx: 0, sy: 0, camTx: 0, camTy: 0, hx: 0, hy: 0, moved: false });
  const movedRef = useRef(false); // supprime le clic-sélection juste après un drag
  const layoutReady = useRef(false); // évite d'écraser le serveur avant le 1er chargement
  const layoutDirty = useRef(false); // true uniquement après action locale (zoom/pan/drag/reset)
  const layoutSaving = useRef(false);
  const layoutUpdatedAt = useRef<string | null>(null);
  const layoutClientId = useRef<string>("");
  const saveTimer = useRef<number | null>(null);
  const canonicalCam = useMemo(() => ({ z: 1, tx: 0, ty: 0 }), []);
  const normalizeCam = useCallback((raw: unknown) => {
    const value = raw && typeof raw === "object" ? raw as Partial<{ z: number; tx: number; ty: number }> : {};
    const z = typeof value.z === "number" && Number.isFinite(value.z) ? value.z : 1;
    const tx = typeof value.tx === "number" && Number.isFinite(value.tx) ? value.tx : 0;
    const ty = typeof value.ty === "number" && Number.isFinite(value.ty) ? value.ty : 0;
    return stabilizeCamera({
      z: clampNumber(z, 0.5, 2),
	      tx: clampNumber(tx, -4200, 4200),
	      ty: clampNumber(ty, -5200, 5200),
    });
  }, []);
  const normalizePos = useCallback((raw: unknown): Record<string, { x: number; y: number }> => {
    const out: Record<string, { x: number; y: number }> = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      const point = value && typeof value === "object" ? value as Partial<{ x: number; y: number }> : {};
      if (typeof point.x === "number" && typeof point.y === "number" && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        out[id] = { x: clampNumber(point.x, -400, 500), y: clampNumber(point.y, -400, 500) };
      }
    }
    return out;
  }, []);
  const getLayoutClientId = useCallback(() => {
    if (layoutClientId.current) return layoutClientId.current;
    try {
      const existing = window.localStorage.getItem("cofiat-world-layout-client-id");
      if (existing) layoutClientId.current = existing;
      else {
        const created = `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        layoutClientId.current = created;
        window.localStorage.setItem("cofiat-world-layout-client-id", created);
      }
    } catch {
      layoutClientId.current = `client_${Date.now().toString(36)}`;
    }
    return layoutClientId.current;
  }, []);
  const markLayoutDirty = useCallback(() => { layoutDirty.current = true; }, []);
  const setSharedCam = useCallback((next: WorldCamera | ((current: WorldCamera) => WorldCamera)) => {
    setCam((current) => {
      const normalized = normalizeCam(typeof next === "function" ? next(current) : next);
      if (!cameraChanged(current, normalized)) return current;
      markLayoutDirty();
      return normalized;
    });
  }, [markLayoutDirty, normalizeCam]);
  const applySharedLayout = useCallback((layout?: SharedWorldLayout | null) => {
    if (!layout) return;
    const stamp = typeof layout.updatedAt === "string" ? layout.updatedAt : null;
    if (stamp && stamp === layoutUpdatedAt.current) return;
    if (dragRef.current.mode || layoutDirty.current || layoutSaving.current || saveTimer.current) return;
    const pos = normalizePos(layout.pos);
    setPosOverride(pos);
    const incomingCam = normalizeCam(layout.cam ?? canonicalCam);
    const isLegacyDefaultCam = Math.abs(incomingCam.z - 1) < 0.001 && Math.abs(incomingCam.tx) < 0.001 && Math.abs(incomingCam.ty) < 0.001;
    setCam(isLegacyDefaultCam ? canonicalCam : incomingCam);
    if (stamp) layoutUpdatedAt.current = stamp;
  }, [canonicalCam, normalizeCam, normalizePos]);
  // chargement + sync live : positions ET caméra viennent du layout Hub, pas du navigateur isolé.
  useEffect(() => {
    getLayoutClientId();
    try {
      const raw = window.localStorage.getItem("cofiat-world-layout-v1");
      if (raw) {
        const o = JSON.parse(raw) as SharedWorldLayout;
        setPosOverride(normalizePos(o.pos));
        setCam(canonicalCam);
        if (typeof o.updatedAt === "string") layoutUpdatedAt.current = o.updatedAt;
      }
    } catch { /* ignore */ }
    let cancelled = false;
    const load = () => fetch(freshApiUrl("/api/cofiatrading-world-control/layout"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.layout) applySharedLayout(d.layout as SharedWorldLayout); })
      .catch(() => {})
      .finally(() => { if (!cancelled) layoutReady.current = true; });
    void load();
    const iv = window.setInterval(load, 5000);
    const refreshVisible = () => { if (document.visibilityState !== "hidden") void load(); };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [applySharedLayout, canonicalCam, getLayoutClientId, normalizeCam, normalizePos]);
  // sauvegarde DURABLE : localStorage immédiat + POST serveur (debounce 600ms)
  useEffect(() => {
    if (!layoutReady.current) return; // pas avant d'avoir chargé (sinon on écrase avec les défauts)
    if (!layoutDirty.current) return; // une sync distante ne doit jamais réécrire le serveur
    layoutDirty.current = false;
    const payload: SharedWorldLayout = {
      pos: posOverride,
      cam,
      viewport: { cw: size.cw, ch: size.ch, windowW: window.innerWidth, windowH: window.innerHeight, dpr: window.devicePixelRatio || 1 },
      clientId: getLayoutClientId(),
    };
    try { window.localStorage.setItem("cofiat-world-layout-v1", JSON.stringify(payload)); } catch { /* ignore */ }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      layoutSaving.current = true;
      fetch("/api/cofiatrading-world-control/layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.updatedAt) layoutUpdatedAt.current = d.updatedAt as string; })
        .catch(() => {})
        .finally(() => { layoutSaving.current = false; });
    }, 600);
  }, [cam, getLayoutClientId, posOverride, size.ch, size.cw]);
  // maisons effectives (positions overridées par l'édition Erwin)
  const effHouses = useMemo(() => ALL_HOUSES.map((h) => (posOverride[h.id] ? { ...h, x: posOverride[h.id].x, y: posOverride[h.id].y } : h)), [posOverride]);
  const EFF_BY_ID = useMemo(() => Object.fromEntries(effHouses.map((h) => [h.id, h])) as Record<string, House>, [effHouses]);
  const assets = viewSnapshot?.assetsWarehouse;
  const services = useMemo(() => viewSnapshot?.services ?? [], [viewSnapshot?.services]);
  const servicesOk = services.filter((s) => s.ok).length;
  const openclawRuntime = viewSnapshot?.openclawRuntime ?? null;
  const snapshotToolMachines = useMemo<WorldMachine[]>(() => {
    const out: WorldMachine[] = [];
    const consoleIa = viewSnapshot?.consoleIa;
    if (consoleIa) {
      const ok = consoleIa.ok === true && consoleIa.status === "LOCAL_PACKET_ROUTE_READY";
      out.push({
        id: "tool_console_ia",
        label: "Console IA",
        homeHouse: "central_brain",
        ok,
        status: ok ? "LOCAL_READY" : "AMBER",
        role: "Central Brain local packet router : agents, packets, réponses. Aucun envoi externe automatique.",
        proof: ok ? `LOCAL_PACKET_ROUTE_READY · ${consoleIa.mode ?? "LOCAL_PACKET_READY"} · ${consoleIa.paths?.packetsDir ?? consoleIa.proof ?? "packets local"}` : consoleIa.proof ?? "Console IA route locale à revérifier",
        sourceTag: consoleIa.sourceTag,
      });
    }
    const openclawRepo = viewSnapshot?.openclawRepo;
    if (openclawRepo) {
      const ok = openclawRepo.ok === true;
      out.push({
        id: "tool_openclaw_repo",
        label: "OpenClaw GitHub",
        homeHouse: "mission_control_tower",
        ok,
        status: ok ? "GREEN" : "AMBER_REVERIFY",
        role: "Repo origin abhi1693/openclaw-mission-control relié à Command Tower; preuve locale git, pas panneau externe.",
        proof: openclawRepo.proof ?? "openclaw repo remote non prouvé",
        sourceTag: openclawRepo.sourceTag,
      });
    }
    return out;
  }, [viewSnapshot?.consoleIa, viewSnapshot?.openclawRepo]);
  const runtimeGateway = openclawRuntime?.services.find((svc) => svc.id === "openclaw_gateway_18789") ?? null;

  const statusFor = useCallback((id: string): string => {
    const houseTruth = truthByHouse[id] ?? [];
    const truthLive = houseTruth.some(isTruthLive);
    const missionSource = houseOrchestrator?.houseMissions?.length ? houseOrchestrator.houseMissions : viewSnapshot?.houseMissions ?? [];
    const localDispatchReady = missionSource.some((mission) => mission.houseId === id && isLocalDispatchMission(mission));
    const localServiceLive = services.some((service) =>
      service.ok === true
      && SERVICE_HOME_BY_ID[service.id ?? ""] === id
      && proofLooksUsable(service.url ?? service.status ?? null)
    );
    const runtimeServiceLive = (openclawRuntime?.services ?? []).some((service) =>
      service.ok === true
      && SERVICE_HOME_BY_ID[service.id] === id
      && service.http_code !== null
    );
    const toolLiveFallback = !truthReady && toolMachines.some((machine) => machine.homeHouse === id && isMachineLiveWithProof(machine));
    if (publisherCritical.active && COFIAPUBLISHER_ALERT_HOUSES.has(id)) return "ERR";
    if (PLANNED_IDS.has(id)) return "PLANNED"; // maisons à construire (CofiaPublisher) : jamais LIVE, statut roadmap honnête
    if (truthLive || localServiceLive || runtimeServiceLive || toolLiveFallback) return "LIVE";
    if (localDispatchReady) return "LOCAL_DISPATCH";
    if (MODULE_IDS.has(id)) return id === "notebook_alm"
      ? (houseTruth[0]?.status ?? (!truthReady ? toolMachines.find((machine) => machine.id === "tool_notebooklm")?.status : undefined) ?? "AMBER")
      : "AMBER"; // ALM/Proof = modules §23/§24, honnêtes AMBER sauf source fraîche prouvée.
    if (houseStatuses && houseStatuses[id]) { const raw = houseStatuses[id]; if (onDemandSet.has(id) && (raw === "SOURCE_DOWN" || raw === "DEGRADED")) return "SLEEPING"; if (raw === "LIVE" || raw === "GREEN") return "REGISTERED"; return raw; }
    if (registryError) return "ERR"; if (houseStatuses === null) return "LOADING"; return "ERR";
  }, [houseStatuses, onDemandSet, publisherCritical.active, registryError, toolMachines, truthByHouse, truthReady, services, openclawRuntime?.services, houseOrchestrator?.houseMissions, viewSnapshot?.houseMissions]);

  /* ════════ scène : terrain doux + routes + parcelles (viewBox serré sur les bâtiments) ════════ */
  const scene = useMemo(() => {
    const wxs = effHouses.flatMap((h) => [h.x, h.x + h.w]);
    const wys = effHouses.flatMap((h) => [h.y, h.y + h.h]);
    const worldMinX = Math.min(...wxs), worldMaxX = Math.max(...wxs), worldMinY = Math.min(...wys), worldMaxY = Math.max(...wys);
    const spanX = worldMaxX - worldMinX;
    const spanY = worldMaxY - worldMinY;
    const parkAnchorHouse = EFF_BY_ID.proof_ledger ?? EFF_BY_ID.openclaw_agent_barracks ?? EFF_BY_ID.iron_office ?? effHouses[0];
    const parkAnchorFront = houseFrontWorld(parkAnchorHouse);
    const leisure = {
      anchorHouseId: parkAnchorHouse.id,
      wx: parkAnchorFront.wx - Math.max(34, spanX * 0.24),
      wy: parkAnchorFront.wy + Math.max(8, spanY * 0.06),
      w: Math.max(30, spanX * 0.12),
      h: Math.max(20, spanY * 0.08),
    };
    const built = effHouses.map((h) => {
      const profile = structureProfile(h);
      const cxw = h.x + h.w / 2, cyw = h.y + h.h / 2; const hw = (h.w * BUILDING_FOOT * profile.footX) / 2, hh = (h.h * BUILDING_FOOT * profile.footY) / 2;
      const corners = [[cxw - hw, cyw - hh], [cxw + hw, cyw - hh], [cxw + hw, cyw + hh], [cxw - hw, cyw + hh]].map(([wx, wy]) => isoProject(wx, wy));
      const ground: Pt[] = corners.map((c) => ({ x: c.sx, y: c.sy })); const base = centroid(ground); const bodyH = buildingBodyH(h);
      return { house: h, ground, base, height: bodyH, depth: h.x + h.y };
    });
    // bornes visuelles : bâtiments + architectures hautes, puis littoral/portes.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of built) {
      const topLift = b.house.id === "proof_ledger"
        ? b.height + 330
        : isLandmarkType(b.house.type)
          ? b.height * 2.15 + 22
          : b.height * 1.3 + 18;
      const sideLift = b.house.id === "proof_ledger" ? Math.max(b.house.w * 12, 380) : b.house.w * 12;
      for (const pt of [...b.ground, { x: b.base.x - sideLift, y: b.base.y - topLift }, { x: b.base.x + sideLift, y: b.base.y - topLift }]) {
        minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y); maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
      }
    }

    // île douce (hull serré autour des bâtiments)
    const leisureGround = [
      isoProject(leisure.wx - leisure.w, leisure.wy - leisure.h),
      isoProject(leisure.wx + leisure.w, leisure.wy - leisure.h),
      isoProject(leisure.wx + leisure.w, leisure.wy + leisure.h),
      isoProject(leisure.wx - leisure.w, leisure.wy + leisure.h),
    ].map((p) => ({ x: p.sx, y: p.sy }));
    const allGround = built.flatMap((b) => {
      const frontWorld = houseFrontWorld(b.house);
      const frontIso = isoProject(frontWorld.wx, frontWorld.wy + 3.5);
      const front: Pt = { x: frontIso.sx, y: frontIso.sy };
      const residentSlots = AGENT_SLOTS.map((slot) => {
        const p = isoProject(frontWorld.wx + slot.dx, frontWorld.wy + slot.dy + 0.8);
        return { x: p.sx, y: p.sy };
      });
      return [...b.ground, front, ...residentSlots];
    }).concat(leisureGround); const ic = centroid(allGround); const N = 30; const islandPts: Pt[] = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      let mp = -Infinity, far = { x: ic.x, y: ic.y };
      for (const p of allGround) {
        const proj = (p.x - ic.x) * Math.cos(a) + (p.y - ic.y) * Math.sin(a);
        if (proj > mp) { mp = proj; far = p; }
      }
      const rough = 0.86 + rseed(k * 13.7) * 0.26;
      islandPts.push({ x: far.x + Math.cos(a) * 62 * rough, y: far.y + Math.sin(a) * 42 * rough });
    }
    const islandPath = smoothClosedPath(islandPts);

    // districts (zones douces, dégradé) — centroïde + rayon depuis l'étalement des membres
    const districts = (Object.keys(ZONES) as ZoneId[]).map((zid) => {
      const members = built.filter((b) => b.house.zone === zid); const c = centroid(members.map((m) => m.base));
      let rx = 84, ry = 52; for (const m of members) { rx = Math.max(rx, Math.abs(m.base.x - c.x) + 92); ry = Math.max(ry, Math.abs(m.base.y - c.y) + 62); }
      return { id: zid, cx: c.x, cy: c.y, rx, ry, label: { x: c.x, y: c.y - ry * 0.78 } };
    });
    const hills = districts.map((d, i) => ({
      id: d.id,
      x: d.cx + (rseed(i + 4) - 0.5) * d.rx * 0.34,
      y: d.cy + (rseed(i + 8) - 0.5) * d.ry * 0.34,
      rx: d.rx * (0.28 + rseed(i + 11) * 0.12),
      ry: d.ry * (0.22 + rseed(i + 15) * 0.1),
      tone: ZONES[d.id].edge,
    }));

    // routes (chemins réels)
	    const roads = ROAD_LINKS.map(([a, b, kind]) => {
	      const ha = EFF_BY_ID[a], hb = EFF_BY_ID[b]; const fa = isoProject(houseFrontWorld(ha).wx, houseFrontWorld(ha).wy), fb = isoProject(houseFrontWorld(hb).wx, houseFrontWorld(hb).wy);
	      const dx = fb.sx - fa.sx, dy = fb.sy - fa.sy, len = Math.max(1, Math.hypot(dx, dy));
	      const nx = -dy / len, ny = dx / len;
	      const bend = stableRouteBend(a, b, kind);
	      const c1 = { x: fa.sx + dx * 0.32 + nx * bend, y: fa.sy + dy * 0.32 + ny * bend - 8 };
	      const c2 = { x: fa.sx + dx * 0.68 - nx * bend * 0.62, y: fa.sy + dy * 0.68 - ny * bend * 0.62 + 6 };
	      return { id: `${a}__${b}`, a, b, kind, fa, fb, c1, c2, d: `M ${fa.sx.toFixed(1)} ${fa.sy.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${fb.sx.toFixed(1)} ${fb.sy.toFixed(1)}`, w: kind === "main" ? 22 : 15 };
	    });
	    const roadPoint = (r: typeof roads[number], t: number) => {
	      const mt = 1 - t;
	      const x = mt ** 3 * r.fa.sx + 3 * mt ** 2 * t * r.c1.x + 3 * mt * t ** 2 * r.c2.x + t ** 3 * r.fb.sx;
	      const y = mt ** 3 * r.fa.sy + 3 * mt ** 2 * t * r.c1.y + 3 * mt * t ** 2 * r.c2.y + t ** 3 * r.fb.sy;
	      const t2 = Math.min(0.98, t + 0.02);
	      const mt2 = 1 - t2;
	      const x2 = mt2 ** 3 * r.fa.sx + 3 * mt2 ** 2 * t2 * r.c1.x + 3 * mt2 * t2 ** 2 * r.c2.x + t2 ** 3 * r.fb.sx;
	      const y2 = mt2 ** 3 * r.fa.sy + 3 * mt2 ** 2 * t2 * r.c1.y + 3 * mt2 * t2 ** 2 * r.c2.y + t2 ** 3 * r.fb.sy;
	      return { x, y, angle: Math.atan2(y2 - y, x2 - x) * 180 / Math.PI };
	    };
	    const roadFurniture = roads.flatMap((r, i) => [0.16, 0.38, 0.62, 0.84].map((t, j) => {
	      const p = roadPoint(r, t);
	      const kind = j === 0 ? "stop" as const : j === 2 && r.kind === "main" ? "signal" as const : "lamp" as const;
	      return { ...p, id: `${r.id}-${j}`, roadId: r.id, houseId: j < 2 ? r.a : r.b, kind, side: (i + j) % 2 === 0 ? 1 : -1 };
	    }));

    // lanternes : devant chaque maison
    const lamps: Array<{ x: number; y: number; houseId: string }> = [];
    built.forEach((b) => { const f = isoProject(houseFrontWorld(b.house).wx + b.house.w * 0.7, houseFrontWorld(b.house).wy); lamps.push({ x: f.sx, y: f.sy, houseId: b.house.id }); });

    // ── décor Astrub : anneau côtier (plage) + arbres/buissons/rochers en lisière (hors bâtiments) ──
    const coastPts = islandPts.map((p) => ({ x: ic.x + (p.x - ic.x) * 1.07, y: ic.y + (p.y - ic.y) * 1.07 + 4 }));
    const coastPath = smoothClosedPath(coastPts);
    for (const pt of [...islandPts, ...coastPts]) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y); maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
    }
    const bases = built.map((b) => b.base);
    const decor: Array<{ x: number; y: number; kind: "tree" | "bush" | "rock"; s: number }> = [];
    islandPts.forEach((p, k) => {
      const nxt = islandPts[(k + 1) % islandPts.length];
      for (const t of [0.18, 0.62]) {
        const q = lerpPt(p, nxt, t);
        const inn = lerpPt(q, ic, 0.16 + rseed(k * 7.3 + t * 11) * 0.1);
        if (bases.some((bb) => Math.hypot(bb.x - inn.x, bb.y - inn.y) < 64)) continue;
        const r = rseed(k * 5.1 + t * 9.7);
        const kind: "tree" | "bush" | "rock" = r < 0.5 ? "tree" : r < 0.78 ? "bush" : "rock";
        decor.push({ x: inn.x, y: inn.y, kind, s: 0.82 + rseed(k + t * 3) * 0.55 });
      }
    });
    const shoreRocks = coastPts.filter((_, i) => i % 3 === 0).map((p, i) => ({ x: lerpPt(p, ic, 0.1 + rseed(i + 2) * 0.08).x, y: lerpPt(p, ic, 0.1 + rseed(i + 3) * 0.08).y, s: 0.8 + rseed(i + 6) * 0.8 }));

    // place centrale (town square) + jonctions pavees devant les portes
    const plaza = ic;
    const junctions = built.map((b) => { const f = isoProject(houseFrontWorld(b.house).wx, houseFrontWorld(b.house).wy); return { x: f.sx, y: f.sy, houseId: b.house.id }; });
    const leisureCenter = centroid(leisureGround);
    const leisureGate = { x: leisureCenter.x + 104, y: leisureCenter.y - 52 };
    const leisureAnchor = built.find((b) => b.house.id === leisure.anchorHouseId)
      ?? [...built].sort((a, b) => Math.hypot(a.base.x - leisureGate.x, a.base.y - leisureGate.y) - Math.hypot(b.base.x - leisureGate.x, b.base.y - leisureGate.y))[0]
      ?? null;
    const leisureAccess = leisureAnchor ? (() => {
      const front = houseFrontWorld(leisureAnchor.house);
      const start = isoProject(front.wx, front.wy);
      const dx = leisureGate.x - start.sx;
      const dy = leisureGate.y - start.sy;
      const len = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / len;
      const ny = dx / len;
      const c1 = { x: start.sx + dx * 0.32 + nx * 32, y: start.sy + dy * 0.32 + ny * 20 - 8 };
      const c2 = { x: start.sx + dx * 0.72 - nx * 18, y: start.sy + dy * 0.72 - ny * 10 + 12 };
      return {
        from: leisureAnchor.house.id,
        d: `M ${start.sx.toFixed(1)} ${start.sy.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${leisureGate.x.toFixed(1)} ${leisureGate.y.toFixed(1)}`,
        gate: leisureGate,
      };
    })() : null;
	    const padX = 54, padTop = 34, padBottom = 32;
	    const vbMinX = minX - padX, vbMinY = minY - padTop, vbW = maxX - minX + padX * 2, vbH = maxY - minY + padTop + padBottom;

    return { built, vbMinX, vbMinY, vbW, vbH, viewBox: `${vbMinX.toFixed(0)} ${vbMinY.toFixed(0)} ${vbW.toFixed(0)} ${vbH.toFixed(0)}`, islandPath, coastPath, districts, hills, roads, roadFurniture, lamps, decor, shoreRocks, plaza, junctions, leisure, leisureAccess };
  }, [effHouses, EFF_BY_ID]);

  const builtSorted = useMemo(() => [...scene.built].sort((a, b) => a.depth - b.depth), [scene.built]);
  const uiScale = useMemo(() => (size.cw > 0 ? Math.min(size.cw / scene.vbW, size.ch / scene.vbH) : 0), [size, scene.vbW, scene.vbH]);

  const angels = useMemo(() => angelRoster?.anges ?? [], [angelRoster?.anges]);
  const angelsByHome = useMemo(() => { const m: Record<string, Angel[]> = {}; for (const a of angels) (m[ANGEL_HOME_BY_ID[a.id] ?? "central_brain"] ||= []).push(a); return m; }, [angels]);
  const canonAgents = useMemo<CanonAgent[]>(() => (viewSnapshot?.agentsCanon?.agents ?? []).map((a) => ({ ...a, house: HOUSE_BY_ID[a.house] ? a.house : "central_brain" })), [viewSnapshot?.agentsCanon]);
  const agentsByHome = useMemo(() => { const m: Record<string, CanonAgent[]> = {}; for (const a of canonAgents) (m[a.house] ||= []).push(a); for (const k of Object.keys(m)) m[k].sort((x, y) => rankPriority(x) - rankPriority(y)); return m; }, [canonAgents]);
  const houseMissions = useMemo(
    () => (houseOrchestrator?.houseMissions?.length ? houseOrchestrator.houseMissions : viewSnapshot?.houseMissions ?? []),
    [houseOrchestrator?.houseMissions, viewSnapshot?.houseMissions],
  );
  const houseMissionsById = useMemo(() => Object.fromEntries(houseMissions.map((mission) => [mission.houseId, mission])) as Record<string, HouseMissionRecord | undefined>, [houseMissions]);
  const rawLocalDispatchCount = houseOrchestrator?.summary?.queuedDispatches
    ?? houseMissions.reduce((total, mission) => total + (mission.localQueue?.dispatches ?? mission.counts?.activeTasks ?? 0), 0);
  const localCoveredAgentCount = houseOrchestrator?.summary?.coveredAgents
    ?? new Set(houseMissions.flatMap((mission) => (mission.dispatches ?? []).map((dispatch) => dispatch.agentId))).size;
  const localTotalAgentCount = houseOrchestrator?.summary?.totalAgents ?? canonAgents.length;
  const houseOrchestratorSource = houseOrchestrator?.sourceTag ?? viewSnapshot?.houseOrchestrator?.sourceTag ?? (houseMissions.length ? viewSnapshot?.sourceTag : "pending");

  const truthSourcesFlat = useMemo(() => Object.values(truthByHouse).flat(), [truthByHouse]);
  const truthSourceCount = truthSourcesFlat.length;
  const truthBadLiveCount = truthSourcesFlat.filter((source) => isLiveStatus(source.status) && source.ok !== true).length;
  const activeWorkHouseCount = houseMissions.filter((mission) => isRuntimeMission(mission) || (mission.dispatches ?? []).some((dispatch) => isWorkingDispatchStatus(dispatch.status))).length;
  const workingDispatchCount = houseMissions.reduce((total, mission) => total + (mission.dispatches ?? []).filter((dispatch) => isWorkingDispatchStatus(dispatch.status)).length, 0);
  // Maisons = 17 = DESIGN ERWIN (15 construites/registry + 2 PRÉVUES à construire, dont CofiaPublisher). On GARDE houseMissions.length (17), on ne force PAS 15 — les 2 prévues restent visibles sur la roadmap. 2026-06-02 (le 17 n'était PAS un bug).
  // No-false-green : houseOrchestrator = fichier d'état one-shot (aucun cron ne le rafraîchit). S'il est vieux, ses compteurs (Maisons actives / Travail prouvé / Ordres) sont GELÉS → marquer PÉRIMÉ au lieu de mentir "live". 2026-06-02.
  // Fraîcheur = executedAtUtc (vraie exécution de l'orchestrateur). ⚠ state.generatedAtUtc est re-tamponné "now" par le seed SSR (faux-frais) → on s'appuie sur executedAtUtc puis viewSnapshot, jamais state.generatedAtUtc. 2026-06-02.
  const houseOrchestratorRunUtc = houseOrchestrator?.executedAtUtc ?? viewSnapshot?.houseOrchestrator?.executedAtUtc ?? viewSnapshot?.houseOrchestrator?.generatedAtUtc;
  const houseOrchestratorRunMs = houseOrchestratorRunUtc ? Date.parse(houseOrchestratorRunUtc) : NaN;
  const houseOrchestratorAgeH = Number.isFinite(houseOrchestratorRunMs) ? (telemetryNow - houseOrchestratorRunMs) / 3_600_000 : null;
  const houseOrchestratorStale = houseOrchestratorAgeH != null && houseOrchestratorAgeH >= 2;
  const orchStaleSuffix = houseOrchestratorStale ? ` ⚠PÉRIMÉ ${Math.floor(houseOrchestratorAgeH)}h` : "";
  const expiredLocalDispatchCount = houseOrchestrator?.summary?.expiredQueuedDispatches ?? (houseOrchestratorStale ? rawLocalDispatchCount : 0);
  const localDispatchCount = houseOrchestratorStale ? 0 : rawLocalDispatchCount;
  const orchestratedHouseLabel = houseMissions.length ? `${activeWorkHouseCount}/${houseMissions.length}${orchStaleSuffix}` : "sync...";
  const localAssetCoverageLabel = typeof houseOrchestrator?.summary?.assetsAssigned === "number"
    ? fmtNum(houseOrchestrator.summary.assetsAssigned)
    : fmtNum(assets?.assetsInventoryCount);
  const hubLedgerSummary = hubSourceLedger?.summary;
  const hubWiringSummary = hubWiring?.summary;
  const topChips: Array<[string, string]> = [];
  if (publisherCritical.active) topChips.push(["Citadelle", "ALERTE ROUGE"]);
  const ownedAssetMachines = useMemo(() => {
    const buckets: Array<{ id: string; label: string; rx: RegExp; role: string }> = [
      { id: "owned_google_workspace", label: "Google Workspace", rx: /google\s+workspace/i, role: "Calendrier, Drive, Docs, Sheets — owned; usage live seulement avec preuve fraîche." },
      { id: "owned_icloud", label: "iCloud 2TB", rx: /icloud|apple\s+one/i, role: "Stockage COF/CEO — owned; usage agent non supposé." },
      { id: "owned_linear", label: "Linear", rx: /linear/i, role: "Cycles/issues — owned; workflow live seulement avec cycle/projet prouvé." },
      { id: "owned_telegram", label: "Telegram", rx: /telegram/i, role: "Canaux/bots/community — owned; live seulement avec feed/message-count frais." },
      { id: "owned_david", label: "David Bot", rx: /david/i, role: "Agent/bot David — canon; runtime live seulement avec heartbeat/dispatch frais." },
    ];
    const items = buckets
      .map((bucket) => {
        const item = inventory.find((it) => bucket.rx.test(it.name) && /AMBER|REVERIFY|UNKNOWN|PARTIAL|SOURCE/i.test(it.status))
          ?? inventory.find((it) => bucket.rx.test(it.name));
        if (!item) return null;
        const [homeHouse] = resolveHouseIds(item);
        const proof = item.proof || item.nextAction || item.blocker || "inventory-matrix source";
        const rawLive = item.status === "GREEN" || item.status === "LIVE";
        const provenLive = rawLive && proofLooksUsable(proof);
        return {
          id: bucket.id,
          label: bucket.label,
          homeHouse: HOUSE_BY_ID[homeHouse] ? homeHouse : "assets_warehouse",
          ok: provenLive,
          status: rawLive && !provenLive ? "AMBER_REVERIFY" : item.status,
          role: bucket.role,
          proof,
        } satisfies WorldMachine;
      })
      .filter(Boolean);
    return items as WorldMachine[];
  }, [inventory]);

  const truthMachines = useMemo<WorldMachine[]>(() => truthSourcesFlat.map((source) => ({
    id: `truth_${source.id}`,
    label: source.label,
    homeHouse: HOUSE_BY_ID[source.houseId] ? source.houseId : "proof_ledger",
    ok: source.ok,
    status: source.status,
    role: `${source.sourceTag}${source.actionState ? ` · ${source.actionState}` : ""}`,
    proof: source.proof,
    sourceTag: source.sourceTag,
  })), [truthSourcesFlat]);

  const hubLedgerMachines = useMemo<WorldMachine[]>(() => {
    const byHouse = hubSourceLedger?.byHouse ?? {};
    return Object.entries(byHouse)
      .filter(([houseId]) => Boolean(HOUSE_BY_ID[houseId]))
      .map(([houseId, stats]) => {
        const allConnected = stats.total > 0 && stats.connected === stats.total;
        const allProofed = stats.total > 0 && stats.proofed === stats.total;
        const status = stats.red > 0 ? "RED" : stats.amber > 0 || stats.unknown > 0 ? "AMBER_REVERIFY" : "GREEN";
        return {
          id: `hub_source_ledger_${houseId}`,
          label: "Hub Source Ledger",
          homeHouse: houseId,
          ok: allConnected && allProofed && status === "GREEN",
          status,
          role: "Câblage Hub global: sources live, patrimoine, canon assets, runtime et Asset Vault rattachés à ce quartier.",
          proof: `items=${stats.total} · connectés=${stats.connected}/${stats.total} · preuves=${stats.proofed}/${stats.total} · GREEN=${stats.green} AMBER=${stats.amber} RED=${stats.red} UNKNOWN=${stats.unknown}`,
          sourceTag: hubSourceLedger?.sourceTag,
        } satisfies WorldMachine;
      });
  }, [hubSourceLedger]);
  const toolContractList = useMemo(() => toolContracts?.contracts ?? [], [toolContracts?.contracts]);
  const hubWiringMachines = useMemo<WorldMachine[]>(() => {
    if (!hubWiring?.ok) return [];
    const summary = hubWiring.summary ?? {};
    const contracts = hubWiring.contracts ?? [];
    const total = summary.contracts ?? contracts.length;
    const summaryProof = `contracts=${total} · command=${summary.commandConnected ?? 0}/${total} · central=${summary.centralConnected ?? 0}/${total} · proof=${summary.proofConnected ?? 0}/${total} · homes=${summary.homeConnected ?? 0}/${total} · runtime=${summary.runtimeActiveContracts ?? 0}/${total} · sleeping=${summary.sleepingContracts ?? total} · source=${summary.sourceLedgerCoverage ?? "0/0"} · preuves=${summary.sourceProofCoverage ?? "0/0"}`;
    const coreMachines: WorldMachine[] = [
      {
        id: "hub_wiring_command_tower",
        label: "Command Tower Wiring Spine",
        homeHouse: "mission_control_tower",
        ok: (summary.commandConnected ?? 0) === total && total > 0,
        status: (summary.commandConnected ?? 0) === total && total > 0 ? "CONNECTED_PROOFED" : "CONNECTED_WITH_GAPS",
        role: "Bus réel vers tous les contrats d'outils: priorités, GitHub/OpenClaw, boards, ordres et routing.",
        proof: `${summaryProof} · ${hubWiring.sourceTag ?? "hub wiring"}`,
        sourceTag: hubWiring.sourceTag,
      },
      {
        id: "hub_wiring_central_brain",
        label: "Central Brain Wiring Spine",
        homeHouse: "central_brain",
        ok: (summary.centralConnected ?? 0) === total && total > 0,
        status: (summary.centralConnected ?? 0) === total && total > 0 ? "CONNECTED_PROOFED" : "CONNECTED_WITH_GAPS",
        role: "Bus réel vers tous les contrats d'outils: mémoire, console IA, routage, télémétrie et contrôle transverse.",
        proof: `${summaryProof} · ${hubWiring.sourceTag ?? "hub wiring"}`,
        sourceTag: hubWiring.sourceTag,
      },
      {
        id: "hub_wiring_proof_ledger",
        label: "Proof Ledger Wiring Spine",
        homeHouse: "proof_ledger",
        ok: (summary.proofConnected ?? 0) === total && total > 0,
        status: (summary.proofConnected ?? 0) === total && total > 0 ? "CONNECTED_PROOFED" : "CONNECTED_WITH_GAPS",
        role: "Bus réel vers tous les contrats d'outils: qualité mission, preuve, no-false-green et gate d'exécution.",
        proof: `${summaryProof} · ${hubWiring.sourceTag ?? "hub wiring"}`,
        sourceTag: hubWiring.sourceTag,
      },
    ];
    const contractMachines: WorldMachine[] = contracts.map((contract) => ({
      id: `hub_wiring_${contract.id}`,
      label: `${contract.label} Wiring`,
      homeHouse: HOUSE_BY_ID[contract.houseId] ? contract.houseId : "central_brain",
      ok: contract.status === "ACTIVE_PROVED" || contract.status === "CONNECTED_IDLE",
      status: contract.status,
      role: `Câblage hub: ${contract.summary}`,
      proof: contract.proof,
      sourceTag: hubWiring.sourceTag,
      contract: contract.contract ?? toolContractList.find((toolContract) => toolContract.id === contract.id),
      contractSourceTag: toolContracts?.sourceTag ?? hubWiring.sourceTags?.contracts ?? undefined,
    }));
    return [...coreMachines, ...contractMachines];
  }, [hubWiring, toolContractList, toolContracts?.sourceTag]);

  const machines = useMemo(() => {
    const merged = new Map<string, WorldMachine>();
    for (const svc of services) { const id = svc.id ?? ""; const hh = SERVICE_HOME_BY_ID[id]; if (!hh) continue; merged.set(id, { id, label: svc.label ?? id, homeHouse: hh, ok: svc.ok === true && proofLooksUsable(svc.url ?? svc.status ?? null), status: svc.status ?? (svc.ok ? "LIVE" : "UNKNOWN"), role: svc.role, proof: svc.url }); }
    for (const svc of openclawRuntime?.services ?? []) { const hh = SERVICE_HOME_BY_ID[svc.id]; if (!hh) continue; merged.set(svc.id, { id: svc.id, label: svc.label, homeHouse: hh, ok: svc.ok, status: svc.status, proof: svc.http_code === null ? "no listener / timeout" : `HTTP ${svc.http_code}` }); }
    for (const tm of truthMachines) merged.set(tm.id, tm); // sources canon; priorité sur les probes directs.
    const truthIds = new Set(truthMachines.map((machine) => machine.id));
    for (const tm of toolMachines) {
      const hasTruthEquivalent = (
        (tm.id === "tool_linear" && truthIds.has("truth_linear-issues"))
        || (tm.id === "tool_n8n" && truthIds.has("truth_n8n-cloud"))
        || (tm.id === "tool_notion" && truthIds.has("truth_notion-index"))
        || (tm.id === "tool_obsidian" && truthIds.has("truth_obsidian-vault"))
        || (tm.id === "tool_google_calendar" && truthIds.has("truth_calendar-read"))
        || (tm.id === "tool_notebooklm" && truthIds.has("truth_notebooklm-index"))
        || (tm.id === "tool_perplexity" && truthIds.has("truth_perplexity-radar"))
        || (tm.id.startsWith("tool_telegram") && truthMachines.some((machine) => machine.homeHouse === "vip_gate" && machine.id.startsWith("truth_telegram-")))
      );
      if (!hasTruthEquivalent) merged.set(tm.id, tm);
    }
    for (const tm of snapshotToolMachines) merged.set(tm.id, tm);
    for (const hm of hubLedgerMachines) merged.set(hm.id, hm);
    for (const hw of hubWiringMachines) merged.set(hw.id, hw);
    for (const owned of ownedAssetMachines) {
      if (owned.id === "owned_linear" && (merged.has("tool_linear") || merged.has("truth_linear-issues"))) continue;
      if (owned.id === "owned_telegram" && [...merged.keys()].some((id) => id.startsWith("tool_telegram_") || id.startsWith("truth_telegram-"))) continue;
      if (owned.id === "owned_google_workspace" && (merged.has("tool_google_calendar") || merged.has("truth_calendar-read"))) continue;
      merged.set(owned.id, owned);
    }
    return [...merged.values()].map((machine) => enrichMachineWithContract(machine, toolContractList, toolContracts?.sourceTag));
  }, [services, openclawRuntime, toolMachines, snapshotToolMachines, hubLedgerMachines, hubWiringMachines, ownedAssetMachines, truthMachines, toolContractList, toolContracts?.sourceTag]);
  const machinesByHome = useMemo(() => {
    const map: Record<string, WorldMachine[]> = {};
    const priority = (machine: WorldMachine) => {
      if (machine.id === "tool_vps_fleet") return -90;
      if (machine.id.startsWith("hub_wiring_")) return -40;
      if (machine.id.startsWith("truth_")) return -25;
      if (machine.ok) return -10;
      return 0;
    };
    for (const m of machines) (map[m.homeHouse] ||= []).push(m);
    for (const list of Object.values(map)) list.sort((a, b) => priority(a) - priority(b) || a.label.localeCompare(b.label));
    return map;
  }, [machines]);
  const missionQualityRows = useMemo(
    () => houseMissions.map((mission) => ({
      mission,
      quality: computeMissionQuality(mission, machinesByHome[mission.houseId] ?? [], truthByHouse[mission.houseId] ?? []),
    })).sort((a, b) => a.quality.score - b.quality.score),
    [houseMissions, machinesByHome, truthByHouse],
  );
  const missionQualityByHouse = useMemo(
    () => Object.fromEntries(missionQualityRows.map((row) => [row.mission.houseId, row.quality])) as Record<string, MissionQuality | undefined>,
    [missionQualityRows],
  );
  const missionQualityAverage = missionQualityRows.length
    ? Math.round(missionQualityRows.reduce((total, row) => total + row.quality.score, 0) / missionQualityRows.length)
    : 0;
  // inventaire groupé par maison (un item multi-maison "a,b" est rattaché à chaque maison)
	  const inventoryByHouse = useMemo(() => {
	    const map: Record<string, InvItem[]> = {};
	    for (const it of inventory) for (const h of resolveHouseIds(it)) (map[h] ||= []).push(it);
	    return map;
	  }, [inventory]);
	  const hubLedgerItemsByHouse = useMemo(() => {
	    const map: Record<string, HubLedgerItem[]> = {};
	    for (const item of hubSourceLedger?.items ?? []) {
	      const houseId = HOUSE_BY_ID[item.houseId] ? item.houseId : "proof_ledger";
	      (map[houseId] ||= []).push(item);
	    }
	    return map;
	  }, [hubSourceLedger?.items]);
	  const agentItemsById = useMemo(() => {
	    const map: Record<string, InvItem[]> = {};
	    for (const agent of canonAgents) map[agent.id] = inventory.filter((it) => ownerMatchesAgent(it.ownerAgentId, agent));
	    return map;
	  }, [canonAgents, inventory]);
	  const runtimeAgentsByHome = useMemo(() => { const map: Record<string, RuntimeAgent[]> = {}; for (const agent of openclawRuntime?.agents ?? []) { const home = HOUSE_BY_ID[agent.homeHouse] ? agent.homeHouse : "openclaw_agent_barracks"; (map[home] ||= []).push(agent); } return map; }, [openclawRuntime]);
  const selZone = HOUSE_BY_ID[selectedHouse ?? ""] ?? null;

  const activityEvents = useMemo(() => {
    return [...truthEvents, ...worldStateEvents];
  }, [truthEvents, worldStateEvents]);

  /* ════════ activité de maison pilotée par events RÉELS (zéro hasard) ════════ */
  const houseActivity = useMemo(() => {
    const map: Record<string, HouseActivity> = {};
    for (const h of ALL_HOUSES) {
      if (publisherCritical.active && COFIAPUBLISHER_ALERT_HOUSES.has(h.id)) {
        map[h.id] = { state: "alert", label: publisherCritical.reason };
        continue;
      }
      const st = statusFor(h.id);
      if (st === "SOURCE_DOWN" || st === "DEGRADED" || st === "ERR") { map[h.id] = { state: "alert" }; continue; }
      const kws = HOUSE_KEYWORDS[h.id] ?? [];
      // 1) attribution EXPLICITE (house_id structuré côté route world-state)
      // 2) fallback heuristique mots-clés (events sans house_id)
	      const isUsableEvent = (e: FeedEvent) => {
	        const hay = `${e.label ?? ""} ${e.source ?? ""} ${e.kind ?? ""}`.toLowerCase();
	        const kind = String(e.kind ?? "").toLowerCase();
	        return String(e.status ?? "").toUpperCase() === "LIVE"
	          && !isFallbackEventText(hay)
	          && !/truth_source|source_probe|house_mission|heartbeat|trucks/.test(kind);
	      };
      const ev = activityEvents.find((e) => e.house_id === h.id && isUsableEvent(e))
        ?? activityEvents.find((e) => { if (e.house_id) return false; const hay = `${e.label ?? ""} ${e.source ?? ""} ${e.kind ?? ""}`.toLowerCase(); return isUsableEvent(e) && kws.some((k) => hay.includes(k)); });
      if (ev) {
        const hay = `${ev.label ?? ""} ${ev.source ?? ""} ${ev.kind ?? ""}`.toLowerCase();
        const state: AgentState = /messag|telegram|whatsapp|vip|\bdm\b|broadcast|channel/.test(hay) ? "phone"
          : /check|probe|inspect|gateway|audit|health|registry|status/.test(hay) ? "inspect"
          : /linear|issue|ticket|traitement|synchronis|task|backlog|paperclip|reply|support|console|service|publish|render|deploy|caption|repo|github|openclaw/.test(hay) ? "keyboard" : "inspect";
        map[h.id] = { state, label: ev.label };
	      } else {
	        const mission = houseMissionsById[h.id];
	        const workingDispatches = (mission?.dispatches ?? []).filter((dispatch) => isWorkingDispatchStatus(dispatch.status));
	        const queuedDispatches = (mission?.dispatches ?? []).filter((dispatch) => isQueuedDispatchStatus(dispatch.status));
	        if (isRuntimeMission(mission) || workingDispatches.length > 0) {
	          const queued = workingDispatches.length || mission?.counts?.activeTasks || 0;
	          const state: AgentState = h.id === "vip_gate" ? "phone"
	            : h.id === "paperclip_factory" || h.id === "site_seo_lab" || h.id === "youtube_studio" ? "keyboard"
	            : h.id === "calendar_tower" || h.id === "proof_ledger" || h.id === "compliance_port" ? "inspect"
	            : "work";
	          map[h.id] = { state, label: `travail prouvé: ${queued} agent(s) actif(s)` };
	        } else if (isLocalDispatchMission(mission) || queuedDispatches.length > 0) {
	          const queued = queuedDispatches.length || mission?.localQueue?.dispatches || mission?.counts?.activeTasks || 0;
	          map[h.id] = { state: "idle", label: `ordre local non exécuté: ${queued} dispatch(es), zéro agent runtime` };
	        } else map[h.id] = { state: "idle" };
	      }
    }
    return map;
  }, [activityEvents, houseMissionsById, publisherCritical.active, publisherCritical.reason, statusFor]);

	  const agentDispatchStateById = useMemo(() => {
	    const map: Record<string, AgentState> = {};
	    for (const mission of houseMissions) {
		      for (const dispatch of mission.dispatches ?? []) {
		        if (!isWorkingDispatchStatus(dispatch.status)) continue;
		        const state = dispatchStateForHouse(mission.houseId, `${dispatch.action} ${dispatch.target}`);
		        if (dispatch.agentId) map[dispatch.agentId] = state;
		      }
    }
    return map;
  }, [houseMissions]);

  const agentWorkProfilesById = useMemo(() => {
    const map: Record<string, AgentWorkProfile> = {};
    const eventByHouse = new Map<string, FeedEvent>();
    for (const event of activityEvents) {
      if (!event.house_id) continue;
      if (!eventByHouse.has(event.house_id)) eventByHouse.set(event.house_id, event);
    }
    const agentOwnsMission = (agent: CanonAgent, mission: HouseMissionRecord) => {
      const token = `${agent.id} ${agent.name}`.toLowerCase();
      const people = [...(mission.agents ?? []), ...(mission.workers ?? []), ...(mission.chiefs ?? []), ...(mission.chief ? [mission.chief] : [])];
      return people.some((person) => token.includes(String(person.id ?? "").toLowerCase()) || token.includes(String(person.name ?? "").toLowerCase()) || String(person.id ?? "").toLowerCase() === agent.id.toLowerCase());
    };
    for (const agent of canonAgents) {
      const dispatchMission = houseMissions.find((mission) => (mission.dispatches ?? []).some((dispatch) => dispatch.agentId === agent.id || dispatch.agentName === agent.name));
      const assignedMission = dispatchMission ?? houseMissions.find((mission) => agentOwnsMission(agent, mission)) ?? houseMissionsById[agent.house];
      const dispatch = assignedMission?.dispatches?.find((d) => d.agentId === agent.id || d.agentName === agent.name);
      const working = Boolean(dispatch && isWorkingDispatchStatus(dispatch.status));
	      const queued = Boolean(dispatch && isQueuedDispatchStatus(dispatch.status));
	      const houseEvent = eventByHouse.get(agent.house);
	      const state: AgentState = working && assignedMission
	        ? dispatchStateForHouse(assignedMission.houseId, `${dispatch?.action ?? ""} ${dispatch?.target ?? ""}`)
	        : "idle";
      const toolText = [
        dispatch?.action,
        dispatch?.target,
        assignedMission?.mission.title,
        assignedMission?.mission.nextAction,
        assignedMission?.mission.proof,
        houseEvent?.label,
        houseEvent?.source,
        agent.roleBadge,
        agent.responsibilities.join(" "),
      ].filter(Boolean).join(" ");
      const tool = detectToolBadge(toolText, assignedMission?.houseId ?? agent.house);
      const cost = buildCostProfile(agent, agentItemsById[agent.id] ?? [], tool, state);
      map[agent.id] = {
        currentAction: working && dispatch
          ? dispatch.action
	          : queued && dispatch
	            ? `Repos: ordre local non exécuté (${dispatch.action})`
	            : "Repos: aucune mission en exécution prouvée",
        lastAction: houseEvent?.label ?? assignedMission?.mission.proof ?? "Aucune action récente sourçable",
        nextAction: dispatch?.target ?? assignedMission?.mission.nextAction ?? "Aucun prochain ordre prouvé",
        proof: dispatch?.proof ?? assignedMission?.mission.proof ?? houseEvent?.proof ?? "Pas de preuve runtime agent",
        tool,
        costDailyLabel: cost.daily,
        costMissionLabel: cost.mission,
        costProof: cost.proof,
      };
    }
    return map;
  }, [activityEvents, agentItemsById, canonAgents, houseMissions, houseMissionsById]);

  // No-false-green visuel: sans dispatch runtime, un agent ne reste pas devant sa maison. Il part au parc/repos.
  const visibleAgents = useMemo(() => {
    const out: VisibleAgent[] = [];
    let idleIndex = 0;
    const idleSlotsPerRow = 10;
    const idleRows = 5;
    const idleStepX = (scene.leisure.w * 1.55) / Math.max(1, idleSlotsPerRow - 1);
    const idleStepY = (scene.leisure.h * 0.88) / Math.max(1, idleRows - 1);
    for (const h of effHouses) {
      const list = agentsByHome[h.id] ?? [];
      const f = houseFrontWorld(h);
      list.forEach((agent, i) => {
        const state: AgentState = agentDispatchStateById[agent.id] ?? "idle";
        if (state === "idle") {
          const col = idleIndex % idleSlotsPerRow;
          const row = Math.floor(idleIndex / idleSlotsPerRow);
          const cappedRow = Math.min(row, idleRows - 1);
          const rowOffset = (row % 2) * (idleStepX * 0.28);
          out.push({
            agent,
            wx: scene.leisure.wx - scene.leisure.w * 0.78 + col * idleStepX + rowOffset,
            wy: scene.leisure.wy - scene.leisure.h * 0.34 + cappedRow * idleStepY + Math.floor(row / idleRows) * 2.2,
            state,
          });
          idleIndex += 1;
          return;
        }
        const slot = AGENT_SLOTS[i % AGENT_SLOTS.length];
        const ring = Math.floor(i / AGENT_SLOTS.length);
        out.push({ agent, wx: f.wx + slot.dx + ring * 2.4, wy: f.wy + slot.dy - ring * 1.4, state });
      });
    }
    return out;
  }, [agentDispatchStateById, agentsByHome, effHouses, scene.leisure.h, scene.leisure.w, scene.leisure.wx, scene.leisure.wy]);
  const activeVisibleAgents = useMemo(() => visibleAgents.filter((v) => isAgentWorkingState(v.state)), [visibleAgents]);
  const workingAgentCountByHome = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of activeVisibleAgents) map[item.agent.house] = (map[item.agent.house] ?? 0) + 1;
    return map;
  }, [activeVisibleAgents]);
			  const visibleAgentTotal = visibleAgents.length || canonAgents.length;
			  const idleLeisureCount = visibleAgents.filter((v) => v.state === "idle").length;
			  const runtimeActiveAgentCount = activeVisibleAgents.length;
			  const paperclipLivingOrgActive = houseOrchestrator?.summary?.paperclipLivingOrgActive ?? 0;
			  topChips.push(
			    ["Actifs", `${fmtNum(runtimeActiveAgentCount)}/${fmtNum(visibleAgentTotal)}`],
			    ["Assets", localAssetCoverageLabel],
			    ["Queue", `${fmtNum(localDispatchCount)}`],
			    ["Repos", `${fmtNum(idleLeisureCount)}`],
			  );
			  if (paperclipLivingOrgActive > 0) topChips.push(["Paperclip", `${fmtNum(paperclipLivingOrgActive)}`]);
		  useEffect(() => {
		    const iv = window.setInterval(() => setTelemetryNow(Date.now()), 1000);
		    return () => window.clearInterval(iv);
	  }, []);
	  useEffect(() => {
	    const now = Date.now();
	    setAgentTelemetry((prev) => {
	      let base = prev;
	      if (Object.keys(base).length === 0) {
	        try {
	          const raw = window.localStorage.getItem("cofiat-world-agent-telemetry-v1");
	          if (raw) base = JSON.parse(raw) as Record<string, AgentTelemetry>;
	        } catch { /* ignore local telemetry corruption */ }
	      }
	      const next: Record<string, AgentTelemetry> = { ...base };
	      for (const item of visibleAgents) {
	        const previous = next[item.agent.id] ?? { idleSec: 0, activeSec: 0, currentState: item.state, stateSince: now, lastAction: agentWorkProfilesById[item.agent.id]?.lastAction };
	        if (previous.currentState !== item.state) {
	          const elapsed = Math.max(0, Math.min(86_400, Math.floor((now - (previous.stateSince || now)) / 1000)));
		          next[item.agent.id] = {
		            ...previous,
		            idleSec: previous.currentState === "idle" ? previous.idleSec + elapsed : previous.idleSec,
		            activeSec: isAgentWorkingState(previous.currentState) ? previous.activeSec + elapsed : previous.activeSec,
		            currentState: item.state,
		            stateSince: now,
	            lastAction: agentWorkProfilesById[item.agent.id]?.lastAction ?? previous.lastAction,
	          };
	        } else if (!next[item.agent.id]) {
	          next[item.agent.id] = previous;
	        }
	      }
	      try { window.localStorage.setItem("cofiat-world-agent-telemetry-v1", JSON.stringify(next)); } catch { /* ignore quota */ }
	      return next;
	    });
	  }, [agentWorkProfilesById, visibleAgents]);

  const project = (wx: number, wy: number) => {
    const { sx, sy } = isoProject(wx, wy); const cx = sx * cam.z + cam.tx, cy = sy * cam.z + cam.ty + WORLD_Y_OFFSET; // caméra (zoom/pan) en espace SVG
    const scale = uiScale || 0; const rW = scene.vbW * scale, rH = scene.vbH * scale;
    const ox = (size.cw - rW) / 2, oy = (size.ch - rH) / 2; return { x: (cx - scene.vbMinX) * scale + ox, y: (cy - scene.vbMinY) * scale + oy };
  };
  const agentSize = Math.max(42, Math.min(76, uiScale * 74));

  type HouseKpis = { kpis: Array<{ label: string; value: string; source?: string }>; gap?: string };
  const houseKpis = (id: string): HouseKpis => {
    const fromServer = houseKpiData?.[id]; if (fromServer && (fromServer.kpis.length > 0 || fromServer.gap)) return fromServer;
    const a = viewSnapshot?.assetsWarehouse; const pn = viewSnapshot?.publisherNative; const pc = pn?.counts; const pb = viewSnapshot?.publisherBridge; const va = viewSnapshot?.videoAvailability; const latestMotion = va?.latestMotionProof ?? {}; const pubOk = pb?.ok ?? pn?.ok ?? services.find((s) => (s.id ?? "").includes("publisher") || (s.label ?? "").toLowerCase().includes("publisher"))?.ok;
    switch (id) {
      case "notebook_alm": return { kpis: [{ label: "Type", value: "Google NotebookLM", source: "cofiatWorldIdentity" }, { label: "État live", value: "lu via /api/…/notebooklm — détail dans Proof Ledger › NotebookLM", source: "api" }], gap: "Sources à re-sync (Chrome cowork) + push décisions chantier → notebooks." };
      case "proof_ledger": return { kpis: [{ label: "Type", value: "Module Preuve (config)", source: "cofiatAuthProofLedger" }, { label: "Auth critique", value: "9 GREEN/LIVE prouvés", source: "user_audit ledger" }], gap: "Vert seulement si chaque GREEN/LIVE porte sa preuve sourçable." };
      case "assets_warehouse": return { kpis: [{ label: "MP4", value: fmtNum(a?.mp4Count), source: "inventaire assets local" }, { label: "Captions", value: fmtNum(a?.captionsCount), source: "inventaire assets local" }, { label: "Assets inventoriés", value: fmtNum(a?.assetsInventoryCount), source: "inventaire assets local" }] };
      case "youtube_studio": return { kpis: [
        { label: "Renders natifs", value: fmtNum(pc?.renders ?? a?.mp4Count), source: pn?.sourceTag ?? "publisher native :8000" },
        { label: "Archives", value: fmtNum(pc?.archived), source: "publisher native :8000" },
        { label: "Orphelins", value: fmtNum(pc?.orphan), source: "publisher native :8000" },
        { label: "Gold prouvés", value: fmtNum(pc?.goldProved), source: "publisher native :8000" },
        { label: "Publish lock", value: pn?.publishLock?.reason ?? "R8_ERWIN_GATE_EXTERNAL_PUBLISH", source: "read-only" },
        { label: "Bridge Hub :3000", value: pubOk === true ? "LIVE" : pubOk === false ? "DOWN" : "UNKNOWN", source: pb?.sourceTag ?? "CofiaPublisher :8540" },
        { label: "Assets exportés", value: `${fmtNum(pb?.exportedAssetCount)}/${fmtNum(pb?.fullAssetCount)}`, source: pb?.endpoint ?? "hub bridge assets" },
        { label: "Index SHA-256", value: fmtNum(pb?.sha256IndexCount), source: "asset vault recursive hash table" },
        { label: "Doublons SHA", value: fmtNum(pb?.physicalDuplicateCount), source: "asset vault duplicate guard" },
        { label: "Motion proofs", value: fmtNum(va?.motionProofCount), source: va?.sourceTag ?? "video availability bridge" },
        { label: "Dernier proof", value: String(latestMotion.filename ?? "UNKNOWN"), source: String(latestMotion.path ?? va?.outputDir ?? "remotion/out") },
      ] };
      case "central_brain": return { kpis: [{ label: "Maisons registry", value: fmtNum(viewSnapshot?.centralBrain?.housesCount), source: "registry :8767" }, { label: "Services OK", value: `${servicesOk}/${services.length}`, source: "probes services locaux" }] };
      case "openclaw_agent_barracks": return { kpis: [{ label: "Agents runtime", value: openclawRuntime ? `${openclawRuntime.counts.fresh}/${openclawRuntime.counts.total} fresh` : "source down", source: "heartbeats" }, { label: "Gateway", value: runtimeGateway ? `${runtimeGateway.status}${runtimeGateway.http_code ? ` ${runtimeGateway.http_code}` : ""}` : "source down", source: "probe :18789" }] };
      default: return { kpis: [] };
    }
  };
  const clearSel = () => { setSelectedHouse(null); setSelectedAngel(null); setSelectedRuntimeAgent(null); setSelectedMachine(null); setSelectedAgent(null); };

  // ── molette = zoom centré sur le curseur (listener natif non-passif) ──
  const zoomCameraAtPoint = useCallback((current: { z: number; tx: number; ty: number }, factor: number, px: number, py: number) => {
    const scale = uiScale || 1;
    const rW = scene.vbW * scale;
    const rH = scene.vbH * scale;
    const ox = (size.cw - rW) / 2;
    const oy = (size.ch - rH) / 2;
    const svgX = (px - ox) / scale + scene.vbMinX;
    const svgY = (py - oy) / scale + scene.vbMinY;
    const worldX = (svgX - current.tx) / current.z;
    const worldY = (svgY - WORLD_Y_OFFSET - current.ty) / current.z;
    const nextZ = clampNumber(current.z * factor, 0.5, 2);
    return normalizeCam({
      z: nextZ,
      tx: svgX - worldX * nextZ,
      ty: svgY - WORLD_Y_OFFSET - worldY * nextZ,
    });
  }, [normalizeCam, scene.vbH, scene.vbMinX, scene.vbMinY, scene.vbW, size.ch, size.cw, uiScale]);

	  useEffect(() => {
	    const el = sceneRef.current; if (!el) return;
	    const onWheel = (e: WheelEvent) => {
	      if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
	      e.preventDefault();
	      const rect = el.getBoundingClientRect();
	      const factor = clampNumber(Math.exp(-e.deltaY * 0.0012), 0.78, 1.28);
	      setSharedCam((current) => zoomCameraAtPoint(current, factor, e.clientX - rect.left, e.clientY - rect.top));
	    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setSharedCam, zoomCameraAtPoint]);

  // ── glisser : pan (vide) ou déplacement de maison (mode Édition) ──
  const onScenePointerDown = (e: React.PointerEvent) => {
    const el = sceneRef.current; if (!el) return;
    const rect = el.getBoundingClientRect(); const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const houseEl = (e.target as HTMLElement).closest?.("[data-house]") as HTMLElement | null;
    movedRef.current = false;
    if (editMode && houseEl) {
      const id = houseEl.getAttribute("data-house") || ""; const h = EFF_BY_ID[id];
      dragRef.current = { mode: "house", id, sx: px, sy: py, camTx: cam.tx, camTy: cam.ty, hx: h?.x ?? 0, hy: h?.y ?? 0, moved: false };
    } else {
      dragRef.current = { mode: "pan", sx: px, sy: py, camTx: cam.tx, camTy: cam.ty, hx: 0, hy: 0, moved: false };
    }
    // PAS de setPointerCapture : sinon le conteneur volerait le clic des bâtiments/avatars/boutons.
    // Le pan fonctionne via pointermove tant que le curseur reste sur la carte ; un clic sans
    // déplacement laisse l'onClick de l'enfant (bâtiment/avatar) se déclencher normalement.
  };
  const onScenePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d.mode) return;
    const el = sceneRef.current; if (!el) return;
    const rect = el.getBoundingClientRect(); const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const dxs = px - d.sx, dys = py - d.sy;
    if (Math.abs(dxs) + Math.abs(dys) > 3) { d.moved = true; movedRef.current = true; }
    if (d.mode === "pan") {
      const scale = uiScale || 1; setSharedCam((c) => normalizeCam({ ...c, tx: d.camTx + dxs / scale, ty: d.camTy + dys / scale }));
    } else if (d.mode === "house" && d.id) {
      const f = 1 / ((uiScale || 1) * (cam.z || 1)); const dsx = dxs * f, dsy = dys * f;
      const dwx = dsx / ISO_W + dsy / ISO_H, dwy = dsy / ISO_H - dsx / ISO_W; // inverse iso
      const id = d.id; const nx = +(d.hx + dwx).toFixed(2), ny = +(d.hy + dwy).toFixed(2);
      markLayoutDirty();
      setPosOverride((p) => ({ ...p, [id]: { x: nx, y: ny } }));
    }
  };
  const onScenePointerUp = () => { dragRef.current = { ...dragRef.current, mode: null }; };

  // boutons vue
  const zoomBy = (factor: number) => {
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) {
      setSharedCam((current) => normalizeCam({ ...current, z: current.z * factor }));
      return;
    }
    setSharedCam((current) => zoomCameraAtPoint(current, factor, rect.width / 2, rect.height / 2));
  };
  // Ajuster : remplir l'écran (cover doux) — l'excédent rogne la marge d'île, jamais les maisons
  const fitView = () => {
    setSharedCam(canonicalCam);
  };
	  const resetLayout = () => { markLayoutDirty(); setPosOverride({}); setSharedCam(canonicalCam); };
	  const camG = `translate(${cam.tx.toFixed(2)} ${(cam.ty + WORLD_Y_OFFSET).toFixed(2)}) scale(${cam.z.toFixed(4)})`;
	  const worldShellClassName = `flex w-full max-w-none min-w-0 flex-col gap-2 overflow-hidden rounded-md border p-2 text-slate-100 backdrop-blur ${
	    publisherCritical.active
	      ? "border-red-500/70 bg-red-950/35 shadow-[0_0_0_1px_rgba(248,113,113,0.35),0_24px_90px_rgba(127,29,29,0.72),inset_0_1px_0_rgba(255,255,255,0.08)]"
	      : "border-slate-500/30 bg-slate-950/88 shadow-[0_24px_90px_rgba(2,6,23,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
	  }`;
	  return (
    <div className={worldShellClassName} data-world-map-visual-guard={WORLD_MAP_VISUAL_GUARD_SOURCE_TAG} data-cofiapublisher-critical={publisherCritical.active ? "true" : "false"} data-citadelle-alert-status={publisherCritical.status} data-citadelle-alert-source={publisherCritical.source} data-citadelle-alert-source-tag={publisherCritical.sourceTag} data-route-markers-policy="unmounted-static-routes" data-svg-pointer-policy="no-svg-bounds-pointer-events" data-agent-count={canonAgents.length} data-agent-links-count={activeVisibleAgents.length} data-agent-placement-policy="runtime-proof-only-houses-idle-park" data-rest-park-agents={idleLeisureCount} data-mission-orders-count={houseMissions.length} data-mission-quality-average={missionQualityAverage} data-proof-ledger-quality-rows={missionQualityRows.length} data-house-local-dispatches={localDispatchCount} data-house-expired-dispatches={expiredLocalDispatchCount} data-house-local-agent-coverage={`${localCoveredAgentCount}/${localTotalAgentCount || canonAgents.length}`} data-live-source-events-count={truthEvents.length} data-source-probe-events-count={sourceEvents.length} data-truth-source-count={truthSourceCount} data-hub-source-ledger-total={hubLedgerSummary?.declaredCoverageTotal ?? 0} data-hub-source-ledger-connected={hubLedgerSummary?.declaredCoverageConnected ?? 0} data-hub-source-ledger-proofed={hubLedgerSummary?.declaredCoverageProofed ?? 0} data-hub-source-ledger-false-green-downgrades={hubLedgerSummary?.falseGreenDowngrades ?? 0} data-hub-wiring-source={hubWiring?.sourceTag ?? "pending"} data-hub-wiring-policy={hubWiring?.policy ?? "pending"} data-hub-wiring-contracts={hubWiringSummary?.contracts ?? 0} data-hub-wiring-command={hubWiringSummary?.commandConnected ?? 0} data-hub-wiring-central={hubWiringSummary?.centralConnected ?? 0} data-hub-wiring-proof={hubWiringSummary?.proofConnected ?? 0} data-hub-wiring-runtime-active={hubWiringSummary?.runtimeActiveContracts ?? 0} data-hub-wiring-sleeping={hubWiringSummary?.sleepingContracts ?? 0} data-hub-wiring-spine-edges={`${hubWiringSummary?.connectedSpineEdges ?? 0}/${hubWiringSummary?.totalSpineEdges ?? 0}`} data-cofiapublisher-bridge-status={viewSnapshot?.publisherBridge?.status ?? "pending"} data-cofiapublisher-bridge-assets={`${viewSnapshot?.publisherBridge?.exportedAssetCount ?? 0}/${viewSnapshot?.publisherBridge?.fullAssetCount ?? 0}`} data-cofiapublisher-motion-proofs={viewSnapshot?.videoAvailability?.motionProofCount ?? 0} data-tool-operating-contracts={toolContractList.length} data-tool-contract-machines={machines.filter((machine) => Boolean(machine.contract)).length} data-tool-contract-policy={toolContracts?.policy ?? "pending"} data-shared-layout-camera={`${cam.z.toFixed(4)},${cam.tx.toFixed(2)},${cam.ty.toFixed(2)}`} data-shared-layout-viewport={`${Math.round(size.cw)}x${Math.round(size.ch)}`} data-console-mission-targets="removed" data-v2-world-map="asset-work-no-fake-motion" data-house-orchestrator-source={houseOrchestratorSource ?? "pending"} data-snapshot-source={viewSnapshot?.agentsCanon?.sourceTag ?? "pending"} data-leisure-park="ready" data-idle-leisure-agents={idleLeisureCount} data-queued-local-agents={0} data-runtime-active-agents={runtimeActiveAgentCount} data-structural-buildings={effHouses.length} data-neighborhood-tools-houses={Object.keys(machinesByHome).length} data-neighborhood-tools-total={machines.length}>
      <style>{`
        @keyframes cof-phone-work { 0%,100% { transform: rotate(-2deg) translateY(0); } 45% { transform: rotate(4deg) translateY(-1.2px); } }
        @keyframes cof-keyboard-work { 0%,100% { transform: translateY(0) scaleX(1); } 50% { transform: translateY(-1.4px) scaleX(1.035); } }
        @keyframes cof-inspect-work { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-1px) scale(1.035); } }
        @keyframes cof-work-proof { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes cof-tool-proof { 0%,100% { opacity: .78; filter: brightness(1); } 50% { opacity: 1; filter: brightness(1.35); } }
        @keyframes cof-rest-water { 0%,100% { opacity: .36; transform: translateX(-2px); } 50% { opacity: .68; transform: translateX(4px); } }
        @keyframes cof-rest-smoke { 0%,100% { opacity: .22; transform: translateY(0) scale(1); } 50% { opacity: .54; transform: translateY(-5px) scale(1.04); } }
        @keyframes cof-route-pulse { 0%,100% { opacity: .32; stroke-dashoffset: 0; } 50% { opacity: .32; stroke-dashoffset: 0; } }
        @keyframes cof-lamp-glow { 0%,100% { opacity: .54; transform: scale(.92); } 50% { opacity: .94; transform: scale(1.16); } }
        @keyframes cof-traffic-red { 0%,38%,100% { opacity: 1; filter: drop-shadow(0 0 5px #ef4444); } 45%,88% { opacity: .28; filter: none; } }
        @keyframes cof-traffic-amber { 0%,35%,62%,100% { opacity: .25; filter: none; } 42%,54% { opacity: 1; filter: drop-shadow(0 0 5px #f59e0b); } }
        @keyframes cof-traffic-green { 0%,55%,100% { opacity: .28; filter: none; } 62%,88% { opacity: 1; filter: drop-shadow(0 0 5px #22c55e); } }
        @keyframes cof-proof-fabric { 0%,100% { opacity: .32; stroke-dashoffset: 0; } 50% { opacity: .92; stroke-dashoffset: -28; } }
        @keyframes cof-proof-agent-thread { 0%,100% { opacity: .12; stroke-dashoffset: 0; } 50% { opacity: .42; stroke-dashoffset: -18; } }
        .cof-agent-phone { animation: cof-phone-work 1.35s ease-in-out infinite; }
        .cof-agent-keyboard { animation: cof-keyboard-work .9s ease-in-out infinite; }
        .cof-agent-inspect { animation: cof-inspect-work 1.55s ease-in-out infinite; }
        .cof-agent-work { animation: cof-work-proof 1.1s ease-in-out infinite; }
        .char-prop, [data-agent-tool-badge] { animation: cof-tool-proof 1.2s ease-in-out infinite; }
        .cof-rest-water { animation: cof-rest-water 2.8s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        .cof-rest-smoke { animation: cof-rest-smoke 3.2s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        .cof-route-pulse { animation: none; }
        .cof-map-lamp-glow { animation: cof-lamp-glow 2.6s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        .cof-traffic-red { animation: cof-traffic-red 4.8s linear infinite; }
        .cof-traffic-amber { animation: cof-traffic-amber 4.8s linear infinite; }
        .cof-traffic-green { animation: cof-traffic-green 4.8s linear infinite; }
        .cof-proof-fabric { animation: cof-proof-fabric 3.1s linear infinite; }
        .cof-proof-agent-thread { animation: cof-proof-agent-thread 4.2s linear infinite; }
      `}</style>
	      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 px-0.5">
	        <div className="min-w-0 flex-1">
	          <h2 className="truncate text-sm font-black uppercase tracking-wide text-cyan-100 sm:text-lg">Agents & Assets</h2>
	          <p className="max-w-full truncate text-[8.5px] uppercase tracking-[0.13em] text-slate-400 sm:text-[9.5px] sm:tracking-[0.18em]">{runtimeActiveAgentCount ? "travail prouvé récent" : "repos prouvé, aucune exécution runtime"}</p>
	        </div>
	        <div className="flex max-w-full min-w-0 flex-wrap items-center justify-end gap-1 whitespace-normal text-[9px] sm:max-w-[76vw] sm:text-[9.5px]">
	          {topChips.map(([k, v]) => (
            <span key={k} className="inline-flex shrink-0 items-baseline gap-1 rounded-md border border-slate-600/40 bg-slate-950/70 px-1.5 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"><span className="text-slate-400">{k}</span><span className="font-bold text-slate-50">{v}</span></span>
          ))}
          <MrrKpiChip />
        </div>
      </div>

	      <div ref={sceneRef} data-shared-layout-scene="world-map" data-world-map-bounds="strict-hidden" onPointerDown={onScenePointerDown} onPointerMove={onScenePointerMove} onPointerUp={onScenePointerUp} onPointerCancel={onScenePointerUp} style={{ cursor: editMode ? "grab" : "default", touchAction: editMode ? "none" : "pan-y", overflow: "hidden", contain: "layout paint size", isolation: "isolate", backgroundColor: "#07111b", backgroundImage: "radial-gradient(90% 80% at 50% 38%, #155f66 0%, #0b343d 52%, #0c2230 100%)" }} className="relative h-[640px] min-h-[560px] w-full max-w-full overflow-hidden rounded-md border border-cyan-300/20 bg-[#07111b] shadow-[0_20px_80px_rgba(2,6,23,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] lg:h-[calc(100vh-205px)] xl:h-[calc(100vh-190px)]">
        {publisherCritical.active && (
          <div className="pointer-events-none absolute right-2 top-2 z-[29] max-w-[min(420px,calc(100%-140px))] rounded-md border border-red-300/70 bg-red-950/92 px-3 py-2 text-right shadow-[0_0_36px_rgba(239,68,68,0.48)] backdrop-blur" data-citadelle-critical-banner="active">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-100">COF : LA CITADELLE</p>
            <p className="mt-0.5 truncate text-[9px] font-bold uppercase text-red-200">{publisherCritical.status}</p>
            <p className="mt-1 max-h-[2.4em] overflow-hidden text-[9px] leading-snug text-red-100/85">{publisherCritical.reason}</p>
          </div>
        )}
        <svg
          data-world-map-svg-bounds="strict"
          viewBox={scene.viewBox}
          className="h-full w-full"
          style={{ overflow: "hidden", display: "block", maxWidth: "100%", maxHeight: "100%", background: "transparent" }}
          preserveAspectRatio="xMidYMid meet"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (movedRef.current) { movedRef.current = false; return; }
            clearSel();
          }}
        >
          <defs>
            <clipPath id={WORLD_MAP_STRICT_CLIP_ID} clipPathUnits="userSpaceOnUse">
              <rect x={scene.vbMinX} y={scene.vbMinY} width={scene.vbW} height={scene.vbH} />
            </clipPath>
            <radialGradient id="sea" cx="48%" cy="38%" r="84%"><stop offset="0%" stopColor="#155f66" /><stop offset="48%" stopColor="#0b343d" /><stop offset="100%" stopColor="#0c2230" /></radialGradient>
            <radialGradient id="land" cx="50%" cy="42%" r="80%"><stop offset="0%" stopColor="#26343e" /><stop offset="55%" stopColor="#182a31" /><stop offset="100%" stopColor="#101821" /></radialGradient>
            <radialGradient id="coast" cx="50%" cy="42%" r="77%"><stop offset="0%" stopColor="#5f7f82" /><stop offset="58%" stopColor="#31464c" /><stop offset="100%" stopColor="#16232b" /></radialGradient>
            <radialGradient id="beach" cx="50%" cy="45%" r="78%"><stop offset="0%" stopColor="#7f8768" stopOpacity="0.82" /><stop offset="58%" stopColor="#4d6358" stopOpacity="0.9" /><stop offset="100%" stopColor="#1e3440" /></radialGradient>
	            <radialGradient id="grassPatch" cx="48%" cy="45%" r="70%"><stop offset="0%" stopColor="#2c6f56" stopOpacity="0.9" /><stop offset="62%" stopColor="#174c43" stopOpacity="0.58" /><stop offset="100%" stopColor="#0f2630" stopOpacity="0" /></radialGradient>
	            <radialGradient id="parkGrass" cx="44%" cy="36%" r="78%"><stop offset="0%" stopColor="#5f9c63" stopOpacity="0.96" /><stop offset="48%" stopColor="#326f46" stopOpacity="0.92" /><stop offset="100%" stopColor="#143d35" stopOpacity="0.98" /></radialGradient>
	            <linearGradient id="parkingAsphalt" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3f4852" /><stop offset="52%" stopColor="#27313b" /><stop offset="100%" stopColor="#151d27" /></linearGradient>
	            <linearGradient id="woodWarm" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#b7791f" /><stop offset="55%" stopColor="#7c3f16" /><stop offset="100%" stopColor="#3f2412" /></linearGradient>
	            <linearGradient id="poolWater" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#7dd3fc" /><stop offset="55%" stopColor="#0891b2" /><stop offset="100%" stopColor="#0e7490" /></linearGradient>
            <linearGradient id="path" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6b7b80" /><stop offset="100%" stopColor="#27323a" /></linearGradient>
            <linearGradient id="roofSheen" x1="0" y1="0" x2="0.45" y2="1"><stop offset="0%" stopColor="#fff" stopOpacity="0.22" /><stop offset="55%" stopColor="#fff" stopOpacity="0.05" /><stop offset="100%" stopColor="#000" stopOpacity="0.34" /></linearGradient>
            <filter id="softBlur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14" /></filter>
            <radialGradient id="lglow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ffd98a" stopOpacity="0.5" /><stop offset="100%" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
            <pattern id="cobble" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-26)"><path d="M 0 0 H 18 M 0 9 H 18 M 0 18 H 18 M 0 0 V 18 M 9 0 V 18 M 18 0 V 18" stroke="#9ee7ff" strokeOpacity="0.035" strokeWidth="0.8" /><circle cx="4.5" cy="4.5" r="0.6" fill="#ffffff" opacity="0.04" /></pattern>
            <pattern id="paving" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(-26)"><rect width="13" height="13" fill="#26323a" /><path d="M0 6.5 H13 M6.5 0 V13" stroke="#7dd3fc" strokeOpacity="0.07" strokeWidth="0.8" /><path d="M0 0 H13 V13 H0 Z" fill="none" stroke="#000" strokeOpacity="0.12" /></pattern>
            {(Object.keys(ZONES) as ZoneId[]).map((zid) => (<radialGradient key={zid} id={`dist-${zid}`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={ZONES[zid].floor} stopOpacity="0.8" /><stop offset="70%" stopColor={ZONES[zid].floor} stopOpacity="0.3" /><stop offset="100%" stopColor={ZONES[zid].floor} stopOpacity="0" /></radialGradient>))}
          </defs>

          {/* mer teal bornée au viewBox : le zoom ne peut plus révéler un fond noir */}
          <rect data-world-map-background="viewbox-bound" x={scene.vbMinX} y={scene.vbMinY} width={scene.vbW} height={scene.vbH} fill="url(#sea)" />
          <g clipPath={`url(#${WORLD_MAP_STRICT_CLIP_ID})`} data-world-map-camera-bounds="strict-clipped">
          {/* ── CAMÉRA (pan/zoom) ── */}
          <g transform={camG}>
          {/* ombre portée de l'île */}
          <path d={scene.coastPath} fill="#000" opacity="0.5" filter="url(#softBlur)" transform="translate(0 16)" />
          {/* littoral sombre + contour de carte opérationnelle */}
          <path d={scene.coastPath} fill="url(#beach)" />
          <path d={scene.coastPath} fill="none" stroke="#67e8f9" strokeWidth="2.2" strokeOpacity="0.22" />
          {scene.shoreRocks.map((r, i) => (
            <g key={`shore-rock-${i}`} transform={`translate(${r.x.toFixed(1)} ${r.y.toFixed(1)}) scale(${r.s.toFixed(2)})`} opacity="0.74">
              <ellipse cx="0" cy="2" rx="8" ry="3" fill="#020617" opacity="0.22" />
              <path d="M-8 2 Q-6 -6 0 -7 Q7 -6 9 0 Q7 5 -2 5 Q-8 5 -8 2 Z" fill="#56606b" stroke="#2f3742" strokeWidth="0.7" />
              <path d="M-4 -1 Q-1 -4 3 -3" fill="none" stroke="#9aa8b4" strokeWidth="0.75" opacity="0.55" />
            </g>
          ))}
          {/* île : sol tactique + grille discrète */}
          <path d={scene.islandPath} fill="url(#land)" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.22" />
          <path d={scene.islandPath} fill="url(#cobble)" />
          {scene.hills.map((hill) => (
            <g key={`hill-${hill.id}`} opacity="0.5">
              <ellipse cx={hill.x} cy={hill.y} rx={hill.rx} ry={hill.ry} fill="url(#grassPatch)" />
              <ellipse cx={hill.x} cy={hill.y - hill.ry * 0.12} rx={hill.rx * 0.68} ry={hill.ry * 0.48} fill="none" stroke={hill.tone} strokeWidth="1.1" strokeOpacity="0.16" />
              <path d={`M ${(hill.x - hill.rx * 0.48).toFixed(1)} ${(hill.y - hill.ry * 0.05).toFixed(1)} Q ${hill.x.toFixed(1)} ${(hill.y - hill.ry * 0.42).toFixed(1)} ${(hill.x + hill.rx * 0.5).toFixed(1)} ${(hill.y - hill.ry * 0.08).toFixed(1)}`} fill="none" stroke="#d9f99d" strokeWidth="0.8" strokeOpacity="0.13" />
            </g>
          ))}
          {/* districts en dégradé doux (sous les chemins) */}
          {scene.districts.map((z) => (<ellipse key={z.id} cx={z.cx} cy={z.cy} rx={z.rx} ry={z.ry} fill={`url(#dist-${z.id})`} opacity="0.36" />))}

          {/* place centrale : node de routage */}
          <g>
            <ellipse cx={scene.plaza.x} cy={scene.plaza.y + 3} rx="52" ry="29" fill="#020617" opacity="0.44" />
            <ellipse cx={scene.plaza.x} cy={scene.plaza.y} rx="49" ry="27" fill="#111827" />
            <ellipse cx={scene.plaza.x} cy={scene.plaza.y} rx="47" ry="25.5" fill="url(#paving)" />
            <ellipse cx={scene.plaza.x} cy={scene.plaza.y} rx="47" ry="25.5" fill="none" stroke="#67e8f9" strokeWidth="1.2" opacity="0.35" />
            <ellipse cx={scene.plaza.x} cy={scene.plaza.y} rx="28" ry="15" fill="none" stroke="#fbbf24" strokeWidth="0.9" strokeDasharray="2 5" opacity="0.28" />
          </g>
          {/* routes : fibres sombres + ligne data centrale */}
          <g>
            {scene.roads.map((r) => {
              const hot = selectedHouse && (r.a === selectedHouse || r.b === selectedHouse);
              const acc = hot ? HOUSE_BY_ID[selectedHouse!]?.accent ?? "#ffe3a0" : null;
              return (<g key={r.id}>
	                <path d={r.d} fill="none" stroke="#020617" strokeWidth={r.w + 7} strokeLinecap="round" strokeLinejoin="round" opacity="0.48" />
	                <path d={r.d} fill="none" stroke="#34434a" strokeWidth={r.w + 2.5} strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
	                <path d={r.d} fill="none" stroke="url(#paving)" strokeWidth={r.w - 1} strokeLinecap="round" strokeLinejoin="round" />
	                <path d={r.d} fill="none" stroke="#d8eef2" strokeWidth="1.15" strokeLinecap="round" strokeDasharray="2 18" opacity="0.28" />
	                <path d={r.d} fill="none" stroke="#020617" strokeWidth={r.w + 4} strokeLinecap="round" strokeDasharray="1 30" opacity="0.22" />
	                <path className="cof-route-pulse" d={r.d} fill="none" stroke={hot ? acc ?? "#facc15" : "#67e8f9"} strokeWidth={hot ? 2.6 : 1.2} strokeLinecap="round" strokeDasharray="8 24" opacity={hot ? 0.66 : 0.24} />
	                <path d={r.d} fill="none" stroke={acc ?? "#67e8f9"} strokeWidth={hot ? 2.2 : 1} strokeLinecap="round" strokeDasharray={hot ? undefined : "4 10"} opacity={hot ? 0.7 : 0.24} />
	              </g>);
	            })}
	          </g>
		          {/* Routes statiques: aucun marker animé n'est monté dans le DOM. */}
	          <g data-road-fixtures="lamps-signals-stops-attached">
	            {scene.roadFurniture.map((f) => (
	              <g
	                key={f.id}
	                data-road-fixture={f.kind}
	                data-attached-road={f.roadId}
	                data-attached-house={f.houseId}
	                transform={`translate(${(f.x + f.side * (f.kind === "stop" ? 16 : f.kind === "signal" ? 14 : 11)).toFixed(1)} ${(f.y - (f.kind === "lamp" ? 8 : 10)).toFixed(1)}) rotate(${f.angle.toFixed(1)})`}
	                opacity="0.95"
	              >
	                {f.kind === "signal" ? (
	                  <>
	                    <ellipse cx="0" cy="17" rx="8" ry="2.6" fill="#020617" opacity="0.3" />
	                    <line x1="0" y1="16" x2="0" y2="-33" stroke="#1f2937" strokeWidth="3.1" strokeLinecap="round" />
	                    <rect x="-9" y="-43" width="18" height="35" rx="4" fill="#111827" stroke="#94a3b8" strokeWidth="1.4" />
	                    <circle className="cof-traffic-red" cx="0" cy="-35.5" r="4.1" fill="#ef4444" />
	                    <circle className="cof-traffic-amber" cx="0" cy="-25.5" r="4.1" fill="#f59e0b" />
	                    <circle className="cof-traffic-green" cx="0" cy="-15.5" r="4.1" fill="#22c55e" />
	                  </>
	                ) : f.kind === "stop" ? (
	                  <g transform={`rotate(${-f.angle.toFixed(1)})`}>
	                    <ellipse cx="0" cy="17" rx="9" ry="2.4" fill="#020617" opacity="0.3" />
	                    <line x1="0" y1="16" x2="0" y2="-24" stroke="#4b3621" strokeWidth="2.9" strokeLinecap="round" />
	                    <polygon points="0,-50 15,-44 22,-29 15,-14 0,-8 -15,-14 -22,-29 -15,-44" fill="#dc2626" stroke="#f8fafc" strokeWidth="2.3" />
	                    <text x="0" y="-25.4" textAnchor="middle" fontSize="10.5" fontWeight="950" fill="#f8fafc">STOP</text>
	                  </g>
	                ) : (
	                  <>
	                    <ellipse cx="0" cy="10" rx="5.5" ry="1.8" fill="#020617" opacity="0.25" />
	                    <line x1="0" y1="9" x2="0" y2="-23" stroke="#4b3621" strokeWidth="2.3" strokeLinecap="round" />
	                    <path d="M0 -23 Q10 -24 11 -14" fill="none" stroke="#4b3621" strokeWidth="2" strokeLinecap="round" />
	                    <circle className="cof-map-lamp-glow" cx="11" cy="-13" r="12" fill="url(#lglow)" opacity="0.82" />
	                    <rect x="8" y="-17" width="6" height="8" rx="1.5" fill="#221407" stroke="#caa14a" strokeWidth="1" />
	                  </>
	                )}
	              </g>
	            ))}
	          </g>
	          {/* plateformes devant les portes */}
	          <g>{scene.junctions.map((j) => (<g key={`jx-${j.houseId}`} data-house-junction={j.houseId} data-attached-house={j.houseId}><ellipse cx={j.x} cy={j.y} rx="13" ry="7.5" fill="#020617" opacity="0.62" /><ellipse cx={j.x} cy={j.y} rx="11.5" ry="6.4" fill="url(#paving)" /><ellipse cx={j.x} cy={j.y} rx="11.5" ry="6.4" fill="none" stroke="#7dd3fc" strokeWidth="0.8" opacity="0.24" /></g>))}</g>
	          {scene.leisureAccess && (
	            <g data-leisure-parking-access-road={scene.leisureAccess.from} data-attached-house={scene.leisure.anchorHouseId} pointerEvents="none">
	              <path d={scene.leisureAccess.d} fill="none" stroke="#020617" strokeWidth="29" strokeLinecap="round" strokeLinejoin="round" opacity="0.48" />
	              <path d={scene.leisureAccess.d} fill="none" stroke="#30414a" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" opacity="0.94" />
	              <path d={scene.leisureAccess.d} fill="none" stroke="url(#paving)" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" opacity="0.96" />
	              <path className="cof-route-pulse" d={scene.leisureAccess.d} fill="none" stroke="#facc15" strokeWidth="2.2" strokeDasharray="9 18" strokeLinecap="round" opacity="0.42" />
	              <path d={scene.leisureAccess.d} fill="none" stroke="#f8fafc" strokeWidth="1.25" strokeDasharray="3 15" strokeLinecap="round" opacity="0.34" />
	              <circle cx={scene.leisureAccess.gate.x} cy={scene.leisureAccess.gate.y} r="9" fill="#111827" stroke="#facc15" strokeWidth="1.2" opacity="0.9" />
	            </g>
	          )}
	          <RealParkingLot
	            park={scene.leisure}
	            idleCount={idleLeisureCount}
            activeCount={runtimeActiveAgentCount}
            queuedCount={localDispatchCount}
            proofCount={workingDispatchCount}
            agents={visibleAgents}
          />

          {/* décor Astrub : arbres / buissons / rochers en lisière (statique) */}
          {scene.decor.map((d, i) => (<g key={`dec-${i}`} transform={`translate(${d.x.toFixed(1)} ${d.y.toFixed(1)}) scale(${d.s.toFixed(2)})`}>
            <ellipse cx="0" cy="1.5" rx={d.kind === "rock" ? 7 : 6} ry="2.4" fill="#000" opacity="0.22" />
            {d.kind === "tree" ? (<><rect x="-1.5" y="-6" width="3" height="9" rx="1.2" fill="#5b3f29" /><ellipse cx="0" cy="-10" rx="9" ry="8" fill="#2f6b43" /><ellipse cx="-3" cy="-12" rx="5.5" ry="5" fill="#3c8253" /><ellipse cx="3.4" cy="-9" rx="5" ry="4.5" fill="#27583a" /><ellipse cx="-2" cy="-14" rx="3" ry="2.6" fill="#57a06e" opacity="0.7" /></>) : d.kind === "bush" ? (<><ellipse cx="-3" cy="-2" rx="4.5" ry="3.6" fill="#2f6b43" /><ellipse cx="2.5" cy="-2.5" rx="4" ry="3.4" fill="#3c8253" /><ellipse cx="0" cy="-4" rx="3.6" ry="3" fill="#4f9665" opacity="0.8" /></>) : (<><path d="M-6 2 Q-7 -4 -1 -5 Q5 -6 6 -1 Q7 3 0 3 Z" fill="#6b7079" stroke="#474b52" strokeWidth="0.6" /><path d="M-4 -1 Q-2 -3 1 -2" fill="none" stroke="#9aa1ab" strokeWidth="0.7" opacity="0.6" /></>)}
          </g>))}

          {/* labels district */}
          {scene.districts.map((z) => { const zc = ZONES[z.id]; return (<g key={`lbl-${z.id}`} opacity="0.82"><text x={z.label.x} y={z.label.y} textAnchor="middle" fontSize="15" fontWeight="900" fill={zc.edge} stroke="#0a1f1c" strokeWidth="3.4" paintOrder="stroke" style={{ letterSpacing: "4px" }}>{zc.label}</text></g>); })}

          {/* lanternes Dofus (poteau + halo chaud, statique) */}
	          {scene.lamps.map((l) => (<g key={`lamp-${l.houseId}`} data-house-lamp={l.houseId} data-attached-house={l.houseId}><ellipse cx={l.x} cy={l.y + 1} rx="3" ry="1.2" fill="#000" opacity="0.25" /><line x1={l.x} y1={l.y} x2={l.x} y2={l.y - 20} stroke="#3a2f22" strokeWidth="1.8" /><path d={`M ${l.x} ${(l.y - 20).toFixed(1)} q 5 0 5 4`} fill="none" stroke="#3a2f22" strokeWidth="1.4" /><circle className="cof-map-lamp-glow" cx={l.x + 5} cy={l.y - 14} r="7" fill="url(#lglow)" /><rect x={l.x + 3} y={l.y - 17} width="4" height="5.5" rx="1" fill="#1a1206" stroke="#caa14a" strokeWidth="0.8" /><rect x={l.x + 3.7} y={l.y - 16} width="2.6" height="3.6" fill="#ffd98a" opacity="0.9" /><g transform={`translate(${(l.x - 8).toFixed(1)} ${l.y.toFixed(1)})`}><ellipse cx="0" cy="1.2" rx="3.4" ry="1.1" fill="#000" opacity="0.2" /><path d="M-3 -1 Q-3.6 -5 0 -5.5 Q3.6 -5 3 -1 Q3.6 1 0 1.4 Q-3.6 1 -3 -1 Z" fill="#6b4a2b" stroke="#3f2c19" strokeWidth="0.6" /><line x1="-3.2" y1="-2.6" x2="3.2" y2="-2.6" stroke="#3f2c19" strokeWidth="0.5" /><line x1="-3.1" y1="-0.4" x2="3.1" y2="-0.4" stroke="#3f2c19" strokeWidth="0.5" /></g></g>))}
	          <HubWiringSpineMesh built={scene.built} wiring={hubWiring} selectedHouse={selectedHouse} />
	          <MissionQualityAuditMesh built={scene.built} rows={missionQualityRows} selectedHouse={selectedHouse} />

	          {/* parcelles + bâtiments (tri profondeur) */}
	          {builtSorted.map((b) => (<Building key={b.house.id} b={b} editMode={editMode} status={statusFor(b.house.id)} activity={houseActivity[b.house.id] ?? { state: "idle" }} mission={houseMissionsById[b.house.id] ?? null} missionQuality={missionQualityByHouse[b.house.id] ?? null} truthSources={truthByHouse[b.house.id] ?? []} selected={selectedHouse === b.house.id} hover={hoverHouse === b.house.id} dim={!!selectedHouse && selectedHouse !== b.house.id} machines={machinesByHome[b.house.id] ?? []} assetCount={(inventoryByHouse[b.house.id] ?? []).length} agentCount={workingAgentCountByHome[b.house.id] ?? 0} onSelect={() => { if (movedRef.current) { movedRef.current = false; return; } clearSel(); setSelectedHouse(b.house.id); setHouseTab(defaultHouseTab(b.house.id)); onSelectHouse(b.house.id); }} onDirectSelect={() => { movedRef.current = false; clearSel(); setSelectedHouse(b.house.id); setHouseTab(defaultHouseTab(b.house.id)); onSelectHouse(b.house.id); }} onHover={(v) => setHoverHouse(v ? b.house.id : null)} onMachine={(m) => { clearSel(); setSelectedMachine(m); }} />))}
          {scene.built.map((b) => b.house.id === "proof_ledger" ? (
            <ProofLedgerCinemaScreen
              key="proof-ledger-cinema-screen"
              built={b}
              activeCount={runtimeActiveAgentCount}
              totalCount={visibleAgentTotal}
              houseLabel={orchestratedHouseLabel}
              idleCount={idleLeisureCount}
              queuedCount={localDispatchCount}
              proofCount={workingDispatchCount}
	              proofActive={runtimeActiveAgentCount > 0 && workingDispatchCount > 0}
	            />
	          ) : null)}
	          <ProofLedgerOperationsMesh built={scene.built} machines={machines} agentCount={activeVisibleAgents.length} qualityAverage={missionQualityAverage} selectedHouse={selectedHouse} />
	          <ProofLedgerAgentAuditMesh built={scene.built} agents={activeVisibleAgents} selectedHouse={selectedHouse} />
		          {uiScale <= 0 && <g data-svg-agent-layer="proof-state">
	            {visibleAgents.map(({ agent, wx, wy, state, parkedVehicleOnly }) => parkedVehicleOnly ? null : (<SvgAgentMarker key={`svg-agent-${agent.id}`} agent={agent} wx={wx} wy={wy} state={state} tool={isAgentWorkingState(state) ? agentWorkProfilesById[agent.id]?.tool ?? null : null} />))}
	          </g>}
	          </g>
          </g>
        </svg>

        {/* léger assombrissement des bords (n'intercepte pas les clics) */}
        <div className="pointer-events-none absolute inset-0 rounded-md" style={{ background: "linear-gradient(180deg, rgba(2,6,23,0.16), transparent 28%, rgba(2,6,23,0.32)), radial-gradient(120% 120% at 50% 44%, transparent 64%, rgba(0,0,0,0.5))" }} />

        {/* liaisons maison -> agents : preuve visuelle du câblage résidentiel canon */}
        <svg className="pointer-events-none absolute inset-0 z-[9] h-full w-full overflow-hidden" style={{ overflow: "hidden", display: "block", background: "transparent" }}>
	          {uiScale > 0 && visibleAgents.map(({ agent, wx, wy, state, parkedVehicleOnly }) => {
	            if (parkedVehicleOnly) return null;
	            if (!isAgentWorkingState(state)) return null;
	            const house = EFF_BY_ID[agent.house]; if (!house) return null;
	            const from = project(houseFrontWorld(house).wx, houseFrontWorld(house).wy);
            const to = project(wx, wy);
            if (!Number.isFinite(from.x) || !Number.isFinite(to.x)) return null;
            const hot = selectedHouse === agent.house || hoverHouse === agent.house || selectedAgent?.id === agent.id || hoverAgent === agent.id;
            if (!hot) return null;
            return (
              <g key={`agent-link-${agent.id}`} opacity={0.82}>
                <line x1={from.x.toFixed(1)} y1={from.y.toFixed(1)} x2={to.x.toFixed(1)} y2={to.y.toFixed(1)} stroke={agent.colorAccent || agent.colorPrimary || "#67e8f9"} strokeWidth={1.15} strokeLinecap="round" />
                <circle cx={from.x.toFixed(1)} cy={from.y.toFixed(1)} r={2} fill={agent.colorPrimary || "#67e8f9"} />
              </g>
            );
          })}
        </svg>

        {/* ════════ CONTRÔLE COMPACT (clics protégés du pan via stopPropagation) ════════ */}
        {(() => { const btn = "flex h-6 w-6 items-center justify-center rounded-md text-[13px] font-bold text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100"; return (
        <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="absolute left-2 top-2 z-30 flex items-center gap-0.5 rounded-md border border-slate-500/35 bg-slate-950/88 px-1.5 py-1 shadow-[0_10px_30px_rgba(2,6,23,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
          <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setEditMode((v) => !v); }} title="Mode édition : glisser une maison pour la déplacer (positions sauvegardées)" className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${editMode ? "bg-amber-400/20 text-amber-100" : "text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100"}`}>{editMode ? "✎ Édition" : "Éditer"}</button>
          <span className="mx-0.5 h-4 w-px bg-slate-700" />
	          <button type="button" className={btn} title="Dézoomer (Ctrl/Option/Cmd + molette)" onPointerDown={(e) => { e.stopPropagation(); zoomBy(1 / 1.25); }} onClick={(e) => e.stopPropagation()}>−</button>
          <span className="min-w-[30px] text-center text-[9px] font-bold tabular-nums text-slate-400">{Math.round(cam.z * 100)}%</span>
	          <button type="button" className={btn} title="Zoomer (Ctrl/Option/Cmd + molette)" onPointerDown={(e) => { e.stopPropagation(); zoomBy(1.25); }} onClick={(e) => e.stopPropagation()}>+</button>
          <span className="mx-0.5 h-4 w-px bg-slate-700" />
          <button type="button" className={btn} title="Ajuster — remplir l'écran" onPointerDown={(e) => { e.stopPropagation(); fitView(); }} onClick={(e) => e.stopPropagation()}>⤢</button>
          {editMode && <button type="button" onPointerDown={(e) => { e.stopPropagation(); resetLayout(); }} onClick={(e) => e.stopPropagation()} title="Remettre le layout par défaut (canon)" className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-md text-[13px] text-rose-300 hover:bg-rose-500/15">↺</button>}
		        </div>
		        ); })()}
		        <div data-console-ia-map-mount="central-brain" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="absolute bottom-12 left-2 z-[70]">
		          <ConsoleIAOverlay
		            mapMounted
		            triggerLabel="Console IA"
		            triggerSubtitle="Central Brain local"
		            initialInbox={viewSnapshot?.consoleIaInbox ?? null}
		            triggerClassName="grid h-11 min-w-[174px] grid-cols-[36px_1fr] items-center gap-2 rounded-md border border-cyan-300/60 bg-slate-950/90 p-1.5 text-left text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,.22)] backdrop-blur transition hover:border-cyan-200"
		            panelClassName="absolute bottom-14 left-0 z-[80] grid max-h-[min(78vh,560px)] w-[min(1160px,calc(100vw-72px))] grid-rows-[auto_1fr] overflow-hidden rounded-md border border-cyan-300/50 bg-slate-950/96 text-slate-100 shadow-[0_28px_100px_rgba(0,0,0,.72)] backdrop-blur"
		          />
		        </div>
		        {/* ════════ PERSONNAGES (overlay, ancrés, taille scalée ≤ maison) ════════ */}
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
	          {uiScale > 0 && visibleAgents.map(({ agent, wx, wy, state, parkedVehicleOnly }) => {
	            if (parkedVehicleOnly) return null;
	            const { x, y } = project(wx, wy); if (!Number.isFinite(x)) return null;
	            const sel = selectedAgent?.id === agent.id; const hov = hoverAgent === agent.id;
	            const leisureSize = Math.max(20, Math.round(agentSize * 0.52 + rankVisualBoost(agent) * 0.25));
	            const boostedSize = state === "idle" ? leisureSize : agentSize + rankVisualBoost(agent);
	            return (<RPGCharacter key={agent.id} agent={agent} x={x} y={y} size={sel ? boostedSize + 8 : hov ? boostedSize + 4 : boostedSize} state={state} tool={isAgentWorkingState(state) ? agentWorkProfilesById[agent.id]?.tool ?? null : null} selected={sel} hover={hov} onSelect={() => { clearSel(); setSelectedAgent(agent); }} onHover={(v) => setHoverAgent(v ? agent.id : null)} />);
	          })}
        </div>
        {/* légende sobre */}
        <div onPointerDown={(e) => e.stopPropagation()} className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md border border-slate-500/35 bg-slate-950/88 px-3 py-1.5 text-[9px] text-slate-300 shadow-[0_10px_28px_rgba(2,6,23,0.4)] backdrop-blur sm:left-1/2 sm:right-auto sm:max-w-[88%] sm:-translate-x-1/2">
          {([["LIVE", "#34d399"], ["ORDRE LOCAL", "#22d3ee"], ["REGISTERED", "#f59e0b"], ["EN VEILLE", "#64748b"], ["SOURCE DOWN", "#ef4444"]] as Array<[string, string]>).map(([l, c]) => (<span key={l} className="flex items-center gap-1.5"><svg width="9" height="12" viewBox="0 0 9 12"><rect x="0.5" y="0.5" width="1.6" height="11" fill="#64748b" /><path d="M2 1 L8 2.4 L2 4.2 Z" fill={c} /></svg>{l}</span>))}
          <span className="text-slate-600">|</span>
          <span>actifs <b className="text-cyan-200">{runtimeActiveAgentCount}/{visibleAgentTotal}</b> · assets <b className="text-cyan-200">{localAssetCoverageLabel}</b> · queue <b className="text-cyan-200">{localDispatchCount}</b> · repos <b className="text-cyan-200">{idleLeisureCount}</b></span>
          {truthBadLiveCount > 0 && <span className="font-bold text-rose-300">LIVE invalide {truthBadLiveCount}</span>}
        </div>

        {/* ════════ INSPECTOR ════════ */}
        {(selectedAgent || selectedRuntimeAgent || selectedMachine || selectedAngel || selZone) && (
        <div onPointerDown={(e) => e.stopPropagation()} className="absolute left-2 right-2 top-2 z-20 flex max-h-[52%] w-auto flex-col overflow-auto rounded-md border border-slate-500/35 bg-slate-950/92 p-3 shadow-[0_18px_50px_rgba(2,6,23,0.58),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur sm:left-auto sm:right-2 sm:max-h-[94%] sm:w-[286px]">
          {selectedAgent ? (() => {
            const selectedState = (visibleAgents.find((v) => v.agent.id === selectedAgent.id)?.state) ?? (houseActivity[selectedAgent.house]?.state ?? "idle");
            const telemetry = agentTelemetry[selectedAgent.id];
            const restSeconds = (telemetry?.idleSec ?? 0) + (telemetry && selectedState === "idle" ? Math.max(0, Math.floor((telemetryNow - telemetry.stateSince) / 1000)) : 0);
            return <AgentInspector agent={selectedAgent} state={selectedState} activityLabel={houseActivity[selectedAgent.house]?.label} houseName={HOUSE_BY_ID[selectedAgent.house]?.name ?? selectedAgent.house} houseStatus={houseStatusStyle(statusFor(selectedAgent.house))} agentItems={agentItemsById[selectedAgent.id] ?? []} profile={agentWorkProfilesById[selectedAgent.id]} restSeconds={restSeconds} activeSeconds={telemetry?.activeSec ?? 0} onClose={() => setSelectedAgent(null)} onGotoHouse={() => { const id = selectedAgent.house; clearSel(); setSelectedHouse(id); setHouseTab("anges"); onSelectHouse(id); }} />;
	          })() : selectedRuntimeAgent ? (
            <div>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[13px] font-black text-orange-200">{selectedRuntimeAgent.name}</div><div className="text-[10px] uppercase tracking-wide text-slate-400">{selectedRuntimeAgent.id} · {selectedRuntimeAgent.team}</div></div><button type="button" onClick={() => setSelectedRuntimeAgent(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button></div>
              <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${runtimeColor(selectedRuntimeAgent.runtimeStatus)}22`, color: runtimeColor(selectedRuntimeAgent.runtimeStatus), border: `1px solid ${runtimeColor(selectedRuntimeAgent.runtimeStatus)}55` }}>● {selectedRuntimeAgent.runtimeStatus}</span>
              <p className="mt-2 text-[10px] font-semibold uppercase text-orange-200">Maison</p><p className="text-[11px] text-slate-300">{HOUSE_BY_ID[selectedRuntimeAgent.homeHouse]?.name ?? selectedRuntimeAgent.homeHouse}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-orange-200">Preuve</p><p className="break-words text-[9px] leading-snug text-slate-400">{selectedRuntimeAgent.proof}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-orange-200">Action</p><p className="text-[10px] leading-snug text-amber-200">{selectedRuntimeAgent.nextAction}</p>
            </div>
          ) : selectedMachine ? (
            <div>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[13px] font-black" style={{ color: runtimeColor(selectedMachine.status) }}>{selectedMachine.label}</div><div className="text-[10px] uppercase tracking-wide text-slate-400">{selectedMachine.id}</div></div><button type="button" onClick={() => setSelectedMachine(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button></div>
              <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${runtimeColor(selectedMachine.status)}22`, color: runtimeColor(selectedMachine.status), border: `1px solid ${runtimeColor(selectedMachine.status)}55` }}>● {selectedMachine.status}</span>
              <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Maison</p><p className="text-[11px] text-slate-300">{HOUSE_BY_ID[selectedMachine.homeHouse]?.name ?? selectedMachine.homeHouse}</p>
              {selectedMachine.role && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Rôle</p><p className="text-[11px] leading-snug text-slate-300">{selectedMachine.role}</p></>)}
              {selectedMachine.contract && (
                <div className="mt-2 rounded border border-cyan-400/25 bg-cyan-400/5 p-1.5" data-tool-operating-contract={selectedMachine.contract.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase text-cyan-200">Contrat outil</p>
                    <span className="rounded bg-slate-950 px-1.5 py-0.5 text-[8px] font-black text-slate-200">{selectedMachine.contract.short}</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-slate-100">{selectedMachine.contract.purpose}</p>
                  <div className="mt-1 grid grid-cols-1 gap-1">
                    <p className="rounded bg-slate-950/55 px-1 py-0.5 text-[8.5px] leading-snug text-slate-300"><b className="text-cyan-200">Quand:</b> {selectedMachine.contract.usedWhen}</p>
                    <p className="rounded bg-slate-950/55 px-1 py-0.5 text-[8.5px] leading-snug text-slate-300"><b className="text-cyan-200">Sortie:</b> {selectedMachine.contract.requiredOutput}</p>
                    <p className="rounded bg-slate-950/55 px-1 py-0.5 text-[8.5px] leading-snug text-slate-300"><b className="text-cyan-200">Preuve:</b> {selectedMachine.contract.proofRequired}</p>
                    <p className="rounded border border-amber-300/25 bg-amber-300/8 px-1 py-0.5 text-[8.5px] leading-snug text-amber-100"><b>Verrou:</b> {selectedMachine.contract.workGate}</p>
                  </div>
                  <p className="mt-1 break-words text-[8px] text-slate-500">{selectedMachine.contractSourceTag ?? toolContracts?.sourceTag ?? "tool contract local"}</p>
                </div>
              )}
              {selectedMachine.proof && <p className="mt-2 break-words text-[9px] text-emerald-300/70">Preuve: {selectedMachine.proof}</p>}
            </div>
          ) : selectedAngel ? (
            <div>
              <div className="flex items-start justify-between"><div><div className="text-[13px] font-black">{selectedAngel.name} <span className="text-[11px] text-slate-400">{selectedAngel.name_ar}</span></div><div className="text-[10px] uppercase tracking-wide text-slate-400">#{selectedAngel.id} · {selectedAngel.platform}</div></div><button type="button" onClick={() => setSelectedAngel(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button></div>
              <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${ANGEL_STATUS[selectedAngel.status].color}22`, color: ANGEL_STATUS[selectedAngel.status].color, border: `1px solid ${ANGEL_STATUS[selectedAngel.status].color}55` }}>● {ANGEL_STATUS[selectedAngel.status].label}</span>
              <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Manzilah</p><p className="text-[11px] text-slate-300">{selectedAngel.manzilah}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Mission</p><p className="text-[11px] leading-snug text-slate-300">{selectedAngel.mission}</p>
            </div>
          ) : selZone ? (
            <div>
              <div className="flex items-start justify-between"><div><div className="text-[13px] font-black" style={{ color: selZone.accent }}>{selZone.name}</div><div className="text-[10px] uppercase tracking-wide text-slate-400">{selZone.sub} · {ZONES[selZone.zone].label}</div></div><button type="button" onClick={() => setSelectedHouse(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button></div>
              {(() => { const st = houseStatusStyle(statusFor(selZone.id)); const act = houseActivity[selZone.id]; return (<div className="mt-2 flex flex-wrap items-center gap-1"><span className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${st.color}22`, color: st.color, border: `1px solid ${st.color}55` }}>● {st.label}</span>{act && act.state !== "idle" && <span className="inline-block rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold uppercase text-cyan-200">{ACT_LABEL[act.state]}</span>}</div>); })()}
              {selZone.id === "central_brain" && <SupervisionDrawer />}
              {selZone.id === "iron_office" && <div className="mt-2"><MrrKpiChip /></div>}
              {selZone.id === "site_seo_lab" && <SiteVercelPanel />}
              {(() => {
                const houseAgents = agentsByHome[selZone.id] ?? []; const houseAngels = angelsByHome[selZone.id] ?? []; const houseRuntimeAgents = runtimeAgentsByHome[selZone.id] ?? []; const houseMachines = machinesByHome[selZone.id] ?? []; const houseInv = inventoryByHouse[selZone.id] ?? []; const houseHubLedger = hubLedgerItemsByHouse[selZone.id] ?? []; const houseHubStats = hubSourceLedger?.byHouse?.[selZone.id]; const houseHubWiringContracts = (hubWiring?.contracts ?? []).filter((contract) => contract.houseId === selZone.id || ["mission_control_tower", "central_brain", "proof_ledger"].includes(selZone.id));
                const hk = houseKpis(selZone.id); const kpis = hk.kpis;
                const houseMission = houseMissionsById[selZone.id];
                const houseQuality = missionQualityByHouse[selZone.id] ?? null;
                const houseMissionLive = isRuntimeMission(houseMission);
                const houseMissionLocal = isLocalDispatchMission(houseMission);
                const missionQueueCount = houseMission?.localQueue?.dispatches ?? houseMission?.counts?.activeTasks ?? 0;
                const missionChief = houseMission?.chief?.name ?? houseMission?.chiefs?.[0]?.name ?? houseAgents[0]?.name ?? "chef à relier";
                const missionWorkers = (houseMission?.workers?.map((worker) => worker.name) ?? houseAgents.slice(1).map((agent) => agent.name)).slice(0, 6);
                const missionProofLabel = houseMissionLive ? "runtime prouvé" : houseMissionLocal ? `dispatch local prouvé: ${missionQueueCount} ordre(s)` : `source seule: ${houseMission?.mission.proofStatus ?? "PENDING"}`;
                const canonicalEmbed = CANONICAL_EMBEDS_BY_HOUSE[selZone.id] ?? null;
                const tabs: Array<[HouseTab, string]> = [
                  ...(canonicalEmbed ? [["live", "Live"] as [HouseTab, string]] : []),
                  ["vue", "Vue"],
                  ["kpis", "KPIs"],
                  ["anges", `Agents ${houseAgents.length}`],
                  ["machines", `Machines ${houseMachines.length}`],
                  ["inventaire", `Inventaire ${houseInv.length}`],
                  ["hub", `Hub ${houseHubStats?.total ?? houseHubLedger.length}`],
                ];
	                return (
	                  <>
	                    <div className="mt-2 flex gap-1 border-b border-slate-700/50">{tabs.map(([k, label]) => (<button key={k} type="button" onClick={() => setHouseTab(k)} className={`px-1.5 pb-1 text-[9.5px] font-bold uppercase tracking-wide ${houseTab === k ? "border-b-2 border-cyan-300 text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>))}</div>
	                    {houseTab === "live" && canonicalEmbed && (
	                      <div
	                        className="mt-2 overflow-hidden rounded-md border bg-slate-950"
	                        style={{ borderColor: `${canonicalEmbed.accent}55` }}
	                        data-canonical-service-embed={selZone.id}
	                        data-canonical-url={canonicalEmbed.canonicalUrl}
	                      >
	                        <div className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-800 px-2 py-1">
	                          <span className="min-w-0 truncate text-[10px] font-black uppercase tracking-wide" style={{ color: canonicalEmbed.accent }}>{canonicalEmbed.label}</span>
	                          <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 text-[8px] font-black text-slate-300">CANON</span>
	                        </div>
	                        <iframe
	                          key={canonicalEmbed.url}
	                          title={canonicalEmbed.title}
	                          src={canonicalEmbed.url}
	                          className="h-[min(64vh,720px)] w-full bg-white"
	                          loading="lazy"
	                          referrerPolicy="same-origin"
	                          sandbox="allow-downloads allow-forms allow-popups allow-same-origin allow-scripts"
	                        />
	                      </div>
	                    )}
	                    {houseTab === "vue" && (
	                      <div className="mt-2">
	                        {canonicalEmbed && (
	                          <div className="mb-2 overflow-hidden rounded border bg-slate-950/70" style={{ borderColor: `${canonicalEmbed.accent}55` }} data-canonical-service-summary={selZone.id} data-canonical-service-url={canonicalEmbed.url}>
	                            <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-2 py-1">
	                              <span className="truncate text-[10px] font-black uppercase" style={{ color: canonicalEmbed.accent }}>{canonicalEmbed.label}</span>
	                              <span className="truncate text-[8px] text-slate-500">{canonicalEmbed.canonicalUrl}</span>
	                            </div>
	                            {selZone.id === "youtube_studio" ? (
	                              <CofiaPublisherPipelinePanel snapshot={viewSnapshot} critical={publisherCritical} />
	                            ) : (
	                              <div className="grid grid-cols-2 gap-1 p-1.5 text-[9px]" data-canonical-service-no-extra-iframe={selZone.id}>
	                                <span className="rounded bg-slate-900/80 px-1.5 py-1 text-slate-400">Service canon</span>
	                                <span className="truncate rounded bg-slate-900/80 px-1.5 py-1 text-right font-bold text-slate-200">{canonicalEmbed.label}</span>
	                                <span className="rounded bg-slate-900/80 px-1.5 py-1 text-slate-400">Surface live</span>
	                                <span className="truncate rounded bg-slate-900/80 px-1.5 py-1 text-right font-bold text-cyan-200">{canonicalEmbed.canonicalUrl}</span>
	                              </div>
	                            )}
	                          </div>
	                        )}
	                        {selZone.id === "central_brain" && (
	                          <div className="mb-2 rounded border border-violet-400/25 bg-violet-400/5 p-1.5" data-central-brain-system-health="live-inspector">
	                            <div className="flex items-center justify-between gap-2">
	                              <p className="text-[10px] font-black uppercase text-violet-200">Sante systeme</p>
	                              <span className="rounded bg-slate-950 px-1.5 py-0.5 text-[8px] font-black text-slate-200">
	                                {systemHealth ? `${systemHealth.servicesUp ?? 0}/${systemHealth.servicesTotal ?? 0} UP` : systemHealthError ? "SOURCE_DOWN" : "SYNC"}
	                              </span>
	                            </div>
	                            {systemHealth?.cofState ? (
	                              <>
	                                <p className="mt-1 text-[8.5px] leading-snug text-violet-100">
	                                  cof_state {systemHealth.cofState.sections_ok ?? "?"}/{systemHealth.cofState.sections_total ?? "?"} sections OK · age {systemHealth.cofState.freshMin ?? "?"} min · stale {(systemHealth.cofState.stale_sections ?? []).length}
	                                </p>
	                                <p className="mt-1 text-[8.5px] leading-snug text-emerald-100">
	                                  MRR {systemHealth.cofState.mrr_eur ?? "?"} EUR · VIP {systemHealth.cofState.active_vip ?? "?"} · cout {systemHealth.cofState.cost_month_eur ?? "?"}/{systemHealth.cofState.cost_budget_eur ?? "?"} EUR ({systemHealth.cofState.cost_pct ?? "?"}%)
	                                </p>
	                                <p className="mt-1 text-[8.5px] leading-snug text-cyan-100">
	                                  agents {systemHealth.cofState.agents_alive ?? "?"}/{systemHealth.cofState.agents_total ?? "?"} connected · blocked {systemHealth.cofState.agents_blocked ?? "?"} · VPS {systemHealth.vpsFleetAgents ?? "?"}
	                                </p>
	                                <p className="mt-1 text-[8.5px] leading-snug text-amber-100">
	                                  overheat 26/05: {systemHealth.coordination?.overheat_archive?.total_archived ?? "?"} archives · {systemHealth.coordination?.overheat_archive?.restored_this_session ?? 0} coordination rebranches
	                                </p>
	                              </>
	                            ) : (
	                              <p className="mt-1 text-[8.5px] leading-snug text-amber-100">cof_state SOURCE_MISSING_OR_SCHEMA_WATCH</p>
	                            )}
	                            <p className="mt-1 break-words text-[8px] text-slate-500">Source : /api/cofiatrading-world-control/system-health · hub UI :3000</p>
	                          </div>
	                        )}
	                        {houseHubWiringContracts.length > 0 && (
	                          <div className="mb-2 rounded border border-cyan-400/25 bg-cyan-400/5 p-1.5" data-hub-wiring-house={selZone.id}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] font-black uppercase text-cyan-300">Câblage réel spine</p>
                              <span className="rounded bg-slate-950 px-1.5 py-0.5 text-[8px] font-black text-slate-200">{hubWiringSummary?.runtimeActiveContracts ?? 0}/{hubWiringSummary?.contracts ?? 0} actifs</span>
                            </div>
                            <p className="mt-1 text-[8.5px] leading-snug text-slate-300">Command {hubWiringSummary?.commandConnected ?? 0}/{hubWiringSummary?.contracts ?? 0} · Central {hubWiringSummary?.centralConnected ?? 0}/{hubWiringSummary?.contracts ?? 0} · Proof {hubWiringSummary?.proofConnected ?? 0}/{hubWiringSummary?.contracts ?? 0} · repos {hubWiringSummary?.sleepingContracts ?? 0}</p>
                            <div className="mt-1 flex flex-col gap-0.5">
                              {houseHubWiringContracts.slice(0, 4).map((contract) => (
                                <button key={`${selZone.id}-${contract.id}`} type="button" onClick={() => { const m = machines.find((machine) => machine.id === `hub_wiring_${contract.id}`); if (m) { clearSel(); setSelectedMachine(m); } }} className="rounded border border-slate-800 bg-slate-950/55 px-1.5 py-0.5 text-left hover:border-cyan-300/50">
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="truncate text-[8.5px] font-black text-slate-100">{contract.label}</span>
                                    <span className="shrink-0 text-[8px] font-black" style={{ color: runtimeColor(contract.status) }}>● {contract.status}</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-[10px] font-semibold uppercase text-cyan-300">Mission maison → chef → agents</p>
                        {houseMission ? (
                          <div className="mt-1 rounded border px-1.5 py-1" style={{ borderColor: `${missionTone(houseMission.mission.proofStatus ?? houseMission.status)}44`, background: `${missionTone(houseMission.mission.proofStatus ?? houseMission.status)}0f` }}>
                            <p className="text-[10px] font-black leading-snug text-slate-100">{houseMission.mission.title}</p>
                            <p className="mt-1 text-[9.5px] leading-snug text-cyan-100">Next: {truncateMission(houseMission.mission.nextAction, 120)}</p>
                            <p className="mt-1 text-[9px] leading-snug text-slate-400">Chef: {missionChief} · Ouvriers: {missionWorkers.length ? missionWorkers.join(" · ") : "à relier"} · {missionProofLabel}</p>
                            {houseQuality ? <MissionQualityCard quality={houseQuality} compact /> : null}
                            {houseMission.localQueue && <p className="mt-1 break-words text-[8.5px] leading-snug text-cyan-200/75">Ordres locaux non exécutés: {houseMission.localQueue.status} · {houseMission.localQueue.executedAtUtc ?? "non exécuté runtime"} · {houseMission.localQueue.path}</p>}
                            {houseMission.assetSummary && <p className="mt-1 text-[8.5px] leading-snug text-amber-200/80">Assets/outils: {houseMission.assetSummary.total ?? 0} rattachés · {houseMission.assetSummary.sleeping ?? 0} à re-probe · top: {(houseMission.assetSummary.topSleeping ?? []).slice(0, 2).join(" | ") || "aucun dormant détecté"}</p>}
                            {houseHubStats && <p className="mt-1 text-[8.5px] leading-snug text-cyan-200/80">Hub ledger: {houseHubStats.connected}/{houseHubStats.total} câblés · {houseHubStats.proofed}/{houseHubStats.total} prouvés · {houseHubStats.green} verts · {houseHubStats.amber + houseHubStats.unknown + houseHubStats.red} à traiter</p>}
                            {houseMission.revenueMissions?.length ? <div className="mt-1 flex flex-col gap-0.5">{houseMission.revenueMissions.slice(0, 2).map((revenueMission) => (<p key={revenueMission.id} className="rounded border border-emerald-400/20 bg-emerald-400/8 px-1 py-0.5 text-[8.5px] leading-snug text-emerald-100">Cash: {truncateMission(revenueMission.title, 58)} · {revenueMission.status}</p>))}</div> : null}
                            {houseMission.dispatches?.length ? <div className="mt-1 flex flex-col gap-0.5">{houseMission.dispatches.slice(0, 3).map((dispatch) => (<p key={`${dispatch.agentId}-${dispatch.target}`} className="rounded bg-slate-900/60 px-1 py-0.5 text-[8.5px] leading-snug text-slate-300">{dispatch.agentName}: {truncateMission(dispatch.target, 46)}</p>))}</div> : null}
                          </div>
                        ) : (
                          <p className="rounded border border-amber-400/20 bg-amber-400/5 px-1.5 py-1 text-[10px] leading-snug text-amber-100">Mission runtime à relier pour cette maison.</p>
                        )}
                        {selZone.id === "proof_ledger" && (
                          <div className="mt-2 rounded border border-slate-700/70 bg-slate-950/55 p-1.5" data-proof-ledger-global-quality="mission-ledger">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] font-black uppercase text-cyan-300">Qualité missions contrôlées</p>
                              <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-black text-slate-100">{missionQualityRows.length ? `${missionQualityAverage}/100` : "sync"}</span>
                            </div>
                            <div className="mt-1 flex flex-col gap-1">
                              {missionQualityRows.slice(0, 6).map(({ mission: rowMission, quality }) => (
                                <button key={rowMission.houseId} type="button" onClick={() => { clearSel(); setSelectedHouse(rowMission.houseId); setHouseTab("vue"); onSelectHouse(rowMission.houseId); }} className="rounded border border-slate-800 bg-slate-900/55 px-1.5 py-1 text-left hover:border-cyan-300/50">
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="truncate text-[9px] font-black text-slate-100">{HOUSE_BY_ID[rowMission.houseId]?.name ?? rowMission.houseId}</span>
                                    <span className="shrink-0 text-[9px] font-black" style={{ color: quality.tone }}>{quality.score}/100</span>
                                  </span>
                                  <span className="mt-0.5 block truncate text-[8px] text-slate-400">{quality.verdict} · {truncateMission(rowMission.mission.title, 72)}</span>
                                </button>
                              ))}
                              {!missionQualityRows.length && <span className="text-[9px] text-slate-500">Aucune mission reçue par le ledger.</span>}
                            </div>
                          </div>
                        )}
                        <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Créateur de mission</p>
                        <p className="rounded border border-cyan-400/20 bg-cyan-400/5 px-1.5 py-1 text-[10px] leading-snug text-cyan-100">{missionCreatorText(selZone)}</p>
                        <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Rôle</p>
                        <p className="text-[11px] leading-snug text-slate-300">{selZone.role}</p>
                        {houseActivity[selZone.id]?.label && <p className="mt-2 rounded border border-cyan-400/20 bg-cyan-400/5 px-1.5 py-1 text-[9.5px] text-cyan-100">▸ activité prouvée : {houseActivity[selZone.id]?.label}</p>}
                        <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Organigramme maison</p>
                        <p className="text-[10px] text-slate-300">{houseAgents.length ? `Chef: ${missionChief} · Équipe: ${Math.max(0, houseAgents.length - 1)} agents` : "Aucun agent canon rattaché"} · {houseRuntimeAgents.length} runtime · {houseMachines.length} machines</p>
                        {houseAgents.length > 0 && (<div className="mt-2 flex flex-wrap gap-1">{houseAgents.map((a) => (<button key={a.id} type="button" onClick={() => setSelectedAgent(a)} className="flex items-center gap-1 rounded-full border bg-slate-900/60 px-1.5 py-0.5 text-[9px] hover:opacity-90" style={{ borderColor: `${a.colorPrimary}66`, paddingInline: rankFor(a) === "agent" ? undefined : "0.5rem" }}><span className="inline-block rounded-full" style={{ background: a.colorPrimary, width: rankFor(a) === "agent" ? 8 : 10, height: rankFor(a) === "agent" ? 8 : 10, boxShadow: rankFor(a) === "agent" ? undefined : `0 0 8px ${a.colorAccent}` }} /><span className="font-bold text-slate-200">{a.name}</span></button>))}</div>)}
                      </div>
                    )}
                    {houseTab === "kpis" && (<div className="mt-2">{kpis.length > 0 && (<div className="flex flex-col gap-1">{kpis.map((row) => (<div key={row.label} className="rounded border border-slate-700/50 px-1.5 py-1"><div className="flex items-baseline justify-between gap-2"><span className="text-[9.5px] uppercase text-slate-400">{row.label}</span><span className="text-[11px] font-bold text-slate-100">{row.value}</span></div>{row.source && <span className="block text-[8px] text-emerald-300/55">▸ {row.source}</span>}</div>))}</div>)}{hk.gap && <p className="mt-1 rounded bg-amber-500/10 px-1.5 py-1 text-[9.5px] leading-snug text-amber-300/90">⚠ {hk.gap}</p>}{kpis.length === 0 && !hk.gap && <p className="rounded bg-amber-500/10 px-1.5 py-1 text-[10px] leading-snug text-amber-300/90">KPIs propres à cette maison <b>à migrer</b>.</p>}</div>)}
                    {houseTab === "anges" && (<div className="mt-2">{houseAgents.length > 0 && (<div className="mb-2 grid grid-cols-2 gap-1">{houseAgents.map((a) => (<button key={a.id} type="button" onClick={() => setSelectedAgent(a)} className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-left hover:opacity-90" style={{ borderColor: `${a.colorPrimary}55`, background: `${a.colorPrimary}10` }}><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.colorPrimary, boxShadow: `0 0 5px ${a.colorAccent}` }} /><span className="min-w-0"><span className="block truncate text-[9.5px] font-bold text-slate-100">{a.name}</span><span className="block truncate text-[8px] text-slate-400">{a.roleBadge}</span></span></button>))}</div>)}{houseRuntimeAgents.length > 0 && (<div className="mb-2 rounded border border-orange-400/20 bg-orange-400/8 p-1.5"><p className="text-[9px] font-bold uppercase tracking-wide text-orange-200">Runtime OpenClaw / Lobster</p><div className="mt-1 grid grid-cols-2 gap-1">{houseRuntimeAgents.map((agent) => (<button key={`${agent.id}-${agent.name}`} type="button" onClick={() => setSelectedRuntimeAgent(agent)} className="rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-orange-300/60"><span className="block truncate text-[9.5px] font-bold text-slate-200">{agent.name}</span><span className="text-[8px] font-bold" style={{ color: runtimeColor(agent.runtimeStatus) }}>● {agent.runtimeStatus}</span></button>))}</div></div>)}{houseAngels.length > 0 && (<div className="flex flex-col gap-1">{houseAngels.map((a) => (<button key={a.id} type="button" onClick={() => setSelectedAngel(a)} className="flex items-start gap-1.5 rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-slate-500"><span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ANGEL_STATUS[a.status].color }} /><span className="min-w-0"><span className="text-[10px] font-bold text-slate-200">{a.name}</span><span className="block truncate text-[9px] text-slate-400">{a.mission}</span></span></button>))}</div>)}{!houseAgents.length && !houseAngels.length && !houseRuntimeAgents.length && <span className="text-[10px] text-slate-500">—</span>}</div>)}
                    {houseTab === "machines" && (<div className="mt-2">{houseMachines.length ? (<div className="flex flex-col gap-1">{houseMachines.map((m) => (<button key={m.id} type="button" onClick={() => setSelectedMachine(m)} className="rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-cyan-300/60" data-tool-contract-machine={m.contract?.id ?? "none"}><span className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold text-slate-200">{m.label}</span><span className="shrink-0 text-[8px] font-bold" style={{ color: runtimeColor(m.status) }}>● {m.status}</span></span><span className="mt-0.5 block truncate text-[8px] text-slate-500">{m.contract ? m.contract.purpose : (m.role ?? "contrat outil a relier")}</span></button>))}</div>) : <p className="text-[10px] text-slate-500">Aucune machine/service canonique attaché.</p>}</div>)}
                    {houseTab === "inventaire" && (<div className="mt-2">{houseInv.length === 0 ? <p className="text-[10px] text-slate-500">Aucun élément d&apos;inventaire rattaché à cette maison.</p> : (() => {
                      const order = ["GREEN", "LIVE", "AMBER", "AMBER_REVERIFY", "RED", "QUARANTINE", "UNKNOWN"];
                      const byStatus: Record<string, number> = {}; for (const it of houseInv) byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
                      const byCat: Record<string, InvItem[]> = {}; for (const it of houseInv) (byCat[it.category] ||= []).push(it);
                      return (<>
                        <p className="mb-1 text-[10px] font-bold text-slate-200">Total <span className="text-cyan-200">{houseInv.length}</span> items rattachés à cette maison</p>
                        <div className="mb-2 flex flex-wrap gap-1">{order.filter((s) => byStatus[s]).map((s) => (<span key={s} className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold" style={{ borderColor: `${invColor(s)}55`, color: invColor(s) }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: invColor(s) }} />{s} {byStatus[s]}</span>))}</div>
                        <div className="flex flex-col gap-2">{Object.entries(byCat).sort((a, b) => b[1].length - a[1].length).map(([cat, list]) => (
                          <div key={cat}>
                            <p className="text-[9px] font-bold uppercase tracking-wide text-cyan-300/80">{cat} <span className="text-slate-500">· {list.length}</span></p>
                            <div className="mt-0.5 flex flex-col gap-0.5">{list.slice(0, 60).map((it) => (
                              <div key={it.id} className="flex items-start gap-1.5 rounded border border-slate-800/70 px-1.5 py-0.5" title={it.proof || it.blocker || it.nextAction || ""}>
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: invColor(it.status) }} />
                                <span className="min-w-0 flex-1"><span className="block truncate text-[9.5px] text-slate-200">{it.name}</span>{(it.blocker || it.nextAction) && <span className="block truncate text-[8px] text-slate-500">{it.blocker || it.nextAction}</span>}</span>
                                <span className="shrink-0 text-[7.5px] font-bold" style={{ color: invColor(it.status) }}>{it.status}</span>
                              </div>
                            ))}{list.length > 60 && <span className="text-[8px] text-slate-500">+{list.length - 60} de plus…</span>}</div>
                          </div>
                        ))}</div>
                      </>);
                    })()}</div>)}
                    {houseTab === "hub" && (<div className="mt-2" data-hub-ledger-house={selZone.id}>{!houseHubStats ? <p className="text-[10px] text-slate-500">Source Ledger en synchronisation.</p> : (() => {
                      const byKind: Record<string, HubLedgerItem[]> = {}; for (const item of houseHubLedger) (byKind[item.kind] ||= []).push(item);
                      const order = ["LIVE", "GREEN", "AMBER", "AMBER_REVERIFY", "RED", "QUARANTINE", "UNKNOWN"];
                      const byStatus: Record<string, number> = {}; for (const item of houseHubLedger) byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
                      return (<>
                        <div className="rounded border border-cyan-400/25 bg-cyan-400/5 px-1.5 py-1">
                          <p className="text-[10px] font-black uppercase text-cyan-200">Source Ledger · {hubSourceLedger?.policy ?? "NO_FALSE_GREEN"}</p>
                          <p className="mt-0.5 text-[9px] leading-snug text-slate-300">Câblés {houseHubStats.connected}/{houseHubStats.total} · preuves {houseHubStats.proofed}/{houseHubStats.total} · vert {houseHubStats.green} · amber {houseHubStats.amber} · red {houseHubStats.red} · unknown {houseHubStats.unknown}</p>
                          {hubSourceLedger?.declared && <p className="mt-0.5 text-[8px] leading-snug text-slate-500">Global: sources {hubSourceLedger.declared.truthSources ?? 0} · patrimoine {hubSourceLedger.declared.patrimoineEntries ?? 0} · canon {hubSourceLedger.declared.canonAssets ?? 0} · vault {fmtNum(hubSourceLedger.declared.assetVaultAssetsDeclared)}</p>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">{order.filter((s) => byStatus[s]).map((s) => (<span key={s} className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold" style={{ borderColor: `${invColor(s)}55`, color: invColor(s) }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: invColor(s) }} />{s} {byStatus[s]}</span>))}</div>
                        <div className="mt-2 flex flex-col gap-2">{Object.entries(byKind).sort((a, b) => b[1].length - a[1].length).map(([kind, list]) => (
                          <div key={kind}>
                            <p className="text-[9px] font-bold uppercase tracking-wide text-cyan-300/80">{kind.replaceAll("_", " ")} <span className="text-slate-500">· {list.length}</span></p>
                            <div className="mt-0.5 flex flex-col gap-0.5">{list.slice(0, 70).map((item) => (
                              <div key={item.id} className="flex items-start gap-1.5 rounded border border-slate-800/70 px-1.5 py-0.5" title={`${item.proof} · ${item.sourcePath}`}>
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: invColor(item.status) }} />
                                <span className="min-w-0 flex-1"><span className="block truncate text-[9.5px] text-slate-200">{item.name}</span><span className="block truncate text-[8px] text-slate-500">{item.connected ? "câblé" : "non câblé"} · {item.proofed ? "preuve OK" : "preuve à revalider"} · {item.sourceTag}</span></span>
                                <span className="shrink-0 text-[7.5px] font-bold" style={{ color: invColor(item.status) }}>{item.status}</span>
                              </div>
                            ))}{list.length > 70 && <span className="text-[8px] text-slate-500">+{list.length - 70} de plus…</span>}</div>
                          </div>
                        ))}</div>
                      </>);
                    })()}</div>)}
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>
        )}
      </div>
    </div>
  );
}

const ACT_LABEL: Record<AgentState, string> = { idle: "repos", queued: "non exécuté", alert: "alerte", phone: "messagerie", keyboard: "traitement", inspect: "inspection", work: "mission locale" };

function CofiaPublisherPipelinePanel({ snapshot, critical }: { snapshot: CofiaSnapshot | null | undefined; critical: PublisherCriticalState }) {
  const native = snapshot?.publisherNative;
  const bridge = snapshot?.publisherBridge;
  const video = snapshot?.videoAvailability;
  const lock = native?.publishLock;
  const keyframeProgress = useMemo(() => derivePublisherKeyframeProgress(native), [native]);
  const citadelleAlert = critical.active || publisherGlobalAlertActive(native);
  const keyframeTicks = useMemo(
    () => Array.from({ length: keyframeProgress.tickCount }, (_, index) => index < keyframeProgress.filledTicks),
    [keyframeProgress.filledTicks, keyframeProgress.tickCount],
  );
  const nativeStatus = native?.state ?? (native?.ok ? "LIVE_HTTP" : "UNKNOWN");
  const bridgeStatus = bridge?.status ?? (bridge?.ok ? "LIVE" : "UNKNOWN");
  const videoStatus = video?.status ?? (video?.ok ? "LIVE" : "UNKNOWN");
  const rows = [
    { label: "Pipeline natif", value: nativeStatus, tone: runtimeColor(nativeStatus), source: native?.sourceTag ?? "publisherNative" },
    { label: "Renders", value: fmtNum(native?.counts?.renders), tone: "#38bdf8", source: native?.outputDir ?? "output_dir" },
    { label: "Keyframes", value: `${fmtNum(keyframeProgress.current)}/${fmtNum(keyframeProgress.total)}`, tone: citadelleAlert ? "#fecaca" : "#f472b6", source: keyframeProgress.source },
    { label: "Workorders", value: `${keyframeProgress.activeWorkorders}/${keyframeProgress.totalWorkorders || "0"}`, tone: workorderTone(keyframeProgress.status), source: keyframeProgress.status },
    { label: "Bridge Hub", value: bridgeStatus, tone: runtimeColor(bridgeStatus), source: bridge?.endpoint ?? "hub bridge" },
    { label: "Assets", value: `${fmtNum(bridge?.exportedAssetCount)}/${fmtNum(bridge?.fullAssetCount)}`, tone: "#14b8a6", source: bridge?.sourceTag ?? "asset bridge" },
    { label: "Motion proofs", value: fmtNum(video?.motionProofCount), tone: runtimeColor(videoStatus), source: video?.sourceTag ?? "video bridge" },
    { label: "Publish gate", value: lock?.allowed === true ? "ALLOW" : (lock?.reason ?? "LOCKED"), tone: lock?.allowed === true ? "#34d399" : "#f59e0b", source: "publishLock" },
  ];
  const tabs = ["1", "2", "3", "4 COF : LA CITADELLE", "5"];
  return (
    <div className="p-1.5" data-cofiapublisher-pipeline-panel="prepared" data-citadelle-critical={citadelleAlert ? "true" : "false"} data-publisher-global-alert={publisherGlobalAlertActive(native) ? "true" : "false"} data-publisher-keyframes={`${keyframeProgress.current}/${keyframeProgress.total}`} data-publisher-workorders={`${keyframeProgress.activeWorkorders}/${keyframeProgress.totalWorkorders}`}>
      <div className={`mb-1.5 rounded border px-1.5 py-1 ${citadelleAlert ? "border-red-400/70 bg-red-500/12 shadow-[0_0_22px_rgba(239,68,68,0.24)]" : "border-pink-400/25 bg-pink-400/5"}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-black uppercase text-pink-100">COFIAPUBLISHER pipeline</span>
          <span className="shrink-0 text-[8px] font-black" style={{ color: citadelleAlert ? "#fecaca" : "#f9a8d4" }}>{citadelleAlert ? "ALERTE ROUGE" : "READY"}</span>
        </div>
        <div className="mt-1 grid grid-cols-5 gap-1" data-cofiapublisher-8540-five-tabs="stable">
          {tabs.map((tab, idx) => (
            <span key={tab} data-citadelle-tab-alert={idx === 3 && citadelleAlert ? "true" : "false"} className={`truncate rounded px-1 py-0.5 text-center text-[7.5px] font-black ${idx === 3 ? (citadelleAlert ? "border border-red-200/85 bg-red-600/35 text-red-50 shadow-[0_0_18px_rgba(239,68,68,0.34)]" : "border border-red-300/55 bg-red-500/15 text-red-100") : "bg-slate-950/70 text-slate-300"}`}>{tab}</span>
          ))}
        </div>
        <div className="mt-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-black uppercase tracking-wide text-slate-300">Keyframes</span>
            <span className="text-[8px] font-black tabular-nums" style={{ color: citadelleAlert ? "#fecaca" : "#f9a8d4" }}>{keyframeProgress.current}/{keyframeProgress.total}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-950/90" data-keyframe-progress-meter="publisherNative.counts.renders">
            <div className="h-full rounded-full bg-gradient-to-r from-pink-400 via-sky-300 to-emerald-300" style={{ width: `${keyframeProgress.percent}%` }} />
          </div>
          <div className="mt-1 grid grid-cols-[repeat(14,minmax(0,1fr))] gap-0.5" data-keyframe-ticks={`${keyframeProgress.filledTicks}/${keyframeProgress.tickCount}`}>
            {keyframeTicks.map((filled, index) => (
              <span key={`kf-${index}`} className={`h-1 rounded-full ${filled ? (citadelleAlert ? "bg-red-200" : "bg-pink-300") : "bg-slate-800"}`} />
            ))}
          </div>
        </div>
        <p className="mt-1 truncate text-[8px] text-slate-400">{citadelleAlert ? `${critical.source} · ${critical.sourceTag}` : "external critical indicator: normal"}</p>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {rows.map((row) => (
          <div key={row.label} className="rounded border border-slate-800/80 bg-slate-950/70 px-1.5 py-1">
            <div className="flex items-baseline justify-between gap-1">
              <span className="truncate text-[8.5px] uppercase text-slate-400">{row.label}</span>
              <span className="shrink-0 text-[9px] font-black" style={{ color: row.tone }}>{row.value}</span>
            </div>
            <span className="mt-0.5 block truncate text-[7.5px] text-slate-500">{row.source}</span>
          </div>
        ))}
      </div>
      {keyframeProgress.workorders.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1" data-cofiapublisher-workorders-live="snapshot">
          {keyframeProgress.workorders.map((workorder) => (
            <div key={workorder.id} className="grid grid-cols-[minmax(0,1fr)_52px_42px] items-center gap-1 rounded border border-slate-800/70 bg-slate-950/60 px-1.5 py-0.5">
              <span className="truncate text-[8px] font-bold text-slate-300">{workorder.label}</span>
              <span className="truncate text-right text-[7.5px] font-black" style={{ color: workorderTone(workorder.status) }}>{workorder.status}</span>
              <span className="text-right text-[7.5px] font-black tabular-nums text-slate-400">{workorder.current ?? "-"}{workorder.total !== null ? `/${workorder.total}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function missionCreatorText(h: House): string {
  switch (h.type) {
    case "command_tower": return "Génère les missions prioritaires, route les agents et arbitre les statuts comme une tour de contrôle.";
    case "brain": return "Crée les missions de mémoire, raisonnement, dispatch IA et surveillance centrale.";
    case "business": return "Crée les missions revenue: relance brokers, CRM, VIP, Stripe et cash immédiat.";
    case "studio": return "Crée les missions publication: scripts, voix, montage, rendu et sortie vidéo.";
    case "compliance": return "Crée les missions de verrouillage légal, preuve, sécurité et no-false-green.";
    case "signal_tower": return "Crée les missions trading: signaux, veille marché, stratégies et preuves runtime.";
    case "academy": return "Crée les missions pédagogiques: modules, parcours, preuves et montée en compétence.";
    case "gate": return "Crée les missions communauté: Telegram free/VIP, accès, rétention et broadcast.";
    case "vault": return "Crée les missions canon: rangement, index, preuve source et mémoire longue.";
    case "observatory": return "Crée les missions recall: graph sémantique, recherche et observation des signaux faibles.";
    case "factory": return "Crée les missions backlog: scoring, tri, priorisation et nettoyage opérationnel.";
    case "warehouse": return "Crée les missions assets: inventaire, voix, packaging et distribution.";
    case "lab": return "Crée les missions site/SEO: tests, pages, growth et readiness locale.";
    case "calendar": return "Crée les missions cadence: rappels, runs récurrents et synchronisation des agents.";
    case "notebook_alm": return "Crée les missions de grounding NotebookLM et synthèse de connaissance.";
    case "proof_ledger": return "Crée les missions de preuve: audit, registre et validation sourçable.";
    default: return h.role;
  }
}

/* ════════════════════ BÂTIMENT (grand, premium) ════════════════════ */
type Built = { house: House; ground: Pt[]; base: Pt; height: number; depth: number };
type ProofCinemaStats = {
  activeCount: number;
  houseLabel: string;
  idleCount: number;
  proofActive: boolean;
  proofCount: number;
  queuedCount: number;
  totalCount: number;
};

function ProofLedgerCinemaScreen({
  activeCount,
  built,
  houseLabel,
  idleCount,
  proofActive,
  proofCount,
  queuedCount,
  totalCount,
}: ProofCinemaStats & { built: Built }) {
  const roofY = built.base.y - built.height;
  const cx = built.base.x;
  const screenW = 360;
  const screenH = 118;
  const screenX = cx - screenW / 2;
  const screenY = roofY - 172;
  const bottom = screenY + screenH;
  const tone = proofActive ? "#34d399" : "#fbbf24";
  const backTone = proofActive ? "#052e24" : "#2f2306";
  const stateTitle = proofActive ? "PREUVE ACTIVE" : "AUCUNE PREUVE ACTIVE";
  const agentLine = `${activeCount}/${totalCount || "?"} AGENTS`;
  return (
    <g
      data-proof-cinema-structure="building-mounted"
      data-proof-cinema-active={proofActive ? "true" : "false"}
      data-proof-cinema-agents={agentLine}
      data-proof-cinema-houses={houseLabel}
      data-proof-cinema-source="LOCAL_RUNTIME_PROOF=agent_canon+inventory+house_dispatch"
      pointerEvents="none"
    >
      <title>{`Proof Ledger cinema: ${stateTitle} · ${agentLine} · maisons ${houseLabel} · travail prouve ${proofCount}`}</title>
      <g opacity="0.96">
        <path d={`M ${(screenX + 52).toFixed(1)} ${bottom.toFixed(1)} L ${(cx - 42).toFixed(1)} ${(roofY + 10).toFixed(1)} M ${(screenX + screenW - 52).toFixed(1)} ${bottom.toFixed(1)} L ${(cx + 42).toFixed(1)} ${(roofY + 10).toFixed(1)}`} stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
        <path d={`M ${(screenX + 52).toFixed(1)} ${bottom.toFixed(1)} L ${(cx - 42).toFixed(1)} ${(roofY + 10).toFixed(1)} M ${(screenX + screenW - 52).toFixed(1)} ${bottom.toFixed(1)} L ${(cx + 42).toFixed(1)} ${(roofY + 10).toFixed(1)}`} stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx={cx} cy={roofY + 13} rx="78" ry="13" fill="#020617" opacity="0.3" />
        <rect x={screenX - 10} y={screenY - 9} width={screenW + 20} height={screenH + 18} rx="12" fill="#020617" stroke="#7dd3fc" strokeWidth="3.4" opacity="0.94" />
        <rect x={screenX} y={screenY} width={screenW} height={screenH} rx="9" fill={backTone} stroke={tone} strokeWidth="2.6" opacity="0.98" />
        <rect x={screenX + 12} y={screenY + 11} width={screenW - 24} height={screenH - 22} rx="7" fill="#06111f" stroke="#164e63" strokeWidth="1.5" opacity="0.92" />
        <text x={screenX + 22} y={screenY + 32} fontSize="16" fontWeight="950" fill="#e0f2fe" style={{ letterSpacing: "2px" }}>PROOF LEDGER</text>
        <text x={screenX + screenW - 22} y={screenY + 32} textAnchor="end" fontSize="13" fontWeight="900" fill={tone}>{stateTitle}</text>
        <text x={screenX + 22} y={screenY + 70} fontSize="26" fontWeight="950" fill="#ffffff">{agentLine}</text>
        <text x={screenX + 22} y={screenY + 98} fontSize="15" fontWeight="900" fill="#a7f3d0">prouvé {proofCount} · attente {queuedCount} · repos {idleCount}</text>
        <text x={screenX + screenW - 22} y={screenY + 70} textAnchor="end" fontSize="15" fontWeight="900" fill="#ccfbf1">maisons {houseLabel}</text>
      </g>
    </g>
  );
}

function MissionQualityCard({ quality, compact = false }: { quality: MissionQuality; compact?: boolean }) {
  return (
    <div className="mt-1 rounded border px-1.5 py-1" style={{ borderColor: `${quality.tone}66`, background: `${quality.tone}10` }} data-proof-ledger-mission-quality={quality.verdict} data-proof-ledger-mission-score={quality.score}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: quality.tone }}>Proof Ledger · {quality.verdict}</span>
        <span className="rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-black" style={{ color: quality.tone }}>{quality.score}/100</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-950/80">
        <div className="h-full rounded-full" style={{ width: `${quality.score}%`, background: quality.tone }} />
      </div>
      <div className={`mt-1 grid ${compact ? "grid-cols-2" : "grid-cols-2"} gap-1`}>
        {quality.signals.slice(0, compact ? 4 : quality.signals.length).map((signal) => (
          <span key={signal.label} className="flex items-center justify-between gap-1 rounded border border-slate-700/60 bg-slate-950/45 px-1 py-0.5 text-[8.2px]">
            <span className="truncate text-slate-400">{signal.label}</span>
            <span className="shrink-0 font-black" style={{ color: qualityColor(signal.status) }}>{signal.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function HubWiringSpineMesh({ built, wiring, selectedHouse }: { built: Built[]; wiring: HubWiringPayload | null; selectedHouse: string | null }) {
  const contracts = wiring?.contracts ?? [];
  if (!wiring?.ok || contracts.length === 0) return null;
  const byId = new Map(built.map((b) => [b.house.id, b]));
  const cores = [
    { id: "mission_control_tower", color: "#38bdf8", offset: -20 },
    { id: "central_brain", color: "#8b5cf6", offset: 0 },
    { id: "proof_ledger", color: "#cbd5e1", offset: 20 },
  ];
  const summary = wiring.summary ?? {};
  return (
    <g
      data-hub-wiring-spine="true"
      data-hub-wiring-contracts={summary.contracts ?? contracts.length}
      data-hub-wiring-runtime-active={summary.runtimeActiveContracts ?? 0}
      pointerEvents="none"
    >
      {contracts.flatMap((contract, contractIndex) => {
        const target = byId.get(contract.houseId);
        if (!target) return [];
        return cores.map((core, coreIndex) => {
          const origin = byId.get(core.id);
          if (!origin || origin.house.id === target.house.id) return null;
          const edge = contract.edges?.find((entry) => entry.from === core.id);
          const hot = selectedHouse === core.id || selectedHouse === target.house.id || selectedHouse === "proof_ledger";
          const dx = target.base.x - origin.base.x;
          const dy = target.base.y - origin.base.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          const nx = -dy / len;
          const ny = dx / len;
          const bend = core.offset + ((contractIndex % 4) - 1.5) * 5;
          const mid = { x: origin.base.x + dx * 0.5 + nx * bend, y: origin.base.y + dy * 0.5 + ny * (bend * 0.6) };
          const status = edge?.status ?? contract.status;
          const color = contract.runtimeStatus === "RUNTIME_ACTIVE_PROVED"
            ? "#34d399"
            : status.includes("GAPS") || status.includes("RED") || status.includes("AMBER")
              ? "#f59e0b"
              : core.color;
          const opacity = hot ? 0.7 : contract.sleeping ? 0.16 : 0.28;
          return (
            <g
              key={`hub-wiring-${core.id}-${contract.id}-${coreIndex}`}
              data-hub-wiring-edge={`${core.id}->${contract.id}`}
              data-hub-wiring-edge-status={status}
              opacity={opacity}
            >
              <title>{`${core.id} -> ${contract.label}: ${contract.summary}`}</title>
              <path
                d={`M ${origin.base.x.toFixed(1)} ${origin.base.y.toFixed(1)} Q ${mid.x.toFixed(1)} ${mid.y.toFixed(1)} ${target.base.x.toFixed(1)} ${target.base.y.toFixed(1)}`}
                fill="none"
                stroke={color}
                strokeWidth={hot ? 1.75 : 1.05}
                strokeDasharray={contract.runtimeStatus === "RUNTIME_ACTIVE_PROVED" ? undefined : "4 10"}
              />
            </g>
          );
        });
      })}
    </g>
  );
}

const PROOF_LEDGER_PRIORITY_TARGETS = [
  { houseId: "central_brain", label: "Central Brain", tool: "routing+memory", color: "#8b5cf6" },
  { houseId: "notebook_alm", label: "NotebookLM", tool: "grounding", color: "#60a5fa" },
  { houseId: "paperclip_factory", label: "Paperclip + Linear", tool: "backlog+issues", color: "#a78bfa" },
  { houseId: "obsidian_library", label: "Notion + Knowledge", tool: "docs+canon", color: "#f8fafc" },
  { houseId: "youtube_studio", label: "COFIA Publisher", tool: "videos+publishing", color: "#ff2d55" },
  { houseId: "site_seo_lab", label: "Site / SEO", tool: "web+growth", color: "#7dd3fc" },
  { houseId: "iron_office", label: "Revenue", tool: "cash+mrr", color: "#ffd400" },
  { houseId: "assets_warehouse", label: "Assets / Voice", tool: "media+distribution", color: "#14b8a6" },
  { houseId: "openclaw_agent_barracks", label: "Agents Runtime", tool: "workers+missions", color: "#ff7a00" },
] as const;

function proofCurve(origin: Pt, target: Pt, bendSeed: number, strength = 28) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const bend = ((bendSeed % 7) - 3) * 7 + strength;
  const mid = { x: origin.x + dx * 0.52 + nx * bend, y: origin.y + dy * 0.52 + ny * bend * 0.46 };
  return `M ${origin.x.toFixed(1)} ${origin.y.toFixed(1)} Q ${mid.x.toFixed(1)} ${mid.y.toFixed(1)} ${target.x.toFixed(1)} ${target.y.toFixed(1)}`;
}

function ProofLedgerOperationsMesh({
  agentCount,
  built,
  machines,
  qualityAverage,
  selectedHouse,
}: {
  agentCount: number;
  built: Built[];
  machines: WorldMachine[];
  qualityAverage: number;
  selectedHouse: string | null;
}) {
  const byId = new Map(built.map((b) => [b.house.id, b]));
  const origin = byId.get("proof_ledger");
  if (!origin) return null;
  const priorityIds = new Set<string>(PROOF_LEDGER_PRIORITY_TARGETS.map((target) => target.houseId));
  const machineByHouse = machines.reduce<Record<string, number>>((acc, machine) => {
    acc[machine.homeHouse] = (acc[machine.homeHouse] ?? 0) + 1;
    return acc;
  }, {});
  const allTargets = built.filter((target) => target.house.id !== "proof_ledger");
  return (
    <g
      data-proof-ledger-operations-mesh="all-houses-tools-agents"
      data-proof-ledger-anchor="proof_ledger"
      data-proof-ledger-agent-count={agentCount}
      data-proof-ledger-machine-count={machines.length}
      data-proof-ledger-quality-average={qualityAverage}
      pointerEvents="none"
    >
      {allTargets.map((target, index) => {
        const priority = priorityIds.has(target.house.id);
        const hot = selectedHouse === "proof_ledger" || selectedHouse === target.house.id;
        const color = PROOF_LEDGER_PRIORITY_TARGETS.find((item) => item.houseId === target.house.id)?.color ?? target.house.accent;
        const d = proofCurve(origin.base, target.base, index, priority ? 40 : 20);
        return (
          <g
            key={`proof-ledger-house-${target.house.id}`}
            data-proof-ledger-house-edge={target.house.id}
            data-proof-ledger-house-priority={priority ? "true" : "false"}
            data-proof-ledger-house-machines={machineByHouse[target.house.id] ?? 0}
            opacity={hot ? 0.9 : priority ? 0.36 : 0.16}
          >
            <title>{`Proof Ledger audite ${target.house.name}: ${machineByHouse[target.house.id] ?? 0} machine(s), qualité ${qualityAverage || "sync"}/100`}</title>
            <path d={d} fill="none" stroke="#020617" strokeWidth={priority ? 7.2 : 4.2} strokeLinecap="round" opacity="0.64" />
            <path className="cof-proof-fabric" d={d} fill="none" stroke={color} strokeWidth={hot ? 4.4 : priority ? 3.1 : 1.5} strokeLinecap="round" strokeDasharray={priority ? "13 16" : "6 13"} />
            <circle cx={target.base.x} cy={target.base.y} r={priority ? 4.8 : 2.8} fill={color} stroke="#020617" strokeWidth="1.2" opacity={priority ? 0.92 : 0.58} />
          </g>
        );
      })}
      {PROOF_LEDGER_PRIORITY_TARGETS.map((item, index) => {
        const target = byId.get(item.houseId);
        if (!target) return null;
        const side = index % 2 === 0 ? 1 : -1;
        const boxW = 226;
        const labelX = target.base.x + side * 48;
        const labelY = target.base.y - 34 - (index % 3) * 10;
        return (
          <g
            key={`proof-ledger-tool-label-${item.houseId}`}
            data-proof-ledger-tool-target={item.houseId}
            data-proof-ledger-tool={item.tool}
            transform={`translate(${labelX.toFixed(1)} ${labelY.toFixed(1)}) scale(2.25)`}
            opacity={selectedHouse && selectedHouse !== "proof_ledger" && selectedHouse !== item.houseId ? 0.5 : 0.98}
          >
            <rect x={side > 0 ? 0 : -boxW} y="-23" width={boxW} height="45" rx="7" fill="#020617" stroke={item.color} strokeWidth="2.2" opacity="0.94" />
            <text x={side > 0 ? 11 : -11} y="-4" textAnchor={side > 0 ? "start" : "end"} fontSize="15.5" fontWeight="950" fill={item.color} stroke="#020617" strokeWidth="2.2" paintOrder="stroke">{item.label}</text>
            <text x={side > 0 ? 11 : -11} y="14" textAnchor={side > 0 ? "start" : "end"} fontSize="10.2" fontWeight="850" fill="#e2e8f0">{item.tool}</text>
          </g>
        );
      })}
      <g data-proof-ledger-bus-core="audit-command" transform={`translate(${origin.base.x.toFixed(1)} ${origin.base.y.toFixed(1)})`}>
        <circle r="13" fill="#020617" stroke="#e5e7eb" strokeWidth="2.4" opacity="0.96" />
        <circle r="8" fill="#0f172a" stroke="#34d399" strokeWidth="1.8" opacity="0.94" />
        <path d="M-4 0 L-1.2 3.1 L5 -4.2" fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
}

function ProofLedgerAgentAuditMesh({ agents, built, selectedHouse }: { agents: VisibleAgent[]; built: Built[]; selectedHouse: string | null }) {
  const origin = built.find((b) => b.house.id === "proof_ledger");
  if (!origin || agents.length === 0) return null;
  const proofOrigin = { x: origin.base.x, y: origin.base.y - 12 };
  return (
    <g
      data-proof-ledger-agent-audit-mesh="all-visible-agents"
      data-proof-ledger-agent-count={agents.length}
      data-proof-ledger-anchor="proof_ledger"
      pointerEvents="none"
    >
      {agents.map((item, index) => {
        const p = isoProject(item.wx, item.wy);
        const target = { x: p.sx, y: p.sy - 9 };
        const hot = selectedHouse === "proof_ledger" || selectedHouse === item.agent.house;
        return (
          <path
            key={`proof-ledger-agent-${item.agent.id}`}
            className="cof-proof-agent-thread"
            data-proof-ledger-agent-edge={item.agent.id}
            data-proof-ledger-agent-house={item.agent.house}
            d={proofCurve(proofOrigin, target, index, 12)}
            fill="none"
            stroke={item.agent.colorAccent || "#67e8f9"}
            strokeWidth={hot ? 1.1 : 0.55}
            strokeDasharray="3 11"
            opacity={hot ? 0.38 : 0.16}
          />
        );
      })}
    </g>
  );
}

function MissionQualityAuditMesh({ built, rows, selectedHouse }: { built: Built[]; rows: Array<{ mission: HouseMissionRecord; quality: MissionQuality }>; selectedHouse: string | null }) {
  const byId = new Map(built.map((b) => [b.house.id, b]));
  const origin = byId.get("proof_ledger");
  if (!origin || rows.length === 0) return null;
  return (
    <g data-proof-ledger-audit-mesh="mission-quality" pointerEvents="none">
      {rows.map(({ mission, quality }) => {
        const target = byId.get(mission.houseId);
        if (!target || target.house.id === "proof_ledger") return null;
        const hot = selectedHouse === "proof_ledger" || selectedHouse === target.house.id;
        const dx = target.base.x - origin.base.x;
        const dy = target.base.y - origin.base.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / len;
        const ny = dx / len;
        const mid = { x: origin.base.x + dx * 0.52 + nx * 22, y: origin.base.y + dy * 0.52 + ny * 16 };
        return (
          <g key={`quality-mesh-${mission.houseId}`} opacity={hot ? 0.78 : 0.22}>
            <title>{`Proof Ledger contrôle ${target.house.name}: ${quality.score}/100 · ${quality.verdict}`}</title>
            <path
              d={`M ${origin.base.x.toFixed(1)} ${origin.base.y.toFixed(1)} Q ${mid.x.toFixed(1)} ${mid.y.toFixed(1)} ${target.base.x.toFixed(1)} ${target.base.y.toFixed(1)}`}
              fill="none"
              stroke={quality.tone}
              strokeWidth={hot ? 2.2 : 1.1}
              strokeDasharray={quality.verdict === "VERIFIED" ? undefined : "5 9"}
            />
            <circle cx={target.base.x} cy={target.base.y} r={hot ? 4 : 2.6} fill={quality.tone} opacity="0.9" />
          </g>
        );
      })}
    </g>
  );
}

type ParkVehicleKind = "car" | "moto" | "horse" | "quad";

function ParkVehicle({
  accent,
  color,
  kind,
  scale,
}: {
  accent: string;
  color: string;
  kind: ParkVehicleKind;
  scale: number;
}) {
  const dark = shade(color, -42);
  const light = shade(color, 18);
  const stroke = "#020617";
  if (kind === "moto") {
    return (
      <g data-rest-vehicle="moto" transform={`scale(${scale.toFixed(2)})`}>
        <ellipse cx="0" cy="20" rx="34" ry="10" fill="#020617" opacity="0.28" />
        <circle cx="-22" cy="15" r="12" fill="#0f172a" stroke={accent} strokeWidth="3" />
        <circle cx="20" cy="15" r="12" fill="#0f172a" stroke={accent} strokeWidth="3" />
        <path d="M-20 10 L-6 -8 H14 L24 10 M-2 -8 L-12 11 M14 -8 L20 -18 L34 -14" fill="none" stroke={light} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M-7 -11 H13 Q19 -10 21 -4 Q9 2 -10 -4 Q-10 -9 -7 -11 Z" fill={color} stroke={stroke} strokeWidth="2.2" />
        <circle cx="2" cy="-14" r="5" fill={accent} opacity="0.85" />
      </g>
    );
  }
  if (kind === "horse") {
    return (
      <g data-rest-vehicle="horse" transform={`scale(${scale.toFixed(2)})`}>
        <ellipse cx="1" cy="25" rx="36" ry="11" fill="#020617" opacity="0.28" />
        <path d="M-28 -6 Q-14 -25 14 -18 Q32 -14 34 0 Q26 12 -2 13 Q-30 12 -38 0 Z" fill={color} stroke={stroke} strokeWidth="2.4" />
        <path d="M26 -14 Q43 -24 46 -10 Q42 1 31 0 Z" fill={light} stroke={stroke} strokeWidth="2.2" />
        <circle cx="39" cy="-11" r="2.8" fill="#f8fafc" />
        <path d="M-34 -1 Q-48 -7 -50 -20" fill="none" stroke={dark} strokeWidth="5" strokeLinecap="round" />
        <path d="M-22 9 L-28 28 M-7 11 L-7 30 M11 10 L16 29 M27 4 L34 22" stroke={dark} strokeWidth="5" strokeLinecap="round" />
        <path d="M-31 28 H-20 M-11 30 H2 M12 29 H24 M30 22 H40" stroke={accent} strokeWidth="3" strokeLinecap="round" opacity="0.75" />
        <path d="M-5 -21 Q7 -31 25 -21" fill="none" stroke={accent} strokeWidth="3.2" strokeLinecap="round" opacity="0.74" />
      </g>
    );
  }
  if (kind === "quad") {
    return (
      <g data-rest-vehicle="quad" transform={`scale(${scale.toFixed(2)})`}>
        <ellipse cx="0" cy="24" rx="38" ry="12" fill="#020617" opacity="0.3" />
        <circle cx="-26" cy="12" r="10" fill="#0f172a" stroke={accent} strokeWidth="2.8" />
        <circle cx="26" cy="12" r="10" fill="#0f172a" stroke={accent} strokeWidth="2.8" />
        <circle cx="-26" cy="-6" r="8" fill="#0f172a" stroke={accent} strokeWidth="2.4" opacity="0.86" />
        <circle cx="26" cy="-6" r="8" fill="#0f172a" stroke={accent} strokeWidth="2.4" opacity="0.86" />
        <path d="M-28 -16 H18 Q33 -14 34 2 L24 14 H-28 L-36 2 Q-36 -12 -28 -16 Z" fill={color} stroke={stroke} strokeWidth="2.4" />
        <rect x="-10" y="-24" width="28" height="12" rx="5" fill={light} stroke={stroke} strokeWidth="2" />
        <path d="M18 -22 L34 -30 M20 -22 L36 -18" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g data-rest-vehicle="car" transform={`scale(${scale.toFixed(2)})`}>
      <ellipse cx="0" cy="24" rx="40" ry="12" fill="#020617" opacity="0.3" />
      <path d="M-38 -5 L-24 -24 H18 L38 -6 L34 14 H-38 Z" fill={color} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M-18 -20 H14 L26 -8 H-28 Z" fill="#bae6fd" stroke={stroke} strokeWidth="2" opacity="0.78" />
      <rect x="-34" y="-2" width="68" height="18" rx="7" fill={dark} stroke={stroke} strokeWidth="2" opacity="0.82" />
      <circle cx="-24" cy="15" r="9" fill="#0f172a" stroke={accent} strokeWidth="3" />
      <circle cx="24" cy="15" r="9" fill="#0f172a" stroke={accent} strokeWidth="3" />
      <rect x="-4" y="-26" width="13" height="5" rx="2" fill={accent} opacity="0.8" />
    </g>
  );
}

function ParkingAgentOwner({ agent, accent }: { agent: CanonAgent; accent: string }) {
  const seed = avatarSeed(agent.id);
  const skin = skinHex(seed.skinTone);
  const hair = hairHex(seed.hairColor);
  const rank = rankFor(agent);
  const ring = rank === "crown" ? "#facc15" : rank === "diadem" ? "#c084fc" : rank === "captain" ? "#38bdf8" : accent;
  const body = agent.colorPrimary || "#38bdf8";
  return (
    <g
      data-agent-marker="rest-vehicle-owner"
      data-rest-agent-owner="visible"
      transform="translate(24 -28) scale(0.74)"
      pointerEvents="none"
    >
      <title>{`${agent.name} · repos prouvé parking · ${agent.house}`}</title>
      <circle cx="0" cy="0" r="14" fill="#020617" stroke={ring} strokeWidth="2.1" opacity="0.96" />
      <path d="M-8 13 Q0 5 8 13 Z" fill={body} stroke={shade(body, -38)} strokeWidth="1.2" />
      <circle cx="0" cy="-3" r="7.2" fill={skin} stroke="#3f2412" strokeWidth="1" />
      <path d="M-7 -5 Q0 -14 8 -5 Q5 -10 0 -9 Q-5 -10 -7 -5 Z" fill={hair} />
      <circle cx="-2.4" cy="-3" r="0.9" fill="#020617" />
      <circle cx="2.4" cy="-3" r="0.9" fill="#020617" />
      <path d="M-2 2 Q0 3.8 2 2" fill="none" stroke="#7c2d12" strokeWidth="0.9" strokeLinecap="round" opacity="0.75" />
      {rank !== "agent" && <circle cx="8.8" cy="-10.6" r="3.2" fill={ring} stroke="#020617" strokeWidth="0.8" />}
    </g>
  );
}

function ParkTree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s.toFixed(2)})`} data-rest-park-tree="dofus-crown">
      <ellipse cx="0" cy="18" rx="22" ry="8" fill="#020617" opacity="0.22" />
      <path d="M-6 15 C-8 2 -6 -16 -1 -34 C6 -18 9 2 6 16 Z" fill="#6b4424" stroke="#2f1d0e" strokeWidth="2.6" />
      <ellipse cx="-18" cy="-38" rx="26" ry="22" fill="#2d6b43" stroke="#123422" strokeWidth="2.8" />
      <ellipse cx="14" cy="-44" rx="31" ry="25" fill="#3f7f4e" stroke="#153822" strokeWidth="2.8" />
      <ellipse cx="0" cy="-66" rx="27" ry="23" fill="#5a9a5c" stroke="#1f4c2f" strokeWidth="2.6" />
      <ellipse cx="28" cy="-30" rx="22" ry="18" fill="#28603c" stroke="#153822" strokeWidth="2.4" />
      <path d="M-18 -51 Q-4 -66 18 -58 M-7 -74 Q8 -82 24 -70 M9 -37 Q25 -45 38 -36" fill="none" stroke="#d9f99d" strokeWidth="2.2" strokeOpacity="0.28" strokeLinecap="round" />
    </g>
  );
}

function ParkBench({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} data-rest-park-bench="wood">
      <ellipse cx="0" cy="29" rx="56" ry="15" fill="#020617" opacity="0.24" />
      <rect x="-50" y="-20" width="100" height="18" rx="5" fill="url(#woodWarm)" stroke="#3f2412" strokeWidth="3" />
      <rect x="-48" y="3" width="96" height="16" rx="5" fill="#7c3f16" stroke="#3f2412" strokeWidth="2.6" />
      <line x1="-38" y1="19" x2="-43" y2="42" stroke="#2b1709" strokeWidth="4" strokeLinecap="round" />
      <line x1="38" y1="19" x2="43" y2="42" stroke="#2b1709" strokeWidth="4" strokeLinecap="round" />
      <path d="M-43 -12 H43 M-42 11 H42" stroke="#fbbf24" strokeWidth="1.2" strokeOpacity="0.45" />
    </g>
  );
}

function PicnicTable({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} data-rest-park-table="picnic">
      <ellipse cx="0" cy="39" rx="70" ry="18" fill="#020617" opacity="0.22" />
      <rect x="-56" y="-11" width="112" height="25" rx="7" fill="url(#woodWarm)" stroke="#3f2412" strokeWidth="3" />
      <rect x="-66" y="-38" width="132" height="13" rx="6" fill="#78350f" stroke="#fbbf24" strokeWidth="2.2" />
      <rect x="-66" y="33" width="132" height="13" rx="6" fill="#78350f" stroke="#fbbf24" strokeWidth="2.2" />
      <line x1="-33" y1="15" x2="-48" y2="50" stroke="#3f2412" strokeWidth="4" strokeLinecap="round" />
      <line x1="33" y1="15" x2="48" y2="50" stroke="#3f2412" strokeWidth="4" strokeLinecap="round" />
      <circle cx="-22" cy="1" r="5" fill="#ecfeff" opacity="0.9" />
      <circle cx="18" cy="2" r="5" fill="#fb7185" opacity="0.86" />
    </g>
  );
}

function ParkLamp({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} data-rest-park-lamp="warm">
      <ellipse cx="0" cy="10" rx="7" ry="2.2" fill="#020617" opacity="0.26" />
      <line x1="0" y1="9" x2="0" y2="-38" stroke="#4b3621" strokeWidth="3" />
      <path d="M0 -38 Q16 -40 18 -25" fill="none" stroke="#4b3621" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="18" cy="-23" r="18" fill="url(#lglow)" opacity="0.78" />
      <rect x="12" y="-30" width="12" height="14" rx="3" fill="#221407" stroke="#caa14a" strokeWidth="2" />
      <rect x="15" y="-27" width="6" height="8" rx="1.5" fill="#ffd98a" opacity="0.88" />
    </g>
  );
}

function BarbecueGrill({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} data-rest-park-barbecue="lit">
      <ellipse cx="0" cy="48" rx="72" ry="20" fill="#020617" opacity="0.3" />
      <rect x="-52" y="-18" width="104" height="54" rx="10" fill="#1f2937" stroke="#94a3b8" strokeWidth="4" />
      <line x1="-39" y1="0" x2="39" y2="0" stroke="#cbd5e1" strokeWidth="3.5" />
      <line x1="-39" y1="11" x2="39" y2="11" stroke="#cbd5e1" strokeWidth="2.7" opacity="0.74" />
      <path d="M-16 31 Q0 2 16 31 Q0 47 -16 31 Z" fill="#fb923c" opacity="0.86" />
      <path className="cof-rest-smoke" d="M-32 -25 Q-50 -55 -26 -76 M0 -30 Q-14 -62 10 -86 M35 -25 Q20 -55 45 -76" fill="none" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.46" />
      <line x1="-34" y1="36" x2="-50" y2="82" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
      <line x1="34" y1="36" x2="50" y2="82" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
    </g>
  );
}

function RealParkingLot({
  activeCount,
  agents,
  idleCount,
  park,
  proofCount,
  queuedCount,
}: {
  activeCount: number;
  agents: VisibleAgent[];
  idleCount: number;
  park: { wx: number; wy: number; w: number; h: number; anchorHouseId?: string };
  proofCount: number;
  queuedCount: number;
}) {
  const ground = [
    isoProject(park.wx - park.w, park.wy - park.h),
    isoProject(park.wx + park.w, park.wy - park.h),
    isoProject(park.wx + park.w, park.wy + park.h),
    isoProject(park.wx - park.w, park.wy + park.h),
  ].map((p) => ({ x: p.sx, y: p.sy }));
  const c = centroid(ground);
  const carColors = ["#e5e7eb", "#111827", "#ef4444", "#2563eb", "#f59e0b", "#16a34a", "#64748b", "#9333ea"];
  const parkAgents = (agents.filter((item) => item.state === "idle").length ? agents.filter((item) => item.state === "idle") : agents).slice(0, 8);
  const parkedVehicles = [
    [-334, -72, -8, "car"], [-237, -88, -8, "moto"], [-124, -89, -8, "car"], [-15, -80, -8, "quad"],
    [-283, 102, 172, "car"], [-174, 115, 172, "horse"], [-66, 107, 172, "car"], [43, 100, 172, "moto"],
  ] as const;
  const rideSlots = [
    [214, -126, -18, "moto"], [350, -72, 11, "horse"], [256, 72, -10, "car"],
  ] as const;
  const stallXs = [-400, -300, -200, -100, 0, 100, 200, 300];
  const treeSlots = [
    [-520, -210, 0.78], [-560, 84, 0.68], [-390, 230, 0.72], [116, -246, 0.74], [470, -190, 0.82], [548, 96, 0.7], [298, 244, 0.76],
  ] as const;
  return (
    <g
      data-real-parking-lot="dofus-park-road-connected"
      data-rest-park-map="parking-bbq-benches-mounts"
      data-attached-house={park.anchorHouseId ?? "map"}
      data-idle-count={idleCount}
      data-active-proof-count={activeCount}
      data-queued-orders-count={queuedCount}
      data-proof-count={proofCount}
      pointerEvents="none"
      transform={`translate(${(c.x + 112).toFixed(1)} ${(c.y + 18).toFixed(1)}) rotate(-7) scale(1.82)`}
      opacity="0.96"
    >
      <title>{`Parking parc connecte · repos ${idleCount} · actifs ${activeCount} · ordres ${queuedCount}`}</title>
      <ellipse cx="0" cy="176" rx="646" ry="88" fill="#020617" opacity="0.34" />
      <path d="M-555 -246 Q-326 -338 25 -306 Q392 -302 586 -112 Q574 178 278 270 Q-272 322 -595 144 Q-646 -78 -555 -246 Z" fill="url(#parkGrass)" stroke="#164e31" strokeWidth="7" />
      <path d="M-534 -220 Q-320 -290 30 -270 Q358 -260 536 -94 Q522 134 256 226 Q-236 286 -552 118 Q-604 -64 -534 -220 Z" fill="none" stroke="#d9f99d" strokeWidth="2.4" strokeDasharray="9 14" strokeOpacity="0.25" />
      <path d="M-506 -124 L-64 -166 Q178 -152 296 -52 L254 128 Q-20 184 -474 134 Q-548 18 -506 -124 Z" fill="url(#parkingAsphalt)" stroke="#d1d5db" strokeWidth="5" strokeOpacity="0.84" />
      <path d="M-462 8 H246" stroke="#f8fafc" strokeWidth="5" strokeDasharray="25 20" strokeLinecap="round" opacity="0.72" />
      <path d="M-74 -5 L34 12 L-74 30 M-154 12 H14" fill="none" stroke="#facc15" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.88" />
      <path d="M-470 -118 H235 M-458 142 H215" stroke="#e5e7eb" strokeWidth="4" opacity="0.88" />
      {stallXs.map((x) => (
        <g key={`real-parking-stall-${x}`}>
          <path d={`M ${x} -114 L ${x - 34} -22`} stroke="#f8fafc" strokeWidth="3.6" opacity="0.86" />
          <path d={`M ${x} 138 L ${x + 32} 48`} stroke="#f8fafc" strokeWidth="3.6" opacity="0.86" />
        </g>
      ))}
      <rect x="-482" y="-116" width="82" height="70" rx="6" fill="#1d4ed8" opacity="0.28" />
      <text x="-441" y="-70" textAnchor="middle" fontSize="36" fontWeight="900" fill="#dbeafe" opacity="0.92">P</text>
      {parkedVehicles.map(([x, y, rot, kind], idx) => (
        <g key={`real-parking-vehicle-${idx}`} transform={`translate(${x} ${y}) rotate(${rot}) scale(0.58)`} data-mountable-vehicle={kind}>
          <ParkVehicle kind={kind as ParkVehicleKind} color={carColors[idx % carColors.length]} accent="#e0f2fe" scale={0.72} />
          {parkAgents[idx]?.agent && <ParkingAgentOwner agent={parkAgents[idx].agent} accent="#facc15" />}
        </g>
      ))}
      <path d="M-34 118 C52 172 150 162 245 82 S422 -18 526 -70" fill="none" stroke="#020617" strokeWidth="30" strokeLinecap="round" opacity="0.34" />
      <path d="M-34 118 C52 172 150 162 245 82 S422 -18 526 -70" fill="none" stroke="url(#paving)" strokeWidth="22" strokeLinecap="round" opacity="0.96" />
      <path d="M-34 118 C52 172 150 162 245 82 S422 -18 526 -70" fill="none" stroke="#f8fafc" strokeWidth="1.2" strokeDasharray="4 15" strokeLinecap="round" opacity="0.32" />
      <g transform="translate(390 -92)" data-mount-station="horse-moto-car">
        <ellipse cx="0" cy="58" rx="116" ry="30" fill="#020617" opacity="0.24" />
        <path d="M-106 14 H106" stroke="#7c3f16" strokeWidth="8" strokeLinecap="round" />
        {[-76, -26, 24, 74].map((x) => <line key={x} x1={x} y1="15" x2={x} y2="68" stroke="#3f2412" strokeWidth="6" strokeLinecap="round" />)}
        <text x="0" y="-7" textAnchor="middle" fontSize="16" fontWeight="950" fill="#fef3c7" stroke="#3f2412" strokeWidth="3" paintOrder="stroke">MONTURES</text>
      </g>
      {rideSlots.map(([x, y, rot, kind], idx) => (
        <g key={`mounted-route-${idx}`} transform={`translate(${x} ${y}) rotate(${rot}) scale(0.52)`} data-mounted-route={kind}>
          <ParkVehicle kind={kind as ParkVehicleKind} color={carColors[(idx + 3) % carColors.length]} accent="#facc15" scale={0.82} />
          {parkAgents[idx + 3]?.agent && <ParkingAgentOwner agent={parkAgents[idx + 3].agent} accent="#facc15" />}
        </g>
      ))}
      <g data-rest-park-zone="bbq-benches-trees">
        {treeSlots.map(([x, y, s], idx) => <ParkTree key={`park-tree-${idx}`} x={x} y={y} s={s} />)}
        <ParkLamp x={-528} y={-92} />
        <ParkLamp x={82} y={-190} />
        <ParkLamp x={516} y={18} />
        <PicnicTable x={214} y={178} rot={-10} />
        <PicnicTable x={438} y={128} rot={13} />
        <ParkBench x={118} y={36} rot={-16} />
        <ParkBench x={352} y={16} rot={12} />
        <ParkBench x={490} y={190} rot={-10} />
        <BarbecueGrill x={540} y={-6} />
      </g>
      <g transform="translate(-124 -212)" data-parking-park-sign="visible">
        <rect x="-106" y="-28" width="212" height="56" rx="9" fill="#020617" stroke="#f8fafc" strokeWidth="3" opacity="0.94" />
        <text x="0" y="-3" textAnchor="middle" fontSize="19" fontWeight="950" fill="#f8fafc">PARKING PARC</text>
        <text x="0" y="17" textAnchor="middle" fontSize="11" fontWeight="850" fill="#bfdbfe">{idleCount} repos · {proofCount} preuve · {queuedCount} ordre</text>
      </g>
    </g>
  );
}

function _LeisurePark({
  activeCount,
  agents,
  idleCount,
  park,
  proofCount,
  queuedCount,
}: {
  activeCount: number;
  agents: VisibleAgent[];
  idleCount: number;
  park: { wx: number; wy: number; w: number; h: number };
  proofCount: number;
  queuedCount: number;
}) {
  const ground = [
    isoProject(park.wx - park.w, park.wy - park.h),
    isoProject(park.wx + park.w, park.wy - park.h),
    isoProject(park.wx + park.w, park.wy + park.h),
    isoProject(park.wx - park.w, park.wy + park.h),
  ].map((p) => ({ x: p.sx, y: p.sy }));
	  const c = centroid(ground);
	  const parking = { x: c.x - 465, y: c.y - 132 };
	  const pool = { x: c.x + 660, y: c.y + 72 };
	  const grill = { x: c.x + 870, y: c.y + 142 };
	  const clubhouse = { x: c.x + 178, y: c.y - 344 };
	  const canteen = { x: c.x + 392, y: c.y - 118 };
	  const benchSlots = [
	    [196, -178, -18], [420, -210, -10], [664, -142, 12], [846, -22, 18], [782, 204, -16],
	    [560, 248, 8], [338, 208, -12], [222, 96, 16], [512, 42, -18], [718, 78, 14],
	  ] as const;
	  const treeSlots = [
	    [-650, -246, 1.02], [-590, 180, 0.92], [-362, 314, 1.04], [-92, 334, 0.9], [172, 320, 1.08], [720, 266, 0.96],
	    [-704, -34, 0.95], [-332, -334, 1.06], [74, -392, 0.9], [390, -330, 1.1], [812, -174, 0.94], [1006, 28, 1.02],
	  ] as const;
	  const lampSlots = [
	    [-610, -196], [-608, 92], [-432, 300], [-76, 326], [274, 306], [748, 190], [724, -166], [210, -350], [-294, -292],
	  ] as const;
	  const tableSlots = [
	    [590, -78, -14], [782, 20, 8], [694, 236, -8], [410, 166, 12],
	  ] as const;
  const idleParkAgents = agents.filter((item) => item.state === "idle");
  const parkAgents = idleParkAgents.slice(0, 48);
  const vehicleKinds: ParkVehicleKind[] = ["car", "moto", "quad", "horse"];
  const fallbackColors = ["#38bdf8", "#f97316", "#a78bfa", "#f43f5e", "#22c55e", "#facc15"];
	  const vehicleSlots = parkAgents.map((item, idx) => {
	    const col = idx % 10;
	    const row = Math.floor(idx / 10);
	    const rank = rankFor(item.agent);
	    return {
      accent: item.agent.colorAccent || "#67e8f9",
      color: item.agent.colorPrimary || fallbackColors[idx % fallbackColors.length],
      item,
      kind: vehicleKinds[(idx + (rank === "crown" ? 0 : rank === "diadem" ? 1 : rank === "captain" ? 2 : 3)) % vehicleKinds.length],
	      rot: -8 + (idx % 3) * 2,
	      scale: rank === "crown" ? 0.86 : rank === "diadem" ? 0.82 : rank === "captain" ? 0.78 : 0.74,
	      x: -558 + col * 124 + (row % 2) * 34,
	      y: -98 + row * 88,
	    };
	  });
	  return (
	    <g data-leisure-park-map="ready" data-idle-count={idleCount} data-active-proof-count={activeCount} data-queued-orders-count={queuedCount} data-rest-vehicles={parkAgents.length} data-rest-vehicle-source="idle-only" pointerEvents="none">
	      <polygon points={ground.map(P).join(" ")} fill="#123c34" stroke="#5eead4" strokeWidth="1.35" strokeOpacity="0.48" opacity="0.95" />
	      <polygon points={insetTowards(ground, 0.08).map(P).join(" ")} fill="url(#grassPatch)" opacity="0.9" />
	      <path d={`M ${P(lerpPt(ground[3], ground[2], 0.22))} Q ${(c.x - 190).toFixed(1)} ${(c.y - 86).toFixed(1)} ${(c.x + 42).toFixed(1)} ${(c.y - 60).toFixed(1)} T ${P(lerpPt(ground[0], ground[1], 0.76))}`} fill="none" stroke="#a7f3d0" strokeWidth="10" strokeLinecap="round" opacity="0.12" />
	      <path d={`M ${P(lerpPt(ground[0], ground[3], 0.42))} Q ${(c.x + 68).toFixed(1)} ${(c.y + 132).toFixed(1)} ${P(lerpPt(ground[1], ground[2], 0.58))}`} fill="none" stroke="#99f6e4" strokeWidth="6" strokeLinecap="round" opacity="0.13" />
	      <ellipse cx={(pool.x + 30).toFixed(1)} cy={(pool.y + 48).toFixed(1)} rx="410" ry="168" fill="#6b735f" opacity="0.2" />
	      <path d={`M ${(parking.x + 476).toFixed(1)} ${(parking.y + 330).toFixed(1)} C ${(c.x + 22).toFixed(1)} ${(c.y + 210).toFixed(1)} ${(c.x + 362).toFixed(1)} ${(c.y + 108).toFixed(1)} ${(pool.x - 170).toFixed(1)} ${(pool.y + 42).toFixed(1)} S ${(grill.x - 64).toFixed(1)} ${(grill.y + 82).toFixed(1)} ${(grill.x + 36).toFixed(1)} ${(grill.y + 86).toFixed(1)}`} fill="none" stroke="#e2e8f0" strokeWidth="28" strokeLinecap="round" opacity="0.1" />
	      <path d={`M ${(parking.x + 476).toFixed(1)} ${(parking.y + 330).toFixed(1)} C ${(c.x + 22).toFixed(1)} ${(c.y + 210).toFixed(1)} ${(c.x + 362).toFixed(1)} ${(c.y + 108).toFixed(1)} ${(pool.x - 170).toFixed(1)} ${(pool.y + 42).toFixed(1)} S ${(grill.x - 64).toFixed(1)} ${(grill.y + 82).toFixed(1)} ${(grill.x + 36).toFixed(1)} ${(grill.y + 86).toFixed(1)}`} fill="none" stroke="#99f6e4" strokeWidth="4" strokeDasharray="10 12" strokeLinecap="round" opacity="0.24" />
	      <g transform={`translate(${parking.x.toFixed(1)} ${parking.y.toFixed(1)})`} data-rest-park-parking="vehicles" data-rest-vehicle-count={parkAgents.length}>
	        <ellipse cx="22" cy="366" rx="688" ry="108" fill="#020617" opacity="0.25" />
	        <path d="M-696 -168 H486 Q646 -168 718 -54 L668 390 Q354 460 -632 372 Q-760 172 -696 -168 Z" fill="#0f172a" stroke="#164e63" strokeWidth="10" opacity="0.76" />
	        <path d="M-664 -132 H462 Q592 -132 676 -42 L624 350 Q326 418 -600 338 Q-704 164 -664 -132 Z" fill="url(#paving)" stroke="#67e8f9" strokeWidth="3.4" opacity="0.9" />
	        <path d="M-612 340 C-286 210 184 216 620 322" fill="none" stroke="#020617" strokeWidth="36" strokeLinecap="round" opacity="0.54" />
	        <path d="M-612 340 C-286 210 184 216 620 322" fill="none" stroke="#7dd3fc" strokeWidth="2.8" strokeDasharray="12 18" strokeLinecap="round" opacity="0.28" />
	        {Array.from({ length: 40 }).map((_, idx) => {
	          const col = idx % 10;
	          const row = Math.floor(idx / 10);
	          return (
	            <rect
	              key={`parking-bay-${idx}`}
	              x={(-606 + col * 124 + (row % 2) * 34).toFixed(1)}
	              y={(-132 + row * 88).toFixed(1)}
	              width="96"
	              height="60"
	              rx="10"
	              fill="#020617"
	              stroke="#67e8f9"
	              strokeWidth="1.45"
	              strokeOpacity={idx < parkAgents.length ? 0.18 : 0.34}
	              opacity={idx < parkAgents.length ? 0.13 : 0.3}
	            />
	          );
	        })}
	        {vehicleSlots.map((slot, idx) => (
	          <g
	            key={`rest-vehicle-${slot.item.agent.id}`}
	            transform={`translate(${slot.x.toFixed(1)} ${slot.y.toFixed(1)}) rotate(${slot.rot})`}
	            data-rest-agent-vehicle-slot={idx + 1}
	            data-rest-agent-id={slot.item.agent.id}
	          >
	            <ParkVehicle kind={slot.kind} color={slot.color} accent={slot.accent} scale={slot.scale} />
	            <ParkingAgentOwner agent={slot.item.agent} accent={slot.accent} />
	          </g>
	        ))}
	        {parkAgents.length < idleCount && (
	          <g data-rest-vehicle-overflow={idleCount - parkAgents.length}>
	            {Array.from({ length: Math.min(8, idleCount - parkAgents.length) }).map((_, idx) => (
	              <circle key={`vehicle-overflow-${idx}`} cx={-132 + idx * 18} cy="304" r="5" fill="#67e8f9" opacity="0.42" />
	            ))}
	          </g>
	        )}
	      </g>
	      {lampSlots.map(([dx, dy], i) => {
	        const p = { x: c.x + dx, y: c.y + dy };
	        return (
	          <g key={`rest-lamp-${i}`} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`} data-rest-park-lamp="path-light">
	            <ellipse cx="0" cy="22" rx="18" ry="7" fill="#020617" opacity="0.24" />
	            <line x1="0" y1="18" x2="0" y2="-38" stroke="#64748b" strokeWidth="5" strokeLinecap="round" />
	            <path d="M-21 -36 Q0 -52 21 -36" fill="none" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" />
	            <circle cx="0" cy="-38" r="12" fill="url(#lglow)" opacity="0.55" />
	            <circle cx="0" cy="-38" r="4.2" fill="#fde68a" opacity="0.84" />
	          </g>
	        );
	      })}
	      <g transform={`translate(${clubhouse.x.toFixed(1)} ${clubhouse.y.toFixed(1)})`} data-rest-park-clubhouse="proofless-rest-amenity" data-rest-proof-count={proofCount} data-rest-queued-orders={queuedCount}>
	        <ellipse cx="82" cy="108" rx="192" ry="40" fill="#020617" opacity="0.22" />
	        <path d="M-56 -8 L244 -8 L204 -70 L-16 -70 Z" fill="#155e75" stroke="#a5f3fc" strokeWidth="4" opacity="0.96" />
	        <rect x="-24" y="-8" width="236" height="104" rx="14" fill="#16312f" stroke="#99f6e4" strokeWidth="3.4" />
	        <rect x="20" y="18" width="52" height="70" rx="8" fill="#07111d" stroke="#67e8f9" strokeWidth="2.4" opacity="0.86" />
	        <rect x="104" y="16" width="72" height="38" rx="8" fill="#0f766e" stroke="#ccfbf1" strokeWidth="2.2" opacity="0.92" />
	        <circle cx="196" cy="-34" r="11" fill={queuedCount > 0 ? "#fbbf24" : "#334155"} stroke="#020617" strokeWidth="2" opacity="0.82" />
	        <circle cx="222" cy="-34" r="11" fill={proofCount > 0 ? "#34d399" : "#334155"} stroke="#020617" strokeWidth="2" opacity="0.82" />
	      </g>
	      {treeSlots.map(([dx, dy, scale], i) => {
	        const p = { x: c.x + dx, y: c.y + dy };
	        return (
	          <g key={`rest-tree-${i}`} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${scale})`} data-rest-park-tree="shade">
	            <ellipse cx="0" cy="42" rx="31" ry="11" fill="#020617" opacity="0.24" />
	            <rect x="-7" y="-7" width="14" height="48" rx="4" fill="#7c4a22" stroke="#3f2412" strokeWidth="2" />
	            <ellipse cx="-15" cy="-18" rx="31" ry="28" fill="#166534" stroke="#86efac" strokeWidth="2.2" opacity="0.96" />
	            <ellipse cx="18" cy="-22" rx="34" ry="31" fill="#15803d" stroke="#bbf7d0" strokeWidth="2" opacity="0.96" />
	            <ellipse cx="0" cy="-44" rx="30" ry="27" fill="#22c55e" stroke="#dcfce7" strokeWidth="1.7" opacity="0.9" />
	          </g>
	        );
	      })}
	      <g transform={`translate(${canteen.x.toFixed(1)} ${canteen.y.toFixed(1)})`} data-rest-park-cafe="canteen">
	        <ellipse cx="92" cy="78" rx="176" ry="38" fill="#020617" opacity="0.25" />
	        <path d="M-60 0 L244 0 L210 -58 L-26 -58 Z" fill="#f97316" stroke="#fed7aa" strokeWidth="4" opacity="0.95" />
	        <rect x="-32" y="0" width="248" height="92" rx="12" fill="#3f2a16" stroke="#fef3c7" strokeWidth="4" />
	        <rect x="-6" y="22" width="78" height="40" rx="8" fill="#111827" stroke="#facc15" strokeWidth="3" opacity="0.9" />
	        <rect x="96" y="18" width="92" height="50" rx="8" fill="#0f766e" stroke="#99f6e4" strokeWidth="3" opacity="0.94" />
	        <path d="M126 38 h28 q0 14 -14 14 h-14 Z M154 42 h10 q0 11 -10 11" fill="none" stroke="#ecfeff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
	        <path className={idleCount > 0 ? "cof-rest-smoke" : undefined} d="M132 30 q-6 -10 2 -20 M144 30 q-6 -10 2 -20" fill="none" stroke="#ecfeff" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.5" />
	        <path d="M-66 88 L238 88" stroke="#fef3c7" strokeWidth="5" strokeLinecap="round" />
	        <circle cx="-8" cy="84" r="8" fill="#38bdf8" />
	        <circle cx="24" cy="84" r="8" fill="#fb7185" />
	        <circle cx="56" cy="84" r="8" fill="#facc15" />
	      </g>
	      <g transform={`translate(${pool.x.toFixed(1)} ${pool.y.toFixed(1)})`}>
	        <ellipse cx="0" cy="26" rx="210" ry="76" fill="#020617" opacity="0.35" />
	        <ellipse cx="0" cy="0" rx="196" ry="70" fill="url(#poolWater)" stroke="#bae6fd" strokeWidth="5" opacity="0.96" />
	        <path className={idleCount > 0 ? "cof-rest-water" : undefined} d="M-150 -4 Q-74 -32 0 -4 T150 -4 M-124 26 Q-34 4 42 26 T162 26" fill="none" stroke="#e0f2fe" strokeWidth="4" strokeOpacity="0.52" />
	        {[
	          [-204, -72, -18], [-204, 78, 18], [202, -70, 18], [202, 80, -18],
	        ].map(([dx, dy, rot], i) => (
	          <g key={`pool-lounger-${i}`} transform={`translate(${dx} ${dy}) rotate(${rot})`} data-rest-park-lounger="pool">
	            <ellipse cx="0" cy="18" rx="50" ry="13" fill="#020617" opacity="0.22" />
	            <rect x="-44" y="-14" width="88" height="24" rx="7" fill="#0f766e" stroke="#99f6e4" strokeWidth="2.5" />
	            <rect x="-44" y="-28" width="36" height="18" rx="5" fill="#f97316" stroke="#fed7aa" strokeWidth="2" />
	          </g>
	        ))}
      </g>
      <g transform={`translate(${grill.x.toFixed(1)} ${grill.y.toFixed(1)})`}>
        <ellipse cx="0" cy="42" rx="66" ry="20" fill="#020617" opacity="0.32" />
        <rect x="-48" y="-14" width="96" height="50" rx="9" fill="#1f2937" stroke="#94a3b8" strokeWidth="4" />
        <line x1="-36" y1="2" x2="36" y2="2" stroke="#cbd5e1" strokeWidth="3.5" />
	        <path d="M-12 32 Q0 2 12 32 Q0 44 -12 32 Z" fill="#fb923c" opacity="0.82" />
	        <path className={idleCount > 0 ? "cof-rest-smoke" : undefined} d="M-30 -22 Q-46 -50 -24 -72 M2 -28 Q-12 -58 10 -82 M34 -22 Q20 -52 42 -72" fill="none" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.45" />
	        <line x1="-32" y1="36" x2="-48" y2="80" stroke="#94a3b8" strokeWidth="4" />
	        <line x1="32" y1="36" x2="48" y2="80" stroke="#94a3b8" strokeWidth="4" />
	        <circle cx="-18" cy="94" r="7" fill="#fed7aa" opacity="0.82" />
	        <circle cx="0" cy="98" r="7" fill="#fb923c" opacity="0.82" />
	        <circle cx="18" cy="94" r="7" fill="#fed7aa" opacity="0.82" />
	      </g>
	      {tableSlots.map(([dx, dy, rot], i) => {
	        const p = { x: c.x + dx, y: c.y + dy };
	        return (
	          <g key={`canteen-table-${i}`} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${rot})`} data-rest-park-table="picnic">
	            <ellipse cx="0" cy="36" rx="66" ry="18" fill="#020617" opacity="0.22" />
	            <rect x="-52" y="-12" width="104" height="26" rx="7" fill="#b7791f" stroke="#422006" strokeWidth="3" />
	            <rect x="-60" y="-38" width="120" height="13" rx="6" fill="#78350f" stroke="#fbbf24" strokeWidth="2.4" />
	            <rect x="-60" y="32" width="120" height="13" rx="6" fill="#78350f" stroke="#fbbf24" strokeWidth="2.4" />
	            <line x1="-32" y1="14" x2="-46" y2="48" stroke="#422006" strokeWidth="4" />
	            <line x1="32" y1="14" x2="46" y2="48" stroke="#422006" strokeWidth="4" />
	            <circle cx="-22" cy="0" r="5" fill="#ecfeff" opacity="0.9" />
	            <circle cx="18" cy="1" r="5" fill="#fb7185" opacity="0.86" />
	          </g>
	        );
	      })}
	      {benchSlots.map(([dx, dy, rot], i) => {
	        const p = { x: c.x + dx, y: c.y + dy };
	        return (
	          <g key={`bench-${i}`} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${rot})`}>
            <ellipse cx="0" cy="24" rx="54" ry="16" fill="#020617" opacity="0.24" />
            <rect x="-50" y="-18" width="100" height="26" rx="6" fill="#8a5428" stroke="#3f2412" strokeWidth="3" />
            <line x1="-38" y1="11" x2="-38" y2="35" stroke="#3f2412" strokeWidth="3.5" />
            <line x1="38" y1="11" x2="38" y2="35" stroke="#3f2412" strokeWidth="3.5" />
          </g>
        );
      })}
    </g>
  );
}

function Building({ b, status, activity, mission, missionQuality, truthSources, selected, hover, dim, editMode, machines, assetCount, agentCount, onSelect, onDirectSelect, onHover, onMachine }: { b: Built; status: string; activity: HouseActivity; mission?: HouseMissionRecord | null; missionQuality?: MissionQuality | null; truthSources: TruthSource[]; selected: boolean; hover: boolean; dim: boolean; editMode: boolean; machines: WorldMachine[]; assetCount: number; agentCount: number; onSelect: () => void; onDirectSelect: () => void; onHover: (v: boolean) => void; onMachine: (m: WorldMachine) => void }) {
  const h = b.house; const st = houseStatusStyle(status); const ground = b.ground; const bodyGround = structuralGround(h, ground); const bodyH = b.height; const cx = b.base.x; const roofY = b.base.y - bodyH;
  const focus = selected || hover; const alert = status === "SOURCE_DOWN" || status === "DEGRADED" || status === "ERR";
  const body = block(bodyGround, bodyH);
  const cols = Math.max(2, Math.round(h.w * 0.55)); const rows = Math.max(3, Math.min(6, h.levels)); const seed = h.id.length + Math.round(h.x) + Math.round(h.y);
  const leftWin = faceWindows(bodyGround[3], bodyGround[2], body.top[3], body.top[2], cols, rows, seed);
  const rightWin = faceWindows(bodyGround[1], bodyGround[2], body.top[1], body.top[2], cols, rows, seed + 3);
  const stepped = h.roof === "stepped"; const upper = stepped ? block(insetTowards(body.top, 0.3), bodyH * 0.55) : null;
  // toits respectés par métier : pitch = volume maison, flat/saw/dome = sculpture métier.
  const TOWER = h.type === "command_tower" || h.type === "signal_tower" || h.type === "brain" || h.type === "observatory";
  const landmark = isLandmarkType(h.type);
	  const peaked = h.roof === "pitch" && !TOWER; const roofH = peaked ? Math.min(38, h.w * 4 + 16) : 0; const peak = { x: cx, y: roofY - roofH };
	  const apex = stepped && upper ? { x: cx, y: upper.top[0].y - (upper.top[2].y - upper.top[0].y) / 2 } : peaked ? peak : { x: cx, y: roofY };
	  const doorBL = lerpPt(bodyGround[1], bodyGround[2], 0.58), doorBR = lerpPt(bodyGround[1], bodyGround[2], 0.82);
	  const doorTL = { x: doorBL.x, y: doorBL.y - bodyH * 0.2 }, doorTR = { x: doorBR.x, y: doorBR.y - bodyH * 0.2 };
	  const frontMid = lerpPt(bodyGround[1], bodyGround[2], 0.5);
	  const signY = apex.y - (h.roof === "dome" ? 30 : 20);
  // parcelle (socle dallé)
  const parcel = insetTowards(ground, -0.28); const lift = 7; const parcelFront = [parcel[3], parcel[2]].map((p) => ({ x: p.x, y: p.y + lift }));
  const leftWall = shade(h.wall, 22), rightWall = shade(h.wall, -10), wallEdge = shade(h.wall, -42);
  const windowOn = focus ? h.accent : "#b7e8ff";
  const slab = focus ? st.color : "#4b6470";
  const queueCount = mission?.localQueue?.dispatches ?? 0;
  const missionColor = missionTone(mission?.mission.proofStatus ?? mission?.status);
  const missionSegments = Math.min(5, Math.max(1, Math.ceil(queueCount / 2)));
  const missionCoreX = (doorTL.x + doorTR.x) / 2;
  const missionCoreY = doorTL.y - 6;
  const quality = missionQuality ?? null;
  const houseTools = machines
    .map((m) => detectToolBadge(`${m.id} ${m.label} ${m.role ?? ""} ${m.proof ?? ""}`, h.id))
    .filter((tool): tool is ToolBadge => Boolean(tool))
    .filter((tool, idx, list) => list.findIndex((other) => other.key === tool.key) === idx)
    .slice(0, 4);
  const visibleNeighborhoodMachines = machines.slice(0, 10).map((machine) => ({ machine, badge: badgeForMachine(machine, h.id) }));
  const extraMachineCount = Math.max(0, machines.length - visibleNeighborhoodMachines.length);
  const dockSlots = visibleNeighborhoodMachines.length + (assetCount > 0 ? 1 : 0) + (extraMachineCount > 0 ? 1 : 0);
  const dockCols = Math.min(5, Math.max(1, dockSlots));
  const dockStartX = cx - ((dockCols - 1) * 31) / 2;
  const dockBaseY = b.base.y + 22;
  const dockRowGap = 20;
  const dockPanelBottomY = dockBaseY + Math.ceil(dockSlots / dockCols) * dockRowGap + 6;

  return (
    <g data-house={h.id} data-structural-building={h.type} data-structure-core-inset={structureProfile(h).coreInset} style={{ cursor: editMode ? "grab" : "pointer" }} opacity={dim ? 0.7 : 1} onClick={(e) => { e.stopPropagation(); onSelect(); }} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <polygon
        data-house-hitbox={h.id}
        points={insetTowards(parcel, -0.44).map(P).join(" ")}
        fill="transparent"
        opacity={0}
        pointerEvents="all"
        onPointerDown={(e) => { e.stopPropagation(); if (!editMode) onDirectSelect(); }}
        onClick={(e) => { e.stopPropagation(); if (editMode) onSelect(); else onDirectSelect(); }}
      />
      <ellipse cx={cx} cy={b.base.y + 7} rx={h.w * 8.6 * structureProfile(h).shadow} ry={h.w * 3.8 * structureProfile(h).shadow} fill="#000" opacity="0.38" />
      {/* poignée de déplacement (mode édition) */}
      {editMode && <polygon points={insetTowards(parcel, -0.14).map(P).join(" ")} fill="none" stroke="#fbbf24" strokeWidth="1.6" strokeDasharray="4 3" opacity="0.85" />}
      {/* parcelle */}
      <polygon points={[parcel[3], parcel[2], parcelFront[1], parcelFront[0]].map(P).join(" ")} fill="#111827" opacity="0.92" />
      <polygon points={parcel.map(P).join(" ")} fill="#1f2933" stroke={slab} strokeWidth={focus ? 1.7 : 0.8} strokeOpacity={focus ? 0.95 : 0.48} />
      <polygon points={insetTowards(parcel, 0.12).map(P).join(" ")} fill="none" stroke="#7dd3fc" strokeWidth="0.55" strokeDasharray="3 6" opacity={focus ? 0.34 : 0.14} />
      {/* corps */}
      {/* façades data-center : verre sombre + accent maison */}
      <polygon points={body.leftStr} fill={leftWall} />
      <polygon points={body.rightStr} fill={rightWall} />
      <polygon points={body.leftStr} fill="#ffffff" opacity="0.045" />
      <polygon points={body.rightStr} fill="#000000" opacity="0.14" />
      {!landmark && leftWin.map((w, i) => <polygon key={`lw${i}`} points={w.pts} fill={w.lit ? windowOn : "#06111f"} opacity={w.lit ? (focus ? 0.88 : 0.55) : 0.62} />)}
      {!landmark && rightWin.map((w, i) => <polygon key={`rw${i}`} points={w.pts} fill={w.lit ? shade(windowOn, -20) : "#020617"} opacity={w.lit ? (focus ? 0.76 : 0.45) : 0.66} />)}
	      <polygon points={body.leftStr} fill="none" stroke={wallEdge} strokeWidth="0.8" opacity="0.62" />
	      <polygon points={body.rightStr} fill="none" stroke={wallEdge} strokeWidth="0.8" opacity="0.5" />
	      {(
	        <g data-dofus-wall-relief={h.id} pointerEvents="none" opacity={focus ? 0.84 : 0.58}>
	          {[0.16, 0.36, 0.58, 0.8].map((u, i) => {
	            const base = lerpPt(bodyGround[3], bodyGround[2], u);
	            const top = lerpPt(body.top[3], body.top[2], u);
	            return <line key={`left-relief-${i}`} x1={base.x.toFixed(1)} y1={base.y.toFixed(1)} x2={top.x.toFixed(1)} y2={top.y.toFixed(1)} stroke="#fef3c7" strokeWidth="0.7" strokeOpacity="0.16" />;
	          })}
	          {[0.2, 0.42, 0.64, 0.84].map((u, i) => {
	            const base = lerpPt(bodyGround[1], bodyGround[2], u);
	            const top = lerpPt(body.top[1], body.top[2], u);
	            return <line key={`right-relief-${i}`} x1={base.x.toFixed(1)} y1={base.y.toFixed(1)} x2={top.x.toFixed(1)} y2={top.y.toFixed(1)} stroke="#020617" strokeWidth="1" strokeOpacity="0.22" />;
	          })}
	          {[0.32, 0.57, 0.78].map((v, i) => {
	            const y = frontMid.y - bodyH * v;
	            return <path key={`front-band-${i}`} d={`M ${(cx - h.w * 6.1).toFixed(1)} ${y.toFixed(1)} Q ${cx.toFixed(1)} ${(y - 5).toFixed(1)} ${(cx + h.w * 6.1).toFixed(1)} ${y.toFixed(1)}`} fill="none" stroke="#fef3c7" strokeWidth="0.75" strokeOpacity="0.2" />;
	          })}
	        </g>
	      )}
	      {[0.28, 0.5, 0.72].map((u, i) => { const a = lerpPt(bodyGround[1], bodyGround[2], u); const t = lerpPt(body.top[1], body.top[2], u); return <line key={`bm${i}`} x1={a.x.toFixed(1)} y1={a.y.toFixed(1)} x2={t.x.toFixed(1)} y2={t.y.toFixed(1)} stroke={h.accent} strokeWidth={focus ? 0.9 : 0.55} opacity={focus ? 0.34 : 0.18} />; })}
      <path d={`M ${P(doorBL)} L ${P(doorBR)} L ${P(doorTR)} Q ${(((doorTL.x + doorTR.x) / 2)).toFixed(1)} ${(((doorTL.y + doorTR.y) / 2) - bodyH * 0.06).toFixed(1)} ${P(doorTL)} Z`} fill="#020617" stroke={h.accent} strokeWidth="1.05" strokeOpacity={focus ? 0.95 : 0.58} />
      {landmark
        ? <LandmarkFacade h={h} ground={bodyGround} body={body} bodyH={bodyH} roofY={roofY} cx={cx} focus={focus} />
        : <ProfessionFacade h={h} ground={bodyGround} body={body} bodyH={bodyH} roofY={roofY} cx={cx} focus={focus} />}
      {activity.state !== "idle" && (
        <ActivityGlyph
          state={activity.state}
          x={(doorTL.x + doorTR.x) / 2}
          y={doorTL.y - 10}
          color={activity.state === "alert" ? st.color : h.accent}
        />
      )}
      {mission && (
        <g data-building-order={h.id} data-house-mission-core={h.id} data-order-kind={isLocalDispatchMission(mission) ? "local-dispatch" : isRuntimeMission(mission) ? "runtime-proof" : "source-only"} pointerEvents="none">
          <title>{`${h.name} · ${mission.mission.title} · ${quality ? `qualité ${quality.score}/100 · ${quality.verdict}` : "qualité non calculée"} · ${queueCount} ordre(s) locaux · ${mission.mission.proofStatus ?? mission.status}`}</title>
          <polygon points={insetTowards([doorTL, doorTR, doorBR, doorBL], -0.18).map(P).join(" ")} fill={missionColor} opacity={queueCount > 0 ? 0.1 : 0.04} />
          <g transform={`translate(${missionCoreX.toFixed(1)} ${missionCoreY.toFixed(1)})`}>
            <rect x="-8" y="-5.5" width="16" height="11" rx="2" fill="#020617" stroke={missionColor} strokeWidth="0.85" opacity="0.92" />
            <rect x="-5.8" y="-3.4" width="11.6" height="6.8" rx="1.2" fill={missionColor} opacity={queueCount > 0 ? 0.12 : 0.05} />
            {[0, 1, 2, 3, 4].map((idx) => (
              <line
                key={`mission-seg-${idx}`}
                x1={(-4.8 + idx * 2.4).toFixed(1)}
                y1="-2.7"
                x2={(-4.8 + idx * 2.4).toFixed(1)}
                y2="2.7"
                stroke={missionColor}
                strokeWidth="1.05"
                opacity={idx < missionSegments ? 0.9 : 0.2}
              />
            ))}
          </g>
          {quality && (
            <g transform={`translate(${(missionCoreX + 22).toFixed(1)} ${(missionCoreY - 1).toFixed(1)})`} data-proof-ledger-quality-score={quality.score}>
              <rect x="-13" y="-6" width="26" height="12" rx="3" fill="#020617" stroke={quality.tone} strokeWidth="0.9" opacity="0.96" />
              <text x="0" y="3" textAnchor="middle" fontSize="6.4" fontWeight="950" fill={quality.tone}>Q{quality.score}</text>
            </g>
          )}
        </g>
      )}
      {peaked ? (<>
        {/* toiture premium : couleur maison, arêtes nettes, pas de rendu médiéval beige */}
        <polygon points={`${P(body.top[3])} ${P(body.top[0])} ${peak.x.toFixed(1)},${peak.y.toFixed(1)}`} fill={shade(h.roofColor, -18)} stroke={shade(h.roofColor, -46)} strokeWidth="0.7" strokeLinejoin="round" />
        <polygon points={`${P(body.top[0])} ${P(body.top[1])} ${peak.x.toFixed(1)},${peak.y.toFixed(1)}`} fill={shade(h.roofColor, -8)} stroke={shade(h.roofColor, -42)} strokeWidth="0.7" strokeLinejoin="round" />
        <polygon points={`${P(body.top[1])} ${P(body.top[2])} ${peak.x.toFixed(1)},${peak.y.toFixed(1)}`} fill={shade(h.roofColor, 18)} stroke={shade(h.roofColor, -28)} strokeWidth="0.7" strokeLinejoin="round" />
        <polygon points={`${P(body.top[2])} ${P(body.top[3])} ${peak.x.toFixed(1)},${peak.y.toFixed(1)}`} fill={shade(h.roofColor, 4)} stroke={shade(h.roofColor, -32)} strokeWidth="0.7" strokeLinejoin="round" />
        {[body.top[1], body.top[2], body.top[3]].map((c, i) => <line key={`rg${i}`} x1={c.x.toFixed(1)} y1={c.y.toFixed(1)} x2={peak.x.toFixed(1)} y2={peak.y.toFixed(1)} stroke={h.accent} strokeWidth="0.7" opacity={focus ? 0.58 : 0.34} />)}
        <circle cx={peak.x} cy={peak.y} r="1.5" fill={h.accent} opacity="0.92" />
      </>) : (<>
        <polygon points={body.roofPoly} fill={h.roofColor} />
        <polygon points={body.roofPoly} fill="url(#roofSheen)" />
        <polygon points={body.roofPoly} fill="none" stroke={h.accent} strokeWidth={focus ? 1.8 : 1.05} opacity={focus ? 0.95 : 0.72} />
        {[0.28, 0.52, 0.76].map((v, i) => { const a = lerpPt(body.top[3], body.top[0], v); const c = lerpPt(body.top[2], body.top[1], v); return <line key={`sh${i}`} x1={a.x.toFixed(1)} y1={a.y.toFixed(1)} x2={c.x.toFixed(1)} y2={c.y.toFixed(1)} stroke={h.accent} strokeWidth="0.65" opacity={focus ? 0.44 : 0.22} />; })}
      </>)}
      <polyline points={`${P(body.top[1])} ${P(body.top[2])} ${P(body.top[3])}`} fill="none" stroke="#020617" strokeWidth="2.4" strokeOpacity="0.6" strokeLinejoin="round" strokeLinecap="round" />
	      {stepped && upper && !landmark && (<><polygon points={upper.leftStr} fill={shade(h.wall, 18)} /><polygon points={upper.rightStr} fill={shade(h.wall, -12)} /><polygon points={upper.roofPoly} fill={h.roofColor} /><polygon points={upper.roofPoly} fill="url(#roofSheen)" /><polygon points={upper.roofPoly} fill="none" stroke={h.accent} strokeWidth="1.2" opacity="0.86" /></>)}
	      {(
	        <g data-dofus-building-details={h.id} pointerEvents="none">
	          <path d={`M ${P(body.top[3])} L ${P(body.top[0])} M ${P(body.top[1])} L ${P(body.top[2])} M ${P(body.top[2])} L ${P(body.top[3])}`} fill="none" stroke="#fef3c7" strokeWidth={focus ? 2.1 : 1.35} strokeOpacity={focus ? 0.68 : 0.38} strokeLinecap="round" />
	          <polygon points={`${(doorTL.x - 10).toFixed(1)},${(doorTL.y - 4).toFixed(1)} ${(doorTR.x + 9).toFixed(1)},${(doorTR.y - 4).toFixed(1)} ${(doorTR.x + 3).toFixed(1)},${(doorTR.y - 19).toFixed(1)} ${(doorTL.x - 5).toFixed(1)},${(doorTL.y - 18).toFixed(1)}`} fill={shade(h.roofColor, 8)} stroke={shade(h.roofColor, -42)} strokeWidth="1.1" opacity="0.96" />
	          <path d={`M ${(doorTL.x - 8).toFixed(1)} ${(doorTL.y - 7).toFixed(1)} Q ${missionCoreX.toFixed(1)} ${(doorTL.y - 20).toFixed(1)} ${(doorTR.x + 7).toFixed(1)} ${(doorTR.y - 7).toFixed(1)}`} fill="none" stroke="#fef3c7" strokeWidth="1.1" strokeOpacity="0.48" />
	          <g transform={`translate(${(cx + h.w * 4.9).toFixed(1)} ${(frontMid.y - bodyH * 0.18).toFixed(1)})`} opacity={focus ? 0.94 : 0.72}>
	            <rect x="-10" y="-6" width="20" height="8" rx="2" fill="#3f2412" stroke="#fbbf24" strokeWidth="0.7" />
	            {[-6, 0, 6].map((dx) => <circle key={dx} cx={dx} cy="-8" r="3.4" fill="#22c55e" stroke="#14532d" strokeWidth="0.5" />)}
	          </g>
	          {peaked && (
	            <g data-dofus-roof-dormers={h.id}>
	              {[-0.22, 0.18].map((offset, idx) => {
	                const x = cx + h.w * 7.2 * offset;
	                const y = roofY - roofH * (0.34 + idx * 0.08);
	                return (
	                  <g key={`dormer-${idx}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
	                    <polygon points="-12,8 0,-10 12,8" fill={shade(h.roofColor, 16)} stroke={shade(h.roofColor, -36)} strokeWidth="1" />
	                    <rect x="-8" y="5" width="16" height="15" rx="2" fill="#07111d" stroke={h.accent} strokeWidth="0.85" />
	                    <line x1="0" y1="6" x2="0" y2="18" stroke="#bae6fd" strokeWidth="0.65" opacity="0.58" />
	                  </g>
	                );
	              })}
	              <g transform={`translate(${(cx - h.w * 4.7).toFixed(1)} ${(roofY - roofH * 0.64).toFixed(1)})`}>
	                <rect x="-6" y="-16" width="12" height="26" rx="2" fill="#4b2e16" stroke="#1f1207" strokeWidth="1" />
	                <path className={activity.state !== "idle" ? "cof-rest-smoke" : undefined} d="M-2 -18 Q-12 -30 -1 -42 M5 -18 Q16 -33 4 -45" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.34" />
	              </g>
	            </g>
	          )}
	        </g>
	      )}
	      <ArchitecturalCrown h={h} body={body} bodyH={bodyH} roofY={roofY} cx={cx} focus={focus} />
	      {h.id === "iron_office" && (
	        <g data-revenue-dollar-beacon="iron_office" pointerEvents="none" transform={`translate(${cx.toFixed(1)} ${(roofY - bodyH * 0.16).toFixed(1)})`}>
	          <ellipse cx="0" cy="30" rx="48" ry="13" fill="#020617" opacity="0.42" />
	          <circle cx="0" cy="-4" r="42" fill="#3b2504" stroke="#facc15" strokeWidth="4.2" opacity="0.98" />
	          <circle cx="0" cy="-4" r="34" fill="#111827" stroke="#fde68a" strokeWidth="1.6" opacity="0.82" />
	          <text x="0" y="22" textAnchor="middle" fontSize="74" fontWeight="950" fill="#fde68a" stroke="#020617" strokeWidth="8" paintOrder="stroke">$</text>
	          <text x="0" y="43" textAnchor="middle" fontSize="12" fontWeight="950" fill="#fef3c7" stroke="#020617" strokeWidth="3" paintOrder="stroke">REVENU · CRM</text>
	        </g>
	      )}
      {/* mât statut compact */}
      <g transform={`translate(${(cx - h.w * 6.6).toFixed(1)} ${apex.y.toFixed(1)})`}>
        <line x1="0" y1="2" x2="0" y2="-34" stroke="#94a3b8" strokeWidth="1.15" opacity="0.72" />
        <line x1="0" y1="-34" x2="11" y2="-34" stroke="#94a3b8" strokeWidth="1.05" opacity="0.72" />
        <path d="M2 -33 h9 v18 l-4.5 -4 l-4.5 4 Z" fill={h.accent} stroke={shade(h.accent, -45)} strokeWidth="0.7" opacity="0.92" />
        <path d="M2 -33 h9 v3.5 h-9 Z" fill="#fff" opacity="0.18" />
        <g transform="translate(6.5 -26) scale(0.46)" fill="none" stroke="#17110a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{houseIcon(h.type)}</g>
        <circle cx="6.5" cy="-18.5" r={alert ? "2.8" : "2.2"} fill={st.color} stroke="#0a1410" strokeWidth="0.6" />
      </g>
      {/* enseigne picto SVG */}
	      <g transform={`translate(${cx} ${signY})`}><polygon points="-12,0 -6.5,-8 6.5,-8 12,0 6.5,8 -6.5,8" fill="#020617" stroke={h.accent} strokeWidth="1.25" opacity="0.97" /><polygon points="-8.5,0 -4.5,-5.3 4.5,-5.3 8.5,0 4.5,5.3 -4.5,5.3" fill={h.accent} opacity="0.12" /><g fill="none" stroke={h.accent} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">{houseIcon(h.type)}</g></g>
	      {houseTools.length > 0 && (
	        <g data-house-tool-badges={h.id} transform={`translate(${(cx - houseTools.length * 12).toFixed(1)} ${(signY - 18).toFixed(1)})`} pointerEvents="none">
	          {houseTools.map((tool, idx) => (
	            <g key={`${h.id}-${tool.key}`} transform={`translate(${idx * 24} 0)`}>
	              <rect x="-9" y="-6" width="20" height="12" rx="3" fill="#020617" stroke={tool.color} strokeWidth="0.8" opacity="0.94" />
	              <text x="1" y="3.2" textAnchor="middle" fontSize="6.4" fontWeight="900" fill={tool.color}>{tool.short}</text>
	            </g>
	          ))}
	        </g>
	      )}
	      {/* machines : baies de façade, pas de gadgets posés sur le toit */}
      {machines.slice(0, 10).map((m, idx) => {
        const colsSlots = Math.min(5, Math.max(1, machines.length));
        const mxp = cx - (colsSlots - 1) * 5.5 + (idx % colsSlots) * 11;
        const myp = b.base.y - bodyH * 0.32 + Math.floor(idx / colsSlots) * 9.5;
        const mc = runtimeColor(m.status);
        const badge = badgeForMachine(m, h.id);
        return (
          <g key={m.id} data-house-service-icon={m.id} transform={`translate(${mxp.toFixed(1)} ${myp.toFixed(1)})`} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onMachine(m); }}>
            <title>{`${m.label} — ${m.status}`}</title>
            <ServiceToolIcon machine={m} badge={badge} color={mc} scale={0.54} />
            <circle r="8" fill="transparent" />
          </g>
        );
      })}
      {dockSlots > 0 && (
        <g data-neighborhood-tools={h.id} data-neighborhood-tools-count={machines.length} data-neighborhood-assets-count={assetCount} opacity={focus ? 1 : 0.92}>
          <title>{`${h.name}: ${machines.length} outil(s)/source(s) reliés dans le quartier · ${assetCount} asset(s) rattachés`}</title>
          <path
            d={`M ${(dockStartX - 19).toFixed(1)} ${(dockBaseY - 10).toFixed(1)} H ${(dockStartX + (dockCols - 1) * 31 + 19).toFixed(1)} Q ${(dockStartX + (dockCols - 1) * 31 + 25).toFixed(1)} ${(dockBaseY - 10).toFixed(1)} ${(dockStartX + (dockCols - 1) * 31 + 25).toFixed(1)} ${dockPanelBottomY.toFixed(1)} H ${(dockStartX - 25).toFixed(1)} Q ${(dockStartX - 31).toFixed(1)} ${dockPanelBottomY.toFixed(1)} ${(dockStartX - 31).toFixed(1)} ${(dockBaseY - 10).toFixed(1)} Z`}
            fill="#020617"
            stroke={h.accent}
            strokeWidth="0.75"
            opacity="0.52"
          />
          {visibleNeighborhoodMachines.map(({ machine, badge }, idx) => {
            const col = idx % dockCols;
            const row = Math.floor(idx / dockCols);
            const x = dockStartX + col * 31;
            const y = dockBaseY + row * dockRowGap;
            const color = runtimeColor(machine.status);
            return (
              <g key={`dock-${machine.id}`} data-neighborhood-tool={machine.id} data-neighborhood-tool-status={machine.status} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onMachine(machine); }}>
                <title>{`${machine.label} · ${machine.status} · ${machine.proof ?? "preuve non fournie"}`}</title>
                <ServiceToolIcon machine={machine} badge={badge} color={color} scale={0.82} />
                <text x="0" y="13.2" textAnchor="middle" fontSize="4.2" fontWeight="850" fill={color} opacity="0.9">{compactStatus(machine.status)}</text>
                <rect x="-15.5" y="-10" width="31" height="25" rx="4" fill="transparent" />
              </g>
            );
          })}
          {assetCount > 0 && (() => {
            const idx = visibleNeighborhoodMachines.length;
            const x = dockStartX + (idx % dockCols) * 31;
            const y = dockBaseY + Math.floor(idx / dockCols) * dockRowGap;
            return (
              <g data-neighborhood-assets={h.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} pointerEvents="none">
                <title>{`${assetCount} asset(s) rattachés à ${h.name}`}</title>
                <rect x="-14" y="-6.5" width="28" height="13" rx="3" fill="#111827" stroke="#94a3b8" strokeWidth="0.75" opacity="0.94" />
                <path d="M-8 -1.5 h16 v6 h-16 Z M-5 -1.5 v-3 h10 v3" fill="none" stroke="#cbd5e1" strokeWidth="0.65" opacity="0.82" />
                <text x="0" y="2.3" textAnchor="middle" fontSize="5.4" fontWeight="900" fill="#e2e8f0">{assetCount > 999 ? "999+" : assetCount}</text>
              </g>
            );
          })()}
          {extraMachineCount > 0 && (() => {
            const idx = visibleNeighborhoodMachines.length + (assetCount > 0 ? 1 : 0);
            const x = dockStartX + (idx % dockCols) * 31;
            const y = dockBaseY + Math.floor(idx / dockCols) * dockRowGap;
            return (
              <g data-neighborhood-extra-tools={h.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} pointerEvents="none">
                <title>{`${extraMachineCount} outil(s)/source(s) supplémentaires dans le panneau maison`}</title>
                <rect x="-14" y="-6.5" width="28" height="13" rx="3" fill="#020617" stroke="#64748b" strokeWidth="0.75" opacity="0.9" />
                <text x="0" y="2.2" textAnchor="middle" fontSize="5.7" fontWeight="900" fill="#cbd5e1">+{extraMachineCount}</text>
              </g>
            );
          })()}
        </g>
      )}
      {/* sources canon : broches de preuve incrustées dans la façade, jamais en panneau externe */}
      {truthSources.slice(0, 5).map((source, idx) => {
        const sc = runtimeColor(source.status);
        const sx = cx + h.w * 5.9;
        const sy = b.base.y - bodyH * 0.68 + idx * 7.4;
        return (
          <g key={`truth-${source.id}`} pointerEvents="none">
            <title>{`${source.label} — ${source.status} — ${source.proof}`}</title>
            <rect x={sx - 7} y={sy - 3} width="14" height="6" rx="1.2" fill="#020617" stroke={sc} strokeWidth="0.7" opacity="0.96" />
            <circle cx={sx - 3.8} cy={sy} r="1.55" fill={sc} opacity={source.ok ? 0.96 : 0.52} />
            <line x1={sx - 0.8} y1={sy} x2={sx + 4.8} y2={sy} stroke={sc} strokeWidth="0.9" opacity={source.ok ? 0.78 : 0.36} />
          </g>
        );
      })}
      {/* label + badge agents */}
      {focus && (
        <g transform={`translate(${cx + h.w * 6.5} ${roofY - 2})`} opacity="1">
          <rect x="0" y="-10" width={Math.max(108, h.name.length * 5.8 + 34)} height="28" rx="4" fill="#020617" stroke={st.color} strokeWidth="1.25" opacity="0.95" />
          <line x1="0" y1="-10" x2={Math.max(108, h.name.length * 5.8 + 34)} y2="-10" stroke={h.accent} strokeWidth="1.1" opacity="0.65" />
          <text x="7" y="1.5" fontSize="9.5" fontWeight="850" fill="#f8fafc">{h.name}</text>
          <text x="7" y="12.5" fontSize="7.8" fontWeight="800" fill={st.color}>● {st.label}{agentCount ? ` · ${agentCount} agents` : ""}</text>
        </g>
      )}
    </g>
  );
}

function ActivityGlyph({ state, x, y, color }: { state: AgentState; x: number; y: number; color: string }) {
  return (
    <g pointerEvents="none" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <title>{ACT_LABEL[state]}</title>
      <rect x="-11" y="-8" width="22" height="16" rx="3" fill="#020617" stroke={color} strokeWidth="1" opacity="0.96" />
      {state === "phone" ? (
        <g>
          <rect x="-3.8" y="-5" width="7.6" height="10" rx="1.3" fill="#0b1320" stroke={color} strokeWidth="0.9" />
          <circle cx="0" cy="3.4" r="0.65" fill={color} />
          <path d="M4.8 -2.8 L8.8 -1 L4.8 0.9 Z" fill={color} opacity="0.84" />
        </g>
      ) : state === "keyboard" ? (
        <g>
          <rect x="-7" y="-4.5" width="14" height="9" rx="1.2" fill="#07111d" stroke={color} strokeWidth="0.8" />
          {[-4, 0, 4].map((dx) => <line key={dx} x1={dx} y1="-2.5" x2={dx} y2="2.5" stroke={color} strokeWidth="0.55" opacity="0.65" />)}
          <line x1="-6" y1="0" x2="6" y2="0" stroke={color} strokeWidth="0.55" opacity="0.65" />
        </g>
      ) : state === "inspect" ? (
        <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="-1.5" cy="-1.3" r="4.2" strokeWidth="1.4" />
          <line x1="1.8" y1="2" x2="6.4" y2="6" strokeWidth="1.7" />
        </g>
      ) : state === "work" ? (
        <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
          <path d="M-6 -1 L-1.5 3.5 L7 -5" strokeWidth="1.8" />
          <path d="M-7 5 H7" strokeWidth="1.1" opacity="0.68" />
        </g>
      ) : state === "queued" ? (
        <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
          <path d="M-5 -5 H5 V4 H-5 Z" strokeWidth="1.1" />
          <path d="M-2 -1 H3 M-2 2 H2" strokeWidth="1" opacity="0.78" />
          <path d="M-7 6 H7" strokeWidth="1.1" opacity="0.68" />
        </g>
      ) : (
        <g>
          <path d="M0 -6 L7 6 H-7 Z" fill="#ef4444" opacity="0.28" stroke={color} strokeWidth="1" />
          <line x1="0" y1="-2.5" x2="0" y2="2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="0" cy="4.2" r="0.8" fill={color} />
        </g>
      )}
    </g>
  );
}

function SvgAgentMarker({ agent, wx, wy, state, tool }: { agent: CanonAgent; wx: number; wy: number; state: AgentState; tool?: ToolBadge | null }) {
  const p = isoProject(wx, wy);
  const rank = rankFor(agent);
  const size = rank === "crown" ? 46 : rank === "diadem" ? 40 : rank === "captain" ? 34 : 30;
  const stateColor = state === "alert" ? "#ef4444" : state === "queued" ? "#22d3ee" : state === "phone" ? "#22d3ee" : state === "keyboard" ? "#38bdf8" : state === "inspect" ? "#f59e0b" : state === "work" ? "#34d399" : "#64748b";
  const body = agent.colorPrimary || "#38bdf8";
  const trim = agent.colorAccent || stateColor;
  return (
    <g data-agent-id={agent.id} data-agent-state={state} pointerEvents="none" transform={`translate(${p.sx.toFixed(1)} ${(p.sy - 10).toFixed(1)})`}>
	      <title>{`${agent.name} · ${ACT_LABEL[state]} · ${agent.house}`}</title>
		      {isAgentWorkingState(state) && (
		        <circle cx="0" cy={size * 0.18} r={size * 0.5} fill="none" stroke={stateColor} strokeWidth="1.2" strokeDasharray={state === "keyboard" ? "2 4" : state === "inspect" ? "1 5" : "4 4"} opacity="0.28">
		          <animate attributeName="r" values={`${(size * 0.42).toFixed(1)};${(size * 0.62).toFixed(1)};${(size * 0.42).toFixed(1)}`} dur={state === "phone" ? "1.25s" : state === "keyboard" ? "0.9s" : state === "inspect" ? "1.6s" : "1.1s"} repeatCount="indefinite" />
		          <animate attributeName="opacity" values="0.1;0.42;0.1" dur={state === "phone" ? "1.25s" : state === "keyboard" ? "0.9s" : state === "inspect" ? "1.6s" : "1.1s"} repeatCount="indefinite" />
		        </circle>
		      )}
		      {tool && isAgentWorkingState(state) && (
		        <g data-agent-tool-badge={tool.key} transform={`translate(0 ${(-size * 0.72).toFixed(1)})`}>
		          <rect x="-12" y="-6" width="24" height="12" rx="3" fill="#020617" stroke={tool.color} strokeWidth="1" opacity="0.96" />
		          <text x="0" y="3" textAnchor="middle" fontSize="7" fontWeight="900" fill={tool.color}>{tool.short}</text>
		        </g>
		      )}
      <ellipse cx="0" cy={size * 0.5} rx={size * 0.32} ry={size * 0.11} fill="#020617" opacity="0.45" />
      <path d={`M ${(-size * 0.18).toFixed(1)} ${(size * 0.02).toFixed(1)} C ${(-size * 0.32).toFixed(1)} ${(size * 0.24).toFixed(1)} ${(-size * 0.24).toFixed(1)} ${(size * 0.48).toFixed(1)} 0 ${(size * 0.55).toFixed(1)} C ${(size * 0.24).toFixed(1)} ${(size * 0.48).toFixed(1)} ${(size * 0.32).toFixed(1)} ${(size * 0.24).toFixed(1)} ${(size * 0.18).toFixed(1)} ${(size * 0.02).toFixed(1)} Z`} fill={body} stroke={shade(body, -42)} strokeWidth="1.4" />
      <path d={`M ${(-size * 0.17).toFixed(1)} ${(size * 0.35).toFixed(1)} Q 0 ${(size * 0.43).toFixed(1)} ${(size * 0.17).toFixed(1)} ${(size * 0.35).toFixed(1)}`} fill="none" stroke={trim} strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="0" cy={-size * 0.12} r={size * 0.21} fill="#f1c6a8" stroke="#3f2412" strokeWidth="1" />
      <path d={`M ${(-size * 0.2).toFixed(1)} ${(-size * 0.18).toFixed(1)} Q 0 ${(-size * 0.38).toFixed(1)} ${(size * 0.2).toFixed(1)} ${(-size * 0.18).toFixed(1)}`} fill="#2f1f18" opacity="0.92" />
      <circle cx={-size * 0.07} cy={-size * 0.12} r="1.15" fill="#020617" />
      <circle cx={size * 0.07} cy={-size * 0.12} r="1.15" fill="#020617" />
      <circle cx={size * 0.27} cy={-size * 0.2} r={size * 0.12} fill="#020617" stroke={stateColor} strokeWidth="1.6" />
      {state === "phone" ? <rect x={size * 0.24} y={-size * 0.26} width={size * 0.06} height={size * 0.12} rx="1" fill={stateColor} />
        : state === "keyboard" ? <path d={`M ${(size * 0.21).toFixed(1)} ${(-size * 0.2).toFixed(1)} h ${(size * 0.13).toFixed(1)} M ${(size * 0.21).toFixed(1)} ${(-size * 0.16).toFixed(1)} h ${(size * 0.13).toFixed(1)}`} stroke={stateColor} strokeWidth="1.1" />
        : state === "inspect" ? <circle cx={size * 0.27} cy={-size * 0.2} r={size * 0.045} fill={stateColor} />
        : state === "work" ? <path d={`M ${(size * 0.22).toFixed(1)} ${(-size * 0.2).toFixed(1)} l ${(size * 0.04).toFixed(1)} ${(size * 0.05).toFixed(1)} l ${(size * 0.08).toFixed(1)} ${(-size * 0.1).toFixed(1)}`} fill="none" stroke={stateColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        : state === "queued" ? <path d={`M ${(size * 0.22).toFixed(1)} ${(-size * 0.24).toFixed(1)} h ${(size * 0.12).toFixed(1)} v ${(size * 0.1).toFixed(1)} h ${(-size * 0.12).toFixed(1)} Z`} fill="none" stroke={stateColor} strokeWidth="1.1" />
        : state === "alert" ? <path d={`M ${(size * 0.27).toFixed(1)} ${(-size * 0.29).toFixed(1)} l ${(size * 0.08).toFixed(1)} ${(size * 0.17).toFixed(1)} h ${(-size * 0.16).toFixed(1)} Z`} fill={stateColor} />
        : <circle cx={size * 0.27} cy={-size * 0.2} r={size * 0.025} fill={stateColor} />}
    </g>
  );
}

const LANDMARK_TYPES = new Set<BuildingType>(["command_tower", "brain", "business", "studio", "compliance", "signal_tower", "vault", "observatory", "factory", "gate", "warehouse", "calendar", "notebook_alm", "proof_ledger"]);
const isLandmarkType = (type: BuildingType) => LANDMARK_TYPES.has(type);

function ArchitecturalCrown({ h, body, bodyH, roofY, cx, focus }: { h: House; body: ReturnType<typeof block>; bodyH: number; roofY: number; cx: number; focus: boolean }) {
  const accent = h.accent;
  const glow = focus ? 0.95 : 0.68;
  const topCenter = centroid(body.top);
  const roofBand = (opacity = 0.72) => (
    <polygon points={insetTowards(body.top, 0.18).map(P).join(" ")} fill="none" stroke={accent} strokeWidth={focus ? 1.6 : 1.05} strokeOpacity={opacity} />
  );

  switch (h.type) {
    case "command_tower":
      return (
        <g pointerEvents="none">
          {roofBand(0.82)}
          <polygon points={`${cx - 34},${roofY - bodyH * 0.17} ${cx + 34},${roofY - bodyH * 0.17} ${cx + 26},${roofY - bodyH * 0.02} ${cx - 26},${roofY - bodyH * 0.02}`} fill="#08243a" stroke={accent} strokeWidth="1.4" opacity="0.98" />
          <polygon points={`${cx - 48},${roofY - bodyH * 0.02} ${cx + 48},${roofY - bodyH * 0.02} ${cx + 35},${roofY + bodyH * 0.1} ${cx - 35},${roofY + bodyH * 0.1}`} fill="#05131f" stroke={accent} strokeWidth="1.1" opacity="0.96" />
          {[-24, -14, -4, 6, 16, 26].map((dx) => <rect key={dx} x={cx + dx - 3.2} y={roofY - bodyH * 0.135} width="6.4" height="8.5" rx="1" fill="#dff7ff" opacity={glow} />)}
          <path d={`M ${cx - 31} ${roofY + bodyH * 0.075} H ${cx + 31} M ${cx - 20} ${roofY + bodyH * 0.035} H ${cx + 20}`} stroke="#bae6fd" strokeWidth="1" opacity="0.7" />
        </g>
      );
    case "brain":
      return (
        <g pointerEvents="none">
          <path d={`M ${cx - 36} ${roofY + bodyH * 0.02}
            C ${cx - 45} ${roofY - bodyH * 0.14}, ${cx - 20} ${roofY - bodyH * 0.3}, ${cx - 5} ${roofY - bodyH * 0.18}
            C ${cx + 10} ${roofY - bodyH * 0.36}, ${cx + 42} ${roofY - bodyH * 0.16}, ${cx + 34} ${roofY + bodyH * 0.02}
            C ${cx + 45} ${roofY + bodyH * 0.16}, ${cx + 10} ${roofY + bodyH * 0.23}, ${cx + 1} ${roofY + bodyH * 0.11}
            C ${cx - 12} ${roofY + bodyH * 0.24}, ${cx - 44} ${roofY + bodyH * 0.16}, ${cx - 36} ${roofY + bodyH * 0.02} Z`}
            fill="#3b1972" stroke={accent} strokeWidth="1.45" opacity="0.96" />
          <path d={`M ${cx - 16} ${roofY - bodyH * 0.11} C ${cx - 4} ${roofY - bodyH * 0.23}, ${cx - 6} ${roofY + bodyH * 0.08}, ${cx - 20} ${roofY + bodyH * 0.11}
            M ${cx + 7} ${roofY - bodyH * 0.16} C ${cx + 23} ${roofY - bodyH * 0.05}, ${cx + 8} ${roofY + bodyH * 0.1}, ${cx + 24} ${roofY + bodyH * 0.13}`}
            fill="none" stroke="#f5f3ff" strokeWidth="1.05" opacity="0.78" />
          {[-21, -2, 18, 7].map((dx, i) => <circle key={i} cx={cx + dx} cy={roofY + bodyH * (i % 2 ? -0.07 : 0.04)} r="2.6" fill="#f5f3ff" opacity={glow} />)}
        </g>
      );
    case "business":
      return (
        <g pointerEvents="none" data-revenue-dollar-crown={h.id}>
          {roofBand(0.74)}
          <polygon points={`${cx - 46},${topCenter.y - 20} ${cx + 46},${topCenter.y - 20} ${cx + 32},${topCenter.y + 9} ${cx - 32},${topCenter.y + 9}`} fill="#3b2504" stroke={accent} strokeWidth="1.5" opacity="0.98" />
          <text x={cx} y={topCenter.y + 4} textAnchor="middle" fontSize="33" fontWeight="950" fill="#fde68a" stroke="#020617" strokeWidth="5" paintOrder="stroke">$</text>
          {[-31, 31].map((dx) => (
            <g key={`revenue-roof-coin-${dx}`} transform={`translate(${cx + dx} ${topCenter.y - 10})`}>
              <ellipse cx="0" cy="0" rx="10" ry="4" fill="#facc15" stroke="#7c4a03" strokeWidth="0.9" />
              <rect x="-10" y="-11" width="20" height="11" fill="#d97706" opacity="0.55" />
              <ellipse cx="0" cy="-11" rx="10" ry="4" fill="#fde68a" stroke="#7c4a03" strokeWidth="0.9" />
            </g>
          ))}
        </g>
      );
    case "calendar":
      return (
        <g pointerEvents="none">
          {roofBand(0.78)}
          <g transform={`translate(${cx} ${topCenter.y - 16})`}>
            <circle cx="0" cy="0" r="16" fill="#120b00" stroke={accent} strokeWidth="1.45" opacity="0.98" />
            {[0, 1, 2, 3, 4, 5].map((i) => { const a = (i * Math.PI) / 3; return <line key={i} x1={Math.cos(a) * 11} y1={Math.sin(a) * 11} x2={Math.cos(a) * 14} y2={Math.sin(a) * 14} stroke="#fde68a" strokeWidth="0.85" />; })}
            <line x1="0" y1="0" x2="0" y2="-9" stroke="#fde68a" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="0" y1="0" x2="8" y2="3.6" stroke="#fde68a" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        </g>
      );
    case "notebook_alm":
      return (
        <g pointerEvents="none">
          {roofBand(0.74)}
          <g transform={`translate(${cx} ${topCenter.y - 11})`}>
            <path d="M-34 -9 L0 -18 L0 22 L-34 12 Z" fill="#201a2c" stroke={accent} strokeWidth="1.2" opacity="0.98" />
            <path d="M0 -18 L34 -9 L34 12 L0 22 Z" fill="#2d2440" stroke={accent} strokeWidth="1.2" opacity="0.98" />
            {[ -24, -13, 13, 24 ].map((dx) => <line key={dx} x1={dx} y1="-3" x2={dx * 0.82} y2="9" stroke="#f8fafc" strokeWidth="0.8" opacity="0.55" />)}
            <text x="0" y="-23" textAnchor="middle" fontSize="8.5" fontWeight="950" fill="#f3e2b3" stroke="#020617" strokeWidth="2" paintOrder="stroke">NLM</text>
          </g>
        </g>
      );
    case "proof_ledger":
      return (
        <g pointerEvents="none">
          {roofBand(0.82)}
          <g transform={`translate(${cx} ${topCenter.y - 12})`}>
            <path d="M0 -28 L30 -13 V8 Q30 25 0 35 Q-30 25 -30 8 V-13 Z" fill="#0b1018" stroke={accent} strokeWidth="1.55" opacity="0.98" />
            <path d="M-11 1 L-3 10 L15 -12" fill="none" stroke="#34d399" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" opacity={glow} />
            <path d="M-19 19 H19" stroke={accent} strokeWidth="1.1" strokeDasharray="4 4" opacity="0.68" />
            <text x="0" y="-33" textAnchor="middle" fontSize="8.5" fontWeight="950" fill="#e2e8f0" stroke="#020617" strokeWidth="2" paintOrder="stroke">QA</text>
          </g>
        </g>
      );
    case "gate":
      return (
        <g pointerEvents="none">
          {roofBand(0.66)}
          <path d={`M ${cx - 36} ${topCenter.y + 8} V ${topCenter.y - 12} Q ${cx} ${topCenter.y - 42} ${cx + 36} ${topCenter.y - 12} V ${topCenter.y + 8}`} fill="none" stroke={accent} strokeWidth="3" opacity="0.92" />
          <path d={`M ${cx - 20} ${topCenter.y - 9} Q ${cx} ${topCenter.y - 26} ${cx + 20} ${topCenter.y - 9}`} fill="none" stroke="#bae6fd" strokeWidth="1.2" opacity="0.64" />
          <circle cx={cx} cy={topCenter.y - 12} r="4" fill={accent} opacity={glow} />
        </g>
      );
    default:
      return null;
  }
}

function LandmarkFacade({ h, ground, body, bodyH, roofY, cx, focus }: { h: House; ground: Pt[]; body: ReturnType<typeof block>; bodyH: number; roofY: number; cx: number; focus: boolean }) {
  const front = lerpPt(ground[1], ground[2], 0.5);
  const leftMid = lerpPt(body.top[3], body.top[2], 0.55);
  const rightMid = lerpPt(body.top[0], body.top[1], 0.55);
  const glow = focus ? 0.95 : 0.68;
  const stroke = h.accent;
  const glass = "#0b1d2c";
  const panel = (w: number, hh: number, y: number, fill = glass) => (
    <rect x={cx - w / 2} y={y} width={w} height={hh} rx="2.5" fill={fill} stroke={stroke} strokeWidth={focus ? 1.25 : 0.85} opacity="0.96" />
  );

  switch (h.type) {
    case "command_tower":
      return (
        <g pointerEvents="none">
          <polygon points={`${cx - 18},${front.y - bodyH * 0.06} ${cx + 18},${front.y - bodyH * 0.06} ${cx + 11},${roofY - bodyH * 0.58} ${cx - 11},${roofY - bodyH * 0.58}`} fill="#071827" stroke={stroke} strokeWidth="1.25" opacity="0.98" />
          <polygon points={`${cx - 38},${roofY - bodyH * 0.66} ${cx + 38},${roofY - bodyH * 0.66} ${cx + 29},${roofY - bodyH * 0.38} ${cx - 29},${roofY - bodyH * 0.38}`} fill="#0f314a" stroke={stroke} strokeWidth="1.35" />
          {[-24, -14, -4, 6, 16, 26].map((dx) => <rect key={dx} x={cx + dx - 3} y={roofY - bodyH * 0.61} width="6" height="11" rx="1" fill="#dff7ff" opacity={glow} />)}
          <g opacity={focus ? 0.88 : 0.62}>
            <path d={`M ${cx - 26} ${front.y - bodyH * 0.18} H ${cx + 26}`} stroke="#e0f2fe" strokeWidth="1.15" strokeLinecap="round" />
            {[-16, 0, 16].map((dx) => <path key={dx} d={`M ${cx + dx - 5} ${front.y - bodyH * 0.12} L ${cx + dx} ${front.y - bodyH * 0.18} L ${cx + dx + 5} ${front.y - bodyH * 0.12}`} fill="none" stroke={stroke} strokeWidth="0.9" />)}
            <rect x={cx - 8} y={front.y - bodyH * 0.34} width="16" height="10" rx="1.8" fill="#020617" stroke={stroke} strokeWidth="0.9" />
            <path d={`M ${cx - 5} ${front.y - bodyH * 0.29} H ${cx + 5} M ${cx} ${front.y - bodyH * 0.33} V ${front.y - bodyH * 0.25}`} stroke="#bae6fd" strokeWidth="0.8" />
          </g>
          <line x1={cx} y1={roofY - bodyH * 0.66} x2={cx} y2={roofY - bodyH * 0.95} stroke={stroke} strokeWidth="1.7" />
          <path d={`M ${cx + 6} ${roofY - bodyH * 0.86} Q ${cx + 34} ${roofY - bodyH * 0.78} ${cx + 52} ${roofY - bodyH * 0.52}`} fill="none" stroke={stroke} strokeWidth="1.05" opacity="0.72" />
          <path d={`M ${cx - 6} ${roofY - bodyH * 0.86} Q ${cx - 34} ${roofY - bodyH * 0.78} ${cx - 52} ${roofY - bodyH * 0.52}`} fill="none" stroke={stroke} strokeWidth="1.05" opacity="0.5" />
        </g>
      );
    case "brain":
      return (
        <g pointerEvents="none">
          <path d={`M ${cx - 42} ${roofY + bodyH * 0.12}
            C ${cx - 52} ${roofY - bodyH * 0.28}, ${cx - 18} ${roofY - bodyH * 0.58}, ${cx - 2} ${roofY - bodyH * 0.36}
            C ${cx + 16} ${roofY - bodyH * 0.66}, ${cx + 55} ${roofY - bodyH * 0.34}, ${cx + 39} ${roofY + bodyH * 0.08}
            C ${cx + 50} ${roofY + bodyH * 0.36}, ${cx + 14} ${front.y - bodyH * 0.12}, ${cx + 2} ${front.y - bodyH * 0.25}
            C ${cx - 17} ${front.y - bodyH * 0.03}, ${cx - 54} ${roofY + bodyH * 0.38}, ${cx - 42} ${roofY + bodyH * 0.12} Z`}
            fill="#25144a" stroke={stroke} strokeWidth="1.8" opacity="0.98" />
          <path d={`M ${cx - 22} ${roofY - bodyH * 0.2} C ${cx - 6} ${roofY - bodyH * 0.42}, ${cx - 4} ${roofY + bodyH * 0.1}, ${cx - 24} ${roofY + bodyH * 0.22}
            M ${cx + 6} ${roofY - bodyH * 0.32} C ${cx + 28} ${roofY - bodyH * 0.16}, ${cx + 10} ${roofY + bodyH * 0.16}, ${cx + 30} ${roofY + bodyH * 0.26}`}
            fill="none" stroke="#ddd6fe" strokeWidth="1.25" opacity="0.78" />
          <path d={`M ${cx} ${roofY - bodyH * 0.38} C ${cx - 4} ${roofY - bodyH * 0.12}, ${cx + 4} ${roofY + bodyH * 0.18}, ${cx} ${front.y - bodyH * 0.2}`} fill="none" stroke="#f5f3ff" strokeWidth="1" opacity="0.66" />
          {[[-24, -0.08], [-4, -0.28], [20, -0.12], [6, 0.18]].map(([dx, dy], i) => <circle key={i} cx={cx + dx} cy={roofY + bodyH * dy} r="3" fill="#f5f3ff" opacity={glow} />)}
          {[[-31, 0.2, -12, 0.02], [16, -0.22, 34, -0.03], [-6, 0.27, -22, 0.31]].map(([x1, y1, x2, y2], i) => <line key={`brain-node-${i}`} x1={cx + x1} y1={roofY + bodyH * y1} x2={cx + x2} y2={roofY + bodyH * y2} stroke="#ddd6fe" strokeWidth="0.8" opacity="0.55" />)}
        </g>
      );
    case "business":
      return (
        <g pointerEvents="none" data-revenue-dollar-building={h.id}>
          <path d={`M ${cx - 48} ${front.y - bodyH * 0.06} L ${cx - 31} ${roofY + bodyH * 0.1} Q ${cx} ${roofY - bodyH * 0.1} ${cx + 31} ${roofY + bodyH * 0.1} L ${cx + 48} ${front.y - bodyH * 0.06} Q ${cx} ${front.y - bodyH * 0.28} ${cx - 48} ${front.y - bodyH * 0.06} Z`} fill="#2b1a03" stroke="#facc15" strokeWidth="2.3" opacity="0.98" />
          <line x1={cx} y1={roofY + bodyH * 0.04} x2={cx} y2={front.y - bodyH * 0.04} stroke="#020617" strokeWidth="16" strokeLinecap="round" opacity="0.76" />
          <line x1={cx} y1={roofY + bodyH * 0.04} x2={cx} y2={front.y - bodyH * 0.04} stroke="#fde68a" strokeWidth="7.2" strokeLinecap="round" />
          <path
            d={`M ${cx + 31} ${roofY + bodyH * 0.1}
              C ${cx + 5} ${roofY - bodyH * 0.02}, ${cx - 37} ${roofY + bodyH * 0.08}, ${cx - 35} ${roofY + bodyH * 0.25}
              C ${cx - 33} ${roofY + bodyH * 0.42}, ${cx + 38} ${roofY + bodyH * 0.3}, ${cx + 36} ${roofY + bodyH * 0.52}
              C ${cx + 34} ${roofY + bodyH * 0.74}, ${cx - 11} ${roofY + bodyH * 0.78}, ${cx - 36} ${roofY + bodyH * 0.62}`}
            fill="none"
            stroke="#020617"
            strokeWidth="20"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.82"
          />
          <path
            d={`M ${cx + 31} ${roofY + bodyH * 0.1}
              C ${cx + 5} ${roofY - bodyH * 0.02}, ${cx - 37} ${roofY + bodyH * 0.08}, ${cx - 35} ${roofY + bodyH * 0.25}
              C ${cx - 33} ${roofY + bodyH * 0.42}, ${cx + 38} ${roofY + bodyH * 0.3}, ${cx + 36} ${roofY + bodyH * 0.52}
              C ${cx + 34} ${roofY + bodyH * 0.74}, ${cx - 11} ${roofY + bodyH * 0.78}, ${cx - 36} ${roofY + bodyH * 0.62}`}
            fill="none"
            stroke="#facc15"
            strokeWidth="9.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text x={cx} y={front.y - bodyH * 0.01} textAnchor="middle" fontSize="13" fontWeight="950" fill="#fde68a" stroke="#020617" strokeWidth="3" paintOrder="stroke">MRR · CRM</text>
          {[-34, 34].map((dx) => (
            <g key={`revenue-facade-coin-${dx}`} transform={`translate(${cx + dx} ${front.y - bodyH * 0.12})`}>
              <ellipse cx="0" cy="0" rx="9.5" ry="4" fill="#fbbf24" stroke="#7c4a03" strokeWidth="0.9" />
              <rect x="-9.5" y="-18" width="19" height="18" fill="#d97706" opacity="0.5" />
              <ellipse cx="0" cy="-18" rx="9.5" ry="4" fill="#fde68a" stroke="#7c4a03" strokeWidth="0.9" />
            </g>
          ))}
        </g>
      );
    case "studio":
      return (
        <g pointerEvents="none">
          {panel(82, bodyH * 0.42, roofY + bodyH * 0.2, "#050714")}
          <polygon points={`${cx - 10},${roofY + bodyH * 0.34} ${cx + 15},${roofY + bodyH * 0.48} ${cx - 10},${roofY + bodyH * 0.62}`} fill={stroke} opacity={glow} />
          <path d={`M ${cx - 48} ${front.y - bodyH * 0.08} L ${cx - 20} ${roofY + bodyH * 0.46} M ${cx + 48} ${front.y - bodyH * 0.08} L ${cx + 20} ${roofY + bodyH * 0.46}`} stroke="#fecdd3" strokeWidth="6" opacity="0.14" />
        </g>
      );
    case "compliance":
      return (
        <g pointerEvents="none">
          <path d={`M ${cx - 36} ${front.y - bodyH * 0.02} V ${roofY + bodyH * 0.28} Q ${cx} ${roofY - bodyH * 0.2} ${cx + 36} ${roofY + bodyH * 0.28} V ${front.y - bodyH * 0.02}`} fill="#170611" stroke={stroke} strokeWidth="2" />
          <path d={`M ${cx - 9} ${roofY + bodyH * 0.45} L ${cx - 2} ${roofY + bodyH * 0.56} L ${cx + 14} ${roofY + bodyH * 0.26}`} fill="none" stroke="#fecdd3" strokeWidth="2.2" />
        </g>
      );
    case "signal_tower":
      return (
        <g pointerEvents="none">
          <polygon points={`${cx - 20},${front.y - bodyH * 0.05} ${cx + 20},${front.y - bodyH * 0.05} ${cx + 10},${roofY - bodyH * 0.45} ${cx - 10},${roofY - bodyH * 0.45}`} fill="#03170d" stroke={stroke} strokeWidth="1.35" />
          <path d={`M ${cx - 24} ${front.y - bodyH * 0.34} L ${cx - 6} ${front.y - bodyH * 0.48} L ${cx + 5} ${front.y - bodyH * 0.42} L ${cx + 25} ${front.y - bodyH * 0.66}`} fill="none" stroke="#34d399" strokeWidth="2.1" strokeLinecap="round" />
          <line x1={cx} y1={roofY - bodyH * 0.45} x2={cx} y2={roofY - bodyH * 0.82} stroke={stroke} strokeWidth="1.8" />
          <path d={`M ${cx + 5} ${roofY - bodyH * 0.75} Q ${cx + 30} ${roofY - bodyH * 0.68} ${cx + 42} ${roofY - bodyH * 0.45}`} fill="none" stroke={stroke} strokeWidth="1" opacity="0.66" />
        </g>
      );
    case "vault":
      return (
        <g pointerEvents="none">
          <circle cx={cx} cy={front.y - bodyH * 0.36} r="23" fill="#020617" stroke={stroke} strokeWidth="2" />
          <circle cx={cx} cy={front.y - bodyH * 0.36} r="9" fill="none" stroke="#cbd5e1" strokeWidth="1.4" />
          {[0, 1, 2, 3, 4, 5].map((i) => { const a = i * Math.PI / 3; return <line key={i} x1={cx + Math.cos(a) * 9} y1={front.y - bodyH * 0.36 + Math.sin(a) * 9} x2={cx + Math.cos(a) * 23} y2={front.y - bodyH * 0.36 + Math.sin(a) * 23} stroke={stroke} strokeWidth="0.9" />; })}
        </g>
      );
    case "observatory":
      return (
        <g pointerEvents="none">
          <ellipse cx={cx} cy={roofY + bodyH * 0.1} rx="44" ry="24" fill="#160b31" stroke={stroke} strokeWidth="1.8" />
          <line x1={cx - 5} y1={roofY + bodyH * 0.03} x2={cx + 48} y2={roofY - bodyH * 0.34} stroke={stroke} strokeWidth="3" />
          <path d={`M ${cx + 25} ${roofY - bodyH * 0.16} Q ${cx + 58} ${roofY - bodyH * 0.04} ${cx + 72} ${roofY + bodyH * 0.24}`} fill="none" stroke="#ddd6fe" strokeWidth="1" opacity="0.7" />
        </g>
      );
    case "factory":
      return (
        <g pointerEvents="none">
          <polygon points={`${leftMid.x},${leftMid.y} ${cx - 26},${roofY + bodyH * 0.05} ${cx - 10},${roofY - bodyH * 0.12} ${cx + 4},${roofY + bodyH * 0.05} ${cx + 21},${roofY - bodyH * 0.12} ${rightMid.x},${rightMid.y} ${body.top[1].x},${body.top[1].y} ${body.top[2].x},${body.top[2].y}`} fill="#120a24" stroke={stroke} strokeWidth="1.2" opacity="0.98" />
          <rect x={cx + 30} y={roofY - bodyH * 0.42} width="9" height={bodyH * 0.54} rx="1.2" fill="#1d102f" stroke={stroke} strokeWidth="1" />
          <circle cx={cx} cy={front.y - bodyH * 0.35} r="12" fill="#020617" stroke={stroke} strokeWidth="1.4" />
          {[0, 1, 2, 3, 4, 5].map((i) => { const a = i * Math.PI / 3; return <line key={i} x1={cx} y1={front.y - bodyH * 0.35} x2={cx + Math.cos(a) * 13} y2={front.y - bodyH * 0.35 + Math.sin(a) * 13} stroke={stroke} strokeWidth="1" />; })}
        </g>
      );
    case "gate":
      return (
        <g pointerEvents="none">
          <path d={`M ${cx - 35} ${front.y - bodyH * 0.02} V ${roofY + bodyH * 0.32} Q ${cx} ${roofY - bodyH * 0.22} ${cx + 35} ${roofY + bodyH * 0.32} V ${front.y - bodyH * 0.02}`} fill="none" stroke={stroke} strokeWidth="3" />
          <rect x={cx - 42} y={roofY + bodyH * 0.28} width="10" height={bodyH * 0.62} rx="2" fill="#05182c" stroke={stroke} strokeWidth="1.1" />
          <rect x={cx + 32} y={roofY + bodyH * 0.28} width="10" height={bodyH * 0.62} rx="2" fill="#05182c" stroke={stroke} strokeWidth="1.1" />
          <path d={`M ${cx - 24} ${roofY + bodyH * 0.22} Q ${cx} ${roofY - bodyH * 0.12} ${cx + 24} ${roofY + bodyH * 0.22}`} fill="none" stroke="#bae6fd" strokeWidth="1.2" opacity="0.64" />
          <path d={`M ${cx - 6} ${roofY + bodyH * 0.35} L ${cx + 14} ${roofY + bodyH * 0.43} L ${cx - 6} ${roofY + bodyH * 0.54} Z`} fill={stroke} opacity={glow * 0.72} />
          <path d={`M ${cx - 14} ${front.y - bodyH * 0.05} L ${cx + 14} ${front.y - bodyH * 0.26}`} stroke="#e0f2fe" strokeWidth="2.2" opacity="0.75" />
        </g>
      );
    case "warehouse":
      return (
        <g pointerEvents="none">
          {[cx - 24, cx, cx + 24].map((x, i) => <g key={i}><rect x={x - 11} y={front.y - bodyH * 0.55} width="22" height="31" rx="2.4" fill="#021413" stroke={stroke} strokeWidth="1" /><circle cx={x} cy={front.y - bodyH * 0.38} r="6" fill="none" stroke={stroke} strokeWidth="1" /></g>)}
        </g>
      );
    case "calendar":
      return (
        <g pointerEvents="none">
          {panel(48, 42, front.y - bodyH * 0.62, "#120b00")}
          <line x1={cx - 24} y1={front.y - bodyH * 0.5} x2={cx + 24} y2={front.y - bodyH * 0.5} stroke={stroke} strokeWidth="1.4" />
          {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}-${c}`} x={cx - 16 + c * 12} y={front.y - bodyH * 0.43 + r * 9} width="7" height="5" rx="1" fill={stroke} opacity={(r + c) % 2 ? 0.34 : glow} />))}
          <g transform={`translate(${cx} ${roofY - bodyH * 0.08})`} opacity={focus ? 0.95 : 0.72}>
            <circle cx="0" cy="0" r="13" fill="#120b00" stroke={stroke} strokeWidth="1.4" />
            {[0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 2; return <line key={i} x1={Math.cos(a) * 9} y1={Math.sin(a) * 9} x2={Math.cos(a) * 11.5} y2={Math.sin(a) * 11.5} stroke="#fde68a" strokeWidth="0.9" />; })}
            <line x1="0" y1="0" x2="0" y2="-7" stroke="#fde68a" strokeWidth="1.1" strokeLinecap="round" />
            <line x1="0" y1="0" x2="6" y2="3" stroke="#fde68a" strokeWidth="1.1" strokeLinecap="round" />
          </g>
        </g>
      );
    case "notebook_alm":
      return (
        <g pointerEvents="none">
          <path d={`M ${cx - 38} ${front.y - bodyH * 0.08} L ${cx} ${front.y - bodyH * 0.2} L ${cx} ${front.y - bodyH * 0.58} L ${cx - 38} ${front.y - bodyH * 0.43} Z`} fill="#201a2c" stroke={stroke} strokeWidth="1.45" opacity="0.98" />
          <path d={`M ${cx} ${front.y - bodyH * 0.2} L ${cx + 38} ${front.y - bodyH * 0.08} L ${cx + 38} ${front.y - bodyH * 0.43} L ${cx} ${front.y - bodyH * 0.58} Z`} fill="#2d2440" stroke={stroke} strokeWidth="1.45" opacity="0.98" />
          {[-25, -14, 14, 25].map((dx) => <path key={dx} d={`M ${cx + dx} ${front.y - bodyH * 0.34} L ${cx + dx * 0.74} ${front.y - bodyH * 0.21}`} stroke="#f8fafc" strokeWidth="0.9" opacity="0.58" />)}
          <text x={cx} y={front.y - bodyH * 0.64} textAnchor="middle" fontSize="10" fontWeight="950" fill="#f3e2b3" stroke="#020617" strokeWidth="2.2" paintOrder="stroke">NOTEBOOK</text>
        </g>
      );
    case "proof_ledger":
      return (
        <g pointerEvents="none">
          <path d={`M ${cx} ${roofY + bodyH * 0.08} L ${cx + 38} ${roofY + bodyH * 0.25} V ${front.y - bodyH * 0.05} Q ${cx + 36} ${front.y - bodyH * 0.23} ${cx} ${front.y - bodyH * 0.01} Q ${cx - 36} ${front.y - bodyH * 0.23} ${cx - 38} ${front.y - bodyH * 0.05} V ${roofY + bodyH * 0.25} Z`} fill="#0b1018" stroke={stroke} strokeWidth="2" opacity="0.98" />
          <path d={`M ${cx - 14} ${front.y - bodyH * 0.2} L ${cx - 4} ${front.y - bodyH * 0.09} L ${cx + 18} ${front.y - bodyH * 0.38}`} fill="none" stroke="#34d399" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" opacity={glow} />
          <path d={`M ${cx - 25} ${front.y - bodyH * 0.01} H ${cx + 25} M ${cx - 19} ${front.y - bodyH * 0.52} H ${cx + 19}`} stroke="#cbd5e1" strokeWidth="1.15" strokeDasharray="5 4" opacity="0.62" />
          <text x={cx} y={roofY + bodyH * 0.02} textAnchor="middle" fontSize="10.5" fontWeight="950" fill="#e2e8f0" stroke="#020617" strokeWidth="2.4" paintOrder="stroke">LEDGER</text>
        </g>
      );
    default:
      return null;
  }
}

function ProfessionFacade({ h, ground, body, bodyH, roofY, cx, focus }: { h: House; ground: Pt[]; body: ReturnType<typeof block>; bodyH: number; roofY: number; cx: number; focus: boolean }) {
  const front = lerpPt(ground[1], ground[2], 0.5);
  const topFront = lerpPt(body.top[1], body.top[2], 0.5);
  const panelW = Math.max(34, h.w * 7.4);
  const panelH = Math.max(18, Math.min(34, bodyH * 0.28));
  const panelY = front.y - bodyH * 0.5;
  const glow = focus ? 0.9 : 0.55;
  const frame = (w = panelW, hh = panelH, yOff = 0, fill = "#07111d") => (
    <rect x={cx - w / 2} y={panelY + yOff} width={w} height={hh} rx="2.5" fill={fill} stroke={h.accent} strokeWidth={focus ? 1.15 : 0.75} opacity="0.94" />
  );
  const tinyText = (text: string, yOff = 0, color = h.accent) => (
    <text x={cx} y={panelY + yOff} textAnchor="middle" fontSize="6.8" fontWeight="900" fill={color} stroke="#020617" strokeWidth="1.8" paintOrder="stroke" style={{ letterSpacing: "1px" }}>{text}</text>
  );
  switch (h.type) {
    case "command_tower": return (
      <g pointerEvents="none">
        {frame(panelW + 10, 17, -3, "#061526")}
        {[-20, -12, -4, 4, 12, 20].map((dx) => <rect key={dx} x={cx + dx - 3} y={panelY + 1} width="6" height="8" rx="1" fill="#dff7ff" opacity={glow} />)}
        <path d={`M ${cx - 29} ${front.y - 8} L ${cx - 4} ${front.y - 23} M ${cx + 29} ${front.y - 8} L ${cx + 4} ${front.y - 23}`} stroke="#f8fafc" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.52" />
        <g transform={`translate(${cx + 29} ${roofY - 22})`} fill="none" stroke={h.accent} strokeLinecap="round">
          <circle cx="0" cy="0" r="8" strokeWidth="1.1" opacity="0.8" />
          <line x1="0" y1="0" x2="6.8" y2="-4" strokeWidth="1.2" />
          <path d="M8 -4 Q16 -2 22 5" strokeWidth="0.9" opacity="0.7" />
        </g>
      </g>
    );
    case "brain": return (
      <g pointerEvents="none">
        <path d={`M ${cx - 25} ${panelY + 4} C ${cx - 34} ${panelY - 8}, ${cx - 14} ${panelY - 22}, ${cx - 3} ${panelY - 12} C ${cx + 7} ${panelY - 25}, ${cx + 33} ${panelY - 12}, ${cx + 24} ${panelY + 5} C ${cx + 33} ${panelY + 16}, ${cx + 7} ${panelY + 22}, ${cx} ${panelY + 12} C ${cx - 13} ${panelY + 24}, ${cx - 34} ${panelY + 16}, ${cx - 25} ${panelY + 4} Z`} fill="#8b5cf6" opacity="0.22" stroke={h.accent} strokeWidth="1.2" />
        {[[cx - 18, panelY + 3], [cx - 3, panelY - 10], [cx + 15, panelY], [cx + 1, panelY + 12]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill="#f5f3ff" opacity={glow} />)}
        <path d={`M ${cx - 18} ${panelY + 3} C ${cx - 5} ${panelY - 13}, ${cx + 7} ${panelY + 13}, ${cx + 15} ${panelY} M ${cx - 3} ${panelY - 10} C ${cx - 10} ${panelY + 3}, ${cx + 10} ${panelY + 5}, ${cx + 1} ${panelY + 12}`} fill="none" stroke="#ddd6fe" strokeWidth="1.1" opacity="0.84" />
      </g>
    );
    case "business": return (
      <g pointerEvents="none">
        {frame(panelW + 4, 18, -2, "#1b1204")}
        {tinyText("MRR  CRM  VIP", 10, "#fde68a")}
        {[-22, -10, 2, 14].map((dx, i) => <g key={i} transform={`translate(${cx + dx} ${panelY + 21})`}><ellipse cx="0" cy="0" rx="5.2" ry="2.5" fill="#fbbf24" stroke="#7c4a03" strokeWidth="0.7" /><text x="0" y="1.8" textAnchor="middle" fontSize="4.8" fontWeight="900" fill="#4a2b00">€</text></g>)}
        <path d={`M ${cx - 28} ${panelY + 1} H ${cx + 28}`} stroke="#fde68a" strokeWidth="1" opacity="0.54" />
      </g>
    );
    case "studio": return (
      <g pointerEvents="none">
        {frame(panelW + 12, 22, -4, "#090d18")}
        <polygon points={`${cx - 5},${panelY + 1} ${cx + 9},${panelY + 7} ${cx - 5},${panelY + 14}`} fill={h.accent} opacity={glow} />
        <path d={`M ${cx - 31} ${panelY + 23} L ${cx - 42} ${panelY + 38} M ${cx + 31} ${panelY + 23} L ${cx + 42} ${panelY + 38}`} stroke={h.accent} strokeWidth="1.6" opacity="0.72" />
        <path d={`M ${cx - 42} ${panelY + 38} L ${cx - 23} ${panelY + 21} M ${cx + 42} ${panelY + 38} L ${cx + 23} ${panelY + 21}`} stroke="#fecdd3" strokeWidth="5" opacity={focus ? 0.2 : 0.1} />
        {tinyText("STUDIO", -7, "#fecdd3")}
      </g>
    );
    case "compliance": return (
      <g pointerEvents="none">
        <path d={`M ${cx} ${panelY - 11} L ${cx + 15} ${panelY - 4} V ${panelY + 11} Q ${cx + 15} ${panelY + 24} ${cx} ${panelY + 29} Q ${cx - 15} ${panelY + 24} ${cx - 15} ${panelY + 11} V ${panelY - 4} Z`} fill="#12030a" stroke={h.accent} strokeWidth="1.3" opacity="0.96" />
        <path d={`M ${cx - 6} ${panelY + 9} L ${cx - 1.5} ${panelY + 14} L ${cx + 8} ${panelY + 1}`} fill="none" stroke="#fecdd3" strokeWidth="1.6" />
        <path d={`M ${cx - 38} ${front.y - 10} L ${cx - 9} ${front.y - 24} M ${cx + 38} ${front.y - 10} L ${cx + 9} ${front.y - 24}`} stroke="#fb7185" strokeWidth="2.2" strokeDasharray="6 4" />
        {tinyText("GATE", 36, "#fecdd3")}
      </g>
    );
    case "signal_tower": return (
      <g pointerEvents="none">
        {frame(panelW, 20, -2, "#03170d")}
        <path d={`M ${cx - 20} ${panelY + 13} L ${cx - 9} ${panelY + 6} L ${cx - 2} ${panelY + 9} L ${cx + 8} ${panelY - 2} L ${cx + 21} ${panelY + 4}`} fill="none" stroke="#34d399" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <g transform={`translate(${cx + 25} ${roofY - 13})`} fill="none" stroke={h.accent}>
          <line x1="0" y1="14" x2="0" y2="-16" strokeWidth="1.8" />
          <path d="M4 -12 Q14 -8 18 2 M-4 -12 Q-14 -8 -18 2" strokeWidth="1.1" opacity="0.72" />
          <circle cx="0" cy="-17" r="2.5" fill={h.accent} />
        </g>
        {tinyText("SIGNAL", 28, "#bbf7d0")}
      </g>
    );
    case "vault": return (
      <g pointerEvents="none">
        <circle cx={cx} cy={panelY + 6} r="12" fill="#020617" stroke={h.accent} strokeWidth="1.4" />
        <circle cx={cx} cy={panelY + 6} r="5" fill="none" stroke="#cbd5e1" strokeWidth="1.1" />
        {[0, 1, 2, 3, 4, 5].map((i) => { const a = i * Math.PI / 3; return <line key={i} x1={cx + Math.cos(a) * 5} y1={panelY + 6 + Math.sin(a) * 5} x2={cx + Math.cos(a) * 12} y2={panelY + 6 + Math.sin(a) * 12} stroke={h.accent} strokeWidth="0.75" />; })}
      </g>
    );
    case "observatory": return (
      <g pointerEvents="none">
        <ellipse cx={cx} cy={panelY + 4} rx="18" ry="8" fill="#160b31" stroke={h.accent} strokeWidth="1.1" />
        <line x1={cx - 2} y1={panelY} x2={cx + 28} y2={panelY - 16} stroke={h.accent} strokeWidth="2" />
        <path d={`M ${cx + 18} ${panelY - 9} Q ${cx + 34} ${panelY - 3} ${cx + 39} ${panelY + 10}`} fill="none" stroke="#ddd6fe" strokeWidth="0.9" opacity="0.7" />
      </g>
    );
    case "factory": return (
      <g pointerEvents="none">
        {[-19, 0, 19].map((dx, i) => <polygon key={i} points={`${cx + dx - 10},${roofY + 3} ${cx + dx},${roofY - 9} ${cx + dx + 10},${roofY + 3}`} fill={i % 2 ? shade(h.roofColor, 18) : h.roofColor} stroke={h.accent} strokeWidth="0.8" opacity="0.95" />)}
        <rect x={cx + 25} y={roofY - 24} width="7" height="27" rx="1" fill="#120a24" stroke={h.accent} strokeWidth="0.8" />
        <circle cx={cx} cy={panelY + 6} r="8" fill="#020617" stroke={h.accent} strokeWidth="1.2" />
        {[0, 1, 2, 3, 4, 5].map((i) => { const a = i * Math.PI / 3; return <line key={i} x1={cx} y1={panelY + 6} x2={cx + Math.cos(a) * 9} y2={panelY + 6 + Math.sin(a) * 9} stroke={h.accent} strokeWidth="0.9" />; })}
      </g>
    );
    case "village": return (
      <g pointerEvents="none" data-structure-volume="agent-village-barracks">
        {[[-34, -2, "#2b1605"], [0, -10, "#3a2109"], [34, -2, "#2b1605"]].map(([dx, dy, fill], i) => {
          const x = cx + Number(dx);
          const y = front.y - bodyH * 0.18 + Number(dy);
          return (
            <g key={`village-hut-${i}`}>
              <ellipse cx={x} cy={y + 24} rx="23" ry="8" fill="#020617" opacity="0.28" />
              <polygon points={`${x - 23},${y} ${x},${y - 18} ${x + 23},${y} ${x + 18},${y + 19} ${x - 18},${y + 19}`} fill={String(fill)} stroke={h.accent} strokeWidth="1.15" opacity="0.98" />
              <polygon points={`${x - 18},${y + 19} ${x + 18},${y + 19} ${x + 12},${y + 34} ${x - 12},${y + 34}`} fill="#120904" stroke={shade(h.accent, -30)} strokeWidth="0.85" opacity="0.96" />
              <rect x={x - 5} y={y + 20} width="10" height="13" rx="1.6" fill="#020617" stroke={h.accent} strokeWidth="0.8" />
              <circle cx={x + 7} cy={y + 27} r="1.2" fill={h.accent} opacity="0.9" />
            </g>
          );
        })}
        <path d={`M ${cx - 44} ${front.y - bodyH * 0.02} Q ${cx} ${front.y - bodyH * 0.28} ${cx + 44} ${front.y - bodyH * 0.02}`} fill="none" stroke="#fed7aa" strokeWidth="1.2" strokeDasharray="5 5" opacity="0.7" />
        {tinyText("AGENTS", 39, "#fed7aa")}
      </g>
    );
    case "academy": return (
      <g pointerEvents="none">
        {frame(panelW, 16, 1, "#061526")}
        {tinyText("ACADEMY", 12, "#bfdbfe")}
        {[-18, -9, 0, 9, 18].map((dx) => <line key={dx} x1={cx + dx} y1={panelY + 17} x2={cx + dx} y2={panelY + 29} stroke={h.accent} strokeWidth="1.2" opacity="0.65" />)}
      </g>
    );
    case "gate": return (
      <g pointerEvents="none">
        <path d={`M ${cx - 21} ${front.y - 7} V ${panelY + 2} Q ${cx} ${panelY - 17} ${cx + 21} ${panelY + 2} V ${front.y - 7}`} fill="none" stroke={h.accent} strokeWidth="2.2" />
        <path d={`M ${cx - 11} ${front.y - 6} L ${cx + 11} ${front.y - 17}`} stroke="#e0f2fe" strokeWidth="2" opacity="0.65" />
        {tinyText("VIP", 17, "#bae6fd")}
      </g>
    );
    case "warehouse": return (
      <g pointerEvents="none">
        {[cx - 17, cx, cx + 17].map((x, i) => <g key={i}><rect x={x - 7} y={panelY} width="14" height="16" rx="1.8" fill="#021413" stroke={h.accent} strokeWidth="0.8" /><circle cx={x} cy={panelY + 8} r="3.8" fill="none" stroke={h.accent} strokeWidth="0.8" /></g>)}
        {tinyText("ASSETS", 28, "#99f6e4")}
      </g>
    );
    case "calendar": return (
      <g pointerEvents="none">
        {frame(34, 27, -6, "#120b00")}
        <line x1={cx - 17} y1={panelY} x2={cx + 17} y2={panelY} stroke={h.accent} strokeWidth="1.2" />
        {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}-${c}`} x={cx - 12 + c * 8} y={panelY + 4 + r * 6} width="4.8" height="3.4" rx="0.7" fill={h.accent} opacity={(r + c) % 2 ? 0.35 : 0.86} />))}
      </g>
    );
    case "lab": return (
      <g pointerEvents="none">
        <path d={`M ${cx - 11} ${panelY - 5} H ${cx + 11} M ${cx - 7} ${panelY - 5} V ${panelY + 5} L ${cx - 17} ${panelY + 22} H ${cx + 17} L ${cx + 7} ${panelY + 5} V ${panelY - 5}`} fill="#07111d" stroke={h.accent} strokeWidth="1.1" />
        <path d={`M ${cx - 11} ${panelY + 15} Q ${cx} ${panelY + 8} ${cx + 11} ${panelY + 15}`} fill="none" stroke="#bae6fd" strokeWidth="1.1" opacity="0.8" />
      </g>
    );
    default: return (
      <g pointerEvents="none">
        <circle cx={cx} cy={topFront.y + 18} r="9" fill="#020617" stroke={h.accent} strokeWidth="1" opacity="0.9" />
        <g transform={`translate(${cx} ${topFront.y + 18}) scale(0.85)`} fill="none" stroke={h.accent} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">{houseIcon(h.type)}</g>
      </g>
    );
  }
}

function houseIcon(type: BuildingType) {
  switch (type) {
    case "command_tower": return (<><circle cx="0" cy="-1" r="2.4" /><path d="M-6 -4 L-2.5 -1 M6 -4 L2.5 -1" /><path d="M-3 4 Q0 1 3 4" /></>);
    case "brain": return (<><path d="M-1 -5 Q-6 -4 -5 0 Q-6 4 -1 5" /><path d="M1 -5 Q6 -4 5 0 Q6 4 1 5" /><line x1="0" y1="-5" x2="0" y2="5" /></>);
    case "observatory": return (<><path d="M-5 3 A5 5 0 0 1 5 3 Z" /><line x1="0" y1="-2" x2="6" y2="-6" /></>);
    case "factory": return (<><circle cx="0" cy="0" r="2.4" />{[0, 1, 2, 3, 4, 5].map((k) => { const a = (k / 6) * Math.PI * 2; return <line key={k} x1={Math.cos(a) * 2.4} y1={Math.sin(a) * 2.4} x2={Math.cos(a) * 4.5} y2={Math.sin(a) * 4.5} />; })}</>);
    case "signal_tower": return (<><line x1="-5" y1="5" x2="5" y2="-5" /><rect x="-5" y="-2" width="3" height="5" /><rect x="2" y="-5" width="3" height="6" /></>);
    case "academy": return (<><path d="M-6 -1 L0 -4 L6 -1 L0 2 Z" /><line x1="5" y1="0" x2="5" y2="4" /></>);
    case "gate": return (<><circle cx="0" cy="2" r="1.4" /><path d="M-3 0 A3 3 0 0 1 3 0" /><path d="M-5.5 -2 A5.5 5.5 0 0 1 5.5 -2" /></>);
    case "compliance": return (<><path d="M0 -5 L5 -3 V1 Q5 4 0 6 Q-5 4 -5 1 V-3 Z" /><path d="M-2 0 L-0.5 1.8 L2.5 -2" /></>);
    case "calendar": return (<><rect x="-5" y="-4" width="10" height="9" rx="1" /><line x1="-5" y1="-1" x2="5" y2="-1" /><line x1="-2" y1="-6" x2="-2" y2="-3" /><line x1="2" y1="-6" x2="2" y2="-3" /></>);
    case "studio": return (<><path d="M-3 -4 L4 0 L-3 4 Z" fill="currentColor" /></>);
    case "warehouse": return (<><circle cx="0" cy="0" r="4.5" /><circle cx="0" cy="0" r="1.2" />{[0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2 + 0.4; return <circle key={k} cx={Math.cos(a) * 3} cy={Math.sin(a) * 3} r="0.7" />; })}</>);
    case "lab": return (<><path d="M-2 -5 H2 M-1.6 -5 V-1 L-4 4 H4 L1.6 -1 V-5" /></>);
    case "vault": return (<><circle cx="0" cy="0" r="4.6" />{[0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2 + 0.4; return <line key={k} x1={Math.cos(a) * 1.6} y1={Math.sin(a) * 1.6} x2={Math.cos(a) * 5.4} y2={Math.sin(a) * 5.4} />; })}</>);
    case "business": return (<><path d="M3 -4 Q-4 -4 -4 0 Q-4 4 3 4" /><line x1="-6" y1="-1.5" x2="1" y2="-1.5" /><line x1="-6" y1="1.5" x2="1" y2="1.5" /></>);
    case "notebook_alm": return (<><path d="M0 -4 L-5 -3 V4 L0 5 Z" /><path d="M0 -4 L5 -3 V4 L0 5 Z" /><line x1="0" y1="-4" x2="0" y2="5" />{[0, 1].map((i) => <line key={i} x1="-3.6" y1={-1 + i * 2} x2="-1" y2={-0.6 + i * 2} />)}</>); // carnet ouvert
    case "proof_ledger": return (<><path d="M0 -5 L4.5 -2.6 V2.6 L0 5 L-4.5 2.6 V-2.6 Z" /><path d="M-2 0.2 L-0.5 1.9 L2.4 -1.8" /></>); // sceau + check
    default: return <circle cx="0" cy="0" r="3" />;
  }
}

/* ════════════════════ PERSONNAGE humain (vectoriel, identité stable) ════════════════════ */
type OutfitKind = "suit" | "shirt" | "blazer" | "tech_jacket" | "bomber" | "utility_vest" | "security_jacket" | "studio_jacket";
type BottomKind = "suit_trousers" | "dark_jeans" | "blue_jeans" | "chinos" | "cargo" | "black_denim";
type ShoeKind = "oxford" | "sneaker" | "boot" | "loafer" | "runner";
type GlassesKind = "none" | "round" | "square" | "sunglasses";
type FacialHairKind = "none" | "moustache" | "stubble" | "short_beard" | "goatee";
type WristKind = "none" | "watch" | "bracelet" | "watch_bracelet";
type HumanAvatarProfile = {
  outfit: OutfitKind;
  bottom: BottomKind;
  shoes: ShoeKind;
  glasses: GlassesKind;
  facialHair: FacialHairKind;
  wrist: WristKind;
  topColor: string;
  jacketColor: string;
  pantsColor: string;
  shoeColor: string;
  heightScale: number;
  widthScale: number;
};
const profileHash = (value: string, salt: string) => {
  let h = 2166136261 >>> 0;
  const str = `${value}:${salt}`;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
};
const pickProfile = <T,>(items: readonly T[], value: string, salt: string): T => items[profileHash(value, salt) % items.length];
const outfitByType: Record<AgentAvatarType, readonly OutfitKind[]> = {
  operator: ["tech_jacket", "utility_vest", "shirt"],
  trader: ["suit", "blazer", "shirt"],
  analyst: ["shirt", "blazer", "tech_jacket"],
  builder: ["utility_vest", "tech_jacket", "bomber"],
  publisher: ["studio_jacket", "bomber", "shirt"],
  risk: ["security_jacket", "suit", "blazer"],
  knowledge: ["blazer", "shirt", "tech_jacket"],
  system: ["suit", "blazer", "tech_jacket"],
  support: ["shirt", "utility_vest", "blazer"],
  vipHandler: ["suit", "blazer", "shirt"],
  telegramHandler: ["bomber", "tech_jacket", "shirt"],
  assetManager: ["utility_vest", "studio_jacket", "bomber"],
  notebookPlanner: ["shirt", "blazer", "studio_jacket"],
  proofAuditor: ["suit", "blazer", "security_jacket"],
};
const topColors = ["#f8fafc", "#dbeafe", "#e0f2fe", "#fef3c7", "#fee2e2", "#dcfce7", "#f5f3ff"] as const;
const jacketColors = ["#111827", "#1f2937", "#0f172a", "#263241", "#312e81", "#164e63", "#3f2d18", "#422006", "#4c1d24"] as const;
const pantsColors = {
  suit_trousers: ["#0f172a", "#111827", "#1f2937"],
  dark_jeans: ["#111827", "#172033", "#1e293b"],
  blue_jeans: ["#1d4ed8", "#1e40af", "#315b8f"],
  chinos: ["#8a6b3c", "#a16207", "#9a7b4f"],
  cargo: ["#3f5132", "#455a35", "#334155"],
  black_denim: ["#020617", "#111827", "#1f2937"],
} satisfies Record<BottomKind, readonly string[]>;
const shoeColors = {
  oxford: ["#111827", "#3b2416", "#1f2937"],
  sneaker: ["#e5e7eb", "#f8fafc", "#bae6fd"],
  boot: ["#3b2416", "#422006", "#111827"],
  loafer: ["#2f1f14", "#111827", "#451a03"],
  runner: ["#0f172a", "#1d4ed8", "#dc2626"],
} satisfies Record<ShoeKind, readonly string[]>;
function humanAvatarProfile(agent: CanonAgent, type: AgentAvatarType, seed: ReturnType<typeof avatarSeed>, rank: Rank): HumanAvatarProfile {
  const id = agent.id || agent.name;
  const outfit = rank === "crown" || rank === "diadem" ? pickProfile(["suit", "blazer"] as const, id, "chief-outfit") : pickProfile(outfitByType[type], id, "outfit");
  const bottomPool: readonly BottomKind[] = outfit === "suit" ? ["suit_trousers", "black_denim"] : outfit === "utility_vest" ? ["cargo", "dark_jeans"] : outfit === "studio_jacket" || outfit === "bomber" ? ["blue_jeans", "black_denim", "chinos"] : ["dark_jeans", "blue_jeans", "chinos", "suit_trousers"];
  const bottom = pickProfile(bottomPool, id, "bottom");
  const shoes = pickProfile((outfit === "suit" || outfit === "blazer") ? ["oxford", "loafer", "sneaker"] as const : ["sneaker", "boot", "runner"] as const, id, "shoes");
  const glasses = pickProfile(["none", "round", "square", "sunglasses"] as const, id, "glasses");
  const facialHair = pickProfile(["none", "moustache", "stubble", "short_beard", "goatee"] as const, id, "facial");
  const wrist = pickProfile(["none", "watch", "bracelet", "watch_bracelet"] as const, id, "wrist");
  const rankHeight = rank === "crown" ? 1.2 : rank === "diadem" ? 1.13 : rank === "captain" ? 1.07 : 0.98;
  const bodyHeight = seed.bodyShape === "slim" ? 1.04 : seed.bodyShape === "broad" ? 0.99 : 1;
  const widthScale = seed.bodyShape === "slim" ? 0.9 : seed.bodyShape === "broad" ? 1.08 : 1;
  return {
    outfit,
    bottom,
    shoes,
    glasses,
    facialHair,
    wrist,
    topColor: pickProfile(topColors, id, "top-color"),
    jacketColor: pickProfile(jacketColors, id, "jacket-color"),
    pantsColor: pickProfile(pantsColors[bottom], id, "pants-color"),
    shoeColor: pickProfile(shoeColors[shoes], id, "shoe-color"),
    heightScale: rankHeight * bodyHeight,
    widthScale,
  };
}

function RPGCharacter({ agent, x, y, size, state, tool, selected, hover, onSelect, onHover }: { agent: CanonAgent; x: number; y: number; size: number; state: AgentState; tool?: ToolBadge | null; selected: boolean; hover: boolean; onSelect: () => void; onHover: (v: boolean) => void }) {
  const rank = rankFor(agent);
  const type = resolveAgentType(agent.house, agent.roleBadge);
  const seed = avatarSeed(agent.id);
  const profile = humanAvatarProfile(agent, type, seed, rank);
  const W = size * profile.widthScale;
  const Hh = W * 1.62 * profile.heightScale;
  const trim = agent.colorAccent || "#94a3b8";   // accent maison propriétaire
  const skin = skinHex(seed.skinTone);
  const hairC = hairHex(seed.hairColor);
  const bw = seed.bodyShape === "slim" ? 0.9 : seed.bodyShape === "broad" ? 1.16 : 1;
  const shoulderL = 20 - 8.2 * bw, shoulderR = 20 + 8.2 * bw;
  const waistL = 20 - 6.2 * bw, waistR = 20 + 6.2 * bw;
  const hipL = 20 - 7.6 * bw, hipR = 20 + 7.6 * bw;
  const headRx = seed.faceShape === "soft" ? 5.9 : seed.faceShape === "sharp" ? 5.1 : seed.faceShape === "oval" ? 5.3 : seed.faceShape === "square" ? 5.7 : 5.6;
  const headRy = seed.faceShape === "oval" ? 6.3 : seed.faceShape === "round" ? 5.8 : 6;
  const motionClass = state === "idle" || state === "queued" || state === "alert" ? "" : `cof-agent-${state}`;
  return (
    <div
      className="pointer-events-auto absolute"
      data-agent-id={agent.id}
      data-agent-state={state}
      data-agent-human-avatar="true"
      data-agent-outfit={profile.outfit}
      data-agent-bottom={profile.bottom}
      data-agent-shoes={profile.shoes}
      data-agent-glasses={profile.glasses}
      data-agent-facial-hair={profile.facialHair}
      data-agent-wrist={profile.wrist}
      data-agent-skin-tone={seed.skinTone}
      data-agent-rank-scale={profile.heightScale.toFixed(2)}
      data-agent-eye-style={seed.eyeStyle}
      data-agent-nose-style={seed.noseStyle}
      style={{ left: x, top: y, width: W, height: Hh, transform: "translate(-50%,-88%)", transition: "left .25s linear, top .25s linear, width .15s, height .15s", zIndex: selected ? 40 : hover ? 36 : 24, cursor: "pointer" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {(selected || hover) && (<div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold text-slate-100" style={{ top: -6, background: "rgba(2,6,15,0.95)", borderColor: `${trim}99` }}>{agent.name}<span className="ml-1 font-normal text-slate-400">{agent.roleBadge}</span></div>)}
		      {tool && isAgentWorkingState(state) && (
	        <div data-agent-tool-badge={tool.key} className="absolute left-1/2 z-10 -translate-x-1/2 rounded-md border px-1.5 py-0.5 text-[8px] font-black tracking-wide shadow-[0_8px_18px_rgba(2,6,23,0.38)]" style={{ top: -20, color: tool.color, borderColor: `${tool.color}99`, background: "rgba(2,6,23,0.95)" }}>{tool.short}</div>
	      )}
      <svg viewBox="0 0 40 70" width={W} height={Hh} style={{ overflow: "visible", display: "block" }}>
        <ellipse cx="20" cy="64" rx="11" ry="3.4" fill="#000" opacity="0.42" />
        {selected && <ellipse cx="20" cy="64" rx="13" ry="4.1" fill="none" stroke={trim} strokeWidth="1.6" opacity="0.92" />}
        <g className={motionClass} style={{ transformOrigin: "20px 60px" }}>
          {/* jambes/pantalon */}
          <path d={`M${hipL} 42 L19.2 42 L18.5 60 L${(15.1 - (bw - 1) * 1.4).toFixed(1)} 60 L${waistL.toFixed(1)} 42 Z`} fill={profile.pantsColor} stroke={shade(profile.pantsColor, -34)} strokeWidth="0.9" />
          <path d={`M20.8 42 L${hipR} 42 L${(24.9 + (bw - 1) * 1.4).toFixed(1)} 60 L21.5 60 L20.8 42 Z`} fill={shade(profile.pantsColor, profile.bottom === "blue_jeans" ? 16 : 5)} stroke={shade(profile.pantsColor, -34)} strokeWidth="0.9" />
          {profile.bottom === "blue_jeans" || profile.bottom === "dark_jeans" || profile.bottom === "black_denim" ? <g stroke="#dbeafe" strokeWidth="0.45" opacity="0.42"><line x1={waistL} y1="45" x2="18.8" y2="45" /><line x1="21.2" y1="45" x2={waistR} y2="45" /><path d="M16.5 47 Q18 48 19.2 47" /><path d="M20.8 47 Q22 48 23.5 47" /></g> : null}
          {profile.bottom === "cargo" ? <g fill="#1f2937" stroke="#94a3b8" strokeWidth="0.45" opacity="0.72"><rect x="13.6" y="49" width="4.2" height="4.2" rx="0.8" /><rect x="22.2" y="49" width="4.2" height="4.2" rx="0.8" /></g> : null}
          {/* chaussures */}
          {profile.shoes === "sneaker" || profile.shoes === "runner" ? (
            <g>
              <path d="M13.6 60.1 H19.6 Q20.4 62 18.8 62.8 H12.4 Q11.9 61.1 13.6 60.1 Z" fill={profile.shoeColor} stroke="#020617" strokeWidth="0.8" />
              <path d="M20.4 60.1 H26.4 Q28.1 61.1 27.6 62.8 H21.2 Q19.6 62 20.4 60.1 Z" fill={profile.shoeColor} stroke="#020617" strokeWidth="0.8" />
              <line x1="13" y1="62.2" x2="19.2" y2="62.2" stroke="#f8fafc" strokeWidth="0.65" />
              <line x1="20.8" y1="62.2" x2="27" y2="62.2" stroke="#f8fafc" strokeWidth="0.65" />
            </g>
          ) : (
            <g>
              <path d="M13.4 60 H19.7 Q20.2 62 18.4 62.8 H12.7 Q12.1 61.1 13.4 60 Z" fill={profile.shoeColor} stroke="#020617" strokeWidth="0.8" />
              <path d="M20.3 60 H26.6 Q27.9 61.1 27.3 62.8 H21.6 Q19.8 62 20.3 60 Z" fill={profile.shoeColor} stroke="#020617" strokeWidth="0.8" />
            </g>
          )}
          {/* chemise + veste */}
          <path d={`M${shoulderL.toFixed(1)} 21 L${shoulderR.toFixed(1)} 21 L${waistR.toFixed(1)} 43 L${waistL.toFixed(1)} 43 Z`} fill={profile.topColor} stroke={shade(profile.topColor, -45)} strokeWidth="0.8" />
          {(profile.outfit === "suit" || profile.outfit === "blazer" || profile.outfit === "tech_jacket" || profile.outfit === "bomber" || profile.outfit === "studio_jacket" || profile.outfit === "security_jacket" || profile.outfit === "utility_vest") && (
            <g>
              <path d={`M${shoulderL.toFixed(1)} 21 L20 27 L${waistL.toFixed(1)} 43 L${(shoulderL - 2).toFixed(1)} 39 Q${(shoulderL - 1).toFixed(1)} 28 ${shoulderL.toFixed(1)} 21 Z`} fill={profile.jacketColor} stroke={shade(profile.jacketColor, -38)} strokeWidth="0.85" />
              <path d={`M${shoulderR.toFixed(1)} 21 L20 27 L${waistR.toFixed(1)} 43 L${(shoulderR + 2).toFixed(1)} 39 Q${(shoulderR + 1).toFixed(1)} 28 ${shoulderR.toFixed(1)} 21 Z`} fill={shade(profile.jacketColor, 12)} stroke={shade(profile.jacketColor, -38)} strokeWidth="0.85" />
              <path d={`M20 27 L${waistL + 2} 42 M20 27 L${waistR - 2} 42`} stroke={trim} strokeWidth="0.85" opacity="0.55" />
            </g>
          )}
          {profile.outfit === "shirt" ? <path d={`M${shoulderL + 1} 25 Q20 30 ${shoulderR - 1} 25`} fill="none" stroke={trim} strokeWidth="1.1" opacity="0.72" /> : null}
          {profile.outfit === "suit" ? <path d="M18.5 22 L21.5 22 L21 36 L20 38 L19 36 Z" fill={trim} stroke={shade(trim, -38)} strokeWidth="0.45" /> : null}
          {profile.outfit === "utility_vest" ? <g fill="#020617" stroke={trim} strokeWidth="0.55" opacity="0.85"><rect x="13.5" y="29" width="5" height="5" rx="0.7" /><rect x="21.5" y="29" width="5" height="5" rx="0.7" /></g> : null}
          {profile.outfit === "security_jacket" ? <path d={`M${shoulderL + 1} 27 H${shoulderR - 1} M${shoulderL + 2} 34 H${shoulderR - 2}`} stroke="#fecdd3" strokeWidth="1" strokeDasharray="3 2" opacity="0.72" /> : null}
          {/* bras + mains + montre/bracelet */}
          <path d={`M${shoulderL + 0.2} 23 L${shoulderL - 5.2} 38`} stroke={profile.jacketColor} strokeWidth="4.2" strokeLinecap="round" />
          <path d={`M${shoulderR - 0.2} 23 L${shoulderR + 5.2} 38`} stroke={profile.jacketColor} strokeWidth="4.2" strokeLinecap="round" />
          <circle cx={shoulderL - 5.7} cy="39" r="2.1" fill={skin} />
          <circle cx={shoulderR + 5.7} cy="39" r="2.1" fill={skin} />
          {(profile.wrist === "watch" || profile.wrist === "watch_bracelet") && <circle cx={shoulderL - 4.1} cy="36.8" r="1.3" fill="#020617" stroke="#e5e7eb" strokeWidth="0.45" />}
          {(profile.wrist === "bracelet" || profile.wrist === "watch_bracelet") && <path d={`M${shoulderR + 3.9} 37.2 Q${shoulderR + 5.8} 38.5 ${shoulderR + 7.5} 37.2`} fill="none" stroke={trim} strokeWidth="0.8" />}
          {/* tête */}
          {seed.faceShape === "square"
            ? <rect x={20 - headRx} y={13 - headRy} width={headRx * 2} height={headRy * 2} rx="2.4" fill={skin} stroke={shade(skin, -30)} strokeWidth="0.6" />
            : <ellipse cx="20" cy="13" rx={headRx} ry={headRy} fill={skin} stroke={shade(skin, -30)} strokeWidth="0.6" />}
          {/* yeux + nez seedés : plus de clones sans visage */}
          {avatarEyes(seed.eyeStyle)}
          {avatarNose(seed.noseStyle)}
          {profile.glasses !== "none" && <AvatarGlasses kind={profile.glasses} />}
          {profile.facialHair !== "none" && <FacialHair kind={profile.facialHair} color={hairC} />}
          <ellipse cx="16.2" cy="15.6" rx="1.3" ry="0.75" fill="#ff9a9a" opacity="0.32" /><ellipse cx="23.8" cy="15.6" rx="1.3" ry="0.75" fill="#ff9a9a" opacity="0.32" />
          {hairTop(seed.hairStyle, hairC, trim)}
          {/* insigne de rang */}
          {rank === "crown" && <path d="M15.4 5.6 L17.1 2.1 L19 4.8 L20 1.4 L21 4.8 L22.9 2.1 L24.6 5.6 Q20 3.5 15.4 5.6 Z" fill="#ffd54a" stroke="#a9760a" strokeWidth="0.5" />}
          {rank === "diadem" && <path d="M15.7 5.9 Q20 2.8 24.3 5.9 L23 7 Q20 5.2 17 7 Z" fill="#c9b3ff" stroke="#6b48c7" strokeWidth="0.5" />}
          {rank === "captain" && <g stroke={trim} strokeWidth="1.1" fill="none" strokeLinecap="round"><path d="M17.2 4.2 L20 5.8 L22.8 4.2" /></g>}
          {roleProp(type, trim, state)}
        </g>
        {/* indicateur d'état (seulement si activité réelle) */}
        {isAgentWorkingState(state) && <AgentStateGlyph state={state} accent={trim} />}
        {state === "alert" && (<g><line x1="32" y1="3" x2="32" y2="10" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" /><circle cx="32" cy="13.5" r="1.4" fill="#ef4444" /></g>)}
      </svg>
    </div>
  );
}

function AvatarGlasses({ kind }: { kind: GlassesKind }) {
  if (kind === "sunglasses") {
    return (
      <g>
        <rect x="14.2" y="12.1" width="4.6" height="2.6" rx="1" fill="#020617" opacity="0.92" />
        <rect x="21.2" y="12.1" width="4.6" height="2.6" rx="1" fill="#020617" opacity="0.92" />
        <line x1="18.8" y1="13.3" x2="21.2" y2="13.3" stroke="#020617" strokeWidth="0.8" />
      </g>
    );
  }
  if (kind === "round") {
    return (
      <g fill="none" stroke="#111827" strokeWidth="0.75">
        <circle cx="17" cy="13.2" r="2.1" />
        <circle cx="23" cy="13.2" r="2.1" />
        <line x1="19.1" y1="13.2" x2="20.9" y2="13.2" />
      </g>
    );
  }
  if (kind === "square") {
    return (
      <g fill="none" stroke="#111827" strokeWidth="0.75">
        <rect x="14.6" y="11.7" width="4.8" height="3" rx="0.5" />
        <rect x="20.6" y="11.7" width="4.8" height="3" rx="0.5" />
        <line x1="19.4" y1="13.2" x2="20.6" y2="13.2" />
      </g>
    );
  }
  return null;
}

function FacialHair({ kind, color }: { kind: FacialHairKind; color: string }) {
  switch (kind) {
    case "moustache":
      return <path d="M16.6 17.3 Q18.4 15.8 20 17.2 Q21.6 15.8 23.4 17.3 Q21.5 18.4 20 17.7 Q18.5 18.4 16.6 17.3 Z" fill={color} opacity="0.88" />;
    case "stubble":
      return <path d="M16 17.7 Q20 21.2 24 17.7 Q23.2 22.1 20 22.5 Q16.8 22.1 16 17.7 Z" fill={color} opacity="0.2" />;
    case "short_beard":
      return <path d="M15.2 16.8 Q16.5 22.8 20 23.7 Q23.5 22.8 24.8 16.8 Q23.3 20 20 20.4 Q16.7 20 15.2 16.8 Z" fill={color} opacity="0.72" />;
    case "goatee":
      return <g fill={color} opacity="0.82"><path d="M17.2 17.4 Q18.6 16.3 20 17.3 Q21.4 16.3 22.8 17.4 Q21.2 18.3 20 17.8 Q18.8 18.3 17.2 17.4 Z" /><path d="M18.5 20 Q20 22.8 21.5 20 Q20 20.8 18.5 20 Z" /></g>;
    default:
      return null;
  }
}

function AgentStateGlyph({ state, accent }: { state: AgentState; accent: string }) {
  return (
    <g transform="translate(30 8)">
      <circle cx="0" cy="0" r="5.4" fill="#020617" stroke={accent} strokeWidth="0.9" opacity="0.96" />
      {state === "phone" ? (
        <g>
          <rect x="-1.9" y="-3.2" width="3.8" height="6.4" rx="0.8" fill={accent} opacity="0.85" />
          <path d="M2.8 -1.8 L5.3 -0.6 L2.8 0.7 Z" fill={accent} opacity="0.82" />
        </g>
      ) : state === "keyboard" ? (
        <g>
          <rect x="-3.8" y="-2.6" width="7.6" height="5.2" rx="0.6" fill="none" stroke={accent} strokeWidth="0.7" />
          <line x1="-2.8" y1="0" x2="2.8" y2="0" stroke={accent} strokeWidth="0.55" />
        </g>
      ) : state === "inspect" ? (
        <g fill="none" stroke={accent} strokeLinecap="round">
          <circle cx="-1.1" cy="-1" r="2.1" strokeWidth="0.9" />
          <line x1="0.7" y1="0.8" x2="3.7" y2="3.2" strokeWidth="1" />
        </g>
      ) : (
        <path d="M-3 0 L-0.8 2.4 L3.7 -3" fill="none" stroke={accent} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </g>
  );
}

function avatarEyes(style: ReturnType<typeof avatarSeed>["eyeStyle"]) {
  switch (style) {
    case "sharp":
      return <g fill="#1f2937"><path d="M15.9 13.7 L19.4 12.6 L18.7 15 Z" /><path d="M24.1 13.7 L20.6 12.6 L21.3 15 Z" /></g>;
    case "sleepy":
      return <g stroke="#1f2937" strokeWidth="1" strokeLinecap="round"><path d="M16.3 13.6 Q17.7 14.7 19.2 13.7" /><path d="M20.8 13.7 Q22.3 14.7 23.7 13.6" /></g>;
    case "wide":
      return <g><circle cx="17.4" cy="13.5" r="1.55" fill="#1f2937" /><circle cx="22.6" cy="13.5" r="1.55" fill="#1f2937" /><circle cx="17.95" cy="12.95" r="0.48" fill="#fff" opacity="0.9" /><circle cx="23.15" cy="12.95" r="0.48" fill="#fff" opacity="0.9" /></g>;
    case "mono":
      return <rect x="15.7" y="12.7" width="8.6" height="1.8" rx="0.9" fill="#1f2937" opacity="0.92" />;
    case "round":
    default:
      return <g><circle cx="17.7" cy="13.7" r="1.2" fill="#1f2937" /><circle cx="22.3" cy="13.7" r="1.2" fill="#1f2937" /><circle cx="18.15" cy="13.3" r="0.42" fill="#fff" opacity="0.9" /><circle cx="22.75" cy="13.3" r="0.42" fill="#fff" opacity="0.9" /></g>;
  }
}

function avatarNose(style: ReturnType<typeof avatarSeed>["noseStyle"]) {
  switch (style) {
    case "dot":
      return <circle cx="20" cy="16.1" r="0.55" fill="#6b3f25" opacity="0.55" />;
    case "bridge":
      return <path d="M20.2 14.4 L19.4 17.2 L20.9 17.2" fill="none" stroke="#6b3f25" strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.58" />;
    case "wide":
      return <path d="M18.6 16.6 Q20 17.5 21.4 16.6" fill="none" stroke="#6b3f25" strokeWidth="0.75" strokeLinecap="round" opacity="0.58" />;
    case "line":
    default:
      return <path d="M20 14.6 L20 17" stroke="#6b3f25" strokeWidth="0.75" strokeLinecap="round" opacity="0.58" />;
  }
}

/* coiffe par seed → silhouette de tête variée (jamais deux têtes identiques) */
function hairTop(style: string, hairC: string, accent: string) {
  switch (style) {
    case "bald": return null;
    case "short": return <path d="M14.8 11.5 Q16 7 20 7 Q24 7 25.2 11.5 Q22.5 9.4 20 9.4 Q17.5 9.4 14.8 11.5 Z" fill={hairC} />;
    case "curly": return <g fill={hairC}><circle cx="16" cy="9" r="2.2" /><circle cx="20" cy="7.6" r="2.4" /><circle cx="24" cy="9" r="2.2" /></g>;
    case "long": return <g fill={hairC}><path d="M14.6 12 Q15 6.5 20 6.5 Q25 6.5 25.4 12 Q22.6 9 20 9 Q17.4 9 14.6 12 Z" /><path d="M14.6 11 Q13.6 18 15.4 21 L17 20 Q15.6 15 16 11 Z" /><path d="M25.4 11 Q26.4 18 24.6 21 L23 20 Q24.4 15 24 11 Z" /></g>;
    case "cap": return <g><path d="M14.4 10.6 Q15 6.2 20 6.2 Q25 6.2 25.6 10.6 Z" fill={accent} /><rect x="20" y="9.6" width="7" height="1.8" rx="0.9" fill={shade(accent, -20)} /></g>;
    case "helmet": return <g><path d="M14 11 Q14.5 5.4 20 5.4 Q25.5 5.4 26 11 Z" fill="#7c8794" stroke="#4a5560" strokeWidth="0.6" /><rect x="14.5" y="10.2" width="11" height="1.6" fill="#4a5560" /></g>;
    case "hood": return <path d="M13.8 12 Q14.4 4.6 20 4.6 Q25.6 4.6 26.2 12 Q22.6 8 20 8 Q17.4 8 13.8 12 Z" fill={shade(accent, -34)} />;
    default: return <path d="M14.8 11.5 Q16 7 20 7 Q24 7 25.2 11.5 Z" fill={hairC} />;
  }
}

/* accessoire métier par type d'avatar (la signature du rôle, lisible sans label) */
function roleProp(type: AgentAvatarType, accent: string, _state: AgentState) {
  const active = _state === "phone" || _state === "keyboard" || _state === "work";
  switch (type) {
    case "operator": return <g stroke={accent} strokeWidth="1" fill="none"><path d="M14.4 11 Q13.4 14.4 15 16" /><rect x="14.2" y="15.6" width="2.4" height="1.4" rx="0.5" fill={accent} /></g>; // casque/micro
    case "system": return <g><circle cx="30" cy="20" r="3" fill={accent} opacity="0.5" /><circle cx="30" cy="20" r="3" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.6" /></g>; // core IA
    case "trader": return <g><rect x="26.5" y="17" width="7.5" height="5.4" rx="0.8" fill="#0b1320" stroke={accent} strokeWidth="0.8" /><path d="M27.5 21 L29.5 18.8 L31 20 L33 17.6" stroke="#34d399" strokeWidth="0.8" fill="none" /></g>; // tablette chart
    case "analyst": return <g><rect x="27" y="16.5" width="6.5" height="8" rx="0.6" fill="#f1f5f9" stroke={accent} strokeWidth="0.6" />{[0,1,2,3].map(i=><line key={i} x1="28" y1={18+i*1.6} x2="32.5" y2={18+i*1.6} stroke="#64748b" strokeWidth="0.5" />)}</g>; // fiche data
    case "builder": return <g stroke={accent} strokeWidth="1.6" strokeLinecap="round"><path d="M29 24 L33 20" /><circle cx="33.4" cy="19.4" r="1.6" fill="none" /></g>; // clé/outil
    case "publisher": return <g><rect x="26.5" y="17.5" width="7" height="5" rx="1" fill="#0b1320" stroke={accent} strokeWidth="0.8" /><circle cx="30" cy="20" r="1.6" fill="none" stroke={accent} strokeWidth="0.8" /><rect x="32.8" y="18.2" width="1.6" height="1.6" fill={accent} /></g>; // caméra
    case "risk": return <g><path d="M30 15 L34 16.5 V20 Q34 23 30 24.5 Q26 23 26 20 V16.5 Z" fill={accent} opacity="0.22" stroke={accent} strokeWidth="1" /><path d="M28.4 19.6 L29.6 21 L31.8 18.2" stroke={accent} strokeWidth="0.9" fill="none" /></g>; // bouclier
    case "knowledge": return <g><path d="M26.5 17 L30 18 V24 L26.5 23 Z" fill="#0b1320" stroke={accent} strokeWidth="0.7" /><path d="M33.5 17 L30 18 V24 L33.5 23 Z" fill="#0b1320" stroke={accent} strokeWidth="0.7" /></g>; // livre
    case "vipHandler": return <g className={active ? "char-prop" : undefined}><rect x="26.5" y="14" width="4.4" height="7.6" rx="1" fill="#0b1320" stroke="#f5b942" strokeWidth="1" /><rect x="27.2" y="15" width="3" height="5" fill="#f5b942" opacity="0.85" /><circle cx="28.7" cy="20.6" r="0.5" fill="#f5b942" /></g>; // tél gold
    case "telegramHandler": return <g className={active ? "char-prop" : undefined}><rect x="26.5" y="14.5" width="4.2" height="7.2" rx="1" fill="#0b1320" stroke={accent} strokeWidth="0.9" /><rect x="27.1" y="15.4" width="3" height="4.6" fill={accent} opacity="0.8" /><path d="M31.5 15 L35 16.5 L31.5 18 Z" fill={accent} opacity="0.8" /></g>; // tél + paper-plane
    case "assetManager": return <g><path d="M26.5 18 L30 18 L31 16.6 L34 16.6 V23 H26.5 Z" fill="#0b1320" stroke={accent} strokeWidth="0.7" /></g>; // dossier média
    case "notebookPlanner": return <g><rect x="26.5" y="16.5" width="7.5" height="7" rx="0.6" fill="#f8f1df" stroke={accent} strokeWidth="0.7" /><line x1="30.2" y1="16.5" x2="30.2" y2="23.5" stroke={accent} strokeWidth="0.6" />{[0,1,2].map(i=><line key={i} x1="27.4" y1={18+i*1.6} x2="29.6" y2={18+i*1.6} stroke="#94a3b8" strokeWidth="0.5" />)}</g>; // carnet ouvert
    case "proofAuditor": return <g><circle cx="30" cy="20" r="3.6" fill="none" stroke={accent} strokeWidth="1.1" /><path d="M28.4 20 L29.6 21.4 L31.8 18.6" stroke="#34d399" strokeWidth="1" fill="none" /></g>; // sceau preuve
    case "support": return <g><rect x="27" y="16.5" width="6.5" height="8" rx="0.6" fill="#0b1320" stroke={accent} strokeWidth="0.7" /><rect x="29" y="15.4" width="2.5" height="1.8" rx="0.4" fill={accent} />{[0,1,2].map(i=><line key={i} x1="28" y1={19+i*1.6} x2="32.5" y2={19+i*1.6} stroke="#64748b" strokeWidth="0.5" />)}</g>; // clipboard
    default: return null;
  }
}

/* ════════════════════ INSPECTOR agent ════════════════════ */
function AgentInspector({ agent, state, activityLabel, houseName, houseStatus, agentItems, profile, restSeconds, activeSeconds, onClose, onGotoHouse }: { agent: CanonAgent; state: AgentState; activityLabel?: string; houseName: string; houseStatus: { color: string; label: string }; agentItems: InvItem[]; profile?: AgentWorkProfile; restSeconds: number; activeSeconds: number; onClose: () => void; onGotoHouse: () => void }) {
  const c1 = agent.colorPrimary, c2 = agent.colorAccent, hood = shade(agent.houseColor || "#334155", -8);
	  const safeProfile = profile ?? {
	    currentAction: !isAgentWorkingState(state)
	      ? "Repos: aucune mission en exécution prouvée"
	      : activityLabel ?? "Action active non détaillée",
    lastAction: activityLabel ?? "Aucune action récente sourçable",
    nextAction: "Aucun prochain ordre prouvé",
    proof: "Pas de preuve runtime agent",
    tool: null,
    costDailyLabel: !isAgentWorkingState(state) || agentIsLocalNoVariableCost(agent) ? "0 €/j variable" : "non chiffré",
    costMissionLabel: !isAgentWorkingState(state) || agentIsLocalNoVariableCost(agent) ? "0 € mission" : "non chiffré",
    costProof: !isAgentWorkingState(state)
      ? "agent au repos: aucune dépense variable imputée"
      : agentIsLocalNoVariableCost(agent)
        ? "rail local/headless déjà payé"
        : "aucun coût EUR sourçable pour cette action agent",
  };
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-14 w-12 shrink-0 items-end justify-center rounded-lg" style={{ background: `linear-gradient(180deg, ${shade(c1, 20)}22, ${c1}10)`, border: `1px solid ${c1}55` }}>
            <svg viewBox="0 0 40 56" width="42" height="56" style={{ overflow: "visible" }}>
              <ellipse cx="20" cy="50" rx="10" ry="3" fill="#000" opacity="0.35" />
              <path d="M20 17 C13 19 11 30 11 44 L29 44 C29 30 27 19 20 17 Z" fill={c1} stroke={shade(c1, -36)} strokeWidth="1" /><path d="M12 36 Q20 39 28 36" fill="none" stroke={c2} strokeWidth="1.6" />
              <circle cx="20" cy="13" r="5.4" fill="#e8c39e" /><path d="M14.6 12 Q15 5 20 5 Q25 5 25.4 12 Q22.8 8.5 20 8.5 Q17.2 8.5 14.6 12 Z" fill={hood} />
              <circle cx="18.2" cy="13.4" r="0.8" fill="#1f2937" /><circle cx="21.8" cy="13.4" r="0.8" fill="#1f2937" />
            </svg>
          </div>
          <div className="min-w-0"><div className="truncate text-[14px] font-black" style={{ color: c2 }}>{agent.name}</div><div className="truncate text-[10px] uppercase tracking-wide text-slate-400">{agent.roleBadge}</div></div>
        </div>
        <button type="button" onClick={onClose} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button>
      </div>
	      <div className="mt-2 flex flex-wrap gap-1">
	        <span className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${houseStatus.color}22`, color: houseStatus.color, border: `1px solid ${houseStatus.color}55` }}>● {ACT_LABEL[state]}</span>
	        {agent.rankLayer && <span className="inline-block rounded-full border border-slate-700 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-300">{agent.rankLayer.replace(/_/g, " ")}</span>}
		        {safeProfile.tool && isAgentWorkingState(state) && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase" style={{ borderColor: `${safeProfile.tool.color}77`, color: safeProfile.tool.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: safeProfile.tool.color }} />{safeProfile.tool.label}</span>}
	      </div>
		      {activityLabel && isAgentAssignedState(state) && <p className="mt-2 rounded border border-cyan-400/20 bg-cyan-400/5 px-1.5 py-1 text-[9.5px] text-cyan-100">▸ {activityLabel}</p>}
	      <div className="mt-2 grid grid-cols-2 gap-1.5">
	        <div className="rounded-md border border-slate-700/60 bg-slate-900/50 px-2 py-1.5">
	          <p className="text-[8px] font-bold uppercase text-slate-500">Coût agent prouvé</p>
	          <p className="text-[12px] font-black text-slate-100">{safeProfile.costDailyLabel}</p>
	        </div>
	        <div className="rounded-md border border-slate-700/60 bg-slate-900/50 px-2 py-1.5">
	          <p className="text-[8px] font-bold uppercase text-slate-500">Coût mission prouvé</p>
	          <p className="text-[12px] font-black text-slate-100">{safeProfile.costMissionLabel}</p>
	        </div>
	        <div className="rounded-md border border-slate-700/60 bg-slate-900/50 px-2 py-1.5">
	          <p className="text-[8px] font-bold uppercase text-slate-500">Repos cumulé</p>
	          <p className="text-[12px] font-black text-amber-100">{formatDuration(restSeconds)}</p>
	        </div>
	        <div className="rounded-md border border-slate-700/60 bg-slate-900/50 px-2 py-1.5">
	          <p className="text-[8px] font-bold uppercase text-slate-500">Travail cumulé</p>
	          <p className="text-[12px] font-black text-emerald-100">{formatDuration(activeSeconds)}</p>
	        </div>
	      </div>
	      <p className="mt-1 break-words text-[8.5px] leading-snug text-slate-500">Justification dépense: {safeProfile.costProof}</p>
	      <div className="mt-2 rounded-md border border-cyan-400/20 bg-cyan-400/5 p-2">
	        <p className="text-[9px] font-bold uppercase tracking-wide text-cyan-200">Actions agent</p>
	        <div className="mt-1 flex flex-col gap-1">
	          <p className="text-[10px] leading-snug text-slate-300"><span className="font-bold text-slate-100">Dernière:</span> {safeProfile.lastAction}</p>
	          <p className="text-[10px] leading-snug text-slate-300"><span className="font-bold text-slate-100">Maintenant:</span> {safeProfile.currentAction}</p>
	          <p className="text-[10px] leading-snug text-slate-300"><span className="font-bold text-slate-100">Prochaine:</span> {safeProfile.nextAction}</p>
	        </div>
	        <p className="mt-1 break-words text-[8.5px] text-emerald-300/70">Preuve: {safeProfile.proof}</p>
	      </div>
	      <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Maison propriétaire</p>
      <button type="button" onClick={onGotoHouse} className="mt-0.5 flex w-full items-center justify-between rounded border border-slate-700/60 px-2 py-1 text-left hover:border-cyan-300/60"><span className="text-[11px] font-bold text-slate-200">{houseName}</span><span className="text-[9px] font-bold" style={{ color: houseStatus.color }}>● {houseStatus.label}</span></button>
      {agent.boss && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Reporte à</p><p className="text-[11px] text-slate-300">{agent.boss}</p></>)}
      {agent.engine && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Moteur</p><p className="text-[11px] text-slate-300">{agent.engine}</p></>)}
      {agent.responsibilities.length > 0 && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Responsabilités</p><ul className="mt-0.5 flex flex-col gap-0.5">{agent.responsibilities.slice(0, 6).map((r, i) => <li key={i} className="flex gap-1 text-[10px] leading-snug text-slate-300"><span className="text-slate-500">▸</span><span className="min-w-0">{r}</span></li>)}</ul></>)}
      {agentItems.length > 0 && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Inventaire possédé ({agentItems.length})</p><div className="mt-0.5 flex flex-col gap-0.5">{agentItems.slice(0, 24).map((it) => (<div key={it.id} className="flex items-center gap-1.5 rounded border border-slate-800/70 px-1.5 py-0.5" title={it.proof || it.blocker || it.nextAction || ""}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: invColor(it.status) }} /><span className="min-w-0 flex-1 truncate text-[9.5px] text-slate-300">{it.name}</span><span className="shrink-0 text-[7.5px] font-bold" style={{ color: invColor(it.status) }}>{it.status}</span></div>))}{agentItems.length > 24 && <span className="text-[8px] text-slate-500">+{agentItems.length - 24} de plus…</span>}</div></>)}
    </div>
  );
}

export default WorldMapLiving;
