# retryfn

> Retry async functions with **exponential backoff, jitter, `AbortSignal`, per-attempt timeouts**, and **`Retry-After` awareness**. **Zero dependencies**.

[![CI](https://github.com/trananhtung/retryfn/actions/workflows/ci.yml/badge.svg)](https://github.com/trananhtung/retryfn/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@billdaddy/retryfn.svg)](https://www.npmjs.com/package/@billdaddy/retryfn)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@billdaddy/retryfn)](https://bundlephobia.com/package/@billdaddy/retryfn)
[![types](https://img.shields.io/npm/types/@billdaddy/retryfn.svg)](https://www.npmjs.com/package/@billdaddy/retryfn)
[![license](https://img.shields.io/npm/l/@billdaddy/retryfn.svg)](./LICENSE)

Transient failures are a fact of life: a dropped connection, a `429 Too Many
Requests` from an LLM API, a service that's briefly `503`. `retryfn` retries the
operation the right way — exponential backoff with jitter so you don't stampede,
**honoring the server's `Retry-After` header** when it sends one, with real
`AbortSignal` and per-attempt timeout support.

```ts
import { retry } from "@billdaddy/retryfn";

const data = await retry(
  async ({ signal }) => {
    const res = await fetch(url, { signal });
    if (res.status === 429 || res.status >= 500) {
      throw Object.assign(new Error(`HTTP ${res.status}`), { response: res });
    }
    return res.json();
  },
  { retries: 5, timeout: 10_000 },
);
```

If that `429` carried `Retry-After: 2`, the next attempt waits exactly 2 seconds —
not a guessed backoff.

## Why retryfn?

- **Server-aware.** Reads a `Retry-After` hint (seconds *or* HTTP-date, from a
  `Headers` object or a plain record) and waits exactly that long.
- **Cancellable.** Each attempt gets an `AbortSignal` driven by your `timeout` and
  your own external `signal` — forward it straight to `fetch`.
- **Good backoff by default.** Exponential growth with **full jitter**, capped by
  `maxDelay` and an optional total `maxElapsed` budget.
- **Precise control.** `shouldRetry(error)` to decide per-error, `onRetry` to
  observe, deterministic via an injectable `rng`.
- **Zero dependencies**, ESM + CJS + types, and a CLI to retry shell commands.

## Install

```bash
npm install @billdaddy/retryfn
# or: pnpm add @billdaddy/retryfn  /  yarn add @billdaddy/retryfn  /  bun add @billdaddy/retryfn
```

## API

### `retry(fn, options?) → Promise<T>`

`fn` receives `{ attempt, signal }`. Throw to trigger a retry; return to resolve.

| Option            | Type                                   | Default  | Description                                       |
| ----------------- | -------------------------------------- | -------- | ------------------------------------------------- |
| `retries`         | `number`                               | `3`      | Retries after the first try (4 attempts total).   |
| `minDelay`        | `number` (ms)                          | `200`    | Base delay for the first retry.                   |
| `maxDelay`        | `number` (ms)                          | `30000`  | Cap on a single computed delay.                   |
| `factor`          | `number`                               | `2`      | Exponential multiplier.                           |
| `jitter`          | `"full" \| "equal" \| "none"`          | `"full"` | Randomisation strategy.                           |
| `maxElapsed`      | `number` (ms)                          | —        | Total time budget across all attempts/waits.      |
| `timeout`         | `number` (ms)                          | —        | Per-attempt timeout (aborts the attempt signal).  |
| `signal`          | `AbortSignal`                          | —        | Cancel the whole operation.                       |
| `honorRetryAfter` | `boolean`                              | `true`   | Prefer a `Retry-After` hint over backoff.         |
| `shouldRetry`     | `(error, attempt) => boolean \| Promise` | retry all | Decide whether an error is retryable.           |
| `onRetry`         | `({error, attempt, delay}) => void`    | —        | Observe each scheduled retry.                     |

Throws the last error when retries are exhausted, `shouldRetry` returns `false`,
or the external `signal` aborts.

### `calcBackoff(attempt, options?, rng?) → number`

The backoff math on its own (zero-based `attempt`), exported for reuse and testing.

### `getRetryAfterMs(error, now?) → number | undefined`

Extract a `Retry-After` wait (ms) from an error: `error.retryAfterMs`,
`error.retryAfter` (seconds), or a `Retry-After` header on
`error.response.headers` / `error.headers`.

### `isAbortError(err) → boolean`

`true` for `AbortError` / `TimeoutError` thrown via an `AbortSignal`.

## Recipes

**Only retry network/5xx, never 4xx (except 429):**

```ts
await retry(call, {
  shouldRetry: (err) => {
    const s = (err as any).response?.status;
    return s == null || s === 429 || s >= 500;
  },
});
```

**Hard ceiling on total time:**

```ts
await retry(call, { retries: 20, maxElapsed: 15_000 });
```

## CLI

Retry a shell command until it succeeds:

```bash
retryfn -r 5 -- curl -fsS https://flaky.example.com/health
retryfn --min 1000 --factor 3 -- ./deploy.sh
```

## License

[MIT](./LICENSE) © Tung Tran
