import { describe, expect, it } from "vitest";
import { calcBackoff } from "../src/backoff.js";

describe("calcBackoff", () => {
  it("grows exponentially with no jitter", () => {
    const o = { minDelay: 100, factor: 2, jitter: "none" as const };
    expect(calcBackoff(0, o)).toBe(100);
    expect(calcBackoff(1, o)).toBe(200);
    expect(calcBackoff(2, o)).toBe(400);
    expect(calcBackoff(3, o)).toBe(800);
  });

  it("clamps to maxDelay", () => {
    expect(calcBackoff(10, { minDelay: 100, factor: 2, maxDelay: 1000, jitter: "none" })).toBe(
      1000,
    );
  });

  it("full jitter spans [0, computed]", () => {
    const o = { minDelay: 100, factor: 2, jitter: "full" as const };
    expect(calcBackoff(1, o, () => 0)).toBe(0);
    expect(calcBackoff(1, o, () => 0.999999)).toBe(200);
  });

  it("equal jitter spans [computed/2, computed]", () => {
    const o = { minDelay: 100, factor: 2, jitter: "equal" as const };
    expect(calcBackoff(1, o, () => 0)).toBe(100);
    expect(calcBackoff(1, o, () => 1)).toBe(200);
  });
});
