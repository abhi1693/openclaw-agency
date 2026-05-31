"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — CITÉ JEU ISOMÉTRIQUE (Cof-Island)
 * Refonte game-like 2.5D (2026-05-31 v2). Même emplacement, même shell,
 * même contrat de props. Direction artistique ORIGINALE CofiatTrading :
 *   • terrain dallé iso (districts colorés, herbe/pierre/côte) — pas un fond noir
 *   • routes de pierre + places + parcelles-bases sous chaque maison
 *   • 15 bâtiments iso typés (silhouette + topper + enseigne PICTO SVG)
 *   • 38 agents = VRAIS personnages RPG vectoriels (cape, tête, coiffe de
 *     rang) — zéro emoji, zéro point, zéro gros rond — rattachés à leur
 *     maison et qui se déplacent sur les routes (machine à états + facing)
 *   • décor utile : arbres, lampadaires, caisses, panneaux
 *   • halos décoratifs supprimés : chaque accent = une info (statut/sélection/mouvement)
 * Bind live : registry :8767 (statut), snapshot (KPIs + agents canon),
 * trucks / world-state (flux + events).
 * ════════════════════════════════════════════════════════════════ */

export type CanonAgent = {
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
};

export type CofiaSnapshot = {
  revenue?: {
    currentMrrEur?: number | null;
    currentArrEur?: number | null;
    activeVip?: number | null;
    pastDueEur?: number | null;
    pastDueCount?: number | null;
  };
  centralBrain?: { housesCount?: number | null };
  assetsWarehouse?: {
    mp4Count?: number | null;
    captionsCount?: number | null;
    assetsInventoryCount?: number | null;
  };
  services?: Array<{ id?: string; label?: string; ok?: boolean; status?: string; role?: string; url?: string; http_code?: number | null }>;
  fetchedAt?: string;
  agentsCanon?: { ok?: boolean; count?: number; sourceTag?: string; agents?: CanonAgent[] };
  openclawRuntime?: {
    sourceTag: string;
    status: string;
    counts: {
      total: number; fresh: number; stale: number; noHeartbeat: number; disabled: number;
      tickEnabled: number; tickExpected: number; servicesOk: number; servicesTotal: number;
      lobsterConfigured: number | null; lobsterEnabled: number | null;
    };
    jarod: { name: string; runtimeStatus: string; proof: string; nextAction: string } | null;
    services: Array<{ id: string; label: string; ok: boolean; status: string; http_code: number | null }>;
    agents: Array<{ id: string; name: string; team: string; homeHouse: string; runtimeStatus: string; tickEnabled: boolean; proof: string; nextAction: string }>;
    problems: Array<{ severity: string; title: string; proof: string; patch: string }>;
  };
};

export type AngelStatus = "LIVE" | "OPERATIONAL_PARTIAL" | "CANON_GATE" | "AWAITING_SETUP" | "DEGRADED" | "BROKEN";
export type Angel = { id: number; name: string; name_ar: string; platform: string; manzilah: string; status: AngelStatus; mission: string; stack?: string; proof_url?: string; arr_impact_eur_year?: number };
export type FeedEvent = { id: string; kind?: string; status?: string; label: string; source?: string; proof?: string; ts?: string };
export type Truck = { id: string; name: string; from: string; to: string; payload: string; owner: string; cadence?: string; kind?: string; source?: string };
export type AngelRoster = { total_anges?: number; counts?: { live: number; operational_partial: number; canon_gate: number; awaiting_setup: number; degraded: number; broken: number }; anges?: Angel[] };

/* ════════ Projection iso (2:1) ════════ */
const ISO_W = 32;
const ISO_H = 16;
const isoProject = (wx: number, wy: number) => ({ sx: (wx - wy) * (ISO_W / 2), sy: (wx + wy) * (ISO_H / 2) });

/* ════════ Districts (sol coloré + bordure) ════════ */
type ZoneId = "core" | "knowledge" | "publishing" | "academy" | "revenue" | "risk";
const ZONES: Record<ZoneId, { label: string; sub: string; floor: string; edge: string }> = {
  core:       { label: "CORE",       sub: "Command & Brain",        floor: "#17233e", edge: "#2f9bff" },
  knowledge:  { label: "KNOWLEDGE",  sub: "Vault · Graph · Backlog", floor: "#1d1838", edge: "#a78bfa" },
  publishing: { label: "PUBLISHING", sub: "Studio · Assets · Site",  floor: "#291625", edge: "#ff5b7f" },
  academy:    { label: "ACADEMY",    sub: "Markets & Education",      floor: "#10271f", edge: "#2dd4bf" },
  revenue:    { label: "REVENUE",    sub: "CRM · VIP · Brokers",      floor: "#262011", edge: "#ffc93c" },
  risk:       { label: "RISK",       sub: "Compliance & Cadence",     floor: "#271419", edge: "#ff5470" },
};
const GRASS = "#16241c";
const STONE = "#2b3340";
const STONE_HI = "#3a4658";
const STONE_LO = "#1a212c";
const SAND = "#243a48";

/* ════════ 15 maisons : type · zone · palette · position iso ════════ */
type BuildingType =
  | "command_tower" | "brain" | "village" | "vault" | "observatory" | "factory"
  | "studio" | "warehouse" | "lab" | "signal_tower" | "academy" | "business" | "gate" | "compliance" | "calendar";
type House = {
  id: string; name: string; sub: string;
  x: number; y: number; w: number; h: number;
  type: BuildingType; zone: ZoneId;
  roof: "flat" | "pitch" | "saw" | "dome" | "stepped";
  levels: number; wall: string; roofColor: string; accent: string; role: string;
};
const HOUSES: House[] = [
  { id: "obsidian_library", name: "Knowledge Vault", sub: "Obsidian & Drive", x: 50, y: 10, w: 5, h: 4, type: "vault", zone: "knowledge", roof: "flat", levels: 3, wall: "#1f2840", roofColor: "#0b1022", accent: "#cbd5f5", role: "Canon, Drive index et bundles sources" },
  { id: "lightrag_observatory", name: "Lighthouse Observatory", sub: "Semantic graph", x: 58, y: 17, w: 5, h: 4, type: "observatory", zone: "knowledge", roof: "dome", levels: 5, wall: "#241b4d", roofColor: "#120a28", accent: "#a78bfa", role: "Mémoire sémantique LightRAG, recall sourcé" },
  { id: "paperclip_factory", name: "Paperclip Factory", sub: "Backlog scoring", x: 43, y: 20, w: 6, h: 4, type: "factory", zone: "knowledge", roof: "saw", levels: 3, wall: "#2a1746", roofColor: "#140a24", accent: "#7c5cff", role: "Scoring tâches Paperclip et nettoyage backlog" },
  { id: "mt4_signal_tower", name: "Trading Tower", sub: "Markets & Research", x: 23, y: 25, w: 5, h: 5, type: "signal_tower", zone: "academy", roof: "stepped", levels: 7, wall: "#0c2018", roofColor: "#04100a", accent: "#00e676", role: "Recherche trading, paper analytics, STRAT-17/18 LIVE" },
  { id: "trading_academy", name: "Trading Academy", sub: "cofiatrading Academy", x: 35, y: 42, w: 7, h: 4, type: "academy", zone: "academy", roof: "pitch", levels: 4, wall: "#143350", roofColor: "#081726", accent: "#38bdf8", role: "Académie : site public → modules → preuves → Trading Tower" },
  { id: "central_brain", name: "Central Brain", sub: "AI Meta-Surveillance", x: 47, y: 31, w: 6, h: 6, type: "brain", zone: "core", roof: "dome", levels: 6, wall: "#241149", roofColor: "#100522", accent: "#8b5cf6", role: "Orchestration cross-IA, mémoire vivante, routing missions" },
  { id: "mission_control_tower", name: "Command Tower", sub: "Command & Control", x: 56, y: 35, w: 6, h: 5, type: "command_tower", zone: "core", roof: "stepped", levels: 8, wall: "#0f2c49", roofColor: "#05131f", accent: "#2f9bff", role: "Tour de contrôle, board, priorités, routing GO" },
  { id: "openclaw_agent_barracks", name: "Agents Village", sub: "OpenClaw agents", x: 68, y: 49, w: 8, h: 4, type: "village", zone: "core", roof: "pitch", levels: 2, wall: "#3a2207", roofColor: "#160a03", accent: "#ff7a00", role: "Runtime OpenClaw et performance agents" },
  { id: "youtube_studio", name: "COF IA Publisher", sub: "Video Production Machine", x: 92, y: 22, w: 6, h: 4, type: "studio", zone: "publishing", roof: "flat", levels: 4, wall: "#3f1119", roofColor: "#15050a", accent: "#ff2d55", role: "Machine vidéo : scénarios, render, review, timeline, drafts" },
  { id: "assets_warehouse", name: "Publisher Suite", sub: "Assets · Voice · Distribution", x: 96, y: 38, w: 6, h: 4, type: "warehouse", zone: "publishing", roof: "saw", levels: 3, wall: "#062f2d", roofColor: "#021413", accent: "#14b8a6", role: "Assets brand, render gallery, voix, packaging, distribution" },
  { id: "site_seo_lab", name: "Site & SEO Lab", sub: "Website & Growth", x: 13, y: 48, w: 5, h: 4, type: "lab", zone: "publishing", roof: "flat", levels: 4, wall: "#101b2e", roofColor: "#dbe6f5", accent: "#7dd3fc", role: "Site, SEO, tests locaux et deploy readiness" },
  { id: "iron_office", name: "Revenue & CRM", sub: "MRR / VIP / Brokers", x: 31, y: 54, w: 5, h: 4, type: "business", zone: "revenue", roof: "stepped", levels: 5, wall: "#4a3411", roofColor: "#1d1305", accent: "#ffd400", role: "Revenue, CRM, VIP, FTD et diagnostic brokers" },
  { id: "vip_gate", name: "Telegram Community", sub: "Free / VIP channels", x: 40, y: 68, w: 5, h: 4, type: "gate", zone: "revenue", roof: "pitch", levels: 3, wall: "#0c3a66", roofColor: "#05182c", accent: "#00d9ff", role: "Acquisition Telegram, gate VIP et rétention" },
  { id: "compliance_port", name: "Compliance Gate", sub: "CNMV · AEPD · ESMA", x: 82, y: 70, w: 5, h: 4, type: "compliance", zone: "risk", roof: "pitch", levels: 4, wall: "#3c0712", roofColor: "#150206", accent: "#ff3b52", role: "Compliance CNMV/AEPD/ESMA, safety, DLP, GO packets" },
  { id: "calendar_tower", name: "Calendar Tower", sub: "Recurring missions", x: 95, y: 56, w: 5, h: 4, type: "calendar", zone: "risk", roof: "stepped", levels: 6, wall: "#3a2500", roofColor: "#120b00", accent: "#ffb000", role: "Cadence missions et tâches agents récurrentes" },
];
const HOUSE_BY_ID: Record<string, House> = Object.fromEntries(HOUSES.map((h) => [h.id, h]));

