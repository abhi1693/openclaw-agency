/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — VALIDATE PROOF LEDGER (enforcement FS)
 * ────────────────────────────────────────────────────────────────────
 * Contrôle DISQUE réel — la partie que le navigateur ne peut pas faire.
 * Runnable directement : `node scripts/validate-proof-ledger.ts`
 * (Node ≥ 23.6 strip-types natif ; les `import type` vers `@/` sont effacés).
 *
 * Vérifie :
 *   1. Chemins canoniques — tout artefact « chantier » (cofiat*, hub, world-
 *      control api/page) est dans un dossier autorisé.
 *   2. Hub unique — aucun WorldControl/WorldMapLiving dupliqué hors canon.
 *   3. Fichiers morts — chaque fichier cofiat* du chantier est importé.
 *   4. No-False-Green — aucun GREEN/LIVE du ledger d'auth sans preuve.
 *   5. Entités hardcodées — registres HOUSES/AGENTS inline hors config (warn).
 *
 * Sort code 1 si une violation BLOQUANTE est trouvée, 0 sinon.
 * Importé aussi par scripts/validate-cofiat-world.ts (runFsAudit).
 *
 * source_tag: COFIAT_VALIDATE_PROOF_LEDGER_FS_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  matchCanonicalPath,
  normalizeRepoPath,
  HUB_DUPLICATE_MARKERS,
  CANONICAL_HUB_COMPONENT,
} from "../src/config/cofiatCanonicalPaths.ts";
import { cofiatAuthProofLedger } from "../src/config/cofiatAuthProofLedger.ts";
import { validateNoFalseGreen, enforceNoFalseGreenAll } from "../src/utils/cofiatNoFalseGreenGuard.ts";

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type Sev = "block" | "warn";
type Finding = { guard: string; severity: Sev; subject: string; message: string; nextAction: string };

/* ── walk : tous les .ts/.tsx du chantier (hors .bak/node_modules/.next) ── */

