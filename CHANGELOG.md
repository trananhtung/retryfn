# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-21

### Added

- `retry` — retry an async function with exponential backoff, jitter, per-attempt
  `AbortSignal` + `timeout`, external `signal`, `maxElapsed` budget, `shouldRetry`,
  and `onRetry`.
- `Retry-After` awareness: a server hint (seconds or HTTP-date, `Headers` or plain
  record) overrides computed backoff.
- `calcBackoff` (full / equal / none jitter) and `getRetryAfterMs` exported
  standalone; `isAbortError` helper.
- `retryfn` CLI to retry shell commands with backoff.
- ESM + CJS builds, types, and CI across Node 18 / 20 / 22.
