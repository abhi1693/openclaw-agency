"use client";

/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING — INVENTORY / STATUS MATRIX (No-False-Green)
 * ────────────────────────────────────────────────────────────────────
 * Panneau self-contained du cockpit World-Control. Fetch client-side
 * `/api/cofiatrading-world-control/inventory-matrix` (cache:"no-store")
 * et rend l'inventaire complet (≈647 items) groupé par catégorie, chaque
 * groupe COLLAPSIBLE (<details>, replié par défaut — on NE déballe pas
 * 647 lignes). Chaque item montre : nom · pastille+TEXTE du statut ·
 * statusSource · coût (si présent) · blocker/nextAction.
 *
 * Règle d'or chips (reprise de AuthProviderStatusPanel) : la couleur ne
 * suffit JAMAIS — le TEXTE du statut est toujours affiché à côté de la
 * pastille. GREEN/LIVE=emerald · AMBER*=amber · RED=red · QUARANTINE=
 * orange · UNKNOWN=zinc · OPTIONAL_COVERED=slate.
 *
 * Honnêteté états : loading + fetch-error explicites. L'erreur (ex.
 * HTTP_500) est affichée verbatim — JAMAIS de donnée inventée en
 * remplacement.
 *
 * Style : palette sombre fintech des panneaux WorldControl
 * (rounded-md border slate-800, bg-slate-950/70, chips text-[9px/10px]).
 *
 * source_tag: COFIAT_INVENTORY_STATUS_MATRIX_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";

import type { OperationalStatus } from "@/types/cofiatWorld.types";

/* ── shape API (tolérante : on ne casse jamais sur un champ manquant) ── */

/** Un item d'inventaire tel que renvoyé par l'API matrix. */
type InventoryItem = {
  /** Identifiant stable (sinon on retombe sur name+index pour la key). */
  id?: string;
  /** Nom affiché. */
  name: string;
  /** Statut opérationnel (coercé en UNKNOWN si non reconnu). */
  status: OperationalStatus | string;
  /** Catégorie de regroupement. */
  category?: string;
  /** Origine du statut (runtime/api/filesystem/config/…). */
  statusSource?: string;
  /** Coût associé (libellé libre, ex. "$30/mo", "0.02/img"). */
  cost?: string | number | null;
  /** Bloqueur courant (affiché pour les statuts non-verts). */
  blocker?: string | null;
  /** Prochaine action attendue. */
  nextAction?: string | null;
};

/** Réponse de `/api/cofiatrading-world-control/inventory-matrix`. */
type InventoryMatrixResponse = {
  items?: InventoryItem[];
  /** Compte total (sinon recalculé depuis items.length). */
  total?: number;
  /** Comptes par statut renvoyés par le backend (sinon recalculés). */
  countsByStatus?: Partial<Record<string, number>>;
  /** Sources lues côté backend pour bâtir la matrice (indicateur honnêteté). */
  sourcesRead?: string[];
  /** Horodatage de génération côté backend. */
  generatedAt?: string;
  /** Politique appliquée (ex. "NO_FALSE_GREEN"). */
  policy?: string;
  /** Avertissements backend (invariant, downgrades…). */
  warnings?: string[];
};

/* ── ordre canonique des statuts (worst-first) ──────────────────────
 * Plus le rang est bas, plus c'est « pire » → affiché en premier.
 * RED + QUARANTINE remontent en tête de chaque groupe et trient les
 * groupes entre eux. */
const STATUS_RANK: Record<string, number> = {
  RED: 0,
  QUARANTINE: 1,
  AMBER: 2,
  AMBER_REVERIFY: 2,
  AMBER_REPAIR: 2,
  AMBER_SESSION: 2,
  ADAPTER_MISSING: 3,
  UNKNOWN: 4,
  STALE: 4,
  DRAFT: 4,
  LOCKED: 5,
  OPTIONAL_MISSING: 6,
  OPTIONAL_COVERED: 6,
  GREEN: 7,
  LIVE: 7,
};

const statusRank = (status: string): number =>
  status in STATUS_RANK ? STATUS_RANK[status] : 4; // inconnu ≈ UNKNOWN

/** Normalise un statut backend en `OperationalStatus`, sinon UNKNOWN. */
function normalizeStatus(raw: string): OperationalStatus {
  const up = (raw || "").toUpperCase();
  return up in STATUS_RANK ? (up as OperationalStatus) : "UNKNOWN";
}

