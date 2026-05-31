/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — PROOF LEDGER (AGRÉGATEUR / GARDIEN)
 * ────────────────────────────────────────────────────────────────────
 * Combine TOUS les guards en un verdict de chantier unique + produit les
 * lignes de log console.IA + le rapport map-safety. C'est le « cerveau »
 * du gardien, branché dans le hook + le panel + les scripts.
 *
 * NO-FALSE-GREEN APPLIQUÉ AUX GUARDS EUX-MÊMES : un guard qui ne peut pas
 * s'exécuter faute de donnée (ex. scan disque dans le navigateur) est marqué
 * `active:false` et N'EST JAMAIS compté comme un pass vert — il pousse le
 * verdict global vers APPROVED_WITH_WARNINGS avec « exécuter le script CLI ».
 *
 * source_tag: COFIAT_PROOF_LEDGER_AGGREGATOR_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import { cofiatAuthProofLedger } from "@/config/cofiatAuthProofLedger";
import { getConsoleIaAdapterState } from "@/config/cofiatConsoleIaAdapter";
import { HOUSE_DISTRICT, HOUSE_META } from "@/config/cofiatWorldIdentity";
import { COFIAT_WORKER_POLICY } from "@/config/cofiatCanonicalPaths";
import { enforceNoFalseGreenAll, computeCanonicalTotals } from "@/utils/cofiatNoFalseGreenGuard";
import { validateNoDuplicateHub } from "@/utils/cofiatPathGuard";
import {
  validateWorkContract,
  validateChangeManifest,
  validateNoDeadFiles,
  validateNoHardcodedEntities,
  validateNoFreeAnimation,
  validateEntityOwnership,
  type SourceFile,
  type AnimatedThing,
} from "@/utils/cofiatWorkGuard";
import { validateLedgerSync } from "@/utils/cofiatSyncGuard";
import type { AuthLedgerItem } from "@/types/cofiatWorld.types";
import type {
  CofiatGuardId,
  CofiatGuardVerdict,
  CofiatViolation,
  CofiatProofLedgerResult,
  CofiatManifestFinalStatus,
  CofiatWorkContract,
  CofiatChangeManifest,
  CofiatMapSafetyReport,
  CofiatValidationStatus,
  CofiatSyncStatus,
} from "@/types/cofiatProofLedger.types";

/* ── Registre des 11 guards (table d'audit) ──────────────────────── */

export const PROOF_LEDGER_GUARDS: Record<
  CofiatGuardId,
  { label: string; protects: string; onViolation: string; requiresFs: boolean }
> = {
  "canonical-path": {
    label: "Canonical Path Guard",
    protects: "Tout fichier au bon endroit (chemins canoniques)",
    onViolation: "BLOCK écriture hors canon + suggère le bon dossier",
    requiresFs: false,
  },
  "no-new-hub": {
    label: "No New Hub Guard",
    protects: "Un seul hub/map — pas de WorldControl/WorldMapLiving dupliqué",
    onViolation: "BLOCK + pointe le doublon à fusionner",
    requiresFs: true,
  },
  "no-hardcoded-entity": {
    label: "No Hardcoded Entity Guard",
    protects: "Maisons/agents définis en config, jamais inline JSX",
    onViolation: "WARN + déplacer la donnée vers src/config",
    requiresFs: true,
  },
  "no-false-green": {
    label: "No False Green Guard",
    protects: "Aucun GREEN/LIVE sans preuve réelle + source traçable",
    onViolation: "BLOCK + rétrograde / exige une preuve",
    requiresFs: false,
  },
  "inventory-sync": {
    label: "Inventory Sync Guard",
    protects: "Synchro config/identity/inventory/status + maisons/agents identifiés",
    onViolation: "WARN/BLOCK selon synchro pending/blocked",
    requiresFs: false,
  },
  "notebook-alm-sync": {
    label: "Notebook ALM Sync Guard",
    protects: "Décisions du chantier répercutées dans Notebook ALM",
    onViolation: "WARN tant que le carnet n'est pas branché live (AMBER honnête)",
    requiresFs: false,
  },
  "console-ia-log": {
    label: "console.IA Log Guard",
    protects: "Toute action du gardien est journalisée (pas de log fantôme)",
    onViolation: "WARN si aucun log émis",
    requiresFs: false,
  },
  "map-safety": {
    label: "Map Safety Guard",
    protects: "15 maisons / 38 agents / 0 collision / Proof Ledger+ALM visibles",
    onViolation: "WARN/BLOCK selon gravité (map cassée)",
    requiresFs: false,
  },
  "mission-animation": {
    label: "Mission Animation Guard",
    protects: "Aucune animation/véhicule sans mission rattachée",
    onViolation: "WARN + rattacher une mission ou retirer",
    requiresFs: false,
  },
  "auth-coverage": {
    label: "Auth Coverage Guard",
    protects: "Chaque provider a preuve OU blocker + fallback connu",
    onViolation: "WARN si provider muet (ni preuve ni blocker)",
    requiresFs: false,
  },
  "dead-file": {
    label: "Dead File Guard",
    protects: "Tout fichier créé est importé/utilisé",
    onViolation: "WARN + importer ou supprimer le fichier mort",
    requiresFs: true,
  },
};

