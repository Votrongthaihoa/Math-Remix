# 002 — Give unscheduled exam rooms native table semantics

- **Status**: DONE
- **Commit**: e43c58f
- **Severity**: LOW
- **Category**: Accessibility
- **Rule**: react-doctor/prefer-tag-over-role
- **Estimated scope**: 2 files, medium

## Problem

`app/admin-timetable.tsx:349-355` presents tabular room data through generic elements and ARIA roles:

```tsx
<div className="admin-timetable-room-table" role="table" aria-label="Phòng chưa xếp lịch">
  <div className="admin-timetable-room-row admin-timetable-room-row-head" role="row"><span role="columnheader">Phòng thi</span>…</div>
  {visibleUnscheduledRooms.map(room => <div className="admin-timetable-room-row" role="row" key={room.id}>
    <span role="cell">…</span>
  </div>)}
</div>
```

The current scan reports `react-doctor/prefer-tag-over-role` at this surface. Native elements give screen readers reliable column associations without recreating ARIA table behavior. This table is on the non-protected admin timetable route.

## Target

Apply the canonical rule fix: replace generic elements with the native semantic structure and remove redundant roles. Use a contextually correct `<table>`, not `<menu>`:

```tsx
<table className="admin-timetable-room-table">
  <caption className="admin-timetable-visually-hidden">Phòng chưa xếp lịch</caption>
  <thead>
    <tr className="admin-timetable-room-row admin-timetable-room-row-head">
      <th scope="col">Phòng thi</th>
      …
    </tr>
  </thead>
  <tbody>
    {visibleUnscheduledRooms.map(room => <tr className="admin-timetable-room-row" key={room.id}>
      <td>…</td>
    </tr>)}
  </tbody>
</table>
```

Keep the row classes so the existing responsive visual layout remains the source of styling. If the mobile layout uses grid display, maintain the native table hierarchy and apply styles only through `.admin-timetable-*` selectors; do not re-add ARIA row/cell roles.

## Repo conventions to follow

- Follow `app/admin-reference-suite.css` scoping under `.ui-shell.admin-app.product-shell:not(.protected-exam-surface)`.
- Follow the visually-hidden naming already used by the timetable search label.
- Preserve intentional text handling (`title={room.title}`, description fallback, and mobile layout).
- The canonical React Doctor direction is: swap a generic element for the native semantic element and drop redundant role attributes; preserve accessible names and focus order.

## Steps

1. Inspect the complete desktop and `max-width` room-table CSS before editing markup.
2. Convert the outer container, header row, and data rows to `table`, `thead`, `tbody`, `tr`, `th`, and `td` as shown above; retain `key={room.id}` and all content/actions.
3. Add an accessible caption using the existing visually-hidden utility, and remove `role="table"`, `role="row"`, `role="columnheader"`, and `role="cell"` from this table only.
4. Adjust only the scoped room-table selectors necessary to preserve the desktop grid-like alignment and 320px reflow. Explicitly set native table defaults (border spacing/collapse, width, and any list/table margin) only under the timetable wrapper.
5. Add a focused structural test asserting the native table hierarchy, stable room key, caption, and absence of the redundant roles.
6. Capture before/after desktop and narrow screenshots to compare row wrapping, selected room state, and “Thiết lập” button reachability.

## Boundaries

- Do not convert the audit-log table in this plan; it has separate mobile card semantics and must be treated independently.
- Do not edit global table styles, protected exam UI, APIs, or Supabase.
- Do not hide columns solely to avoid overflow; retain the existing intentional responsive disclosure.

## Verification

- **Mechanical**: focused timetable test, `npm run typecheck`, `npm run lint`, and `git diff --check`.
- **Accessibility**: navigate the native table with a screen reader or browser accessibility tree; confirm each room row announces its column headers and the “Thiết lập” action retains its accessible name.
- **Visual**: run the admin timetable smoke at 1440, 768, 390, and 320px. Confirm no page overflow and that selected/unscheduled states look unchanged.
- **Done when**: the changed code no longer raises the targeted role diagnostic, table semantics are native, and visual/reponsive checks pass.