/* ════════ Réseau de routes (visuel + déplacement) ════════ */
const ROAD_LINKS: Array<[string, string, "main" | "second"]> = [
  ["central_brain", "mission_control_tower", "main"],
  ["mission_control_tower", "openclaw_agent_barracks", "main"],
  ["central_brain", "openclaw_agent_barracks", "second"],
  ["central_brain", "paperclip_factory", "main"],
  ["paperclip_factory", "lightrag_observatory", "second"],
  ["lightrag_observatory", "obsidian_library", "second"],
  ["paperclip_factory", "obsidian_library", "second"],
  ["central_brain", "trading_academy", "main"],
  ["trading_academy", "mt4_signal_tower", "second"],
  ["mt4_signal_tower", "site_seo_lab", "second"],
  ["mission_control_tower", "iron_office", "main"],
  ["iron_office", "trading_academy", "second"],
  ["iron_office", "vip_gate", "main"],
  ["vip_gate", "compliance_port", "second"],
  ["mission_control_tower", "youtube_studio", "main"],
  ["youtube_studio", "assets_warehouse", "main"],
  ["assets_warehouse", "calendar_tower", "second"],
  ["calendar_tower", "compliance_port", "second"],
  ["site_seo_lab", "trading_academy", "second"],
  ["openclaw_agent_barracks", "assets_warehouse", "second"],
];
const ADJACENCY: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const [a, b] of ROAD_LINKS) { (m[a] ||= []).push(b); (m[b] ||= []).push(a); }
  return m;
})();

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

type RuntimeAgent = NonNullable<CofiaSnapshot["openclawRuntime"]>["agents"][number];
type WorldMachine = { id: string; label: string; homeHouse: string; ok: boolean; status: string; role?: string; proof?: string };

const runtimeColor = (status: string) =>
  status === "FRESH" || status === "LIVE" || status === "GREEN" ? "#34d399"
  : status === "SLEEPING" || status === "PAUSED" ? "#64748b"
  : status === "STALE" || status === "AMBER" || status === "DEGRADED" ? "#f59e0b" : "#ef4444";

function houseStatusStyle(status: string): { color: string; label: string } {
  switch (status) {
    case "LIVE": return { color: "#34d399", label: "LIVE" };
    case "SLEEPING": return { color: "#64748b", label: "EN VEILLE" };
    case "SOURCE_DOWN": return { color: "#ef4444", label: "SOURCE DOWN" };
    case "DEGRADED": return { color: "#f59e0b", label: "DEGRADED" };
    case "REGISTERED": return { color: "#f59e0b", label: "REGISTERED" };
    case "LOADING": return { color: "#64748b", label: "…" };
    case "ERR": return { color: "#fb7185", label: "ERR" };
    default: return { color: "#fb7185", label: status || "ERR" };
  }
}
const ANGEL_STATUS: Record<AngelStatus, { color: string; label: string }> = {
  LIVE: { color: "#10b981", label: "LIVE" }, OPERATIONAL_PARTIAL: { color: "#22d3ee", label: "PARTIEL" }, CANON_GATE: { color: "#38bdf8", label: "CANON GATE" },
  AWAITING_SETUP: { color: "#64748b", label: "À ACTIVER" }, DEGRADED: { color: "#f59e0b", label: "DEGRADED" }, BROKEN: { color: "#ef4444", label: "CASSÉ" },
};
const fmtEur = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) ? `${new Intl.NumberFormat("fr-FR").format(v)} €` : "source down";
const fmtNum = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) ? new Intl.NumberFormat("fr-FR").format(v) : "source down";

