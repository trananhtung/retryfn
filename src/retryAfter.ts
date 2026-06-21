/**
 * Best-effort extraction of a server-provided retry hint from a thrown error.
 *
 * Honours, in order:
 *  1. `error.retryAfterMs` — an explicit millisecond hint you attach yourself
 *  2. `error.retryAfter` — a number of **seconds**
 *  3. a `Retry-After` header on `error.response.headers` or `error.headers`
 *     (works with both a `Headers` object and a plain record), parsed as either
 *     an integer number of seconds or an HTTP date.
 *
 * Returns the wait in **milliseconds**, or `undefined` if no hint is present.
 */
export function getRetryAfterMs(error: unknown, now: number = Date.now()): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, any>;

  if (typeof e.retryAfterMs === "number" && e.retryAfterMs >= 0) return e.retryAfterMs;
  if (typeof e.retryAfter === "number" && e.retryAfter >= 0) return e.retryAfter * 1000;

  const headers = e.response?.headers ?? e.headers;
  const raw = readHeader(headers, "retry-after");
  if (raw == null) return undefined;

  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);

  const date = Date.parse(String(raw));
  if (Number.isFinite(date)) return Math.max(0, date - now);

  return undefined;
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const h = headers as { get?: (n: string) => string | null } & Record<string, unknown>;
  if (typeof h.get === "function") return h.get(name) ?? undefined;
  for (const key of Object.keys(h)) {
    if (key.toLowerCase() === name) return String(h[key]);
  }
  return undefined;
}
