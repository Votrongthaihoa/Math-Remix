# AECK test coverage review — current working tree

## Evidence boundary

- Commit base: `e43c58ff0d62453e690d8d1306990150fe97bb2b` (`main`), with pre-existing dirty changes preserved.
- Runtime used for local verification: Node `v24.11.1`; CI remains pinned to Node `22.13.0` and must be rechecked on GitHub.
- Latest read-only GitHub `quality` run is successful for base commit `e43c58ff…`; it does not cover these uncommitted test changes.
- All new browser data is synthetic and loopback-only. No production Supabase/API, account, cookie, token, answer key, or personal data was used.
- No protected exam/question/answer/result/authoring component was modified by this coverage pass.

## Tests and browser evidence

- Full Node suite: `921` tests, `889` pass, `0` fail, `0` skipped, `32` TODO findings; exit code `0` because TODOs are intentionally represented as non-release evidence.
- Direct runtime additions: `tests/api-url.test.mjs`, `tests/security-server.test.mjs`, `tests/auth-client.test.mjs`, `tests/hls-route-behavior.test.mjs`, `tests/hls-vault.test.mjs`, and `tests/media-worker-behavior.test.mjs` now cover configuration, session, HLS access/throttle, safe vault/upload paths, auth fallback failures, and media gateway health behavior. Auth/rate-limit tests load one production module instance so cache-busted imports do not undercount coverage.
- Source/test manifest: `208` source modules and `84` test definitions; `37` test definitions contain direct imports and `36` are static source-reference guardrails. Static references are not counted as direct execution.
- Browser matrix: `120/120` pass across Chromium 1440, tablet 768, mobile 390/360/320, and WebKit. Each project has separate JSON and HTML report directories under `test-results/verify-*` and `playwright-report/verify-*`.

## Coverage gates

| Group | Tests | Pass | TODO | Line | Branch | Function | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| P0 | 92 | 67 | 25 | 100.00% | 100.00% | 100.00% | `BLOCKED_BY_TODO` |
| Runtime | 187 | 180 | 7 | 100.00% | 94.23% | 100.00% | `BLOCKED_BY_TODO` |
| All | 921 | 889 | 32 | 90.30% | 78.09% | 83.81% | `BLOCKED_BY_TODO` |

P0 TODOs and runtime TODOs identify real validation/auth/HLS/rate-limit defects; they were not changed or relabeled as passing. Runtime thresholds remain 85/75/85 and now pass numerically, but the group remains blocked by its seven executable TODO findings. This working tree is therefore not release-ready.

## Other gates

- Typecheck: pass.
- Lint: pass with `0` errors and `40` existing warnings.
- Vinext build: pass.
- Next/Vercel build: pass.
- Worker smoke: pass.
- Production dependency audit: current local run reports `0` high-severity vulnerabilities; GitHub still needs a workflow run for the dirty working tree because no commit/push was performed.
- Live Supabase/RLS/staging: not verified; no project-scoped MCP authorization was available.

## CI hardening included

- Playwright retries are limited to one in CI, `failOnFlakyTests` and `forbidOnly` are enabled, and CI traces use `on-first-retry`.
- HTML/JSON browser reports are parameterized per project instead of being overwritten by the next viewport run.
- CI Worker and browser jobs use `e2e/fixtures/synthetic-worker.env`; this fixture contains placeholders only and must never be replaced with production credentials.

## Known blockers and next safe step

1. Authorize and fix the 32 production findings (content-token claims/`iat`, resource-access fail-closed envelopes/relations, exam-preflight malformed metadata/relations, auth session generation, HLS content/deadline, and rate-limit error classification/normalization), then rerun P0/runtime/all coverage.
2. Run the workflow on GitHub Node 22 and confirm the synthetic env file, browser artifacts, and P0 release gate behave the same way.
3. Use a project-scoped Supabase staging/local stack before adding DB/RLS integration tests; do not connect production.
