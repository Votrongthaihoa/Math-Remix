# Route inventory

Recon status values: `verified-live`, `bundle-observed`, `visible-link`, `pending`.

## Public

### `/`

- URL: `https://aeck.vn/`
- Status: verified-live
- Page: public landing page
- Auth: public page rendered within the currently signed-in browser session
- Entry: direct target URL
- Parent layout: public sticky header + page body + public footer
- Main visible modules: hero, teachers carousel, student honors, course rails, exam-information articles, footer/legal navigation, floating contact actions
- Scroll owner: document (`html`), observed at 1920x855 with scroll height about 4497px
- Metadata: Vietnamese page, canonical `https://aeck.vn/`
- Responsive and state coverage: pending

Visible-link route inventory is tracked in `route-map.json`; each page still requires its own state record.

The public visible-link set is complete for this capture: 17 secondary routes plus `/`, all observed at HTTP 200. The six secondary legal routes added during this pass are covered by local public smoke.

## Authenticated app

### Verified routes

- `/dashboard`
- `/courses`
- `/course/study/[redacted]` reached from a visible course action
- `/history`
- `/tkb`
- `/portal`
- `/exam-rooms/hsa`

All seven were reached with the existing authenticated Chrome session through direct entry or normal visible navigation. Their parent experience uses the app sidebar, topbar, and content region. The course list exposed a visible course card and lesson count; personal/content values are not copied into recon artifacts.

Safe transition evidence:

- dashboard -> courses
- courses -> read-only study detail -> browser back
- courses -> history -> timetable
- account menu -> account page; logout untouched
- dashboard `Xem tất cả` -> HSA exam catalog; no exam runner opened

Desktop shell evidence was observed around 1920x855 and 1428x847. `/exam-rooms/hsa` was also verified at 390x844 without horizontal document overflow.

The local catch-all now accepts these target-compatible entry aliases and redirects to existing local product surfaces. Protected runner/result/review/solution routes are unchanged.

## Bundle-observed but not safely verified route patterns

These strings were present in browser-delivered JavaScript and are not yet treated as live page verification:

- `/assessment-list/:examRoomId`
- `/assessment/:assessmentId`
- `/assessment/group`
- `/exam/test/:id`
- `/exam/test/combo/:assessmentId/:sectionKey`
- `/exam/result/:assessmentId`
- `/exam/group-result/:sessionId`
- `/exam-answer/:id`
- `/exam/confirm-info/:id`
- `/exam/confirm-info/combo/:assessmentId/:sectionKey`

These routes remain bundle-only until normal visible navigation or an already-observed target flow reaches them.

## Local implementation validation (not live-target evidence)

- Public: `/` plus 17 public secondary routes, four responsive widths, 126 checks.
- Student product shell: dashboard, courses, course detail, lesson/study, profile, history, progress, search, schedule and exam catalog shell; responsive smoke passed.
- Admin product shell: operational non-protected routes plus protected regression matrix; smoke passed with protected findings kept separate from blocking shell findings.
- Study responsive boundary: compact curriculum drawer at 1024-1199px; inline curriculum at 1023px and below; desktop previous/next lesson navigation visible, inline/mobile navigation hidden.
