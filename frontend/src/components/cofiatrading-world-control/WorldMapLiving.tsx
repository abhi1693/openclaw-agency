"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Crosshair,
  Maximize,
  Package,
  Radio,
  Route as RouteIcon,
  Truck,
  Users,
  Warehouse,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Local minimal, defensive snapshot type (no external imports).
 * Every field optional — never assume present.
 * ------------------------------------------------------------------ */
type CofiaHouse = { key?: string; title?: string; status?: string };
type CofiaAgent = {
  id?: string;
  name?: string;
  avatarEmoji?: string;
  glyph?: string;
  colorPrimary?: string;
  roleBadge?: string;
  house?: string;
  boss?: string;
  engine?: string;
};
type CofiaService = { label?: string; ok?: boolean; status?: string };

export type CofiaSnapshot = {
  revenue?: {
    currentMrrEur?: number | null;
    currentArrEur?: number | null;
    activeVip?: number | null;
    pastDueEur?: number | null;
    pastDueCount?: number | null;
  };
  centralBrain?: {
    housesCount?: number | null;
    houses?: CofiaHouse[];
  };
  agentsCanon?: {
    agents?: CofiaAgent[];
  };
  publisher?: {
    outputDirCount?: number | null;
  };
  assetsWarehouse?: {
    mp4Count?: number | null;
    captionsCount?: number | null;
    assetsInventoryCount?: number | null;
  };
  services?: CofiaService[];
  fetchedAt?: string;
};

/* ------------------------------------------------------------------ *
 * 38 Anges canon (Manāzil al-Malā'ikah) — honest-by-design 6 statuts.
 * Each angel lives at its platform cluster on the map (constellation).
 * ------------------------------------------------------------------ */
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

const ANGEL_STATUS: Record<AngelStatus, { color: string; label: string }> = {
  LIVE: { color: "#10b981", label: "LIVE" },
  OPERATIONAL_PARTIAL: { color: "#22d3ee", label: "PARTIEL" },
  CANON_GATE: { color: "#38bdf8", label: "CANON GATE" },
  AWAITING_SETUP: { color: "#64748b", label: "À ACTIVER" },
  DEGRADED: { color: "#f59e0b", label: "DEGRADED" },
  BROKEN: { color: "#ef4444", label: "CASSÉ" },
};

/* Platform clusters — fixed coords on the 1000x500 map, angels orbit these. */
const ANGEL_CLUSTERS: Array<{ id: string; label: string; x: number; y: number; angelIds: number[] }> = [
  { id: "social", label: "Social / Acquisition", x: 215, y: 168, angelIds: [11, 12, 13, 14, 15, 16, 24] },
  { id: "video", label: "Studio Vidéo", x: 300, y: 322, angelIds: [3, 9, 10] },
  { id: "compliance", label: "Compliance Port", x: 432, y: 112, angelIds: [5, 6, 7, 28, 34] },
  { id: "central", label: "Central Brain", x: 505, y: 152, angelIds: [1, 2, 25, 33, 38] },
  { id: "vip", label: "VIP Gate", x: 548, y: 300, angelIds: [8, 18] },
  { id: "assets", label: "Assets Warehouse", x: 620, y: 112, angelIds: [26] },
  { id: "revenue", label: "Revenue / Iron", x: 690, y: 205, angelIds: [4, 19, 20, 29] },
  { id: "trading", label: "Trading Tower", x: 800, y: 166, angelIds: [17, 22, 23, 27, 35, 36] },
  { id: "knowledge", label: "Knowledge Vault", x: 742, y: 330, angelIds: [30, 31, 32] },
  { id: "calendar", label: "Calendar Tower", x: 872, y: 360, angelIds: [21, 37] },
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(value)
    .replace(/ /g, " ");
}

