/* ══════════════════════════════════════════════════════════════════
 * Tests NO-FALSE-GREEN — garde + totaux canoniques.
 * Runner : vitest ("npm test"). Aucune promotion vers GREEN n'est tolérée ;
 * tout GREEN/LIVE non prouvé / source non traçable / périmé → UNKNOWN.
 * ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import {
  enforceNoFalseGreen,
  enforceNoFalseGreenAll,
  computeCanonicalTotals,
  totalsInvariantOk,
  type GuardableItem,
} from "./cofiatNoFalseGreenGuard";

const base = (over: Partial<GuardableItem>): GuardableItem => ({
  status: "GREEN",
  statusSource: "filesystem",
  proof: "probe ok",
  ...over,
});

describe("enforceNoFalseGreen", () => {
  it("downgrades GREEN without proof to UNKNOWN", () => {
    expect(enforceNoFalseGreen(base({ proof: undefined })).status).toBe("UNKNOWN");
    expect(enforceNoFalseGreen(base({ proof: "   " })).status).toBe("UNKNOWN");
  });

  it("downgrades LIVE without proof to UNKNOWN", () => {
    expect(enforceNoFalseGreen(base({ status: "LIVE", proof: undefined })).status).toBe("UNKNOWN");
  });

  it("downgrades GREEN with untrusted source (config/mock/unknown) to UNKNOWN", () => {
    expect(enforceNoFalseGreen(base({ statusSource: "config" })).status).toBe("UNKNOWN");
    expect(enforceNoFalseGreen(base({ statusSource: "mock" })).status).toBe("UNKNOWN");
    expect(enforceNoFalseGreen(base({ statusSource: "unknown" })).status).toBe("UNKNOWN");
  });

  it("downgrades GREEN with expired proof to UNKNOWN", () => {
    expect(enforceNoFalseGreen(base({ expiresAt: "2000-01-01T00:00:00Z" })).status).toBe("UNKNOWN");
  });

  it("keeps GREEN with proof + trusted source + not expired", () => {
    expect(enforceNoFalseGreen(base({})).status).toBe("GREEN");
    expect(enforceNoFalseGreen(base({ statusSource: "user_audit" })).status).toBe("GREEN");
    expect(enforceNoFalseGreen(base({ statusSource: "api" })).status).toBe("GREEN");
    expect(enforceNoFalseGreen(base({ expiresAt: "2999-01-01T00:00:00Z" })).status).toBe("GREEN");
  });

  it("never promotes AMBER fallback to GREEN", () => {
    const openrouter = base({ status: "AMBER", proof: undefined });
    expect(enforceNoFalseGreen(openrouter).status).toBe("AMBER");
    const amberWithProof = base({ status: "AMBER", proof: "fallback active" });
    expect(enforceNoFalseGreen(amberWithProof).status).toBe("AMBER");
  });

  it("never promotes UNKNOWN to GREEN", () => {
    expect(enforceNoFalseGreen(base({ status: "UNKNOWN", proof: undefined })).status).toBe("UNKNOWN");
  });

  it("is idempotent", () => {
    const once = enforceNoFalseGreen(base({ proof: undefined }));
    expect(enforceNoFalseGreen(once).status).toBe("UNKNOWN");
    const greenOnce = enforceNoFalseGreen(base({}));
    expect(enforceNoFalseGreen(greenOnce).status).toBe("GREEN");
  });
});

describe("computeCanonicalTotals + invariant", () => {
  it("respects total = green + amber + red + quarantine + unknown", () => {
    const items: Array<{ status: string }> = [
      { status: "GREEN" }, { status: "LIVE" }, { status: "AMBER" },
      { status: "AMBER_REVERIFY" }, { status: "RED" }, { status: "QUARANTINE" },
      { status: "UNKNOWN" }, { status: "OPTIONAL_COVERED" }, { status: "ADAPTER_MISSING" },
    ];
    const t = computeCanonicalTotals(items);
    expect(t.total).toBe(9);
    expect(t.green).toBe(2); // GREEN + LIVE
    expect(t.amber).toBe(2); // AMBER + AMBER_REVERIFY
    expect(t.red).toBe(1);
    expect(t.quarantine).toBe(1);
    expect(t.unknown).toBe(3); // UNKNOWN + OPTIONAL_COVERED + ADAPTER_MISSING
    expect(totalsInvariantOk(t)).toBe(true);
    expect(t.total).toBe(t.green + t.amber + t.red + t.quarantine + t.unknown);
  });

  it("empty set is invariant-consistent", () => {
    const t = computeCanonicalTotals([]);
    expect(t.total).toBe(0);
    expect(totalsInvariantOk(t)).toBe(true);
  });
});

describe("enforceNoFalseGreenAll (batch)", () => {
  it("guards a batch and never increases the green count", () => {
    const items: GuardableItem[] = [
      base({ proof: undefined }),                  // → UNKNOWN
      base({ statusSource: "config" }),            // → UNKNOWN
      base({}),                                    // stays GREEN
      base({ status: "AMBER", proof: undefined }), // stays AMBER (jamais promu)
    ];
    const guarded = enforceNoFalseGreenAll(items);
    const greenBefore = computeCanonicalTotals(items).green;
    const greenAfter = computeCanonicalTotals(guarded).green;
    expect(greenAfter).toBeLessThanOrEqual(greenBefore);
    expect(greenAfter).toBe(1); // un seul GREEN légitime survit
  });
});
