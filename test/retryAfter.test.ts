import { describe, expect, it } from "vitest";
import { getRetryAfterMs } from "../src/retryAfter.js";

describe("getRetryAfterMs", () => {
  it("returns undefined for non-objects / no hint", () => {
    expect(getRetryAfterMs(null)).toBeUndefined();
    expect(getRetryAfterMs(new Error("x"))).toBeUndefined();
  });

  it("reads an explicit ms hint", () => {
    expect(getRetryAfterMs({ retryAfterMs: 1500 })).toBe(1500);
  });

  it("reads a numeric seconds hint", () => {
    expect(getRetryAfterMs({ retryAfter: 3 })).toBe(3000);
  });

  it("reads Retry-After seconds from a Headers object", () => {
    const headers = new Headers({ "retry-after": "5" });
    expect(getRetryAfterMs({ response: { headers } })).toBe(5000);
  });

  it("reads Retry-After from a plain header record (case-insensitive)", () => {
    expect(getRetryAfterMs({ headers: { "Retry-After": "2" } })).toBe(2000);
  });

  it("parses an HTTP-date Retry-After", () => {
    const now = 1_000_000;
    const future = new Date(now + 4000).toUTCString();
    const ms = getRetryAfterMs({ headers: { "retry-after": future } }, now);
    // toUTCString truncates to whole seconds, so allow a small tolerance
    expect(ms).toBeGreaterThanOrEqual(3000);
    expect(ms).toBeLessThanOrEqual(4000);
  });

  it("never returns a negative wait for a past date", () => {
    const now = 2_000_000;
    const past = new Date(now - 10_000).toUTCString();
    expect(getRetryAfterMs({ headers: { "retry-after": past } }, now)).toBe(0);
  });
});
