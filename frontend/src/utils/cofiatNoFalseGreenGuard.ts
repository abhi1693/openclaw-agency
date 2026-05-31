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
