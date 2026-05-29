"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — scène isométrique
 * PORTÉE depuis le legacy ~/cof-trading/hub/cof-island-v21.html (T9).
 * worldToIso (ISO_W=30,ISO_H=16) + HUB_V21_PRIMARY_ZONES (positions iso
 * exactes + palette mur/toit/accent) + HUB_V21_AGENT_HOME — adaptés en
 * React/SVG. Bind live : registry :8767 (statut maison), snapshot (KPIs),
 * angel-roster (anges). Pas de canvas impératif, pas de sprites legacy.
 * ════════════════════════════════════════════════════════════════ */

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
  services?: Array<{ id?: string; label?: string; ok?: boolean; status?: string }>;
  fetchedAt?: string;
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

/* ---- Projection iso legacy (cof-island-v21.html l.7117-7127) ---- */
const ISO_W = 30;
const ISO_H = 16;
const isoProject = (wx: number, wy: number) => ({
  sx: (wx - wy) * (ISO_W / 2),
  sy: (wx + wy) * (ISO_H / 2),
});

/* ---- 15 maisons canon : positions iso + palette EXACTES du legacy
 *      (HUB_V21_PRIMARY_ZONES) ---- */
type Zone = {
  id: string;
  name: string;
  sub: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  roof: string;
  accent: string;
  district: string;
  role: string;
  tall?: boolean;
};
const LEGACY_ZONES: Zone[] = [
  { id: "obsidian_library", name: "Knowledge Vault", sub: "Obsidian & Drive", x: 50, y: 10, w: 5, h: 4, color: "#f8fafc", roof: "#020617", accent: "#0f172a", district: "knowledge", role: "Canon, Drive index et bundles sources" },
  { id: "lightrag_observatory", name: "LightRAG Observatory", sub: "Semantic graph", x: 58, y: 17, w: 5, h: 4, color: "#1e1b4b", roof: "#0f0820", accent: "#a78bfa", district: "knowledge", role: "Mémoire sémantique LightRAG, recall sourcé" },
  { id: "paperclip_factory", name: "Paperclip Factory", sub: "Backlog scoring", x: 44, y: 20, w: 5, h: 4, color: "#24143f", roof: "#0f0820", accent: "#7c3aed", district: "knowledge", role: "Scoring tâches Paperclip et nettoyage backlog" },
  { id: "mt4_signal_tower", name: "Trading Tower", sub: "Markets & Research", x: 24, y: 25, w: 5, h: 5, color: "#0b1b14", roof: "#030705", accent: "#00e676", district: "trading", role: "Recherche trading, paper analytics, STRAT-17/18 LIVE", tall: true },
  { id: "central_brain", name: "Central Brain", sub: "AI Meta-Surveillance", x: 47, y: 31, w: 5, h: 5, color: "#24104f", roof: "#100520", accent: "#8b5cf6", district: "command", role: "Orchestration cross-IA, mémoire vivante, routing missions", tall: true },
  { id: "mission_control_tower", name: "Command Tower", sub: "Command & Control", x: 56, y: 35, w: 6, h: 5, color: "#102a43", roof: "#06121f", accent: "#008cff", district: "command", role: "Tour de contrôle, board, priorités, routing GO", tall: true },
  { id: "trading_academy", name: "Trading Academy", sub: "cofiatrading Academy", x: 36, y: 42, w: 6, h: 4, color: "#17324a", roof: "#07131f", accent: "#38bdf8", district: "education", role: "Académie : site public -> modules -> preuves -> Trading Tower" },
  { id: "assets_warehouse", name: "Publisher Suite", sub: "Assets · Voice · Distribution", x: 96, y: 38, w: 5, h: 4, color: "#082f2e", roof: "#031414", accent: "#14b8a6", district: "content", role: "Assets brand, render gallery, voix, packaging, distribution" },
  { id: "site_seo_lab", name: "Site & SEO Lab", sub: "Website & Growth", x: 13, y: 48, w: 5, h: 4, color: "#111827", roof: "#f8fafc", accent: "#ffffff", district: "ops", role: "Site, SEO, tests locaux et deploy readiness" },
  { id: "openclaw_agent_barracks", name: "Agents Village", sub: "OpenClaw agents", x: 68, y: 49, w: 7, h: 4, color: "#3b1f06", roof: "#120904", accent: "#ff7a00", district: "command", role: "Runtime OpenClaw et performance agents" },
  { id: "iron_office", name: "Revenue & CRM", sub: "MRR / VIP / Brokers", x: 31, y: 54, w: 5, h: 4, color: "#4a3412", roof: "#1c1305", accent: "#ffd400", district: "crm", role: "Revenue, CRM, VIP, FTD et diagnostic brokers" },
  { id: "calendar_tower", name: "Calendar Tower", sub: "Recurring missions", x: 95, y: 56, w: 5, h: 4, color: "#3a2500", roof: "#120b00", accent: "#ffb000", district: "security", role: "Cadence missions et tâches agents récurrentes", tall: true },
  { id: "vip_gate", name: "Telegram Community", sub: "Free / VIP channels", x: 40, y: 68, w: 5, h: 4, color: "#0d3b66", roof: "#061a2d", accent: "#00d9ff", district: "crm", role: "Acquisition Telegram, gate VIP et rétention" },
  { id: "compliance_port", name: "Compliance Gate", sub: "CNMV · AEPD · ESMA", x: 82, y: 70, w: 5, h: 4, color: "#3a0710", roof: "#130206", accent: "#ef233c", district: "security", role: "Compliance CNMV/AEPD/ESMA, safety, DLP, GO packets" },
  { id: "youtube_studio", name: "COF IA Publisher", sub: "Video Production Machine", x: 92, y: 22, w: 5, h: 4, color: "#40111b", roof: "#16050a", accent: "#ff1744", district: "content", role: "Machine vidéo : scénarios, render, review, timeline, drafts" },
];

