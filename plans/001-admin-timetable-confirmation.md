# 001 — Replace browser confirmation for removing an exam-room schedule

- **Status**: DONE
- **Commit**: e43c58f
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Rule**: Web Interface Guidelines / destructive actions
- **Estimated scope**: 2 files, small

## Problem

`app/admin-timetable.tsx:188` deletes a room's schedule after `window.confirm`:

```tsx
<button type="button" className="admin-timetable-secondary-action" disabled={saving || !scheduled} onClick={() => { if (window.confirm("Gỡ lịch khỏi phòng thi này?")) void updateSchedule(null, null); }}>
  <Trash2 aria-hidden="true" />Gỡ lịch
</button>
```

The browser dialog is inconsistent with the rest of the product and cannot carry the room name or the operational effect. The repository already uses the accessible native-dialog-backed `MacAlert` for destructive operations, for example `app/admin-upload.tsx` and `app/admin-sessions.tsx`.

## Target

Use the existing `MacAlert` component rather than creating another overlay. Its established pattern is:

```tsx
{pendingItem ? <MacAlert
  open
  title="…"
  description="…"
  secondaryAction={{ label: "Hủy", onClick: () => setPendingItem(null), disabled: saving }}
  primaryAction={{ label: saving ? "Đang gỡ…" : "Gỡ lịch", onClick: () => void updateSchedule(null, null), disabled: saving }}
  onClose={() => { if (!saving) setPendingItem(null); }}
/> : null}
```

Store a local pending-confirmation boolean in `TimetableEditor`; the existing room prop supplies the room title. The primary action must clear the pending state only after a successful `updateSchedule`; failures retain the editor and show its existing inline error. The secondary action and Escape/close must never issue a PATCH request.

## Repo conventions to follow

- Import `MacAlert` from `../components/macos/MacAlert`, as `app/admin-sessions.tsx:6` does.
- Preserve the current `updateSchedule` abort controller, validation, button disabled states, and notices.
- `MacAlert` uses native `<dialog>`, preserves focus, and exposes labelled content; do not wrap it in another dialog or add global CSS.
- Keep all work in `app/admin-timetable.tsx`; this is a non-protected admin surface.

## Steps

1. Add the `MacAlert` import and a `pendingScheduleRemoval` state local to `TimetableEditor`.
2. Change the `Gỡ lịch` handler to set pending state only; remove `window.confirm`.
3. Render one `MacAlert` alongside the editor form. Its description must identify `room.title` and say that students will no longer see the room in the operational schedule; it must not claim to delete the room or exams.
4. Make the primary action call the existing `updateSchedule(null, null)`. Ensure success closes the dialog, while request failure leaves the dialog open so the inline error is actionable.
5. Add one focused test in `tests/reference-suite.test.mjs` or a new `tests/admin-timetable-ui.test.mjs`: assert the timetable no longer contains `window.confirm`, imports/renders `MacAlert`, and its remove trigger changes pending state rather than calling `updateSchedule` directly.
6. Re-read the diff and keep the editor's layout and protected exam routes untouched.

## Boundaries

- Do not change the timetable API, database, RLS, or data model.
- Do not alter protected exam runner, authoring, preview, question, answer, result, or review UI.
- Do not add global styles or a second modal implementation.

## Verification

- **Mechanical**: `npm run typecheck`; `npm run lint`; focused timetable test; `git diff --check`.
- **Behavior**: at `/admin/timetable`, enter the “Lịch phòng thi” tab, choose a scheduled room, activate “Gỡ lịch”, verify focus enters the alert and Escape/Hủy does not mutate data; confirm the primary action issues one PATCH and the existing success notice appears.
- **Responsive**: run `scripts/product-shell-ui-smoke.mjs` for `admin-timetable` at 1440, 390, and 320px; verify dialog actions remain reachable and no horizontal overflow occurs.
- **Done when**: there is no browser confirmation, the native dialog is keyboard operable, only confirmed removal mutates data, and all checks pass.
