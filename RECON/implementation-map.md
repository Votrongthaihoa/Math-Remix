# Target to local implementation map

Status: public implementation, authenticated target shell mapping, and local non-protected product-shell verification are complete for the current evidence scope.

Confirmed repository baseline:

- Next.js 16 + React 19 App Router.
- Public `/` renders the existing public site component.
- Most product routes resolve through the catch-all page and mount `PlatformApp`.
- Existing backend/auth architecture uses Supabase and server API routes.
- Existing exam/question/result areas include protected files and scoped visual boundaries.

Implemented in this pass:

- Public route registry and secondary legal pages are data-driven and isolated from protected exam UI.
- Evidence-backed authenticated aliases preserve target entry URLs while reusing the existing local surfaces: `/history`, `/portal`, `/course/study/:id`, and `/exam-rooms/:type` redirect to their local equivalents.
- Student study shell breakpoint behavior is explicit: drawer only at 1024-1199px, inline curriculum at <=1023px, desktop lesson navigation visible and phone/inline navigation hidden.
- Compact curriculum drawer focus is retried after DOM/inert updates and returns focus to its trigger on close.
- Public and product-shell Playwright smoke scripts cover responsive layout, interaction, overflow and runtime health.

Remaining:

1. Add live target state/API evidence only when a normal, safe visible flow exposes it.
2. Compare evidence-backed shell differences without copying target accessibility ambiguities.
3. Iterate only explicitly requested non-protected surfaces; preserve exam/question/result boundaries.

Exact local mappings are recorded in `component-map.json`; live-target mappings must not be inferred from local mocks.
