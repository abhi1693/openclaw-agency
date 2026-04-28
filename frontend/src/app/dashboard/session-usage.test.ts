import { buildSessionUsageSummary, sessionUsageToneClass } from "./session-usage";

describe("session usage helpers", () => {
  it("builds a compact usage label and percent from token counts", () => {
    expect(buildSessionUsageSummary(32_100, 128_000, null)).toEqual({
      label: "32.1k/128.0k (25%)",
      percent: 25,
      toneClassName: "bg-emerald-500",
    });
  });

  it("prefers the payload percentage and clamps it", () => {
    expect(buildSessionUsageSummary(10, 100, 140)).toEqual({
      label: "10/100 (100%)",
      percent: 100,
      toneClassName: "bg-rose-500",
    });
  });

  it("maps usage thresholds to green, amber, and red", () => {
    expect(sessionUsageToneClass(49)).toBe("bg-emerald-500");
    expect(sessionUsageToneClass(50)).toBe("bg-amber-500");
    expect(sessionUsageToneClass(79)).toBe("bg-amber-500");
    expect(sessionUsageToneClass(80)).toBe("bg-rose-500");
  });

  it("handles missing usage data", () => {
    expect(buildSessionUsageSummary(null, null, null)).toEqual({
      label: "—",
      percent: null,
      toneClassName: "bg-slate-300",
    });
  });
});
