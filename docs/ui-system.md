# AECK UI system and route inventory

This document is the implementation source of truth for product-shell UI. It
records the route architecture, visual boundaries, canonical tokens and the
minimum contract for adding a screen. Business rules, API contracts and exam
rendering remain owned by their feature modules.

## Architecture

- Runtime: Next.js 16 App Router through Vinext/Vite, React 19 and TypeScript.
- Filesystem pages: `/` and `app/[...slug]/page.tsx`. The root is now the
  public AECK site; authenticated product entry remains `/dashboard`.
- Client dispatch: `PlatformApp` in `app/platform.tsx` maps the pathname to the
  rendered screen and supplies authentication, navigation and shell state.
- Route visual mode: `classifyUiRoute()` in `app/ui-route-mode.ts` is the
  explicit allowlist for `optimized-content`, `optimized-chrome-only` and
  `protected` surfaces.
- Legacy aliases: `app/admin-route-map.ts` redirects old administration URLs
  to canonical routes.
- Root layout: `app/layout.tsx`. There are no route groups, nested layouts or
  page-level error templates at this time.

The repository can render 62 canonical semantic UI route patterns (12 public
marketing/content routes plus the existing product patterns and fallback), 22
redirect-only compatibility patterns (20 administration aliases, `/portal`
and `/exam-result/:attemptId`) and 3 standalone HTML/embed surfaces.
`/guest/exam/:token` is a legacy URL that intentionally renders the same
protected guest surface instead of redirecting. API route handlers are not UI
routes and are intentionally excluded from this inventory.

## UI zones

| Zone | Shell | Visual mode | Rule |
| --- | --- | --- | --- |
| Public AECK site | Isolated public header/content/footer | public reference | Uses `.aeck-public-site` CSS Module scope, red wordmark and localized public assets. |
| Public account access | Standalone auth shell | optimized content | Uses isolated account/auth language. |
| Student product | Student sidebar and topbar | optimized content | Uses Alpha tokens and product primitives. |
| Admin operations | Admin sidebar and topbar | optimized content | Same foundation with denser operational layouts. |
| Exam catalogue | Product chrome + exam catalogue content | optimized chrome only | Only navigation chrome is standardized. |
| Account exam runner/result | Exam shell | protected | Preserve measured question, answer, submit and review UI. |
| Guest exam | Standalone guest shell | protected | Preserve identity, confirmation, runner and result flow. |
| Admin exam authoring | Admin/standalone authoring shell | protected | Preserve authoring, preview and result-review UI. |
| Embedded media/fallback | Standalone HTML or fallback page | isolated | Audit independently; never inherit broad product selectors. |

Global consistency applies to language, focus, feedback, interaction semantics
and safe text handling. Layout density can differ by zone when it supports the
task; consistency is semantic, not forced uniformity.

## Route/UI inventory

Status meanings: **Optimized** is opted into the shared product visual layer;
**Chrome** standardizes only product navigation; **Protected** is audited for
boundaries and intentionally unchanged; **Redirect** has no independent UI;
**Isolated** owns its own document and viewport.

### Public and student

| Route pattern | Main screen | Status |
| --- | --- | --- |
| `/` | Public homepage, teacher/honor carousels, course and article discovery | Public reference |
| `/giao-vien` | Teacher grid and profile modal | Public reference |
| `/goi-hoc-tap` | Package cards, detail modal and login handoff | Public reference |
| `/dang-ky-minh-chung` | Public evidence-registration handoff | Public reference |
| `/luyen-thi-tsa`, `/cau-truc-de-thi-tsa`, `/cach-tinh-diem-tsa` | TSA article template, FAQ and related reading | Public reference |
| `/luyen-thi-hsa`, `/cau-truc-de-thi-hsa`, `/dang-ky-thi-hsa` | HSA article template, FAQ and related reading | Public reference |
| `/dieu-khoan-dich-vu`, `/chinh-sach-bao-mat` | Legal content template | Public reference |
| `/portal` | Compatibility bridge to `/courses` | Redirect |
| `/login` | `LoginPage` | Optimized |
| `/forgot-password` | `ForgotPasswordPage` | Optimized |
| `/reset-password` | `ResetPasswordPage` | Optimized |
| unknown route | `app/not-found.tsx` | Isolated |
| `/dashboard` | `StudentDashboard` | Optimized |
| `/courses` | unified Alpha course catalogue with URL-backed TSA/HSA tabs, query and grid/list mode | Optimized |
| `/courses/:courseId` | course detail and curriculum disclosures | Optimized |
| `/lessons/:lessonId` | lesson curriculum and `VideoPlayer` | Optimized |
| `/exam-history` | attempt history and URL-backed search | Optimized |
| `/progress` | `StudentProgress`, year/type filters | Optimized |
| `/search` | `StudentSearchPage`, query/category filters | Optimized |
| `/tkb` | `StudentSchedulePage` | Optimized |
| `/profile` | profile editor and password dialog | Optimized |
| `/exam-room` | exam-room catalogue | Chrome |
| `/exam-room/:roomId` | exam list, mode/history dialogs | Chrome |

