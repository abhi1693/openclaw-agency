"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resolveAgentType, avatarSeed, AGENT_TYPE_CATALOG, skinHex, hairHex, type AgentAvatarType } from "@/config/cofiatWorldIdentity";

/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — CARTE ISO TACTIQUE (Cof-Island)
 * v3 (2026-05-31) — correction scale + animations pilotées par mission.
 * Même emplacement, même shell, même contrat de props.
 * RÈGLES DURES appliquées :
 *   • MAISONS > AGENTS : bâtiments grands/premium ; persos scalés avec la
 *     carte, ≤ ~40% de la hauteur de leur maison, ancrés sur des slots
 *     devant leur porte (1-3 visibles/maison, reste dans le panneau).
 *   • ZÉRO animation gratuite : aucun déplacement au hasard. Un agent
 *     reste idle discret à sa maison SAUF si une donnée RÉELLE l'active :
 *       statut degraded/down/err → alerte
 *       event feed (message/VIP/Telegram → téléphone ; ticket/service/
 *       reply/publish → clavier ; check/probe/gateway/audit → inspection ;
 *       autre → travail). Sinon : idle.
 *   • Carte propre : terrain iso DOUX (districts en dégradé, pas de damier),
 *     routes de pierre fonctionnelles (highlight si maison sélectionnée),
 *     pas de contour/cercle/courbe décoratif, pas de camion, pas de halo géant.
 * Bind live : registry :8767 (statut), snapshot (KPIs + agents canon),
 * world-state (events réels qui pilotent les animations).
 * ════════════════════════════════════════════════════════════════ */

export type CanonAgent = {
  no: number | null; id: string; name: string; glyph: string; avatarEmoji: string;
  colorPrimary: string; colorAccent: string; roleBadge: string; house: string; houseColor: string;
  rankLayer: string; boss: string; engine: string; responsibilities: string[];
};
export type CofiaSnapshot = {
  revenue?: { currentMrrEur?: number | null; currentArrEur?: number | null; activeVip?: number | null; pastDueEur?: number | null; pastDueCount?: number | null };
  centralBrain?: { housesCount?: number | null };
  assetsWarehouse?: { mp4Count?: number | null; captionsCount?: number | null; assetsInventoryCount?: number | null };
  services?: Array<{ id?: string; label?: string; ok?: boolean; status?: string; role?: string; url?: string; http_code?: number | null }>;
  fetchedAt?: string;
  agentsCanon?: { ok?: boolean; count?: number; sourceTag?: string; agents?: CanonAgent[] };
  openclawRuntime?: {
    sourceTag: string; status: string;
    counts: { total: number; fresh: number; stale: number; noHeartbeat: number; disabled: number; tickEnabled: number; tickExpected: number; servicesOk: number; servicesTotal: number; lobsterConfigured: number | null; lobsterEnabled: number | null };
    jarod: { name: string; runtimeStatus: string; proof: string; nextAction: string } | null;
    services: Array<{ id: string; label: string; ok: boolean; status: string; http_code: number | null }>;
    agents: Array<{ id: string; name: string; team: string; homeHouse: string; runtimeStatus: string; tickEnabled: boolean; proof: string; nextAction: string }>;
    problems: Array<{ severity: string; title: string; proof: string; patch: string }>;
  };
};
export type AngelStatus = "LIVE" | "OPERATIONAL_PARTIAL" | "CANON_GATE" | "AWAITING_SETUP" | "DEGRADED" | "BROKEN";
export type Angel = { id: number; name: string; name_ar: string; platform: string; manzilah: string; status: AngelStatus; mission: string; stack?: string; proof_url?: string; arr_impact_eur_year?: number };
export type FeedEvent = { id: string; kind?: string; status?: string; label: string; source?: string; proof?: string; ts?: string; house_id?: string | null };
export type Truck = { id: string; name: string; from: string; to: string; payload: string; owner: string; cadence?: string; kind?: string; source?: string };
export type AngelRoster = { total_anges?: number; counts?: { live: number; operational_partial: number; canon_gate: number; awaiting_setup: number; degraded: number; broken: number }; anges?: Angel[] };

/* ════════ Projection iso ════════ */
const ISO_W = 32, ISO_H = 16;
const isoProject = (wx: number, wy: number) => ({ sx: (wx - wy) * (ISO_W / 2), sy: (wx + wy) * (ISO_H / 2) });

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
const STONE = "#2c3442", STONE_HI = "#3d4a5c", STONE_LO = "#191f29";

/* ════════ 15 maisons ════════ */
type BuildingType = "command_tower" | "brain" | "village" | "vault" | "observatory" | "factory" | "studio" | "warehouse" | "lab" | "signal_tower" | "academy" | "business" | "gate" | "compliance" | "calendar" | "notebook_alm" | "proof_ledger";
type House = { id: string; name: string; sub: string; x: number; y: number; w: number; h: number; type: BuildingType; zone: ZoneId; roof: "flat" | "pitch" | "saw" | "dome" | "stepped"; levels: number; wall: string; roofColor: string; accent: string; role: string };
const HOUSES: House[] = [
  { id: "obsidian_library", name: "Knowledge Vault", sub: "Obsidian & Drive", x: 50, y: 11, w: 6, h: 5, type: "vault", zone: "knowledge", roof: "flat", levels: 4, wall: "#222b46", roofColor: "#0b1022", accent: "#cbd5f5", role: "Canon, Drive index et bundles sources" },
  { id: "lightrag_observatory", name: "Lighthouse Observatory", sub: "Semantic graph", x: 60, y: 18, w: 6, h: 5, type: "observatory", zone: "knowledge", roof: "dome", levels: 6, wall: "#281e54", roofColor: "#120a28", accent: "#a78bfa", role: "Mémoire sémantique LightRAG, recall sourcé" },
  { id: "paperclip_factory", name: "Paperclip Factory", sub: "Backlog scoring", x: 43, y: 21, w: 7, h: 5, type: "factory", zone: "knowledge", roof: "saw", levels: 4, wall: "#2e1a4d", roofColor: "#140a24", accent: "#7c5cff", role: "Scoring tâches Paperclip et nettoyage backlog" },
  { id: "mt4_signal_tower", name: "Trading Tower", sub: "Markets & Research", x: 22, y: 26, w: 6, h: 6, type: "signal_tower", zone: "academy", roof: "stepped", levels: 8, wall: "#0e261d", roofColor: "#04100a", accent: "#00e676", role: "Recherche trading, paper analytics, STRAT-17/18 LIVE" },
  { id: "trading_academy", name: "Trading Academy", sub: "cofiatrading Academy", x: 34, y: 44, w: 8, h: 5, type: "academy", zone: "academy", roof: "pitch", levels: 5, wall: "#163a5b", roofColor: "#081726", accent: "#38bdf8", role: "Académie : site public → modules → preuves → Trading Tower" },
  { id: "central_brain", name: "Central Brain", sub: "AI Meta-Surveillance", x: 47, y: 32, w: 7, h: 7, type: "brain", zone: "core", roof: "dome", levels: 7, wall: "#2a1455", roofColor: "#100522", accent: "#8b5cf6", role: "Orchestration cross-IA, mémoire vivante, routing missions" },
  { id: "mission_control_tower", name: "Command Tower", sub: "Command & Control", x: 57, y: 36, w: 7, h: 6, type: "command_tower", zone: "core", roof: "stepped", levels: 9, wall: "#103354", roofColor: "#05131f", accent: "#2f9bff", role: "Tour de contrôle, board, priorités, routing GO" },
  { id: "openclaw_agent_barracks", name: "Agents Village", sub: "OpenClaw agents", x: 70, y: 50, w: 9, h: 5, type: "village", zone: "core", roof: "pitch", levels: 3, wall: "#412608", roofColor: "#160a03", accent: "#ff7a00", role: "Runtime OpenClaw et performance agents" },
  { id: "youtube_studio", name: "COF IA Publisher", sub: "Video Production Machine", x: 90, y: 23, w: 7, h: 5, type: "studio", zone: "publishing", roof: "flat", levels: 5, wall: "#46131d", roofColor: "#15050a", accent: "#ff2d55", role: "Machine vidéo : scénarios, render, review, timeline, drafts" },
  { id: "assets_warehouse", name: "Publisher Suite", sub: "Assets · Voice · Distribution", x: 95, y: 39, w: 7, h: 5, type: "warehouse", zone: "publishing", roof: "saw", levels: 4, wall: "#073634", roofColor: "#021413", accent: "#14b8a6", role: "Assets brand, render gallery, voix, packaging, distribution" },
  { id: "site_seo_lab", name: "Site & SEO Lab", sub: "Website & Growth", x: 12, y: 49, w: 6, h: 5, type: "lab", zone: "publishing", roof: "flat", levels: 5, wall: "#122036", roofColor: "#dbe6f5", accent: "#7dd3fc", role: "Site, SEO, tests locaux et deploy readiness" },
  { id: "iron_office", name: "Revenue & CRM", sub: "MRR / VIP / Brokers", x: 30, y: 56, w: 6, h: 5, type: "business", zone: "revenue", roof: "stepped", levels: 6, wall: "#564013", roofColor: "#1d1305", accent: "#ffd400", role: "Revenue, CRM, VIP, FTD et diagnostic brokers" },
  { id: "vip_gate", name: "Telegram Community", sub: "Free / VIP channels", x: 40, y: 70, w: 6, h: 5, type: "gate", zone: "revenue", roof: "pitch", levels: 4, wall: "#0e4576", roofColor: "#05182c", accent: "#00d9ff", role: "Acquisition Telegram, gate VIP et rétention" },
  { id: "compliance_port", name: "Compliance Gate", sub: "CNMV · AEPD · ESMA", x: 82, y: 71, w: 6, h: 5, type: "compliance", zone: "risk", roof: "pitch", levels: 5, wall: "#460914", roofColor: "#150206", accent: "#ff3b52", role: "Compliance CNMV/AEPD/ESMA, safety, DLP, GO packets" },
  { id: "calendar_tower", name: "Calendar Tower", sub: "Recurring missions", x: 94, y: 57, w: 6, h: 5, type: "calendar", zone: "risk", roof: "stepped", levels: 7, wall: "#432b00", roofColor: "#120b00", accent: "#ffb000", role: "Cadence missions et tâches agents récurrentes" },
];
/* ════════ Modules opérationnels (HORS 15 maisons canon) — ALM + Proof Ledger ════════
 * Bâtiments inspectables, statut HONNÊTE config (no-false-green) : non branchés au
 * registry :8767 → statut "MODULE" (violet, ni LIVE ni RED). Placés au centre (zone
 * core) pour remplir le cœur de carte et rester command-adjacent (§23 ALM / §24 Proof). */
