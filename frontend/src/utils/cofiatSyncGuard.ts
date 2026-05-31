/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — SYNC GUARD
 * ────────────────────────────────────────────────────────────────────
 * Force la synchronisation : un changement déclare ses cibles de synchro,
 * et le ledger reste cohérent (chaque GREEN a une preuve, chaque provider
 * a preuve OU blocker, chaque maison/agent a une identité).
 *
 * Fonctions PURES, entrées explicites.
 * source_tag: COFIAT_SYNC_GUARD_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import type { AuthLedgerItem } from "@/types/cofiatWorld.types";
import type {
  CofiatChangeManifest,
  CofiatViolation,
  CofiatSyncTarget,
} from "@/types/cofiatProofLedger.types";

/**
 * validateSyncTargets — les synchros du manifest sont-elles tenues ?
 * `blocked` = violation bloquante ; `pending` = warn ; manquante vs requise = warn.
 */
export function validateSyncTargets(
  manifest: CofiatChangeManifest,
  required: CofiatSyncTarget[] = []
): CofiatViolation[] {
  const out: CofiatViolation[] = [];

  for (const s of manifest.syncTargets) {
    if (s.status === "blocked") {
      out.push({
        guard: "inventory-sync",
        severity: "block",
        subject: s.target,
        message: `Synchro « ${s.target} » BLOQUÉE${s.reason ? ` : ${s.reason}` : ""}`,
        nextAction: "Débloquer la synchro avant GREEN",
      });
    } else if (s.status === "pending") {
      out.push({
        guard: "inventory-sync",
        severity: "warn",
        subject: s.target,
        message: `Synchro « ${s.target} » en attente${s.reason ? ` : ${s.reason}` : ""}`,
        nextAction: "Terminer la synchronisation",
      });
    }
  }

  const declared = new Set(manifest.syncTargets.map((s) => s.target));
  for (const req of required) {
    if (!declared.has(req)) {
      out.push({
        guard: "inventory-sync",
        severity: "warn",
        subject: req,
        message: `Synchro requise « ${req} » non déclarée`,
        nextAction: `Déclarer ${req}`,
      });
    }
  }

  return out;
}

/* ── Cohérence du ledger (inventory / status / identity) ──────────── */

export type LedgerSyncInput = {
  authLedger: AuthLedgerItem[];
  /** ids des maisons connues (identité) */
  knownHouseIds: ReadonlySet<string>;
  /** maisons réellement dotées d'une identité visuelle */
  housesWithIdentity: ReadonlySet<string>;
  /** ids des agents connus */
  knownAgentIds: ReadonlySet<string>;
  /** agents réellement dotés d'une identité visuelle */
  agentsWithIdentity: ReadonlySet<string>;
};

const REAL_SOURCES = new Set(["runtime", "api", "filesystem", "user_audit"]);

/**
 * validateLedgerSync — invariants de cohérence avant tout GREEN global :
 *  - chaque GREEN/LIVE du ledger a une preuve + source réelle
 *  - chaque provider non-vert a un blocker (sinon AMBER muet = faux honnête)
 *  - chaque maison connue a une identité ; idem agents
 */
export function validateLedgerSync(input: LedgerSyncInput): CofiatViolation[] {
  const out: CofiatViolation[] = [];

  for (const item of input.authLedger) {
    const green = item.status === "GREEN" || item.status === "LIVE";
    if (green) {
      const hasProof = !!item.proof?.trim();
      const realSource = REAL_SOURCES.has(item.statusSource);
      if (!hasProof || !realSource) {
        out.push({
          guard: "no-false-green",
          severity: "block",
          subject: item.id,
          message: `${item.status} non légitime (${!hasProof ? "preuve absente" : `source=${item.statusSource}`})`,
          nextAction: "Attacher preuve réelle ou rétrograder",
        });
      }
    } else if (!item.blocker?.trim() && item.status !== "OPTIONAL_COVERED") {
      out.push({
        guard: "auth-coverage",
        severity: "warn",
        subject: item.id,
        message: `Provider « ${item.id} » (${item.status}) sans blocker explicite`,
        nextAction: "Renseigner le blocker / nextAction",
      });
    }
  }

  for (const houseId of input.knownHouseIds) {
    if (!input.housesWithIdentity.has(houseId)) {
      out.push({
        guard: "inventory-sync",
        severity: "warn",
        subject: houseId,
        message: `Maison « ${houseId} » sans identité visuelle`,
        nextAction: "Ajouter l'identité dans cofiatWorldIdentity",
      });
    }
  }

  for (const agentId of input.knownAgentIds) {
    if (!input.agentsWithIdentity.has(agentId)) {
      out.push({
        guard: "inventory-sync",
        severity: "warn",
        subject: agentId,
        message: `Agent « ${agentId} » sans identité visuelle`,
        nextAction: "Ajouter l'identité de l'agent",
      });
    }
  }

  return out;
}
