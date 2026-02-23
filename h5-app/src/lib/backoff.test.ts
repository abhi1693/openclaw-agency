import { describe, expect, it } from "vitest";
import { createExponentialBackoff } from "./backoff";

describe("createExponentialBackoff", () => {
  it("starts at attempt 0", () => { const b = createExponentialBackoff(); expect(b.attempt()).toBe(0); });
  it("first delay >= baseMs", () => { const b = createExponentialBackoff({ baseMs: 1000, jitter: 0 }); expect(b.nextDelayMs()).toBeGreaterThanOrEqual(1000); });
  it("increments attempt", () => { const b = createExponentialBackoff(); b.nextDelayMs(); expect(b.attempt()).toBe(1); });
  it("resets attempt", () => { const b = createExponentialBackoff(); b.nextDelayMs(); b.reset(); expect(b.attempt()).toBe(0); });
  it("caps at maxMs", () => { const b = createExponentialBackoff({ baseMs: 1000, maxMs: 5000, jitter: 0 }); for (let i = 0; i < 20; i++) expect(b.nextDelayMs()).toBeLessThanOrEqual(5000); });
});