/* ---- agent (ange) -> maison (esprit HUB_V21_AGENT_HOME) ---- */
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

/* district -> couleur rail (routes animées) */
const DISTRICT_COLOR: Record<string, string> = {
  command: "#008cff", content: "#ff1744", crm: "#ffd400", trading: "#00e676",
  knowledge: "#a78bfa", security: "#ef233c", ops: "#cbd5e1", education: "#38bdf8",
};

/* routes inter-maisons (district flows) */
const ROUTES: Array<[string, string, "active" | "vip"]> = [
  ["central_brain", "mission_control_tower", "active"],
  ["mission_control_tower", "openclaw_agent_barracks", "active"],
  ["iron_office", "vip_gate", "vip"],
  ["mt4_signal_tower", "trading_academy", "active"],
  ["youtube_studio", "assets_warehouse", "vip"],
  ["central_brain", "paperclip_factory", "active"],
  ["iron_office", "mission_control_tower", "vip"],
];

/* statut maison (registry) — honest-by-design, jamais de faux-vert */
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

/* géométrie iso d'un bâtiment : footprint + prisme (toit + 2 murs + fenêtres) */
type Pt = { x: number; y: number };
type Win = { pts: string; lit: boolean };
type Built = {
  zone: Zone;
  base: Pt;
  ground: Pt[];
  roofPts: Pt[];
  leftWall: string;
  rightWall: string;
  roofPoly: string;
  height: number;
  leftWindows: Win[];
  rightWindows: Win[];
};

