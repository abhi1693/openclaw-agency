/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — Guard NO-FALSE-GREEN du ledger d'auth (§7)
 * ────────────────────────────────────────────────────────────────────
 * Fonctions PURES (zéro effet de bord) opérant sur `AuthLedgerItem[]`.
 *
 * Règle d'or (§7) : un GREEN/LIVE n'est jamais légitime sans preuve réelle
 * ET une source de confiance. Un item est en VIOLATION si son `status` vaut
 * "GREEN" ou "LIVE" alors que :
 *   - il n'a PAS de preuve (`proof` absent / vide / espaces), OU
 *   - sa `statusSource` est "mock" / "config" / "unknown".
 *
 * Complète `cofiatWorldStatus.ts::noFalseGreenViolations` (qui opère sur des
 * StatusCell) : ici on cible spécifiquement le ledger d'auth/credentials et on
 * renvoie une raison explicite par item fautif + un récap des statuts.
 *
 * source_tag: COFIAT_NO_FALSE_GREEN_GUARD_LEDGER_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import type {
  AuthLedgerItem,
  OperationalStatus,
  StatusSource,
} from "@/types/cofiatWorld.types";

/** Statuts « verts » qui exigent preuve + source de confiance (§7). */
const GREEN_STATUSES: ReadonlySet<OperationalStatus> = new Set<OperationalStatus>([
  "GREEN",
  "LIVE",
]);

/** Sources NON fiables : interdisent un GREEN/LIVE (faux-vert). */
const UNTRUSTED_SOURCES: ReadonlySet<StatusSource> = new Set<StatusSource>([
  "mock",
  "config",
  "unknown",
]);

/** true si l'item porte une preuve sourçable non vide (espaces seuls = pas de preuve). */
function hasProof(item: AuthLedgerItem): boolean {
  return typeof item.proof === "string" && item.proof.trim().length > 0;
}

/**
 * Valide un lot d'items du ledger d'auth contre la règle NO-FALSE-GREEN (§7).
 * Fonction PURE : ne mute rien, ne loggue rien, ne lit aucune source externe.
 *
 * @returns liste des violations { id, reason } — vide si tout est honnête.
 */
export function validateNoFalseGreen(
  items: AuthLedgerItem[]
): { violations: { id: string; reason: string }[] } {
  const violations: { id: string; reason: string }[] = [];

  for (const item of items) {
    if (!GREEN_STATUSES.has(item.status)) continue;

    const missingProof = !hasProof(item);
    const untrustedSource = UNTRUSTED_SOURCES.has(item.statusSource);

    if (!missingProof && !untrustedSource) continue;

    const reasons: string[] = [];
    if (missingProof) {
      reasons.push("preuve absente");
    }
    if (untrustedSource) {
      reasons.push(`source non fiable (statusSource=${item.statusSource})`);
    }

    violations.push({
      id: item.id,
      reason: `${item.status} sans légitimité : ${reasons.join(" + ")}`,
    });
  }

  return { violations };
}

/**
 * Récapitule la distribution des statuts opérationnels d'un lot d'items.
 * Fonction PURE. Toutes les clés `OperationalStatus` sont présentes (valeur 0
 * par défaut) pour un affichage/tri stable côté UI.
 */
export function summarizeStatuses(
  items: AuthLedgerItem[]
): Record<OperationalStatus, number> {
  const summary: Record<OperationalStatus, number> = {
    GREEN: 0,
    LIVE: 0,
    AMBER: 0,
    AMBER_REVERIFY: 0,
    AMBER_REPAIR: 0,
    AMBER_SESSION: 0,
    RED: 0,
    UNKNOWN: 0,
    LOCKED: 0,
    STALE: 0,
    QUARANTINE: 0,
    DRAFT: 0,
    OPTIONAL_MISSING: 0,
    OPTIONAL_COVERED: 0,
    ADAPTER_MISSING: 0,
  };

  for (const item of items) {
    summary[item.status] += 1;
  }

  return summary;
}

/* ══════════════════════════════════════════════════════════════════
 * ENFORCER NO-FALSE-GREEN — downgrade ACTIF (≠ simple détection)
 * ────────────────────────────────────────────────────────────────────
 * `validateNoFalseGreen` DÉTECTE ; `enforceNoFalseGreen` CORRIGE : il
 * rétrograde tout GREEN/LIVE non mérité vers UNKNOWN. JAMAIS de promotion
 * vers GREEN, JAMAIS de preuve inventée. Idempotent, pur.
 * ════════════════════════════════════════════════════════════════ */