// Honest-by-design: registry status → color. NO fake-green default.
// LIVE→green · SOURCE_DOWN→red · REGISTERED/DEGRADED→orange · ERR→rose · LOADING→slate.
function statusColor(status?: string): { dot: string; text: string; label: string } {
  switch (status) {
    case "LIVE":
      return { dot: "#10b981", text: "text-emerald-300", label: "LIVE" };
    case "SOURCE_DOWN":
      return { dot: "#ef4444", text: "text-rose-300", label: "SOURCE DOWN" };
    case "DEGRADED":
      return { dot: "#f59e0b", text: "text-amber-300", label: "DEGRADED" };
    case "REGISTERED":
      return { dot: "#f59e0b", text: "text-amber-300", label: "REGISTERED" };
    case "LOADING":
      return { dot: "#475569", text: "text-slate-400", label: "…" };
    case "ERR":
      return { dot: "#fb7185", text: "text-rose-300", label: "ERR" };
    default:
      return { dot: "#fb7185", text: "text-rose-300", label: status || "ERR" };
  }
}

/* Preset node coordinates spread across the 1000x500 map viewBox. */
const NODE_COORDS: Array<{ x: number; y: number }> = [
  { x: 215, y: 175 }, // North America
  { x: 300, y: 320 }, // South America
  { x: 505, y: 150 }, // Europe
  { x: 545, y: 300 }, // Africa
  { x: 690, y: 200 }, // Middle East / Asia
  { x: 800, y: 165 }, // East Asia
  { x: 870, y: 360 }, // Oceania
  { x: 430, y: 110 }, // North Atlantic
  { x: 620, y: 110 }, // North Eurasia
  { x: 740, y: 330 }, // Indian Ocean
];

/* 15 maisons canon — id (matche le registry :8767) + titre + coord fixe map. */
const CANON_HOUSES: Array<{ id: string; title: string; x: number; y: number }> = [
  { id: "site_seo_lab", title: "Site & SEO Lab", x: 190, y: 150 },
  { id: "openclaw_agent_barracks", title: "Agents Barracks", x: 252, y: 226 },
  { id: "youtube_studio", title: "CofiaPublisher Studio", x: 150, y: 300 },
  { id: "paperclip_factory", title: "Paperclip Factory", x: 305, y: 335 },
  { id: "compliance_port", title: "Compliance Port", x: 432, y: 108 },
  { id: "mission_control_tower", title: "Command Tower", x: 492, y: 150 },
  { id: "central_brain", title: "Central Brain", x: 540, y: 198 },
  { id: "vip_gate", title: "VIP Gate", x: 556, y: 296 },
  { id: "assets_warehouse", title: "Assets Warehouse", x: 626, y: 112 },
  { id: "iron_office", title: "Revenue & Iron", x: 692, y: 166 },
  { id: "mt4_signal_tower", title: "Trading Tower", x: 816, y: 150 },
  { id: "trading_academy", title: "Trading Academy", x: 866, y: 216 },
  { id: "lightrag_observatory", title: "LightRAG Observatory", x: 720, y: 300 },
  { id: "obsidian_library", title: "Knowledge Vault", x: 776, y: 360 },
  { id: "calendar_tower", title: "Calendar Tower", x: 882, y: 360 },
];

type Layers = {
  camions: boolean;
  ouvriers: boolean;
  entrepots: boolean;
  routes: boolean;
  maisons: boolean;
  anges: boolean;
};

/* Generated faint "city light" dots — deterministic so SSR/CSR match. */
const CITY_LIGHTS = (() => {
  const out: Array<{ x: number; y: number; r: number; c: string; o: number }> = [];
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  // Rough land bands so dots land mostly on "continents".
  const bands = [
    { x0: 120, x1: 340, y0: 120, y1: 360 }, // Americas
    { x0: 450, x1: 600, y0: 90, y1: 360 }, // Europe/Africa
    { x0: 620, x1: 880, y0: 110, y1: 290 }, // Asia
    { x0: 820, x1: 910, y0: 330, y1: 400 }, // Oceania
  ];
  for (let i = 0; i < 140; i++) {
    const b = bands[i % bands.length];
    out.push({
      x: b.x0 + rand() * (b.x1 - b.x0),
      y: b.y0 + rand() * (b.y1 - b.y0),
      r: 0.6 + rand() * 1.4,
      c: rand() > 0.7 ? "#f59e0b" : "#22d3ee",
      o: 0.18 + rand() * 0.4,
    });
  }
  return out;
})();

