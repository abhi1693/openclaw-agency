/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — CHANGE MANIFEST
 * ────────────────────────────────────────────────────────────────────
 * Construit + évalue le manifest d'un changement (ce qui a été touché,
 * synchros, validations, preuve) et calcule son statut final déterministe.
 * Fonctions PURES.
 *
 * Précédence du statut final (la pire l'emporte) :
 *   BLOCKED > NEEDS_PROOF > NEEDS_SYNC > APPROVED_WITH_WARNINGS > APPROVED
 *
 * source_tag: COFIAT_CHANGE_MANIFEST_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import type {
  CofiatChangeManifest,
  CofiatManifestFinalStatus,
  CofiatWorkerRole,
  CofiatTouchedFile,
  CofiatManifestSyncTarget,
  CofiatManifestValidation,
  CofiatManifestProof,
  CofiatAffectedEntity,
} from "@/types/cofiatProofLedger.types";

/** Entrée minimale pour construire un manifest. */
export type BuildManifestInput = {
  id: string;
  worker: CofiatWorkerRole;
  workContractId: string;
  summary: string;
  touchedFiles: CofiatTouchedFile[];
  affectedEntities?: CofiatAffectedEntity[];
  syncTargets?: CofiatManifestSyncTarget[];
  validations?: CofiatManifestValidation[];
  proof: CofiatManifestProof;
  createdAt?: string;
};

/**
 * computeManifestFinalStatus — verdict déterministe à partir des validations,
 * synchros et preuve. Ne ment jamais : un fail/blocked/proof-missing dégrade.
 */
export function computeManifestFinalStatus(
  m: Pick<CofiatChangeManifest, "validations" | "syncTargets" | "proof">
): CofiatManifestFinalStatus {
  const hasFail = m.validations.some((v) => v.status === "fail");
  const hasWarn = m.validations.some((v) => v.status === "warn");
  const syncBlocked = m.syncTargets.some((s) => s.status === "blocked");
  const syncPending = m.syncTargets.some((s) => s.status === "pending");
  const proofMissing = m.proof.status === "missing";

  if (hasFail || syncBlocked) return "BLOCKED";
  if (proofMissing) return "NEEDS_PROOF";
  if (syncPending) return "NEEDS_SYNC";
  if (hasWarn) return "APPROVED_WITH_WARNINGS";
  return "APPROVED";
}

/** buildChangeManifest — assemble un manifest complet + calcule son statut. */
export function buildChangeManifest(input: BuildManifestInput): CofiatChangeManifest {
  const base = {
    id: input.id,
    worker: input.worker,
    workContractId: input.workContractId,
    summary: input.summary,
    touchedFiles: input.touchedFiles,
    affectedEntities: input.affectedEntities ?? [],
    syncTargets: input.syncTargets ?? [],
    validations: input.validations ?? [],
    proof: input.proof,
    createdAt: input.createdAt,
  };
  return {
    ...base,
    finalStatus: computeManifestFinalStatus(base),
  };
}

/** Récap chiffré d'un manifest (UI). */
export type ManifestSummary = {
  files: number;
  created: number;
  modified: number;
  deleted: number;
  moved: number;
  entities: number;
  syncSynced: number;
  syncPending: number;
  syncBlocked: number;
  validationsPass: number;
  validationsWarn: number;
  validationsFail: number;
};

export function summarizeManifest(m: CofiatChangeManifest): ManifestSummary {
  const op = (k: CofiatTouchedFile["operation"]) =>
    m.touchedFiles.filter((f) => f.operation === k).length;
  return {
    files: m.touchedFiles.length,
    created: op("created"),
    modified: op("modified"),
    deleted: op("deleted"),
    moved: op("moved"),
    entities: m.affectedEntities.length,
    syncSynced: m.syncTargets.filter((s) => s.status === "synced").length,
    syncPending: m.syncTargets.filter((s) => s.status === "pending").length,
    syncBlocked: m.syncTargets.filter((s) => s.status === "blocked").length,
    validationsPass: m.validations.filter((v) => v.status === "pass").length,
    validationsWarn: m.validations.filter((v) => v.status === "warn").length,
    validationsFail: m.validations.filter((v) => v.status === "fail").length,
  };
}
