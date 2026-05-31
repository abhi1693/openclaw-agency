/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — CHEMINS CANONIQUES (SSOT) + POLICY
 * ────────────────────────────────────────────────────────────────────
 * Source unique des emplacements AUTORISÉS du chantier World-Control.
 * Tout fichier hors de ces globs = violation `canonical-path` (un worker
 * écrit au mauvais endroit / crée un hub parallèle / un fichier mort).
 *
 * ⚠️ Ces globs reflètent la RÉALITÉ du repo (audit 2026-05-31), PAS une
 * arborescence imaginée. Tous les chemins sont relatifs à la racine du
 * frontend (`.../mission-control-frontend-restored/frontend/`).
 *
 * CONTRAINTE D'IMPORTABILITÉ : ce module n'a AUCUN import runtime (que des
 * `import type`, effacés à l'exécution). Il est donc importable à la fois
 * par le frontend (alias `@/`) ET par les scripts Node (`node scripts/*.ts`,
 * import relatif), sans casser la résolution d'alias.
 *
 * source_tag: COFIAT_CANONICAL_PATHS_SSOT_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import type { CofiatWorkScope, CofiatWorkerPolicy } from "@/types/cofiatProofLedger.types";

/** Scope canonique d'un dossier (≠ CofiatWorkScope fonctionnel). */
export type CofiatPathScope =
  | "hub"
  | "config"
  | "types"
  | "utils"
  | "hooks"
  | "api"
  | "page"
  | "lib"
  | "scripts";

/**
 * Globs autorisés par scope de dossier. `**` = n'importe quelle profondeur,
 * `*` = un segment. Les chemins exacts existants sont listés quand ils sont
 * des SSOT singuliers (ex. les configs cofiat*).
 */
export const cofiatCanonicalPaths: Record<CofiatPathScope, string[]> = {
  // Composants du hub — TOUT le hub vit ici, nulle part ailleurs.
  hub: [
    "src/components/cofiatrading-world-control/**",
  ],
  // Configs globales du monde (identité, statut, ledgers, paths, contrats…).
  config: [
    "src/config/cofiatWorldIdentity.ts",
    "src/config/cofiatWorldStatus.ts",
    "src/config/cofiatAuthProofLedger.ts",
    "src/config/cofiatConsoleIaAdapter.ts",
    "src/config/cofiatCanonicalPaths.ts",
    "src/config/cofiatWorkContracts.ts",
    "src/config/cofiat*.ts",
  ],
  // Types canoniques.
  types: [
    "src/types/cofiatWorld.types.ts",
    "src/types/cofiatProofLedger.types.ts",
    "src/types/cofiat*.ts",
    // type local historique du hub (SSOT des types runtime du World-Control)
    "src/components/cofiatrading-world-control/world-control.types.ts",
  ],
  // Utilitaires purs (guards, sélecteurs, validations).
  utils: [
    "src/utils/cofiatNoFalseGreenGuard.ts",
    "src/utils/cofiatProofLedger.ts",
    "src/utils/cofiatPathGuard.ts",
    "src/utils/cofiatWorkGuard.ts",
    "src/utils/cofiatSyncGuard.ts",
    "src/utils/cofiatChangeManifest.ts",
    "src/utils/cofiat*.ts",
  ],
  // Hooks React du hub.
  hooks: [
    "src/hooks/useCofiat*.ts",
    "src/hooks/*.ts",
  ],
  // Routes API du World-Control.
  api: [
    "src/app/api/cofiatrading-world-control/**",
  ],
  // Page Next du hub.
  page: [
    "src/app/cofiatrading-world-control/**",
  ],
  // Lib partagée (runtime host…).
  lib: [
    "src/lib/**",
  ],
  // Scripts de validation runnables.
  scripts: [
    "scripts/**",
  ],
};

/* ── Marqueurs anti-hub-parallèle (un seul hub autorisé) ─────────── */

/** Le SEUL composant racine du hub. Tout autre `WorldControl.tsx` = doublon. */
export const CANONICAL_HUB_COMPONENT =
  "src/components/cofiatrading-world-control/WorldControl.tsx";

/** Le SEUL dossier de route du hub. */
export const CANONICAL_HUB_ROUTE_DIR = "src/app/cofiatrading-world-control";

/**
 * Noms de fichiers/segments qui, dupliqués hors des emplacements canoniques,
 * trahissent un hub/map parallèle.
 */
export const HUB_DUPLICATE_MARKERS: string[] = [
  "WorldControl.tsx",
  "WorldMapLiving.tsx",
];

/* ── Mapping scope fonctionnel → dossiers attendus (pour suggestion) ── */

/**
 * Pour un CofiatWorkScope fonctionnel, le(s) scope(s) de dossier attendu(s).
 * Sert à suggérer un emplacement canonique quand un chemin est invalide.
 */
export const SCOPE_TO_PATH_SCOPES: Record<CofiatWorkScope, CofiatPathScope[]> = {
  "world-map": ["hub"],
  house: ["config", "hub"],
  agent: ["config", "hub"],
  mission: ["config", "utils", "hub"],
  asset: ["config", "hub"],
  service: ["api", "config"],
  "auth-provider": ["config"],
  "console-ia": ["hub", "api", "config"],
  "notebook-alm": ["hub", "api"],
  "proof-ledger": ["utils", "config", "types", "hub", "scripts"],
  layout: ["hub", "api"],
  "visual-identity": ["config"],
  runtime: ["lib", "api"],
  inventory: ["config", "api", "hub"],
  "status-matrix": ["utils", "config", "hub"],
};

/* ── Matcher de glob minimal (pur, sans dépendance) ──────────────── */

/** Normalise un chemin (slashes avant, retire `./` et `/` initial). */
export function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "");
}