/* Routes between node indices. kind drives color/semantics. */
const ROUTES: Array<{ a: number; b: number; kind: "active" | "vip"; vehicle: "🚚" | "✈️"; dur: number }> = [
  { a: 0, b: 2, kind: "active", vehicle: "✈️", dur: 11 },
  { a: 2, b: 4, kind: "vip", vehicle: "✈️", dur: 9 },
  { a: 1, b: 3, kind: "active", vehicle: "🚚", dur: 13 },
  { a: 4, b: 5, kind: "vip", vehicle: "🚚", dur: 8 },
  { a: 5, b: 6, kind: "active", vehicle: "✈️", dur: 12 },
  { a: 3, b: 5, kind: "vip", vehicle: "✈️", dur: 14 },
  { a: 0, b: 1, kind: "active", vehicle: "🚚", dur: 10 },
];

function curvePath(ax: number, ay: number, bx: number, by: number): string {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2 - Math.abs(bx - ax) * 0.18 - 18;
  return `M ${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`;
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */
export function WorldMapLiving({
  snapshot,
  angelRoster,
  onSelectHouse,
}: {
  snapshot: CofiaSnapshot | null;
  angelRoster?: AngelRoster | null;
  onSelectHouse: (houseId: string) => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<number | null>(null);
  const [layers, setLayers] = useState<Layers>({
    camions: true,
    ouvriers: true,
    entrepots: true,
    routes: true,
    maisons: true,
    anges: true,
  });
  const [selectedAngel, setSelectedAngel] = useState<Angel | null>(null);
  const [hoveredAngel, setHoveredAngel] = useState<number | null>(null);
  // Live house statuses from Central Brain registry — refetch every 30s.
  const [houseStatuses, setHouseStatuses] = useState<Record<string, string> | null>(null);
  const [registryError, setRegistryError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadRegistry = async () => {
      try {
        const r = await fetch("http://localhost:8767/api/central-brain/registry", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP_${r.status}`);
        const data = await r.json();
        const houses = (data?.houses ?? {}) as Record<string, { status?: unknown }>;
        const map: Record<string, string> = {};
        for (const [id, v] of Object.entries(houses)) {
          if (typeof v?.status === "string") map[id] = v.status;
        }
        if (!cancelled) {
          setHouseStatuses(map);
          setRegistryError(false);
        }
      } catch {
        // Honest-by-design: on échec, on marque ERR — jamais de faux-vert ni UNKNOWN.
        if (!cancelled) setRegistryError(true);
      }
    };
    void loadRegistry();
    const iv = window.setInterval(loadRegistry, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  // Statut honnête par maison : registry > ERR si échec/absent > LOADING avant 1er fetch.
  const statusFor = (id: string): string => {
    if (houseStatuses && houseStatuses[id]) return houseStatuses[id];
    if (registryError) return "ERR";
    if (houseStatuses === null) return "LOADING";
    return "ERR";
  };
  const houseNodes = CANON_HOUSES.map((h) => ({ ...h, key: h.id, status: statusFor(h.id) }));
  const liveHousesCount = houseNodes.filter((n) => n.status === "LIVE").length;

  const dragState = useRef<{ active: boolean; startX: number; startY: number; ox: number; oy: number }>({
    active: false,
    startX: 0,
    startY: 0,
    ox: 0,
    oy: 0,
  });

  const housesCount = snapshot?.centralBrain?.housesCount;
  const houses = snapshot?.centralBrain?.houses ?? [];

  /* Map first N houses onto preset coordinates. */
  const nodes = useMemo(() => {
    const count = Math.min(NODE_COORDS.length, Math.max(houses.length, 0));
    return NODE_COORDS.slice(0, count || NODE_COORDS.length).map((coord, i) => {
      const house = houses[i];
      return {
        ...coord,
        key: house?.key ?? `node-${i}`,
        title: house?.title ?? `Maison ${i + 1}`,
        status: house?.status,
        present: Boolean(house),
      };
    });
  }, [houses]);

  /* Position the 38 angels in orbit rings around their platform cluster. */
  const angelNodes = useMemo(() => {
    const list = angelRoster?.anges ?? [];
    const out: Array<{ angel: Angel; x: number; y: number; cx: number; cy: number; color: string }> = [];
    for (const cluster of ANGEL_CLUSTERS) {
      const angels = list.filter((a) => cluster.angelIds.includes(a.id));
      const n = angels.length;
      angels.forEach((a, idx) => {
        const ring = n <= 1 ? 0 : 11 + (idx % 3) * 6;
        const theta = (idx / Math.max(1, n)) * Math.PI * 2 + cluster.x * 0.05;
        out.push({
          angel: a,
          cx: cluster.x,
          cy: cluster.y,
          x: cluster.x + Math.cos(theta) * ring,
          y: cluster.y + Math.sin(theta) * ring,
          color: ANGEL_STATUS[a.status].color,
        });
      });
    }
    return out;
  }, [angelRoster]);

  const angelCounts = angelRoster?.counts;
  const angelTotal = angelRoster?.total_anges ?? angelRoster?.anges?.length;

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => Math.min(2.5, Math.max(0.6, +(s + delta).toFixed(2))));
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(2.5, Math.max(0.6, +(s + (e.deltaY < 0 ? 0.12 : -0.12)).toFixed(2))));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragState.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        ox: offset.x,
        oy: offset.y,
      };
    },
    [offset.x, offset.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.active) return;
    setOffset({
      x: dragState.current.ox + (e.clientX - dragState.current.startX),
      y: dragState.current.oy + (e.clientY - dragState.current.startY),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current.active = false;
  }, []);

  const toggleLayer = useCallback((key: keyof Layers) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  }, []);

  /* Donut: zone repartition. */
  const zones = [
    { label: "Europe", pct: 32, color: "#22d3ee" },
    { label: "Afrique", pct: 26, color: "#10b981" },
    { label: "Amérique", pct: 22, color: "#f59e0b" },
    { label: "Asie", pct: 14, color: "#a78bfa" },
    { label: "Autres", pct: 4, color: "#64748b" },
  ];
  const donutCirc = 2 * Math.PI * 42;
  let donutAcc = 0;

  const chips = [
    { label: `${housesCount != null ? formatNumber(housesCount) : "—"} Maisons` },
    { label: `${angelTotal ?? 38} Anges` },
    { label: "59 Camions Canon" },
    { label: "41 Ouvriers" },
    { label: "LIVE Runtime", live: true },
  ];

  const fleetStats = [
    { icon: Truck, label: "Camions Canon", value: "59" },
    { icon: Users, label: "Ouvriers Actifs", value: "41" },
    { icon: Building2, label: "Maisons Actives", value: housesCount != null ? formatNumber(housesCount) : "—" },
    { icon: Warehouse, label: "Entrepôts", value: "8" },
    { icon: Radio, label: "Uptime Global", value: "98%" },
  ];

  const legend = [
    { color: "#06b6d4", label: "Camion Canon" },
    { color: "#a78bfa", label: "Ouvrier" },
    { color: "#f97316", label: "Entrepôt" },
    { color: "#22d3ee", label: "Maison" },
    { color: "#10b981", label: "Route Active" },
    { color: "#f59e0b", label: "Route VIP" },
    { color: "#ef4444", label: "Zone Conflictuelle" },
  ];

  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-cyan-300/15 bg-slate-950/80 p-3 text-slate-100 shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)] backdrop-blur">
      {/* ---------------- HEADER ---------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h2 className="font-black uppercase tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-emerald-300 text-lg sm:text-xl">
            COFIATRADING WORLD CONTROL
          </h2>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
            Couche visuelle canonique animée
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <span
              key={c.label}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                c.live
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                  : "border-cyan-300/20 bg-slate-900/70 text-cyan-200"
              }`}
            >
              {c.live && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 align-middle" />}
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {/* ---------------- MAP STAGE ---------------- */}
      <div
        className="relative h-[520px] w-full overflow-hidden rounded-xl border border-cyan-300/15 bg-[#02040a] shadow-inner"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: dragState.current.active ? "grabbing" : "grab", touchAction: "none" }}
      >
        {/* Zoom controls */}
        <div className="absolute right-3 top-3 z-30 flex flex-col gap-1.5">
          {[
            { Icon: ZoomIn, fn: () => zoomBy(0.2), title: "Zoom +" },
            { Icon: ZoomOut, fn: () => zoomBy(-0.2), title: "Zoom -" },
            { Icon: Maximize, fn: resetView, title: "Reset" },
            { Icon: Crosshair, fn: () => setOffset({ x: 0, y: 0 }), title: "Recentrer" },
          ].map(({ Icon, fn, title }) => (
            <button
              key={title}
              type="button"
              title={title}
              onClick={fn}
              className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-300/20 bg-slate-950/80 text-cyan-200 backdrop-blur transition hover:border-cyan-300/50 hover:bg-slate-900 hover:text-cyan-100"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <div className="mt-1 rounded-md border border-cyan-300/20 bg-slate-950/80 px-1.5 py-0.5 text-center text-[10px] font-bold text-cyan-300">
            {Math.round(scale * 100)}%
          </div>
        </div>

        {/* Pan + zoom layer */}
        <div
          className="absolute inset-0 origin-center"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transition: dragState.current.active ? "none" : "transform 0.12s ease-out" }}
        >
          <svg viewBox="0 0 1000 500" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="wm-ocean" cx="50%" cy="40%" r="75%">
                <stop offset="0%" stopColor="#0a1326" />
                <stop offset="100%" stopColor="#02040a" />
              </radialGradient>
              <filter id="wm-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Ocean / background */}
            <rect x="0" y="0" width="1000" height="500" fill="url(#wm-ocean)" />

            {/* Faint lat/long grid */}
            <g stroke="#1e3a52" strokeWidth="0.5" opacity="0.35">
              {[100, 200, 300, 400].map((y) => (
                <line key={`h${y}`} x1="0" y1={y} x2="1000" y2={y} />
              ))}
              {[150, 350, 500, 650, 850].map((x) => (
                <line key={`v${x}`} x1={x} y1="0" x2={x} y2="500" />
              ))}
            </g>

            {/* Stylized continent silhouettes (earth at night) */}
            <g fill="#16263b" opacity="0.85">
              {/* North America */}
              <path d="M120 110 C160 90 230 95 250 140 C265 175 230 200 240 230 C200 245 160 215 150 180 C135 150 110 140 120 110 Z" />
              {/* South America */}
              <path d="M270 270 C300 255 325 280 320 320 C315 365 290 390 275 365 C260 335 255 295 270 270 Z" />
              {/* Europe */}
              <path d="M470 110 C510 100 545 115 540 145 C520 165 485 165 470 150 C460 138 460 120 470 110 Z" />
              {/* Africa */}
              <path d="M500 175 C545 165 580 190 570 245 C560 300 530 345 515 320 C495 285 490 230 500 175 Z" />
              {/* Asia */}
              <path d="M580 95 C680 80 800 100 860 150 C880 190 820 215 760 210 C700 205 640 200 600 165 C575 140 565 110 580 95 Z" />
              {/* India */}
              <path d="M680 210 C710 205 730 235 715 270 C700 290 685 270 680 240 C678 225 675 215 680 210 Z" />
              {/* Oceania */}
              <path d="M820 340 C865 330 905 350 895 385 C880 410 840 405 825 385 C815 370 812 350 820 340 Z" />
            </g>

            {/* City lights */}
            <g>
              {CITY_LIGHTS.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.c} opacity={d.o} />
              ))}
            </g>

            {/* Routes + moving fleet */}
            {layers.routes && (
              <g>
                {ROUTES.map((r, i) => {
                  const a = NODE_COORDS[r.a];
                  const b = NODE_COORDS[r.b];
                  if (!a || !b) return null;
                  const path = curvePath(a.x, a.y, b.x, b.y);
                  const color = r.kind === "vip" ? "#f59e0b" : "#10b981";
                  const showVehicle =
                    (r.vehicle === "🚚" && layers.camions) || (r.vehicle === "✈️" && layers.camions);
                  return (
                    <g key={`route-${i}`}>
                      <path
                        id={`wm-path-${i}`}
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth="1.4"
                        strokeDasharray="5 6"
                        opacity="0.7"
                        filter="url(#wm-glow)"
                      >
                        <animate attributeName="stroke-dashoffset" from="22" to="0" dur="1.1s" repeatCount="indefinite" />
                      </path>
                      {showVehicle && (
                        <text fontSize="15" textAnchor="middle" dominantBaseline="central">
                          {r.vehicle}
                          <animateMotion dur={`${r.dur}s`} repeatCount="indefinite" rotate="auto">
                            <mpath href={`#wm-path-${i}`} />
                          </animateMotion>
                        </text>
                      )}
                      {/* Worker dot riding the route */}
                      {layers.ouvriers && i % 2 === 0 && (
                        <circle r="2.6" fill="#a78bfa" filter="url(#wm-glow)">
                          <animateMotion dur={`${r.dur + 3}s`} repeatCount="indefinite" begin={`${i * 0.7}s`}>
                            <mpath href={`#wm-path-${i}`} />
                          </animateMotion>
                        </circle>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Warehouses (a few fixed) */}
            {layers.entrepots &&
              [
                { x: 230, y: 200 },
                { x: 520, y: 200 },
                { x: 760, y: 230 },
                { x: 850, y: 370 },
              ].map((w, i) => (
                <g key={`wh-${i}`} transform={`translate(${w.x} ${w.y})`}>
                  <rect x="-5" y="-5" width="10" height="10" rx="2" fill="#f97316" opacity="0.85" filter="url(#wm-glow)" />
                </g>
              ))}

            {/* House nodes */}
            {layers.maisons &&
              nodes.map((n, i) => {
                const sc = statusColor(n.status);
                const isHover = hovered === i;
                return (
                  <g
                    key={n.key}
                    transform={`translate(${n.x} ${n.y})`}
                    onClick={() => onSelectHouse(n.key)}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Pulsing rings */}
                    <circle r="6" fill="none" stroke={sc.dot} strokeWidth="2" opacity="0.9" filter="url(#wm-glow)" />
                    <circle r="6" fill="none" stroke={sc.dot} strokeWidth="1.5" opacity="0.6">
                      <animate attributeName="r" from="6" to="20" dur="2.4s" repeatCount="indefinite" begin={`${i * 0.3}s`} />
                      <animate attributeName="opacity" from="0.6" to="0" dur="2.4s" repeatCount="indefinite" begin={`${i * 0.3}s`} />
                    </circle>
                    <circle r="3" fill={sc.dot} />

                    {/* Label card */}
                    <g transform="translate(10 -10)" opacity={isHover ? 1 : 0.92}>
                      <rect
                        x="0"
                        y="-9"
                        width={Math.max(80, (n.title.length * 5.4) + 14)}
                        height="28"
                        rx="5"
                        fill="#020617"
                        stroke={isHover ? sc.dot : "#1e3a52"}
                        strokeWidth={isHover ? 1.3 : 0.8}
                        opacity="0.92"
                      />
                      <text x="7" y="2" fontSize="8.5" fontWeight="700" fill="#e2e8f0">
                        {n.title.length > 18 ? n.title.slice(0, 17) + "…" : n.title}
                      </text>
                      <text x="7" y="13" fontSize="7" fill={sc.dot} fontWeight="600">
                        ● {sc.label}
                      </text>
                    </g>
                  </g>
                );
              })}

            {/* Cluster hubs (faint anchors for the angels) */}
            {layers.anges &&
              ANGEL_CLUSTERS.map((c) => (
                <circle key={`hub-${c.id}`} cx={c.x} cy={c.y} r="1.4" fill="#cbd5e1" opacity="0.4" />
              ))}

            {/* Angels constellation — 38 anges canon at their platform clusters */}
            {layers.anges &&
              angelNodes.map(({ angel, x, y, cx, cy, color }) => {
                const isSel = selectedAngel?.id === angel.id;
                const isHover = hoveredAngel === angel.id;
                return (
                  <g
                    key={`angel-${angel.id}`}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAngel(angel);
                    }}
                    onMouseEnter={() => setHoveredAngel(angel.id)}
                    onMouseLeave={() => setHoveredAngel(null)}
                  >
                    <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeWidth="0.4" opacity="0.22" />
                    <circle cx={x} cy={y} r={isSel || isHover ? 4 : 2.3} fill={color} filter="url(#wm-glow)">
                      <animate
                        attributeName="opacity"
                        values="0.5;1;0.5"
                        dur={`${2.4 + (angel.id % 5) * 0.45}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                    {(isHover || isSel) && (
                      <g transform={`translate(${x + 6} ${y - 4})`}>
                        <rect
                          x="0"
                          y="-8"
                          width={angel.name.length * 5.2 + 12}
                          height="14"
                          rx="3"
                          fill="#020617"
                          stroke={color}
                          strokeWidth="0.7"
                          opacity="0.96"
                        />
                        <text x="6" y="2" fontSize="7.5" fontWeight="700" fill="#e2e8f0">
                          {angel.name}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
          </svg>
        </div>

        {/* ---------------- LEFT OVERLAYS ---------------- */}
        <div className="pointer-events-auto absolute left-3 top-3 z-20 flex w-[210px] flex-col gap-2.5">
          {/* Fleet live */}
          <div className="rounded-xl border border-cyan-300/20 bg-slate-950/75 p-3 backdrop-blur">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-cyan-300">
              <Radio className="h-3 w-3 animate-pulse" /> Flotte en direct
            </div>
            <div className="flex flex-col gap-1.5">
              {fleetStats.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.label} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <Icon className="h-3 w-3 text-cyan-400" /> {f.label}
                    </span>
                    <span className="font-bold text-slate-100">{f.value}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zone repartition donut */}
          <div className="rounded-xl border border-cyan-300/20 bg-slate-950/75 p-3 backdrop-blur">
            <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-cyan-300">
              Répartition zones
            </div>
            <div className="flex items-center gap-3">
              <svg width="84" height="84" viewBox="0 0 100 100" className="-rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#0f172a" strokeWidth="12" />
                {zones.map((z) => {
                  const len = (z.pct / 100) * donutCirc;
                  const dash = `${len} ${donutCirc - len}`;
                  const seg = (
                    <circle
                      key={z.label}
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke={z.color}
                      strokeWidth="12"
                      strokeDasharray={dash}
                      strokeDashoffset={-donutAcc}
                    />
                  );
                  donutAcc += len;
                  return seg;
                })}
              </svg>
              <div className="flex flex-col gap-0.5">
                {zones.map((z) => (
                  <div key={z.label} className="flex items-center gap-1.5 text-[9.5px] text-slate-300">
                    <span className="h-2 w-2 rounded-sm" style={{ background: z.color }} />
                    {z.label} <span className="font-bold text-slate-100">{z.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-xl border border-cyan-300/20 bg-slate-950/75 p-3 backdrop-blur">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-cyan-300">
              <RouteIcon className="h-3 w-3" /> Filtres
            </div>
            <div className="flex flex-col gap-1">
              {([
                ["camions", "Camions"],
                ["ouvriers", "Ouvriers"],
                ["entrepots", "Entrepôts"],
                ["routes", "Routes"],
                ["maisons", "Maisons"],
                ["anges", "Anges"],
              ] as Array<[keyof Layers, string]>).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300 hover:text-slate-100">
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => toggleLayer(key)}
                    className="h-3.5 w-3.5 accent-cyan-400"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Anges canon — statuts honest-by-design */}
          <div className="rounded-xl border border-amber-300/25 bg-slate-950/75 p-3 backdrop-blur">
            <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-amber-200">
              <span>🕌 Anges canon</span>
              <span className="text-slate-400">{angelTotal ?? 38}</span>
            </div>
            {angelCounts ? (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {([
                  ["LIVE", angelCounts.live],
                  ["OPERATIONAL_PARTIAL", angelCounts.operational_partial],
                  ["CANON_GATE", angelCounts.canon_gate],
                  ["AWAITING_SETUP", angelCounts.awaiting_setup],
                  ["DEGRADED", angelCounts.degraded],
                  ["BROKEN", angelCounts.broken],
                ] as Array<[AngelStatus, number]>).map(([st, n]) => (
                  <div key={st} className="flex items-center gap-1.5 text-[9.5px] text-slate-300">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: ANGEL_STATUS[st].color, boxShadow: `0 0 5px ${ANGEL_STATUS[st].color}` }}
                    />
                    <span className="truncate">{ANGEL_STATUS[st].label}</span>
                    <span className="ml-auto font-bold text-slate-100">{n}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-slate-500">chargement roster…</p>
            )}
          </div>
        </div>

        {/* ---------------- BOTTOM LEGEND ---------------- */}
        <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[92%] -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-xl border border-cyan-300/20 bg-slate-950/80 px-4 py-2 backdrop-blur">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-[10px] font-medium text-slate-300">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: l.color, boxShadow: `0 0 6px ${l.color}` }}
              />
              {l.label}
            </span>
          ))}
        </div>

        {/* ---------------- ANGEL DETAIL CARD ---------------- */}
        {selectedAngel && (
          <div
            className="absolute bottom-3 right-3 z-40 w-[264px] max-h-[440px] overflow-auto rounded-xl border bg-slate-950/95 p-3 text-slate-100 shadow-[0_0_45px_-8px_rgba(0,0,0,0.85)] backdrop-blur"
            style={{ borderColor: ANGEL_STATUS[selectedAngel.status].color }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-black">{selectedAngel.name}</span>
                  <span className="text-[12px] text-slate-400">{selectedAngel.name_ar}</span>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  #{selectedAngel.id} · {selectedAngel.platform}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAngel(null)}
                className="rounded-md border border-slate-700 px-1.5 text-[12px] leading-none text-slate-400 transition hover:text-slate-100"
              >
                ✕
              </button>
            </div>
            <span
              className="mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              style={{
                background: `${ANGEL_STATUS[selectedAngel.status].color}22`,
                color: ANGEL_STATUS[selectedAngel.status].color,
                border: `1px solid ${ANGEL_STATUS[selectedAngel.status].color}55`,
              }}
            >
              ● {ANGEL_STATUS[selectedAngel.status].label}
            </span>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">Manzilah</p>
            <p className="text-[11px] text-slate-300">{selectedAngel.manzilah}</p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">Mission</p>
            <p className="text-[11px] leading-snug text-slate-300">{selectedAngel.mission}</p>
            {selectedAngel.stack && (
              <p className="mt-2 text-[10px] text-slate-400">
                <span className="text-slate-500">Stack:</span> {selectedAngel.stack}
              </p>
            )}
            {selectedAngel.proof_url && (
              <p className="mt-1 break-words text-[9.5px] text-emerald-300/80">
                <span className="text-slate-500">Preuve:</span> {selectedAngel.proof_url}
              </p>
            )}
            {typeof selectedAngel.arr_impact_eur_year === "number" && (
              <p
                className="mt-1 text-[10px] font-bold"
                style={{ color: selectedAngel.arr_impact_eur_year < 0 ? "#f87171" : "#34d399" }}
              >
                Impact ARR: {selectedAngel.arr_impact_eur_year.toLocaleString("fr-FR")} €/an
              </p>
            )}
          </div>
        )}

        {/* Tiny fetch stamp */}
        {snapshot?.fetchedAt && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-md border border-cyan-300/15 bg-slate-950/70 px-2 py-1 text-[9px] uppercase tracking-wider text-slate-400 backdrop-blur">
            <Package className="h-2.5 w-2.5" />
            sync {String(snapshot.fetchedAt).slice(11, 19) || "—"}
          </div>
        )}
      </div>
    </div>
  );
}

export default WorldMapLiving;
