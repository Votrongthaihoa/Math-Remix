# AECK Platform workspace

This is the staged React/Vite/Cloudflare Worker replacement surface. It runs beside the existing root Next/Vinext application; it does not relocate or replace the legacy app.

## Architecture

- React 19 + React Router Data Router
- TanStack Query for server state
- Zustand for the minimal authenticated UI snapshot
- Native `fetch` with Zod-parsed `ApiResult` envelopes
- Hono routes on a Cloudflare Worker
- Tailwind 4 theme/utilities plus isolated product CSS
- Shared contracts from `@aeck/contracts`

The student and admin shells were inferred from `D:\New folder\newdata` and `D:\New folder\admin`. Their compiled/minified CSS and JavaScript are references only and are not copied into this workspace.

## Local commands

From the repository root:

```sh
npm run dev:platform
npm run dev:platform:admin
npm run test:platform
npm run typecheck:platform
npm run build:platform
npm run build:platform:production
```

The two development commands select the explicit Cloudflare `preview` environment and enable a development-only session. Preview dashboard fixtures are compiled only into preview builds. The production build excludes the fixture chunk.

## Data boundary

- `DATA_MODE=preview` serves reference fixtures for visual QA.
- `DATA_MODE=upstream` forwards dashboard requests to the configured legacy origin at `/api/platform/dashboard`.
- `DATA_MODE=disabled` returns a typed `UPSTREAM_UNAVAILABLE` result.
- `/api/*` runs Worker-first; SPA navigation falls back to `index.html`.
- No secret is stored in `wrangler.jsonc`.

`LEGACY_API_ORIGIN` and the corresponding legacy dashboard endpoint must be configured before production traffic is switched. Supabase schema work is deliberately deferred until a project-scoped Supabase MCP connection can verify the live schema. No migration is created by this workspace.

## Protected visual boundary

Exam runners, questions, answers, result/review screens, and question authoring are not ported or restyled here. Their routes render a migration handoff and can open the current app when `VITE_LEGACY_APP_ORIGIN` is set. The existing ECDH P-256 + HKDF-SHA256 + AES-GCM exam flow remains in the root application unchanged.
