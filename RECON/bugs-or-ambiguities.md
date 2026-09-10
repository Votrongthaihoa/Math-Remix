# Bugs and ambiguities

## Target scroll ownership versus requested local App Shell

- Target: app topbar is currently sticky and the document is the scroll owner on the verified course page.
- Local requirement: fixed topbar/sidebar, body locked, main content independently scrollable.
- Evidence: computed layout at 1920x855 on 2026-09-06.
- Decision: implement the explicit local fixed-shell requirement and document it as an intentional behavioral improvement, while preserving visual geometry.

## Target header height changes with collapse

- Target: measured approximately 81px expanded and 73px collapsed.
- Local requirement: one header-height token and synchronized shell geometry.
- Evidence: sampled during the 288px to 80px collapse animation.
- Decision: pending cross-route and breakpoint verification; avoid copying a likely incidental height shift without evidence that it is intentional.

## Sidebar state persistence

- Target: collapsed state reset to expanded after reload.
- Local earlier requirement: persist preference when appropriate.
- Decision: pending final architecture decision after responsive and product-route recon.

## Initial API capture

- Target: no fetch/XHR appeared in the first network-enabled course-page reload despite visible course content.
- Decision: inspect normal navigation and lazy chunks before inferring a data source.

## Study-route shell behavior

- Target: navigating to the observed `/course/study/[redacted]` route automatically collapsed the sidebar.
- Target: the capture exposed no `main` landmark, and the sticky topbar was above the viewport after navigation.
- Decision: treat these as observed target behavior/ambiguity, not as permission to weaken the local fixed-shell accessibility or scroll architecture.

## Sidebar selector ambiguity

- Target: some accessible names concatenate icon and visible-label text, so exact-name automation selectors are unreliable.
- Decision: local controls should retain concise explicit accessible names while matching the visible target labels.

## HSA submenu transition ambiguity

- Target: activating the HSA submenu from `/tkb` produced no observed route transition, while the dashboard `Xem tất cả` action successfully opened `/exam-rooms/hsa`.
- Decision: do not infer whether the submenu issue is route-specific, disabled state, or a target bug without another safe observation.

## Mobile off-canvas accessibility ambiguity

- Target: at 390x844 the 256px sidebar was positioned off-canvas at x=-256 and remained present in DOM/accessibility inspection.
- Decision: local implementation should prevent hidden navigation from becoming an unintended keyboard target while preserving the visual off-canvas behavior.

## Resolved local study-shell regressions

### Lesson navigation visibility

- Symptom: previous/next lesson navigation was hidden by the base product-shell rule, so desktop lesson edge navigation could not be exercised.
- Fix: base study navigation uses `display: grid`; phone and <=1023px inline curriculum layouts explicitly hide it.
- Evidence: `tests/study-experience.test.mjs`; student smoke passed at desktop, compact, tablet and phone widths.

### Compact curriculum focus

- Symptom: opening the 1024-1199px curriculum drawer could leave focus on `body` after the background became inert.
- Fix: scoped `LessonViewer` focus retry targets the dialog close action after the drawer commits; close restores the trigger.
- Evidence: drawer smoke passed with focus trap, background inertness, body lock/unlock and player stability.

### Schedule overflow audit classification

- Symptom: the audit treated the intentionally horizontally scrollable `.reference-week-grid` as a page-level overflow failure at 1280px.
- Fix: smoke audit recognizes `.reference-week-grid` as an allowed scroll region; product layout was not changed.
- Evidence: full student smoke passed with 144 checks.

## Remaining evidence limits

- Authenticated Chrome recon is complete for the seven safe routes and transitions listed in `routes.md`.
- Request headers, bodies, cookies, storage, personal response values, destructive flows, exam answers/submission, results, and solutions were not inspected.
- Loading, empty, error, modal, validation, and tablet states still require a naturally reachable safe flow before they can be described as live-target evidence.

## Protected section-preview narrow overflow

- Local protected regression recorded five controls outside the 320px viewport on the admin section preview.
- The page itself did not horizontally overflow and no unnamed controls or runtime errors were found.
- Decision: record only. The surface is inside the protected question/answer preview boundary and was not explicitly authorized for visual changes.