const MODULES: House[] = [
  { id: "notebook_alm", name: "NotebookLM", sub: "Google NotebookLM · grounding · 8 notebooks", x: 50, y: 44, w: 6, h: 5, type: "notebook_alm", zone: "core", roof: "flat", levels: 4, wall: "#2d2440", roofColor: "#161226", accent: "#f3e2b3", role: "Google NotebookLM (knowledge grounding). État live (notebooks/fraîcheur) lu via /api/cofiatrading-world-control/notebooklm — voir Proof Ledger › NotebookLM. 0 API publique → push via Chrome cowork." },
  { id: "proof_ledger", name: "Proof Ledger", sub: "Preuve · Audit · No-False-Green", x: 63, y: 48, w: 6, h: 5, type: "proof_ledger", zone: "core", roof: "stepped", levels: 5, wall: "#1b2230", roofColor: "#0b1018", accent: "#cbd5e1", role: "Registre de preuves : tout GREEN/LIVE porte sa preuve sourçable (no-false-green). Source config — vert seulement si preuve réelle." },
];
const ALL_HOUSES: House[] = [...HOUSES, ...MODULES];
const MODULE_IDS = new Set<string>(["notebook_alm", "proof_ledger"]);
const HOUSE_BY_ID: Record<string, House> = Object.fromEntries(ALL_HOUSES.map((h) => [h.id, h]));

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
  cofiapublisher_8540: "youtube_studio", openclaw_gateway_18789: "openclaw_agent_barracks", inventory_8433: "assets_warehouse", lightrag_9621: "lightrag_observatory", paperclip_3100: "paperclip_factory",
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
};

type RuntimeAgent = NonNullable<CofiaSnapshot["openclawRuntime"]>["agents"][number];
type WorldMachine = { id: string; label: string; homeHouse: string; ok: boolean; status: string; role?: string; proof?: string };
/* item d'inventaire (matrice 742) — déjà rattaché à sa maison (houseId) + agent (ownerAgentId) */
export type InvItem = { id: string; name: string; category: string; houseId: string; ownerAgentId?: string; cost?: string; status: string; statusSource?: string; proof?: string; blocker?: string; nextAction?: string; house?: string; ownerHouse?: string };
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
/* resolveHouseId — priorité : houseId → house → ownerHouse → catégorie → "unassigned" (gère le multi-maison "a,b") */
export function resolveHouseIds(item: InvItem): string[] {
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

const runtimeColor = (s: string) => s === "FRESH" || s === "LIVE" || s === "GREEN" ? "#34d399" : s === "SLEEPING" || s === "PAUSED" ? "#64748b" : s === "STALE" || s === "AMBER" || s === "DEGRADED" ? "#f59e0b" : "#ef4444";
function houseStatusStyle(status: string): { color: string; label: string } {
  switch (status) {
    case "LIVE": return { color: "#34d399", label: "LIVE" };
    case "SLEEPING": return { color: "#64748b", label: "EN VEILLE" };
    case "SOURCE_DOWN": return { color: "#ef4444", label: "SOURCE DOWN" };
    case "DEGRADED": return { color: "#f59e0b", label: "DEGRADED" };
    case "REGISTERED": return { color: "#f59e0b", label: "REGISTERED" };
    case "LOADING": return { color: "#64748b", label: "…" };
    case "ERR": return { color: "#fb7185", label: "ERR" };
    case "MODULE": return { color: "#a78bfa", label: "MODULE" };
    case "AMBER": return { color: "#f59e0b", label: "AMBER" };
    default: return { color: "#fb7185", label: status || "ERR" };
  }
}
const ANGEL_STATUS: Record<AngelStatus, { color: string; label: string }> = {
  LIVE: { color: "#10b981", label: "LIVE" }, OPERATIONAL_PARTIAL: { color: "#22d3ee", label: "PARTIEL" }, CANON_GATE: { color: "#38bdf8", label: "CANON GATE" },
  AWAITING_SETUP: { color: "#64748b", label: "À ACTIVER" }, DEGRADED: { color: "#f59e0b", label: "DEGRADED" }, BROKEN: { color: "#ef4444", label: "CASSÉ" },
};
const fmtEur = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) ? `${new Intl.NumberFormat("fr-FR").format(v)} €` : "source down";
const fmtNum = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) ? new Intl.NumberFormat("fr-FR").format(v) : "source down";

