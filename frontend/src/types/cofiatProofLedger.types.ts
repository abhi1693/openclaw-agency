/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — PROOF LEDGER / WORK GUARD — TYPES SSOT
 * ────────────────────────────────────────────────────────────────────
 * Modèle de données du « gardien de chantier ». Le Proof Ledger cesse
 * d'être un bâtiment décoratif : il devient la couche de gouvernance qui
 * valide où/par qui/sur quoi le travail est fait, avec quelle preuve, et
 * qui BLOQUE le faux-vert, les hubs parallèles, les fichiers hors place,
 * les entités hardcodées, les fichiers morts et les désyncs.
 *
 * Ce fichier est UNIQUEMENT des types (zéro runtime) → entièrement effacé
 * à l'exécution. Il réutilise les types canoniques OperationalStatus /
 * StatusSource (src/types/cofiatWorld.types.ts) — AUCUN enum concurrent.
 *
 * source_tag: COFIAT_PROOF_LEDGER_TYPES_SSOT_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import type { StatusSource } from "@/types/cofiatWorld.types";

/* ── 1. WORK CONTRACT — qui a le droit de faire quoi, où ─────────── */

/** Rôle du worker qui intervient sur le World-Control. */
export type CofiatWorkerRole =
  | "claude-code"
  | "console-ia"
  | "notebook-alm"
  | "map-designer"
  | "frontend-worker"
  | "backend-worker"
  | "asset-worker"
  | "mission-worker"
  | "auth-worker"
  | "proof-auditor"
  | "operator";

/** Domaine fonctionnel touché par une intervention. */
export type CofiatWorkScope =
  | "world-map"
  | "house"
  | "agent"
  | "mission"
  | "asset"
  | "service"
  | "auth-provider"
  | "console-ia"
  | "notebook-alm"
  | "proof-ledger"
  | "layout"
  | "visual-identity"
  | "runtime"
  | "inventory"
  | "status-matrix";

/** Nature de la cible d'un contrat de travail. */
export type CofiatTargetType =
  | "hub"
  | "house"
  | "agent"
  | "mission"
  | "asset"
  | "service"
  | "provider"
  | "module"
  | "file"
  | "config";

/** Registres/SSOT qu'un scope peut exiger d'être à jour. */
export type CofiatRegistryId =
  | "world-identity"
  | "world-status"
  | "auth-proof-ledger"
  | "inventory-matrix"
  | "console-ia-adapter"
  | "canonical-paths"
  | "work-contracts"
  | "houses-registry"
  | "angel-roster";

/** Cibles de synchronisation possibles d'un changement. */
export type CofiatSyncTarget =
  | "world-config"
  | "visual-identity"
  | "inventory-matrix"
  | "status-matrix"
  | "mission-engine"
  | "console-ia"
  | "notebook-alm"
  | "proof-ledger"
  | "map-layout";

/**
 * Contrat de travail : chaque intervention significative DOIT pouvoir s'y
 * rattacher. Il borne les chemins autorisés/interdits, les validations et
 * synchronisations requises, et la politique de preuve/destruction.
 */
export type CofiatWorkContract = {
  id: string;
  worker: CofiatWorkerRole;
  scope: CofiatWorkScope;
  targetId: string;
  targetType: CofiatTargetType;

  intent: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  requiredRegistries: CofiatRegistryId[];
  requiredValidations: string[];
  requiredSyncTargets: CofiatSyncTarget[];
  proofRequired: boolean;
  greenAllowedOnlyWithProof: boolean;
  destructiveChangesAllowed: boolean;
  createdAt: string;
};

/* ── 2. CHANGE MANIFEST — ce qui a réellement été modifié ────────── */

export type CofiatFileOperation = "created" | "modified" | "deleted" | "moved";

export type CofiatTouchedFile = {
  path: string;
  operation: CofiatFileOperation;
  reason: string;
  ownerModule: string;
  linkedHouseId?: string;
  linkedAgentId?: string;
  linkedMissionId?: string;
};

export type CofiatAffectedEntityType =
  | "house"
  | "agent"
  | "mission"
  | "asset"
  | "service"
  | "provider"
  | "module"
  | "layout"
  | "console"
  | "proof";

export type CofiatAffectedEntity = {
  entityType: CofiatAffectedEntityType;
  entityId: string;
  change: string;
};

export type CofiatSyncStatus = "synced" | "pending" | "blocked";

export type CofiatManifestSyncTarget = {
  target: CofiatSyncTarget;
  status: CofiatSyncStatus;
  reason?: string;
};

export type CofiatValidationStatus = "pass" | "warn" | "fail";