/** Convertit un glob (`**`, `*`) en RegExp ancrée. */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*"; // ** = n'importe quelle profondeur
        i += 1;
      } else {
        re += "[^/]*"; // * = un segment
      }
    } else if ("\\^$.|?+()[]{}".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/** true si `path` matche au moins un glob de la liste. */
export function pathMatchesAny(path: string, globs: string[]): boolean {
  const p = normalizeRepoPath(path);
  return globs.some((g) => globToRegExp(g).test(p));
}

/**
 * matchCanonicalPath — détecte le scope canonique d'un chemin (ou null).
 * Pur, sans I/O. Le PREMIER scope dont un glob matche est retourné.
 */
export function matchCanonicalPath(path: string): CofiatPathScope | null {
  const p = normalizeRepoPath(path);
  for (const scope of Object.keys(cofiatCanonicalPaths) as CofiatPathScope[]) {
    if (pathMatchesAny(p, cofiatCanonicalPaths[scope])) return scope;
  }
  return null;
}

/** Renvoie tous les globs canoniques aplatis (debug/affichage). */
export function allCanonicalGlobs(): string[] {
  return Object.values(cofiatCanonicalPaths).flat();
}

/* ── POLICY worker (exposée dans le Proof Ledger panel) ──────────── */

/**
 * Politique de travail opposable à TOUS les workers (Claude, Console IA,
 * Notebook ALM, map-designer, backend…). Affichée dans le Proof Ledger.
 */
export const COFIAT_WORKER_POLICY: CofiatWorkerPolicy = {
  noNewHub: true,
  noHardcodedHouses: true,
  noHardcodedAgents: true,
  noFakeGreen: true,
  noFreeAnimation: true,
  noDeadFiles: true,
  noUnregisteredAssets: true,
  noUnownedServices: true,
  noWrongFolderWrites: true,
  requireChangeManifest: true,
  requireSyncTargets: true,
  requireProofForGreen: true,
  requireNotebookAlmSync: true,
  requireConsoleIaLog: true,
};

/** Libellés lisibles de la policy (UI). */
export const COFIAT_WORKER_POLICY_LABELS: Record<keyof CofiatWorkerPolicy, string> = {
  noNewHub: "Aucun nouveau hub / map parallèle",
  noHardcodedHouses: "Aucune maison hardcodée hors config",
  noHardcodedAgents: "Aucun agent hardcodé hors config",
  noFakeGreen: "Aucun GREEN sans preuve",
  noFreeAnimation: "Aucune animation sans mission/action",
  noDeadFiles: "Aucun fichier créé non importé",
  noUnregisteredAssets: "Aucun asset hors inventory matrix",
  noUnownedServices: "Aucun service sans owner",
  noWrongFolderWrites: "Aucune écriture hors chemin canonique",
  requireChangeManifest: "Change Manifest obligatoire",
  requireSyncTargets: "Cibles de synchro obligatoires",
  requireProofForGreen: "Preuve obligatoire pour GREEN",
  requireNotebookAlmSync: "Synchro Notebook ALM requise",
  requireConsoleIaLog: "Log console.IA requis",
};