/* ── style des pastilles (couleur + TEXTE toujours visible) ──────────
 * Identique à AuthProviderStatusPanel, + QUARANTINE=orange demandé. */
function statusChipClass(status: OperationalStatus): string {
  switch (status) {
    case "GREEN":
    case "LIVE":
      return "border-emerald-400/40 bg-emerald-400/10 text-emerald-100";
    case "AMBER":
    case "AMBER_REVERIFY":
    case "AMBER_REPAIR":
    case "AMBER_SESSION":
      return "border-amber-300/40 bg-amber-300/10 text-amber-100";
    case "RED":
      return "border-red-400/40 bg-red-500/10 text-red-200";
    case "QUARANTINE":
      return "border-orange-400/40 bg-orange-500/10 text-orange-200";
    case "OPTIONAL_COVERED":
    case "OPTIONAL_MISSING":
      return "border-slate-500/40 bg-slate-500/10 text-slate-200";
    case "ADAPTER_MISSING":
      return "border-violet-400/40 bg-violet-500/10 text-violet-200";
    case "UNKNOWN":
    case "LOCKED":
    case "STALE":
    case "DRAFT":
    default:
      return "border-zinc-500/40 bg-zinc-500/10 text-zinc-200";
  }
}

/** Pastille statut : carré coloré + TEXTE du statut (jamais couleur seule). */
function StatusChip({ status }: { status: OperationalStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${statusChipClass(
        status
      )}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

/** true pour les statuts qui doivent exposer un blocker/nextAction. */
function isBlocked(s: OperationalStatus): boolean {
  return (
    s.startsWith("AMBER") ||
    s === "RED" ||
    s === "QUARANTINE" ||
    s === "UNKNOWN" ||
    s === "ADAPTER_MISSING"
  );
}

/* ── filtre client-side ──────────────────────────────────────────── */

type FilterKey = "ALL" | "RED" | "AMBER" | "UNKNOWN" | "GREEN";

const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "RED", label: "RED" },
  { key: "AMBER", label: "AMBER" },
  { key: "UNKNOWN", label: "UNKNOWN" },
  { key: "GREEN", label: "GREEN" },
];

/** Un item passe-t-il le filtre courant ? (RED inclut QUARANTINE.) */
function matchesFilter(status: OperationalStatus, filter: FilterKey): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "RED":
      return status === "RED" || status === "QUARANTINE";
    case "AMBER":
      return status.startsWith("AMBER");
    case "UNKNOWN":
      return (
        status === "UNKNOWN" ||
        status === "STALE" ||
        status === "DRAFT" ||
        status === "LOCKED" ||
        status === "ADAPTER_MISSING"
      );
    case "GREEN":
      return status === "GREEN" || status === "LIVE";
    default:
      return true;
  }
}

const formatCost = (cost: InventoryItem["cost"]): string | null => {
  if (cost === null || cost === undefined || cost === "") return null;
  return typeof cost === "number" ? String(cost) : cost;
};

/* ── ligne item ──────────────────────────────────────────────────── */

function ItemRow({ item }: { item: InventoryItem }) {
  const status = normalizeStatus(String(item.status));
  const cost = formatCost(item.cost);
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-white">{item.name}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            {item.statusSource ? item.statusSource : "source unknown"}
            {cost ? <span className="text-slate-400"> · {cost}</span> : null}
          </p>
        </div>
        <StatusChip status={status} />
      </div>

      {isBlocked(status) && item.blocker ? (
        <p className="mt-1 text-[10.5px] leading-4 text-amber-200/80">
          <span className="text-amber-300/70">blocker:</span> {item.blocker}
        </p>
      ) : null}

      {item.nextAction ? (
        <p className="mt-1 text-[10px] leading-4 text-cyan-200/80">
          <span className="text-cyan-300/70">next:</span> {item.nextAction}
        </p>
      ) : null}
    </div>
  );
}

/* ── groupe catégorie (collapsible, replié par défaut) ───────────── */

type CategoryGroup = {
  category: string;
  items: InventoryItem[];
  /** rang du pire item (sert à trier les groupes worst-first). */
  worstRank: number;
  redCount: number;
};

