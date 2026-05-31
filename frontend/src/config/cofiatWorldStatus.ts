/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — Système de statut NO-FALSE-GREEN (§7)
 * Source unique de vérité pour : statut opérationnel + source + preuve.
 * Utilisé par la map, le panneau droit, la console.IA et les validations.
 * Règle d'or : un GREEN/LIVE n'est jamais affiché sans source réelle
 * (runtime/api/filesystem) ET une preuve. Sinon NoFalseGreenGuard rétrograde.
 * ════════════════════════════════════════════════════════════════ */

/* Source unique de vérité des types de statut : src/types/cofiatWorld.types.ts.
 * Ré-export ici pour compat ascendante des imports existants — PAS de redéfinition. */
import type { StatusSource, OperationalStatus } from "@/types/cofiatWorld.types";
export type { StatusSource, OperationalStatus } from "@/types/cofiatWorld.types";

export type StatusCell = {
  status: OperationalStatus;
  source: StatusSource;
  /** preuve sourçable — OBLIGATOIRE pour GREEN/LIVE (sinon rétrogradé) */
  proof?: string;
  /** ce qui manque — attendu pour AMBER/RED/UNKNOWN/STALE/DRAFT */
  blocker?: string;
  nextAction?: string;
  greenCondition?: string;
  lastCheckedAt?: string;
};

/** badge de statut — couleur DÉDIÉE, jamais confondue avec la couleur d'un bâtiment/district */
export const STATUS_STYLE: Record<OperationalStatus, { color: string; label: string; bg: string }> = {
  GREEN:      { color: "#34d399", label: "GREEN",      bg: "rgba(52,211,153,0.14)" },
  LIVE:       { color: "#22d3ee", label: "LIVE",       bg: "rgba(34,211,238,0.14)" },
  AMBER:      { color: "#f59e0b", label: "AMBER",      bg: "rgba(245,158,11,0.14)" },
  RED:        { color: "#ef4444", label: "RED",        bg: "rgba(239,68,68,0.14)" },
  STALE:      { color: "#fbbf24", label: "STALE",      bg: "rgba(251,191,36,0.12)" },
  DRAFT:      { color: "#a78bfa", label: "DRAFT",      bg: "rgba(167,139,250,0.14)" },
  LOCKED:     { color: "#94a3b8", label: "LOCKED",     bg: "rgba(148,163,184,0.14)" },
  QUARANTINE: { color: "#fb7185", label: "QUARANTINE", bg: "rgba(251,113,133,0.14)" },
  UNKNOWN:    { color: "#64748b", label: "UNKNOWN",    bg: "rgba(100,116,139,0.14)" },
};

const REAL_SOURCES: StatusSource[] = ["runtime", "api", "filesystem"];
const isRealSource = (s: StatusSource) => REAL_SOURCES.includes(s);

/**
 * NoFalseGreenGuard — empêche tout GREEN/LIVE non mérité.
 * GREEN/LIVE exigent une source réelle (runtime/api/filesystem) ET une preuve
 * non vide. À défaut → AMBER + blocker explicite. UNKNOWN sans source → reste
 * UNKNOWN avec blocker. Idempotent.
 */
export function guardStatus(cell: StatusCell): StatusCell {
  if (cell.status === "GREEN" || cell.status === "LIVE") {
    const hasProof = !!(cell.proof && cell.proof.trim());
    const realSource = isRealSource(cell.source);
    if (!realSource || !hasProof) {
      return {
        ...cell,
        status: "AMBER",
        blocker:
          cell.blocker ??
          (!realSource
            ? `Source=${cell.source} non réelle (attendu runtime/api/filesystem) → pas de GREEN`
            : "Preuve absente → pas de GREEN sans preuve sourçable"),
        nextAction: cell.nextAction ?? (realSource ? "Attacher une preuve (proof) sourçable" : "Brancher une source réelle (probe/api/fichier)"),
      };
    }
  }
  if (cell.status === "UNKNOWN" && !cell.blocker) {
    return { ...cell, blocker: "Non audité / source introuvable", nextAction: cell.nextAction ?? "Identifier la source réelle" };
  }
  return cell;
}

/** liste les violations no-false-green dans un lot de cellules (pour validation/console) */
export function noFalseGreenViolations(cells: Array<{ id: string; cell: StatusCell }>): string[] {
  const out: string[] = [];
  for (const { id, cell } of cells) {
    if ((cell.status === "GREEN" || cell.status === "LIVE")) {
      if (!isRealSource(cell.source)) out.push(`${id}: ${cell.status} avec source=${cell.source} (non réelle)`);
      else if (!cell.proof?.trim()) out.push(`${id}: ${cell.status} sans preuve`);
    }
  }
  return out;
}

/** statut registry maison (string brute) → StatusCell réel (source=api, registry :8767) */
export function houseStatusToCell(raw: string, opts?: { onDemand?: boolean; proof?: string }): StatusCell {
  const base: StatusCell = { status: "UNKNOWN", source: "api", lastCheckedAt: undefined };
  const proof = opts?.proof ?? "registry :8767 /api/cofiatrading-world-control/registry";
  switch (raw) {
    case "LIVE":        return guardStatus({ status: "LIVE",  source: "api", proof });
    case "SLEEPING":    return { status: "LOCKED", source: "api", blocker: opts?.onDemand ? "On-demand : endormie par design" : "En veille", nextAction: "Réveil on-demand si mission" };
    case "DEGRADED":    return { status: "AMBER",  source: "api", blocker: "Maison dégradée (registry)", nextAction: "Inspecter service/probe" };
    case "SOURCE_DOWN": return { status: "RED",    source: "api", blocker: "Source down (registry)", nextAction: "Relancer/réparer la source" };
    case "REGISTERED":  return { status: "DRAFT",  source: "api", blocker: "Enregistrée mais pas LIVE", nextAction: "Activer la maison" };
    case "ERR":         return { status: "RED",    source: "api", blocker: "Erreur registry", nextAction: "Diag endpoint registry" };
    case "LOADING":     return { status: "UNKNOWN", source: "api", blocker: "Chargement registry…" };
    default:            return { ...base, blocker: `Statut registry inconnu: ${raw}` };
  }
}

/** statut dérivé d'un boolean de service (probe) — derived/api selon la source */
export function boolToCell(ok: boolean | undefined, opts: { source: StatusSource; proof?: string; blocker?: string; nextAction?: string }): StatusCell {
  if (ok === true) return guardStatus({ status: "LIVE", source: opts.source, proof: opts.proof });
  if (ok === false) return { status: "RED", source: opts.source, blocker: opts.blocker ?? "Probe KO", nextAction: opts.nextAction ?? "Vérifier le service" };
  return { status: "UNKNOWN", source: opts.source ?? "unknown", blocker: "Probe non disponible" };
}
