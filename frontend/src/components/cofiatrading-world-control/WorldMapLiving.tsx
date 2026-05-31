"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — CITÉ VIVANTE (Cof-Island)
 * Refonte map vivante (2026-05-31). Même emplacement, même shell, même
 * contrat de props. La SCÈNE est reconstruite : île + côtes + 6 districts
 * d'activité + réseau de routes, 15 bâtiments iso DISTINCTS par type,
 * et 38 avatars agents RÉELS (visage, anneau statut, badge rôle, nom)
 * rattachés à leur maison propriétaire, qui se déplacent sur les routes.
 * Bind live : registry :8767 (statut maison), snapshot (KPIs + agents
 * canon avatars), trucks/world-state (flux + events). Avatars = couche
 * HTML overlay projetée depuis l'iso → nets, grands, lisibles (48-64px).
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
  agentsCanon?: {
    ok?: boolean;
    count?: number;
    sourceTag?: string;
    agents?: CanonAgent[];
  };
  openclawRuntime?: {
    sourceTag: string;
    status: string;
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
    jarod: {
      name: string;
      runtimeStatus: string;
      proof: string;
      nextAction: string;
    } | null;
    services: Array<{ id: string; label: string; ok: boolean; status: string; http_code: number | null }>;
    agents: Array<{
      id: string;
      name: string;
      team: string;
      homeHouse: string;
      runtimeStatus: string;
      tickEnabled: boolean;
      proof: string;
      nextAction: string;
    }>;
    problems: Array<{ severity: string; title: string; proof: string; patch: string }>;
  };
};

export type AngelStatus =
  | "LIVE"
  | "OPERATIONAL_PARTIAL"
  | "CANON_GATE"
  | "AWAITING_SETUP"
  | "DEGRADED"
  | "BROKEN";

export type Angel = {
  id: number;
  name: string;
  name_ar: string;
  platform: string;
  manzilah: string;
  status: AngelStatus;
  mission: string;
  stack?: string;
  proof_url?: string;
  arr_impact_eur_year?: number;
};

export type FeedEvent = {
  id: string;
  kind?: string;
  status?: string;
  label: string;
  source?: string;
  proof?: string;
  ts?: string;
};

export type Truck = {
  id: string;
  name: string;
  from: string;
  to: string;
  payload: string;
  owner: string;
  cadence?: string;
  kind?: string;
  source?: string;
};

export type AngelRoster = {
  total_anges?: number;
  counts?: {
    live: number;
    operational_partial: number;
    canon_gate: number;
    awaiting_setup: number;
    degraded: number;
    broken: number;
  };
  anges?: Angel[];
};

/* ════════ Projection iso (2:1) — héritée de cof-island-v21 ════════ */
const ISO_W = 30;
const ISO_H = 16;
const isoProject = (wx: number, wy: number) => ({
  sx: (wx - wy) * (ISO_W / 2),
  sy: (wx + wy) * (ISO_H / 2),
});

/* ════════ Districts d'activité (6 zones canon) ════════ */
type ZoneId = "core" | "knowledge" | "publishing" | "academy" | "revenue" | "risk";
const ZONES: Record<ZoneId, { label: string; color: string; sub: string }> = {
  core:       { label: "CORE",       color: "#2f9bff", sub: "Command & Brain" },
  knowledge:  { label: "KNOWLEDGE",  color: "#a78bfa", sub: "Vault · Graph · Backlog" },
  publishing: { label: "PUBLISHING", color: "#ff5b7f", sub: "Studio · Assets · Site" },
  academy:    { label: "ACADEMY",    color: "#2dd4bf", sub: "Markets & Education" },
  revenue:    { label: "REVENUE",    color: "#ffc93c", sub: "CRM · VIP · Brokers" },
  risk:       { label: "RISK",       color: "#ff5470", sub: "Compliance & Cadence" },
};

/* ════════ 15 maisons canon : type bâtiment + zone + palette + position iso ════════ */
type BuildingType =
  | "command_tower" | "brain" | "village"
  | "vault" | "observatory" | "factory"
  | "studio" | "warehouse" | "lab"
  | "signal_tower" | "academy"
  | "business" | "gate"
  | "compliance" | "calendar";

type House = {
  id: string;
  name: string;
  sub: string;
  x: number; y: number; w: number; h: number;
  type: BuildingType;
  zone: ZoneId;
  /** silhouette du toit */
  roof: "flat" | "pitch" | "saw" | "dome" | "stepped";
  /** enseigne emoji (identité instantanée, lisible sans label) */
  sign: string;
  levels: number;
  wall: string; roofColor: string; accent: string;
  role: string;
};

const HOUSES: House[] = [
  // ── KNOWLEDGE (nord) ──
  { id: "obsidian_library", name: "Knowledge Vault", sub: "Obsidian & Drive", x: 50, y: 10, w: 5, h: 4, type: "vault", zone: "knowledge", roof: "flat", sign: "🔒", levels: 3, wall: "#1f2840", roofColor: "#0b1022", accent: "#cbd5f5", role: "Canon, Drive index et bundles sources" },
  { id: "lightrag_observatory", name: "Lighthouse Observatory", sub: "Semantic graph", x: 58, y: 17, w: 5, h: 4, type: "observatory", zone: "knowledge", roof: "dome", sign: "🔭", levels: 5, wall: "#241b4d", roofColor: "#120a28", accent: "#a78bfa", role: "Mémoire sémantique LightRAG, recall sourcé" },
  { id: "paperclip_factory", name: "Paperclip Factory", sub: "Backlog scoring", x: 44, y: 20, w: 6, h: 4, type: "factory", zone: "knowledge", roof: "saw", sign: "🏭", levels: 3, wall: "#2a1746", roofColor: "#140a24", accent: "#7c5cff", role: "Scoring tâches Paperclip et nettoyage backlog" },
  // ── ACADEMY (ouest) ──
  { id: "mt4_signal_tower", name: "Trading Tower", sub: "Markets & Research", x: 24, y: 25, w: 5, h: 5, type: "signal_tower", zone: "academy", roof: "stepped", sign: "📈", levels: 7, wall: "#0c2018", roofColor: "#04100a", accent: "#00e676", role: "Recherche trading, paper analytics, STRAT-17/18 LIVE" },
  { id: "trading_academy", name: "Trading Academy", sub: "cofiatrading Academy", x: 36, y: 42, w: 7, h: 4, type: "academy", zone: "academy", roof: "pitch", sign: "🎓", levels: 4, wall: "#143350", roofColor: "#081726", accent: "#38bdf8", role: "Académie : site public → modules → preuves → Trading Tower" },
  // ── CORE (centre) ──
  { id: "central_brain", name: "Central Brain", sub: "AI Meta-Surveillance", x: 47, y: 31, w: 6, h: 6, type: "brain", zone: "core", roof: "dome", sign: "🧠", levels: 6, wall: "#241149", roofColor: "#100522", accent: "#8b5cf6", role: "Orchestration cross-IA, mémoire vivante, routing missions" },
  { id: "mission_control_tower", name: "Command Tower", sub: "Command & Control", x: 56, y: 35, w: 6, h: 5, type: "command_tower", zone: "core", roof: "stepped", sign: "🛰️", levels: 8, wall: "#0f2c49", roofColor: "#05131f", accent: "#2f9bff", role: "Tour de contrôle, board, priorités, routing GO" },
  { id: "openclaw_agent_barracks", name: "Agents Village", sub: "OpenClaw agents", x: 68, y: 49, w: 8, h: 4, type: "village", zone: "core", roof: "pitch", sign: "🦞", levels: 2, wall: "#3a2207", roofColor: "#160a03", accent: "#ff7a00", role: "Runtime OpenClaw et performance agents" },
  // ── PUBLISHING (est) ──
  { id: "youtube_studio", name: "COF IA Publisher", sub: "Video Production Machine", x: 92, y: 22, w: 6, h: 4, type: "studio", zone: "publishing", roof: "flat", sign: "▶", levels: 4, wall: "#3f1119", roofColor: "#15050a", accent: "#ff2d55", role: "Machine vidéo : scénarios, render, review, timeline, drafts" },
  { id: "assets_warehouse", name: "Publisher Suite", sub: "Assets · Voice · Distribution", x: 96, y: 38, w: 6, h: 4, type: "warehouse", zone: "publishing", roof: "saw", sign: "🎞️", levels: 3, wall: "#062f2d", roofColor: "#021413", accent: "#14b8a6", role: "Assets brand, render gallery, voix, packaging, distribution" },
  { id: "site_seo_lab", name: "Site & SEO Lab", sub: "Website & Growth", x: 13, y: 48, w: 5, h: 4, type: "lab", zone: "publishing", roof: "flat", sign: "🌐", levels: 4, wall: "#101b2e", roofColor: "#dbe6f5", accent: "#7dd3fc", role: "Site, SEO, tests locaux et deploy readiness" },
  // ── REVENUE (sud) ──
  { id: "iron_office", name: "Revenue & CRM", sub: "MRR / VIP / Brokers", x: 31, y: 54, w: 5, h: 4, type: "business", zone: "revenue", roof: "stepped", sign: "€", levels: 5, wall: "#4a3411", roofColor: "#1d1305", accent: "#ffd400", role: "Revenue, CRM, VIP, FTD et diagnostic brokers" },
  { id: "vip_gate", name: "Telegram Community", sub: "Free / VIP channels", x: 40, y: 68, w: 5, h: 4, type: "gate", zone: "revenue", roof: "pitch", sign: "📡", levels: 3, wall: "#0c3a66", roofColor: "#05182c", accent: "#00d9ff", role: "Acquisition Telegram, gate VIP et rétention" },
  // ── RISK (sud-est) ──
  { id: "compliance_port", name: "Compliance Gate", sub: "CNMV · AEPD · ESMA", x: 82, y: 70, w: 5, h: 4, type: "compliance", zone: "risk", roof: "pitch", sign: "🛡️", levels: 4, wall: "#3c0712", roofColor: "#150206", accent: "#ff3b52", role: "Compliance CNMV/AEPD/ESMA, safety, DLP, GO packets" },
  { id: "calendar_tower", name: "Calendar Tower", sub: "Recurring missions", x: 95, y: 56, w: 5, h: 4, type: "calendar", zone: "risk", roof: "stepped", sign: "📅", levels: 6, wall: "#3a2500", roofColor: "#120b00", accent: "#ffb000", role: "Cadence missions et tâches agents récurrentes" },
];

const HOUSE_BY_ID: Record<string, House> = Object.fromEntries(HOUSES.map((h) => [h.id, h]));

/* ════════ Réseau de routes (avenues canon) — sert au visuel ET au déplacement ════════ */
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
  for (const [a, b] of ROAD_LINKS) {
    (m[a] ||= []).push(b);
    (m[b] ||= []).push(a);
  }
  return m;
})();