function CategorySection({ group }: { group: CategoryGroup }) {
  const hasRed = group.redCount > 0;
  return (
    <details
      className={`group rounded-md border ${
        hasRed ? "border-red-400/30" : "border-slate-800"
      } bg-slate-950/70`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="text-[9px] text-slate-500 transition group-open:rotate-90"
          >
            ▶
          </span>
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
            {group.category}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {hasRed ? (
            <span className="rounded border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-200">
              red {group.redCount}
            </span>
          ) : null}
          <span className="rounded border border-slate-700/60 bg-slate-900/60 px-1.5 py-0.5 text-[9px] text-slate-400">
            {group.items.length}
          </span>
        </span>
      </summary>
      <div className="grid gap-2 px-2 pb-2">
        {group.items.map((item, idx) => (
          <ItemRow key={item.id ?? `${group.category}:${item.name}:${idx}`} item={item} />
        ))}
      </div>
    </details>
  );
}

/* ── compteur de header (pastille couleur + TEXTE) ───────────────── */

function CountPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: string;
}) {
  return (
    <span className={`rounded border px-1.5 py-0.5 ${tone}`}>
      {label} {count}
    </span>
  );
}

/* ── composant principal (self-contained, client fetch) ──────────── */

export function InventoryStatusMatrix() {
  const [data, setData] = useState<InventoryMatrixResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<FilterKey>("ALL");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(
          "/api/cofiatrading-world-control/inventory-matrix",
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const json = (await response.json()) as InventoryMatrixResponse;
        if (!cancelled) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "UNKNOWN_ERROR"
          );
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo<InventoryItem[]>(
    () => (Array.isArray(data?.items) ? data!.items : []),
    [data]
  );

  // Comptes par statut : on PRÉFÈRE le backend, sinon on recalcule honnêtement.
  const countsByStatus = useMemo<Record<string, number>>(() => {
    if (data?.countsByStatus && Object.keys(data.countsByStatus).length) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(data.countsByStatus)) {
        out[normalizeStatus(k)] = (out[normalizeStatus(k)] ?? 0) + (v ?? 0);
      }
      return out;
    }
    const out: Record<string, number> = {};
    for (const it of items) {
      const s = normalizeStatus(String(it.status));
      out[s] = (out[s] ?? 0) + 1;
    }
    return out;
  }, [data, items]);

  const total = data?.total ?? items.length;

  const greenCount = (countsByStatus.GREEN ?? 0) + (countsByStatus.LIVE ?? 0);
  const amberCount =
    (countsByStatus.AMBER ?? 0) +
    (countsByStatus.AMBER_REVERIFY ?? 0) +
    (countsByStatus.AMBER_REPAIR ?? 0) +
    (countsByStatus.AMBER_SESSION ?? 0);
  const redCount = countsByStatus.RED ?? 0;
  const quarantineCount = countsByStatus.QUARANTINE ?? 0;
  const unknownCount =
    (countsByStatus.UNKNOWN ?? 0) +
    (countsByStatus.STALE ?? 0) +
    (countsByStatus.DRAFT ?? 0) +
    (countsByStatus.LOCKED ?? 0) +
    (countsByStatus.ADAPTER_MISSING ?? 0);
  const optionalCount =
    (countsByStatus.OPTIONAL_COVERED ?? 0) + (countsByStatus.OPTIONAL_MISSING ?? 0);

  // Regroupement par catégorie + filtre client-side, puis worst-first.
  const groups = useMemo<CategoryGroup[]>(() => {
    const byCat = new Map<string, InventoryItem[]>();
    for (const it of items) {
      const status = normalizeStatus(String(it.status));
      if (!matchesFilter(status, filter)) continue;
      const cat = (it.category && it.category.trim()) || "uncategorized";
      const bucket = byCat.get(cat);
      if (bucket) bucket.push(it);
      else byCat.set(cat, [it]);
    }
    const out: CategoryGroup[] = [];
    for (const [category, catItems] of byCat) {
      // items triés worst-first à l'intérieur du groupe
      const sorted = [...catItems].sort((a, b) => {
        const ra = statusRank(normalizeStatus(String(a.status)));
        const rb = statusRank(normalizeStatus(String(b.status)));
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
      const worstRank = sorted.reduce(
        (acc, it) => Math.min(acc, statusRank(normalizeStatus(String(it.status)))),
        99
      );
      const redCnt = sorted.filter((it) => {
        const s = normalizeStatus(String(it.status));
        return s === "RED" || s === "QUARANTINE";
      }).length;
      out.push({ category, items: sorted, worstRank, redCount: redCnt });
    }
    // groupes triés worst-first, puis par taille décroissante, puis alpha
    out.sort((a, b) => {
      if (a.worstRank !== b.worstRank) return a.worstRank - b.worstRank;
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      return a.category.localeCompare(b.category);
    });
    return out;
  }, [items, filter]);

  const filteredCount = useMemo(
    () => groups.reduce((acc, g) => acc + g.items.length, 0),
    [groups]
  );

  const sourcesRead =
    Array.isArray(data?.sourcesRead) && data!.sourcesRead!.length
      ? data!.sourcesRead!.join(" · ")
      : null;

  /* ── état: erreur (affichée verbatim, jamais de fake data) ── */
  if (error) {
    return (
      <div className="rounded-md border border-red-400/50 bg-red-500/10 p-3">
        <p className="text-xs font-semibold text-red-100">
          Inventory / Status Matrix — fetch failed
        </p>
        <p className="mt-1 break-words text-[10.5px] leading-4 text-red-200/90">
          <span className="text-red-300/70">error:</span> {error}
        </p>
        <p className="mt-1 text-[10px] leading-4 text-red-200/60">
          GET /api/cofiatrading-world-control/inventory-matrix — aucune donnée
          affichée (no-false-green).
        </p>
      </div>
    );
  }

  /* ── état: chargement ── */
  if (loading) {
    return (
      <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
        <p className="text-xs font-semibold text-white">
          Inventory / Status Matrix — No-False-Green
        </p>
        <p className="mt-1 animate-pulse text-[10.5px] text-slate-400">
          {"chargement de l'inventaire…"}
        </p>
      </div>
    );
  }

  /* ── état: chargé ── */
  return (
    <div className="space-y-3">
      {/* (1) header + récap des compteurs + sources lues */}
      <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
        <p className="text-xs font-semibold text-white">
          Inventory / Status Matrix — No-False-Green
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-semibold uppercase tracking-wide">
          <CountPill
            label="green/live"
            count={greenCount}
            tone="border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
          />
          <CountPill
            label="amber"
            count={amberCount}
            tone="border-amber-300/40 bg-amber-300/10 text-amber-100"
          />
          <CountPill
            label="red"
            count={redCount}
            tone="border-red-400/40 bg-red-500/10 text-red-200"
          />
          <CountPill
            label="quarantine"
            count={quarantineCount}
            tone="border-orange-400/40 bg-orange-500/10 text-orange-200"
          />
          <CountPill
            label="unknown"
            count={unknownCount}
            tone="border-zinc-500/40 bg-zinc-500/10 text-zinc-200"
          />
          <CountPill
            label="optional"
            count={optionalCount}
            tone="border-slate-500/40 bg-slate-500/10 text-slate-200"
          />
          <CountPill
            label="total"
            count={total}
            tone="border-slate-700/60 bg-slate-900/60 text-slate-400"
          />
        </div>
        <p className="mt-2 truncate text-[10px] leading-4 text-slate-500">
          <span className="text-slate-600">sources read:</span>{" "}
          {sourcesRead ?? "non renseigné par l'API"}
        </p>
      </div>

      {/* (3) filtre client-side */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1.5">
        {FILTER_CHIPS.map((chip) => {
          const active = filter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                active
                  ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                  : "border-slate-700/60 bg-slate-900/60 text-slate-400 hover:border-slate-500/60 hover:text-slate-200"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
        <span className="ml-auto text-[9px] uppercase tracking-wide text-slate-500">
          {filteredCount} / {total} shown
        </span>
      </div>

      {/* (2) groupes par catégorie, collapsibles, repliés par défaut */}
      {groups.length ? (
        <div className="space-y-2">
          {groups.map((group) => (
            <CategorySection key={group.category} group={group} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-[10.5px] text-slate-400">
            {total === 0
              ? "inventaire vide (0 item renvoye par l'API)."
              : `aucun item ne correspond au filtre « ${filter} ».`}
          </p>
        </div>
      )}
    </div>
  );
}

export default InventoryStatusMatrix;
