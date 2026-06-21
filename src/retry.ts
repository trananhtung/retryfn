import { calcBackoff, type BackoffOptions } from "./backoff.js";
import { getRetryAfterMs } from "./retryAfter.js";

/** Context passed to the retried function on every attempt. */
export interface RetryContext {
  /** Zero-based attempt number (`0` is the first try). */
  attempt: number;
  /**
   * An `AbortSignal` that fires when the per-attempt `timeout` elapses or the
   * external `signal` aborts. Forward it to `fetch`, etc.
   */
  signal: AbortSignal;
}

/** Options for {@link retry}. Extends {@link BackoffOptions}. */
export interface RetryOptions extends BackoffOptions {
  /** Maximum number of retries AFTER the first attempt. Default `3` (4 tries total). */
  retries?: number;
  /** Total time budget in ms across all attempts and waits. */
  maxElapsed?: number;
  /** Per-attempt timeout in ms; aborts the attempt's `signal` when exceeded. */
  timeout?: number;
  /** External signal that cancels the whole operation (no further retries). */
  signal?: AbortSignal;
  /** Honour a `Retry-After` hint on the error over the computed backoff. Default `true`. */
  honorRetryAfter?: boolean;
  /** Decide whether to retry a given error. Default: retry all errors. */
  shouldRetry?: (error: unknown, attempt: number) => boolean | Promise<boolean>;
  /** Called before each wait, with the upcoming delay. */
  onRetry?: (info: { error: unknown; attempt: number; delay: number }) => void;
  /** Random source in `[0, 1)`; injectable for deterministic tests. */
  rng?: () => number;
}

/** `true` if `err` is an abort/timeout error from an `AbortSignal`. */
export function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")
  );
}

function abortError(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException("This operation was aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

function makeAttemptSignal(
  timeout: number | undefined,
  external: AbortSignal | undefined,
): { signal: AbortSignal; release: () => void } {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onExternalAbort = () => controller.abort(external?.reason);

  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }
  if (timeout && timeout > 0) {
    timer = setTimeout(
      () => controller.abort(new DOMException("Attempt timed out", "TimeoutError")),
      timeout,
    );
  }
  return {
    signal: controller.signal,
    release: () => {
      if (timer) clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(abortError(signal));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Run `fn` with retries, exponential backoff, and jitter.
 *
 * Designed for flaky I/O and rate-limited HTTP/LLM APIs: each attempt receives an
 * `AbortSignal` (driven by `timeout` and any external `signal`), and a server
 * `Retry-After` hint on the thrown error takes precedence over computed backoff.
 *
 * @example
 * ```ts
 * const res = await retry(
 *   async ({ signal }) => {
 *     const r = await fetch(url, { signal });
 *     if (r.status === 429) throw Object.assign(new Error("rate limited"), { response: r });
 *     return r;
 *   },
 *   { retries: 5, timeout: 10_000, signal: ac.signal },
 * );
 * ```
 *
 * @throws the last error once retries are exhausted, `shouldRetry` returns false,
 *   or the external `signal` aborts.
 */
export async function retry<T>(
  fn: (ctx: RetryContext) => Promise<T> | T,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const honorRetryAfter = options.honorRetryAfter ?? true;
  const rng = options.rng ?? Math.random;
  const start = Date.now();
  let attempt = 0;

  for (;;) {
    throwIfAborted(options.signal);

    const { signal, release } = makeAttemptSignal(options.timeout, options.signal);
    try {
      return await fn({ attempt, signal });
    } catch (err) {
      if (options.signal?.aborted) throw abortError(options.signal);
      if (attempt >= retries) throw err;

      const allow = options.shouldRetry ? await options.shouldRetry(err, attempt) : true;
      if (!allow) throw err;

      let delay = calcBackoff(attempt, options, rng);
      if (honorRetryAfter) {
        const hinted = getRetryAfterMs(err);
        if (hinted != null) delay = hinted;
      }

      if (options.maxElapsed != null && Date.now() - start + delay >= options.maxElapsed) {
        throw err;
      }

      options.onRetry?.({ error: err, attempt, delay });
      await sleep(delay, options.signal);
      attempt += 1;
    } finally {
      release();
    }
  }
}
