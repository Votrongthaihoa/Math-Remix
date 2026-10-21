# Repository Guardrails

These instructions apply to all work in this repository. Preserve existing user changes and follow the protected UI boundary below.

## Design source of truth

The visual design follows the existing Remix Study brand system (red-white palette, Lato font family). Design tokens are defined in `app/red-white-theme.css` and `app/alpha-reference-portal.css`. No external Figma file is used as a design reference.

When implementing new UI, use existing CSS custom properties (`--brand-*`, `--alpha-*`, `--admin-*`) from these files rather than inventing new color or spacing values.

## Supabase source of truth

When Supabase information is needed, use a project-scoped Supabase MCP connection as the source of truth for schemas, tables, columns, constraints, indexes, relationships, RLS, Auth configuration, Storage, Edge Functions, and current migration state. Prefer read-only MCP access for audits and analysis. Never guess backend structure from memory or stale local assumptions.

Do not apply migrations, execute destructive SQL, change RLS, modify production data, alter Auth configuration, or deploy Edge Functions unless the user explicitly authorizes that specific operation. Local migrations and source files may be read for history, but live Supabase MCP is preferred whenever current state matters. If MCP access is unavailable, report the limitation instead of guessing.

## Protected assignment/question/answer UI

The assignment/question/answer experience is a protected visual area. General product-shell work must not redesign, migrate, restyle, or visually normalize:

- question presentation and numbering
- answer choices and free-response fields
- answer state and question navigation
- test-taking and submit UI
- results, answer review, solutions, and explanations
- previews and protected question-authoring surfaces

Changing this area requires an explicit user request specifically targeting its behavior or appearance.

### Protected direct files

- `app/exam-room.tsx`
- `app/guest-exam.tsx`
- `components/thptqg/ThptqgExamRenderer.tsx`
- `components/thptqg/ThptqgSubjectDashboard.tsx`
- `components/thptqg/ThptqgConfirmation.tsx`
- `components/thptqg/ThptqgResult.tsx`
- `components/thptqg/GuestThptqgResult.tsx`
- `components/thptqg/ThptqgPreview.tsx`
- `components/remixstudyedu/MathExam.jsx`
- `components/remixstudyedu/ExamRendererAdapter.tsx`
- `components/remixstudyedu/LearnerExamPreview.tsx`
- `components/remixstudyedu/RemixStudyEduReviewPreview.tsx`
- `app/admin-exam-workspace.tsx`
- `app/admin-question-bank.tsx`

### Protected style and dependency files

- `app/exam-room.css`
- `app/guest-exam.css`
- `app/exam-themes.css`
- `app/exam-catalog-redesign.css`
- `app/exam-result-product.css`
- `app/exam-fullscreen-guard.tsx`
- `app/exam-fullscreen-guard.css`
- `app/account-security-guard.tsx`
- `components/thptqg/thptqg.css`
- `components/thptqg/thptqg-preview.css`
- `components/thptqg/thptqg-dashboard-reference.css`
- `components/remixstudyedu/math-exam.css`
- `components/remixstudyedu/learner-preview.css`
- `components/remixstudyedu/tsa-result.css`
- `components/remixstudyedu/tsa-result-overrides.css`
- `components/remixstudyedu/tsa-review-preview.css`
- `app/admin-exam-latex-import.css`
- `app/admin-exam-workspace.css`
- `app/admin-question-bank.css`
- `app/thptqg-admin.css`

### Shared guarded files

These files are high-risk because product-shell work may share them with exam routes. Before modifying one, explain why it is necessary, identify affected protected routes/components, keep the change scoped to non-exam UI, avoid generic/global selector changes, and validate exam UI afterward:

- `app/platform.tsx`
- `app/layout.tsx`
- `app/globals.css`
- `app/ui-system.css`
- `app/loading-indicator.tsx`

Never modify shared global styling merely for convenience.

## CSS isolation

New product-shell UI must be isolated to explicitly approved application surfaces. Prefer the existing specific product wrapper:

`.ui-shell.student-app.product-shell`

Preserve `.exam-shell` as a separate visual boundary. Scope new variables beneath the product wrapper. Do not add broad global rules such as `button`, `input`, `textarea`, `select`, `svg`, `body`, or `h1`, and do not globally replace `.primary-btn`, `.modal`, `.sidebar`, or `.topbar`. Use uniquely scoped or prefixed selectors for new styling.

## Text safety is mandatory

Accidental text overflow is a failure. Every new or modified non-protected component must intentionally choose whether content grows, wraps, truncates, scrolls, or remains fixed. Pay attention to flex/grid children, `min-width` and `min-width: 0`, fixed dimensions, `nowrap`, overflow, ellipsis, `word-break`, `overflow-wrap`, and localized labels.

Do not use `overflow: hidden` as a generic sizing fix, reduce font size arbitrarily, or add arbitrary fixed heights to conceal overflow. Truncation is allowed only when intentional UX behavior. Test relevant UI with short, normal, long English, long Vietnamese, long unbroken strings where meaningful, narrow viewports, and desktop viewports.

## Responsive and visual validation

Playwright is installed in this repository. After future frontend implementation, run the application and use Playwright to inspect relevant pages at desktop and narrow viewports, capture screenshots where useful, check overflow and clipping, and check protected UI for visual regressions. Do not call frontend work complete merely because TypeScript compiles.

## Potential redesign boundary

Potential does not mean automatically authorized. Future tasks may modify only the explicitly requested surface.

Potentially safe product-shell surfaces in `app/platform.tsx`:

- sidebar/navigation
- topbar/account menu
- dashboard
- courses and course details
- lesson viewer
- profile
- non-review history summary

Other potential non-exam candidates:

- `app/admin-security.tsx`
- `app/admin-sessions.tsx`
- `app/admin-upload.tsx`
- `app/student-redesign.css`
- `app/product-polish.css`
- `app/text-overflow-polish.css`
- `app/admin-redesign.css`
- `app/admin-operation-polish.css`
- `app/study.css`

Exam runners, question authoring, answer review, solution display, and related protected components remain outside general redesign scope.

## Preserve user work

The repository may contain pre-existing uncommitted changes. Run `git status --short` before substantial implementation and afterward, and report which changes belong to the current task. Never discard user changes. Do not run `git reset --hard`, `git checkout .`, `git restore .`, or `git clean` unless explicitly requested.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
