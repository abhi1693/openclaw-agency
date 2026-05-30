/**
 * CofiaTrading World Map — central data-driven configuration (SSOT).
 *
 * Nothing in the renderer is hardcoded: zones, houses, agents and links all
 * come from here. Populated with the REAL CofiaTrading canon — the 15 houses
 * (registry SSOT) and the real agent roster — never generic placeholders.
 *
 * Live status & metrics are layered on top at runtime by the telemetry adapter
 * (see utils/worldMapTelemetry.ts); the values below are the seed used before /
 * when no live source answers, and are always tagged `source: "seed"`.
 */

import type {
  WorldAgent,
  WorldHouse,
  WorldLink,
  WorldMapConfig,
  WorldZone,
} from "../types/worldMap.types";

/* ───────────────────────────── Zones ───────────────────────────── */

export const worldZones: WorldZone[] = [
  { id: "core-command", name: "Core Command", type: "operations", position: { x: 600, y: 120 }, radius: 165, status: "active", accent: "#00B9FF" },
  { id: "intelligence", name: "Intelligence", type: "intelligence", position: { x: 235, y: 185 }, radius: 150, status: "monitoring", accent: "#a78bfa" },
  { id: "content", name: "Content & Growth", type: "content", position: { x: 965, y: 180 }, radius: 160, status: "active", accent: "#f97316" },
  { id: "revenue", name: "Revenue & CRM", type: "revenue", position: { x: 255, y: 515 }, radius: 150, status: "active", accent: "#facc15" },
  { id: "markets", name: "Markets", type: "trading", position: { x: 600, y: 565 }, radius: 140, status: "monitoring", accent: "#34d399" },
  { id: "infrastructure", name: "Ops & Infrastructure", type: "infrastructure", position: { x: 955, y: 525 }, radius: 175, status: "online", accent: "#22d3ee" },
];

/* ───────────────────────────── Houses (15 canon SSOT) ───────────────────────────── */

export const worldHouses: WorldHouse[] = [
  { id: "mission_control_tower", name: "Mission Control Tower", type: "headquarters", asset: "headquarters", zoneId: "core-command", position: { x: 560, y: 100 }, scale: 1.15, status: "active", priority: 1, role: "Orchestration & brief Erwin", tagline: "Le poste de pilotage", metrics: { activity: 92, latency: 24, load: 68 } },
  { id: "central_brain", name: "Central Brain", type: "intelligence", asset: "centralBrain", zoneId: "core-command", position: { x: 668, y: 152 }, scale: 1.1, status: "online", priority: 1, role: "Central Brain / Codex", tagline: "La cervelle", metrics: { activity: 88, latency: 19, load: 61 } },

  { id: "lightrag_observatory", name: "LightRAG Observatory", type: "intelligence", asset: "observatory", zoneId: "intelligence", position: { x: 175, y: 165 }, scale: 0.95, status: "monitoring", priority: 3, role: "LightRAG + Knowledge Graph", metrics: { activity: 64, latency: 41, load: 52 } },
  { id: "obsidian_library", name: "Obsidian Library", type: "intelligence", asset: "library", zoneId: "intelligence", position: { x: 305, y: 235 }, scale: 0.9, status: "online", priority: 4, role: "Vault COF_TRADING", metrics: { activity: 57, latency: 33, load: 38 } },

  { id: "youtube_studio", name: "YouTube Studio", type: "content", asset: "youtubeStudio", zoneId: "content", position: { x: 898, y: 128 }, scale: 1.05, status: "active", priority: 2, role: "Pipeline vidéo + publishing", tagline: "CofiaPublisher", metrics: { activity: 81, latency: 36, load: 74 } },
  { id: "site_seo_lab", name: "Site & SEO Lab", type: "content", asset: "seoLab", zoneId: "content", position: { x: 1016, y: 192 }, scale: 0.95, status: "online", priority: 3, role: "cofiatrading.com + SEO i18n", metrics: { activity: 69, latency: 28, load: 49 } },
  { id: "trading_academy", name: "Trading Academy", type: "education", asset: "academy", zoneId: "content", position: { x: 946, y: 262 }, scale: 0.9, status: "idle", priority: 4, role: "Education + cursus", metrics: { activity: 41, latency: 30, load: 27 } },

  { id: "iron_office", name: "Iron Office", type: "revenue", asset: "ironOffice", zoneId: "revenue", position: { x: 205, y: 490 }, scale: 1.1, status: "active", priority: 1, role: "Iron CRM + revenue market", tagline: "Le moteur cash", metrics: { activity: 90, latency: 26, load: 77 } },
  { id: "vip_gate", name: "VIP Gate", type: "gateway", asset: "vipGate", zoneId: "revenue", position: { x: 322, y: 560 }, scale: 0.95, status: "online", priority: 2, role: "Stripe + CellXpert FTD", metrics: { activity: 72, latency: 22, load: 55 } },

  { id: "mt4_signal_tower", name: "MT4 Signal Tower", type: "trading", asset: "signalTower", zoneId: "markets", position: { x: 600, y: 560 }, scale: 1.05, status: "monitoring", priority: 2, role: "Signaux MT4/MT5 + Rithmic", metrics: { activity: 78, latency: 44, load: 66 } },

  { id: "openclaw_agent_barracks", name: "OpenClaw Barracks", type: "infrastructure", asset: "barracks", zoneId: "infrastructure", position: { x: 853, y: 458 }, scale: 1.0, status: "active", priority: 2, role: "Agents OpenClaw", metrics: { activity: 75, latency: 31, load: 63 } },
  { id: "paperclip_factory", name: "Paperclip Factory", type: "infrastructure", asset: "factory", zoneId: "infrastructure", position: { x: 972, y: 452 }, scale: 0.9, status: "idle", priority: 4, role: "Paperclip universel assets", metrics: { activity: 38, latency: 35, load: 24 } },
  { id: "calendar_tower", name: "Calendar Tower", type: "infrastructure", asset: "calendar", zoneId: "infrastructure", position: { x: 1062, y: 528 }, scale: 0.85, status: "online", priority: 5, role: "Calendar + scheduling", metrics: { activity: 52, latency: 20, load: 33 } },
  { id: "compliance_port", name: "Compliance Port", type: "compliance", asset: "compliance", zoneId: "infrastructure", position: { x: 876, y: 586 }, scale: 0.95, status: "online", priority: 3, role: "Compliance + fiscal + juridique", metrics: { activity: 60, latency: 29, load: 44 } },
  { id: "assets_warehouse", name: "Assets Warehouse", type: "warehouse", asset: "warehouse", zoneId: "infrastructure", position: { x: 988, y: 596 }, scale: 0.9, status: "online", priority: 4, role: "Inventory assets", metrics: { activity: 55, latency: 27, load: 40 } },
];