/* ── Faits map-safety ────────────────────────────────────────────── */

export type MapSafetyFacts = {
  housesExpected: number;
  housesSeen: number;
  agentsExpected: number;
  agentsSeen: number | null; // null = inconnu (non fourni) → guard partiel
  proofLedgerVisible: boolean;
  notebookAlmVisible: boolean;
  consoleIaConnected: boolean;
  collisions: number;
  orphanRoutes: number;
  freeAnimations: number;
};

/** validateMapSafety — invariants de la carte. */
export function validateMapSafety(facts: MapSafetyFacts): CofiatMapSafetyReport {
  const violations: CofiatViolation[] = [];
  const push = (severity: CofiatViolation["severity"], message: string, nextAction: string, subject?: string) =>
    violations.push({ guard: "map-safety", severity, message, nextAction, subject });

  if (facts.housesSeen < facts.housesExpected) {
    push("block", `Maisons manquantes : ${facts.housesSeen}/${facts.housesExpected}`, "Restaurer les maisons canon dans l'identité/registry");
  }
  if (facts.agentsSeen !== null && facts.agentsSeen < facts.agentsExpected) {
    push("warn", `Agents référencés : ${facts.agentsSeen}/${facts.agentsExpected}`, "Compléter les agents canon");
  }
  if (!facts.proofLedgerVisible) push("warn", "Proof Ledger absent de la map", "Garder le module proof_ledger visible");
  if (!facts.notebookAlmVisible) push("warn", "Notebook ALM absent de la map", "Garder le module notebook_alm visible");
  if (!facts.consoleIaConnected) push("warn", "console.IA non connectée", "Brancher l'overlay console.IA");
  if (facts.collisions > 0) push("block", `${facts.collisions} collision(s) de bâtiments`, "Réespacer les bâtiments");
  if (facts.orphanRoutes > 0) push("warn", `${facts.orphanRoutes} route(s) orpheline(s)`, "Relier ou retirer les routes");
  if (facts.freeAnimations > 0) push("warn", `${facts.freeAnimations} animation(s) sans mission`, "Rattacher une mission");

  const hasBlock = violations.some((v) => v.severity === "block");
  const status: CofiatValidationStatus = hasBlock ? "fail" : violations.length ? "warn" : "pass";

  return {
    status,
    housesExpected: facts.housesExpected,
    housesSeen: facts.housesSeen,
    agentsExpected: facts.agentsExpected,
    agentsSeen: facts.agentsSeen ?? 0,
    proofLedgerVisible: facts.proofLedgerVisible,
    notebookAlmVisible: facts.notebookAlmVisible,
    consoleIaConnected: facts.consoleIaConnected,
    collisions: facts.collisions,
    orphanRoutes: facts.orphanRoutes,
    freeAnimations: facts.freeAnimations,
    violations,
  };
}

/* ── Entrée de l'audit global ────────────────────────────────────── */

