/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — WORK GUARD
 * ────────────────────────────────────────────────────────────────────
 * Le cœur du gardien : valide contrats, manifests, ownership des entités,
 * fichiers morts, entités hardcodées et animations gratuites.
 *
 * Toutes les fonctions sont PURES et à entrées EXPLICITES — aucune n'invente
 * de donnée. Si une donnée manque, l'appelant (aggregator/script) marque le
 * guard `active:false` plutôt que de simuler un pass (no-false-green).
 *
 * source_tag: COFIAT_WORK_GUARD_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import { validateWriteScope, validateCofiatPath } from "@/utils/cofiatPathGuard";
import type {
  CofiatWorkContract,
  CofiatChangeManifest,
  CofiatViolation,
} from "@/types/cofiatProofLedger.types";

/* ── 1. Cohérence d'un contrat ───────────────────────────────────── */

/** validateWorkContract — le contrat lui-même est-il sain ? */
export function validateWorkContract(contract: CofiatWorkContract): CofiatViolation[] {
  const out: CofiatViolation[] = [];

  if (!contract.id || !contract.intent.trim()) {
    out.push({
      guard: "canonical-path",
      severity: "block",
      subject: contract.id || "(sans id)",
      message: "Contrat invalide : id/intent manquant",
      nextAction: "Renseigner id + intent",
    });
  }

  for (const p of contract.allowedPaths) {
    const chk = validateCofiatPath(p);
    if (!chk.valid) {
      out.push({
        guard: "canonical-path",
        severity: "warn",
        subject: p,
        message: `allowedPath hors canonique dans ${contract.id} : ${chk.reason ?? p}`,
        nextAction: chk.suggestedCanonicalPath
          ? `Corriger vers ${chk.suggestedCanonicalPath}`
          : "Corriger l'allowedPath",
      });
    }
  }

  if (contract.greenAllowedOnlyWithProof && !contract.proofRequired) {
    out.push({
      guard: "no-false-green",
      severity: "warn",
      subject: contract.id,
      message: "greenAllowedOnlyWithProof=true mais proofRequired=false (incohérent)",
      nextAction: "Mettre proofRequired=true",
    });
  }

  return out;
}

/* ── 2. Cohérence d'un manifest vs son contrat ───────────────────── */

/**
 * validateChangeManifest — chaque fichier touché respecte-t-il le contrat,
 * la preuve est-elle cohérente, le statut final est-il honnête ?
 */
export function validateChangeManifest(
  manifest: CofiatChangeManifest,
  contract?: CofiatWorkContract
): CofiatViolation[] {
  const out: CofiatViolation[] = [];

  // 2.1 — chaque fichier touché doit être canonique (+ dans le contrat)
  for (const f of manifest.touchedFiles) {
    if (contract) {
      const v = validateWriteScope(contract, f.path);
      if (v) out.push(v);
    } else {
      const chk = validateCofiatPath(f.path);
      if (!chk.valid) {
        out.push({
          guard: "canonical-path",
          severity: "block",
          subject: f.path,
          message: chk.reason ?? "Fichier hors canonique",
          nextAction: chk.suggestedCanonicalPath
            ? `Déplacer vers ${chk.suggestedCanonicalPath}`
            : "Déplacer vers un dossier canonique",
        });
      }
    }
    if (!f.reason?.trim() || !f.ownerModule?.trim()) {
      out.push({
        guard: "dead-file",
        severity: "warn",
        subject: f.path,
        message: "Fichier touché sans reason/ownerModule (traçabilité incomplète)",
        nextAction: "Renseigner reason + ownerModule",
      });
    }
  }

  // 2.2 — destruction non autorisée
  if (contract && !contract.destructiveChangesAllowed) {
    for (const f of manifest.touchedFiles) {
      if (f.operation === "deleted") {
        out.push({
          guard: "canonical-path",
          severity: "block",
          subject: f.path,
          message: `Suppression non autorisée par le contrat ${contract.id}`,
          nextAction: "Autoriser destructiveChanges ou ne pas supprimer",
        });
      }
    }
  }

  // 2.3 — preuve requise mais absente
  if (contract?.proofRequired && manifest.proof.status === "missing") {
    out.push({
      guard: "no-false-green",
      severity: "block",
      subject: manifest.id,
      message: `Contrat ${contract.id} exige une preuve — manifest.proof=missing`,
      nextAction: "Attacher une preuve réelle (runtime/api/filesystem)",
    });
  }

  // 2.4 — synchros requises absentes du manifest
  if (contract) {
    const declared = new Set(manifest.syncTargets.map((s) => s.target));
    for (const req of contract.requiredSyncTargets) {
      if (!declared.has(req)) {
        out.push({
          guard: "inventory-sync",
          severity: "warn",
          subject: req,
          message: `Cible de synchro requise « ${req} » absente du manifest`,
          nextAction: `Déclarer la synchro ${req} (synced/pending/blocked)`,
        });
      }
    }
  }

  return out;
}

/* ── 3. Ownership des entités ────────────────────────────────────── */

export type EntityOwnershipInput = {
  manifest: CofiatChangeManifest;
  knownHouseIds: ReadonlySet<string>;
  knownAgentIds: ReadonlySet<string>;
};