### Exam and guest boundaries

| Route pattern | Main screen/state | Status |
| --- | --- | --- |
| `/exam/:examUuid` | subject/session dashboard | Protected |
| `/exam/:examId/section/:sectionId` | active runner | Protected |
| `/exam/:examId/section/:sectionId/confirm` | pre-start confirmation | Protected |
| `/exam/result/:attemptId` | result and route-less review overlay | Protected |
| `/exam-result/:attemptId` | compatibility alias | Redirect |
| `/exam/:guestToken` | guest state machine | Protected |
| `/guest/exam/:guestToken` | legacy guest entry | Protected |

### Admin operations

| Route pattern | Main screen | Status |
| --- | --- | --- |
| `/admin` | operations dashboard and quick finder | Optimized |
| `/admin/students` | student list and account dialogs | Optimized |
| `/admin/content` | course catalogue and create dialog | Optimized |
| `/admin/content/courses/:courseId` | course/chapter/lesson/resource builder | Optimized |
| `/admin/hls-vault` | local/browser HLS encoding workflow | Optimized |
| `/admin/sessions` | session search, status filters and pagination | Optimized |
| `/admin/sessions/new` | four-step session wizard | Optimized |
| `/admin/timetable` | week calendar and room scheduling editor | Optimized |
| `/admin/audit` | audit filters, table and pagination | Optimized |
| `/admin/upload` | public/private image library | Optimized |
| `/admin/enrollments` | course and exam-room assignments | Optimized |
| `/admin/security` | user list, detail drawer and action confirmation | Optimized |
| `/admin/capabilities` | capability matrix | Optimized |
| `/admin/server-health` | integration health checks | Optimized |

### Protected administration

| Route pattern | Main screen | Status |
| --- | --- | --- |
| `/admin/exams` | room catalogue | Protected |
| `/admin/exams/rooms/new` | room creation | Protected |
| `/admin/exams/rooms/:roomId` | room workspace | Protected |
| `/admin/exams/rooms/:roomId/edit` | room editor | Protected |
| `/admin/exams/rooms/:roomId/exams/new` | exam creation | Protected |
| `/admin/exams/:examId` | exam workspace | Protected |
| `/admin/exams/:examId/access` | access-slot operations | Protected |
| `/admin/exams/:examId/policy` | release/regrade policy | Protected |
| `/admin/exams/:examId/questions/new` | question creation | Protected |
| `/admin/exams/:examId/questions/:questionId` | question editor | Protected |
| `/admin/exams/:examId/sections/:sectionId/editor` | LaTeX section editor | Protected |
| `/admin/exams/:examId/preview` | standalone exam preview | Protected |
| `/admin/exams/:examId/sections/:sectionId/preview` | standalone section preview | Protected |
| `/admin/question-bank` | bank/node/item authoring state machine | Protected |
| `/admin/sessions/:sessionId/results` | participant monitoring/results | Protected |

### Legacy redirects and isolated documents

Legacy prefixes accepted by the catch-all route are `question-bank`,
`item/create`, `exam-management`, `assessment-management`,
`exam-room-management`, `user-management`, `group-user-management`,
`course-management`, `media-management`, `exam-result-management`,
`irt-exam-management`, `evidence-registration-management`,
`subscription-package-management`, `shipment-management`, `tkb-management`,
`ilearn-management`, `admin-log`, `watermark-trace`, `server-health` and
`admin/all`. Destinations live in `app/admin-route-map.ts`.

Isolated documents are `/pdf-viewer.html`, `/yt-embed-player.html` and
`/404-eyes.html`. They own their viewport, focus and reduced-motion behavior.

## Canonical visual foundation

### Brand assets

- `public/logo_aeck_full.svg` is the exact full red mark served by
  `account.aeck.vn` (SHA-256 `beb17ac3…5456bb`). Use it on public account/auth
  surfaces where the wordmark and tagline have enough horizontal room.
- `public/logo_aeck.svg` is the exact green horizontal wordmark bundled by
  `alpha.aeck.vn` (SHA-256 `07b7b110…73ddf`). Use it while the product rail is
  expanded and in mobile chrome where the horizontal mark has enough room.
- `public/logo_aeck_compact.svg` is the supplied square green AECK mark
  (SHA-256 `f3169a6b…394d`). Use it only for the collapsed 80 px product rail;
  never shrink the horizontal wordmark into that square slot.
- `public/logo192.png` and `public/logo512.png` are the exact square red
  application marks served across AECK's current public/account/Alpha sites
  (SHA-256 `ebd54558…44111` and `a2223f6b…b138`). Use them only for browser,
  install, Apple touch, manifest, or social metadata that requires a square
  asset; do not stretch a horizontal wordmark into that role.
- Do not redraw any logo with live text, recolor it, crop it with
  `object-fit: cover`, or substitute a TSA/HSA/THPTQG mark. Keep intrinsic
  aspect ratio and reserve dimensions before loading.