export type ProofLedgerAuditInput = {
  authLedger?: AuthLedgerItem[];
  contracts?: CofiatWorkContract[];
  manifests?: CofiatChangeManifest[];
  /** chemins repo-relatifs connus (no-new-hub) — fs uniquement */
  repoPaths?: string[];
  /** basenames référencés par un import (dead-file) — fs uniquement */
  referencedBasenames?: ReadonlySet<string>;
  /** fichiers source à scanner (no-hardcoded-entity) — fs uniquement */
  sourceFiles?: SourceFile[];
  /** animations/véhicules à vérifier (mission-animation) */
  animatedThings?: AnimatedThing[];
  /** faits map-safety (snapshot) — partiel autorisé */
  mapFacts?: Partial<MapSafetyFacts>;
  /** agents connus (snapshot) pour ownership + identité */
  knownAgentIds?: ReadonlySet<string>;
  agentsWithIdentity?: ReadonlySet<string>;
  /** synchro Notebook ALM réelle (sinon AMBER honnête par défaut) */
  notebookAlmSync?: { status: CofiatSyncStatus; reason?: string };
  checkedAtLabel?: string;
};

function verdict(
  guard: CofiatGuardId,
  active: boolean,
  violations: CofiatViolation[],
  notExecutedNote?: string
): CofiatGuardVerdict {
  const meta = PROOF_LEDGER_GUARDS[guard];
  const all = [...violations];
  if (!active && notExecutedNote) {
    all.push({ guard, severity: "info", message: notExecutedNote, nextAction: "Lancer scripts/validate-proof-ledger.ts (contrôle fs)" });
  }
  const status: CofiatValidationStatus = all.some((v) => v.severity === "block")
    ? "fail"
    : all.some((v) => v.severity === "warn" || v.severity === "info")
    ? "warn"
    : "pass";
  return {
    guard,
    status,
    protects: meta.protects,
    onViolation: meta.onViolation,
    violations: all,
    active,
    source: active ? "config" : "unknown",
  };
}

/**
 * runProofLedgerAudit — exécute tous les guards avec la donnée disponible,
 * produit un verdict de chantier + le log console.IA. Honnête : les guards
 * sans donnée sont `active:false` (jamais un faux pass vert).
 */