/* ════════ géométrie ════════ */
type Pt = { x: number; y: number };
const P = (pt: Pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const centroid = (pts: Pt[]): Pt => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
const insetTowards = (pts: Pt[], k: number): Pt[] => { const c = centroid(pts); return pts.map((p) => lerpPt(p, c, k)); };
const rseed = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
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
const BUILDING_FOOT = 1.12;
const buildingBodyH = (h: House) => 18 + h.levels * 10;

type Rank = "crown" | "diadem" | "captain" | "agent";
function rankFor(a: CanonAgent): Rank { const r = a.rankLayer || ""; if (r.includes("L0")) return "crown"; if (r.includes("L1")) return "diadem"; if (r.includes("L2")) return "captain"; return "agent"; }
const rankPriority = (a: CanonAgent) => ({ crown: 0, diadem: 1, captain: 2, agent: 3 }[rankFor(a)]);

/* état d'un agent dérivé de données RÉELLES (jamais aléatoire) */
type AgentState = "idle" | "alert" | "phone" | "keyboard" | "inspect" | "work";

export function WorldMapLiving({ snapshot, angelRoster, onSelectHouse }: { snapshot: CofiaSnapshot | null; angelRoster?: AngelRoster | null; onSelectHouse: (houseId: string) => void }) {
  const [houseStatuses, setHouseStatuses] = useState<Record<string, string> | null>(null);
  const [onDemandSet, setOnDemandSet] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [toolMachines, setToolMachines] = useState<WorldMachine[]>([]); // outils SaaS rattachés à leur maison (Notion/Linear…), statut depuis probe live
  const [inventory, setInventory] = useState<InvItem[]>([]); // matrice inventaire 742 items, rattachés à leur maison (houseId)
  const [registryError, setRegistryError] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<string | null>(null);
  const [selectedAngel, setSelectedAngel] = useState<Angel | null>(null);
  const [selectedRuntimeAgent, setSelectedRuntimeAgent] = useState<RuntimeAgent | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<WorldMachine | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<CanonAgent | null>(null);
  const [hoverHouse, setHoverHouse] = useState<string | null>(null);
  const [hoverAgent, setHoverAgent] = useState<string | null>(null);
  const [houseTab, setHouseTab] = useState<"vue" | "kpis" | "anges" | "machines" | "inventaire">("vue");
  const [houseKpiData, setHouseKpiData] = useState<Record<string, { kpis: Array<{ label: string; value: string; source?: string }>; gap?: string }> | null>(null);
  const [syncStamp, setSyncStamp] = useState<string>("");
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ cw: number; ch: number }>({ cw: 0, ch: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/cofiatrading-world-control/registry", { cache: "no-store" }); if (!r.ok) throw new Error(`HTTP_${r.status}`);
        const data = await r.json(); const houses = (data?.houses ?? {}) as Record<string, { status?: unknown; on_demand?: unknown }>;
        const map: Record<string, string> = {}; const onDemand = new Set<string>();
        for (const [id, v] of Object.entries(houses)) { if (typeof v?.status === "string") map[id] = v.status; if (v?.on_demand === true) onDemand.add(id); }
        if (!cancelled) { setHouseStatuses(map); setOnDemandSet(onDemand); setRegistryError(false); setSyncStamp(new Date().toLocaleTimeString("fr-FR")); }
      } catch { if (!cancelled) setRegistryError(true); }
    };
    void load(); const iv = window.setInterval(load, 30_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/world-state", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && Array.isArray(d?.events)) setEvents(d.events); }).catch(() => {});
    void load(); const iv = window.setInterval(load, 30_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/house-kpis", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && d?.houses) setHouseKpiData(d.houses); }).catch(() => {});
    void load(); const iv = window.setInterval(load, 60_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  // inventaire 742 items rattachés à leur maison (houseId) — clic maison → onglet Inventaire
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/inventory-matrix", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && Array.isArray(d?.items)) setInventory(d.items as InvItem[]); }).catch(() => {});
    void load(); const iv = window.setInterval(load, 120_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => { fetch("/api/cofiatrading-world-control/trucks", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (Array.isArray(d?.trucks)) setTrucks(d.trucks); }).catch(() => {}); }, []);
  // outils SaaS (Notion/Linear) rattachés à LEUR maison — statut depuis les probes live (jamais faux-vert)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const out: WorldMachine[] = [];
      try {
        const r = await fetch("/api/cofiatrading-world-control/linear", { cache: "no-store" });
        const d = r.ok ? await r.json() : null; const ok = d?.ok === true;
        out.push({ id: "tool_linear", label: "Linear", homeHouse: "paperclip_factory", ok, status: ok ? "LIVE" : "AMBER", role: "Issue/task tracking — app desktop locale + api.linear.app", proof: ok ? `api.linear.app 200 · ${d?.total ?? "?"} issues live` : "probe linear indisponible" });
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/cofiatrading-world-control/notion", { cache: "no-store" });
        const d = r.ok ? await r.json() : null; const liveOk = d?.live?.ok === true; const dbs = Array.isArray(d?.databases) ? d.databases.length : 0;
        out.push({ id: "tool_notion", label: "Notion", homeHouse: "obsidian_library", ok: liveOk || dbs > 0, status: liveOk ? "LIVE" : "AMBER", role: "Docs/knowledge — Notion Desktop local (§15 subscription-first)", proof: liveOk ? "api.notion.com 200 (token live)" : `couvert par Notion Desktop · ${dbs} DBs mappées` });
      } catch { /* ignore */ }
      if (!cancelled) setToolMachines(out);
    };
    void load(); const iv = window.setInterval(load, 60_000); return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => {
    const el = sceneRef.current; if (!el) return;
    const ro = new ResizeObserver((entries) => { for (const e of entries) setSize({ cw: e.contentRect.width, ch: e.contentRect.height }); });
    ro.observe(el); setSize({ cw: el.clientWidth, ch: el.clientHeight }); return () => ro.disconnect();
  }, []);

  // ════════ Caméra (pan/zoom) + mode Édition (drag des maisons) + persistance ════════
  const [cam, setCam] = useState({ z: 1, tx: 0, ty: 0 });
  const [editMode, setEditMode] = useState(false);
  const [posOverride, setPosOverride] = useState<Record<string, { x: number; y: number }>>({});
  const dragRef = useRef<{ mode: "pan" | "house" | null; id?: string; sx: number; sy: number; camTx: number; camTy: number; hx: number; hy: number; moved: boolean }>({ mode: null, sx: 0, sy: 0, camTx: 0, camTy: 0, hx: 0, hy: 0, moved: false });
  const movedRef = useRef(false); // supprime le clic-sélection juste après un drag
  const layoutReady = useRef(false); // évite d'écraser le serveur avant le 1er chargement
  const saveTimer = useRef<number | null>(null);
  // chargement : cache local instantané, PUIS source durable serveur (filesystem = vérité)
  useEffect(() => {
    try { const raw = window.localStorage.getItem("cofiat-world-layout-v1"); if (raw) { const o = JSON.parse(raw); if (o?.pos) setPosOverride(o.pos); if (o?.cam) setCam(o.cam); } } catch { /* ignore */ }
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/layout", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.layout) { if (d.layout.pos) setPosOverride(d.layout.pos); if (d.layout.cam) setCam(d.layout.cam); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) layoutReady.current = true; });
    return () => { cancelled = true; };
  }, []);
  // sauvegarde DURABLE : localStorage immédiat + POST serveur (debounce 600ms)
  useEffect(() => {
    if (!layoutReady.current) return; // pas avant d'avoir chargé (sinon on écrase avec les défauts)
    try { window.localStorage.setItem("cofiat-world-layout-v1", JSON.stringify({ pos: posOverride, cam })); } catch { /* ignore */ }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      fetch("/api/cofiatrading-world-control/layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pos: posOverride, cam }) }).catch(() => {});
    }, 600);
  }, [posOverride, cam]);
  // maisons effectives (positions overridées par l'édition Erwin)
  const effHouses = useMemo(() => ALL_HOUSES.map((h) => (posOverride[h.id] ? { ...h, x: posOverride[h.id].x, y: posOverride[h.id].y } : h)), [posOverride]);
  const EFF_BY_ID = useMemo(() => Object.fromEntries(effHouses.map((h) => [h.id, h])) as Record<string, House>, [effHouses]);

  const statusFor = (id: string): string => {
    if (MODULE_IDS.has(id)) return "AMBER"; // ALM/Proof = modules §23/§24, honnêtes AMBER (jamais GREEN faux-vert)
    if (houseStatuses && houseStatuses[id]) { const raw = houseStatuses[id]; if (onDemandSet.has(id) && (raw === "SOURCE_DOWN" || raw === "DEGRADED")) return "SLEEPING"; return raw; }
    if (registryError) return "ERR"; if (houseStatuses === null) return "LOADING"; return "ERR";
  };

  /* ════════ scène : terrain doux + routes + parcelles (viewBox serré sur les bâtiments) ════════ */
  const scene = useMemo(() => {
    const built = effHouses.map((h) => {
      const cxw = h.x + h.w / 2, cyw = h.y + h.h / 2; const hw = (h.w * BUILDING_FOOT) / 2, hh = (h.h * BUILDING_FOOT) / 2;
      const corners = [[cxw - hw, cyw - hh], [cxw + hw, cyw - hh], [cxw + hw, cyw + hh], [cxw - hw, cyw + hh]].map(([wx, wy]) => isoProject(wx, wy));
      const ground: Pt[] = corners.map((c) => ({ x: c.sx, y: c.sy })); const base = centroid(ground); const bodyH = buildingBodyH(h);
      return { house: h, ground, base, height: bodyH, depth: h.x + h.y };
    });
    // viewBox cadré sur les bâtiments (+ marge modérée) → carte grande dans le viewport
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of built) for (const pt of [...b.ground, { x: b.base.x, y: b.base.y - b.height - 30 }]) { minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y); maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y); }
    const padX = 14, padY = 12; const vbMinX = minX - padX, vbMinY = minY - padY, vbW = maxX - minX + padX * 2, vbH = maxY - minY + padY * 2;

    // île douce (hull serré autour des bâtiments)
    const allGround = built.flatMap((b) => b.ground); const ic = centroid(allGround); const N = 26; const islandPts: Pt[] = [];
    for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2; let mp = -Infinity, far = { x: ic.x, y: ic.y }; for (const p of allGround) { const proj = (p.x - ic.x) * Math.cos(a) + (p.y - ic.y) * Math.sin(a); if (proj > mp) { mp = proj; far = p; } } islandPts.push({ x: far.x + Math.cos(a) * 46, y: far.y + Math.sin(a) * 34 }); }
    const islandPath = smoothClosedPath(islandPts);

    // districts (zones douces, dégradé) — centroïde + rayon depuis l'étalement des membres
    const districts = (Object.keys(ZONES) as ZoneId[]).map((zid) => {
      const members = built.filter((b) => b.house.zone === zid); const c = centroid(members.map((m) => m.base));
      let rx = 60, ry = 36; for (const m of members) { rx = Math.max(rx, Math.abs(m.base.x - c.x) + 70); ry = Math.max(ry, Math.abs(m.base.y - c.y) + 48); }
      return { id: zid, cx: c.x, cy: c.y, rx, ry, label: { x: c.x, y: c.y - ry * 0.78 } };
    });

    // routes (chemins réels)
    const roads = ROAD_LINKS.map(([a, b, kind]) => {
      const ha = EFF_BY_ID[a], hb = EFF_BY_ID[b]; const fa = isoProject(houseFrontWorld(ha).wx, houseFrontWorld(ha).wy), fb = isoProject(houseFrontWorld(hb).wx, houseFrontWorld(hb).wy);
      const mx = (fa.sx + fb.sx) / 2, my = (fa.sy + fb.sy) / 2 - 8;
      return { id: `${a}__${b}`, a, b, d: `M ${fa.sx.toFixed(1)} ${fa.sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${fb.sx.toFixed(1)} ${fb.sy.toFixed(1)}`, w: kind === "main" ? 11 : 7 };
    });

    // lanternes : devant chaque maison
    const lamps: Array<{ x: number; y: number }> = [];
    built.forEach((b) => { const f = isoProject(houseFrontWorld(b.house).wx + b.house.w * 0.7, houseFrontWorld(b.house).wy); lamps.push({ x: f.sx, y: f.sy }); });

    // ── décor Astrub : anneau côtier (plage) + arbres/buissons/rochers en lisière (hors bâtiments) ──
    const coastPts = islandPts.map((p) => ({ x: ic.x + (p.x - ic.x) * 1.08, y: ic.y + (p.y - ic.y) * 1.08 + 3 }));
    const coastPath = smoothClosedPath(coastPts);
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

    return { built, vbMinX, vbMinY, vbW, vbH, viewBox: `${vbMinX.toFixed(0)} ${vbMinY.toFixed(0)} ${vbW.toFixed(0)} ${vbH.toFixed(0)}`, islandPath, coastPath, districts, roads, lamps, decor };
  }, [effHouses]);

  const builtSorted = useMemo(() => [...scene.built].sort((a, b) => a.depth - b.depth), [scene.built]);
  const uiScale = useMemo(() => (size.cw > 0 ? Math.min(size.cw / scene.vbW, size.ch / scene.vbH) : 0), [size, scene.vbW, scene.vbH]);

  const angels = useMemo(() => angelRoster?.anges ?? [], [angelRoster?.anges]);
  const angelsByHome = useMemo(() => { const m: Record<string, Angel[]> = {}; for (const a of angels) (m[ANGEL_HOME_BY_ID[a.id] ?? "central_brain"] ||= []).push(a); return m; }, [angels]);
  const canonAgents = useMemo<CanonAgent[]>(() => (snapshot?.agentsCanon?.agents ?? []).map((a) => ({ ...a, house: HOUSE_BY_ID[a.house] ? a.house : "central_brain" })), [snapshot?.agentsCanon]);
  const agentsByHome = useMemo(() => { const m: Record<string, CanonAgent[]> = {}; for (const a of canonAgents) (m[a.house] ||= []).push(a); for (const k of Object.keys(m)) m[k].sort((x, y) => rankPriority(x) - rankPriority(y)); return m; }, [canonAgents]);

  const liveCount = HOUSES.filter((z) => statusFor(z.id) === "LIVE").length;
  const rev = snapshot?.revenue; const assets = snapshot?.assetsWarehouse;
  const services = useMemo(() => snapshot?.services ?? [], [snapshot?.services]);
  const servicesOk = services.filter((s) => s.ok).length;
  const openclawRuntime = snapshot?.openclawRuntime ?? null;
  const runtimeGateway = openclawRuntime?.services.find((svc) => svc.id === "openclaw_gateway_18789") ?? null;
  const machines = useMemo(() => {
    const merged = new Map<string, WorldMachine>();
    for (const svc of services) { const id = svc.id ?? ""; const hh = SERVICE_HOME_BY_ID[id]; if (!hh) continue; merged.set(id, { id, label: svc.label ?? id, homeHouse: hh, ok: svc.ok === true, status: svc.status ?? (svc.ok ? "LIVE" : "UNKNOWN"), role: svc.role, proof: svc.url }); }
    for (const svc of openclawRuntime?.services ?? []) { const hh = SERVICE_HOME_BY_ID[svc.id]; if (!hh) continue; merged.set(svc.id, { id: svc.id, label: svc.label, homeHouse: hh, ok: svc.ok, status: svc.status, proof: svc.http_code === null ? "no listener / timeout" : `HTTP ${svc.http_code}` }); }
    for (const tm of toolMachines) merged.set(tm.id, tm); // Notion/Linear rattachés à leur maison
    return [...merged.values()];
  }, [services, openclawRuntime, toolMachines]);
  const machinesByHome = useMemo(() => { const map: Record<string, WorldMachine[]> = {}; for (const m of machines) (map[m.homeHouse] ||= []).push(m); return map; }, [machines]);
  // inventaire groupé par maison (un item multi-maison "a,b" est rattaché à chaque maison)
  const inventoryByHouse = useMemo(() => {
    const map: Record<string, InvItem[]> = {};
    for (const it of inventory) for (const h of resolveHouseIds(it)) (map[h] ||= []).push(it);
    return map;
  }, [inventory]);
  const runtimeAgentsByHome = useMemo(() => { const map: Record<string, RuntimeAgent[]> = {}; for (const agent of openclawRuntime?.agents ?? []) { const home = HOUSE_BY_ID[agent.homeHouse] ? agent.homeHouse : "openclaw_agent_barracks"; (map[home] ||= []).push(agent); } return map; }, [openclawRuntime]);
  const selZone = HOUSE_BY_ID[selectedHouse ?? ""] ?? null;

  /* ════════ activité de maison pilotée par events RÉELS (zéro hasard) ════════ */
  const houseActivity = useMemo(() => {
    const map: Record<string, { state: AgentState; label?: string }> = {};
    for (const h of HOUSES) {
      const st = statusFor(h.id);
      if (st === "SOURCE_DOWN" || st === "DEGRADED" || st === "ERR") { map[h.id] = { state: "alert" }; continue; }
      const kws = HOUSE_KEYWORDS[h.id] ?? [];
      // 1) attribution EXPLICITE (house_id structuré côté route world-state)
      // 2) fallback heuristique mots-clés (events sans house_id)
      const ev = events.find((e) => e.house_id === h.id)
        ?? events.find((e) => { if (e.house_id) return false; const hay = `${e.label ?? ""} ${e.source ?? ""} ${e.kind ?? ""}`.toLowerCase(); return kws.some((k) => hay.includes(k)); });
      if (ev) {
        const hay = `${ev.label ?? ""} ${ev.source ?? ""} ${ev.kind ?? ""}`.toLowerCase();
        const state: AgentState = /messag|telegram|whatsapp|vip|\bdm\b|broadcast|channel/.test(hay) ? "phone"
          : /check|probe|inspect|gateway|audit|health|registry|status/.test(hay) ? "inspect"
          : /ticket|reply|support|console|service|publish|render|deploy|caption/.test(hay) ? "keyboard" : "work";
        map[h.id] = { state, label: ev.label };
      } else map[h.id] = { state: "idle" };
    }
    return map;
  }, [events, houseStatuses, onDemandSet, registryError]);

  // agents visibles sur la carte : max 3 par maison, ancrés sur slots devant la porte
  const SLOTS: Array<{ dx: number; dy: number }> = [{ dx: 0, dy: 0.2 }, { dx: -2.6, dy: -0.5 }, { dx: 2.6, dy: -0.5 }];
  const visibleAgents = useMemo(() => {
    const out: Array<{ agent: CanonAgent; wx: number; wy: number; state: AgentState }> = [];
    for (const h of effHouses) {
      const list = agentsByHome[h.id] ?? []; const f = houseFrontWorld(h); const act = houseActivity[h.id]?.state ?? "idle";
      list.slice(0, 3).forEach((agent, i) => {
        const slot = SLOTS[i]; // slot 0 = "lead" → porte l'activité ; alerte = toute la maison
        const state: AgentState = act === "alert" ? "alert" : i === 0 ? act : "idle";
        out.push({ agent, wx: f.wx + slot.dx, wy: f.wy + slot.dy, state });
      });
    }
    return out;
  }, [agentsByHome, houseActivity, effHouses]);

  const project = (wx: number, wy: number) => {
    const { sx, sy } = isoProject(wx, wy); const cx = sx * cam.z + cam.tx, cy = sy * cam.z + cam.ty; // caméra (zoom/pan) en espace SVG
    const scale = uiScale || 0; const rW = scene.vbW * scale, rH = scene.vbH * scale;
    const ox = (size.cw - rW) / 2, oy = (size.ch - rH) / 2; return { x: (cx - scene.vbMinX) * scale + ox, y: (cy - scene.vbMinY) * scale + oy };
  };
  const agentSize = Math.max(26, Math.min(44, uiScale * 38));

  type HouseKpis = { kpis: Array<{ label: string; value: string; source?: string }>; gap?: string };
  const houseKpis = (id: string): HouseKpis => {
    const fromServer = houseKpiData?.[id]; if (fromServer && (fromServer.kpis.length > 0 || fromServer.gap)) return fromServer;
    const a = snapshot?.assetsWarehouse; const pubOk = services.find((s) => (s.id ?? "").includes("publisher") || (s.label ?? "").toLowerCase().includes("publisher"))?.ok;
    switch (id) {
      case "notebook_alm": return { kpis: [{ label: "Type", value: "Google NotebookLM", source: "cofiatWorldIdentity" }, { label: "État live", value: "lu via /api/…/notebooklm — détail dans Proof Ledger › NotebookLM", source: "api" }], gap: "Sources à re-sync (Chrome cowork) + push décisions chantier → notebooks." };
      case "proof_ledger": return { kpis: [{ label: "Type", value: "Module Preuve (config)", source: "cofiatAuthProofLedger" }, { label: "Auth critique", value: "9 GREEN/LIVE prouvés", source: "user_audit ledger" }], gap: "Vert seulement si chaque GREEN/LIVE porte sa preuve sourçable." };
      case "assets_warehouse": return { kpis: [{ label: "MP4", value: fmtNum(a?.mp4Count), source: "inventaire assets local" }, { label: "Captions", value: fmtNum(a?.captionsCount), source: "inventaire assets local" }, { label: "Assets inventoriés", value: fmtNum(a?.assetsInventoryCount), source: "inventaire assets local" }] };
      case "youtube_studio": return { kpis: [{ label: "MP4 prêts", value: fmtNum(a?.mp4Count), source: "inventaire assets local" }, { label: "CofiaPublisher", value: pubOk === true ? "LIVE" : pubOk === false ? "DOWN" : "UNKNOWN", source: "probe :8540" }] };
      case "central_brain": return { kpis: [{ label: "Maisons registry", value: fmtNum(snapshot?.centralBrain?.housesCount), source: "registry :8767" }, { label: "Services OK", value: `${servicesOk}/${services.length}`, source: "probes services locaux" }] };
      case "openclaw_agent_barracks": return { kpis: [{ label: "Agents runtime", value: openclawRuntime ? `${openclawRuntime.counts.fresh}/${openclawRuntime.counts.total} fresh` : "source down", source: "heartbeats" }, { label: "Gateway", value: runtimeGateway ? `${runtimeGateway.status}${runtimeGateway.http_code ? ` ${runtimeGateway.http_code}` : ""}` : "source down", source: "probe :18789" }] };
      default: return { kpis: [] };
    }
  };
  const clearSel = () => { setSelectedHouse(null); setSelectedAngel(null); setSelectedRuntimeAgent(null); setSelectedMachine(null); setSelectedAgent(null); };

  // ── molette = zoom centré sur le curseur (listener natif non-passif) ──
  useEffect(() => {
    const el = sceneRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect(); const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const scale = uiScale || 1; const rW = scene.vbW * scale, rH = scene.vbH * scale; const ox = (size.cw - rW) / 2, oy = (size.ch - rH) / 2;
      const ux = (px - ox) / scale + scene.vbMinX, uy = (py - oy) / scale + scene.vbMinY;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setCam((c) => { const nz = Math.max(0.4, Math.min(4.5, c.z * factor)); const isoX = (ux - c.tx) / c.z, isoY = (uy - c.ty) / c.z; return { z: nz, tx: ux - nz * isoX, ty: uy - nz * isoY }; });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [uiScale, scene.vbW, scene.vbH, scene.vbMinX, scene.vbMinY, size.cw, size.ch]);

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
      const scale = uiScale || 1; setCam((c) => ({ ...c, tx: d.camTx + dxs / scale, ty: d.camTy + dys / scale }));
    } else if (d.mode === "house" && d.id) {
      const f = 1 / ((uiScale || 1) * (cam.z || 1)); const dsx = dxs * f, dsy = dys * f;
      const dwx = dsx / ISO_W + dsy / ISO_H, dwy = dsy / ISO_H - dsx / ISO_W; // inverse iso
      const id = d.id; const nx = +(d.hx + dwx).toFixed(2), ny = +(d.hy + dwy).toFixed(2);
      setPosOverride((p) => ({ ...p, [id]: { x: nx, y: ny } }));
    }
  };
  const onScenePointerUp = () => { dragRef.current = { ...dragRef.current, mode: null }; };

  // boutons vue
  const zoomBy = (factor: number) => setCam((c) => {
    const nz = Math.max(0.4, Math.min(4.5, c.z * factor)); const midX = scene.vbMinX + scene.vbW / 2, midY = scene.vbMinY + scene.vbH / 2;
    const isoX = (midX - c.tx) / c.z, isoY = (midY - c.ty) / c.z; return { z: nz, tx: midX - nz * isoX, ty: midY - nz * isoY };
  });
  // Ajuster : remplir l'écran (cover doux) — l'excédent rogne la marge d'île, jamais les maisons
  const fitView = () => {
    const sx = size.cw / scene.vbW, sy = size.ch / scene.vbH;
    const ratio = (Math.max(sx, sy) || 1) / (Math.min(sx, sy) || 1);
    const z = Math.max(1, Math.min(1.6, ratio));
    const Mx = scene.vbMinX + scene.vbW / 2, My = scene.vbMinY + scene.vbH / 2;
    setCam({ z, tx: Mx * (1 - z), ty: My * (1 - z) });
  };
  const resetLayout = () => { setPosOverride({}); setCam({ z: 1, tx: 0, ty: 0 }); };
  const camG = `translate(${cam.tx.toFixed(2)} ${cam.ty.toFixed(2)}) scale(${cam.z.toFixed(3)})`;

  return (
    <div className="flex w-full max-w-[366px] min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border border-cyan-300/15 bg-slate-950/85 p-3 text-slate-100 shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)] backdrop-blur sm:max-w-[calc(100vw-24px)]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0 flex-1">
          <h2 className="break-words bg-gradient-to-r from-cyan-300 via-sky-200 to-amber-300 bg-clip-text text-base font-black uppercase tracking-wide text-transparent sm:text-xl">COFIATRADING WORLD CONTROL</h2>
          <p className="max-w-full truncate text-[9px] uppercase tracking-[0.16em] text-slate-400 sm:text-[10px] sm:tracking-[0.2em]">Cof-Island · carte iso tactique · 15 maisons · {canonAgents.length} agents</p>
        </div>
        <div className="grid w-full min-w-0 grid-cols-1 items-center gap-1.5 text-[10px] sm:w-auto sm:flex sm:flex-wrap">
          {([["MRR", fmtEur(rev?.currentMrrEur)], ["ARR", fmtEur(rev?.currentArrEur)], ["VIP", fmtNum(rev?.activeVip)], ["Past due", `${fmtEur(rev?.pastDueEur)} / ${fmtNum(rev?.pastDueCount)}`], ["Services", `${servicesOk}/${services.length || "—"}`], ["OpenClaw", openclawRuntime ? `${openclawRuntime.counts.fresh}/${openclawRuntime.counts.total} fresh` : "source down"], ["Gateway", runtimeGateway ? runtimeGateway.status : "source down"], ["Maisons", `${liveCount}/${HOUSES.length} LIVE`], ["Agents", `${canonAgents.length}`], ["Assets", `${fmtNum(assets?.mp4Count)} MP4`]] as Array<[string, string]>).map(([k, v]) => (
            <span key={k} className="flex min-w-0 items-baseline gap-1 rounded-md border border-cyan-300/20 bg-slate-900/70 px-2 py-1"><span className="shrink-0 text-slate-400">{k}</span><span className="min-w-0 truncate font-bold text-slate-100">{v}</span></span>
          ))}
        </div>
      </div>

      <div ref={sceneRef} onPointerDown={onScenePointerDown} onPointerMove={onScenePointerMove} onPointerUp={onScenePointerUp} onPointerCancel={onScenePointerUp} style={{ cursor: editMode ? "grab" : "default", touchAction: "none" }} className="relative h-[640px] min-h-[560px] w-full max-w-full overflow-hidden rounded-xl border border-cyan-300/15 bg-[#0a2228] sm:h-[calc(100vh-176px)]">
        <style>{KEYFRAMES}</style>
        <svg viewBox={scene.viewBox} className="h-full w-full" preserveAspectRatio="xMidYMid meet" onClick={() => { if (movedRef.current) { movedRef.current = false; return; } clearSel(); }}>
          <defs>
            <radialGradient id="sea" cx="50%" cy="40%" r="82%"><stop offset="0%" stopColor="#1d6065" /><stop offset="55%" stopColor="#103e45" /><stop offset="100%" stopColor="#0a2228" /></radialGradient>
            <radialGradient id="land" cx="50%" cy="40%" r="78%"><stop offset="0%" stopColor="#34443f" /><stop offset="55%" stopColor="#243531" /><stop offset="100%" stopColor="#16211f" /></radialGradient>
            <radialGradient id="coast" cx="50%" cy="42%" r="76%"><stop offset="0%" stopColor="#bda66c" /><stop offset="60%" stopColor="#8a7647" /><stop offset="100%" stopColor="#5f4f2f" /></radialGradient>
            <linearGradient id="path" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7d7360" /><stop offset="100%" stopColor="#534b3c" /></linearGradient>
            <linearGradient id="roofSheen" x1="0" y1="0" x2="0.45" y2="1"><stop offset="0%" stopColor="#fff" stopOpacity="0.26" /><stop offset="55%" stopColor="#fff" stopOpacity="0.05" /><stop offset="100%" stopColor="#000" stopOpacity="0.28" /></linearGradient>
            <filter id="softBlur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14" /></filter>
            <radialGradient id="lglow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ffd98a" stopOpacity="0.5" /><stop offset="100%" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
            <pattern id="cobble" width="13" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-26)"><rect x="0.6" y="0.6" width="5" height="2.6" rx="1.3" fill="#ffffff" opacity="0.04" /><rect x="6.8" y="3.6" width="5" height="2.6" rx="1.3" fill="#000000" opacity="0.06" /></pattern>
            {(Object.keys(ZONES) as ZoneId[]).map((zid) => (<radialGradient key={zid} id={`dist-${zid}`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={ZONES[zid].floor} stopOpacity="0.8" /><stop offset="70%" stopColor={ZONES[zid].floor} stopOpacity="0.3" /><stop offset="100%" stopColor={ZONES[zid].floor} stopOpacity="0" /></radialGradient>))}
          </defs>

          {/* mer teal (Astrub) */}
          <rect x="-100000" y="-100000" width="200000" height="200000" fill="url(#sea)" />
          {/* ── CAMÉRA (pan/zoom) ── */}
          <g transform={camG}>
          {/* ombre portée de l'île */}
          <path d={scene.coastPath} fill="#000" opacity="0.5" filter="url(#softBlur)" transform="translate(0 16)" />
          {/* plage / côte sable + écume */}
          <path d={scene.coastPath} fill="url(#coast)" />
          <path d={scene.coastPath} fill="none" stroke="#cdeee9" strokeWidth="2.6" strokeOpacity="0.22" />
          {/* île : sol peint + texture pavé douce */}
          <path d={scene.islandPath} fill="url(#land)" stroke="#0d3a36" strokeWidth="1" strokeOpacity="0.4" />
          <path d={scene.islandPath} fill="url(#cobble)" />
          {/* districts en dégradé doux (sous les chemins) */}
          {scene.districts.map((z) => (<ellipse key={z.id} cx={z.cx} cy={z.cy} rx={z.rx} ry={z.ry} fill={`url(#dist-${z.id})`} opacity="0.5" />))}

          {/* chemins pavés chauds (highlight si maison sélectionnée) */}
          <g>
            {scene.roads.map((r) => {
              const hot = selectedHouse && (r.a === selectedHouse || r.b === selectedHouse);
              const acc = hot ? HOUSE_BY_ID[selectedHouse!]?.accent ?? "#ffe3a0" : null;
              return (<g key={r.id}><path d={r.d} fill="none" stroke="#15120d" strokeWidth={r.w + 5} strokeLinecap="round" opacity="0.5" /><path d={r.d} fill="none" stroke="url(#path)" strokeWidth={r.w + 1} strokeLinecap="round" /><path d={r.d} fill="none" stroke="#c8ac76" strokeWidth={Math.max(1, r.w - 3)} strokeDasharray="0.6 5" strokeLinecap="round" opacity="0.55" />{hot && acc && <path d={r.d} fill="none" stroke={acc} strokeWidth="2.4" strokeLinecap="round" opacity="0.95" />}</g>);
            })}
          </g>

          {/* décor Astrub : arbres / buissons / rochers en lisière (statique) */}
          {scene.decor.map((d, i) => (<g key={`dec-${i}`} transform={`translate(${d.x.toFixed(1)} ${d.y.toFixed(1)}) scale(${d.s.toFixed(2)})`}>
            <ellipse cx="0" cy="1.5" rx={d.kind === "rock" ? 7 : 6} ry="2.4" fill="#000" opacity="0.22" />
            {d.kind === "tree" ? (<><rect x="-1.5" y="-6" width="3" height="9" rx="1.2" fill="#5b3f29" /><ellipse cx="0" cy="-10" rx="9" ry="8" fill="#2f6b43" /><ellipse cx="-3" cy="-12" rx="5.5" ry="5" fill="#3c8253" /><ellipse cx="3.4" cy="-9" rx="5" ry="4.5" fill="#27583a" /><ellipse cx="-2" cy="-14" rx="3" ry="2.6" fill="#57a06e" opacity="0.7" /></>) : d.kind === "bush" ? (<><ellipse cx="-3" cy="-2" rx="4.5" ry="3.6" fill="#2f6b43" /><ellipse cx="2.5" cy="-2.5" rx="4" ry="3.4" fill="#3c8253" /><ellipse cx="0" cy="-4" rx="3.6" ry="3" fill="#4f9665" opacity="0.8" /></>) : (<><path d="M-6 2 Q-7 -4 -1 -5 Q5 -6 6 -1 Q7 3 0 3 Z" fill="#6b7079" stroke="#474b52" strokeWidth="0.6" /><path d="M-4 -1 Q-2 -3 1 -2" fill="none" stroke="#9aa1ab" strokeWidth="0.7" opacity="0.6" /></>)}
          </g>))}

          {/* labels district */}
          {scene.districts.map((z) => { const zc = ZONES[z.id]; return (<g key={`lbl-${z.id}`} opacity="0.82"><text x={z.label.x} y={z.label.y} textAnchor="middle" fontSize="15" fontWeight="900" fill={zc.edge} stroke="#0a1f1c" strokeWidth="3.4" paintOrder="stroke" style={{ letterSpacing: "4px" }}>{zc.label}</text></g>); })}

          {/* lanternes Dofus (poteau + halo chaud, statique) */}
          {scene.lamps.map((l, i) => (<g key={`lamp-${i}`}><ellipse cx={l.x} cy={l.y + 1} rx="3" ry="1.2" fill="#000" opacity="0.25" /><line x1={l.x} y1={l.y} x2={l.x} y2={l.y - 20} stroke="#3a2f22" strokeWidth="1.8" /><path d={`M ${l.x} ${(l.y - 20).toFixed(1)} q 5 0 5 4`} fill="none" stroke="#3a2f22" strokeWidth="1.4" /><circle cx={l.x + 5} cy={l.y - 14} r="7" fill="url(#lglow)" /><rect x={l.x + 3} y={l.y - 17} width="4" height="5.5" rx="1" fill="#1a1206" stroke="#caa14a" strokeWidth="0.8" /><rect x={l.x + 3.7} y={l.y - 16} width="2.6" height="3.6" fill="#ffd98a" opacity="0.9" /></g>))}

          {/* parcelles + bâtiments (tri profondeur) */}
          {builtSorted.map((b) => (<Building key={b.house.id} b={b} editMode={editMode} status={statusFor(b.house.id)} selected={selectedHouse === b.house.id} hover={hoverHouse === b.house.id} dim={!!selectedHouse && selectedHouse !== b.house.id} machines={machinesByHome[b.house.id] ?? []} agentCount={(agentsByHome[b.house.id] ?? []).length} onSelect={() => { if (movedRef.current) { movedRef.current = false; return; } clearSel(); setSelectedHouse(b.house.id); setHouseTab("vue"); onSelectHouse(b.house.id); }} onHover={(v) => setHoverHouse(v ? b.house.id : null)} onMachine={(m) => { clearSel(); setSelectedMachine(m); }} />))}
          </g>
        </svg>

        {/* léger assombrissement des bords (n'intercepte pas les clics) */}
        <div className="pointer-events-none absolute inset-0 rounded-xl" style={{ background: "radial-gradient(120% 120% at 50% 44%, transparent 66%, rgba(0,0,0,0.42))" }} />

        {/* ════════ CONTRÔLE COMPACT (clics protégés du pan via stopPropagation) ════════ */}
        {(() => { const btn = "flex h-6 w-6 items-center justify-center rounded-md text-[13px] font-bold text-slate-300 hover:bg-slate-800/80 hover:text-cyan-100"; return (
        <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="absolute left-2 top-2 z-30 flex items-center gap-0.5 rounded-full border border-cyan-300/20 bg-slate-950/90 px-1.5 py-1 backdrop-blur">
          <button type="button" onClick={() => setEditMode((v) => !v)} title="Mode édition : glisser une maison pour la déplacer (positions sauvegardées)" className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${editMode ? "bg-amber-400/25 text-amber-200" : "text-slate-300 hover:bg-slate-800/80 hover:text-cyan-100"}`}>{editMode ? "✎ Édition" : "Éditer"}</button>
          <span className="mx-0.5 h-4 w-px bg-slate-700" />
          <button type="button" className={btn} title="Dézoomer (ou molette)" onClick={() => zoomBy(1 / 1.25)}>−</button>
          <span className="min-w-[30px] text-center text-[9px] font-bold tabular-nums text-slate-400">{Math.round(cam.z * 100)}%</span>
          <button type="button" className={btn} title="Zoomer (ou molette)" onClick={() => zoomBy(1.25)}>+</button>
          <span className="mx-0.5 h-4 w-px bg-slate-700" />
          <button type="button" className={btn} title="Ajuster — remplir l'écran" onClick={fitView}>⤢</button>
          {editMode && <button type="button" onClick={resetLayout} title="Remettre le layout par défaut (canon)" className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-md text-[13px] text-rose-300 hover:bg-rose-500/15">↺</button>}
          <span className="ml-1 hidden whitespace-nowrap text-[9px] text-slate-500 lg:inline">glisse = déplacer la vue · molette = zoom</span>
        </div>
        ); })()}

        {/* ════════ PERSONNAGES (overlay, ancrés, taille scalée ≤ maison) ════════ */}
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {uiScale > 0 && visibleAgents.map(({ agent, wx, wy, state }) => {
            const { x, y } = project(wx, wy); if (!Number.isFinite(x)) return null;
            const sel = selectedAgent?.id === agent.id; const hov = hoverAgent === agent.id;
            return (<RPGCharacter key={agent.id} agent={agent} x={x} y={y} size={sel ? agentSize + 8 : hov ? agentSize + 4 : agentSize} state={state} selected={sel} hover={hov} onSelect={() => { clearSel(); setSelectedAgent(agent); }} onHover={(v) => setHoverAgent(v ? agent.id : null)} />);
          })}
        </div>

        {/* légende sobre */}
        <div onPointerDown={(e) => e.stopPropagation()} className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-cyan-300/20 bg-slate-950/85 px-3 py-1.5 text-[9px] text-slate-300 backdrop-blur sm:left-1/2 sm:right-auto sm:max-w-[88%] sm:-translate-x-1/2">
          {([["LIVE", "#34d399"], ["EN VEILLE", "#64748b"], ["DEGRADED", "#f59e0b"], ["SOURCE DOWN", "#ef4444"]] as Array<[string, string]>).map(([l, c]) => (<span key={l} className="flex items-center gap-1.5"><svg width="9" height="12" viewBox="0 0 9 12"><rect x="0.5" y="0.5" width="1.6" height="11" fill="#64748b" /><path d="M2 1 L8 2.4 L2 4.2 Z" fill={c} /></svg>{l}</span>))}
          <span className="text-slate-600">|</span>
          <span>agents animés <b className="text-cyan-200">par mission réelle</b> (statut/feed) — sinon idle</span>
        </div>

        {/* ════════ INSPECTOR ════════ */}
        <div onPointerDown={(e) => e.stopPropagation()} className="absolute left-2 right-2 top-2 z-20 flex max-h-[52%] w-auto flex-col overflow-auto rounded-xl border border-cyan-300/25 bg-slate-950/95 p-3 backdrop-blur sm:left-auto sm:right-2 sm:max-h-[94%] sm:w-[266px]">
          {selectedAgent ? (
            <AgentInspector agent={selectedAgent} state={(visibleAgents.find((v) => v.agent.id === selectedAgent.id)?.state) ?? (houseActivity[selectedAgent.house]?.state ?? "idle")} activityLabel={houseActivity[selectedAgent.house]?.label} houseName={HOUSE_BY_ID[selectedAgent.house]?.name ?? selectedAgent.house} houseStatus={houseStatusStyle(statusFor(selectedAgent.house))} agentItems={inventory.filter((it) => ownerMatchesAgent(it.ownerAgentId, selectedAgent))} onClose={() => setSelectedAgent(null)} onGotoHouse={() => { const id = selectedAgent.house; clearSel(); setSelectedHouse(id); setHouseTab("anges"); onSelectHouse(id); }} />
          ) : selectedRuntimeAgent ? (
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
              {(() => {
                const houseAgents = agentsByHome[selZone.id] ?? []; const houseAngels = angelsByHome[selZone.id] ?? []; const houseRuntimeAgents = runtimeAgentsByHome[selZone.id] ?? []; const houseMachines = machinesByHome[selZone.id] ?? []; const houseInv = inventoryByHouse[selZone.id] ?? [];
                const hk = houseKpis(selZone.id); const kpis = hk.kpis;
                const tabs: Array<[typeof houseTab, string]> = [["vue", "Vue"], ["kpis", "KPIs"], ["anges", `Agents ${houseAgents.length}`], ["machines", `Machines ${houseMachines.length}`], ["inventaire", `Inventaire ${houseInv.length}`]];
                return (
                  <>
                    <div className="mt-2 flex gap-1 border-b border-slate-700/50">{tabs.map(([k, label]) => (<button key={k} type="button" onClick={() => setHouseTab(k)} className={`px-1.5 pb-1 text-[9.5px] font-bold uppercase tracking-wide ${houseTab === k ? "border-b-2 border-cyan-300 text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>))}</div>
                    {houseTab === "vue" && (<div className="mt-2"><p className="text-[10px] font-semibold uppercase text-cyan-300">Rôle</p><p className="text-[11px] leading-snug text-slate-300">{selZone.role}</p>{houseActivity[selZone.id]?.label && <p className="mt-2 rounded border border-cyan-400/20 bg-cyan-400/5 px-1.5 py-1 text-[9.5px] text-cyan-100">▸ activité live : {houseActivity[selZone.id]?.label}</p>}<p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Résidents</p><p className="text-[10px] text-slate-300">{houseAgents.length} agents propriétaires · {houseRuntimeAgents.length} runtime · {houseMachines.length} machines</p>{houseAgents.length > 0 && (<div className="mt-2 flex flex-wrap gap-1">{houseAgents.map((a) => (<button key={a.id} type="button" onClick={() => setSelectedAgent(a)} className="flex items-center gap-1 rounded-full border bg-slate-900/60 px-1.5 py-0.5 text-[9px] hover:opacity-90" style={{ borderColor: `${a.colorPrimary}66` }}><span className="inline-block h-2 w-2 rounded-full" style={{ background: a.colorPrimary }} /><span className="font-bold text-slate-200">{a.name}</span></button>))}</div>)}</div>)}
                    {houseTab === "kpis" && (<div className="mt-2">{kpis.length > 0 && (<div className="flex flex-col gap-1">{kpis.map((row) => (<div key={row.label} className="rounded border border-slate-700/50 px-1.5 py-1"><div className="flex items-baseline justify-between gap-2"><span className="text-[9.5px] uppercase text-slate-400">{row.label}</span><span className="text-[11px] font-bold text-slate-100">{row.value}</span></div>{row.source && <span className="block text-[8px] text-emerald-300/55">▸ {row.source}</span>}</div>))}</div>)}{hk.gap && <p className="mt-1 rounded bg-amber-500/10 px-1.5 py-1 text-[9.5px] leading-snug text-amber-300/90">⚠ {hk.gap}</p>}{kpis.length === 0 && !hk.gap && <p className="rounded bg-amber-500/10 px-1.5 py-1 text-[10px] leading-snug text-amber-300/90">KPIs propres à cette maison <b>à migrer</b>.</p>}</div>)}
                    {houseTab === "anges" && (<div className="mt-2">{houseAgents.length > 0 && (<div className="mb-2 grid grid-cols-2 gap-1">{houseAgents.map((a) => (<button key={a.id} type="button" onClick={() => setSelectedAgent(a)} className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-left hover:opacity-90" style={{ borderColor: `${a.colorPrimary}55`, background: `${a.colorPrimary}10` }}><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.colorPrimary, boxShadow: `0 0 5px ${a.colorAccent}` }} /><span className="min-w-0"><span className="block truncate text-[9.5px] font-bold text-slate-100">{a.name}</span><span className="block truncate text-[8px] text-slate-400">{a.roleBadge}</span></span></button>))}</div>)}{houseRuntimeAgents.length > 0 && (<div className="mb-2 rounded border border-orange-400/20 bg-orange-400/8 p-1.5"><p className="text-[9px] font-bold uppercase tracking-wide text-orange-200">Runtime OpenClaw / Lobster</p><div className="mt-1 grid grid-cols-2 gap-1">{houseRuntimeAgents.map((agent) => (<button key={`${agent.id}-${agent.name}`} type="button" onClick={() => setSelectedRuntimeAgent(agent)} className="rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-orange-300/60"><span className="block truncate text-[9.5px] font-bold text-slate-200">{agent.name}</span><span className="text-[8px] font-bold" style={{ color: runtimeColor(agent.runtimeStatus) }}>● {agent.runtimeStatus}</span></button>))}</div></div>)}{houseAngels.length > 0 && (<div className="flex flex-col gap-1">{houseAngels.map((a) => (<button key={a.id} type="button" onClick={() => setSelectedAngel(a)} className="flex items-start gap-1.5 rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-slate-500"><span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ANGEL_STATUS[a.status].color }} /><span className="min-w-0"><span className="text-[10px] font-bold text-slate-200">{a.name}</span><span className="block truncate text-[9px] text-slate-400">{a.mission}</span></span></button>))}</div>)}{!houseAgents.length && !houseAngels.length && !houseRuntimeAgents.length && <span className="text-[10px] text-slate-500">—</span>}</div>)}
                    {houseTab === "machines" && (<div className="mt-2">{houseMachines.length ? (<div className="flex flex-col gap-1">{houseMachines.map((m) => (<button key={m.id} type="button" onClick={() => setSelectedMachine(m)} className="rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-cyan-300/60"><span className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold text-slate-200">{m.label}</span><span className="shrink-0 text-[8px] font-bold" style={{ color: runtimeColor(m.status) }}>● {m.status}</span></span></button>))}</div>) : <p className="text-[10px] text-slate-500">Aucune machine/service canonique attaché.</p>}</div>)}
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
                  </>
                );
              })()}
            </div>
          ) : (
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-cyan-200">Mission Control</p>
              <p className="mt-1 text-[10px] text-slate-400">{HOUSES.length} maisons · {canonAgents.length} agents · clic pour inspecter.</p>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[9.5px]">{(["LIVE", "SLEEPING", "DEGRADED", "SOURCE_DOWN", "ERR"]).map((s) => { const n = HOUSES.filter((z) => statusFor(z.id) === s).length; const st = houseStatusStyle(s); return <div key={s} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: st.color }} /><span className="text-slate-300">{st.label}</span><span className="ml-auto font-bold">{n}</span></div>; })}</div>
              {(() => { const active = Object.entries(houseActivity).filter(([, v]) => v.state !== "idle"); return active.length > 0 ? (<><p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-cyan-300">Activité live ({active.length})</p><div className="mt-1 flex flex-col gap-1">{active.slice(0, 5).map(([hid, v]) => (<button key={hid} type="button" onClick={() => { clearSel(); setSelectedHouse(hid); onSelectHouse(hid); }} className="flex items-center gap-1.5 rounded border border-slate-700/50 px-1.5 py-1 text-left hover:border-cyan-300/50"><span className="inline-block h-2 w-2 rounded-full" style={{ background: v.state === "alert" ? "#ef4444" : "#22d3ee" }} /><span className="min-w-0"><span className="text-[9.5px] font-bold text-slate-200">{HOUSE_BY_ID[hid]?.name}</span><span className="ml-1 text-[8.5px] uppercase text-cyan-300">{ACT_LABEL[v.state]}</span></span></button>))}</div></>) : <p className="mt-2 rounded border border-slate-700/50 px-2 py-1 text-[9.5px] text-slate-400">Aucune activité en cours — agents en idle à leur maison.</p>; })()}
              <p className="mt-2 text-[9px] text-slate-500">sync registry {syncStamp || "…"} · {trucks.length} flux canon (panneau Flux)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ACT_LABEL: Record<AgentState, string> = { idle: "idle", alert: "alerte", phone: "messagerie", keyboard: "traitement", inspect: "inspection", work: "mission" };

/* ════════════════════ BÂTIMENT (grand, premium) ════════════════════ */
type Built = { house: House; ground: Pt[]; base: Pt; height: number; depth: number };
function Building({ b, status, selected, hover, dim, editMode, machines, agentCount, onSelect, onHover, onMachine }: { b: Built; status: string; selected: boolean; hover: boolean; dim: boolean; editMode: boolean; machines: WorldMachine[]; agentCount: number; onSelect: () => void; onHover: (v: boolean) => void; onMachine: (m: WorldMachine) => void }) {
  const h = b.house; const st = houseStatusStyle(status); const ground = b.ground; const bodyH = b.height; const cx = b.base.x; const roofY = b.base.y - bodyH;
  const focus = selected || hover; const alert = status === "SOURCE_DOWN" || status === "DEGRADED" || status === "ERR";
  const body = block(ground, bodyH);
  const cols = Math.max(3, Math.round(h.w * 0.8)); const rows = Math.max(4, h.levels); const seed = h.id.length + Math.round(h.x) + Math.round(h.y);
  const leftWin = faceWindows(ground[3], ground[2], body.top[3], body.top[2], cols, rows, seed);
  const rightWin = faceWindows(ground[1], ground[2], body.top[1], body.top[2], cols, rows, seed + 3);
  const stepped = h.roof === "stepped"; const upper = stepped ? block(insetTowards(body.top, 0.3), bodyH * 0.55) : null;
  const apex = stepped && upper ? { x: cx, y: upper.top[0].y - (upper.top[2].y - upper.top[0].y) / 2 } : { x: cx, y: roofY };
  const doorBL = lerpPt(ground[1], ground[2], 0.58), doorBR = lerpPt(ground[1], ground[2], 0.82);
  const doorTL = { x: doorBL.x, y: doorBL.y - bodyH * 0.2 }, doorTR = { x: doorBR.x, y: doorBR.y - bodyH * 0.2 };
  const signY = apex.y - (h.roof === "dome" ? 30 : 20);
  // parcelle (socle dallé)
  const parcel = insetTowards(ground, -0.28); const lift = 7; const parcelFront = [parcel[3], parcel[2]].map((p) => ({ x: p.x, y: p.y + lift }));

  return (
    <g data-house={h.id} style={{ cursor: editMode ? "grab" : "pointer" }} opacity={dim ? 0.7 : 1} onClick={(e) => { e.stopPropagation(); onSelect(); }} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <ellipse cx={cx} cy={b.base.y + 6} rx={h.w * 8} ry={h.w * 3.4} fill="#000" opacity="0.3" />
      {/* poignée de déplacement (mode édition) */}
      {editMode && <polygon points={insetTowards(parcel, -0.14).map(P).join(" ")} fill="none" stroke="#fbbf24" strokeWidth="1.6" strokeDasharray="4 3" opacity="0.85" />}
      {/* parcelle */}
      <polygon points={[parcel[3], parcel[2], parcelFront[1], parcelFront[0]].map(P).join(" ")} fill={STONE_LO} />
      <polygon points={parcel.map(P).join(" ")} fill={shade(STONE, -6)} stroke={focus ? st.color : STONE_HI} strokeWidth={focus ? 1.5 : 0.7} strokeOpacity={focus ? 0.9 : 0.5} />
      {/* corps */}
      <polygon points={body.leftStr} fill={h.wall} /><polygon points={body.rightStr} fill={shade(h.wall, -18)} />
      {leftWin.map((w, i) => <polygon key={`lw${i}`} points={w.pts} fill={w.lit ? h.accent : "#0a0f1c"} opacity={w.lit ? 0.5 : 0.5} />)}
      {rightWin.map((w, i) => <polygon key={`rw${i}`} points={w.pts} fill={w.lit ? h.accent : "#070b14"} opacity={w.lit ? 0.3 : 0.55} />)}
      <polygon points={body.leftStr} fill="none" stroke={shade(h.accent, -30)} strokeWidth="0.8" opacity="0.55" />
      {/* porte en arche (cadre bois chaud, cozy) */}
      <path d={`M ${P(doorBL)} L ${P(doorBR)} L ${P(doorTR)} Q ${(((doorTL.x + doorTR.x) / 2)).toFixed(1)} ${(((doorTL.y + doorTR.y) / 2) - bodyH * 0.06).toFixed(1)} ${P(doorTL)} Z`} fill="#0a0a12" stroke="#6b5638" strokeWidth="1" strokeOpacity="0.8" />
      <polygon points={body.roofPoly} fill={h.roofColor} /><polygon points={body.roofPoly} fill="url(#roofSheen)" /><polygon points={body.roofPoly} fill="none" stroke={h.accent} strokeWidth={focus ? 1.6 : 1} opacity="0.9" />
      {/* eave : débord de toit (ombre chaude sous l'avant-toit) */}
      <polyline points={`${P(body.top[1])} ${P(body.top[2])} ${P(body.top[3])}`} fill="none" stroke="#161009" strokeWidth="2.2" strokeOpacity="0.45" strokeLinejoin="round" strokeLinecap="round" />
      {stepped && upper && (<><polygon points={upper.leftStr} fill={h.wall} /><polygon points={upper.rightStr} fill={shade(h.wall, -18)} /><polygon points={upper.roofPoly} fill={h.roofColor} /><polygon points={upper.roofPoly} fill="url(#roofSheen)" /><polygon points={upper.roofPoly} fill="none" stroke={h.accent} strokeWidth="1.1" opacity="0.9" /></>)}
      <RoofFeatures h={h} apex={apex} cx={cx} accent={h.accent} />
      {/* bannière suspendue Dofus (drap = accent maison · pastille = statut, anim si alerte) */}
      <g transform={`translate(${(cx - h.w * 6.6).toFixed(1)} ${apex.y.toFixed(1)})`}>
        <line x1="0" y1="2" x2="0" y2="-34" stroke="#5a4a32" strokeWidth="1.6" />
        <line x1="0" y1="-34" x2="11" y2="-34" stroke="#5a4a32" strokeWidth="1.4" />
        <path d="M2 -33 h9 v18 l-4.5 -4 l-4.5 4 Z" fill={h.accent} stroke={shade(h.accent, -45)} strokeWidth="0.7" />
        <path d="M2 -33 h9 v3.5 h-9 Z" fill={shade(h.accent, 30)} opacity="0.5" />
        <circle cx="6.5" cy="-25" r="2.6" fill={st.color} stroke="#0a1410" strokeWidth="0.6">{alert && <animate attributeName="opacity" values="1;0.3;1" dur="0.9s" repeatCount="indefinite" />}</circle>
      </g>
      {/* enseigne picto SVG (zéro emoji) */}
      <g transform={`translate(${cx} ${signY})`}><polygon points="-11,0 -6,-7.5 6,-7.5 11,0 6,7.5 -6,7.5" fill="#071018" stroke={h.accent} strokeWidth="1.2" opacity="0.97" /><g fill="none" stroke={h.accent} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">{houseIcon(h.type)}</g></g>
      {/* machines (puces toit) */}
      {machines.map((m, idx) => { const mxp = cx - Math.min(14, h.w * 2.4) + (idx % 5) * 6.5; const myp = roofY + 13 + Math.floor(idx / 5) * 6.5; const mc = runtimeColor(m.status); return (<g key={m.id} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onMachine(m); }}><title>{`${m.label} — ${m.status}`}</title><rect x={mxp - 3} y={myp - 3} width="6" height="6" rx="1" fill={mc} opacity="0.92">{!m.ok && <animate attributeName="opacity" values="0.4;1;0.4" dur="1.6s" repeatCount="indefinite" />}</rect><circle cx={mxp} cy={myp} r="8" fill="transparent" /></g>); })}
      {/* label + badge agents */}
      <g transform={`translate(${cx + h.w * 6.5} ${roofY - 2})`} opacity={focus ? 1 : 0.92}>
        <rect x="0" y="-9" width={h.name.length * 6 + 30} height="27" rx="5" fill="#020617" stroke={focus ? st.color : "#1e3a52"} strokeWidth={focus ? 1.2 : 0.7} opacity="0.96" />
        <text x="7" y="1.5" fontSize="10" fontWeight="800" fill="#e2e8f0">{h.name}</text>
        <text x="7" y="12.5" fontSize="8" fontWeight="700" fill={st.color}>● {st.label}{agentCount ? ` · ${agentCount} agents` : ""}</text>
      </g>
    </g>
  );
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

/* features de toit STATIQUES (silhouette ; pas d'anim décorative) */
function RoofFeatures({ h, apex, cx, accent }: { h: House; apex: Pt; cx: number; accent: string }) {
  const y = apex.y;
  switch (h.type) {
    case "command_tower": return (<g><line x1={cx} y1={y} x2={cx} y2={y - 26} stroke={accent} strokeWidth="1.6" /><circle cx={cx} cy={y - 26} r="2.6" fill={accent} /><ellipse cx={cx + 8} cy={y - 6} rx="8" ry="3.4" fill="none" stroke={accent} strokeWidth="1.2" opacity="0.85" /></g>);
    case "brain": return (<g><circle cx={cx} cy={y - 5} r="7" fill={accent} opacity="0.45" /><circle cx={cx} cy={y - 5} r="7" fill="none" stroke="#fff" strokeWidth="0.6" opacity="0.5" /></g>);
    case "observatory": return (<g><ellipse cx={cx} cy={y} rx="12" ry="8" fill={h.roofColor} stroke={accent} strokeWidth="1.1" /><line x1={cx} y1={y - 6} x2={cx + 16} y2={y - 16} stroke={accent} strokeWidth="2" opacity="0.6" /></g>);
    case "factory": return (<g><rect x={cx + 5} y={y - 22} width="6" height="22" fill={h.wall} stroke={accent} strokeWidth="0.7" /></g>);
    case "signal_tower": return (<g><line x1={cx} y1={y} x2={cx} y2={y - 24} stroke={accent} strokeWidth="1.6" /><circle cx={cx} cy={y - 24} r="2.6" fill={accent} /></g>);
    case "academy": return (<g><polygon points={`${cx - 16},${y} ${cx},${y - 13} ${cx + 16},${y}`} fill={h.roofColor} stroke={accent} strokeWidth="1.1" />{[-12, -6, 0, 6, 12].map((dx, k) => <line key={k} x1={cx + dx} y1={y} x2={cx + dx} y2={y + 7} stroke={accent} strokeWidth="1.3" opacity="0.7" />)}</g>);
    case "calendar": return (<g><rect x={cx - 10} y={y - 16} width="20" height="17" rx="2" fill={h.roofColor} stroke={accent} strokeWidth="1.1" />{[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={cx - 8 + c * 6} y={y - 8 + r * 4} width="3.4" height="2.4" fill={accent} opacity={(r * 3 + c) % 4 === 0 ? 0.9 : 0.3} />))}</g>);
    case "studio": return (<g><rect x={cx - 14} y={y - 16} width="28" height="15" rx="2" fill="#0a0f1c" stroke={accent} strokeWidth="1.2" /><polygon points={`${cx - 4},${y - 13} ${cx + 6},${y - 8.5} ${cx - 4},${y - 4}`} fill={accent} /></g>);
    case "warehouse": return (<g>{[-9, 0, 9].map((dx, k) => <rect key={k} x={cx + dx - 3.5} y={y - 2} width="7" height="10" rx="1" fill="#0a0f1c" stroke={accent} strokeWidth="0.7" opacity="0.85" />)}</g>);
    case "lab": return (<g><rect x={cx - 9} y={y - 18} width="18" height="18" rx="2" fill={accent} opacity="0.12" stroke={accent} strokeWidth="1.1" /><circle cx={cx} cy={y - 9} r="6.5" fill="none" stroke={accent} strokeWidth="1" /></g>);
    case "vault": return (<g><circle cx={cx} cy={y - 7} r="8" fill="#0a0f1c" stroke={accent} strokeWidth="1.5" /><circle cx={cx} cy={y - 7} r="3.4" fill="none" stroke={accent} strokeWidth="1.1" /></g>);
    case "gate": return (<g><path d={`M ${cx - 12} ${y + 4} L ${cx - 12} ${y - 7} A 12 12 0 0 1 ${cx + 12} ${y - 7} L ${cx + 12} ${y + 4}`} fill="none" stroke={accent} strokeWidth="1.7" opacity="0.85" /></g>);
    case "compliance": return (<g><path d={`M ${cx} ${y - 18} L ${cx + 10} ${y - 13} L ${cx + 10} ${y - 3} Q ${cx + 10} ${y + 5} ${cx} ${y + 8} Q ${cx - 10} ${y + 5} ${cx - 10} ${y - 3} L ${cx - 10} ${y - 13} Z`} fill={accent} opacity="0.16" stroke={accent} strokeWidth="1.4" /></g>);
    case "village": return (<g>{[-12, 0, 12].map((dx, k) => <polygon key={k} points={`${cx + dx - 6},${y} ${cx + dx},${y - 7} ${cx + dx + 6},${y}`} fill={h.roofColor} stroke={accent} strokeWidth="0.9" />)}</g>);
    case "notebook_alm": return (<g><path d={`M ${cx - 13} ${y - 1} L ${cx} ${y - 7} L ${cx} ${y + 7} L ${cx - 13} ${y + 3} Z`} fill={h.roofColor} stroke={accent} strokeWidth="1.1" /><path d={`M ${cx + 13} ${y - 1} L ${cx} ${y - 7} L ${cx} ${y + 7} L ${cx + 13} ${y + 3} Z`} fill="#0a0f1c" stroke={accent} strokeWidth="1.1" />{[0, 1, 2].map((i) => <line key={i} x1={cx - 10} y1={y - 1 + i * 2.2} x2={cx - 2.5} y2={y - 2.4 + i * 2.2} stroke={accent} strokeWidth="0.7" opacity="0.7" />)}</g>); // carnet ouvert sur le toit
    case "proof_ledger": return (<g><polygon points={`${cx},${y - 11} ${cx + 9},${y - 5.5} ${cx + 9},${y + 5.5} ${cx},${y + 11} ${cx - 9},${y + 5.5} ${cx - 9},${y - 5.5}`} fill="#0a0f1c" stroke={accent} strokeWidth="1.3" /><circle cx={cx} cy={y} r="4" fill="none" stroke={accent} strokeWidth="1.1" /><path d={`M ${cx - 2} ${y + 0.2} L ${cx - 0.4} ${y + 2} L ${cx + 2.6} ${y - 2.2}`} stroke={accent} strokeWidth="1.1" fill="none" /></g>); // sceau / médaillon de preuve
    default: return null;
  }
}

/* ════════════════════ PERSONNAGE (vectoriel, états réels) ════════════════════ */
function RPGCharacter({ agent, x, y, size, state, selected, hover, onSelect, onHover }: { agent: CanonAgent; x: number; y: number; size: number; state: AgentState; selected: boolean; hover: boolean; onSelect: () => void; onHover: (v: boolean) => void }) {
  const rank = rankFor(agent); const W = size, Hh = size * 1.4;
  // identité visuelle data-driven : 60% rôle (tunique) · 25% maison (accent) · 15% statut/seed
  const type = resolveAgentType(agent.house, agent.roleBadge);
  const cat = AGENT_TYPE_CATALOG[type];
  const seed = avatarSeed(agent.id);
  const tunic = cat.outfitColor;                 // couleur métier (rôle)
  const trim = agent.colorAccent || "#94a3b8";   // accent maison propriétaire
  const skin = skinHex(seed.skinTone);
  const hairC = hairHex(seed.hairColor);
  const bw = seed.bodyShape === "slim" ? 0.84 : seed.bodyShape === "broad" ? 1.2 : 1; // largeur corps
  const sL = 20 - 7 * bw, sR = 20 + 7 * bw, hL = 20 - 9 * bw, hR = 20 + 9 * bw;
  const cloak = `M${sL.toFixed(1)} 17 C${(sL - 1).toFixed(1)} 24 ${(hL + 1).toFixed(1)} 34 ${hL.toFixed(1)} 44 L${hR.toFixed(1)} 44 C${(hR - 1).toFixed(1)} 34 ${(sR + 1).toFixed(1)} 24 ${sR.toFixed(1)} 17 Z`;
  // tête : forme selon faceShape
  // proportions chibi (Dofus) : grosse tête dominante
  const headRx = seed.faceShape === "soft" ? 7.0 : seed.faceShape === "sharp" ? 5.8 : seed.faceShape === "oval" ? 6.0 : 6.5;
  const headRy = seed.faceShape === "oval" ? 7.0 : seed.faceShape === "round" ? 6.6 : 6.6;
  const idleAnim = state === "idle" ? "char-idle" : state === "alert" ? "char-alert" : "char-active";
  return (
    <div className="pointer-events-auto absolute" style={{ left: x, top: y, width: W, height: Hh, transform: "translate(-50%,-82%)", transition: "left .25s linear, top .25s linear, width .15s, height .15s", zIndex: selected ? 40 : hover ? 36 : 20, cursor: "pointer" }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onSelect(); }} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      {(selected || hover) && (<div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold text-slate-100" style={{ top: -6, background: "rgba(2,6,15,0.95)", borderColor: `${trim}99` }}>{agent.name}<span className="ml-1 font-normal text-slate-400">{agent.roleBadge}</span></div>)}
      <svg viewBox="0 0 40 56" width={W} height={Hh} style={{ overflow: "visible", display: "block" }}>
        <ellipse cx="20" cy="50" rx="10" ry="3" fill="#000" opacity="0.42" />
        {selected && <ellipse cx="20" cy="50" rx="12" ry="3.6" fill="none" stroke={trim} strokeWidth="1.6"><animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" /></ellipse>}
        <g className={idleAnim} style={{ transformOrigin: "20px 48px" }}>
          {/* tunique métier + plastron clair + ceinture accent maison */}
          <path d={cloak} fill={tunic} stroke={shade(tunic, -40)} strokeWidth="1" />
          <path d={`M20 17 C${(20 - 3.4 * bw).toFixed(1)} 23 ${(20 - 3.4 * bw).toFixed(1)} 34 20 44 Z`} fill={shade(tunic, 18)} opacity="0.45" />
          <path d={`M${(hL + 1).toFixed(1)} 35 Q20 38 ${(hR - 1).toFixed(1)} 35`} fill="none" stroke={trim} strokeWidth="1.8" opacity="0.95" />
          {/* mains */}
          <circle cx={sL + 0.5} cy="32" r="2" fill={skin} />
          <circle cx={sR - 0.5} cy="32" r="2" fill={skin} />
          {/* tête */}
          {seed.faceShape === "square"
            ? <rect x={20 - headRx} y={13 - headRy} width={headRx * 2} height={headRy * 2} rx="2.4" fill={skin} stroke={shade(skin, -30)} strokeWidth="0.6" />
            : <ellipse cx="20" cy="13" rx={headRx} ry={headRy} fill={skin} stroke={shade(skin, -30)} strokeWidth="0.6" />}
          {/* gros yeux chibi + reflet + joues rosées */}
          <circle cx="17.7" cy="13.7" r="1.2" fill="#1f2937" /><circle cx="22.3" cy="13.7" r="1.2" fill="#1f2937" />
          <circle cx="18.15" cy="13.3" r="0.42" fill="#fff" opacity="0.9" /><circle cx="22.75" cy="13.3" r="0.42" fill="#fff" opacity="0.9" />
          <ellipse cx="16.2" cy="15.6" rx="1.3" ry="0.75" fill="#ff9a9a" opacity="0.32" /><ellipse cx="23.8" cy="15.6" rx="1.3" ry="0.75" fill="#ff9a9a" opacity="0.32" />
          {/* coiffe selon seed (silhouette de tête distincte) */}
          {hairTop(seed.hairStyle, hairC, trim)}
          {/* insigne de rang */}
          {rank === "crown" && <path d="M14.5 5 L16.5 1 L18.5 4 L20 0 L21.5 4 L23.5 1 L25.5 5 Q20 2.6 14.5 5 Z" fill="#ffd54a" stroke="#a9760a" strokeWidth="0.5" />}
          {rank === "diadem" && <path d="M15 5.5 Q20 1.5 25 5.5 L23.5 7 Q20 4.6 16.5 7 Z" fill="#c9b3ff" stroke="#6b48c7" strokeWidth="0.5" />}
          {rank === "captain" && <g stroke={trim} strokeWidth="1.3" fill="none" strokeLinecap="round"><path d="M17 3.4 L20 5.4 L23 3.4" /></g>}
          {/* accessoire MÉTIER (identité de rôle, toujours présent) */}
          {roleProp(type, trim, state)}
        </g>
        {/* indicateur d'état (seulement si activité réelle) */}
        {state === "alert" && (<g><line x1="32" y1="3" x2="32" y2="10" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round"><animate attributeName="opacity" values="1;0.3;1" dur="0.9s" repeatCount="indefinite" /></line><circle cx="32" cy="13.5" r="1.4" fill="#ef4444" /></g>)}
      </svg>
    </div>
  );
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
function roleProp(type: AgentAvatarType, accent: string, state: AgentState) {
  const active = state !== "idle";
  switch (type) {
    case "operator": return <g stroke={accent} strokeWidth="1" fill="none"><path d="M14.4 11 Q13.4 14.4 15 16" /><rect x="14.2" y="15.6" width="2.4" height="1.4" rx="0.5" fill={accent} /></g>; // casque/micro
    case "system": return <g><circle cx="30" cy="20" r="3" fill={accent} opacity="0.5"><animate attributeName="opacity" values="0.35;0.8;0.35" dur="2.4s" repeatCount="indefinite" /></circle><circle cx="30" cy="20" r="3" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.6" /></g>; // core IA
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
function AgentInspector({ agent, state, activityLabel, houseName, houseStatus, agentItems, onClose, onGotoHouse }: { agent: CanonAgent; state: AgentState; activityLabel?: string; houseName: string; houseStatus: { color: string; label: string }; agentItems: InvItem[]; onClose: () => void; onGotoHouse: () => void }) {
  const c1 = agent.colorPrimary, c2 = agent.colorAccent, hood = shade(agent.houseColor || "#334155", -8);
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
      </div>
      {activityLabel && state !== "idle" && <p className="mt-2 rounded border border-cyan-400/20 bg-cyan-400/5 px-1.5 py-1 text-[9.5px] text-cyan-100">▸ {activityLabel}</p>}
      <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Maison propriétaire</p>
      <button type="button" onClick={onGotoHouse} className="mt-0.5 flex w-full items-center justify-between rounded border border-slate-700/60 px-2 py-1 text-left hover:border-cyan-300/60"><span className="text-[11px] font-bold text-slate-200">{houseName}</span><span className="text-[9px] font-bold" style={{ color: houseStatus.color }}>● {houseStatus.label}</span></button>
      {agent.boss && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Reporte à</p><p className="text-[11px] text-slate-300">{agent.boss}</p></>)}
      {agent.engine && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Moteur</p><p className="text-[11px] text-slate-300">{agent.engine}</p></>)}
      {agent.responsibilities.length > 0 && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Responsabilités</p><ul className="mt-0.5 flex flex-col gap-0.5">{agent.responsibilities.slice(0, 6).map((r, i) => <li key={i} className="flex gap-1 text-[10px] leading-snug text-slate-300"><span className="text-slate-500">▸</span><span className="min-w-0">{r}</span></li>)}</ul></>)}
      {agentItems.length > 0 && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Inventaire possédé ({agentItems.length})</p><div className="mt-0.5 flex flex-col gap-0.5">{agentItems.slice(0, 24).map((it) => (<div key={it.id} className="flex items-center gap-1.5 rounded border border-slate-800/70 px-1.5 py-0.5" title={it.proof || it.blocker || it.nextAction || ""}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: invColor(it.status) }} /><span className="min-w-0 flex-1 truncate text-[9.5px] text-slate-300">{it.name}</span><span className="shrink-0 text-[7.5px] font-bold" style={{ color: invColor(it.status) }}>{it.status}</span></div>))}{agentItems.length > 24 && <span className="text-[8px] text-slate-500">+{agentItems.length - 24} de plus…</span>}</div></>)}
    </div>
  );
}

const KEYFRAMES = `
@keyframes char-idle { 0%,100% { transform: translateY(0) scaleY(1); } 50% { transform: translateY(-0.5px) scaleY(1.012); } }
@keyframes char-active { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-1px) rotate(1deg); } }
@keyframes char-alert { 0%,100% { transform: translateX(-0.5px); } 50% { transform: translateX(0.5px); } }
@keyframes flag-alert { 0%,100% { transform: skewY(0deg); opacity: 1; } 50% { transform: skewY(-8deg); opacity: 0.5; } }
.char-idle { animation: char-idle 3.4s ease-in-out infinite; }
.char-active { animation: char-active 1.6s ease-in-out infinite; }
.char-alert { animation: char-alert 0.5s ease-in-out infinite; }
.char-prop { animation: char-active 1.4s ease-in-out infinite; }
`;

export default WorldMapLiving;