/* agent (ange Sourate) -> maison (inspector seulement) */
const ANGEL_HOME_BY_ID: Record<number, string> = {
  1: "central_brain", 2: "central_brain", 3: "youtube_studio", 4: "iron_office",
  5: "compliance_port", 6: "compliance_port", 7: "compliance_port", 8: "vip_gate",
  9: "youtube_studio", 10: "youtube_studio", 11: "site_seo_lab", 12: "youtube_studio",
  13: "assets_warehouse", 14: "site_seo_lab", 15: "site_seo_lab", 16: "site_seo_lab",
  17: "trading_academy", 18: "vip_gate", 19: "iron_office", 20: "iron_office",
  21: "calendar_tower", 22: "mt4_signal_tower", 23: "mt4_signal_tower", 24: "site_seo_lab",
  25: "openclaw_agent_barracks", 26: "assets_warehouse", 27: "trading_academy", 28: "compliance_port",
  29: "compliance_port", 30: "paperclip_factory", 31: "obsidian_library", 32: "lightrag_observatory",
  33: "central_brain", 34: "compliance_port", 35: "mt4_signal_tower", 36: "mt4_signal_tower",
  37: "calendar_tower", 38: "mission_control_tower",
};

const SERVICE_HOME_BY_ID: Record<string, string> = {
  hub_8430: "mission_control_tower",
  mission_control_3000: "mission_control_tower",
  central_brain_8767: "central_brain",
  llm_proxy_11435: "central_brain",
  cofiapublisher_8540: "youtube_studio",
  openclaw_gateway_18789: "openclaw_agent_barracks",
  inventory_8433: "assets_warehouse",
  lightrag_9621: "lightrag_observatory",
  paperclip_3100: "paperclip_factory",
};

type RuntimeAgent = NonNullable<CofiaSnapshot["openclawRuntime"]>["agents"][number];
type WorldMachine = { id: string; label: string; homeHouse: string; ok: boolean; status: string; role?: string; proof?: string };

const runtimeColor = (status: string) =>
  status === "FRESH" || status === "LIVE" || status === "GREEN"
    ? "#34d399"
    : status === "SLEEPING" || status === "PAUSED"
      ? "#64748b"
    : status === "STALE" || status === "AMBER" || status === "DEGRADED"
      ? "#f59e0b"
      : "#ef4444";

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
  LIVE: { color: "#10b981", label: "LIVE" },
  OPERATIONAL_PARTIAL: { color: "#22d3ee", label: "PARTIEL" },
  CANON_GATE: { color: "#38bdf8", label: "CANON GATE" },
  AWAITING_SETUP: { color: "#64748b", label: "À ACTIVER" },
  DEGRADED: { color: "#f59e0b", label: "DEGRADED" },
  BROKEN: { color: "#ef4444", label: "CASSÉ" },
};

const fmtEur = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? `${new Intl.NumberFormat("fr-FR").format(v)} €` : "source down";
const fmtNum = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? new Intl.NumberFormat("fr-FR").format(v) : "source down";

/* ════════ Géométrie iso ════════ */
type Pt = { x: number; y: number };
const P = (pt: Pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const centroid = (pts: Pt[]): Pt => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
const insetTowards = (pts: Pt[], k: number): Pt[] => { const c = centroid(pts); return pts.map((p) => lerpPt(p, c, k)); };
/** rand déterministe (pas de Math.random → pas de mismatch hydration) */
const rseed = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

type Win = { pts: string; lit: boolean };
function faceWindows(BL: Pt, BR: Pt, TL: Pt, TR: Pt, cols: number, rows: number, seed: number): Win[] {
  const out: Win[] = [];
  const mx = 0.2, my = 0.24;
  const at = (u: number, v: number): Pt => lerpPt(lerpPt(BL, BR, u), lerpPt(TL, TR, u), v);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = at((c + mx) / cols, (r + my) / rows);
      const b = at((c + 1 - mx) / cols, (r + my) / rows);
      const d = at((c + 1 - mx) / cols, (r + 1 - my) / rows);
      const e = at((c + mx) / cols, (r + 1 - my) / rows);
      const lit = ((c * 7 + r * 13 + seed) % 5) !== 0;
      out.push({ pts: `${P(a)} ${P(b)} ${P(d)} ${P(e)}`, lit });
    }
  }
  return out;
}

/** un bloc extrudé : 4 points de base (déjà projetés) + hauteur → murs + toit */
function block(basePts: Pt[], height: number) {
  const top: Pt[] = basePts.map((p) => ({ x: p.x, y: p.y - height }));
  // base order: 0 back, 1 right, 2 front, 3 left
  const leftWall = [basePts[3], basePts[2], top[2], top[3]];
  const rightWall = [basePts[1], basePts[2], top[2], top[1]];
  return { top, leftWall, rightWall, roofPoly: top.map(P).join(" "), leftStr: leftWall.map(P).join(" "), rightStr: rightWall.map(P).join(" ") };
}

type Built = {
  house: House;
  ground: Pt[];
  base: Pt;          // centre sol
  roofCenter: Pt;    // centre du sommet (pour toppers/enseigne)
  height: number;
  depth: number;     // tri painter (x+y)
};

function houseGeometry(h: House): Built {
  const bodyH = 9 + h.levels * 7;
  const corners = [
    [h.x, h.y], [h.x + h.w, h.y], [h.x + h.w, h.y + h.h], [h.x, h.y + h.h],
  ].map(([wx, wy]) => isoProject(wx, wy));
  const ground: Pt[] = corners.map((c) => ({ x: c.sx, y: c.sy }));
  const base = centroid(ground);
  const roofCenter = { x: base.x, y: base.y - bodyH };
  return { house: h, ground, base, roofCenter, height: bodyH, depth: h.x + h.y };
}

/* Catmull-Rom → path lissé fermé (île, blobs district) */
function smoothClosedPath(pts: Pt[]): string {
  const n = pts.length;
  if (n < 3) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d + " Z";
}

/* ancre "devant la maison" en coords monde (cour avant, là où vivent les agents) */
const houseFrontWorld = (h: House) => ({ wx: h.x + h.w / 2 + 0.6, wy: h.y + h.h + 2.2 });
const midWorld = (a: House, b: House) => {
  const fa = houseFrontWorld(a), fb = houseFrontWorld(b);
  return { wx: (fa.wx + fb.wx) / 2, wy: (fa.wy + fb.wy) / 2 };
};

/* profil de déplacement d'un agent (data-driven, dérivé du rang/maison) */
type RouteProfile = "system" | "patrol" | "operator" | "resident" | "support";
function profileFor(a: CanonAgent, idx: number): RouteProfile {
  const r = a.rankLayer || "";
  if (r.includes("L0")) return "system";          // Erwin — reste au QG
  if (r.includes("L1")) return "patrol";           // Codex — patrouille le Core
  if (r.includes("L2")) return "patrol";           // managers — patrouillent
  if (a.house === "openclaw_agent_barracks") return "operator";
  if (a.house === "compliance_port" || a.house === "calendar_tower") return "support";
  return idx % 2 === 0 ? "operator" : "resident";  // mix vivant
}

type MoveState = "idleAtHome" | "walking" | "working" | "returningHome";