export function runProofLedgerAudit(input: ProofLedgerAuditInput = {}): CofiatProofLedgerResult {
  const authLedger = enforceNoFalseGreenAll(input.authLedger ?? cofiatAuthProofLedger);
  const contracts = input.contracts ?? [];
  const manifests = input.manifests ?? [];
  const adapter = getConsoleIaAdapterState();

  const knownHouseIds = new Set(Object.keys(HOUSE_DISTRICT));
  const housesWithIdentity = new Set(Object.keys(HOUSE_META));
  const knownAgentIds = input.knownAgentIds ?? new Set<string>();
  const agentsWithIdentity = input.agentsWithIdentity ?? knownAgentIds;

  const guards: CofiatGuardVerdict[] = [];

  /* canonical-path — sur contrats + manifests (toujours actif si données) */
  {
    const v: CofiatViolation[] = [];
    for (const c of contracts) v.push(...validateWorkContract(c));
    for (const m of manifests) {
      const c = contracts.find((x) => x.id === m.workContractId);
      v.push(...validateChangeManifest(m, c));
    }
    const active = contracts.length > 0 || manifests.length > 0;
    guards.push(verdict("canonical-path", active, v.filter((x) => x.guard === "canonical-path"),
      active ? undefined : "Aucun contrat/manifest fourni"));
    // dead-file warnings issus des manifests (traçabilité) regroupés plus bas
  }

  /* no-new-hub — nécessite la liste des chemins du repo (fs) */
  {
    const has = !!input.repoPaths?.length;
    const v = has ? validateNoDuplicateHub(input.repoPaths as string[]) : [];
    guards.push(verdict("no-new-hub", has, v, has ? undefined : "Scan disque requis (liste des chemins)"));
  }

  /* no-hardcoded-entity — scan source (fs) + ownership des manifests */
  {
    const vOwn: CofiatViolation[] = [];
    for (const m of manifests) {
      vOwn.push(...validateEntityOwnership({ manifest: m, knownHouseIds, knownAgentIds }));
    }
    const hasSrc = !!input.sourceFiles?.length;
    const vSrc = hasSrc ? validateNoHardcodedEntities(input.sourceFiles as SourceFile[]) : [];
    const active = hasSrc || manifests.length > 0;
    guards.push(verdict("no-hardcoded-entity", active, [...vOwn, ...vSrc],
      hasSrc ? undefined : "Scan source requis pour le contrôle JSX inline"));
  }

  /* no-false-green — ledger d'auth (toujours actif) */
  {
    const v: CofiatViolation[] = [];
    for (const item of authLedger) {
      const green = item.status === "GREEN" || item.status === "LIVE";
      if (green && !item.proof?.trim()) {
        v.push({ guard: "no-false-green", severity: "block", subject: item.id, message: `${item.status} sans preuve`, nextAction: "Attacher une preuve réelle ou rétrograder" });
      }
    }
    guards.push(verdict("no-false-green", true, v));
  }

  /* inventory-sync — cohérence ledger/identité (toujours actif) */
  {
    const v = validateLedgerSync({ authLedger, knownHouseIds, housesWithIdentity, knownAgentIds, agentsWithIdentity });
    guards.push(verdict("inventory-sync", true, v.filter((x) => x.guard === "inventory-sync")));
    // auth-coverage récupère ses propres violations
    guards.push(verdict("auth-coverage", true, v.filter((x) => x.guard === "auth-coverage")));
  }

  /* notebook-alm-sync — AMBER honnête tant que non branché live */
  {
    const sync = input.notebookAlmSync ?? { status: "pending" as CofiatSyncStatus, reason: "Notebook ALM non branché live (AMBER) — décisions non synchronisées" };
    const v: CofiatViolation[] =
      sync.status === "blocked"
        ? [{ guard: "notebook-alm-sync", severity: "block", subject: "notebook_alm", message: sync.reason ?? "synchro bloquée", nextAction: "Débloquer la synchro Notebook ALM" }]
        : sync.status === "pending"
        ? [{ guard: "notebook-alm-sync", severity: "warn", subject: "notebook_alm", message: sync.reason ?? "synchro en attente", nextAction: "Brancher Notebook ALM live (décisions ↔ ledger)" }]
        : [];
    guards.push(verdict("notebook-alm-sync", true, v));
  }

  /* console-ia-log — l'audit produit toujours des logs */
  {
    guards.push(verdict("console-ia-log", true, [])); // log non vide garanti plus bas
  }

  /* map-safety — depuis snapshot (partiel autorisé) */
  {
    const housesSeen = input.mapFacts?.housesSeen ?? knownHouseIds.size;
    const facts: MapSafetyFacts = {
      housesExpected: input.mapFacts?.housesExpected ?? 15,
      housesSeen,
      agentsExpected: input.mapFacts?.agentsExpected ?? 38,
      agentsSeen: input.mapFacts?.agentsSeen ?? null,
      proofLedgerVisible: input.mapFacts?.proofLedgerVisible ?? true,
      notebookAlmVisible: input.mapFacts?.notebookAlmVisible ?? true,
      consoleIaConnected: input.mapFacts?.consoleIaConnected ?? true,
      collisions: input.mapFacts?.collisions ?? 0,
      orphanRoutes: input.mapFacts?.orphanRoutes ?? 0,
      freeAnimations: input.mapFacts?.freeAnimations ?? 0,
    };
    const report = validateMapSafety(facts);
    const active = !!input.mapFacts;
    guards.push(verdict("map-safety", active, report.violations,
      active ? undefined : "Snapshot map requis pour les compteurs live"));
  }

  /* mission-animation */
  {
    const has = !!input.animatedThings?.length;
    const v = has ? validateNoFreeAnimation(input.animatedThings as AnimatedThing[]) : [];
    guards.push(verdict("mission-animation", has, v, has ? undefined : "Descripteurs d'animation non fournis"));
  }

  /* dead-file — fs */
  {
    const createdFiles = manifests.flatMap((m) => m.touchedFiles.filter((f) => f.operation === "created").map((f) => f.path));
    const has = !!input.referencedBasenames && createdFiles.length > 0;
    const v = has
      ? validateNoDeadFiles({ createdFiles, referencedBasenames: input.referencedBasenames as ReadonlySet<string> })
      : [];
    guards.push(verdict("dead-file", has, v, has ? undefined : "Scan d'imports requis (script CLI)"));
  }

  /* ── consolidation ─────────────────────────────────────────────── */
  const violations = guards.flatMap((g) => g.violations);
  const blockingCount = violations.filter((v) => v.severity === "block").length;
  const warningCount = violations.filter((v) => v.severity === "warn").length;
  const anyInactive = guards.some((g) => !g.active);

  const totals = computeCanonicalTotals(authLedger);
  const authViolations = violations.filter((v) => v.guard === "no-false-green").length;

  let finalStatus: CofiatManifestFinalStatus;
  const proofMissing = manifests.some((m) => m.proof.status === "missing");
  const syncBlocked = manifests.some((m) => m.syncTargets.some((s) => s.status === "blocked"));
  const syncPending = manifests.some((m) => m.syncTargets.some((s) => s.status === "pending"));
  if (blockingCount > 0 || syncBlocked) finalStatus = "BLOCKED";
  else if (proofMissing) finalStatus = "NEEDS_PROOF";
  else if (syncPending) finalStatus = "NEEDS_SYNC";
  else if (warningCount > 0 || anyInactive) finalStatus = "APPROVED_WITH_WARNINGS";
  else finalStatus = "APPROVED";

  const checkedAtLabel = input.checkedAtLabel ?? "audit client (statique)";

  const result: CofiatProofLedgerResult = {
    finalStatus,
    guards,
    violations,
    blockingCount,
    warningCount,
    authGreen: totals.green,
    authAmber: totals.amber,
    authViolations,
    log: [],
    policy: COFIAT_WORKER_POLICY,
    checkedAtLabel,
  };
  result.log = buildProofLedgerLog(result, adapter.provider, adapter.status);
  return result;
}