`app/alpha-reference-portal.css` owns the canonical product values:

- Accent: `--alpha-accent` and hover/pressed/soft/selected states.
- Content: `--alpha-ink`, `--alpha-body`, `--alpha-muted`, `--alpha-subtle`.
- Surfaces: `--alpha-page`, `--alpha-line`, `--alpha-line-strong`.
- Rhythm: `--alpha-space-1/2/3/4/6/8`.
- Geometry: 40 px control, 44 px field, 10 px control radius, 16 px card
  radius and pill radius only for pill semantics.
- Feedback: `--alpha-focus` and semantic success/warning/danger aliases.

`app/product-design-system.css` is the final optimized-content cascade. It
maps old feature aliases to Alpha tokens without leaking into protected exam
content. New code should use `--alpha-*` or `--aeck-*` tokens and must not add
another product palette.

The Figma macOS reference in `AGENTS.md` is the visual source of truth when a
macOS-inspired component needs exact measurements. Previously observed alert
and button values are samples, not universal component rules.

## Component hierarchy

- Primitives: `app/aeck-ui.tsx` (`AeckButton`, `AeckIconButton`, field,
  headers, badge/status, card, dialog/drawer, table, pagination and states).
- Shell/layout: student/admin sidebar, topbar, mobile drawer and account menu
  in `app/platform.tsx`.
- Shared composites: `MacAlert`, `AdminDialog`, loading/security gates,
  discovery, dashboard and media player.
- Feature components: course, progress, timetable, audit, upload, security,
  sessions and capability modules.
- Protected feature components: files listed in the repository `AGENTS.md`.

Do not abstract business-specific components into primitives. Reuse a shared
primitive when semantic purpose and behavior match; use a feature component
when the data/flow contract is feature-specific.

## Contract for a new product route

1. Add the path shape to the catch-all allowlist and the client route map.
2. Classify it explicitly in `app/ui-route-mode.ts`; unknown routes stay
   protected by default.
3. Use `.ui-shell.student-app.product-shell` or the admin equivalent. Do not
   style `.exam-shell` from product CSS.
4. Use Alpha/AECK tokens and existing primitives. Do not add broad selectors
   such as `button`, `input`, `svg`, `body` or generic `.modal` overrides.
5. Provide one `h1`, visible labels, logical heading order, a keyboard path,
   visible `:focus-visible`, and recovery actions for errors/empty states.
6. Put filter/tab/pagination state in the URL when it changes what the screen
   represents. Navigation uses `Link`; actions use `button`.
7. Choose text behavior intentionally: `min-width: 0`, wrap prose, ellipsis
   only for intentionally compact labels, and `overflow-wrap` for identifiers.
8. Support 320 px reflow, 200% text zoom, coarse-pointer hit areas and
   `prefers-reduced-motion`.
9. Add loading, empty, error, disabled, hover, active and focus states before
   calling the screen complete.

## Verification

Minimum checks for a UI change:

```bash
npm run typecheck
npm run lint
npm run build
```

For rendered regression coverage, run `scripts/product-shell-ui-smoke.mjs`
with mock auth for both roles. The smoke inventory covers optimized routes,
desktop/mobile widths, long-text stress, interactions and protected-route shell
boundaries. Any change to a guarded shared file requires protected route images
at desktop and mobile before merge.

### Current route coverage tracker

| Zone | Coverage | Result |
| --- | ---: | --- |
| Public marketing/content | 12 routes + 404 fallback at 1440/768/390/320 | Audited and matched to the public AECK structure |
| Account access | login, signup query state, forgot and reset at 4 widths | Audited; signup stays inside the local app |
| Student product | 9 product patterns + 2 exam catalogue patterns at 8 widths | Migrated and visually checked |
| Account/guest exam boundary | 6 route templates at 1440/768/390/320 | Regression checked; protected internals unchanged |
| Admin operations | 14 route templates at 8 widths | Migrated and visually checked |
| Admin exam/authoring boundary | 15 route templates at 1440/768/390/320 | Regression checked; protected internals unchanged |
| Compatibility | 22 redirect patterns, including root/detail/deep course variants | Browser redirect checked |
| Standalone | PDF viewer, video embed and 404 canvas | Audited at desktop and mobile |

Latest browser evidence:

- Public/auth/standalone/redirect suite: 102 checks, no runtime, blank-page,
  image, accessible-name or horizontal-overflow failure.
- Full student suite: 139 checks, 0 runtime issues and 0 protected findings.
- Full admin suite: 323 checks, 0 runtime issues. One protected finding remains:
  the section answer preview toolbar exceeds the 320 px viewport. The direct
  preview and its styles are protected by `AGENTS.md`, so this is recorded as a
  blocker until a task explicitly authorizes question/answer preview changes.
- Chrome DevTools directly confirmed the 12 public reference routes and the
  current account redirects used by `alpha.aeck.vn` and `tsa.aeck.vn`.
