/** Backoff configuration shared by {@link calcBackoff} and the retry options. */
export interface BackoffOptions {
  /** Multiplier applied per attempt. Default `2` (exponential). */
  factor?: number;
  /** Base delay in ms for the first retry. Default `200`. */
  minDelay?: number;
  /** Maximum delay in ms for a single wait. Default `30000`. */
  maxDelay?: number;
  /**
   * Jitter strategy:
   * - `"full"` (default): random delay in `[0, computed]` — best for thundering-herd avoidance
   * - `"equal"`: `computed/2 + random(0, computed/2)`
   * - `"none"`: deterministic exponential delay
   */
  jitter?: "full" | "equal" | "none";
}

/**
 * Compute the backoff delay (ms) for a zero-based retry `attempt`.
 *
 * Attempt `0` is the first retry (delay ≈ `minDelay`), attempt `1` the second, etc.
 * The exponential value `minDelay * factor^attempt` is clamped to `maxDelay`, then
 * jittered per the chosen strategy.
 *
 * @param attempt - Zero-based retry index.
 * @param opts - See {@link BackoffOptions}.
 * @param rng - Random source in `[0, 1)`; injectable for deterministic tests.
 */
export function calcBackoff(
  attempt: number,
  opts: BackoffOptions = {},
  rng: () => number = Math.random,
): number {
  const factor = opts.factor ?? 2;
  const min = opts.minDelay ?? 200;
  const max = opts.maxDelay ?? 30_000;
  const jitter = opts.jitter ?? "full";

  const exp = Math.min(max, min * Math.pow(factor, Math.max(0, attempt)));

  if (jitter === "none") return Math.round(exp);
  if (jitter === "equal") return Math.round(exp / 2 + rng() * (exp / 2));
  return Math.round(rng() * exp); // full jitter
}