/* ───────────────────────────── Agents (real CofiaTrading roster) ───────────────────────────── */

export const worldAgents: WorldAgent[] = [
  { id: "codex", name: "Codex", role: "Co-CEO souverain / Directeur IA", asset: "sovereign", homeId: "central_brain", status: "online", animation: "idle", rank: "sovereign", metrics: { signals: 42, accuracy: 98, responseTime: 90 } },
  { id: "luffy", name: "Luffy", role: "Manager Claude", asset: "manager", homeId: "mission_control_tower", status: "active", animation: "idle", rank: "manager", metrics: { signals: 38, accuracy: 96, responseTime: 110 } },
  { id: "jarod", name: "Jarod", role: "COO OpenClaw", asset: "manager", homeId: "openclaw_agent_barracks", status: "active", animation: "idle", rank: "manager", metrics: { signals: 35, accuracy: 94, responseTime: 120 } },
  { id: "kevin", name: "Kevin", role: "Voice interface (Gemini Live)", asset: "voice", homeId: "mission_control_tower", status: "available", animation: "idle", rank: "support", metrics: { signals: 12, accuracy: 90, responseTime: 180 } },

  { id: "antho", name: "Antho", role: "Business", asset: "operator", homeId: "iron_office", status: "active", animation: "idle", rank: "lead", metrics: { signals: 21, accuracy: 89, responseTime: 140 } },
  { id: "david", name: "David", role: "Business / Support broadcaster", asset: "operator", homeId: "iron_office", status: "monitoring", animation: "idle", rank: "core", metrics: { signals: 18, accuracy: 87, responseTime: 150 } },
  { id: "jack", name: "Jack", role: "Affiliation", asset: "operator", homeId: "vip_gate", status: "available", animation: "idle", rank: "senior", metrics: { signals: 16, accuracy: 88, responseTime: 135 } },
  { id: "iron", name: "Iron", role: "Affiliation / CRM closer", asset: "operator", homeId: "iron_office", status: "active", animation: "idle", rank: "senior", metrics: { signals: 27, accuracy: 91, responseTime: 125 } },

  { id: "nova", name: "Nova", role: "Marketing", asset: "marketer", homeId: "youtube_studio", status: "active", animation: "idle", rank: "lead", metrics: { signals: 24, accuracy: 90, responseTime: 130 } },
  { id: "luna", name: "Luna", role: "Marketing", asset: "marketer", homeId: "site_seo_lab", status: "available", animation: "idle", rank: "core", metrics: { signals: 19, accuracy: 88, responseTime: 145 } },
  { id: "atlas", name: "Atlas", role: "Site / DevOps", asset: "operator", homeId: "site_seo_lab", status: "online", animation: "idle", rank: "lead", metrics: { signals: 22, accuracy: 92, responseTime: 115 } },
  { id: "sentinel", name: "Sentinel", role: "DevOps / Monitoring", asset: "guardian", homeId: "central_brain", status: "monitoring", animation: "idle", rank: "senior", metrics: { signals: 31, accuracy: 95, responseTime: 100 } },

  { id: "marco", name: "Marco", role: "Trading lead", asset: "trader", homeId: "mt4_signal_tower", status: "active", animation: "idle", rank: "lead", metrics: { signals: 44, accuracy: 89, responseTime: 95 } },
  { id: "quant", name: "Quant", role: "Quant research", asset: "analyst", homeId: "mt4_signal_tower", status: "monitoring", animation: "idle", rank: "senior", metrics: { signals: 37, accuracy: 93, responseTime: 105 } },
  { id: "lab", name: "Lab", role: "Strategy Lab", asset: "analyst", homeId: "mt4_signal_tower", status: "idle", animation: "idle", rank: "core", metrics: { signals: 15, accuracy: 86, responseTime: 160 } },
  { id: "risk", name: "Risk", role: "Risk manager", asset: "riskManager", homeId: "mt4_signal_tower", status: "monitoring", animation: "idle", rank: "senior", metrics: { signals: 28, accuracy: 94, responseTime: 110 } },
  { id: "mirofish", name: "MiroFish", role: "Predictions", asset: "signalAgent", homeId: "mt4_signal_tower", status: "idle", animation: "idle", rank: "core", metrics: { signals: 9, accuracy: 84, responseTime: 175 } },

  { id: "sonic", name: "Sonic", role: "Social", asset: "marketer", homeId: "youtube_studio", status: "available", animation: "idle", rank: "core", metrics: { signals: 17, accuracy: 87, responseTime: 150 } },

  { id: "oracle", name: "Oracle", role: "Team Claude / Intelligence", asset: "analyst", homeId: "lightrag_observatory", status: "monitoring", animation: "idle", rank: "lead", metrics: { signals: 33, accuracy: 93, responseTime: 108 } },
  { id: "analyste", name: "Analyste", role: "Analyse", asset: "analyst", homeId: "lightrag_observatory", status: "active", animation: "idle", rank: "core", metrics: { signals: 23, accuracy: 90, responseTime: 128 } },
  { id: "stratege", name: "Stratège", role: "Stratégie", asset: "analyst", homeId: "mission_control_tower", status: "monitoring", animation: "idle", rank: "senior", metrics: { signals: 26, accuracy: 92, responseTime: 118 } },
  { id: "reviewer", name: "Reviewer", role: "QA / Review", asset: "guardian", homeId: "obsidian_library", status: "monitoring", animation: "idle", rank: "core", metrics: { signals: 19, accuracy: 93, responseTime: 122 } },
  { id: "copywriter", name: "Copywriter", role: "Copy / Content", asset: "marketer", homeId: "trading_academy", status: "available", animation: "idle", rank: "core", metrics: { signals: 13, accuracy: 86, responseTime: 158 } },

  { id: "guardian", name: "Guardian", role: "Compliance guardian", asset: "guardian", homeId: "compliance_port", status: "monitoring", animation: "idle", rank: "senior", metrics: { signals: 20, accuracy: 95, responseTime: 120 } },
  { id: "fiscal", name: "Fiscal", role: "Fiscalité", asset: "guardian", homeId: "compliance_port", status: "idle", animation: "idle", rank: "core", metrics: { signals: 8, accuracy: 90, responseTime: 165 } },
  { id: "juriste", name: "Juriste", role: "Juridique", asset: "guardian", homeId: "compliance_port", status: "idle", animation: "idle", rank: "core", metrics: { signals: 7, accuracy: 91, responseTime: 170 } },
  { id: "steward", name: "Steward", role: "Assets steward", asset: "operator", homeId: "assets_warehouse", status: "available", animation: "idle", rank: "core", metrics: { signals: 14, accuracy: 88, responseTime: 155 } },
];

