/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — WORK CONTRACTS (registre des contrats)
 * ────────────────────────────────────────────────────────────────────
 * Chaque intervention significative se rattache à un contrat : il borne
 * les chemins autorisés/interdits, les registres à tenir à jour, les
 * validations et synchros requises, et la politique preuve/destruction.
 *
 * Le premier contrat (`WC-PROOF-LEDGER-GUARDIAN`) est AUTO-RÉFÉRENTIEL :
 * il décrit l'intervention qui transforme le Proof Ledger en gardien —
 * preuve vivante que le système se gouverne lui-même.
 *
 * Types-only imports → effacés à l'exécution (script-safe).
 * source_tag: COFIAT_WORK_CONTRACTS_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import type { CofiatWorkContract } from "@/types/cofiatProofLedger.types";

/** Contrat de l'intervention « Proof Ledger → gardien de chantier ». */
export const PROOF_LEDGER_GUARDIAN_CONTRACT: CofiatWorkContract = {
  id: "WC-PROOF-LEDGER-GUARDIAN",
  worker: "claude-code",
  scope: "proof-ledger",
  targetId: "proof_ledger",
  targetType: "module",
  intent:
    "Transformer le Proof Ledger décoratif en couche de gouvernance qui valide " +
    "chemins/entités/preuves/synchros et bloque faux-vert, hub parallèle, fichiers morts.",
  allowedPaths: [
    "src/types/cofiatProofLedger.types.ts",
    "src/config/cofiatCanonicalPaths.ts",
    "src/config/cofiatWorkContracts.ts",
    "src/utils/cofiatProofLedger.ts",
    "src/utils/cofiatPathGuard.ts",
    "src/utils/cofiatWorkGuard.ts",
    "src/utils/cofiatSyncGuard.ts",
    "src/utils/cofiatChangeManifest.ts",
    "src/hooks/useCofiatProofLedger.ts",
    "src/components/cofiatrading-world-control/ProofLedgerPanel.tsx",
    "src/components/cofiatrading-world-control/ProofLedgerBadge.tsx",
    "src/components/cofiatrading-world-control/WorkGuardStatus.tsx",
    "src/components/cofiatrading-world-control/WorldControl.tsx",
    "scripts/validate-proof-ledger.ts",
    "scripts/validate-cofiat-world.ts",
  ],
  forbiddenPaths: [
    // jamais de hub parallèle, jamais hors hub canonique
    "src/app/**/world-control-v2/**",
    "src/components/**/WorldControl2.tsx",
    "src/pages/**",
    ".cof-archive/**",
  ],
  requiredRegistries: [
    "canonical-paths",
    "work-contracts",
    "auth-proof-ledger",
    "world-identity",
  ],
  requiredValidations: [
    "validateCanonicalPaths",
    "validateNoFalseGreen",
    "validateWorldMapSafety",
    "validateNoDuplicateHub",
    "validateNoDeadFiles",
  ],
  requiredSyncTargets: ["proof-ledger", "console-ia", "notebook-alm"],
  proofRequired: true,
  greenAllowedOnlyWithProof: true,
  destructiveChangesAllowed: false,
  createdAt: "2026-05-31",
};

/**
 * Registre des contrats actifs. Un worker DOIT rattacher son change-manifest
 * à l'un de ces contrats (workContractId).
 */
export const cofiatWorkContracts: CofiatWorkContract[] = [
  PROOF_LEDGER_GUARDIAN_CONTRACT,
];

/** Récupère un contrat par id (ou undefined). */
export function getWorkContract(id: string): CofiatWorkContract | undefined {
  return cofiatWorkContracts.find((c) => c.id === id);
}