function collectFiles(): { rel: string; content: string }[] {
  const out: { rel: string; content: string }[] = [];
  const roots = ["src", "scripts"];
  for (const root of roots) {
    const abs = join(FRONTEND_ROOT, root);
    if (!existsSync(abs)) continue;
    const entries = readdirSync(abs, { recursive: true, withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const name = e.name;
      if (!/\.(ts|tsx)$/.test(name)) continue;
      if (name.endsWith(".d.ts")) continue;
      // @ts-expect-error parentPath dispo Node ≥ 20.12
      const parent: string = e.parentPath ?? e.path;
      const absPath = join(parent, name);
      const rel = normalizeRepoPath(absPath.slice(FRONTEND_ROOT.length + 1));
      if (rel.includes("node_modules") || rel.includes(".next") || rel.includes(".bak")) continue;
      out.push({ rel, content: readFileSync(absPath, "utf8") });
    }
  }
  return out;
}

/** true si le fichier fait partie du « chantier » world-control. */
function isChantierFile(rel: string): boolean {
  const base = rel.split("/").pop() ?? "";
  return (
    base.startsWith("cofiat") ||
    HUB_DUPLICATE_MARKERS.includes(base) ||
    /cofiatrading-world-control/.test(rel) ||
    /\/hooks\/useCofiat/.test(rel) ||
    (rel.startsWith("scripts/") && /cofiat|proof-ledger|world/.test(base))
  );
}

export function runFsAudit(): { findings: Finding[]; scanned: number } {
  const files = collectFiles();
  const findings: Finding[] = [];
  const allText = files.map((f) => f.content).join("\n");

  /* 1. Chemins canoniques (scopé chantier) ----------------------------- */
  for (const f of files) {
    if (!isChantierFile(f.rel)) continue;
    if (matchCanonicalPath(f.rel) === null) {
      findings.push({
        guard: "canonical-path",
        severity: "block",
        subject: f.rel,
        message: "Artefact chantier hors chemin canonique",
        nextAction: "Déplacer dans un dossier canonique (cf. cofiatCanonicalPaths)",
      });
    }
  }

  /* 2. Hub unique ------------------------------------------------------ */
  const canonicalDir = "src/components/cofiatrading-world-control/";
  for (const marker of HUB_DUPLICATE_MARKERS) {
    const hits = files.filter((f) => f.rel.endsWith(`/${marker}`) || f.rel === marker).map((f) => f.rel);
    for (const stray of hits.filter((p) => !p.startsWith(canonicalDir))) {
      findings.push({
        guard: "no-new-hub",
        severity: "block",
        subject: stray,
        message: `Hub/map parallèle : « ${marker} » hors du hub canonique`,
        nextAction: `Fusionner dans ${canonicalDir}${marker}`,
      });
    }
    if (marker === "WorldControl.tsx") {
      const canon = hits.filter((p) => p.startsWith(canonicalDir));
      for (const dup of canon.filter((p) => p !== CANONICAL_HUB_COMPONENT)) {
        findings.push({
          guard: "no-new-hub",
          severity: "block",
          subject: dup,
          message: "Doublon du composant hub racine",
          nextAction: `Unique = ${CANONICAL_HUB_COMPONENT}`,
        });
      }
    }
  }

  /* 3. Fichiers morts (cofiat* du chantier jamais importés) ------------ */
  const ENTRYPOINT = /(?:^|\/)(page|layout|error|route)\.tsx?$|\.test\.tsx?$|^scripts\//;
  for (const f of files) {
    if (!isChantierFile(f.rel) || ENTRYPOINT.test(f.rel)) continue;
    const base = (f.rel.split("/").pop() ?? "").replace(/\.(tsx?)$/, "");
    if (!base) continue;
    // référencé si un autre fichier mentionne le basename dans un import/from
    const referenced = files.some(
      (g) => g.rel !== f.rel && new RegExp(`from\\s+["'][^"']*${base}["']|import\\(["'][^"']*${base}["']\\)`).test(g.content)
    );
    if (!referenced) {
      findings.push({
        guard: "dead-file",
        severity: "warn",
        subject: f.rel,
        message: "Fichier chantier jamais importé (mort ?)",
        nextAction: "Importer/utiliser ou supprimer",
      });
    }
  }

  /* 4. No-False-Green sur le ledger d'auth ----------------------------- */
  const enforced = enforceNoFalseGreenAll(cofiatAuthProofLedger);
  const { violations } = validateNoFalseGreen(enforced);
  for (const v of violations) {
    findings.push({
      guard: "no-false-green",
      severity: "block",
      subject: v.id,
      message: v.reason,
      nextAction: "Attacher une preuve réelle ou rétrograder",
    });
  }

  /* 5. Entités hardcodées inline (warn) -------------------------------- */
  const NAME_RE = /\bconst\s+([A-Za-z0-9_]*(?:HOUSES|AGENTS|DISTRICTS|REGISTRY)[A-Za-z0-9_]*)\s*=\s*\[/g;
  for (const f of files) {
    if (/\/config\/|\.types\.tsx?$|\/types\//.test(f.rel)) continue;
    if (!/cofiatrading-world-control\/.+\.tsx$/.test(f.rel)) continue;
    let m: RegExpExecArray | null;
    NAME_RE.lastIndex = 0;
    while ((m = NAME_RE.exec(f.content)) !== null) {
      findings.push({
        guard: "no-hardcoded-entity",
        severity: "warn",
        subject: `${f.rel} → const ${m[1]}`,
        message: "Registre d'entités inline hors config",
        nextAction: "Déplacer la donnée vers src/config",
      });
    }
  }

  void allText; // (réservé : scans transverses futurs)
  return { findings, scanned: files.length };
}

/* ── runner CLI ───────────────────────────────────────────────────── */

function main(): number {
  const { findings, scanned } = runFsAudit();
  const blocks = findings.filter((f) => f.severity === "block");
  const warns = findings.filter((f) => f.severity === "warn");

  console.log("══ PROOF LEDGER — FS AUDIT ══");
  console.log(`scanned: ${scanned} fichiers · block: ${blocks.length} · warn: ${warns.length}`);
  for (const f of findings) {
    const tag = f.severity === "block" ? "✗ BLOCK" : "⚠ WARN ";
    console.log(`${tag} [${f.guard}] ${f.subject}\n         ${f.message} → ${f.nextAction}`);
  }
  const verdict = blocks.length ? "BLOCKED" : warns.length ? "APPROVED_WITH_WARNINGS" : "APPROVED";
  console.log(`\nVERDICT: ${verdict}`);
  return blocks.length ? 1 : 0;
}

// Exécution directe uniquement (pas à l'import).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main());
}
