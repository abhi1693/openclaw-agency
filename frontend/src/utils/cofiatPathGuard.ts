/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — PATH GUARD
 * ────────────────────────────────────────────────────────────────────
 * Fonctions PURES qui valident QU'UN FICHIER EST AU BON ENDROIT.
 *  - validateCofiatPath : chemin ∈ chemins canoniques ? scope détecté ?
 *  - validateWriteScope : chemin autorisé par le contrat (allowed/forbidden) ?
 *  - validateNoDuplicateHub : un seul hub/map — détecte les doublons.
 *
 * S'appuie sur le SSOT `cofiatCanonicalPaths`. Aucune I/O ici (le scan
 * disque est fait par scripts/validate-proof-ledger.ts qui réutilise ces
 * mêmes helpers de matching).
 *
 * source_tag: COFIAT_PATH_GUARD_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import {
  cofiatCanonicalPaths,
  matchCanonicalPath,
  normalizeRepoPath,
  pathMatchesAny,
  SCOPE_TO_PATH_SCOPES,
  HUB_DUPLICATE_MARKERS,
  CANONICAL_HUB_COMPONENT,
  type CofiatPathScope,
} from "@/config/cofiatCanonicalPaths";
import type {
  CofiatWorkContract,
  CofiatWorkScope,
  CofiatViolation,
  CofiatPathCheck,
} from "@/types/cofiatProofLedger.types";

/**
 * validateCofiatPath — un chemin est-il à un emplacement canonique ?
 * Si `scope` (fonctionnel) est fourni, on vérifie que le scope de dossier
 * détecté est cohérent et, sinon, on suggère un emplacement canonique.
 */
export function validateCofiatPath(
  path: string,
  scope?: CofiatWorkScope
): CofiatPathCheck {
  const p = normalizeRepoPath(path);
  const detected = matchCanonicalPath(p);

  if (!detected) {
    return {
      valid: false,
      reason: `Hors chemins canoniques : « ${p} » ne matche aucun glob autorisé`,
      suggestedCanonicalPath: scope ? suggestForScope(scope, p) : undefined,
    };
  }

  if (scope) {
    const expected = SCOPE_TO_PATH_SCOPES[scope] ?? [];
    if (expected.length && !expected.includes(detected)) {
      return {
        valid: false,
        detectedScope: detected,
        reason: `Scope « ${scope} » attend ${expected.join("/")} mais le chemin est dans « ${detected} »`,
        suggestedCanonicalPath: suggestForScope(scope, p),
      };
    }
  }

  return { valid: true, detectedScope: detected };
}

/** Suggère un dossier canonique plausible pour un scope donné. */
function suggestForScope(scope: CofiatWorkScope, path: string): string | undefined {
  const targets = SCOPE_TO_PATH_SCOPES[scope] ?? [];
  const first = targets[0] as CofiatPathScope | undefined;
  if (!first) return undefined;
  const globs = cofiatCanonicalPaths[first];
  const base = globs[0]?.replace(/\*+.*$/, "") ?? "";
  const file = path.split("/").pop() ?? "";
  return base ? `${base}${file}` : undefined;
}

/**
 * validateWriteScope — un worker a-t-il le droit d'écrire `path` sous ce
 * contrat ? Refuse si forbidden, si hors allowed (quand allowed est défini),
 * ou si hors chemins canoniques. Retourne une violation `canonical-path` ou null.
 */
export function validateWriteScope(
  contract: CofiatWorkContract,
  path: string
): CofiatViolation | null {
  const p = normalizeRepoPath(path);

  if (contract.forbiddenPaths.length && pathMatchesAny(p, contract.forbiddenPaths)) {
    return {
      guard: "canonical-path",
      severity: "block",
      subject: p,
      message: `Écriture interdite par le contrat ${contract.id} (forbiddenPaths)`,
      nextAction: "Ne pas écrire ici ; choisir un chemin autorisé du contrat",
    };
  }

  const canon = validateCofiatPath(p, contract.scope);
  if (!canon.valid) {
    return {
      guard: "canonical-path",
      severity: "block",
      subject: p,
      message: canon.reason ?? "Chemin hors canonique",
      nextAction: canon.suggestedCanonicalPath
        ? `Déplacer vers ${canon.suggestedCanonicalPath}`
        : "Déplacer vers un dossier canonique",
    };
  }

  if (contract.allowedPaths.length && !pathMatchesAny(p, contract.allowedPaths)) {
    return {
      guard: "canonical-path",
      severity: "warn",
      subject: p,
      message: `Chemin canonique mais hors allowedPaths du contrat ${contract.id}`,
      nextAction: "Ajouter le chemin aux allowedPaths du contrat ou changer de contrat",
    };
  }

  return null;
}

/**
 * validateNoDuplicateHub — un seul hub/map autorisé.
 * Détecte tout marqueur de hub (WorldControl.tsx, WorldMapLiving.tsx) présent
 * hors du dossier canonique du hub. `paths` = liste de chemins repo-relatifs.
 */
export function validateNoDuplicateHub(paths: string[]): CofiatViolation[] {
  const out: CofiatViolation[] = [];
  const normalized = paths.map(normalizeRepoPath);

  for (const marker of HUB_DUPLICATE_MARKERS) {
    const hits = normalized.filter((p) => p.endsWith(`/${marker}`) || p === marker);
    const canonicalDir = "src/components/cofiatrading-world-control/";
    const strays = hits.filter((p) => !p.startsWith(canonicalDir));
    for (const stray of strays) {
      out.push({
        guard: "no-new-hub",
        severity: "block",
        subject: stray,
        message: `Hub/map parallèle détecté : « ${marker} » hors du hub canonique`,
        nextAction: `Supprimer/fusionner dans ${canonicalDir}${marker}`,
      });
    }
    // plus d'un WorldControl.tsx dans le dossier canonique = doublon aussi
    const canonicalHits = hits.filter((p) => p.startsWith(canonicalDir));
    if (marker === "WorldControl.tsx" && canonicalHits.length > 1) {
      for (const dup of canonicalHits.filter((p) => p !== CANONICAL_HUB_COMPONENT)) {
        out.push({
          guard: "no-new-hub",
          severity: "block",
          subject: dup,
          message: `Doublon du composant hub racine (${CANONICAL_HUB_COMPONENT} est l'unique)`,
          nextAction: "Fusionner dans le composant hub canonique",
        });
      }
    }
  }
  return out;
}