const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/* grille de fenêtres iso-correcte sur une face (4 coins bas/haut), interpolation bilinéaire */
function faceWindows(BL: Pt, BR: Pt, TL: Pt, TR: Pt, cols: number, rows: number, seed: number): Win[] {
  const out: Win[] = [];
  const mx = 0.16;
  const my = 0.2;
  const P = (pt: Pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  const at = (u: number, v: number): Pt => lerpPt(lerpPt(BL, BR, u), lerpPt(TL, TR, u), v);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = at((c + mx) / cols, (r + my) / rows);
      const b = at((c + 1 - mx) / cols, (r + my) / rows);
      const d = at((c + 1 - mx) / cols, (r + 1 - my) / rows);
      const e = at((c + mx) / cols, (r + 1 - my) / rows);
      const lit = ((c * 7 + r * 13 + seed) % 7) !== 0;
      out.push({ pts: `${P(a)} ${P(b)} ${P(d)} ${P(e)}`, lit });
    }
  }
  return out;
}

function buildZone(z: Zone): Built {
  const levels = z.tall ? 7 : z.district === "command" || z.district === "content" ? 5 : 4;
  const h = 8 + levels * 6.5;
  const corners = [
    [z.x, z.y],
    [z.x + z.w, z.y],
    [z.x + z.w, z.y + z.h],
    [z.x, z.y + z.h],
  ].map(([wx, wy]) => isoProject(wx, wy));
  const ground: Pt[] = corners.map((c) => ({ x: c.sx, y: c.sy }));
  const roofPts: Pt[] = ground.map((c) => ({ x: c.x, y: c.y - h }));
  const p = (pt: Pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  // ground: 0=back 1=right 2=front 3=left
  const roofPoly = roofPts.map(p).join(" ");
  const leftWall = [ground[3], ground[2], roofPts[2], roofPts[3]].map(p).join(" ");
  const rightWall = [ground[1], ground[2], roofPts[2], roofPts[1]].map(p).join(" ");
  const cols = Math.max(2, Math.round(z.w * 1.1));
  const rows = Math.max(3, levels);
  const seed = z.id.length + Math.round(z.x) + Math.round(z.y);
  const leftWindows = faceWindows(ground[3], ground[2], roofPts[3], roofPts[2], cols, rows, seed);
  const rightWindows = faceWindows(ground[1], ground[2], roofPts[1], roofPts[2], cols, rows, seed + 3);
  return {
    zone: z,
    base: { x: (ground[0].x + ground[2].x) / 2, y: (ground[0].y + ground[2].y) / 2 },
    ground,
    roofPts,
    leftWall,
    rightWall,
    roofPoly,
    height: h,
    leftWindows,
    rightWindows,
  };
}

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
  const [registryError, setRegistryError] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<string | null>(null);
  const [selectedAngel, setSelectedAngel] = useState<Angel | null>(null);
  const [hoverHouse, setHoverHouse] = useState<string | null>(null);
  const lastFetch = useRef<number>(0);
  const [syncStamp, setSyncStamp] = useState<string>("");

  // Statut live des maisons via route proxy interne (serveur-side → :8767), refetch 30s.
  // Plus de localhost hardcodé dans le bundle navigateur → marche hors machine locale.
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
          setHouseStatuses(map);
          setOnDemandSet(onDemand);
          setRegistryError(false);
          lastFetch.current = Date.now();
          setSyncStamp(new Date().toLocaleTimeString("fr-FR"));
        }
      } catch {
        if (!cancelled) setRegistryError(true);
      }
    };
    void load();
    const iv = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, []);

  // Camions canon (flux inter-maisons réels) — trucks_manifest.json via route serveur.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cofiatrading-world-control/trucks", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && Array.isArray(d?.trucks)) setTrucks(d.trucks); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const statusFor = (id: string): string => {
    if (houseStatuses && houseStatuses[id]) {
      const raw = houseStatuses[id];
      // Maison on-demand : SOURCE_DOWN/DEGRADED = endormie par design, pas cassée.
      if (onDemandSet.has(id) && (raw === "SOURCE_DOWN" || raw === "DEGRADED")) return "SLEEPING";
      return raw;
    }
    if (registryError) return "ERR";
    if (houseStatuses === null) return "LOADING";
    return "ERR";
  };

  // géométrie + viewBox (auto-fit, gère les coords négatives)
  const { built, viewBox, centerById } = useMemo(() => {
    const b = LEGACY_ZONES.map(buildZone);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const center: Record<string, { x: number; y: number }> = {};
    for (const z of b) {
      for (const pt of [...z.ground, ...z.roofPts]) {
        minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
      }
      center[z.zone.id] = { x: z.base.x, y: z.base.y - z.height };
    }
    const pad = 90;
    const vb = `${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${(maxX - minX + pad * 2).toFixed(0)} ${(maxY - minY + pad * 2).toFixed(0)}`;
    // tri painter (depth iso) : (x+y) croissant
    b.sort((p, q) => (p.zone.x + p.zone.y) - (q.zone.x + q.zone.y));
    return { built: b, viewBox: vb, centerById: center };
  }, []);

  const angels = angelRoster?.anges ?? [];
  const angelsByHome = useMemo(() => {
    const m: Record<string, Angel[]> = {};
    for (const a of angels) {
      const home = ANGEL_HOME_BY_ID[a.id] ?? "central_brain";
      (m[home] ||= []).push(a);
    }
    return m;
  }, [angels]);

  const liveCount = LEGACY_ZONES.filter((z) => statusFor(z.id) === "LIVE").length;
  const rev = snapshot?.revenue;
  const assets = snapshot?.assetsWarehouse;
  const services = snapshot?.services ?? [];
  const servicesOk = services.filter((s) => s.ok).length;

  const selZone = LEGACY_ZONES.find((z) => z.id === selectedHouse) ?? null;

  return (
    <div className="flex w-full flex-col gap-2 rounded-2xl border border-cyan-300/15 bg-slate-950/85 p-3 text-slate-100 shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)] backdrop-blur">
      {/* ── HEADER + KPIs (snapshot) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h2 className="bg-gradient-to-r from-cyan-300 via-sky-200 to-amber-300 bg-clip-text text-lg font-black uppercase tracking-wide text-transparent sm:text-xl">
            COFIATRADING WORLD CONTROL
          </h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Ville isométrique canonique · portée de cof-island</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {([
            ["MRR", fmtEur(rev?.currentMrrEur), "emerald"],
            ["ARR", fmtEur(rev?.currentArrEur), "cyan"],
            ["VIP", fmtNum(rev?.activeVip), "emerald"],
            ["Past due", `${fmtEur(rev?.pastDueEur)} / ${fmtNum(rev?.pastDueCount)}`, "rose"],
            ["Services", `${servicesOk}/${services.length || "—"}`, "amber"],
            ["Maisons", `${liveCount}/${LEGACY_ZONES.length} LIVE`, "cyan"],
            ["Assets", `${fmtNum(assets?.mp4Count)} MP4`, "violet"],
          ] as Array<[string, string, string]>).map(([k, v]) => (
            <span key={k} className="rounded-md border border-cyan-300/20 bg-slate-900/70 px-2 py-1">
              <span className="text-slate-400">{k} </span>
              <span className="font-bold text-slate-100">{v}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── SCÈNE ISO + INSPECTOR ── */}
      <div className="relative h-[calc(100vh-220px)] min-h-[560px] w-full overflow-hidden rounded-xl border border-cyan-300/15 bg-[#02040a]">
        <svg viewBox={viewBox} className="h-full w-full" preserveAspectRatio="xMidYMid meet" onClick={() => { setSelectedHouse(null); setSelectedAngel(null); }}>
          <defs>
            <radialGradient id="iso-ground" cx="50%" cy="42%" r="75%">
              <stop offset="0%" stopColor="#0a1326" />
              <stop offset="100%" stopColor="#02040a" />
            </radialGradient>
            <filter id="iso-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="soft-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="7" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <linearGradient id="roof-sheen" x1="0" y1="0" x2="0.45" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.26" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
            </linearGradient>
          </defs>

          {/* sol iso */}
          <rect x="-100000" y="-100000" width="200000" height="200000" fill="url(#iso-ground)" />
          {/* grille iso discrète */}
          <g stroke="#13314d" strokeWidth="0.6" opacity="0.4">
            {Array.from({ length: 13 }).map((_, i) => {
              const g = i * 10;
              const a = isoProject(g, 0), b = isoProject(g, 120);
              const c = isoProject(0, g), d = isoProject(120, g);
              return (
                <g key={i}>
                  <line x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} />
                  <line x1={c.sx} y1={c.sy} x2={d.sx} y2={d.sy} />
                </g>
              );
            })}
          </g>

          {/* halos de district au sol (pools de lumière colorée) */}
          <g opacity="0.9">
            {built.map((b) => {
              const col = DISTRICT_COLOR[b.zone.district] ?? "#22d3ee";
              return (
                <ellipse
                  key={`dist-${b.zone.id}`}
                  cx={b.base.x}
                  cy={b.base.y + 8}
                  rx={b.zone.w * 13}
                  ry={b.zone.w * 6}
                  fill={col}
                  opacity="0.09"
                  filter="url(#soft-glow)"
                />
              );
            })}
          </g>

          {/* routes animées inter-maisons (district flows) */}
          <g>
            {(trucks.length > 0
              ? trucks.map((t) => ({ a: t.from, b: t.to, kind: t.kind ?? "active", truck: t as Truck | null }))
              : ROUTES.map(([a, b2, k]) => ({ a, b: b2, kind: k, truck: null as Truck | null }))
            ).map((flow, i) => {
              const a = flow.a, b2 = flow.b;
              const ca = centerById[a], cb = centerById[b2];
              if (!ca || !cb) return null;
              const za = LEGACY_ZONES.find((z) => z.id === a);
              const col = flow.kind === "vip" ? "#ffd400" : (DISTRICT_COLOR[za?.district ?? "command"] ?? "#22d3ee");
              const mx = (ca.x + cb.x) / 2, my = (ca.y + cb.y) / 2 - 40;
              const d = `M ${ca.x} ${ca.y + 18} Q ${mx} ${my} ${cb.x} ${cb.y + 18}`;
              return (
                <g key={`r-${i}`}>
                  <path id={`iso-route-${i}`} d={d} fill="none" stroke={col} strokeWidth="1.6" strokeDasharray="5 7" opacity="0.55">
                    <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.1s" repeatCount="indefinite" />
                  </path>
                  <circle r="2.6" fill={col} filter="url(#iso-glow)">
                    <animateMotion dur="6s" repeatCount="indefinite" begin={`${i * 0.8}s`}>
                      <mpath href={`#iso-route-${i}`} />
                    </animateMotion>
                  </circle>
                  {/* navette qui ROULE sur la route (camion/agent vivant, pas figé) */}
                  <g style={{ cursor: flow.truck ? "help" : "default" }}>
                    {flow.truck && <title>{`🚚 ${flow.truck.name} — ${flow.truck.payload} (${flow.truck.owner})`}</title>}
                    <animateMotion dur={`${7 + (i % 4)}s`} repeatCount="indefinite" begin={`${i * 1.3}s`} rotate="auto">
                      <mpath href={`#iso-route-${i}`} />
                    </animateMotion>
                    <rect x="-4.2" y="-2.4" width="8.4" height="4.8" rx="1.3" fill={col} opacity="0.95" filter="url(#iso-glow)" />
                    <rect x="-2.6" y="-1.4" width="3" height="2.8" rx="0.5" fill="#02040a" opacity="0.85" />
                    <circle cx="-2.4" cy="2.6" r="0.9" fill="#0a0f1c" />
                    <circle cx="2.4" cy="2.6" r="0.9" fill="#0a0f1c" />
                  </g>
                  {/* agent piéton qui marche dans l'autre sens */}
                  <g>
                    <animateMotion dur={`${9 + (i % 3)}s`} repeatCount="indefinite" begin={`${i * 0.9 + 2}s`} keyPoints="1;0" keyTimes="0;1" calcMode="linear">
                      <mpath href={`#iso-route-${i}`} />
                    </animateMotion>
                    <circle cx="0" cy="-1.6" r="1.1" fill="#e2e8f0" opacity="0.9" />
                    <rect x="-0.8" y="-0.5" width="1.6" height="3" rx="0.7" fill={col} opacity="0.9" />
                  </g>
                </g>
              );
            })}
          </g>

          {/* bâtiments iso (tri painter) */}
          {built.map((b) => {
            const st = houseStatusStyle(statusFor(b.zone.id));
            const isSel = selectedHouse === b.zone.id;
            const isHover = hoverHouse === b.zone.id;
            const homeAngels = angelsByHome[b.zone.id] ?? [];
            const cx = b.base.x, cyTop = b.base.y - b.height;
            return (
              <g
                key={b.zone.id}
                style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); setSelectedHouse(b.zone.id); setSelectedAngel(null); onSelectHouse(b.zone.id); }}
                onMouseEnter={() => setHoverHouse(b.zone.id)}
                onMouseLeave={() => setHoverHouse(null)}
                opacity={selectedHouse && !isSel ? 0.82 : 1}
              >
                {/* halo statut au sol */}
                <ellipse cx={cx} cy={b.base.y + 6} rx={b.zone.w * 9} ry={b.zone.w * 4.4} fill={st.color} opacity={isSel || isHover ? 0.26 : 0.12} />
                {/* murs (base sombre, gauche éclairée / droite ombre) */}
                <polygon points={b.leftWall} fill={b.zone.color} opacity="0.96" />
                <polygon points={b.rightWall} fill={b.zone.color} opacity="0.72" />
                {/* fenêtres façade gauche (lit = accent lumineux) */}
                {b.leftWindows.map((w, i) => (
                  <polygon key={`lw-${b.zone.id}-${i}`} points={w.pts} fill={w.lit ? b.zone.accent : "#0a0f1c"} opacity={w.lit ? 0.5 : 0.5} />
                ))}
                {/* fenêtres façade droite (ombre) */}
                {b.rightWindows.map((w, i) => (
                  <polygon key={`rw-${b.zone.id}-${i}`} points={w.pts} fill={w.lit ? b.zone.accent : "#070b14"} opacity={w.lit ? 0.32 : 0.55} />
                ))}
                {/* arêtes néon (statut) */}
                <polygon points={b.leftWall} fill="none" stroke={st.color} strokeWidth={isSel || isHover ? 1.8 : 0.9} opacity={isSel || isHover ? 1 : 0.7} />
                <polygon points={b.rightWall} fill="none" stroke={st.color} strokeWidth={isSel || isHover ? 1.6 : 0.7} opacity={isSel || isHover ? 0.9 : 0.5} />
                {/* toit + reflet + arête néon accent */}
                <polygon points={b.roofPoly} fill={b.zone.roof} />
                <polygon points={b.roofPoly} fill="url(#roof-sheen)" />
                <polygon points={b.roofPoly} fill="none" stroke={b.zone.accent} strokeWidth={isSel || isHover ? 2 : 1.3} filter={isSel || isHover ? "url(#iso-glow)" : undefined} />
                {/* accent crest sur le toit */}
                <circle cx={cx} cy={cyTop} r="3.2" fill={b.zone.accent} filter="url(#iso-glow)">
                  {(statusFor(b.zone.id) === "SOURCE_DOWN" || statusFor(b.zone.id) === "DEGRADED") && (
                    <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" />
                  )}
                </circle>
                {/* anges (dots) autour de la base */}
                {homeAngels.map((a, idx) => {
                  const n = homeAngels.length;
                  const ang = (idx / Math.max(1, n)) * Math.PI * 2;
                  const rr = 10 + (idx % 2) * 7;
                  const ax = cx + Math.cos(ang) * rr * 1.6;
                  const ay = b.base.y + 4 + Math.sin(ang) * rr * 0.8;
                  const ac = ANGEL_STATUS[a.status].color;
                  return (
                    <circle key={a.id} cx={ax} cy={ay} r={selectedAngel?.id === a.id ? 3.4 : 2} fill={ac}
                      onClick={(e) => { e.stopPropagation(); setSelectedAngel(a); }} style={{ cursor: "pointer" }}>
                      <animate attributeName="opacity" values="0.55;1;0.55" dur={`${2.4 + (a.id % 5) * 0.4}s`} repeatCount="indefinite" />
                    </circle>
                  );
                })}
                {/* label */}
                <g transform={`translate(${cx + b.zone.w * 9} ${cyTop - 10})`} opacity={isHover || isSel ? 1 : 0.9}>
                  <rect x="0" y="-9" width={b.zone.name.length * 6 + 30} height="26" rx="5" fill="#020617" stroke={isSel || isHover ? st.color : "#1e3a52"} strokeWidth={isSel || isHover ? 1.2 : 0.7} opacity="0.95" />
                  <text x="7" y="2" fontSize="9.5" fontWeight="800" fill="#e2e8f0">{b.zone.name}</text>
                  <text x="7" y="13" fontSize="7.5" fontWeight="700" fill={st.color}>● {st.label}{homeAngels.length ? ` · ${homeAngels.length} anges` : ""}</text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* atmosphère : bloom ville en haut + vignette bords (n'intercepte pas les clics) */}
        <div
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{
            background:
              "radial-gradient(120% 75% at 50% 8%, rgba(38,86,150,0.30), transparent 52%), radial-gradient(100% 100% at 50% 52%, transparent 56%, rgba(0,0,0,0.6))",
          }}
        />

        {/* légende bas */}
        <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-cyan-300/20 bg-slate-950/85 px-3 py-1.5 text-[9px] text-slate-300 backdrop-blur">
          {([["LIVE", "#34d399"], ["EN VEILLE", "#64748b"], ["DEGRADED", "#f59e0b"], ["SOURCE DOWN", "#ef4444"], ["ERR", "#fb7185"]] as Array<[string, string]>).map(([l, c]) => (
            <span key={l} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />{l}</span>
          ))}
          <span className="text-slate-500">· clic maison/ange → inspector</span>
        </div>

        {/* INSPECTOR droit */}
        <div className="absolute right-2 top-2 z-20 flex max-h-[94%] w-[260px] flex-col overflow-auto rounded-xl border border-cyan-300/25 bg-slate-950/95 p-3 backdrop-blur">
          {selectedAngel ? (
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
                <p className="mt-1 text-[10px] font-bold" style={{ color: selectedAngel.arr_impact_eur_year < 0 ? "#fb7185" : "#34d399" }}>
                  ARR impact: {selectedAngel.arr_impact_eur_year.toLocaleString("fr-FR")} €/an
                </p>
              )}
              {selectedAngel.proof_url && <p className="mt-1 break-words text-[9px] text-emerald-300/80">Preuve: {selectedAngel.proof_url}</p>}
            </div>
          ) : selZone ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[13px] font-black" style={{ color: selZone.accent }}>{selZone.name}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">{selZone.sub} · {selZone.district}</div>
                </div>
                <button type="button" onClick={() => setSelectedHouse(null)} className="rounded border border-slate-700 px-1.5 text-[12px] text-slate-400 hover:text-slate-100">✕</button>
              </div>
              {(() => { const st = houseStatusStyle(statusFor(selZone.id)); return (
                <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${st.color}22`, color: st.color, border: `1px solid ${st.color}55` }}>● {st.label}</span>
              ); })()}
              <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Rôle</p>
              <p className="text-[11px] leading-snug text-slate-300">{selZone.role}</p>
              {(() => {
                const houseAngels = angelsByHome[selZone.id] ?? [];
                const live = houseAngels.filter((a) => a.status === "LIVE").length;
                const arrAtRisk = houseAngels.reduce((s, a) => s + (a.arr_impact_eur_year && a.arr_impact_eur_year < 0 ? a.arr_impact_eur_year : 0), 0);
                const nextActions = houseAngels.filter((a) => a.status === "BROKEN" || a.status === "DEGRADED" || a.status === "AWAITING_SETUP");
                return (
                  <>
                    <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">Anges en poste ({houseAngels.length}) · {live} LIVE</p>
                    {arrAtRisk < 0 && (
                      <p className="mt-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">⚠ ARR à risque : {arrAtRisk.toLocaleString("fr-FR")} €/an</p>
                    )}
                    <div className="mt-1 flex flex-col gap-1">
                      {houseAngels.map((a) => (
                        <button key={a.id} type="button" onClick={() => setSelectedAngel(a)} className="flex items-start gap-1.5 rounded border border-slate-700/60 px-1.5 py-1 text-left hover:border-slate-500">
                          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ANGEL_STATUS[a.status].color }} />
                          <span className="min-w-0">
                            <span className="text-[10px] font-bold text-slate-200">{a.name}</span>
                            <span className="ml-1 text-[8.5px] font-semibold uppercase" style={{ color: ANGEL_STATUS[a.status].color }}>{ANGEL_STATUS[a.status].label}</span>
                            <span className="block truncate text-[9px] text-slate-400">{a.mission}</span>
                          </span>
                        </button>
                      ))}
                      {!houseAngels.length && <span className="text-[10px] text-slate-500">—</span>}
                    </div>
                    {nextActions.length > 0 && (
                      <p className="mt-2 text-[9px] text-amber-300/80">▸ {nextActions.length} ange(s) à débloquer/activer — clic pour le détail.</p>
                    )}
                    <p className="mt-2 text-[9px] text-slate-500">Assets/KPI : globaux (non ventilés par maison) — voir HUD.</p>
                  </>
                );
              })()}
            </div>
          ) : (
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-cyan-200">Mission Control</p>
              <p className="mt-1 text-[10px] text-slate-400">{LEGACY_ZONES.length} maisons · {angels.length} anges · {trucks.length} camions · clic pour inspecter.</p>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[9.5px]">
                {(["LIVE", "SLEEPING", "DEGRADED", "SOURCE_DOWN", "ERR"]).map((s) => {
                  const n = LEGACY_ZONES.filter((z) => statusFor(z.id) === s).length;
                  const st = houseStatusStyle(s);
                  return <div key={s} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: st.color }} /><span className="text-slate-300">{st.label}</span><span className="ml-auto font-bold">{n}</span></div>;
                })}
              </div>
              {angels.length > 0 && (
                <>
                  <p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">{angels.length} anges — état réel</p>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[9.5px]">
                    {(Object.keys(ANGEL_STATUS) as AngelStatus[]).map((s) => {
                      const n = angels.filter((a) => a.status === s).length;
                      if (n === 0) return null;
                      const st = ANGEL_STATUS[s];
                      return <div key={s} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: st.color }} /><span className="text-slate-300">{st.label}</span><span className="ml-auto font-bold">{n}</span></div>;
                    })}
                  </div>
                </>
              )}
              <p className="mt-2 text-[9px] text-slate-500">sync registry {syncStamp || "…"}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── TASKBAR mission (bas) ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-300/15 bg-slate-950/70 px-3 py-1.5 text-[10px] text-slate-300">
        <span className="font-black uppercase tracking-wide text-cyan-300">Taskbar</span>
        <span>·</span>
        <span>{LEGACY_ZONES.length} maisons</span>
        <span>· {liveCount} LIVE</span>
        <span>· {angels.length} anges</span>
        <span>· {angelRoster?.counts?.broken ?? 0} cassés</span>
        <span>· YouTube: <span className="text-rose-300">publish locked</span></span>
        <span className="ml-auto text-slate-500">registry :8767 {registryError ? "ERR" : syncStamp ? `sync ${syncStamp}` : "…"}</span>
      </div>
    </div>
  );
}

export default WorldMapLiving;