export function WorldMapLiving({
  snapshot,
  angelRoster,
  onSelectHouse,
}: {
  snapshot: CofiaSnapshot | null;
  angelRoster?: AngelRoster | null;
  onSelectHouse: (houseId: string) => void;
}) {
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

  // ── Statut live maisons (registry :8767 via route serveur), refetch 30s ──
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/cofiatrading-world-control/registry", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP_${r.status}`);
        const data = await r.json();
        const houses = (data?.houses ?? {}) as Record<string, { status?: unknown; on_demand?: unknown }>;
        const map: Record<string, string> = {};
        const onDemand = new Set<string>();
        for (const [id, v] of Object.entries(houses)) {
          if (typeof v?.status === "string") map[id] = v.status;
          if (v?.on_demand === true) onDemand.add(id);
        }
        if (!cancelled) {
          setHouseStatuses(map); setOnDemandSet(onDemand); setRegistryError(false);
          lastFetch.current = Date.now(); setSyncStamp(new Date().toLocaleTimeString("fr-FR"));
        }
      } catch { if (!cancelled) setRegistryError(true); }
    };
    void load();
    const iv = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, []);

  // ── Camions canon (flux inter-maisons réels) ──
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/trucks", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && Array.isArray(d?.trucks)) setTrucks(d.trucks); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── KPIs réels par maison ──
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/house-kpis", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.houses) setHouseKpiData(d.houses); })
      .catch(() => {});
    void load();
    const iv = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, []);

  // ── Live feed events ──
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/cofiatrading-world-control/world-state", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && Array.isArray(d?.events)) setEvents(d.events); })
      .catch(() => {});
    void load();
    const iv = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, []);

  // ── Taille du conteneur (pour projeter les avatars overlay) ──
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ cw: cr.width, ch: cr.height });
      }
    });
    ro.observe(el);
    setSize({ cw: el.clientWidth, ch: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const statusFor = (id: string): string => {
    if (houseStatuses && houseStatuses[id]) {
      const raw = houseStatuses[id];
      if (onDemandSet.has(id) && (raw === "SOURCE_DOWN" || raw === "DEGRADED")) return "SLEEPING";
      return raw;
    }
    if (registryError) return "ERR";
    if (houseStatuses === null) return "LOADING";
    return "ERR";
  };

  // ── Géométrie scène : bâtiments + viewBox auto-fit + île + districts + routes ──
  const scene = useMemo(() => {
    const built = HOUSES.map(houseGeometry);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const center: Record<string, Pt> = {};
    for (const b of built) {
      for (const pt of [...b.ground, b.roofCenter]) {
        minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
      }
      center[b.house.id] = b.roofCenter;
    }
    const pad = 150;
    const vbMinX = minX - pad, vbMinY = minY - pad;
    const vbW = maxX - minX + pad * 2, vbH = maxY - minY + pad * 2;
    const viewBox = `${vbMinX.toFixed(0)} ${vbMinY.toFixed(0)} ${vbW.toFixed(0)} ${vbH.toFixed(0)}`;

    // île : hull radial autour des centres de maisons (blob iso lissé)
    const cs = built.map((b) => b.base);
    const ic = centroid(cs);
    const N = 30;
    const islandPts: Pt[] = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const dx = Math.cos(a), dy = Math.sin(a) * 0.82;
      let maxProj = -Infinity;
      for (const p of cs) maxProj = Math.max(maxProj, (p.x - ic.x) * dx + (p.y - ic.y) * dy);
      const margin = 175 + rseed(k * 3.3) * 70;
      islandPts.push({ x: ic.x + (maxProj + margin) * dx, y: ic.y + (maxProj + margin) * dy });
    }
    const islandPath = smoothClosedPath(islandPts);
    const islandPath2 = smoothClosedPath(islandPts.map((p) => lerpPt(p, ic, 0.05)));
    const beachPath = smoothClosedPath(islandPts.map((p) => lerpPt(p, ic, -0.04)));

    // blobs district (sous les maisons de la zone)
    const zoneBlobs: Array<{ id: ZoneId; path: string; label: Pt }> = [];
    (Object.keys(ZONES) as ZoneId[]).forEach((zid) => {
      const members = built.filter((b) => b.house.zone === zid).map((b) => b.base);
      if (!members.length) return;
      const zc = centroid(members);
      const M = 18;
      const pts: Pt[] = [];
      for (let k = 0; k < M; k++) {
        const a = (k / M) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a) * 0.82;
        let mp = -Infinity;
        for (const p of members) mp = Math.max(mp, (p.x - zc.x) * dx + (p.y - zc.y) * dy);
        pts.push({ x: zc.x + (mp + 95) * dx, y: zc.y + (mp + 70) * dy });
      }
      zoneBlobs.push({ id: zid, path: smoothClosedPath(pts), label: { x: zc.x, y: zc.y - (members.length > 2 ? 120 : 95) } });
    });

    // routes : ribbons courbés entre ancres devant-maison
    const roads = ROAD_LINKS.map(([a, b, kind], i) => {
      const ha = HOUSE_BY_ID[a], hb = HOUSE_BY_ID[b];
      const fa = isoProject(houseFrontWorld(ha).wx, houseFrontWorld(ha).wy);
      const fb = isoProject(houseFrontWorld(hb).wx, houseFrontWorld(hb).wy);
      const mx = (fa.sx + fb.sx) / 2, my = (fa.sy + fb.sy) / 2 - 14 - (i % 3) * 6;
      const d = `M ${fa.sx.toFixed(1)} ${fa.sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${fb.sx.toFixed(1)} ${fb.sy.toFixed(1)}`;
      return { id: `${a}__${b}`, d, kind, zone: ha.zone };
    });

    return { built, viewBox, vbMinX, vbMinY, vbW, vbH, center, islandPath, islandPath2, beachPath, zoneBlobs, roads, islandCenter: ic };
  }, []);

  // peindre les bâtiments dans l'ordre de profondeur
  const builtSorted = useMemo(() => [...scene.built].sort((p, q) => p.depth - q.depth), [scene.built]);

  const angels = useMemo(() => angelRoster?.anges ?? [], [angelRoster?.anges]);
  const angelsByHome = useMemo(() => {
    const m: Record<string, Angel[]> = {};
    for (const a of angels) (m[ANGEL_HOME_BY_ID[a.id] ?? "central_brain"] ||= []).push(a);
    return m;
  }, [angels]);

  // ── Agents canon (38) → avatars vivants ──
  const canonAgents = useMemo<CanonAgent[]>(() => {
    const list = snapshot?.agentsCanon?.agents ?? [];
    return list.map((a) => ({ ...a, house: HOUSE_BY_ID[a.house] ? a.house : "central_brain" }));
  }, [snapshot?.agentsCanon]);
  const agentsByHome = useMemo(() => {
    const m: Record<string, CanonAgent[]> = {};
    for (const a of canonAgents) (m[a.house] ||= []).push(a);
    return m;
  }, [canonAgents]);

  const liveCount = HOUSES.filter((z) => statusFor(z.id) === "LIVE").length;
  const activeMissions = angels.filter((a) => a.status === "LIVE" || a.status === "OPERATIONAL_PARTIAL" || a.status === "CANON_GATE").length;
  const blockerMissions = angels.filter((a) => a.status === "BROKEN" || a.status === "DEGRADED" || a.status === "AWAITING_SETUP").length;
  const feedColor = (s?: string) => (s === "LIVE" ? "#34d399" : s === "UNKNOWN" ? "#64748b" : "#f59e0b");
  const rev = snapshot?.revenue;
  const assets = snapshot?.assetsWarehouse;
  const services = useMemo(() => snapshot?.services ?? [], [snapshot?.services]);
  const servicesOk = services.filter((s) => s.ok).length;
  const openclawRuntime = snapshot?.openclawRuntime ?? null;
  const runtimeGateway = openclawRuntime?.services.find((svc) => svc.id === "openclaw_gateway_18789") ?? null;

  const machines = useMemo(() => {
    const merged = new Map<string, WorldMachine>();
    for (const svc of services) {
      const id = svc.id ?? "";
      const homeHouse = SERVICE_HOME_BY_ID[id];
      if (!homeHouse) continue;
      merged.set(id, { id, label: svc.label ?? id, homeHouse, ok: svc.ok === true, status: svc.status ?? (svc.ok ? "LIVE" : "UNKNOWN"), role: svc.role, proof: svc.url });
    }
    for (const svc of openclawRuntime?.services ?? []) {
      const homeHouse = SERVICE_HOME_BY_ID[svc.id];
      if (!homeHouse) continue;
      merged.set(svc.id, { id: svc.id, label: svc.label, homeHouse, ok: svc.ok, status: svc.status, proof: svc.http_code === null ? "no listener / timeout" : `HTTP ${svc.http_code}` });
    }
    return [...merged.values()];
  }, [services, openclawRuntime]);
  const machinesByHome = useMemo(() => {
    const map: Record<string, WorldMachine[]> = {};
    for (const m of machines) (map[m.homeHouse] ||= []).push(m);
    return map;
  }, [machines]);
  const runtimeAgentsByHome = useMemo(() => {
    const map: Record<string, RuntimeAgent[]> = {};
    for (const agent of openclawRuntime?.agents ?? []) {
      const home = HOUSE_BY_ID[agent.homeHouse] ? agent.homeHouse : "openclaw_agent_barracks";
      (map[home] ||= []).push(agent);
    }
    return map;
  }, [openclawRuntime]);

  const selZone = HOUSE_BY_ID[selectedHouse ?? ""] ?? null;

  // ════════ DÉPLACEMENT DES AGENTS (machine à états, routes canon) ════════
  type AgentRuntime = { id: string; home: string; profile: RouteProfile; clusterIdx: number; clusterN: number; itinerary: Array<{ wx: number; wy: number; kind: MoveState }>; idx: number };
  const runtimeRef = useRef<Record<string, AgentRuntime>>({});
  const [agentPos, setAgentPos] = useState<Record<string, { wx: number; wy: number; state: MoveState }>>({});
  const [ready, setReady] = useState(false);

  // construit l'itinéraire data-driven d'un agent
  const buildItinerary = (home: string, profile: RouteProfile, seed: number): Array<{ wx: number; wy: number; kind: MoveState }> => {
    const h = HOUSE_BY_ID[home];
    const hf = houseFrontWorld(h);
    if (profile === "system") return [{ ...hf, kind: "idleAtHome" }];
    const nbs = ADJACENCY[home] ?? [];
    if (profile === "resident" || profile === "support" || nbs.length === 0) {
      // micro-déplacements autour de la maison (cour)
      return [0, 1, 2, 3].map((k) => ({
        wx: hf.wx + (rseed(seed + k * 2.1) - 0.5) * (h.w + 1.2),
        wy: hf.wy + (rseed(seed + k * 5.7) - 0.5) * 2.4,
        kind: (k === 0 ? "idleAtHome" : "walking") as MoveState,
      }));
    }
    // operator / patrol : navette vers 1-2 voisins via routes (midpoints)
    const pick = nbs[Math.floor(rseed(seed) * nbs.length) % nbs.length];
    const nb = HOUSE_BY_ID[pick];
    const nf = houseFrontWorld(nb);
    const mid = midWorld(h, nb);
    const it: Array<{ wx: number; wy: number; kind: MoveState }> = [
      { ...hf, kind: "idleAtHome" },
      { ...mid, kind: "walking" },
      { ...nf, kind: "working" },
      { ...mid, kind: "returningHome" },
    ];
    if (profile === "patrol" && nbs.length > 1) {
      const pick2 = nbs[(Math.floor(rseed(seed + 9) * nbs.length) + 1) % nbs.length];
      const nb2 = HOUSE_BY_ID[pick2];
      it.push({ ...houseFrontWorld(h), kind: "idleAtHome" });
      it.push({ ...midWorld(h, nb2), kind: "walking" });
      it.push({ ...houseFrontWorld(nb2), kind: "working" });
      it.push({ ...midWorld(h, nb2), kind: "returningHome" });
    }
    return it;
  };

  // init runtime quand la liste d'agents change
  useEffect(() => {
    if (!canonAgents.length) return;
    const byHome: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const a of canonAgents) counts[a.house] = (counts[a.house] ?? 0) + 1;
    const rt: Record<string, AgentRuntime> = {};
    const pos: Record<string, { wx: number; wy: number; state: MoveState }> = {};
    canonAgents.forEach((a, i) => {
      const profile = profileFor(a, i);
      const clusterIdx = (byHome[a.house] = (byHome[a.house] ?? 0) + 1) - 1;
      const clusterN = counts[a.house] ?? 1;
      const seed = (a.id.length + i * 13 + clusterIdx * 7) * 1.0;
      const itinerary = buildItinerary(a.house, profile, seed);
      rt[a.id] = { id: a.id, home: a.house, profile, clusterIdx, clusterN, itinerary, idx: 0 };
      const hf = houseFrontWorld(HOUSE_BY_ID[a.house]);
      const off = clusterOffset(clusterIdx, clusterN);
      pos[a.id] = { wx: hf.wx + off.dx, wy: hf.wy + off.dy, state: "idleAtHome" };
    });
    runtimeRef.current = rt;
    setAgentPos(pos);
  }, [canonAgents]);

  // tick directeur : avance chaque agent sur son itinéraire (CSS transition = glissé fluide)
  useEffect(() => {
    if (!canonAgents.length) return;
    const id = window.setInterval(() => {
      setAgentPos((prev) => {
        const next = { ...prev };
        for (const a of canonAgents) {
          const rt = runtimeRef.current[a.id];
          if (!rt) continue;
          rt.idx = (rt.idx + 1) % rt.itinerary.length;
          const node = rt.itinerary[rt.idx];
          const off = clusterOffset(rt.clusterIdx, rt.clusterN);
          next[a.id] = {
            wx: node.wx + off.dx * (node.kind === "idleAtHome" ? 1 : 0.4),
            wy: node.wy + off.dy * (node.kind === "idleAtHome" ? 1 : 0.4),
            state: node.kind,
          };
        }
        return next;
      });
    }, 2800);
    return () => window.clearInterval(id);
  }, [canonAgents]);

  useEffect(() => { if (size.cw > 0 && !ready) setReady(true); }, [size.cw, ready]);

  // projette une coord monde iso → pixels conteneur (xMidYMid meet)
  const project = (wx: number, wy: number) => {
    const { sx, sy } = isoProject(wx, wy);
    const scale = Math.min(size.cw / scene.vbW, size.ch / scene.vbH) || 0;
    const rW = scene.vbW * scale, rH = scene.vbH * scale;
    const ox = (size.cw - rW) / 2, oy = (size.ch - rH) / 2;
    return { x: (sx - scene.vbMinX) * scale + ox, y: (sy - scene.vbMinY) * scale + oy, scale };
  };

  type HouseKpis = { kpis: Array<{ label: string; value: string; source?: string }>; gap?: string };
  const houseKpis = (id: string): HouseKpis => {
    const fromServer = houseKpiData?.[id];
    if (fromServer && (fromServer.kpis.length > 0 || fromServer.gap)) return fromServer;
    const a = snapshot?.assetsWarehouse;
    const pubOk = services.find((s) => (s.id ?? "").includes("publisher") || (s.label ?? "").toLowerCase().includes("publisher"))?.ok;
    switch (id) {
      case "assets_warehouse":
        return { kpis: [
          { label: "MP4", value: fmtNum(a?.mp4Count), source: "inventaire assets local" },
          { label: "Captions", value: fmtNum(a?.captionsCount), source: "inventaire assets local" },
          { label: "Assets inventoriés", value: fmtNum(a?.assetsInventoryCount), source: "inventaire assets local" },
        ] };
      case "youtube_studio":
        return { kpis: [
          { label: "MP4 prêts", value: fmtNum(a?.mp4Count), source: "inventaire assets local" },
          { label: "CofiaPublisher", value: pubOk === true ? "LIVE" : pubOk === false ? "DOWN" : "UNKNOWN", source: "probe :8540" },
        ] };
      case "central_brain":
        return { kpis: [
          { label: "Maisons registry", value: fmtNum(snapshot?.centralBrain?.housesCount), source: "registry :8767" },
          { label: "Services OK", value: `${servicesOk}/${services.length}`, source: "probes services locaux" },
        ] };
      case "openclaw_agent_barracks":
        return { kpis: [
          { label: "Agents runtime", value: openclawRuntime ? `${openclawRuntime.counts.fresh}/${openclawRuntime.counts.total} fresh` : "source down", source: "heartbeats ~/.openclaw/heartbeats" },
          { label: "Jarod", value: openclawRuntime?.jarod?.runtimeStatus ?? "UNKNOWN", source: openclawRuntime?.jarod?.proof ?? "heartbeat Jarod" },
          { label: "Gateway", value: runtimeGateway ? `${runtimeGateway.status}${runtimeGateway.http_code ? ` ${runtimeGateway.http_code}` : ""}` : "source down", source: "probe :18789" },
          { label: "Camions", value: fmtNum(trucks.length), source: "trucks manifest" },
        ] };
      default:
        return { kpis: [] };
    }
  };

  const clearSel = () => { setSelectedHouse(null); setSelectedAngel(null); setSelectedRuntimeAgent(null); setSelectedMachine(null); setSelectedTruck(null); setSelectedAgent(null); };

  return (
    <div className="flex w-full max-w-[366px] min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border border-cyan-300/15 bg-slate-950/85 p-3 text-slate-100 shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)] backdrop-blur sm:max-w-[calc(100vw-24px)]">
      {/* ── HEADER + KPIs ── */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0 flex-1">
          <h2 className="break-words bg-gradient-to-r from-cyan-300 via-sky-200 to-amber-300 bg-clip-text text-base font-black uppercase tracking-wide text-transparent sm:text-xl">
            COFIATRADING WORLD CONTROL
          </h2>
          <p className="max-w-full truncate text-[9px] uppercase tracking-[0.16em] text-slate-400 sm:text-[10px] sm:tracking-[0.2em]">Cof-Island · cité vivante · 15 maisons · {canonAgents.length} agents</p>
        </div>
        <div className="grid w-full min-w-0 grid-cols-1 items-center gap-1.5 text-[10px] sm:w-auto sm:flex sm:flex-wrap">
          {([
            ["MRR", fmtEur(rev?.currentMrrEur), "emerald"],
            ["ARR", fmtEur(rev?.currentArrEur), "cyan"],
            ["VIP", fmtNum(rev?.activeVip), "emerald"],
            ["Past due", `${fmtEur(rev?.pastDueEur)} / ${fmtNum(rev?.pastDueCount)}`, "rose"],
            ["Services", `${servicesOk}/${services.length || "—"}`, "amber"],
            ["OpenClaw", openclawRuntime ? `${openclawRuntime.counts.fresh}/${openclawRuntime.counts.total} fresh` : "source down", "cyan"],
            ["Gateway", runtimeGateway ? runtimeGateway.status : "source down", runtimeGateway?.ok ? "emerald" : "rose"],
            ["Maisons", `${liveCount}/${HOUSES.length} LIVE`, "cyan"],
            ["Agents", `${canonAgents.length}`, "violet"],
            ["Assets", `${fmtNum(assets?.mp4Count)} MP4`, "violet"],
          ] as Array<[string, string, string]>).map(([k, v]) => (
            <span key={k} className="flex min-w-0 items-baseline gap-1 rounded-md border border-cyan-300/20 bg-slate-900/70 px-2 py-1">
              <span className="shrink-0 text-slate-400">{k}</span>
              <span className="min-w-0 truncate font-bold text-slate-100">{v}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── SCÈNE ── */}
      <div ref={sceneRef} className="relative h-[640px] min-h-[560px] w-full max-w-full overflow-hidden rounded-xl border border-cyan-300/15 bg-[#020912] sm:h-[calc(100vh-220px)]">
        <style>{KEYFRAMES}</style>
        <svg viewBox={scene.viewBox} className="h-full w-full" preserveAspectRatio="xMidYMid meet" onClick={clearSel}>
          <defs>
            <radialGradient id="sea" cx="50%" cy="40%" r="80%">
              <stop offset="0%" stopColor="#06203b" />
              <stop offset="60%" stopColor="#041425" />
              <stop offset="100%" stopColor="#01060f" />
            </radialGradient>
            <radialGradient id="land" cx="48%" cy="34%" r="80%">
              <stop offset="0%" stopColor="#10243c" />
              <stop offset="55%" stopColor="#0a1828" />
              <stop offset="100%" stopColor="#060f1c" />
            </radialGradient>
            <linearGradient id="roof-sheen" x1="0" y1="0" x2="0.45" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.26" />
            </linearGradient>
            <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="soft" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="9" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* mer */}
          <rect x="-100000" y="-100000" width="200000" height="200000" fill="url(#sea)" />
          {/* reflets de mer animés */}
          <g opacity="0.5">
            {Array.from({ length: 7 }).map((_, i) => {
              const yy = scene.vbMinY + scene.vbH * (0.2 + i * 0.11);
              return <line key={i} x1={scene.vbMinX} y1={yy} x2={scene.vbMinX + scene.vbW} y2={yy} stroke="#1a4e7a" strokeWidth="1.2" strokeDasharray="40 80" opacity={0.18 + (i % 3) * 0.05} style={{ animation: `sea-shimmer ${9 + i}s linear infinite`, animationDelay: `${i * 0.7}s` }} />;
            })}
          </g>

          {/* île : glow côtier → plage → terre */}
          <path d={scene.islandPath} fill="#0aa3d8" opacity="0.14" filter="url(#soft)" />
          <path d={scene.beachPath} fill="#13314d" opacity="0.6" />
          <path d={scene.islandPath2} fill="url(#land)" stroke="#1f4e6e" strokeWidth="2.5" opacity="0.98" />
          <path d={scene.islandPath2} fill="none" stroke="#3fbaff" strokeWidth="0.8" opacity="0.4" />

          {/* blobs district + labels */}
          {scene.zoneBlobs.map((z) => {
            const zc = ZONES[z.id];
            return (
              <g key={z.id}>
                <path d={z.path} fill={zc.color} opacity="0.07" />
                <path d={z.path} fill="none" stroke={zc.color} strokeWidth="1.2" strokeDasharray="3 6" opacity="0.32" />
                <text x={z.label.x} y={z.label.y} textAnchor="middle" fontSize="15" fontWeight="900" fill={zc.color} opacity="0.85" style={{ letterSpacing: "3px" }}>{zc.label}</text>
                <text x={z.label.x} y={z.label.y + 13} textAnchor="middle" fontSize="8" fontWeight="600" fill="#7c93ad" style={{ letterSpacing: "1px" }}>{zc.sub}</text>
              </g>
            );
          })}

          {/* routes (asphalte + ligne médiane + flux animé) */}
          <g>
            {scene.roads.map((r, i) => {
              const col = ZONES[r.zone].color;
              const wMain = r.kind === "main" ? 11 : 6.5;
              return (
                <g key={r.id}>
                  <path d={r.d} fill="none" stroke="#03070e" strokeWidth={wMain + 3} strokeLinecap="round" opacity="0.85" />
                  <path d={r.d} fill="none" stroke="#0d1c2c" strokeWidth={wMain} strokeLinecap="round" />
                  <path id={`road-${i}`} d={r.d} fill="none" stroke={col} strokeWidth="1.1" strokeDasharray={r.kind === "main" ? "7 9" : "4 8"} opacity="0.55">
                    <animate attributeName="stroke-dashoffset" from="32" to="0" dur={r.kind === "main" ? "1.3s" : "1.8s"} repeatCount="indefinite" />
                  </path>
                </g>
              );
            })}
          </g>

          {/* camions canon qui roulent (flux réels) */}
          <g>
            {(trucks.length > 0 ? trucks : []).map((t, i) => {
              const ha = HOUSE_BY_ID[t.from], hb = HOUSE_BY_ID[t.to];
              if (!ha || !hb) return null;
              const fa = isoProject(houseFrontWorld(ha).wx, houseFrontWorld(ha).wy);
              const fb = isoProject(houseFrontWorld(hb).wx, houseFrontWorld(hb).wy);
              const mx = (fa.sx + fb.sx) / 2, my = (fa.sy + fb.sy) / 2 - 16;
              const d = `M ${fa.sx} ${fa.sy} Q ${mx} ${my} ${fb.sx} ${fb.sy}`;
              const col = t.kind === "vip" ? "#ffd400" : ZONES[ha.zone].color;
              return (
                <g key={`truck-${t.id}-${i}`} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); clearSel(); setSelectedTruck(t); }}>
                  <title>{`🚚 ${t.name} — ${t.payload} (${t.owner})`}</title>
                  <path id={`troute-${i}`} d={d} fill="none" stroke="none" />
                  <g>
                    <animateMotion dur={`${8 + (i % 5)}s`} repeatCount="indefinite" begin={`${i * 1.1}s`} rotate="auto"><mpath href={`#troute-${i}`} /></animateMotion>
                    <rect x="-5" y="-3" width="10" height="6" rx="1.5" fill={col} opacity="0.95" filter="url(#glow)" />
                    <rect x="-3" y="-1.8" width="3.4" height="3.4" rx="0.6" fill="#02040a" opacity="0.85" />
                    <circle cx="-2.6" cy="3.1" r="1" fill="#0a0f1c" /><circle cx="2.6" cy="3.1" r="1" fill="#0a0f1c" />
                  </g>
                </g>
              );
            })}
          </g>

          {/* bâtiments (tri painter) */}
          {builtSorted.map((b) => (
            <Building
              key={b.house.id}
              b={b}
              status={statusFor(b.house.id)}
              selected={selectedHouse === b.house.id}
              hover={hoverHouse === b.house.id}
              dim={!!selectedHouse && selectedHouse !== b.house.id}
              machines={machinesByHome[b.house.id] ?? []}
              agentCount={(agentsByHome[b.house.id] ?? []).length}
              onSelect={() => { clearSel(); setSelectedHouse(b.house.id); setHouseTab("vue"); onSelectHouse(b.house.id); }}
              onHover={(v) => setHoverHouse(v ? b.house.id : null)}
              onMachine={(m) => { clearSel(); setSelectedMachine(m); }}
            />
          ))}
        </svg>

        {/* atmosphère */}
        <div className="pointer-events-none absolute inset-0 rounded-xl" style={{ background: "radial-gradient(120% 75% at 50% 6%, rgba(38,108,170,0.28), transparent 52%), radial-gradient(100% 100% at 50% 54%, transparent 58%, rgba(0,0,0,0.62))" }} />

        {/* ════════ COUCHE AVATARS (overlay HTML, projetée depuis l'iso) ════════ */}
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {ready && canonAgents.map((a) => {
            const pos = agentPos[a.id];
            if (!pos) return null;
            const { x, y, scale } = project(pos.wx, pos.wy);
            if (!Number.isFinite(x)) return null;
            const hSt = houseStatusStyle(statusFor(a.house));
            const alert = ["SOURCE_DOWN", "DEGRADED", "ERR"].includes(statusFor(a.house));
            const sel = selectedAgent?.id === a.id;
            const hov = hoverAgent === a.id;
            const sizePx = Math.max(40, Math.min(64, 52 * (scale > 0 ? 1 : 1)));
            return (
              <Avatar
                key={a.id}
                agent={a}
                x={x} y={y} sizePx={sel ? sizePx + 12 : sizePx}
                state={pos.state}
                ringColor={alert ? "#ef4444" : hSt.color}
                alert={alert}
                selected={sel}
                hover={hov}
                showLabel={sel || hov}
                onSelect={() => { clearSel(); setSelectedAgent(a); }}
                onHover={(v) => setHoverAgent(v ? a.id : null)}
              />
            );
          })}
        </div>

        {/* légende */}
        <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-cyan-300/20 bg-slate-950/85 px-3 py-1.5 text-[9px] text-slate-300 backdrop-blur sm:left-1/2 sm:right-auto sm:max-w-[88%] sm:-translate-x-1/2">
          {([["LIVE", "#34d399"], ["EN VEILLE", "#64748b"], ["DEGRADED", "#f59e0b"], ["SOURCE DOWN", "#ef4444"]] as Array<[string, string]>).map(([l, c]) => (
            <span key={l} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />{l}</span>
          ))}
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1"><span className="text-[11px]">🟢</span>idle</span>
          <span className="flex items-center gap-1"><span className="text-[11px]">🚶</span>en route</span>
          <span className="flex items-center gap-1"><span className="text-[11px]">⚙️</span>au travail</span>
          <span className="text-slate-500">· clic agent / maison / camion → inspector</span>
        </div>

        {/* ════════ INSPECTOR ════════ */}
        <div className="absolute left-2 right-2 top-2 z-20 flex max-h-[52%] w-auto flex-col overflow-auto rounded-xl border border-cyan-300/25 bg-slate-950/95 p-3 backdrop-blur sm:left-auto sm:right-2 sm:max-h-[94%] sm:w-[266px]">
          {selectedAgent ? (
            <AgentInspector agent={selectedAgent} state={agentPos[selectedAgent.id]?.state ?? "idleAtHome"} houseName={HOUSE_BY_ID[selectedAgent.house]?.name ?? selectedAgent.house} houseStatus={houseStatusStyle(statusFor(selectedAgent.house))} onClose={() => setSelectedAgent(null)} onGotoHouse={() => { const id = selectedAgent.house; clearSel(); setSelectedHouse(id); setHouseTab("anges"); onSelectHouse(id); }} />
          ) : selectedRuntimeAgent ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-black text-orange-200">{selectedRuntimeAgent.name}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">{selectedRuntimeAgent.id} · {selectedRuntimeAgent.team}</div>
                </div>
                <button type="button" onClick={() => setSelectedRuntimeAgent(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button>
              </div>
              <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${runtimeColor(selectedRuntimeAgent.runtimeStatus)}22`, color: runtimeColor(selectedRuntimeAgent.runtimeStatus), border: `1px solid ${runtimeColor(selectedRuntimeAgent.runtimeStatus)}55` }}>● {selectedRuntimeAgent.runtimeStatus}</span>
              <p className="mt-2 text-[10px] font-semibold uppercase text-orange-200">Maison</p>
              <p className="text-[11px] text-slate-300">{HOUSE_BY_ID[selectedRuntimeAgent.homeHouse]?.name ?? selectedRuntimeAgent.homeHouse}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-orange-200">Tick LaunchAgent</p>
              <p className="text-[11px] text-slate-300">{selectedRuntimeAgent.tickEnabled ? "enabled" : "missing"}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-orange-200">Preuve</p>
              <p className="break-words text-[9px] leading-snug text-slate-400">{selectedRuntimeAgent.proof}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-orange-200">Action</p>
              <p className="text-[10px] leading-snug text-amber-200">{selectedRuntimeAgent.nextAction}</p>
            </div>
          ) : selectedMachine ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-black" style={{ color: runtimeColor(selectedMachine.status) }}>{selectedMachine.label}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">{selectedMachine.id}</div>
                </div>
                <button type="button" onClick={() => setSelectedMachine(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button>
              </div>
              <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${runtimeColor(selectedMachine.status)}22`, color: runtimeColor(selectedMachine.status), border: `1px solid ${runtimeColor(selectedMachine.status)}55` }}>● {selectedMachine.status}</span>
              <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Maison</p>
              <p className="text-[11px] text-slate-300">{HOUSE_BY_ID[selectedMachine.homeHouse]?.name ?? selectedMachine.homeHouse}</p>
              {selectedMachine.role && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Rôle</p><p className="text-[11px] leading-snug text-slate-300">{selectedMachine.role}</p></>)}
              {selectedMachine.proof && <p className="mt-2 break-words text-[9px] text-emerald-300/70">Preuve: {selectedMachine.proof}</p>}
            </div>
          ) : selectedTruck ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-black text-amber-200">{selectedTruck.name}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">{selectedTruck.id} · {selectedTruck.kind ?? "flux"}</div>
                </div>
                <button type="button" onClick={() => setSelectedTruck(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button>
              </div>
              <p className="mt-2 text-[10px] font-semibold uppercase text-amber-200">Route</p>
              <p className="text-[11px] text-slate-300">{HOUSE_BY_ID[selectedTruck.from]?.name ?? selectedTruck.from} → {HOUSE_BY_ID[selectedTruck.to]?.name ?? selectedTruck.to}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-amber-200">Payload</p>
              <p className="text-[11px] leading-snug text-slate-300">{selectedTruck.payload}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-amber-200">Owner</p>
              <p className="text-[11px] text-slate-300">{selectedTruck.owner}{selectedTruck.cadence ? ` · ${selectedTruck.cadence}` : ""}</p>
              {selectedTruck.source && <p className="mt-2 break-words text-[9px] text-emerald-300/70">Source: {selectedTruck.source}</p>}
            </div>
          ) : selectedAngel ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[13px] font-black">{selectedAngel.name} <span className="text-[11px] text-slate-400">{selectedAngel.name_ar}</span></div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">#{selectedAngel.id} · {selectedAngel.platform}</div>
                </div>
                <button type="button" onClick={() => setSelectedAngel(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button>
              </div>
              <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${ANGEL_STATUS[selectedAngel.status].color}22`, color: ANGEL_STATUS[selectedAngel.status].color, border: `1px solid ${ANGEL_STATUS[selectedAngel.status].color}55` }}>● {ANGEL_STATUS[selectedAngel.status].label}</span>
              <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Manzilah</p>
              <p className="text-[11px] text-slate-300">{selectedAngel.manzilah}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Mission</p>
              <p className="text-[11px] leading-snug text-slate-300">{selectedAngel.mission}</p>
              {selectedAngel.stack && <p className="mt-1 text-[9px] text-slate-400">Stack: {selectedAngel.stack}</p>}
              {typeof selectedAngel.arr_impact_eur_year === "number" && selectedAngel.arr_impact_eur_year !== 0 && (
                <p className="mt-1 text-[10px] font-bold" style={{ color: selectedAngel.arr_impact_eur_year < 0 ? "#fb7185" : "#34d399" }}>ARR impact: {selectedAngel.arr_impact_eur_year.toLocaleString("fr-FR")} €/an</p>
              )}
              {selectedAngel.proof_url && <p className="mt-1 break-words text-[9px] text-emerald-300/80">Preuve: {selectedAngel.proof_url}</p>}
            </div>
          ) : selZone ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[13px] font-black" style={{ color: selZone.accent }}>{selZone.sign} {selZone.name}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">{selZone.sub} · {ZONES[selZone.zone].label}</div>
                </div>
                <button type="button" onClick={() => setSelectedHouse(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button>
              </div>
              {(() => { const st = houseStatusStyle(statusFor(selZone.id)); return (
                <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${st.color}22`, color: st.color, border: `1px solid ${st.color}55` }}>● {st.label}</span>
              ); })()}
              {(() => {
                const houseAgents = agentsByHome[selZone.id] ?? [];
                const houseAngels = angelsByHome[selZone.id] ?? [];
                const houseRuntimeAgents = runtimeAgentsByHome[selZone.id] ?? [];
                const houseMachines = machinesByHome[selZone.id] ?? [];
                const houseTrucks = trucks.filter((t) => t.from === selZone.id || t.to === selZone.id);
                const hk = houseKpis(selZone.id);
                const kpis = hk.kpis;
                const tabs: Array<[typeof houseTab, string]> = [
                  ["vue", "Vue"],
                  ["kpis", "KPIs"],
                  ["anges", `Agents ${houseAgents.length}`],
                  ["machines", `Machines ${houseMachines.length}`],
                  ["flux", `Flux ${houseTrucks.length}`],
                ];
                return (
                  <>
                    <div className="mt-2 flex gap-1 border-b border-slate-700/50">
                      {tabs.map(([k, label]) => (
                        <button key={k} type="button" onClick={() => setHouseTab(k)} className={`px-1.5 pb-1 text-[9.5px] font-bold uppercase tracking-wide ${houseTab === k ? "border-b-2 border-cyan-300 text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>
                      ))}
                    </div>

                    {houseTab === "vue" && (
                      <div className="mt-2">
                        <p className="text-[10px] font-semibold uppercase text-cyan-300">Rôle</p>
                        <p className="text-[11px] leading-snug text-slate-300">{selZone.role}</p>
                        <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Résidents</p>
                        <p className="text-[10px] text-slate-300">{houseAgents.length} agents propriétaires · {houseRuntimeAgents.length} runtime · {houseMachines.length} machines · {houseTrucks.length} flux</p>
                        {houseAgents.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {houseAgents.map((a) => (
                              <button key={a.id} type="button" onClick={() => { setSelectedAgent(a); }} className="flex items-center gap-1 rounded-full border border-slate-700/60 bg-slate-900/60 px-1.5 py-0.5 text-[9px] hover:border-cyan-300/60" style={{ borderColor: `${a.colorPrimary}66` }}>
                                <span className="text-[11px] leading-none">{a.avatarEmoji || a.glyph || "🤖"}</span>
                                <span className="font-bold text-slate-200">{a.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {houseTab === "kpis" && (
                      <div className="mt-2">
                        {kpis.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {kpis.map((row) => (
                              <div key={row.label} className="rounded border border-slate-700/50 px-1.5 py-1">
                                <div className="flex items-baseline justify-between gap-2"><span className="text-[9.5px] uppercase text-slate-400">{row.label}</span><span className="text-[11px] font-bold text-slate-100">{row.value}</span></div>
                                {row.source && <span className="block text-[8px] text-emerald-300/55">▸ {row.source}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {hk.gap && <p className="mt-1 rounded bg-amber-500/10 px-1.5 py-1 text-[9.5px] leading-snug text-amber-300/90">⚠ {hk.gap}</p>}
                        {kpis.length === 0 && !hk.gap && <p className="rounded bg-amber-500/10 px-1.5 py-1 text-[10px] leading-snug text-amber-300/90">KPIs propres à cette maison <b>à migrer</b> (source locale non encore câblée).</p>}
                      </div>
                    )}

                    {houseTab === "anges" && (
                      <div className="mt-2">
                        {houseAgents.length > 0 && (
                          <div className="mb-2 grid grid-cols-2 gap-1">
                            {houseAgents.map((a) => (
                              <button key={a.id} type="button" onClick={() => setSelectedAgent(a)} className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-left hover:opacity-90" style={{ borderColor: `${a.colorPrimary}55`, background: `${a.colorPrimary}10` }}>
                                <span className="text-[15px] leading-none">{a.avatarEmoji || a.glyph || "🤖"}</span>
                                <span className="min-w-0"><span className="block truncate text-[9.5px] font-bold text-slate-100">{a.name}</span><span className="block truncate text-[8px] text-slate-400">{a.roleBadge}</span></span>
                              </button>
                            ))}
                          </div>
                        )}
                        {houseRuntimeAgents.length > 0 && (
                          <div className="mb-2 rounded border border-orange-400/20 bg-orange-400/8 p-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-wide text-orange-200">Runtime OpenClaw / Lobster</p>
                            <div className="mt-1 grid grid-cols-2 gap-1">
                              {houseRuntimeAgents.map((agent) => (
                                <button key={`${agent.id}-${agent.name}`} type="button" onClick={() => setSelectedRuntimeAgent(agent)} className="rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-orange-300/60">
                                  <span className="block truncate text-[9.5px] font-bold text-slate-200">{agent.name}</span>
                                  <span className="text-[8px] font-bold" style={{ color: runtimeColor(agent.runtimeStatus) }}>● {agent.runtimeStatus}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {houseAngels.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {houseAngels.map((a) => (
                              <button key={a.id} type="button" onClick={() => setSelectedAngel(a)} className="flex items-start gap-1.5 rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-slate-500">
                                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ANGEL_STATUS[a.status].color }} />
                                <span className="min-w-0"><span className="text-[10px] font-bold text-slate-200">{a.name}</span><span className="ml-1 text-[8.5px] font-semibold uppercase" style={{ color: ANGEL_STATUS[a.status].color }}>{ANGEL_STATUS[a.status].label}</span><span className="block truncate text-[9px] text-slate-400">{a.mission}</span></span>
                              </button>
                            ))}
                          </div>
                        )}
                        {!houseAgents.length && !houseAngels.length && !houseRuntimeAgents.length && <span className="text-[10px] text-slate-500">—</span>}
                      </div>
                    )}

                    {houseTab === "machines" && (
                      <div className="mt-2">
                        {houseMachines.length ? (
                          <div className="flex flex-col gap-1">
                            {houseMachines.map((machine) => (
                              <button key={machine.id} type="button" onClick={() => setSelectedMachine(machine)} className="rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-cyan-300/60">
                                <span className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold text-slate-200">{machine.label}</span><span className="shrink-0 text-[8px] font-bold" style={{ color: runtimeColor(machine.status) }}>● {machine.status}</span></span>
                                {machine.role && <span className="block truncate text-[8.5px] text-slate-500">{machine.role}</span>}
                              </button>
                            ))}
                          </div>
                        ) : <p className="text-[10px] text-slate-500">Aucune machine/service canonique attaché à cette maison.</p>}
                      </div>
                    )}

                    {houseTab === "flux" && (
                      <div className="mt-2">
                        {houseTrucks.length ? (
                          <div className="flex flex-col gap-1">
                            {houseTrucks.map((t) => (
                              <button key={t.id} type="button" onClick={() => setSelectedTruck(t)} className="rounded border border-slate-700/50 px-1.5 py-1 text-left hover:border-amber-300/60">
                                <span className="text-[10px] font-bold text-slate-200">{t.name}</span>
                                <span className="block text-[9px] text-slate-400">{t.from} → {t.to} · {t.payload}</span>
                                <span className="block text-[8.5px] text-slate-500">{t.owner}{t.cadence ? ` · ${t.cadence}` : ""}</span>
                              </button>
                            ))}
                          </div>
                        ) : <p className="text-[10px] text-slate-500">Aucun camion (flux inter-maison) ne touche cette maison.</p>}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-cyan-200">Mission Control</p>
              <p className="mt-1 text-[10px] text-slate-400">{HOUSES.length} maisons · {canonAgents.length} agents · {angels.length} anges · {trucks.length} camions · clic pour inspecter.</p>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[9.5px]">
                {(["LIVE", "SLEEPING", "DEGRADED", "SOURCE_DOWN", "ERR"]).map((s) => {
                  const n = HOUSES.filter((z) => statusFor(z.id) === s).length;
                  const st = houseStatusStyle(s);
                  return <div key={s} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: st.color }} /><span className="text-slate-300">{st.label}</span><span className="ml-auto font-bold">{n}</span></div>;
                })}
              </div>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">Districts</p>
              <div className="mt-1 grid grid-cols-2 gap-1 text-[9px]">
                {(Object.keys(ZONES) as ZoneId[]).map((zid) => {
                  const n = HOUSES.filter((h) => h.zone === zid).length;
                  return <div key={zid} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: ZONES[zid].color }} /><span className="text-slate-300">{ZONES[zid].label}</span><span className="ml-auto font-bold">{n}</span></div>;
                })}
              </div>
              <p className="mt-2 rounded border border-slate-700/50 px-2 py-1 text-[9.5px] text-slate-300">Missions : <b className="text-emerald-300">{activeMissions}</b> actives · <b className="text-amber-300">{blockerMissions}</b> à débloquer</p>
              {openclawRuntime && (
                <div className="mt-2 rounded border border-orange-400/25 bg-orange-400/8 px-2 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-orange-200">OpenClaw / Lobster — runtime local</p>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[9.5px] text-slate-300">
                    <span>Agents fresh</span><span className="text-right font-bold">{openclawRuntime.counts.fresh}/{openclawRuntime.counts.total}</span>
                    <span>Jarod</span><span className="text-right font-bold">{openclawRuntime.jarod?.runtimeStatus ?? "UNKNOWN"}</span>
                    <span>Gateway</span><span className="text-right font-bold">{runtimeGateway?.status ?? "UNKNOWN"}</span>
                    <span>Lobster</span><span className="text-right font-bold">{fmtNum(openclawRuntime.counts.lobsterEnabled)}/{fmtNum(openclawRuntime.counts.lobsterConfigured)}</span>
                  </div>
                </div>
              )}
              {events.length > 0 && (
                <div className="mt-2 rounded border border-emerald-300/15 bg-emerald-300/5 px-2 py-1.5">
                  <p className="text-[9px] font-black uppercase tracking-wide text-emerald-300">Live feed</p>
                  <div className="mt-1 flex flex-col gap-1">
                    {events.slice(0, 4).map((e) => (
                      <div key={e.id} title={e.proof ? `${e.source ?? ""} — ${e.proof}` : (e.source ?? "")} className="flex items-center gap-1.5 text-[9px]">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: feedColor(e.status) }} />
                        <span className="min-w-0 truncate text-slate-300">{e.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-2 text-[9px] text-slate-500">sync registry {syncStamp || "…"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* offset de cluster : éventail en arc devant la maison (anti-empilement) */
function clusterOffset(idx: number, n: number): { dx: number; dy: number } {
  if (n <= 1) return { dx: 0, dy: 0.4 };
  const spread = 2.4;
  const half = (n - 1) / 2;
  const t = idx - half;                 // index centré
  return {
    dx: t * spread,
    dy: Math.abs(t) * 0.5 + (idx % 2) * 0.85,  // bords plus en retrait + profondeur alternée
  };
}

/* ════════════════════ BÂTIMENT iso typé ════════════════════ */
function Building({
  b, status, selected, hover, dim, machines, agentCount, onSelect, onHover, onMachine,
}: {
  b: Built; status: string; selected: boolean; hover: boolean; dim: boolean;
  machines: WorldMachine[]; agentCount: number;
  onSelect: () => void; onHover: (v: boolean) => void; onMachine: (m: WorldMachine) => void;
}) {
  const h = b.house;
  const st = houseStatusStyle(status);
  const ground = b.ground;
  const bodyH = b.height;
  const cx = b.base.x;
  const roofY = b.base.y - bodyH;
  const focus = selected || hover;
  const alert = status === "SOURCE_DOWN" || status === "DEGRADED" || status === "ERR";

  // corps principal
  const body = block(ground, bodyH);
  const cols = Math.max(2, Math.round(h.w * 0.8));
  const rows = Math.max(3, h.levels);
  const seed = h.id.length + Math.round(h.x) + Math.round(h.y);
  const leftWin = faceWindows(ground[3], ground[2], body.top[3], body.top[2], cols, rows, seed);
  const rightWin = faceWindows(ground[1], ground[2], body.top[1], body.top[2], cols, rows, seed + 3);

  // setback (toit stepped) : un 2e bloc inset au-dessus
  const stepped = h.roof === "stepped";
  const upper = stepped ? block(insetTowards(body.top, 0.32), bodyH * 0.5) : null;
  const apex = stepped && upper ? { x: cx, y: upper.top[0].y - (upper.top[2].y - upper.top[0].y) / 2 } : { x: cx, y: roofY };

  // porte (façade droite, en bas-centre)
  const doorBL = lerpPt(ground[1], ground[2], 0.62);
  const doorBR = lerpPt(ground[1], ground[2], 0.86);
  const doorTL = { x: doorBL.x, y: doorBL.y - bodyH * 0.26 };
  const doorTR = { x: doorBR.x, y: doorBR.y - bodyH * 0.26 };

  return (
    <g style={{ cursor: "pointer" }} opacity={dim ? 0.74 : 1}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      {/* ombre portée */}
      <ellipse cx={cx} cy={b.base.y + 6} rx={h.w * 11} ry={h.w * 5} fill="#000" opacity="0.34" filter="url(#soft)" />
      {/* halo statut au sol */}
      <ellipse cx={cx} cy={b.base.y + 4} rx={h.w * 9} ry={h.w * 4.3} fill={st.color} opacity={focus ? 0.28 : 0.13} />
      {/* parcelle / plot pad iso */}
      <polygon points={insetTowards(ground, -0.16).map(P).join(" ")} fill="#0a1726" stroke={h.accent} strokeOpacity="0.25" strokeWidth="1" opacity="0.9" />

      {/* corps : murs + fenêtres */}
      <polygon points={body.leftStr} fill={h.wall} opacity="0.97" />
      <polygon points={body.rightStr} fill={h.wall} opacity="0.7" />
      {leftWin.map((w, i) => <polygon key={`lw${i}`} points={w.pts} fill={w.lit ? h.accent : "#0a0f1c"} opacity={w.lit ? 0.55 : 0.5} />)}
      {rightWin.map((w, i) => <polygon key={`rw${i}`} points={w.pts} fill={w.lit ? h.accent : "#070b14"} opacity={w.lit ? 0.34 : 0.55} />)}
      {/* arêtes statut */}
      <polygon points={body.leftStr} fill="none" stroke={st.color} strokeWidth={focus ? 1.8 : 0.9} opacity={focus ? 1 : 0.7} />
      <polygon points={body.rightStr} fill="none" stroke={st.color} strokeWidth={focus ? 1.5 : 0.7} opacity={focus ? 0.9 : 0.5} />
      {/* porte */}
      <polygon points={`${P(doorBL)} ${P(doorBR)} ${P(doorTR)} ${P(doorTL)}`} fill="#050a14" opacity="0.9" stroke={h.accent} strokeWidth="0.5" strokeOpacity="0.5" />

      {/* toit du corps */}
      <polygon points={body.roofPoly} fill={h.roofColor} />
      <polygon points={body.roofPoly} fill="url(#roof-sheen)" />
      <polygon points={body.roofPoly} fill="none" stroke={h.accent} strokeWidth={focus ? 1.8 : 1.1} opacity="0.92" filter={focus ? "url(#glow)" : undefined} />

      {/* setback (tours) */}
      {stepped && upper && (<>
        <polygon points={upper.leftStr} fill={h.wall} opacity="0.97" />
        <polygon points={upper.rightStr} fill={h.wall} opacity="0.7" />
        <polygon points={upper.leftStr} fill="none" stroke={st.color} strokeWidth={focus ? 1.4 : 0.8} opacity="0.8" />
        <polygon points={upper.roofPoly} fill={h.roofColor} />
        <polygon points={upper.roofPoly} fill="url(#roof-sheen)" />
        <polygon points={upper.roofPoly} fill="none" stroke={h.accent} strokeWidth="1.2" opacity="0.9" />
      </>)}

      {/* features de toit selon type */}
      <RoofFeatures h={h} apex={apex} cx={cx} accent={h.accent} alert={alert} focus={focus} />

      {/* enseigne emoji = plaque hexagonale (identité instantanée, distincte des avatars ronds) */}
      <g transform={`translate(${cx} ${apex.y - (h.roof === "dome" ? 30 : 22)})`}>
        <polygon points="-11,0 -6,-7.5 6,-7.5 11,0 6,7.5 -6,7.5" fill="#04media".replace("media","0a14") } />
      </g>

      {/* crest statut */}
      <circle cx={cx} cy={apex.y} r="2.6" fill={st.color} filter="url(#glow)">
        {alert && <animate attributeName="opacity" values="1;0.3;1" dur="1.3s" repeatCount="indefinite" />}
      </circle>

      {/* machines (puces toit) */}
      {machines.map((m, idx) => {
        const mxp = cx - Math.min(16, h.w * 3) + (idx % 5) * 7;
        const myp = b.base.y - bodyH + 14 + Math.floor(idx / 5) * 7;
        const mc = runtimeColor(m.status);
        return (
          <g key={m.id} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onMachine(m); }}>
            <title>{`${m.label} — ${m.status}`}</title>
            <polygon points={`${mxp},${myp - 4} ${mxp + 5},${myp} ${mxp},${myp + 4} ${mxp - 5},${myp}`} fill={mc} opacity="0.92" filter="url(#glow)">{!m.ok && <animate attributeName="opacity" values="0.35;1;0.35" dur="1.5s" repeatCount="indefinite" />}</polygon>
            <circle cx={mxp} cy={myp} r="8" fill="transparent" />
          </g>
        );
      })}

      {/* label */}
      <g transform={`translate(${cx + h.w * 8} ${b.base.y - bodyH - 6})`} opacity={focus ? 1 : 0.92}>
        <rect x="0" y="-9" width={h.name.length * 5.8 + 38} height="27" rx="5" fill="#020617" stroke={focus ? st.color : "#1e3a52"} strokeWidth={focus ? 1.2 : 0.7} opacity="0.96" />
        <text x="7" y="1.5" fontSize="9.5" fontWeight="800" fill="#e2e8f0">{h.name}</text>
        <text x="7" y="12.5" fontSize="7.5" fontWeight="700" fill={st.color}>● {st.label}{agentCount ? ` · ${agentCount} agents` : ""}</text>
      </g>
    </g>
  );
}

/* features de toit propres au type (silhouette distincte) */
function RoofFeatures({ h, apex, cx, accent, alert, focus }: { h: House; apex: Pt; cx: number; accent: string; alert: boolean; focus: boolean }) {
  const y = apex.y;
  switch (h.type) {
    case "command_tower":
      return (<g>
        <line x1={cx} y1={y} x2={cx} y2={y - 26} stroke={accent} strokeWidth="1.6" />
        <circle cx={cx} cy={y - 26} r="2.6" fill={accent} filter="url(#glow)"><animate attributeName="opacity" values="1;0.2;1" dur="1.6s" repeatCount="indefinite" /></circle>
        <ellipse cx={cx + 7} cy={y - 6} rx="7" ry="3" fill="none" stroke={accent} strokeWidth="1.2" opacity="0.85" />
        <ellipse cx={cx} cy={y - 2} rx="13" ry="5" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.4"><animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${y - 2}`} to={`360 ${cx} ${y - 2}`} dur="6s" repeatCount="indefinite" /></ellipse>
      </g>);
    case "brain":
      return (<g>
        <circle cx={cx} cy={y - 4} r="10" fill={accent} opacity="0.16" filter="url(#soft)" />
        <circle cx={cx} cy={y - 4} r="6" fill={accent} opacity="0.55" filter="url(#glow)"><animate attributeName="r" values="5;7;5" dur="2.4s" repeatCount="indefinite" /></circle>
        <circle cx={cx} cy={y - 4} r="6" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.6" />
        {[0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2; return <circle key={k} cx={cx + Math.cos(a) * 11} cy={y - 4 + Math.sin(a) * 5} r="1.4" fill={accent}><animate attributeName="opacity" values="0.2;1;0.2" dur={`${1.6 + k * 0.3}s`} repeatCount="indefinite" /></circle>; })}
      </g>);
    case "observatory":
      return (<g>
        <ellipse cx={cx} cy={y} rx="11" ry="7" fill={h.roofColor} stroke={accent} strokeWidth="1" />
        <path d={`M ${cx - 11} ${y} A 11 7 0 0 1 ${cx + 11} ${y}`} fill={accent} opacity="0.18" />
        <line x1={cx} y1={y - 5} x2={cx + 24} y2={y - 20} stroke={accent} strokeWidth="2" opacity="0.5"><animateTransform attributeName="transform" type="rotate" values={`-12 ${cx} ${y - 5}; 12 ${cx} ${y - 5}; -12 ${cx} ${y - 5}`} dur="5s" repeatCount="indefinite" /></line>
        <circle cx={cx} cy={y - 6} r="2" fill={accent} filter="url(#glow)" />
      </g>);
    case "factory":
      return (<g>
        <rect x={cx + 4} y={y - 22} width="5" height="22" fill={h.wall} stroke={accent} strokeWidth="0.6" />
        {[0, 1, 2].map((k) => <circle key={k} cx={cx + 6.5} cy={y - 24 - k * 6} r={2 + k} fill="#9fb3c8" opacity={0.4 - k * 0.1}><animate attributeName="cy" values={`${y - 22};${y - 40}`} dur="3s" repeatCount="indefinite" begin={`${k}s`} /><animate attributeName="opacity" values="0.5;0" dur="3s" repeatCount="indefinite" begin={`${k}s`} /></circle>)}
        <circle cx={cx - 6} cy={y - 4} r="4" fill="none" stroke={accent} strokeWidth="1.2" /><circle cx={cx - 6} cy={y - 4} r="1.4" fill={accent}><animateTransform attributeName="transform" type="rotate" from={`0 ${cx - 6} ${y - 4}`} to={`360 ${cx - 6} ${y - 4}`} dur="4s" repeatCount="indefinite" /></circle>
      </g>);
    case "signal_tower":
      return (<g>
        <line x1={cx} y1={y} x2={cx} y2={y - 22} stroke={accent} strokeWidth="1.4" />
        <circle cx={cx} cy={y - 22} r="2.4" fill={accent} filter="url(#glow)"><animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" /></circle>
        {/* mini chandeliers */}
        {[0, 1, 2].map((k) => { const xx = cx - 8 + k * 8; const up = k % 2 === 0; return <g key={k}><line x1={xx} y1={y - 3} x2={xx} y2={y - 15} stroke={up ? "#34d399" : "#fb7185"} strokeWidth="1" /><rect x={xx - 1.4} y={up ? y - 13 : y - 9} width="2.8" height="5" fill={up ? "#34d399" : "#fb7185"} /></g>; })}
      </g>);
    case "academy":
      return (<g>
        {/* fronton + colonnes */}
        <polygon points={`${cx - 14},${y} ${cx},${y - 11} ${cx + 14},${y}`} fill={h.roofColor} stroke={accent} strokeWidth="1" />
        <polygon points={`${cx - 14},${y} ${cx},${y - 11} ${cx + 14},${y}`} fill={accent} opacity="0.12" />
        {[-10, -5, 0, 5, 10].map((dx, k) => <line key={k} x1={cx + dx} y1={y} x2={cx + dx} y2={y + 7} stroke={accent} strokeWidth="1.3" opacity="0.7" />)}
      </g>);
    case "gate":
      return (<g>
        <path d={`M ${cx - 11} ${y + 4} L ${cx - 11} ${y - 6} A 11 11 0 0 1 ${cx + 11} ${y - 6} L ${cx + 11} ${y + 4}`} fill="none" stroke={accent} strokeWidth="1.6" opacity="0.85" />
        <circle cx={cx} cy={y - 8} r="2" fill={accent} filter="url(#glow)"><animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" /></circle>
      </g>);
    case "compliance":
      return (<g>
        <path d={`M ${cx} ${y - 16} L ${cx + 9} ${y - 12} L ${cx + 9} ${y - 3} Q ${cx + 9} ${y + 4} ${cx} ${y + 7} Q ${cx - 9} ${y + 4} ${cx - 9} ${y - 3} L ${cx - 9} ${y - 12} Z`} fill={accent} opacity="0.2" stroke={accent} strokeWidth="1.3" />
        <path d={`M ${cx - 3.5} ${y - 4} l 2.5 3 l 5 -6`} fill="none" stroke={accent} strokeWidth="1.4" />
      </g>);
    case "calendar":
      return (<g>
        <rect x={cx - 9} y={y - 14} width="18" height="15" rx="2" fill={h.roofColor} stroke={accent} strokeWidth="1" />
        <line x1={cx - 9} y1={y - 9} x2={cx + 9} y2={y - 9} stroke={accent} strokeWidth="0.8" opacity="0.7" />
        {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={cx - 7 + c * 5} y={y - 7 + r * 3} width="3" height="2" fill={accent} opacity={(r * 3 + c) % 4 === 0 ? 0.9 : 0.35} />))}
      </g>);
    case "studio":
      return (<g>
        <rect x={cx - 12} y={y - 14} width="24" height="13" rx="2" fill="#0a0f1c" stroke={accent} strokeWidth="1.1" />
        <polygon points={`${cx - 3},${y - 11} ${cx + 5},${y - 7.5} ${cx - 3},${y - 4}`} fill={accent} filter="url(#glow)" />
        <circle cx={cx} cy={y - 7.5} r="9" fill="none" stroke={accent} strokeWidth="0.6" opacity="0.4"><animate attributeName="r" values="6;12;6" dur="3s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" /></circle>
      </g>);
    case "warehouse":
      return (<g>
        {[-8, 0, 8].map((dx, k) => <rect key={k} x={cx + dx - 3} y={y - 2} width="6" height="9" rx="1" fill="#0a0f1c" stroke={accent} strokeWidth="0.6" opacity="0.85" />)}
        <circle cx={cx} cy={y - 10} r="5" fill="none" stroke={accent} strokeWidth="1.1" /><circle cx={cx} cy={y - 10} r="1.5" fill={accent} />
        {[0, 1, 2, 3, 4, 5].map((k) => { const a = (k / 6) * Math.PI * 2; return <circle key={k} cx={cx + Math.cos(a) * 5} cy={y - 10 + Math.sin(a) * 5} r="0.8" fill={accent} />; })}
      </g>);
    case "lab":
      return (<g>
        <rect x={cx - 8} y={y - 16} width="16" height="16" rx="2" fill={accent} opacity="0.12" stroke={accent} strokeWidth="1" />
        <circle cx={cx} cy={y - 8} r="6" fill="none" stroke={accent} strokeWidth="1" />
        <ellipse cx={cx} cy={y - 8} rx="6" ry="2.4" fill="none" stroke={accent} strokeWidth="0.7" opacity="0.7" />
        <line x1={cx} y1={y - 14} x2={cx} y2={y - 2} stroke={accent} strokeWidth="0.7" opacity="0.7" />
      </g>);
    case "vault":
      return (<g>
        <circle cx={cx} cy={y - 6} r="7" fill="#0a0f1c" stroke={accent} strokeWidth="1.4" />
        <circle cx={cx} cy={y - 6} r="3.4" fill="none" stroke={accent} strokeWidth="1" />
        {[0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2 + 0.4; return <line key={k} x1={cx + Math.cos(a) * 3.4} y1={y - 6 + Math.sin(a) * 3.4} x2={cx + Math.cos(a) * 8.5} y2={y - 6 + Math.sin(a) * 8.5} stroke={accent} strokeWidth="1.2" />; })}
      </g>);
    case "village":
      return (<g>
        {[-10, 0, 10].map((dx, k) => <g key={k}><polygon points={`${cx + dx - 5},${y} ${cx + dx},${y - 6} ${cx + dx + 5},${y}`} fill={h.roofColor} stroke={accent} strokeWidth="0.8" /><circle cx={cx + dx} cy={y - 2} r="1" fill={accent} opacity="0.8"><animate attributeName="opacity" values="0.3;1;0.3" dur={`${2 + k * 0.5}s`} repeatCount="indefinite" /></circle></g>)}
      </g>);
    default:
      return null;
  }
}