/* ───────────────────────────── Links ───────────────────────────── */

/** Explicit house↔house relationships (command / data / network flow). */
export const worldHouseLinks: WorldLink[] = [
  { id: "cmd-brain-mct", fromType: "house", fromId: "central_brain", toType: "house", toId: "mission_control_tower", type: "command", animated: true, strength: 0.95 },
  { id: "cmd-mct-iron", fromType: "house", fromId: "mission_control_tower", toType: "house", toId: "iron_office", type: "command", animated: true, strength: 0.8 },
  { id: "cmd-mct-signal", fromType: "house", fromId: "mission_control_tower", toType: "house", toId: "mt4_signal_tower", type: "command", animated: true, strength: 0.8 },
  { id: "cmd-mct-youtube", fromType: "house", fromId: "mission_control_tower", toType: "house", toId: "youtube_studio", type: "command", animated: true, strength: 0.75 },
  { id: "data-observatory-brain", fromType: "house", fromId: "lightrag_observatory", toType: "house", toId: "central_brain", type: "data", animated: true, strength: 0.7 },
  { id: "data-library-observatory", fromType: "house", fromId: "obsidian_library", toType: "house", toId: "lightrag_observatory", type: "data", animated: true, strength: 0.6 },
  { id: "data-iron-vip", fromType: "house", fromId: "iron_office", toType: "house", toId: "vip_gate", type: "data", animated: true, strength: 0.85 },
  { id: "data-signal-iron", fromType: "house", fromId: "mt4_signal_tower", toType: "house", toId: "iron_office", type: "data", animated: true, strength: 0.65 },
  { id: "net-barracks-brain", fromType: "house", fromId: "openclaw_agent_barracks", toType: "house", toId: "central_brain", type: "network", animated: true, strength: 0.7 },
  { id: "net-factory-youtube", fromType: "house", fromId: "paperclip_factory", toType: "house", toId: "youtube_studio", type: "network", animated: true, strength: 0.6 },
  { id: "net-seo-youtube", fromType: "house", fromId: "site_seo_lab", toType: "house", toId: "youtube_studio", type: "network", animated: false, strength: 0.55 },
  { id: "net-calendar-mct", fromType: "house", fromId: "calendar_tower", toType: "house", toId: "mission_control_tower", type: "network", animated: false, strength: 0.5 },
  { id: "data-compliance-vip", fromType: "house", fromId: "compliance_port", toType: "house", toId: "vip_gate", type: "data", animated: true, strength: 0.55 },
  { id: "net-warehouse-factory", fromType: "house", fromId: "assets_warehouse", toType: "house", toId: "paperclip_factory", type: "network", animated: false, strength: 0.5 },
];