export type CofiatManifestValidation = {
  name: string;
  status: CofiatValidationStatus;
  message?: string;
};

export type CofiatProofStatus = "provided" | "missing" | "not-required";

export type CofiatManifestProof = {
  status: CofiatProofStatus;
  source?: "runtime" | "api" | "filesystem" | "user-audit" | "config" | "mock";
  description?: string;
};

export type CofiatManifestFinalStatus =
  | "APPROVED"
  | "APPROVED_WITH_WARNINGS"
  | "BLOCKED"
  | "NEEDS_SYNC"
  | "NEEDS_PROOF";

export type CofiatChangeManifest = {
  id: string;
  worker: CofiatWorkerRole;
  workContractId: string;
  summary: string;

  touchedFiles: CofiatTouchedFile[];
  affectedEntities: CofiatAffectedEntity[];
  syncTargets: CofiatManifestSyncTarget[];
  validations: CofiatManifestValidation[];
  proof: CofiatManifestProof;

  finalStatus: CofiatManifestFinalStatus;
  createdAt?: string;
};

/* ── 3. GUARDS — verdicts normalisés ─────────────────────────────── */

/** Identité d'un guard (clé stable pour l'UI + la table d'audit). */
export type CofiatGuardId =
  | "canonical-path"
  | "no-new-hub"
  | "no-hardcoded-entity"
  | "no-false-green"
  | "inventory-sync"
  | "notebook-alm-sync"
  | "console-ia-log"
  | "map-safety"
  | "mission-animation"
  | "auth-coverage"
  | "dead-file";

export type CofiatGuardSeverity = "info" | "warn" | "block";

/** Une violation détectée par un guard (toujours actionnable). */
export type CofiatViolation = {
  guard: CofiatGuardId;
  severity: CofiatGuardSeverity;
  message: string;
  /** entité/fichier concerné (path, houseId, agentId, providerId…) */
  subject?: string;
  nextAction: string;
};

/** Verdict d'un guard unitaire. */
export type CofiatGuardVerdict = {
  guard: CofiatGuardId;
  status: CofiatValidationStatus; // pass | warn | fail
  /** ce que le guard protège (affiché dans la table d'audit) */
  protects: string;
  /** comportement en cas de violation (affiché dans la table d'audit) */
  onViolation: string;
  violations: CofiatViolation[];
  /** true si le guard valide réellement (≠ placeholder décoratif) */
  active: boolean;
  source: StatusSource;
};

/** Résultat global de l'audit Proof Ledger. */
export type CofiatProofLedgerResult = {
  /** verdict de chantier consolidé */
  finalStatus: CofiatManifestFinalStatus;
  guards: CofiatGuardVerdict[];
  violations: CofiatViolation[];
  blockingCount: number;
  warningCount: number;
  /** récap auth (verdict no-false-green sur le ledger) */
  authGreen: number;
  authAmber: number;
  authViolations: number;
  /** lignes de log formatées pour la console.IA */
  log: string[];
  /** politique worker exposée */
  policy: CofiatWorkerPolicy;
  checkedAtLabel: string;
};

/* ── 4. POLICY — règles pour tous les workers ────────────────────── */

export type CofiatWorkerPolicy = {
  noNewHub: boolean;
  noHardcodedHouses: boolean;
  noHardcodedAgents: boolean;
  noFakeGreen: boolean;
  noFreeAnimation: boolean;
  noDeadFiles: boolean;
  noUnregisteredAssets: boolean;
  noUnownedServices: boolean;
  noWrongFolderWrites: boolean;
  requireChangeManifest: boolean;
  requireSyncTargets: boolean;
  requireProofForGreen: boolean;
  requireNotebookAlmSync: boolean;
  requireConsoleIaLog: boolean;
};

/* ── 5. MAP SAFETY — invariants de la carte ──────────────────────── */

export type CofiatMapSafetyReport = {
  status: CofiatValidationStatus;
  housesExpected: number;
  housesSeen: number;
  agentsExpected: number;
  agentsSeen: number;
  proofLedgerVisible: boolean;
  notebookAlmVisible: boolean;
  consoleIaConnected: boolean;
  collisions: number;
  orphanRoutes: number;
  freeAnimations: number;
  violations: CofiatViolation[];
};

/* ── 6. CHEMINS CANONIQUES — résultat d'un contrôle de chemin ────── */

export type CofiatPathCheck = {
  valid: boolean;
  /** scope canonique détecté (hub/config/types/utils/hooks/scripts/api/page) */
  detectedScope?: string;
  reason?: string;
  suggestedCanonicalPath?: string;
};
