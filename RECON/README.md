# AECK full-site reconstruction

Status: public recon, authenticated live-target shell recon, and local product-shell verification are complete for the current evidence scope. Chrome Control was repaired and used with the existing signed-in Chrome session; no auth bypass or credential extraction was attempted.

Targets:

- Public: `https://aeck.vn/`
- Authorized app: `https://alpha.aeck.vn/`
- Local implementation: `D:\\Aeck_Pre`

Evidence rules:

- Follow visible navigation and browser-observed routes only.
- Do not retain cookies, authorization headers, tokens, passwords, or personal response payloads.
- Remote backend source is not available; only observable browser contracts may be reconstructed.
- Preserve the repository's protected assignment/question/answer surfaces unless a later evidence-backed implementation explicitly requires a scoped change.

The `target/`, `local/`, `diffs/`, `dom/`, `network/`, and `traces/` folders contain sanitized artifacts only.

Latest public capture:

- `dom/public-routes-recon.json`: 17 routes discovered from visible homepage links, all returned HTTP 200.
- `network/public-routes-network.json`: sanitized request/resource map from those public routes.
- `target/public-routes/`: one 1440px full-page screenshot per discovered route.
- `target/public-home-*.png`: public landing-page desktop/tablet/mobile screenshots.

Local validation evidence:

- `scripts/public-ui-smoke.mjs`: 18 local public routes, 126 checks at 1440/768/390/320px.
- `scripts/product-shell-ui-smoke.mjs`: student run passed with 144 checks; admin run passed with 323 checks. Responsive shell, study flow, interaction and protected-route regression checks are included.
- `npm test`: production build plus 459 repository tests passed.
- Resumed student browser smoke: 46 checks across desktop/narrow product and protected routes, 0 runtime issues, 0 protected findings.
- Resumed admin protected regression: 61 checks across 1440/768/390/320px, 0 runtime issues; one pre-existing 320px section-preview overflow finding is retained without modification because that surface is protected.

Authenticated-app capture:

- Chrome Control verified `/dashboard`, `/courses`, a visible `/course/study/[redacted]` route, `/history`, `/tkb`, `/portal`, and `/exam-rooms/hsa` through normal visible navigation.
- Safe transitions covered dashboard to courses, courses to a read-only study detail and back, courses to history, history to timetable, the account menu to its account page, and dashboard to the HSA catalog. Logout, exam start/submit, answer selection, result review, and solution views were not invoked.
- `/exam-rooms/hsa` was checked at 390x844 and at desktop size. No horizontal document overflow was observed; the 256px sidebar was off-canvas on the narrow viewport. The viewport was restored to 1428x847.
- Browser console observations across the authenticated recon contained no warnings or errors.
- Final read-only Chrome Control handoff confirmed `https://alpha.aeck.vn/exam-rooms/hsa` at 1428x847 with no horizontal overflow and 0 console warnings/errors.
- Local authenticated smoke still uses only an in-memory/mock Supabase session; it remains local test evidence and is not presented as live backend evidence.