/* ════════════════════ AVATAR agent (HTML overlay) ════════════════════ */
function Avatar({
  agent, x, y, sizePx, state, ringColor, alert, selected, hover, showLabel, onSelect, onHover,
}: {
  agent: CanonAgent; x: number; y: number; sizePx: number; state: MoveState;
  ringColor: string; alert: boolean; selected: boolean; hover: boolean; showLabel: boolean;
  onSelect: () => void; onHover: (v: boolean) => void;
}) {
  const emoji = agent.avatarEmoji || agent.glyph || "🤖";
  const stateGlyph = state === "walking" || state === "returningHome" ? "🚶" : state === "working" ? "⚙️" : "";
  const moving = state === "walking" || state === "returningHome";
  return (
    <div
      className="pointer-events-auto absolute"
      style={{
        left: x, top: y, width: sizePx, height: sizePx,
        transform: "translate(-50%,-50%)",
        transition: "left 2.6s cubic-bezier(.45,.05,.3,1), top 2.6s cubic-bezier(.45,.05,.3,1), width .2s, height .2s",
        zIndex: selected ? 40 : hover ? 35 : 20,
        cursor: "pointer",
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* ombre au sol */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: -sizePx * 0.1, width: sizePx * 0.6, height: sizePx * 0.18, borderRadius: "50%", background: "rgba(0,0,0,0.45)", filter: "blur(2px)" }} />
      {/* nom (au survol/sélection) */}
      {showLabel && (
        <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold text-slate-100" style={{ bottom: sizePx + 4, background: "rgba(2,6,15,0.94)", borderColor: `${agent.colorPrimary}88`, boxShadow: `0 0 12px ${agent.colorPrimary}55` }}>
          {agent.name}
          <span className="ml-1 font-normal text-slate-400">{agent.roleBadge}</span>
        </div>
      )}
      {/* corps avatar : anneau statut + disque rang + visage */}
      <div className="relative h-full w-full" style={{ animation: `agent-bob ${2.4 + (agent.name.length % 5) * 0.25}s ease-in-out infinite` }}>
        {/* anneau statut */}
        <div className="absolute inset-0 rounded-full" style={{ border: `${Math.max(2, sizePx * 0.06)}px solid ${ringColor}`, boxShadow: `0 0 ${selected ? 16 : 9}px ${ringColor}${alert ? "" : "aa"}`, animation: alert ? "ring-alert 1s ease-in-out infinite" : moving ? "ring-pulse 1.4s ease-in-out infinite" : "none" }} />
        {/* fond rang (dégradé couleur agent) */}
        <div className="absolute rounded-full" style={{ inset: sizePx * 0.1, background: `radial-gradient(circle at 35% 28%, ${agent.colorAccent}, ${agent.colorPrimary})`, boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.45)" }} />
        {/* visage emoji */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: sizePx * 0.5, lineHeight: 1 }}>{emoji}</div>
        {/* badge rang (glyph) */}
        {agent.glyph && (
          <div className="absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full" style={{ width: sizePx * 0.34, height: sizePx * 0.34, fontSize: sizePx * 0.2, background: "rgba(2,6,15,0.92)", border: `1.5px solid ${agent.colorAccent}` }}>{agent.glyph}</div>
        )}
        {/* puce d'état */}
        {stateGlyph && (
          <div className="absolute -bottom-0.5 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full" style={{ width: sizePx * 0.3, height: sizePx * 0.3, fontSize: sizePx * 0.17, background: "rgba(2,6,15,0.92)", border: "1px solid rgba(148,163,184,0.5)" }}>{stateGlyph}</div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════ INSPECTOR agent ════════════════════ */
function AgentInspector({
  agent, state, houseName, houseStatus, onClose, onGotoHouse,
}: {
  agent: CanonAgent; state: MoveState; houseName: string; houseStatus: { color: string; label: string };
  onClose: () => void; onGotoHouse: () => void;
}) {
  const stateLabel: Record<MoveState, string> = { idleAtHome: "À sa maison", walking: "En déplacement", working: "En mission", returningHome: "Retour maison" };
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[22px]" style={{ background: `radial-gradient(circle at 35% 28%, ${agent.colorAccent}, ${agent.colorPrimary})`, border: `2px solid ${houseStatus.color}`, boxShadow: `0 0 12px ${houseStatus.color}88` }}>{agent.avatarEmoji || agent.glyph || "🤖"}</div>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-black" style={{ color: agent.colorAccent }}>{agent.glyph} {agent.name}</div>
            <div className="truncate text-[10px] uppercase tracking-wide text-slate-400">{agent.roleBadge}</div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${houseStatus.color}22`, color: houseStatus.color, border: `1px solid ${houseStatus.color}55` }}>● {stateLabel[state]}</span>
        {agent.rankLayer && <span className="inline-block rounded-full border border-slate-700 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-300">{agent.rankLayer.replace(/_/g, " ")}</span>}
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Maison propriétaire</p>
      <button type="button" onClick={onGotoHouse} className="mt-0.5 flex w-full items-center justify-between rounded border border-slate-700/60 px-2 py-1 text-left hover:border-cyan-300/60">
        <span className="text-[11px] font-bold text-slate-200">{houseName}</span>
        <span className="text-[9px] font-bold" style={{ color: houseStatus.color }}>● {houseStatus.label}</span>
      </button>
      {agent.boss && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Reporte à</p><p className="text-[11px] text-slate-300">{agent.boss}</p></>)}
      {agent.engine && (<><p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Moteur</p><p className="text-[11px] text-slate-300">{agent.engine}</p></>)}
      {agent.responsibilities.length > 0 && (<>
        <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Responsabilités</p>
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {agent.responsibilities.slice(0, 6).map((r, i) => <li key={i} className="flex gap-1 text-[10px] leading-snug text-slate-300"><span className="text-slate-500">▸</span><span className="min-w-0">{r}</span></li>)}
        </ul>
      </>)}
    </div>
  );
}

const KEYFRAMES = `
@keyframes agent-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes ring-pulse { 0%,100% { opacity: 0.85; } 50% { opacity: 0.35; } }
@keyframes ring-alert { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.08); } }
@keyframes sea-shimmer { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 240; } }
`;

export default WorldMapLiving;