const RANK_STRENGTH: Record<WorldAgent["rank"], number> = {
  sovereign: 0.98,
  manager: 0.92,
  lead: 0.85,
  senior: 0.78,
  core: 0.68,
  support: 0.6,
};

/** Derives one assignment link per agent → its home house. */
export function buildAssignmentLinks(agents: WorldAgent[]): WorldLink[] {
  return agents.map((agent) => ({
    id: `assign-${agent.id}`,
    fromType: "agent" as const,
    fromId: agent.id,
    toType: "house" as const,
    toId: agent.homeId,
    type: "assignment" as const,
    animated: true,
    strength: RANK_STRENGTH[agent.rank],
  }));
}

/* ───────────────────────────── Config ───────────────────────────── */

export const worldMapConfig: WorldMapConfig = {
  meta: {
    name: "CofiaTrading World Map",
    version: "1.0.0",
    mode: "operational",
    brand: "Cofiatrading",
  },
  animation: {
    idleFloatDuration: 4,
    pulseDuration: 2.4,
    linkFlowDuration: 3,
    telemetryIntervalMs: 4000,
    enabled: true,
  },
  zones: worldZones,
  houses: worldHouses,
  agents: worldAgents,
  links: [...worldHouseLinks, ...buildAssignmentLinks(worldAgents)],
};

export default worldMapConfig;