/** Type de preuve (taxonomie canonique, optionnel sur les items). */
export type ProofKind =
  | "heartbeat"
  | "api_probe"
  | "auth_probe"
  | "manual_verification"
  | "billing_check"
  | "filesystem_check"
  | "deployment_check";

/** Confiance de la preuve : hard (probe live), soft (dérivé), manual (audit humain). */
export type ProofConfidence = "hard" | "soft" | "manual";

/** Sources AUTORISANT un GREEN/LIVE (traçables). mock/config/unknown interdits. */
const TRUSTED_GREEN_SOURCES: ReadonlySet<StatusSource> = new Set<StatusSource>([
  "runtime",
  "api",
  "filesystem",
  "user_audit",
]);

/** Forme minimale gardable (vaut pour AuthLedgerItem comme pour un item d'inventaire). */
export type GuardableItem = {
  status: OperationalStatus;
  statusSource: StatusSource;
  proof?: string;
  blocker?: string;
  /** ISO 8601 — si présent et dépassé, la preuve est périmée → UNKNOWN. */
  expiresAt?: string;
};

/**
 * enforceNoFalseGreen — downgrade actif d'un item.
 * Conserve GREEN/LIVE UNIQUEMENT si : preuve non vide + source traçable + non expiré.
 * Sinon → UNKNOWN. Ne promeut jamais, ne fabrique jamais de preuve. Idempotent.
 */
export function enforceNoFalseGreen<T extends GuardableItem>(item: T): T {
  if (item.status !== "GREEN" && item.status !== "LIVE") return item; // jamais de promotion
  const proven = typeof item.proof === "string" && item.proof.trim().length > 0;
  if (!proven) {
    return { ...item, status: "UNKNOWN", blocker: item.blocker ?? "GREEN/LIVE sans preuve → UNKNOWN (no-false-green)" };
  }
  if (!TRUSTED_GREEN_SOURCES.has(item.statusSource)) {
    return { ...item, status: "UNKNOWN", blocker: item.blocker ?? `GREEN/LIVE source=${item.statusSource} non traçable → UNKNOWN` };
  }
  if (item.expiresAt) {
    const exp = Date.parse(item.expiresAt);
    if (Number.isFinite(exp) && exp < Date.now()) {
      return { ...item, status: "UNKNOWN", blocker: item.blocker ?? "preuve expirée → UNKNOWN (no-false-green)" };
    }
  }
  return item;
}

/** Applique l'enforcer à un lot (pratique côté route/UI). */
export function enforceNoFalseGreenAll<T extends GuardableItem>(items: T[]): T[] {
  return items.map((it) => enforceNoFalseGreen(it));
}

/* ── Totaux canoniques 5-buckets + invariant (chiffres CALCULÉS, jamais hardcodés) ── */
export type CanonicalTotals = {
  total: number;
  green: number;
  amber: number;
  red: number;
  quarantine: number;
  unknown: number;
};

/** Calcule les totaux par bucket canonique depuis les items (toute variante AMBER_* → amber). */
export function computeCanonicalTotals(items: ReadonlyArray<{ status: OperationalStatus | string }>): CanonicalTotals {
  const t: CanonicalTotals = { total: items.length, green: 0, amber: 0, red: 0, quarantine: 0, unknown: 0 };
  for (const it of items) {
    const s = String(it.status).toUpperCase();
    if (s === "GREEN" || s === "LIVE") t.green += 1;
    else if (s.startsWith("AMBER")) t.amber += 1;
    else if (s === "RED") t.red += 1;
    else if (s === "QUARANTINE") t.quarantine += 1;
    else t.unknown += 1; // UNKNOWN/STALE/DRAFT/LOCKED/OPTIONAL_*/ADAPTER_MISSING
  }
  return t;
}

/** Invariant : total === green + amber + red + quarantine + unknown. */
export function totalsInvariantOk(t: CanonicalTotals): boolean {
  return t.total === t.green + t.amber + t.red + t.quarantine + t.unknown;
}