/* ════════ Géométrie ════════ */
type Pt = { x: number; y: number };
const P = (pt: Pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const centroid = (pts: Pt[]): Pt => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
const insetTowards = (pts: Pt[], k: number): Pt[] => { const c = centroid(pts); return pts.map((p) => lerpPt(p, c, k)); };
const rseed = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
function shade(hex: string, amt: number): string {
  const h = hex.replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt))); g = Math.max(0, Math.min(255, Math.round(g + amt))); b = Math.max(0, Math.min(255, Math.round(b + amt)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

type Win = { pts: string; lit: boolean };
function faceWindows(BL: Pt, BR: Pt, TL: Pt, TR: Pt, cols: number, rows: number, seed: number): Win[] {
  const out: Win[] = []; const mx = 0.22, my = 0.26;
  const at = (u: number, v: number): Pt => lerpPt(lerpPt(BL, BR, u), lerpPt(TL, TR, u), v);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = at((c + mx) / cols, (r + my) / rows), b = at((c + 1 - mx) / cols, (r + my) / rows);
    const d = at((c + 1 - mx) / cols, (r + 1 - my) / rows), e = at((c + mx) / cols, (r + 1 - my) / rows);
    out.push({ pts: `${P(a)} ${P(b)} ${P(d)} ${P(e)}`, lit: ((c * 7 + r * 13 + seed) % 5) !== 0 });
  }
  return out;
}
function block(basePts: Pt[], height: number) {
  const top: Pt[] = basePts.map((p) => ({ x: p.x, y: p.y - height }));
  return { top, leftStr: [basePts[3], basePts[2], top[2], top[3]].map(P).join(" "), rightStr: [basePts[1], basePts[2], top[2], top[1]].map(P).join(" "), roofPoly: top.map(P).join(" ") };
}

const houseFrontWorld = (h: House) => ({ wx: h.x + h.w / 2 + 0.6, wy: h.y + h.h + 2.4 });
const houseCenterWorld = (h: House) => ({ wx: h.x + h.w / 2, wy: h.y + h.h / 2 });
const midWorld = (a: House, b: House) => { const fa = houseFrontWorld(a), fb = houseFrontWorld(b); return { wx: (fa.wx + fb.wx) / 2, wy: (fa.wy + fb.wy) / 2 }; };

type RouteProfile = "system" | "patrol" | "operator" | "resident" | "support";
function profileFor(a: CanonAgent, idx: number): RouteProfile {
  const r = a.rankLayer || "";
  if (r.includes("L0")) return "system";
  if (r.includes("L1") || r.includes("L2")) return "patrol";
  if (a.house === "openclaw_agent_barracks") return "operator";
  if (a.house === "compliance_port" || a.house === "calendar_tower") return "support";
  return idx % 2 === 0 ? "operator" : "resident";
}
type MoveState = "idleAtHome" | "walking" | "working" | "returningHome";

/* rang → insigne dessiné (zéro emoji) */
type Rank = "crown" | "diadem" | "captain" | "agent";
function rankFor(a: CanonAgent): Rank {
  const r = a.rankLayer || "";
  if (r.includes("L0")) return "crown";
  if (r.includes("L1")) return "diadem";
  if (r.includes("L2")) return "captain";
  return "agent";
}

export function WorldMapLiving({
  snapshot, angelRoster, onSelectHouse,
}: { snapshot: CofiaSnapshot | null; angelRoster?: AngelRoster | null; onSelectHouse: (houseId: string) => void }) {
  const [houseStatuses, setHouseStatuses] = useState<Record<string, string> | null>(null);
  const [onDemandSet, setOnDemandSet] = useState<Set<string>>(new Set());
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [registryError, setRegistryError] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<string | null>(null);
  const [selectedAngel, setSelectedAngel] = useState<Angel | null>(null);
  const [selectedRuntimeAgent, setSelectedRuntimeAgent] = useState<RuntimeAgent | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<WorldMachine | null>(null);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<CanonAgent | null>(null);
  const [hoverHouse, setHoverHouse] = useState<string | null>(null);
  const [hoverAgent, setHoverAgent] = useState<string | null>(null);
  const [houseTab, setHouseTab] = useState<"vue" | "kpis" | "anges" | "machines" | "flux">("vue");
  const [houseKpiData, setHouseKpiData] = useState<Record<string, { kpis: Array<{ label: string; value: string; source?: string }>; gap?: string }> | null>(null);
  const lastFetch = useRef<number>(0);
  const [syncStamp, setSyncStamp] = useState<string>("");
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ cw: number; ch: number }>({ cw: 0, ch: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/cofiatrading-world-control/registry", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP_${r.status}`);
        const data = await r.json();
        const houses = (data?.houses ?? {}) as Record<string, { status?: unknown; on_demand?: unknown }>;
        const map: Record<string, string> = {}; const onDemand = new Set<string>();
        for (const [id, v] of Object.entries(houses)) { if (typeof v?.status === "string") map[id] = v.status; if (v?.on_demand === true) onDemand.add(id); }
        if (!cancelled) { setHouseStatuses(map); setOnDemandSet(onDemand); setRegistryError(false); lastFetch.current = Date.now(); setSyncStamp(new Date().toLocaleTimeString("fr-FR")); }
      } catch { if (!cancelled) setRegistryError(true); }
    };
    void load(); const iv = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/trucks", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && Array.isArray(d?.trucks)) setTrucks(d.trucks); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/house-kpis", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && d?.houses) setHouseKpiData(d.houses); }).catch(() => {});
    void load(); const iv = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/world-state", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && Array.isArray(d?.events)) setEvents(d.events); }).catch(() => {});
    void load(); const iv = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, []);
  useEffect(() => {
    const el = sceneRef.current; if (!el) return;
    const ro = new ResizeObserver((entries) => { for (const e of entries) setSize({ cw: e.contentRect.width, ch: e.contentRect.height }); });
    ro.observe(el); setSize({ cw: el.clientWidth, ch: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const statusFor = (id: string): string => {
    if (houseStatuses && houseStatuses[id]) { const raw = houseStatuses[id]; if (onDemandSet.has(id) && (raw === "SOURCE_DOWN" || raw === "DEGRADED")) return "SLEEPING"; return raw; }
    if (registryError) return "ERR"; if (houseStatuses === null) return "LOADING"; return "ERR";
  };

  /* ════════ Géométrie scène : terrain dallé + routes pierre + parcelles + déco + bâtiments ════════ */
  const scene = useMemo(() => {
    const built = HOUSES.map((h) => {
      const bodyH = 9 + h.levels * 7;
      const corners = [[h.x, h.y], [h.x + h.w, h.y], [h.x + h.w, h.y + h.h], [h.x, h.y + h.h]].map(([wx, wy]) => isoProject(wx, wy));
      const ground: Pt[] = corners.map((c) => ({ x: c.sx, y: c.sy }));
      const base = centroid(ground);
      return { house: h, ground, base, roofCenter: { x: base.x, y: base.y - bodyH }, height: bodyH, depth: h.x + h.y };
    });

    // île (rayon monde irrégulier déterministe)
    const wc = centroid(HOUSES.map((h) => ({ x: h.x + h.w / 2, y: h.y + h.h / 2 })));
    const islandR = (ang: number) => 50 + 10 * Math.sin(ang * 1.7 + 0.6) + 7 * Math.sin(ang * 3.1 + 2.1) + 5 * Math.sin(ang * 0.9 - 1);

    // terrain : tuiles iso (district floor / herbe / sable)
    const TILE = 4.2;
    type Tile = { poly: string; fill: string; depth: number };
    const tiles: Tile[] = [];
    const zCentro: Array<{ id: ZoneId; c: Pt }> = (Object.keys(ZONES) as ZoneId[]).map((zid) => ({ id: zid, c: centroid(HOUSES.filter((h) => h.zone === zid).map((h) => ({ x: h.x + h.w / 2, y: h.y + h.h / 2 }))) }));
    for (let gx = -8; gx <= 108; gx += TILE) {
      for (let gy = -14; gy <= 92; gy += TILE) {
        const cxw = gx + TILE / 2, cyw = gy + TILE / 2;
        const dx = cxw - wc.x, dy = cyw - wc.y; const rr = Math.hypot(dx, dy); const ang = Math.atan2(dy, dx);
        const R = islandR(ang); if (rr > R + TILE) continue;
        const corners = [[gx, gy], [gx + TILE, gy], [gx + TILE, gy + TILE], [gx, gy + TILE]].map(([wx, wy]) => isoProject(wx, wy));
        const poly = corners.map((c) => `${(c.sx).toFixed(1)},${(c.sy).toFixed(1)}`).join(" ");
        let fill: string;
        if (rr > R - 1.5) fill = SAND; // côte
        else {
          // district le plus proche, sinon herbe
          let best: ZoneId | null = null, bd = Infinity;
          for (const z of zCentro) { const d2 = Math.hypot(cxw - z.c.x, cyw - z.c.y); if (d2 < bd) { bd = d2; best = z.id; } }
          const baseFloor = best && bd < 26 ? ZONES[best].floor : GRASS;
          const v = Math.round((rseed(gx * 3.1 + gy * 7.7) - 0.5) * 12);
          fill = shade(baseFloor, v);
        }
        tiles.push({ poly, fill, depth: gx + gy });
      }
    }
    tiles.sort((a, b) => a.depth - b.depth);

    // contour île (côte lissée) pour bord net
    const N = 34; const islandPts: Pt[] = [];
    for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2; const R = islandR(a); const w = { x: wc.x + Math.cos(a) * R, y: wc.y + Math.sin(a) * R }; const p = isoProject(w.x, w.y); islandPts.push({ x: p.sx, y: p.sy }); }
    const coast = smoothClosedPath(islandPts);

    // routes pierre (rubans courbés)
    const roads = ROAD_LINKS.map(([a, b, kind], i) => {
      const ha = HOUSE_BY_ID[a], hb = HOUSE_BY_ID[b];
      const fa = isoProject(houseFrontWorld(ha).wx, houseFrontWorld(ha).wy), fb = isoProject(houseFrontWorld(hb).wx, houseFrontWorld(hb).wy);
      const mx = (fa.sx + fb.sx) / 2, my = (fa.sy + fb.sy) / 2 - 10 - (i % 3) * 5;
      return { id: `${a}__${b}`, d: `M ${fa.sx.toFixed(1)} ${fa.sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${fb.sx.toFixed(1)} ${fb.sy.toFixed(1)}`, w: kind === "main" ? 13 : 8, from: a, to: b };
    });
    // places dallées aux noeuds (devant maison)
    const plazas = HOUSES.map((h) => { const f = isoProject(houseFrontWorld(h).wx, houseFrontWorld(h).wy); return { x: f.sx, y: f.sy }; });

    // décor déterministe (arbres / lampes / caisses / panneaux) hors maisons
    type Deco = { kind: "tree" | "lamp" | "crate" | "rock"; x: number; y: number; depth: number; seed: number };
    const decos: Deco[] = [];
    const isFarFromHouses = (wx: number, wy: number, min: number) => HOUSES.every((h) => Math.hypot(wx - (h.x + h.w / 2), wy - (h.y + h.h / 2)) > min);
    let placed = 0;
    for (let s = 0; s < 240 && placed < 30; s++) {
      const ang = rseed(s * 1.7) * Math.PI * 2; const rad = 10 + rseed(s * 4.3) * 44;
      const wx = wc.x + Math.cos(ang) * rad, wy = wc.y + Math.sin(ang) * rad * 0.95;
      const rr = Math.hypot(wx - wc.x, wy - wc.y); if (rr > islandR(Math.atan2(wy - wc.y, wx - wc.x)) - 4) continue;
      if (!isFarFromHouses(wx, wy, 6.5)) continue;
      if (decos.some((d2) => Math.hypot(isoProject(wx, wy).sx - d2.x, isoProject(wx, wy).sy - d2.y) < 34)) continue;
      const p = isoProject(wx, wy); const r2 = rseed(s * 9.1);
      const kind: Deco["kind"] = r2 < 0.5 ? "tree" : r2 < 0.72 ? "lamp" : r2 < 0.88 ? "crate" : "rock";
      decos.push({ kind, x: p.sx, y: p.sy, depth: wx + wy, seed: s });
      placed++;
    }

    // bbox / viewBox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of built) for (const pt of [...b.ground, b.roofCenter]) { minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y); maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y); }
    for (const p of islandPts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const pad = 70; const vbMinX = minX - pad, vbMinY = minY - pad, vbW = maxX - minX + pad * 2, vbH = maxY - minY + pad * 2;

    // zone labels (au sol)
    const zoneLabels = (Object.keys(ZONES) as ZoneId[]).map((zid) => { const c = zCentro.find((z) => z.id === zid)!.c; const p = isoProject(c.x, c.y); const members = HOUSES.filter((h) => h.zone === zid).length; return { id: zid, x: p.sx, y: p.sy - (members > 2 ? 116 : 92) }; });

    return { built, tiles, coast, roads, plazas, decos, zoneLabels, viewBox: `${vbMinX.toFixed(0)} ${vbMinY.toFixed(0)} ${vbW.toFixed(0)} ${vbH.toFixed(0)}`, vbMinX, vbMinY, vbW, vbH };
  }, []);

  // props (bâtiments + décos) triés par profondeur pour occlusion correcte
  const props = useMemo(() => {
    const arr: Array<{ kind: "building"; depth: number; b: (typeof scene.built)[number] } | { kind: "deco"; depth: number; d: (typeof scene.decos)[number] }> = [];
    for (const b of scene.built) arr.push({ kind: "building", depth: b.depth, b });
    for (const d of scene.decos) arr.push({ kind: "deco", depth: d.depth, d });
    arr.sort((a, b) => a.depth - b.depth);
    return arr;
  }, [scene.built, scene.decos]);

  const angels = useMemo(() => angelRoster?.anges ?? [], [angelRoster?.anges]);
  const angelsByHome = useMemo(() => { const m: Record<string, Angel[]> = {}; for (const a of angels) (m[ANGEL_HOME_BY_ID[a.id] ?? "central_brain"] ||= []).push(a); return m; }, [angels]);
  const canonAgents = useMemo<CanonAgent[]>(() => (snapshot?.agentsCanon?.agents ?? []).map((a) => ({ ...a, house: HOUSE_BY_ID[a.house] ? a.house : "central_brain" })), [snapshot?.agentsCanon]);
  const agentsByHome = useMemo(() => { const m: Record<string, CanonAgent[]> = {}; for (const a of canonAgents) (m[a.house] ||= []).push(a); return m; }, [canonAgents]);

  const liveCount = HOUSES.filter((z) => statusFor(z.id) === "LIVE").length;
  const activeMissions = angels.filter((a) => a.status === "LIVE" || a.status === "OPERATIONAL_PARTIAL" || a.status === "CANON_GATE").length;
  const blockerMissions = angels.filter((a) => a.status === "BROKEN" || a.status === "DEGRADED" || a.status === "AWAITING_SETUP").length;
  const feedColor = (s?: string) => (s === "LIVE" ? "#34d399" : s === "UNKNOWN" ? "#64748b" : "#f59e0b");
  const rev = snapshot?.revenue; const assets = snapshot?.assetsWarehouse;
  const services = useMemo(() => snapshot?.services ?? [], [snapshot?.services]);
  const servicesOk = services.filter((s) => s.ok).length;
  const openclawRuntime = snapshot?.openclawRuntime ?? null;
  const runtimeGateway = openclawRuntime?.services.find((svc) => svc.id === "openclaw_gateway_18789") ?? null;
  const machines = useMemo(() => {
    const merged = new Map<string, WorldMachine>();
    for (const svc of services) { const id = svc.id ?? ""; const hh = SERVICE_HOME_BY_ID[id]; if (!hh) continue; merged.set(id, { id, label: svc.label ?? id, homeHouse: hh, ok: svc.ok === true, status: svc.status ?? (svc.ok ? "LIVE" : "UNKNOWN"), role: svc.role, proof: svc.url }); }
    for (const svc of openclawRuntime?.services ?? []) { const hh = SERVICE_HOME_BY_ID[svc.id]; if (!hh) continue; merged.set(svc.id, { id: svc.id, label: svc.label, homeHouse: hh, ok: svc.ok, status: svc.status, proof: svc.http_code === null ? "no listener / timeout" : `HTTP ${svc.http_code}` }); }
    return [...merged.values()];
  }, [services, openclawRuntime]);
  const machinesByHome = useMemo(() => { const map: Record<string, WorldMachine[]> = {}; for (const m of machines) (map[m.homeHouse] ||= []).push(m); return map; }, [machines]);
  const runtimeAgentsByHome = useMemo(() => { const map: Record<string, RuntimeAgent[]> = {}; for (const agent of openclawRuntime?.agents ?? []) { const home = HOUSE_BY_ID[agent.homeHouse] ? agent.homeHouse : "openclaw_agent_barracks"; (map[home] ||= []).push(agent); } return map; }, [openclawRuntime]);
  const selZone = HOUSE_BY_ID[selectedHouse ?? ""] ?? null;

  /* ════════ Déplacement (machine à états + facing) ════════ */
  type AgentRuntime = { id: string; home: string; profile: RouteProfile; clusterIdx: number; clusterN: number; itinerary: Array<{ wx: number; wy: number; kind: MoveState }>; idx: number };
  const runtimeRef = useRef<Record<string, AgentRuntime>>({});
  const [agentPos, setAgentPos] = useState<Record<string, { wx: number; wy: number; state: MoveState; facing: 1 | -1 }>>({});
  const [ready, setReady] = useState(false);

  const buildItinerary = (home: string, profile: RouteProfile, seed: number): Array<{ wx: number; wy: number; kind: MoveState }> => {
    const h = HOUSE_BY_ID[home]; const hf = houseFrontWorld(h);
    if (profile === "system") return [{ ...hf, kind: "idleAtHome" }];
    const nbs = ADJACENCY[home] ?? [];
    if (profile === "resident" || profile === "support" || nbs.length === 0) {
      return [0, 1, 2, 3].map((k) => ({ wx: hf.wx + (rseed(seed + k * 2.1) - 0.5) * (h.w + 1.4), wy: hf.wy + (rseed(seed + k * 5.7) - 0.5) * 2.6, kind: (k === 0 ? "idleAtHome" : "walking") as MoveState }));
    }
    const pick = nbs[Math.floor(rseed(seed) * nbs.length) % nbs.length]; const nb = HOUSE_BY_ID[pick]; const nf = houseFrontWorld(nb); const mid = midWorld(h, nb);
    const it: Array<{ wx: number; wy: number; kind: MoveState }> = [{ ...hf, kind: "idleAtHome" }, { ...mid, kind: "walking" }, { ...nf, kind: "working" }, { ...mid, kind: "returningHome" }];
    if (profile === "patrol" && nbs.length > 1) {
      const pick2 = nbs[(Math.floor(rseed(seed + 9) * nbs.length) + 1) % nbs.length]; const nb2 = HOUSE_BY_ID[pick2];
      it.push({ ...houseFrontWorld(h), kind: "idleAtHome" }, { ...midWorld(h, nb2), kind: "walking" }, { ...houseFrontWorld(nb2), kind: "working" }, { ...midWorld(h, nb2), kind: "returningHome" });
    }
    return it;
  };

  useEffect(() => {
    if (!canonAgents.length) return;
    const byHome: Record<string, number> = {}; const counts: Record<string, number> = {};
    for (const a of canonAgents) counts[a.house] = (counts[a.house] ?? 0) + 1;
    const rt: Record<string, AgentRuntime> = {}; const pos: Record<string, { wx: number; wy: number; state: MoveState; facing: 1 | -1 }> = {};
    canonAgents.forEach((a, i) => {
      const profile = profileFor(a, i); const clusterIdx = (byHome[a.house] = (byHome[a.house] ?? 0) + 1) - 1; const clusterN = counts[a.house] ?? 1;
      const seed = (a.id.length + i * 13 + clusterIdx * 7) * 1.0; const itinerary = buildItinerary(a.house, profile, seed);
      rt[a.id] = { id: a.id, home: a.house, profile, clusterIdx, clusterN, itinerary, idx: 0 };
      const hf = houseFrontWorld(HOUSE_BY_ID[a.house]); const off = clusterOffset(clusterIdx, clusterN);
      pos[a.id] = { wx: hf.wx + off.dx, wy: hf.wy + off.dy, state: "idleAtHome", facing: 1 };
    });
    runtimeRef.current = rt; setAgentPos(pos);
  }, [canonAgents]);

  useEffect(() => {
    if (!canonAgents.length) return;
    const id = window.setInterval(() => {
      setAgentPos((prev) => {
        const next = { ...prev };
        for (const a of canonAgents) {
          const rt = runtimeRef.current[a.id]; if (!rt) continue;
          rt.idx = (rt.idx + 1) % rt.itinerary.length; const node = rt.itinerary[rt.idx]; const off = clusterOffset(rt.clusterIdx, rt.clusterN);
          const nx = node.wx + off.dx * (node.kind === "idleAtHome" ? 1 : 0.4), ny = node.wy + off.dy * (node.kind === "idleAtHome" ? 1 : 0.4);
          const prevP = prev[a.id]; // facing : iso → écran, gauche si sx diminue
          const ps = isoProject(prevP?.wx ?? nx, prevP?.wy ?? ny).sx, nsx = isoProject(nx, ny).sx;
          const facing: 1 | -1 = nsx < ps - 0.5 ? -1 : nsx > ps + 0.5 ? 1 : (prevP?.facing ?? 1);
          next[a.id] = { wx: nx, wy: ny, state: node.kind, facing };
        }
        return next;
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, [canonAgents]);

  useEffect(() => { if (size.cw > 0 && !ready) setReady(true); }, [size.cw, ready]);

  const project = (wx: number, wy: number) => {
    const { sx, sy } = isoProject(wx, wy); const scale = Math.min(size.cw / scene.vbW, size.ch / scene.vbH) || 0;
    const rW = scene.vbW * scale, rH = scene.vbH * scale; const ox = (size.cw - rW) / 2, oy = (size.ch - rH) / 2;
    return { x: (sx - scene.vbMinX) * scale + ox, y: (sy - scene.vbMinY) * scale + oy, scale };
  };

  type HouseKpis = { kpis: Array<{ label: string; value: string; source?: string }>; gap?: string };
  const houseKpis = (id: string): HouseKpis => {
    const fromServer = houseKpiData?.[id]; if (fromServer && (fromServer.kpis.length > 0 || fromServer.gap)) return fromServer;
    const a = snapshot?.assetsWarehouse; const pubOk = services.find((s) => (s.id ?? "").includes("publisher") || (s.label ?? "").toLowerCase().includes("publisher"))?.ok;
    switch (id) {
      case "assets_warehouse": return { kpis: [{ label: "MP4", value: fmtNum(a?.mp4Count), source: "inventaire assets local" }, { label: "Captions", value: fmtNum(a?.captionsCount), source: "inventaire assets local" }, { label: "Assets inventoriés", value: fmtNum(a?.assetsInventoryCount), source: "inventaire assets local" }] };
      case "youtube_studio": return { kpis: [{ label: "MP4 prêts", value: fmtNum(a?.mp4Count), source: "inventaire assets local" }, { label: "CofiaPublisher", value: pubOk === true ? "LIVE" : pubOk === false ? "DOWN" : "UNKNOWN", source: "probe :8540" }] };
      case "central_brain": return { kpis: [{ label: "Maisons registry", value: fmtNum(snapshot?.centralBrain?.housesCount), source: "registry :8767" }, { label: "Services OK", value: `${servicesOk}/${services.length}`, source: "probes services locaux" }] };
      case "openclaw_agent_barracks": return { kpis: [{ label: "Agents runtime", value: openclawRuntime ? `${openclawRuntime.counts.fresh}/${openclawRuntime.counts.total} fresh` : "source down", source: "heartbeats" }, { label: "Jarod", value: openclawRuntime?.jarod?.runtimeStatus ?? "UNKNOWN", source: openclawRuntime?.jarod?.proof ?? "heartbeat Jarod" }, { label: "Gateway", value: runtimeGateway ? `${runtimeGateway.status}${runtimeGateway.http_code ? ` ${runtimeGateway.http_code}` : ""}` : "source down", source: "probe :18789" }, { label: "Camions", value: fmtNum(trucks.length), source: "trucks manifest" }] };
      default: return { kpis: [] };
    }
  };

  const clearSel = () => { setSelectedHouse(null); setSelectedAngel(null); setSelectedRuntimeAgent(null); setSelectedMachine(null); setSelectedTruck(null); setSelectedAgent(null); };

  return (
    <div className="flex w-full max-w-[366px] min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border border-cyan-300/15 bg-slate-950/85 p-3 text-slate-100 shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)] backdrop-blur sm:max-w-[calc(100vw-24px)]">
      {/* ── HEADER + KPIs ── */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0 flex-1">
          <h2 className="break-words bg-gradient-to-r from-cyan-300 via-sky-200 to-amber-300 bg-clip-text text-base font-black uppercase tracking-wide text-transparent sm:text-xl">COFIATRADING WORLD CONTROL</h2>
          <p className="max-w-full truncate text-[9px] uppercase tracking-[0.16em] text-slate-400 sm:text-[10px] sm:tracking-[0.2em]">Cof-Island · cité jeu isométrique · 15 maisons · {canonAgents.length} agents</p>
        </div>
        <div className="grid w-full min-w-0 grid-cols-1 items-center gap-1.5 text-[10px] sm:w-auto sm:flex sm:flex-wrap">
          {([
            ["MRR", fmtEur(rev?.currentMrrEur)], ["ARR", fmtEur(rev?.currentArrEur)], ["VIP", fmtNum(rev?.activeVip)],
            ["Past due", `${fmtEur(rev?.pastDueEur)} / ${fmtNum(rev?.pastDueCount)}`], ["Services", `${servicesOk}/${services.length || "—"}`],
            ["OpenClaw", openclawRuntime ? `${openclawRuntime.counts.fresh}/${openclawRuntime.counts.total} fresh` : "source down"],
            ["Gateway", runtimeGateway ? runtimeGateway.status : "source down"], ["Maisons", `${liveCount}/${HOUSES.length} LIVE`],
            ["Agents", `${canonAgents.length}`], ["Assets", `${fmtNum(assets?.mp4Count)} MP4`],
          ] as Array<[string, string]>).map(([k, v]) => (
            <span key={k} className="flex min-w-0 items-baseline gap-1 rounded-md border border-cyan-300/20 bg-slate-900/70 px-2 py-1"><span className="shrink-0 text-slate-400">{k}</span><span className="min-w-0 truncate font-bold text-slate-100">{v}</span></span>
          ))}
        </div>
      </div>

      {/* ── SCÈNE JEU ── */}
      <div ref={sceneRef} className="relative h-[640px] min-h-[560px] w-full max-w-full overflow-hidden rounded-xl border border-cyan-300/15 bg-[#04141f] sm:h-[calc(100vh-220px)]">
        <style>{KEYFRAMES}</style>
        <svg viewBox={scene.viewBox} className="h-full w-full" preserveAspectRatio="xMidYMid meet" onClick={clearSel}>
          <defs>
            <radialGradient id="sea" cx="50%" cy="42%" r="85%"><stop offset="0%" stopColor="#0a2c4a" /><stop offset="58%" stopColor="#06192c" /><stop offset="100%" stopColor="#020a14" /></radialGradient>
            <linearGradient id="roofSheen" x1="0" y1="0" x2="0.45" y2="1"><stop offset="0%" stopColor="#fff" stopOpacity="0.28" /><stop offset="55%" stopColor="#fff" stopOpacity="0.05" /><stop offset="100%" stopColor="#000" stopOpacity="0.28" /></linearGradient>
            <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>

          {/* mer */}
          <rect x="-100000" y="-100000" width="200000" height="200000" fill="url(#sea)" />
          {/* ressac (lignes côtières discrètes) */}
          <path d={scene.coast} fill="none" stroke="#1d5a82" strokeWidth="6" opacity="0.25" style={{ animation: "coast-breathe 6s ease-in-out infinite" }} />
          <path d={scene.coast} fill="#071a2b" opacity="0.55" />

          {/* terrain dallé */}
          <g>
            {scene.tiles.map((t, i) => (<polygon key={i} points={t.poly} fill={t.fill} stroke={shade(t.fill, 16)} strokeWidth="0.5" strokeOpacity="0.5" />))}
          </g>
          {/* contour île */}
          <path d={scene.coast} fill="none" stroke="#3b6c8c" strokeWidth="2" opacity="0.7" />

          {/* routes pierre + places */}
          <g>
            {scene.roads.map((r, i) => (
              <g key={r.id}>
                <path d={r.d} fill="none" stroke={STONE_LO} strokeWidth={r.w + 4} strokeLinecap="round" opacity="0.9" />
                <path d={r.d} fill="none" stroke={STONE} strokeWidth={r.w} strokeLinecap="round" />
                <path d={r.d} fill="none" stroke={STONE_HI} strokeWidth={r.w} strokeLinecap="round" strokeDasharray="1.5 7" opacity="0.6" />
                <path id={`road-${i}`} d={r.d} fill="none" stroke="#cfe6ff" strokeWidth="0.7" strokeDasharray="5 10" opacity="0.18"><animate attributeName="stroke-dashoffset" from="30" to="0" dur="2.2s" repeatCount="indefinite" /></path>
              </g>
            ))}
            {scene.plazas.map((p, i) => (<g key={`pz-${i}`}><ellipse cx={p.x} cy={p.y} rx="16" ry="8" fill={STONE} stroke={STONE_LO} strokeWidth="1.5" /><ellipse cx={p.x} cy={p.y} rx="16" ry="8" fill="none" stroke={STONE_HI} strokeWidth="0.6" strokeDasharray="2 4" opacity="0.6" /></g>))}
          </g>

          {/* camions canon (flux réels) */}
          <g>
            {trucks.map((t, i) => {
              const ha = HOUSE_BY_ID[t.from], hb = HOUSE_BY_ID[t.to]; if (!ha || !hb) return null;
              const fa = isoProject(houseFrontWorld(ha).wx, houseFrontWorld(ha).wy), fb = isoProject(houseFrontWorld(hb).wx, houseFrontWorld(hb).wy);
              const mx = (fa.sx + fb.sx) / 2, my = (fa.sy + fb.sy) / 2 - 14; const d = `M ${fa.sx} ${fa.sy} Q ${mx} ${my} ${fb.sx} ${fb.sy}`; const col = t.kind === "vip" ? "#ffd400" : "#9fb3c8";
              return (
                <g key={`truck-${t.id}-${i}`} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); clearSel(); setSelectedTruck(t); }}>
                  <title>{`${t.name} — ${t.payload} (${t.owner})`}</title>
                  <path id={`troute-${i}`} d={d} fill="none" stroke="none" />
                  <g><animateMotion dur={`${9 + (i % 5)}s`} repeatCount="indefinite" begin={`${i * 1.1}s`} rotate="auto"><mpath href={`#troute-${i}`} /></animateMotion>
                    <rect x="-5" y="-3" width="10" height="6" rx="1.4" fill={col} stroke="#02040a" strokeWidth="0.5" /><rect x="-3" y="-1.8" width="3.2" height="3.4" rx="0.5" fill="#02040a" opacity="0.85" />
                    <circle cx="-2.6" cy="3.1" r="1" fill="#0a0f1c" /><circle cx="2.6" cy="3.1" r="1" fill="#0a0f1c" /></g>
                </g>
              );
            })}
          </g>

          {/* labels district (au sol, sous les objets) */}
          {scene.zoneLabels.map((z) => { const zc = ZONES[z.id]; return (
            <g key={z.id} opacity="0.92">
              <text x={z.x} y={z.y} textAnchor="middle" fontSize="16" fontWeight="900" fill={zc.edge} stroke="#02060e" strokeWidth="3.4" paintOrder="stroke" style={{ letterSpacing: "4px" }}>{zc.label}</text>
              <text x={z.x} y={z.y + 13} textAnchor="middle" fontSize="8" fontWeight="700" fill="#9fb3c8" stroke="#02060e" strokeWidth="2" paintOrder="stroke" style={{ letterSpacing: "1px" }}>{zc.sub}</text>
            </g>
          ); })}

          {/* PARCELLES (socles dallés sous chaque maison) */}
          {scene.built.map((b) => {
            const pad = insetTowards(b.ground, -0.22); const lift = 6;
            const top = pad, botFront = [pad[3], pad[2]].map((p) => ({ x: p.x, y: p.y + lift }));
            return (
              <g key={`parcel-${b.house.id}`}>
                <polygon points={[pad[3], pad[2], botFront[1], botFront[0]].map(P).join(" ")} fill={STONE_LO} />
                <polygon points={top.map(P).join(" ")} fill={shade(STONE, -4)} stroke={STONE_HI} strokeWidth="0.7" strokeOpacity="0.5" />
                <polygon points={insetTowards(top, 0.12).map(P).join(" ")} fill="none" stroke={b.house.accent} strokeWidth="0.8" strokeOpacity="0.35" />
              </g>
            );
          })}

          {/* PROPS triés par profondeur : bâtiments + décor (occlusion correcte) */}
          {props.map((it) => it.kind === "building" ? (
            <Building key={it.b.house.id} b={it.b} status={statusFor(it.b.house.id)} selected={selectedHouse === it.b.house.id} hover={hoverHouse === it.b.house.id} dim={!!selectedHouse && selectedHouse !== it.b.house.id} machines={machinesByHome[it.b.house.id] ?? []} agentCount={(agentsByHome[it.b.house.id] ?? []).length}
              onSelect={() => { clearSel(); setSelectedHouse(it.b.house.id); setHouseTab("vue"); onSelectHouse(it.b.house.id); }} onHover={(v) => setHoverHouse(v ? it.b.house.id : null)} onMachine={(m) => { clearSel(); setSelectedMachine(m); }} />
          ) : (
            <Deco key={`deco-${it.d.seed}`} d={it.d} />
          ))}
        </svg>

        {/* léger vignettage (n'intercepte pas les clics) */}
        <div className="pointer-events-none absolute inset-0 rounded-xl" style={{ background: "radial-gradient(100% 100% at 50% 46%, transparent 60%, rgba(0,0,0,0.5))" }} />

        {/* ════════ COUCHE PERSONNAGES (overlay HTML projeté depuis l'iso) ════════ */}
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {ready && canonAgents.map((a) => {
            const pos = agentPos[a.id]; if (!pos) return null;
            const { x, y } = project(pos.wx, pos.wy); if (!Number.isFinite(x)) return null;
            const st = statusFor(a.house); const alert = ["SOURCE_DOWN", "DEGRADED", "ERR"].includes(st);
            const sel = selectedAgent?.id === a.id; const hov = hoverAgent === a.id;
            return (
              <RPGCharacter key={a.id} agent={a} x={x} y={y} state={pos.state} facing={pos.facing} alert={alert} selected={sel} hover={hov}
                onSelect={() => { clearSel(); setSelectedAgent(a); }} onHover={(v) => setHoverAgent(v ? a.id : null)} />
            );
          })}
        </div>

        {/* légende (pictos dessinés, zéro emoji) */}
        <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-cyan-300/20 bg-slate-950/85 px-3 py-1.5 text-[9px] text-slate-300 backdrop-blur sm:left-1/2 sm:right-auto sm:max-w-[88%] sm:-translate-x-1/2">
          {([["LIVE", "#34d399"], ["EN VEILLE", "#64748b"], ["DEGRADED", "#f59e0b"], ["SOURCE DOWN", "#ef4444"]] as Array<[string, string]>).map(([l, c]) => (
            <span key={l} className="flex items-center gap-1.5"><svg width="10" height="13" viewBox="0 0 10 13"><rect x="0.5" y="0.5" width="2" height="12" fill="#64748b" /><path d="M2.5 1 L9 2.5 L2.5 4.5 Z" fill={c} /></svg>{l}</span>
          ))}
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-cyan-300" />sélection</span>
          <span className="text-slate-500">· clic agent / maison / camion → inspector</span>
        </div>

        {/* ════════ INSPECTOR ════════ */}
        <div className="absolute left-2 right-2 top-2 z-20 flex max-h-[52%] w-auto flex-col overflow-auto rounded-xl border border-cyan-300/25 bg-slate-950/95 p-3 backdrop-blur sm:left-auto sm:right-2 sm:max-h-[94%] sm:w-[266px]">
          {selectedAgent ? (
            <AgentInspector agent={selectedAgent} state={agentPos[selectedAgent.id]?.state ?? "idleAtHome"} houseName={HOUSE_BY_ID[selectedAgent.house]?.name ?? selectedAgent.house} houseStatus={houseStatusStyle(statusFor(selectedAgent.house))} onClose={() => setSelectedAgent(null)} onGotoHouse={() => { const id = selectedAgent.house; clearSel(); setSelectedHouse(id); setHouseTab("anges"); onSelectHouse(id); }} />
          ) : selectedRuntimeAgent ? (
            <div>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[13px] font-black text-orange-200">{selectedRuntimeAgent.name}</div><div className="text-[10px] uppercase tracking-wide text-slate-400">{selectedRuntimeAgent.id} · {selectedRuntimeAgent.team}</div></div><button type="button" onClick={() => setSelectedRuntimeAgent(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button></div>
              <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${runtimeColor(selectedRuntimeAgent.runtimeStatus)}22`, color: runtimeColor(selectedRuntimeAgent.runtimeStatus), border: `1px solid ${runtimeColor(selectedRuntimeAgent.runtimeStatus)}55` }}>● {selectedRuntimeAgent.runtimeStatus}</span>
              <p className="mt-2 text-[10px] font-semibold uppercase text-orange-200">Maison</p><p className="text-[11px] text-slate-300">{HOUSE_BY_ID[selectedRuntimeAgent.homeHouse]?.name ?? selectedRuntimeAgent.homeHouse}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-orange-200">Tick LaunchAgent</p><p className="text-[11px] text-slate-300">{selectedRuntimeAgent.tickEnabled ? "enabled" : "missing"}</p>
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
          ) : selectedTruck ? (
            <div>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[13px] font-black text-amber-200">{selectedTruck.name}</div><div className="text-[10px] uppercase tracking-wide text-slate-400">{selectedTruck.id} · {selectedTruck.kind ?? "flux"}</div></div><button type="button" onClick={() => setSelectedTruck(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button></div>
              <p className="mt-2 text-[10px] font-semibold uppercase text-amber-200">Route</p><p className="text-[11px] text-slate-300">{HOUSE_BY_ID[selectedTruck.from]?.name ?? selectedTruck.from} → {HOUSE_BY_ID[selectedTruck.to]?.name ?? selectedTruck.to}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-amber-200">Payload</p><p className="text-[11px] leading-snug text-slate-300">{selectedTruck.payload}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-amber-200">Owner</p><p className="text-[11px] text-slate-300">{selectedTruck.owner}{selectedTruck.cadence ? ` · ${selectedTruck.cadence}` : ""}</p>
              {selectedTruck.source && <p className="mt-2 break-words text-[9px] text-emerald-300/70">Source: {selectedTruck.source}</p>}
            </div>
          ) : selectedAngel ? (
            <div>
              <div className="flex items-start justify-between"><div><div className="text-[13px] font-black">{selectedAngel.name} <span className="text-[11px] text-slate-400">{selectedAngel.name_ar}</span></div><div className="text-[10px] uppercase tracking-wide text-slate-400">#{selectedAngel.id} · {selectedAngel.platform}</div></div><button type="button" onClick={() => setSelectedAngel(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button></div>
              <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${ANGEL_STATUS[selectedAngel.status].color}22`, color: ANGEL_STATUS[selectedAngel.status].color, border: `1px solid ${ANGEL_STATUS[selectedAngel.status].color}55` }}>● {ANGEL_STATUS[selectedAngel.status].label}</span>
              <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Manzilah</p><p className="text-[11px] text-slate-300">{selectedAngel.manzilah}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Mission</p><p className="text-[11px] leading-snug text-slate-300">{selectedAngel.mission}</p>
              {selectedAngel.stack && <p className="mt-1 text-[9px] text-slate-400">Stack: {selectedAngel.stack}</p>}
              {typeof selectedAngel.arr_impact_eur_year === "number" && selectedAngel.arr_impact_eur_year !== 0 && (<p className="mt-1 text-[10px] font-bold" style={{ color: selectedAngel.arr_impact_eur_year < 0 ? "#fb7185" : "#34d399" }}>ARR impact: {selectedAngel.arr_impact_eur_year.toLocaleString("fr-FR")} €/an</p>)}
              {selectedAngel.proof_url && <p className="mt-1 break-words text-[9px] text-emerald-300/80">Preuve: {selectedAngel.proof_url}</p>}
            </div>
          ) : selZone ? (
            <div>
              <div className="flex items-start justify-between"><div><div className="text-[13px] font-black" style={{ color: selZone.accent }}>{selZone.name}</div><div className="text-[10px] uppercase tracking-wide text-slate-400">{selZone.sub} · {ZONES[selZone.zone].label}</div></div><button type="button" onClick={() => setSelectedHouse(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button></div>
              {(() => { const st = houseStatusStyle(statusFor(selZone.id)); return (<span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${st.color}22`, color: st.color, border: `1px solid ${st.color}55` }}>● {st.label}</span>); })()}
              {(() => {
                const houseAgents = agentsByHome[selZone.id] ?? []; const houseAngels = angelsByHome[selZone.id] ?? []; const houseRuntimeAgents = runtimeAgentsByHome[selZone.id] ?? []; const houseMachines = machinesByHome[selZone.id] ?? []; const houseTrucks = trucks.filter((t) => t.from === selZone.id || t.to === selZone.id);
                const hk = houseKpis(selZone.id); const kpis = hk.kpis;
                const tabs: Array<[typeof houseTab, string]> = [["vue", "Vue"], ["kpis", "KPIs"], ["anges", `Agents ${houseAgents.length}`], ["machines", `Machines ${houseMachines.length}`], ["flux", `Flux ${houseTrucks.length}`]];
                return (
                  <>
                    <div className="mt-2 flex gap-1 border-b border-slate-700/50">{tabs.map(([k, label]) => (<button key={k} type="button" onClick={() => setHouseTab(k)} className={`px-1.5 pb-1 text-[9.5px] font-bold uppercase tracking-wide ${houseTab === k ? "border-b-2 border-cyan-300 text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>))}</div>
                    {houseTab === "vue" && (
                      <div className="mt-2">
                        <p className="text-[10px] font-semibold uppercase text-cyan-300">Rôle</p><p className="text-[11px] leading-snug text-slate-300">{selZone.role}</p>
                        <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Résidents</p><p className="text-[10px] text-slate-300">{houseAgents.length} agents propriétaires · {houseRuntimeAgents.length} runtime · {houseMachines.length} machines · {houseTrucks.length} flux</p>
                        {houseAgents.length > 0 && (<div className="mt-2 flex flex-wrap gap-1">{houseAgents.map((a) => (<button key={a.id} type="button" onClick={() => setSelectedAgent(a)} className="flex items-center gap-1 rounded-full border bg-slate-900/60 px-1.5 py-0.5 text-[9px] hover:opacity-90" style={{ borderColor: `${a.colorPrimary}66` }}><span className="inline-block h-2 w-2 rounded-full" style={{ background: a.colorPrimary }} /><span className="font-bold text-slate-200">{a.name}</span></button>))}</div>)}
                      </div>
                    )}
                    {houseTab === "kpis" && (
                      <div className="mt-2">
                        {kpis.length > 0 && (<div className="flex flex-col gap-1">{kpis.map((row) => (<div key={row.label} className="rounded border border-slate-700/50 px-1.5 py-1"><div className="flex items-baseline justify-between gap-2"><span className="text-[9.5px] uppercase text-slate-400">{row.label}</span><span className="text-[11px] font-bold text-slate-100">{row.value}</span></div>{row.source && <span className="block text-[8px] text-emerald-300/55">▸ {row.source}</span>}</div>))}</div>)}
                        {hk.gap && <p className="mt-1 rounded bg-amber-500/10 px-1.5 py-1 text-[9.5px] leading-snug text-amber-300/90">⚠ {hk.gap}</p>}
                        {kpis.length === 0 && !hk.gap && <p className="rounded bg-amber-500/10 px-1.5 py-1 text-[10px] leading-snug text-amber-300/90">KPIs propres à cette maison <b>à migrer</b> (source locale non encore câblée).</p>}
                      </div>
                    )}
                    {houseTab === "anges" && (
                      <div className="mt-2">
                        {houseAgents.length > 0 && (<div className="mb-2 grid grid-cols-2 gap-1">{houseAgents.map((a) => (<button key={a.id} type="button" onClick={() => setSelectedAgent(a)} className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-left hover:opacity-90" style={{ borderColor: `${a.colorPrimary}55`, background: `${a.colorPrimary}10` }}><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.colorPrimary, boxShadow: `0 0 5px ${a.colorAccent}` }} /><span className="min-w-0"><span className="block truncate text-[9.5px] font-bold text-slate-100">{a.name}</span><span className="block truncate text-[8px] text-slate-400">{a.roleBadge}</span></span></button>))}</div>)}
                        {houseRuntimeAgents.length > 0 && (<div className="mb-2 rounded border border-orange-400/20 bg-orange-400/8 p-1.5"><p className="text-[9px] font-bold uppercase tracking-wide text-orange-200">Runtime OpenClaw / Lobster</p><div className="mt-1 grid grid-cols-2 gap-1">{houseRuntimeAgents.map((agent) => (<button key={`${agent.id}-${agent.name}`} type="button" onClick={() => setSelectedRuntimeAgent(agent)} className="rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-orange-300/60"><span className="block truncate text-[9.5px] font-bold text-slate-200">{agent.name}</span><span className="text-[8px] font-bold" style={{ color: runtimeColor(agent.runtimeStatus) }}>● {agent.runtimeStatus}</span></button>))}</div></div>)}
                        {houseAngels.length > 0 && (<div className="flex flex-col gap-1">{houseAngels.map((a) => (<button key={a.id} type="button" onClick={() => setSelectedAngel(a)} className="flex items-start gap-1.5 rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-slate-500"><span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ANGEL_STATUS[a.status].color }} /><span className="min-w-0"><span className="text-[10px] font-bold text-slate-200">{a.name}</span><span className="ml-1 text-[8.5px] font-semibold uppercase" style={{ color: ANGEL_STATUS[a.status].color }}>{ANGEL_STATUS[a.status].label}</span><span className="block truncate text-[9px] text-slate-400">{a.mission}</span></span></button>))}</div>)}
                        {!houseAgents.length && !houseAngels.length && !houseRuntimeAgents.length && <span className="text-[10px] text-slate-500">—</span>}
                      </div>
                    )}
                    {houseTab === "machines" && (<div className="mt-2">{houseMachines.length ? (<div className="flex flex-col gap-1">{houseMachines.map((m) => (<button key={m.id} type="button" onClick={() => setSelectedMachine(m)} className="rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-cyan-300/60"><span className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold text-slate-200">{m.label}</span><span className="shrink-0 text-[8px] font-bold" style={{ color: runtimeColor(m.status) }}>● {m.status}</span></span>{m.role && <span className="block truncate text-[8.5px] text-slate-500">{m.role}</span>}</button>))}</div>) : <p className="text-[10px] text-slate-500">Aucune machine/service canonique attaché à cette maison.</p>}</div>)}
                    {houseTab === "flux" && (<div className="mt-2">{houseTrucks.length ? (<div className="flex flex-col gap-1">{houseTrucks.map((t) => (<button key={t.id} type="button" onClick={() => setSelectedTruck(t)} className="rounded border border-slate-700/50 px-1.5 py-1 text-left hover:border-amber-300/60"><span className="text-[10px] font-bold text-slate-200">{t.name}</span><span className="block text-[9px] text-slate-400">{t.from} → {t.to} · {t.payload}</span><span className="block text-[8.5px] text-slate-500">{t.owner}{t.cadence ? ` · ${t.cadence}` : ""}</span></button>))}</div>) : <p className="text-[10px] text-slate-500">Aucun camion (flux inter-maison) ne touche cette maison.</p>}</div>)}
                  </>
                );
              })()}
            </div>
          ) : (
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-cyan-200">Mission Control</p>
              <p className="mt-1 text-[10px] text-slate-400">{HOUSES.length} maisons · {canonAgents.length} agents · {angels.length} anges · {trucks.length} camions · clic pour inspecter.</p>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[9.5px]">{(["LIVE", "SLEEPING", "DEGRADED", "SOURCE_DOWN", "ERR"]).map((s) => { const n = HOUSES.filter((z) => statusFor(z.id) === s).length; const st = houseStatusStyle(s); return <div key={s} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: st.color }} /><span className="text-slate-300">{st.label}</span><span className="ml-auto font-bold">{n}</span></div>; })}</div>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">Districts</p>
              <div className="mt-1 grid grid-cols-2 gap-1 text-[9px]">{(Object.keys(ZONES) as ZoneId[]).map((zid) => { const n = HOUSES.filter((h) => h.zone === zid).length; return <div key={zid} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: ZONES[zid].edge }} /><span className="text-slate-300">{ZONES[zid].label}</span><span className="ml-auto font-bold">{n}</span></div>; })}</div>
              <p className="mt-2 rounded border border-slate-700/50 px-2 py-1 text-[9.5px] text-slate-300">Missions : <b className="text-emerald-300">{activeMissions}</b> actives · <b className="text-amber-300">{blockerMissions}</b> à débloquer</p>
              {openclawRuntime && (<div className="mt-2 rounded border border-orange-400/25 bg-orange-400/8 px-2 py-1.5"><p className="text-[9px] font-bold uppercase tracking-wide text-orange-200">OpenClaw / Lobster — runtime local</p><div className="mt-1 grid grid-cols-2 gap-1 text-[9.5px] text-slate-300"><span>Agents fresh</span><span className="text-right font-bold">{openclawRuntime.counts.fresh}/{openclawRuntime.counts.total}</span><span>Jarod</span><span className="text-right font-bold">{openclawRuntime.jarod?.runtimeStatus ?? "UNKNOWN"}</span><span>Gateway</span><span className="text-right font-bold">{runtimeGateway?.status ?? "UNKNOWN"}</span><span>Lobster</span><span className="text-right font-bold">{fmtNum(openclawRuntime.counts.lobsterEnabled)}/{fmtNum(openclawRuntime.counts.lobsterConfigured)}</span></div></div>)}
              {events.length > 0 && (<div className="mt-2 rounded border border-emerald-300/15 bg-emerald-300/5 px-2 py-1.5"><p className="text-[9px] font-black uppercase tracking-wide text-emerald-300">Live feed</p><div className="mt-1 flex flex-col gap-1">{events.slice(0, 4).map((e) => (<div key={e.id} title={e.proof ? `${e.source ?? ""} — ${e.proof}` : (e.source ?? "")} className="flex items-center gap-1.5 text-[9px]"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: feedColor(e.status) }} /><span className="min-w-0 truncate text-slate-300">{e.label}</span></div>))}</div></div>)}
              <p className="mt-2 text-[9px] text-slate-500">sync registry {syncStamp || "…"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* éventail devant la maison (anti-empilement) */
function clusterOffset(idx: number, n: number): { dx: number; dy: number } {
  if (n <= 1) return { dx: 0, dy: 0.4 };
  const spread = 2.4; const half = (n - 1) / 2; const t = idx - half;
  return { dx: t * spread, dy: Math.abs(t) * 0.5 + (idx % 2) * 0.85 };
}

function smoothClosedPath(pts: Pt[]): string {
  const n = pts.length; if (n < 3) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }; const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d + " Z";
}

/* ════════════════════ BÂTIMENT iso typé ════════════════════ */
type Built = { house: House; ground: Pt[]; base: Pt; roofCenter: Pt; height: number; depth: number };
function Building({ b, status, selected, hover, dim, machines, agentCount, onSelect, onHover, onMachine }: {
  b: Built; status: string; selected: boolean; hover: boolean; dim: boolean; machines: WorldMachine[]; agentCount: number;
  onSelect: () => void; onHover: (v: boolean) => void; onMachine: (m: WorldMachine) => void;
}) {
  const h = b.house; const st = houseStatusStyle(status); const ground = b.ground; const bodyH = b.height; const cx = b.base.x; const roofY = b.base.y - bodyH;
  const focus = selected || hover; const alert = status === "SOURCE_DOWN" || status === "DEGRADED" || status === "ERR";
  const body = block(ground, bodyH);
  const cols = Math.max(2, Math.round(h.w * 0.7)); const rows = Math.max(3, h.levels); const seed = h.id.length + Math.round(h.x) + Math.round(h.y);
  const leftWin = faceWindows(ground[3], ground[2], body.top[3], body.top[2], cols, rows, seed);
  const rightWin = faceWindows(ground[1], ground[2], body.top[1], body.top[2], cols, rows, seed + 3);
  const stepped = h.roof === "stepped"; const upper = stepped ? block(insetTowards(body.top, 0.32), bodyH * 0.5) : null;
  const apex = stepped && upper ? { x: cx, y: upper.top[0].y - (upper.top[2].y - upper.top[0].y) / 2 } : { x: cx, y: roofY };
  const doorBL = lerpPt(ground[1], ground[2], 0.6), doorBR = lerpPt(ground[1], ground[2], 0.84);
  const doorTL = { x: doorBL.x, y: doorBL.y - bodyH * 0.24 }, doorTR = { x: doorBR.x, y: doorBR.y - bodyH * 0.24 };
  const signY = apex.y - (h.roof === "dome" ? 30 : 22);

  return (
    <g style={{ cursor: "pointer" }} opacity={dim ? 0.72 : 1} onClick={(e) => { e.stopPropagation(); onSelect(); }} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      {/* ombre douce */}
      <ellipse cx={cx} cy={b.base.y + 5} rx={h.w * 8} ry={h.w * 3.6} fill="#000" opacity="0.28" />
      {/* liseré statut fin (PAS de gros halo) */}
      {focus && <polygon points={insetTowards(ground, -0.12).map(P).join(" ")} fill="none" stroke={st.color} strokeWidth="1.6" opacity="0.8" />}

      {/* corps */}
      <polygon points={body.leftStr} fill={h.wall} opacity="0.97" />
      <polygon points={body.rightStr} fill={shade(h.wall, -16)} opacity="0.95" />
      {leftWin.map((w, i) => <polygon key={`lw${i}`} points={w.pts} fill={w.lit ? h.accent : "#0a0f1c"} opacity={w.lit ? 0.55 : 0.5} />)}
      {rightWin.map((w, i) => <polygon key={`rw${i}`} points={w.pts} fill={w.lit ? h.accent : "#070b14"} opacity={w.lit ? 0.34 : 0.55} />)}
      <polygon points={body.leftStr} fill="none" stroke={shade(h.accent, -30)} strokeWidth="0.8" opacity="0.6" />
      {/* porte + marche */}
      <polygon points={`${P(doorBL)} ${P(doorBR)} ${P(doorTR)} ${P(doorTL)}`} fill="#050a14" stroke={h.accent} strokeWidth="0.5" strokeOpacity="0.5" />
      <polygon points={body.roofPoly} fill={h.roofColor} /><polygon points={body.roofPoly} fill="url(#roofSheen)" />
      <polygon points={body.roofPoly} fill="none" stroke={h.accent} strokeWidth={focus ? 1.6 : 1} opacity="0.9" />

      {stepped && upper && (<>
        <polygon points={upper.leftStr} fill={h.wall} opacity="0.97" /><polygon points={upper.rightStr} fill={shade(h.wall, -16)} opacity="0.95" />
        <polygon points={upper.roofPoly} fill={h.roofColor} /><polygon points={upper.roofPoly} fill="url(#roofSheen)" /><polygon points={upper.roofPoly} fill="none" stroke={h.accent} strokeWidth="1.1" opacity="0.9" />
      </>)}

      <RoofFeatures h={h} apex={apex} cx={cx} accent={h.accent} alert={alert} />

      {/* drapeau de statut sur le toit (remplace le halo) */}
      <g transform={`translate(${cx - h.w * 7} ${apex.y - 4})`}>
        <line x1="0" y1="6" x2="0" y2="-16" stroke="#9fb3c8" strokeWidth="1.1" />
        <path d="M0 -16 L11 -13 L0 -9 Z" fill={st.color} opacity="0.95" style={{ transformOrigin: "0px -13px", animation: alert ? "flag-alert 0.9s ease-in-out infinite" : "flag-wave 3s ease-in-out infinite" }} />
      </g>

      {/* enseigne = plaque hexagonale + PICTO SVG (zéro emoji) */}
      <g transform={`translate(${cx} ${signY})`}>
        <polygon points="-11,0 -6,-7.5 6,-7.5 11,0 6,7.5 -6,7.5" fill="#071018" stroke={h.accent} strokeWidth="1.2" opacity="0.97" />
        <g fill="none" stroke={h.accent} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">{houseIcon(h.type)}</g>
      </g>

      {/* machines (puces toit) */}
      {machines.map((m, idx) => { const mxp = cx - Math.min(14, h.w * 2.6) + (idx % 5) * 6.5; const myp = roofY + 12 + Math.floor(idx / 5) * 6.5; const mc = runtimeColor(m.status); return (
        <g key={m.id} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onMachine(m); }}><title>{`${m.label} — ${m.status}`}</title><rect x={mxp - 3} y={myp - 3} width="6" height="6" rx="1" fill={mc} opacity="0.92">{!m.ok && <animate attributeName="opacity" values="0.35;1;0.35" dur="1.5s" repeatCount="indefinite" />}</rect><circle cx={mxp} cy={myp} r="8" fill="transparent" /></g>
      ); })}

      {/* label */}
      <g transform={`translate(${cx + h.w * 7} ${roofY - 4})`} opacity={focus ? 1 : 0.92}>
        <rect x="0" y="-9" width={h.name.length * 5.8 + 30} height="27" rx="5" fill="#020617" stroke={focus ? st.color : "#1e3a52"} strokeWidth={focus ? 1.2 : 0.7} opacity="0.96" />
        <text x="7" y="1.5" fontSize="9.5" fontWeight="800" fill="#e2e8f0">{h.name}</text>
        <text x="7" y="12.5" fontSize="7.5" fontWeight="700" fill={st.color}>● {st.label}{agentCount ? ` · ${agentCount} agents` : ""}</text>
      </g>
    </g>
  );
}

/* pictos d'enseigne par type (stroke = accent, hérité du <g> parent) */
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
    case "village": return (<><path d="M-5 5 V-1 L0 -4 L5 -1 V5" /><path d="M-5 -1 L0 -5 L5 -1" /></>);
    case "business": return (<><path d="M3 -4 Q-4 -4 -4 0 Q-4 4 3 4" /><line x1="-6" y1="-1.5" x2="1" y2="-1.5" /><line x1="-6" y1="1.5" x2="1" y2="1.5" /></>);
    default: return <circle cx="0" cy="0" r="3" />;
  }
}

/* features de toit (silhouette distincte) */
function RoofFeatures({ h, apex, cx, accent, alert }: { h: House; apex: Pt; cx: number; accent: string; alert: boolean }) {
  const y = apex.y;
  switch (h.type) {
    case "command_tower": return (<g><line x1={cx} y1={y} x2={cx} y2={y - 26} stroke={accent} strokeWidth="1.5" /><circle cx={cx} cy={y - 26} r="2.4" fill={accent}>{alert && <animate attributeName="opacity" values="1;0.2;1" dur="1.3s" repeatCount="indefinite" />}</circle><ellipse cx={cx + 7} cy={y - 6} rx="7" ry="3" fill="none" stroke={accent} strokeWidth="1.1" opacity="0.85" /></g>);
    case "brain": return (<g><circle cx={cx} cy={y - 4} r="6" fill={accent} opacity="0.5"><animate attributeName="r" values="5;6.5;5" dur="2.6s" repeatCount="indefinite" /></circle><circle cx={cx} cy={y - 4} r="6" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.6" /></g>);
    case "observatory": return (<g><ellipse cx={cx} cy={y} rx="11" ry="7" fill={h.roofColor} stroke={accent} strokeWidth="1" /><line x1={cx} y1={y - 5} x2={cx + 22} y2={y - 19} stroke={accent} strokeWidth="2" opacity="0.5"><animateTransform attributeName="transform" type="rotate" values={`-12 ${cx} ${y - 5}; 12 ${cx} ${y - 5}; -12 ${cx} ${y - 5}`} dur="5s" repeatCount="indefinite" /></line></g>);
    case "factory": return (<g><rect x={cx + 4} y={y - 20} width="5" height="20" fill={h.wall} stroke={accent} strokeWidth="0.6" />{[0, 1, 2].map((k) => <circle key={k} cx={cx + 6.5} cy={y - 22 - k * 6} r={2 + k} fill="#9fb3c8" opacity={0.4 - k * 0.1}><animate attributeName="cy" values={`${y - 20};${y - 38}`} dur="3s" repeatCount="indefinite" begin={`${k}s`} /><animate attributeName="opacity" values="0.5;0" dur="3s" repeatCount="indefinite" begin={`${k}s`} /></circle>)}</g>);
    case "signal_tower": return (<g><line x1={cx} y1={y} x2={cx} y2={y - 22} stroke={accent} strokeWidth="1.4" /><circle cx={cx} cy={y - 22} r="2.4" fill={accent}><animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" /></circle></g>);
    case "academy": return (<g><polygon points={`${cx - 14},${y} ${cx},${y - 11} ${cx + 14},${y}`} fill={h.roofColor} stroke={accent} strokeWidth="1" />{[-10, -5, 0, 5, 10].map((dx, k) => <line key={k} x1={cx + dx} y1={y} x2={cx + dx} y2={y + 6} stroke={accent} strokeWidth="1.2" opacity="0.7" />)}</g>);
    case "calendar": return (<g><rect x={cx - 9} y={y - 14} width="18" height="15" rx="2" fill={h.roofColor} stroke={accent} strokeWidth="1" />{[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={cx - 7 + c * 5} y={y - 7 + r * 3} width="3" height="2" fill={accent} opacity={(r * 3 + c) % 4 === 0 ? 0.9 : 0.35} />))}</g>);
    case "studio": return (<g><rect x={cx - 12} y={y - 14} width="24" height="13" rx="2" fill="#0a0f1c" stroke={accent} strokeWidth="1.1" /><polygon points={`${cx - 3},${y - 11} ${cx + 5},${y - 7.5} ${cx - 3},${y - 4}`} fill={accent} /></g>);
    case "warehouse": return (<g>{[-8, 0, 8].map((dx, k) => <rect key={k} x={cx + dx - 3} y={y - 2} width="6" height="9" rx="1" fill="#0a0f1c" stroke={accent} strokeWidth="0.6" opacity="0.85" />)}</g>);
    case "lab": return (<g><rect x={cx - 8} y={y - 16} width="16" height="16" rx="2" fill={accent} opacity="0.12" stroke={accent} strokeWidth="1" /><circle cx={cx} cy={y - 8} r="6" fill="none" stroke={accent} strokeWidth="1" /></g>);
    case "vault": return (<g><circle cx={cx} cy={y - 6} r="7" fill="#0a0f1c" stroke={accent} strokeWidth="1.4" /><circle cx={cx} cy={y - 6} r="3" fill="none" stroke={accent} strokeWidth="1" /></g>);
    case "gate": return (<g><path d={`M ${cx - 11} ${y + 4} L ${cx - 11} ${y - 6} A 11 11 0 0 1 ${cx + 11} ${y - 6} L ${cx + 11} ${y + 4}`} fill="none" stroke={accent} strokeWidth="1.6" opacity="0.85" /></g>);
    case "compliance": return (<g><path d={`M ${cx} ${y - 16} L ${cx + 9} ${y - 12} L ${cx + 9} ${y - 3} Q ${cx + 9} ${y + 4} ${cx} ${y + 7} Q ${cx - 9} ${y + 4} ${cx - 9} ${y - 3} L ${cx - 9} ${y - 12} Z`} fill={accent} opacity="0.18" stroke={accent} strokeWidth="1.3" /></g>);
    case "village": return (<g>{[-10, 0, 10].map((dx, k) => <polygon key={k} points={`${cx + dx - 5},${y} ${cx + dx},${y - 6} ${cx + dx + 5},${y}`} fill={h.roofColor} stroke={accent} strokeWidth="0.8" />)}</g>);
    default: return null;
  }
}

/* ════════════════════ DÉCOR (arbres / lampes / caisses / rochers) ════════════════════ */
function Deco({ d }: { d: { kind: "tree" | "lamp" | "crate" | "rock"; x: number; y: number; seed: number } }) {
  const { x, y, kind, seed } = d; const s = 0.9 + rseed(seed * 2.3) * 0.4;
  if (kind === "tree") return (<g transform={`translate(${x} ${y}) scale(${s})`}><ellipse cx="0" cy="1" rx="7" ry="3" fill="#000" opacity="0.25" /><rect x="-1.3" y="-8" width="2.6" height="9" fill="#3d2a18" /><path d="M0 -22 L7 -6 L-7 -6 Z" fill="#143524" stroke="#0d2418" strokeWidth="0.8" /><path d="M0 -16 L6 -3 L-6 -3 Z" fill="#1a4530" stroke="#0d2418" strokeWidth="0.8" /></g>);
  if (kind === "lamp") return (<g transform={`translate(${x} ${y}) scale(${s})`}><ellipse cx="0" cy="1" rx="4" ry="2" fill="#000" opacity="0.25" /><rect x="-1" y="-16" width="2" height="17" fill="#2a3340" /><circle cx="0" cy="-18" r="2.6" fill="#ffd98a" opacity="0.9"><animate attributeName="opacity" values="0.6;1;0.6" dur={`${3 + rseed(seed) * 2}s`} repeatCount="indefinite" /></circle></g>);
  if (kind === "crate") return (<g transform={`translate(${x} ${y}) scale(${s})`}><ellipse cx="0" cy="2" rx="6" ry="2.5" fill="#000" opacity="0.22" /><polygon points="-5,-1 0,-3.5 5,-1 0,1.5" fill="#5a4326" /><polygon points="-5,-1 0,1.5 0,7 -5,4.5" fill="#3d2c18" /><polygon points="5,-1 0,1.5 0,7 5,4.5" fill="#4a371f" /></g>);
  return (<g transform={`translate(${x} ${y}) scale(${s})`}><ellipse cx="0" cy="1" rx="6" ry="2.5" fill="#000" opacity="0.2" /><polygon points="-5,1 -2,-4 3,-4 6,1 2,4 -3,4" fill="#28323d" stroke="#1a212c" strokeWidth="0.6" /></g>);
}

/* ════════════════════ PERSONNAGE RPG (vectoriel, zéro emoji) ════════════════════ */
function RPGCharacter({ agent, x, y, state, facing, alert, selected, hover, onSelect, onHover }: {
  agent: CanonAgent; x: number; y: number; state: MoveState; facing: 1 | -1; alert: boolean; selected: boolean; hover: boolean;
  onSelect: () => void; onHover: (v: boolean) => void;
}) {
  const rank = rankFor(agent); const moving = state === "walking" || state === "returningHome"; const working = state === "working";
  const W = selected ? 62 : hover ? 56 : 50; const Hh = W * 1.32;
  const c1 = agent.colorPrimary, c2 = agent.colorAccent, hairCol = shade(agent.houseColor || "#334155", -10);
  const skin = ["#e8c39e", "#d9a87e", "#c98e63", "#f0d2b0"][Math.floor(rseed(agent.name.length * 3.7) * 4)];
  const animClass = moving ? "char-walk" : "char-idle";
  return (
    <div className="pointer-events-auto absolute" style={{ left: x, top: y, width: W, height: Hh, transform: "translate(-50%,-78%)", transition: "left 3s cubic-bezier(.42,.04,.32,1), top 3s cubic-bezier(.42,.04,.32,1), width .18s, height .18s", zIndex: selected ? 40 : hover ? 36 : 20, cursor: "pointer" }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      {(selected || hover) && (
        <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold text-slate-100" style={{ top: -6, background: "rgba(2,6,15,0.94)", borderColor: `${c1}99`, boxShadow: `0 0 12px ${c1}55` }}>
          {agent.name}<span className="ml-1 font-normal text-slate-400">{agent.roleBadge}</span>
        </div>
      )}
      <svg viewBox="0 0 50 66" width={W} height={Hh} style={{ overflow: "visible", display: "block" }}>
        {/* ombre + anneau de sélection au SOL (pas de halo géant) */}
        <ellipse cx="25" cy="60" rx="13" ry="4" fill="#000" opacity="0.4" />
        {selected && <ellipse cx="25" cy="60" rx="15" ry="5" fill="none" stroke={c2} strokeWidth="2"><animate attributeName="rx" values="13;17;13" dur="1.6s" repeatCount="indefinite" /><animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" /></ellipse>}
        {alert && <g><line x1="40" y1="6" x2="40" y2="13" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round"><animate attributeName="opacity" values="1;0.3;1" dur="0.9s" repeatCount="indefinite" /></line><circle cx="40" cy="17" r="1.4" fill="#ef4444" /></g>}

        {/* personnage (flip selon facing) */}
        <g className={animClass} style={{ transformOrigin: "25px 58px", transform: facing === -1 ? "scaleX(-1)" : undefined }}>
          {/* pieds */}
          <ellipse cx="20" cy="56" rx="3.2" ry="2" fill="#1a1410" /><ellipse cx="30" cy="56" rx="3.2" ry="2" fill="#1a1410" />
          {/* cape / tunique (cloche) */}
          <path d="M25 22 C16 24 13 34 12 52 L38 52 C37 34 34 24 25 22 Z" fill={c1} stroke={shade(c1, -34)} strokeWidth="1.2" />
          <path d="M25 22 C21 24 19 34 19 52 L25 52 Z" fill={shade(c1, 14)} opacity="0.55" />
          {/* ceinture */}
          <path d="M14 41 Q25 45 36 41" fill="none" stroke={c2} strokeWidth="2" opacity="0.9" />
          {/* col / épaulière */}
          <path d="M17 25 Q25 20 33 25 L31 30 Q25 27 19 30 Z" fill={c2} opacity="0.92" />
          {/* tête */}
          <circle cx="25" cy="16" r="8" fill={skin} stroke={shade(skin, -30)} strokeWidth="0.8" />
          {/* cheveux / capuche de base */}
          <path d="M17 14 Q18 6 25 6 Q32 6 33 14 Q30 10 25 10 Q20 10 17 14 Z" fill={hairCol} />
          {/* yeux minimalistes */}
          <circle cx="22.5" cy="17" r="0.9" fill="#1f2937" /><circle cx="27.5" cy="17" r="0.9" fill="#1f2937" />
          {/* insigne de rang (dessiné) */}
          {rank === "crown" && <path d="M18 6 L20 1 L22.5 5 L25 0 L27.5 5 L30 1 L32 6 Q25 3 18 6 Z" fill="#ffd54a" stroke="#a9760a" strokeWidth="0.6" />}
          {rank === "diadem" && <path d="M18 7 Q25 2 32 7 L30 9 Q25 6 20 9 Z" fill="#c9b3ff" stroke="#6b48c7" strokeWidth="0.6" />}
          {rank === "captain" && <g stroke={c2} strokeWidth="1.6" fill="none" strokeLinecap="round"><path d="M21 4 L25 7 L29 4" /><path d="M21 8 L25 11 L29 8" /></g>}
          {/* bras (le long du corps, l'avant s'anime en marche/travail) */}
          <ellipse cx="14.5" cy="38" rx="3" ry="7.5" fill={shade(c1, -18)} />
          <g className={working ? "char-arm" : moving ? "char-arm-walk" : undefined} style={{ transformOrigin: "35px 31px" }}>
            <ellipse cx="35.5" cy="38" rx="3" ry="7.5" fill={shade(c1, -10)} />
          </g>
        </g>
      </svg>
    </div>
  );
}

/* ════════════════════ INSPECTOR agent (mini perso vectoriel) ════════════════════ */
function AgentInspector({ agent, state, houseName, houseStatus, onClose, onGotoHouse }: {
  agent: CanonAgent; state: MoveState; houseName: string; houseStatus: { color: string; label: string }; onClose: () => void; onGotoHouse: () => void;
}) {
  const stateLabel: Record<MoveState, string> = { idleAtHome: "À sa maison", walking: "En déplacement", working: "En mission", returningHome: "Retour maison" };
  const c1 = agent.colorPrimary, c2 = agent.colorAccent;
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-14 w-12 shrink-0 items-end justify-center rounded-lg" style={{ background: `linear-gradient(180deg, ${shade(c1, 20)}22, ${c1}10)`, border: `1px solid ${c1}55` }}>
            <svg viewBox="0 0 50 66" width="44" height="58" style={{ overflow: "visible" }}>
              <ellipse cx="25" cy="60" rx="12" ry="3.5" fill="#000" opacity="0.35" />
              <path d="M25 22 C16 24 13 34 12 52 L38 52 C37 34 34 24 25 22 Z" fill={c1} stroke={shade(c1, -34)} strokeWidth="1.2" />
              <path d="M14 41 Q25 45 36 41" fill="none" stroke={c2} strokeWidth="2" /><path d="M17 25 Q25 20 33 25 L31 30 Q25 27 19 30 Z" fill={c2} />
              <circle cx="25" cy="16" r="8" fill="#e8c39e" /><path d="M17 14 Q18 6 25 6 Q32 6 33 14 Q30 10 25 10 Q20 10 17 14 Z" fill={shade(agent.houseColor || "#334155", -10)} />
              <circle cx="22.5" cy="17" r="0.9" fill="#1f2937" /><circle cx="27.5" cy="17" r="0.9" fill="#1f2937" />
            </svg>
          </div>
          <div className="min-w-0"><div className="truncate text-[14px] font-black" style={{ color: c2 }}>{agent.name}</div><div className="truncate text-[10px] uppercase tracking-wide text-slate-400">{agent.roleBadge}</div></div>
        </div>
        <button type="button" onClick={onClose} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${houseStatus.color}22`, color: houseStatus.color, border: `1px solid ${houseStatus.color}55` }}>● {stateLabel[state]}</span>
        {agent.rankLayer && <span className="inline-block rounded-full border border-slate-700 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-300">{agent.rankLayer.replace(/_/g, " ")}</span>}
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Maison propriétaire</p>
      <button type="button" onClick={onGotoHouse} className="mt-0.5 flex w-full items-center justify-between rounded border border-slate-700/60 px-2 py-1 text-left hover:border-cyan-300/60"><span className="text-[11px] font-bold text-slate-200">{houseName}</span><span className="text-[9px] font-bold" style={{ color: houseStatus.color }}>● {houseStatus.label}</span></button>
      {agent.boss && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Reporte à</p><p className="text-[11px] text-slate-300">{agent.boss}</p></>)}
      {agent.engine && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Moteur</p><p className="text-[11px] text-slate-300">{agent.engine}</p></>)}
      {agent.responsibilities.length > 0 && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Responsabilités</p><ul className="mt-0.5 flex flex-col gap-0.5">{agent.responsibilities.slice(0, 6).map((r, i) => <li key={i} className="flex gap-1 text-[10px] leading-snug text-slate-300"><span className="text-slate-500">▸</span><span className="min-w-0">{r}</span></li>)}</ul></>)}
    </div>
  );
}

const KEYFRAMES = `
@keyframes char-idle { 0%,100% { transform: translateY(0) scaleY(1); } 50% { transform: translateY(-1px) scaleY(1.015); } }
@keyframes char-walk { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-2.5px) rotate(2deg); } }
@keyframes char-arm { 0%,100% { transform: rotate(-18deg); } 50% { transform: rotate(22deg); } }
@keyframes char-arm-walk { 0%,100% { transform: rotate(-14deg); } 50% { transform: rotate(14deg); } }
@keyframes flag-wave { 0%,100% { transform: skewY(0deg) scaleX(1); } 50% { transform: skewY(-6deg) scaleX(0.92); } }
@keyframes flag-alert { 0%,100% { transform: skewY(0deg); opacity: 1; } 50% { transform: skewY(-8deg); opacity: 0.5; } }
@keyframes coast-breathe { 0%,100% { opacity: 0.18; } 50% { opacity: 0.34; } }
.char-walk { animation: char-walk 0.62s ease-in-out infinite; }
.char-idle { animation: char-idle 3.2s ease-in-out infinite; }
.char-arm { animation: char-arm 0.7s ease-in-out infinite; }
.char-arm-walk { animation: char-arm-walk 0.6s ease-in-out infinite; }
`;

export default WorldMapLiving;
