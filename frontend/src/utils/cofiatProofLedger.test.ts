/* ══════════════════════════════════════════════════════════════════
 * Tests PROOF LEDGER / WORK GUARD — le gardien valide réellement.
 * Runner : vitest ("npm test"). Aucun faux pass ; un GREEN sans preuve
 * doit produire une violation bloquante.
 * source_tag: COFIAT_PROOF_LEDGER_TESTS_V1_20260531
 * ════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from "vitest";

import { validateCofiatPath, validateNoDuplicateHub } from "@/utils/cofiatPathGuard";
import { matchCanonicalPath } from "@/config/cofiatCanonicalPaths";
import { computeManifestFinalStatus, buildChangeManifest } from "@/utils/cofiatChangeManifest";
import { validateNoDeadFiles, validateNoFreeAnimation } from "@/utils/cofiatWorkGuard";
import { runProofLedgerAudit, validateMapSafety } from "@/utils/cofiatProofLedger";
import type { AuthLedgerItem } from "@/types/cofiatWorld.types";

describe("path guard — chemins canoniques", () => {
  it("accepte un util cofiat canonique", () => {
    const r = validateCofiatPath("src/utils/cofiatProofLedger.ts");
    expect(r.valid).toBe(true);
    expect(r.detectedScope).toBe("utils");
  });

  it("accepte un composant du hub", () => {
    expect(matchCanonicalPath("src/components/cofiatrading-world-control/Anything.tsx")).toBe("hub");
  });

  it("rejette un fichier hors canon + suggère", () => {
    const r = validateCofiatPath("src/random/cofiatThing.ts");
    expect(r.valid).toBe(false);
    expect(r.reason).toBeTruthy();
  });
});

describe("no new hub — doublons", () => {
  it("détecte un WorldControl hors dossier canonique", () => {
    const v = validateNoDuplicateHub([
      "src/components/cofiatrading-world-control/WorldControl.tsx",
      "src/app/other/WorldControl.tsx",
    ]);
    expect(v.length).toBe(1);
    expect(v[0].guard).toBe("no-new-hub");
    expect(v[0].severity).toBe("block");
  });

  it("0 violation si un seul hub canonique", () => {
    const v = validateNoDuplicateHub([
      "src/components/cofiatrading-world-control/WorldControl.tsx",
      "src/components/cofiatrading-world-control/WorldMapLiving.tsx",
    ]);
    expect(v.length).toBe(0);
  });
});

describe("change manifest — statut final déterministe", () => {
  it("BLOCKED si une validation fail", () => {
    expect(
      computeManifestFinalStatus({
        validations: [{ name: "x", status: "fail" }],
        syncTargets: [],
        proof: { status: "provided" },
      })
    ).toBe("BLOCKED");
  });

  it("NEEDS_PROOF si preuve manquante", () => {
    expect(
      computeManifestFinalStatus({
        validations: [],
        syncTargets: [],
        proof: { status: "missing" },
      })
    ).toBe("NEEDS_PROOF");
  });

  it("NEEDS_SYNC si une synchro pending", () => {
    expect(
      computeManifestFinalStatus({
        validations: [],
        syncTargets: [{ target: "notebook-alm", status: "pending" }],
        proof: { status: "provided" },
      })
    ).toBe("NEEDS_SYNC");
  });

  it("APPROVED si tout passe", () => {
    const m = buildChangeManifest({
      id: "CM-T",
      worker: "claude-code",
      workContractId: "WC-T",
      summary: "t",
      touchedFiles: [],
      proof: { status: "not-required" },
    });
    expect(m.finalStatus).toBe("APPROVED");
  });
});

describe("work guard — fichiers morts + animations", () => {
  it("flag un fichier créé non référencé", () => {
    const v = validateNoDeadFiles({
      createdFiles: ["src/utils/cofiatGhost.ts"],
      referencedBasenames: new Set<string>(),
    });
    expect(v.length).toBe(1);
    expect(v[0].guard).toBe("dead-file");
  });

  it("n'flag pas un point d'entrée", () => {
    const v = validateNoDeadFiles({
      createdFiles: ["src/app/cofiatrading-world-control/page.tsx"],
      referencedBasenames: new Set<string>(),
    });
    expect(v.length).toBe(0);
  });

  it("flag une animation sans mission", () => {
    const v = validateNoFreeAnimation([{ id: "truck-1", kind: "vehicle", hasMission: false }]);
    expect(v.length).toBe(1);
    expect(v[0].guard).toBe("mission-animation");
  });
});

describe("map safety", () => {
  it("BLOCK si maisons manquantes", () => {
    const r = validateMapSafety({
      housesExpected: 15,
      housesSeen: 12,
      agentsExpected: 38,
      agentsSeen: 38,
      proofLedgerVisible: true,
      notebookAlmVisible: true,
      consoleIaConnected: true,
      collisions: 0,
      orphanRoutes: 0,
      freeAnimations: 0,
    });
    expect(r.status).toBe("fail");
  });
});

describe("aggregator — no-false-green", () => {
  it("détecte un GREEN sans preuve dans le ledger fourni", () => {
    const fakeGreen: AuthLedgerItem[] = [
      {
        id: "fake",
        name: "Fake provider",
        provider: "fake",
        category: "llm",
        status: "GREEN",
        statusSource: "config",
        criticality: "important",
        // pas de proof → faux-vert
      },
    ];
    const res = runProofLedgerAudit({ authLedger: fakeGreen });
    const nfg = res.guards.find((g) => g.guard === "no-false-green");
    expect(nfg?.status).toBe("fail");
    expect(res.blockingCount).toBeGreaterThan(0);
    expect(res.finalStatus).toBe("BLOCKED");
  });

  it("produit toujours un log non vide", () => {
    const res = runProofLedgerAudit({});
    expect(res.log.length).toBeGreaterThan(0);
    expect(res.policy.noFakeGreen).toBe(true);
  });
});
