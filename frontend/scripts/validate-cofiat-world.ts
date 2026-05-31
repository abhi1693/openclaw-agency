/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — VALIDATE WORLD (structure + délégation)
 * ────────────────────────────────────────────────────────────────────
 * Vérifie la structure canonique du monde (hub unique, route, page, configs
 * SSOT présentes) PUIS délègue l'audit FS du Proof Ledger (runFsAudit).
 * Runnable : `node scripts/validate-cofiat-world.ts`
 *
 * source_tag: COFIAT_VALIDATE_WORLD_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runFsAudit } from "./validate-proof-ledger.ts";
import {
  CANONICAL_HUB_COMPONENT,
  CANONICAL_HUB_ROUTE_DIR,
} from "../src/config/cofiatCanonicalPaths.ts";

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type Check = { name: string; ok: boolean; detail: string };

/** Fichiers SSOT qui doivent exister (gouvernance Proof Ledger). */
const REQUIRED_FILES = [
  CANONICAL_HUB_COMPONENT,
  `${CANONICAL_HUB_ROUTE_DIR}/page.tsx`,
  "src/types/cofiatWorld.types.ts",
  "src/types/cofiatProofLedger.types.ts",
  "src/config/cofiatCanonicalPaths.ts",
  "src/config/cofiatWorkContracts.ts",
  "src/config/cofiatAuthProofLedger.ts",
  "src/config/cofiatConsoleIaAdapter.ts",
  "src/utils/cofiatProofLedger.ts",
  "src/utils/cofiatPathGuard.ts",
  "src/utils/cofiatWorkGuard.ts",
  "src/utils/cofiatSyncGuard.ts",
  "src/utils/cofiatChangeManifest.ts",
  "src/utils/cofiatNoFalseGreenGuard.ts",
  "src/hooks/useCofiatProofLedger.ts",
  "src/components/cofiatrading-world-control/ProofLedgerPanel.tsx",
];

function structureChecks(): Check[] {
  return REQUIRED_FILES.map((rel) => ({
    name: rel,
    ok: existsSync(join(FRONTEND_ROOT, rel)),
    detail: rel,
  }));
}

function main(): number {
  console.log("══ COFIAT WORLD — STRUCTURE ══");
  const checks = structureChecks();
  let missing = 0;
  for (const c of checks) {
    if (!c.ok) missing += 1;
    console.log(`${c.ok ? "✓" : "✗ MISSING"} ${c.detail}`);
  }
  console.log(`\nstructure: ${checks.length - missing}/${checks.length} présents`);

  console.log("");
  const { findings, scanned } = runFsAudit();
  const blocks = findings.filter((f) => f.severity === "block");
  const warns = findings.filter((f) => f.severity === "warn");
  console.log("══ PROOF LEDGER — FS AUDIT (délégué) ══");
  console.log(`scanned: ${scanned} · block: ${blocks.length} · warn: ${warns.length}`);
  for (const f of findings) {
    console.log(`${f.severity === "block" ? "✗ BLOCK" : "⚠ WARN "} [${f.guard}] ${f.subject} → ${f.nextAction}`);
  }

  const hardFail = missing > 0 || blocks.length > 0;
  console.log(`\nWORLD VERDICT: ${hardFail ? "BLOCKED" : warns.length ? "APPROVED_WITH_WARNINGS" : "APPROVED"}`);
  return hardFail ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main());
}
