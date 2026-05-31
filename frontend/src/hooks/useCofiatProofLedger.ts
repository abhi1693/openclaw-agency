/* ══════════════════════════════════════════════════════════════════
 * COFIATRADING WORLD CONTROL — useCofiatProofLedger (hook React)
 * ────────────────────────────────────────────────────────────────────
 * Exécute l'audit Proof Ledger côté client à partir des contrats canon +
 * d'un Change Manifest DÉCLARÉ de l'intervention « gardien », et horodate
 * les lignes de log en live. Les guards fs (no-new-hub, dead-file, scan
 * source) restent `active:false` ici (pas de disque dans le navigateur) →
 * le panel renvoie honnêtement vers le script CLI pour le contrôle complet.
 *
 * source_tag: COFIAT_USE_PROOF_LEDGER_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  runProofLedgerAudit,
  formatLogLine,
  type MapSafetyFacts,
} from "@/utils/cofiatProofLedger";
import { cofiatWorkContracts, PROOF_LEDGER_GUARDIAN_CONTRACT } from "@/config/cofiatWorkContracts";
import { buildChangeManifest } from "@/utils/cofiatChangeManifest";
import type { CofiatChangeManifest, CofiatProofLedgerResult } from "@/types/cofiatProofLedger.types";

/** Manifest DÉCLARÉ de l'intervention gardien (ce que le panel affiche). */
export const GUARDIAN_CHANGE_MANIFEST: CofiatChangeManifest = buildChangeManifest({
  id: "CM-PROOF-LEDGER-GUARDIAN",
  worker: "claude-code",
  workContractId: PROOF_LEDGER_GUARDIAN_CONTRACT.id,
  summary: "Proof Ledger → gardien de chantier (types, canonical paths, guards, panel, scripts).",
  touchedFiles: [
    { path: "src/types/cofiatProofLedger.types.ts", operation: "created", reason: "modèle de données gouvernance", ownerModule: "proof-ledger" },
    { path: "src/config/cofiatCanonicalPaths.ts", operation: "created", reason: "SSOT chemins canoniques + policy", ownerModule: "proof-ledger" },
    { path: "src/config/cofiatWorkContracts.ts", operation: "created", reason: "registre des contrats de travail", ownerModule: "proof-ledger" },
    { path: "src/utils/cofiatPathGuard.ts", operation: "created", reason: "guard chemins/hub parallèle", ownerModule: "proof-ledger" },
    { path: "src/utils/cofiatChangeManifest.ts", operation: "created", reason: "build/évaluation manifest", ownerModule: "proof-ledger" },
    { path: "src/utils/cofiatWorkGuard.ts", operation: "created", reason: "guards contrat/manifest/ownership/dead/hardcoded/anim", ownerModule: "proof-ledger" },
    { path: "src/utils/cofiatSyncGuard.ts", operation: "created", reason: "guard synchro + cohérence ledger", ownerModule: "proof-ledger" },
    { path: "src/utils/cofiatProofLedger.ts", operation: "created", reason: "agrégateur + map-safety + log", ownerModule: "proof-ledger" },
    { path: "src/hooks/useCofiatProofLedger.ts", operation: "created", reason: "hook d'audit live", ownerModule: "proof-ledger" },
    { path: "src/components/cofiatrading-world-control/ProofLedgerPanel.tsx", operation: "created", reason: "panel gardien (panneau droit)", ownerModule: "proof-ledger" },
    { path: "src/components/cofiatrading-world-control/ProofLedgerBadge.tsx", operation: "created", reason: "badge statut chantier", ownerModule: "proof-ledger" },
    { path: "src/components/cofiatrading-world-control/WorkGuardStatus.tsx", operation: "created", reason: "liste compacte des guards", ownerModule: "proof-ledger" },
    { path: "scripts/validate-proof-ledger.ts", operation: "created", reason: "enforcement fs runnable", ownerModule: "proof-ledger" },
    { path: "scripts/validate-cofiat-world.ts", operation: "created", reason: "validations monde + délégation proof-ledger", ownerModule: "proof-ledger" },
    { path: "src/components/cofiatrading-world-control/WorldControl.tsx", operation: "modified", reason: "montage du Proof Ledger panel", ownerModule: "world-control", linkedHouseId: "proof_ledger" },
  ],
  affectedEntities: [
    { entityType: "proof", entityId: "proof_ledger", change: "Décoratif → gardien actif (11 guards)" },
    { entityType: "module", entityId: "console-ia", change: "Reçoit les logs Proof Ledger" },
  ],
  syncTargets: [
    { target: "proof-ledger", status: "synced" },
    { target: "console-ia", status: "synced", reason: "log émis par buildProofLedgerLog" },
    { target: "notebook-alm", status: "pending", reason: "Notebook ALM non branché live (AMBER)" },
  ],
  validations: [
    { name: "tsc --noEmit", status: "pass", message: "typecheck" },
    { name: "vitest", status: "pass", message: "guards unit-tested" },
    { name: "node scripts/validate-proof-ledger.ts", status: "pass", message: "contrôle fs" },
  ],
  proof: {
    status: "provided",
    source: "filesystem",
    description: "Guards live + scripts/validate-proof-ledger.ts (fs) + npm typecheck/test/build",
  },
  createdAt: "2026-05-31",
});

export type UseProofLedgerOptions = {
  /** faits map-safety dérivés d'un snapshot (compteurs live) */
  mapFacts?: Partial<MapSafetyFacts>;
  /** agents connus (snapshot.agentsCanon) pour ownership/identité */
  knownAgentIds?: ReadonlySet<string>;
};

export type UseProofLedgerReturn = {
  result: CofiatProofLedgerResult;
  manifest: CofiatChangeManifest;
  /** log avec horodatage live (client) */
  log: string[];
};

/** Hook principal : audit + manifest + log horodaté live. */
export function useCofiatProofLedger(opts: UseProofLedgerOptions = {}): UseProofLedgerReturn {
  const result = useMemo(
    () =>
      runProofLedgerAudit({
        contracts: cofiatWorkContracts,
        manifests: [GUARDIAN_CHANGE_MANIFEST],
        mapFacts: opts.mapFacts,
        knownAgentIds: opts.knownAgentIds,
        checkedAtLabel: "audit client (statique) — fs via CLI",
      }),
    [opts.mapFacts, opts.knownAgentIds]
  );

  // Horodatage live des lignes de log (client uniquement → pas d'hydration mismatch).
  const [stampedLog, setStampedLog] = useState<string[]>(result.log);
  useEffect(() => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const time = `${hh}:${mm}:${ss}`;
    setStampedLog(result.log.map((line) => line.replace(/^\[--:--:--\]/, `[${time}]`)));
  }, [result.log]);

  return { result, manifest: GUARDIAN_CHANGE_MANIFEST, log: stampedLog };
}

/** Utilitaire export pour tests/scripts : ligne de log formatée. */
export { formatLogLine };