/* ── Log console.IA (format canonique demandé) ───────────────────── */

/** Une ligne de log au format `[hh:mm:ss] EVENT k=v …` (timestamp passé en arg). */
export function formatLogLine(time: string, event: string, kv: Record<string, string | number> = {}): string {
  const tail = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join(" ");
  return `[${time}] ${event}${tail ? ` ${tail}` : ""}`;
}

/**
 * buildProofLedgerLog — lignes de log RÉELLES dérivées du verdict (jamais
 * de faux APPROVED/GREEN). Le timestamp est volontairement statique ("--:--:--")
 * côté pur : l'appelant (hook) peut réécrire l'horodatage live.
 */
export function buildProofLedgerLog(
  result: CofiatProofLedgerResult,
  consoleProvider?: string,
  consoleStatus?: string
): string[] {
  const t = "--:--:--";
  const lines: string[] = [];
  lines.push(formatLogLine(t, "PROOF_LEDGER_BOOT", { guard: "active", scope: "world-control" }));
  for (const g of result.guards) {
    const ev = g.status === "fail" ? "GUARD_FAIL" : g.status === "warn" ? (g.active ? "GUARD_WARN" : "GUARD_PENDING_CLI") : "GUARD_OK";
    lines.push(formatLogLine(t, ev, { guard: g.guard, violations: g.violations.length, active: String(g.active) }));
  }
  lines.push(formatLogLine(t, "NO_FALSE_GREEN", { green: result.authGreen, amber: result.authAmber, violations: result.authViolations }));
  if (consoleProvider) lines.push(formatLogLine(t, "CONSOLE_IA_ADAPTER", { provider: consoleProvider, status: consoleStatus ?? "?" }));
  lines.push(formatLogLine(t, `WORK_VERDICT_${result.finalStatus}`, { blocking: result.blockingCount, warnings: result.warningCount }));
  return lines;
}
