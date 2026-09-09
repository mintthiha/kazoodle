import { describe, expect, it } from "vitest";
import { Backoff } from "./backoff";

describe("Backoff", () => {
  it("grows geometrically when jitter is off", () => {
    const b = new Backoff({ baseMs: 100, factor: 2, jitter: 0, random: () => 0.5 });
    expect(b.next()).toBe(100);
    expect(b.next()).toBe(200);
    expect(b.next()).toBe(400);
  });

  it("never exceeds maxMs", () => {
    const b = new Backoff({ baseMs: 1000, factor: 10, maxMs: 5000, jitter: 0, random: () => 0.5 });
    expect(b.next()).toBe(1000);
    expect(b.next()).toBe(5000); // 10_000 capped
    expect(b.next()).toBe(5000); // 100_000 capped
  });

  it("reset() restarts the sequence", () => {
    const b = new Backoff({ baseMs: 100, factor: 2, jitter: 0, random: () => 0.5 });
    b.next();
    b.next();
    b.reset();
    expect(b.attempt).toBe(0);
    expect(b.next()).toBe(100);
  });

  it("keeps jitter within +/- the configured fraction", () => {
    const low = new Backoff({ baseMs: 1000, jitter: 0.5, random: () => 0 }).next();
    const high = new Backoff({ baseMs: 1000, jitter: 0.5, random: () => 1 }).next();
    expect(low).toBe(500); // 1000 * (1 - 0.5)
    expect(high).toBe(1500); // 1000 * (1 + 0.5)
  });
});
