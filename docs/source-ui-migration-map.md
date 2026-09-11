# Source UI migration map

## Scope and source format

The authorized source at `D:\fbbbbbbbbbbbbb` contains 20 saved HTML snapshots, not an original React/package source tree. The migration therefore reuses the source's actual rendered DOM contract, Tailwind/Ant output values, embedded SVG paths, logo assets, typography, and computed CSS. It does not claim that React components were available in the source.

The canonical shell is `exam-rooms/286a3b26-5e40-4e92-b9cd-f03acbba4da0.htm`, the exact page supplied by the user. Collapsed behavior is cross-checked against `course/64f5dba7-df93-40d9-acef-26a8a461f2cd.htm`, and modal values against `exam-rooms/f5f1ce20-a519-4a7e-972e-89de20d1e04b.htm`.

## Source implementation to target mapping

| Source implementation | Exact source contract reused | Target integration |
| --- | --- | --- |
| Fixed `aside` shell | 288px expanded, 80px collapsed, white/90, 4px blur, z-index 40, 500ms source easing | Existing `aside.sidebar.admin-sidebar` in `app/platform.tsx` |
| Sticky `header` shell | Full viewport width, 81px expanded, 73px collapsed, white/80, 12px blur, z-index 50 | Existing `header.topbar.admin-topbar` |
| Sidebar/header seam | 2px divider at x=287/x=79 | Real `.source-sidebar-header-divider` child of the target header |
| Shell toggle | 32px square at x=295/x=85, 8px radius | Existing stateful `.header-sidebar-toggle`; business state unchanged |
| Brand | Existing source-matching AECK full and compact red marks | Existing `/logo_aeck_red.svg` and `/logo_aeck_compact_red.svg` |
| Navigation rows | 44px row, `12px 16px 12px 24px`, 3px end border, exact active red and red-50 | Existing route-aware `Link` navigation and active state |
| Ant navigation icons | Exact SVG path implementations found in the target's `ReferenceSidebarIcon` | Reused for mapped source icons; Lucide remains only where no source equivalent exists |
| Main canvas | Sidebar-relative start; 32/48/56px source breakpoints; 16px mobile adapter | Existing `.main-content`; all page data/state children retained |
| Page headings | Lato 700, 30/36px | Existing admin page header classes |
| Cards/panels | white, `#e5e7eb`, 12px radius, source shadow-md | Existing admin card/panel classes |
| Primary controls | `#cd1627`, 36px minimum height, `8px 20px`, 8px radius, Lato 600 14/20 | Existing action classes and handlers |
| Form fields | 40px minimum height, `7px 11px`, `#d9d9d9`, 8px radius, Lato 16/24 | Existing inputs/selects/textareas |
| Tables | Ant-derived header/body colors, 16px cells, intentional horizontal scroll | Existing native and `.admin-table` structures |
| Modal/dropdown | Source Ant 8px radius and three-layer shadow | Existing modal/account-menu state and focus handling |

All visual rules live in `app/admin-source-reference.css` and are rooted at:

```css
.app-shell.ui-shell.admin-app.product-shell.source-admin-shell:not(.protected-exam-surface)
```

This keeps exam/question/answer/result/review/authoring routes outside the migration. Mobile uses the target's existing accessible drawer behavior as a narrow-screen adapter while retaining source colors, navigation rows, logo, typography, and controls.

## Target route mapping

The shared source shell is used without changing URLs or route state on:

- `/admin`
- `/admin/content` and course detail routes
- `/admin/hls-vault`
- `/admin/sessions` and the session creation flow
- `/admin/timetable`
- `/admin/students`
- `/admin/enrollments`
- `/admin/upload`
- `/admin/security`
- `/admin/audit`
- `/admin/capabilities`
- `/admin/server-health`

Protected routes such as `/admin/exams`, exam runners, results, previews, and exam authoring workspaces keep their protected presentation boundary. `/admin/question-bank` was explicitly approved for presentation migration and now uses the source Admin shell while retaining its bank/node/item state and API behavior.

## Complete source inventory

The reproducible scanner is `scripts/source-ui-inventory.mjs`; its generated evidence is `audit/source-ui-inventory.json`. The 20 inputs are:

- `course/34aa98e9-4ff8-46f9-95c3-930e6d17a3c1.htm`
- `course/51e6ed96-dbe2-49ea-ba3b-60b598e0b1e5.htm`
- `course/64f5dba7-df93-40d9-acef-26a8a461f2cd.htm`
- `course/6e740fa1-57cd-4a55-9442-400ee2250046.htm`
- `course/805e0dbd-fca7-4341-9ea9-e69e39a11198.htm`
- `course/947f3f49-f56b-46ce-a49c-f38d17c9ded4.htm`
- `course/a4865712-baaf-410a-ad6c-f67e755a6aa0.htm`
- `course/c6e2f517-2315-4e62-9cf7-19ecbe449ba6.htm`
- `course/caf537d8-62f5-4221-a543-3f8e245ae744.htm`
- `exam-rooms/286a3b26-5e40-4e92-b9cd-f03acbba4da0.htm`
- `exam-rooms/76394bc8-112f-4e6a-9879-97e4e6f944d6.htm`
- `exam-rooms/ba7d1922-5704-4db9-ba89-0a74b2038ed0.htm`
- `exam-rooms/f5f1ce20-a519-4a7e-972e-89de20d1e04b.htm`
- `history/28288457-fe33-4455-93fd-b37f60bf5c6a.htm`
- `history/d9ff2fed-77ba-4ea0-920b-a74208c8576a.htm`
- `loadingpage/dd087b89-c667-4ee9-a7ad-056beb75632b.htm`
- `loadingpage/ffabf47d-ffe2-445f-a21a-5159267e5c5f.htm`
- `portal/b32c4708-c1c6-4b92-bcb6-3177bad1662d.htm`
- `portal/c10dd3bb-9c41-4e54-9103-a4f96384bfc3.htm`
- `tkb/8ff4714f-4978-4fb4-af0f-9c847c0da40f.htm`

The source directory remains read-only and unmodified.
