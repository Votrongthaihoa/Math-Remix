# 003 — Stabilize timetable week labels across server and client

- **Status**: DONE
- **Commit**: e43c58f
- **Severity**: MEDIUM
- **Category**: Bugs & correctness
- **Rule**: react-doctor/no-locale-format-in-render
- **Estimated scope**: 2 files, small

## Problem

`app/student-discovery.tsx:453` formats the timetable week label inside render using the runtime timezone:

```tsx
const weekLabel = `${days[0].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} – ${days[6].toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
```

This client component is SSR-capable. The server's timezone can differ from the learner's browser, yielding a hydration mismatch and, around a day boundary, a visibly different week range. The repository already centralizes Vietnamese timezone-safe formatting in `app/ui-format.ts` with `Asia/Ho_Chi_Minh`.

## Target

Apply the canonical correction by using an explicit locale and timezone, through a shared formatter, so server and first client render match. Add a small `formatUiWeekRange(start, end)` utility at module scope in `app/ui-format.ts` backed by a module-scoped `Intl.DateTimeFormat("vi-VN", { timeZone: UI_TIME_ZONE, … })`; then render:

```tsx
const weekLabel = formatUiWeekRange(days[0], days[6]);
```

The helper must preserve the current `DD/MM – DD/MM/YYYY` Vietnamese label and provide a safe fallback for invalid dates. Do not defer this label until after mount because a stable server-compatible formatting option is already available.

## Repo conventions to follow

- Follow the module-scoped formatter and `parsedDate` validation pattern in `app/ui-format.ts:1-58`.
- Keep `UI_TIME_ZONE` as the canonical `Asia/Ho_Chi_Minh` value; do not hardcode a second timezone in `student-discovery.tsx`.
- Use the existing `formatUiDate`, `formatUiTime`, and `formatUiWeekday` naming and fallback conventions.

## Steps

1. Add the two required module-scoped date formatters or a single range-compatible helper in `app/ui-format.ts`, with explicit `vi-VN` and `UI_TIME_ZONE` options.
2. Export a `formatUiWeekRange` helper that validates both endpoints via the existing parsing routine, formats the start as day/month and end as day/month/year, and returns the existing fallback format when either is invalid.
3. Import and use this helper at `app/student-discovery.tsx:453`; remove the render-time `toLocaleDateString` calls.
4. Add a focused test with an ISO time near midnight UTC that asserts a stable Ho Chi Minh range, plus an invalid-date fallback. Place it with existing `ui-format` or student timetable coverage.
5. Confirm `StudentSchedulePage` still labels the current and next week correctly when changing `weekOffset`.

## Boundaries

- Do not change schedule fetching, course eligibility, joining behavior, or timetable placement calculations.
- Do not change any protected exam route or globally alter `Date` behavior.
- Do not use `suppressHydrationWarning`; the label can be made deterministic.

## Verification

- **Mechanical**: focused date/timetable test, `npm run typecheck`, `npm run lint`, and `git diff --check`.
- **React Doctor**: run the changed scope and confirm the targeted `no-locale-format-in-render` occurrence no longer originates from `app/student-discovery.tsx`.
- **Behavior**: open `/tkb` at 1440 and 390px, move to previous/next week, and confirm the label, grid days, and current-week action remain synchronized without horizontal overflow.
- **Done when**: server/client date text is deterministic in `Asia/Ho_Chi_Minh`, invalid dates are safe, and all checks pass.
