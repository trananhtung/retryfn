import { describe, expect, it, vi } from "vitest";
import { retry, isAbortError } from "../src/retry.js";

const fast = { minDelay: 1, maxDelay: 4, jitter: "none" as const };

describe("retry", () => {
  it("returns the result on first success", async () => {
    const fn = vi.fn(async () => 42);
    expect(await retry(fn, fast)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until success", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 3) throw new Error("fail " + n);
      return "ok";
    });
    expect(await retry(fn, fast)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting retries", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always");
    });
    await expect(retry(fn, { ...fast, retries: 2 })).rejects.toThrow("always");
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("passes the zero-based attempt number", async () => {
    const seen: number[] = [];
    let n = 0;
    await retry(
      async ({ attempt }) => {
        seen.push(attempt);
        if (++n < 3) throw new Error("x");
      },
      fast,
    );
    expect(seen).toEqual([0, 1, 2]);
  });

  it("respects shouldRetry === false", async () => {
    const fn = vi.fn(async () => {
      throw new Error("nope");
    });
    await expect(retry(fn, { ...fast, shouldRetry: () => false })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("invokes onRetry with the upcoming delay", async () => {
    const onRetry = vi.fn();
    let n = 0;
    await retry(
      async () => {
        if (++n < 2) throw new Error("x");
      },
      { ...fast, onRetry },
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({ attempt: 0, delay: 1 });
  });

  it("honours a Retry-After hint over computed backoff", async () => {
    const onRetry = vi.fn();
    let n = 0;
    await retry(
      async () => {
        if (++n < 2) throw { retryAfterMs: 3 };
      },
      { ...fast, onRetry },
    );
    expect(onRetry.mock.calls[0]?.[0].delay).toBe(3);
  });

  it("does not call fn when the signal is already aborted", async () => {
    const fn = vi.fn(async () => 1);
    const ac = new AbortController();
    ac.abort();
    await expect(retry(fn, { ...fast, signal: ac.signal })).rejects.toBeDefined();
    expect(fn).not.toHaveBeenCalled();
  });

  it("stops retrying when the external signal aborts mid-flight", async () => {
    const ac = new AbortController();
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      ac.abort();
      throw new Error("boom");
    });
    await expect(retry(fn, { ...fast, signal: ac.signal })).rejects.toBeDefined();
    expect(n).toBe(1); // aborted after first failure, no retry
  });

  it("aborts a hung attempt via per-attempt timeout", async () => {
    let aborted = false;
    const fn = ({ signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(signal.reason);
        });
      });
    await expect(retry(fn, { ...fast, retries: 0, timeout: 5 })).rejects.toBeDefined();
    expect(aborted).toBe(true);
  });

  it("isAbortError detects abort/timeout errors", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError(new DOMException("x", "TimeoutError"))).toBe(true);
    expect(isAbortError(new Error("plain"))).toBe(false);
  });
});