/** validateEntityOwnership — toute maison/agent référencé existe-t-il ? */
export function validateEntityOwnership(input: EntityOwnershipInput): CofiatViolation[] {
  const out: CofiatViolation[] = [];
  for (const e of input.manifest.affectedEntities) {
    if (e.entityType === "house" && !input.knownHouseIds.has(e.entityId)) {
      out.push({
        guard: "no-hardcoded-entity",
        severity: "block",
        subject: e.entityId,
        message: `Maison « ${e.entityId} » inconnue du registry/identité`,
        nextAction: "Déclarer la maison dans cofiatWorldIdentity + registry",
      });
    }
    if (e.entityType === "agent" && !input.knownAgentIds.has(e.entityId)) {
      out.push({
        guard: "no-hardcoded-entity",
        severity: "block",
        subject: e.entityId,
        message: `Agent « ${e.entityId} » inconnu du registry/identité`,
        nextAction: "Déclarer l'agent (homeId, visual identity, responsibilities)",
      });
    }
  }
  for (const f of input.manifest.touchedFiles) {
    if (f.linkedHouseId && !input.knownHouseIds.has(f.linkedHouseId)) {
      out.push({
        guard: "no-hardcoded-entity",
        severity: "warn",
        subject: f.path,
        message: `linkedHouseId « ${f.linkedHouseId} » inconnu`,
        nextAction: "Corriger le lien ou déclarer la maison",
      });
    }
  }
  return out;
}

/* ── 4. Fichiers morts (créé mais jamais importé) ────────────────── */

export type DeadFileInput = {
  /** chemins repo-relatifs créés par le changement */
  createdFiles: string[];
  /** basenames (sans extension) référencés par un import quelque part */
  referencedBasenames: ReadonlySet<string>;
};

/**
 * validateNoDeadFiles — un fichier créé doit être importé/utilisé.
 * Heuristique : le basename (sans extension) du fichier créé doit apparaître
 * dans `referencedBasenames` (scan d'imports fait par le script). Les fichiers
 * « point d'entrée » (page.tsx/route.ts/*.test.ts/scripts) sont exemptés.
 */
export function validateNoDeadFiles(input: DeadFileInput): CofiatViolation[] {
  const out: CofiatViolation[] = [];
  const ENTRYPOINT = /(?:^|\/)(page|layout|error|route)\.tsx?$|\.test\.tsx?$|^scripts\//;
  for (const path of input.createdFiles) {
    if (ENTRYPOINT.test(path)) continue;
    const base = (path.split("/").pop() ?? "").replace(/\.(tsx?|mjs|mts)$/, "");
    if (!base) continue;
    if (!input.referencedBasenames.has(base)) {
      out.push({
        guard: "dead-file",
        severity: "warn",
        subject: path,
        message: `Fichier créé « ${path} » jamais importé (mort ?)`,
        nextAction: "Importer/utiliser le fichier ou le supprimer",
      });
    }
  }
  return out;
}

/* ── 5. Entités hardcodées dans le JSX ───────────────────────────── */

export type SourceFile = { path: string; content: string };

/**
 * validateNoHardcodedEntities — détecte des registres maisons/agents inline
 * dans des composants (hors config/types). Heuristique conservatrice : un
 * `const <NAME> = [` où NAME ~ HOUSES|AGENTS|DISTRICTS|REGISTRY dans un .tsx
 * qui n'est PAS un fichier de config/types. Sévérité warn (dette pré-existante
 * surfacée, jamais un faux pass).
 */
export function validateNoHardcodedEntities(files: SourceFile[]): CofiatViolation[] {
  const out: CofiatViolation[] = [];
  const NAME_RE = /\bconst\s+([A-Za-z0-9_]*(?:HOUSES|AGENTS|DISTRICTS|REGISTRY)[A-Za-z0-9_]*)\s*=\s*\[/g;
  for (const f of files) {
    const isConfigOrTypes = /\/config\/|\.types\.tsx?$|\/types\//.test(f.path);
    if (isConfigOrTypes) continue;
    if (!/\.tsx?$/.test(f.path)) continue;
    let m: RegExpExecArray | null;
    NAME_RE.lastIndex = 0;
    while ((m = NAME_RE.exec(f.content)) !== null) {
      out.push({
        guard: "no-hardcoded-entity",
        severity: "warn",
        subject: `${f.path} → const ${m[1]}`,
        message: `Registre d'entités inline « ${m[1]} » hors config`,
        nextAction: "Déplacer la donnée vers src/config (cofiatWorldIdentity / config dédiée)",
      });
    }
  }
  return out;
}

/* ── 6. Animations gratuites (sans mission/action) ───────────────── */

export type AnimatedThing = { id: string; kind: "vehicle" | "sprite" | "fx"; hasMission: boolean };

/** validateNoFreeAnimation — toute animation/véhicule doit porter une mission. */
export function validateNoFreeAnimation(things: AnimatedThing[]): CofiatViolation[] {
  const out: CofiatViolation[] = [];
  for (const t of things) {
    if (!t.hasMission) {
      out.push({
        guard: "mission-animation",
        severity: "warn",
        subject: `${t.kind}:${t.id}`,
        message: `Animation « ${t.id} » sans mission/action rattachée`,
        nextAction: "Rattacher une mission ou retirer l'animation",
      });
    }
  }
  return out;
}
