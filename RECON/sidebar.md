# Sidebar evidence

## Expanded

- Width: 288px.
- Fixed to full viewport height.
- Width transition: 500ms with `cubic-bezier(0.22, 1, 0.36, 1)`.
- Top-level item measurements observed: 44px or 48px high; nested items 36px high.
- Navigation groups: Tổng quan; Phòng khảo thí with HSA/QDA/BCA children; Khoá học with HSA/QDA/BCA children; Lịch sử thi; Thời khóa biểu.

## Collapsed

- Width: 80px.
- Icons remain; labels/chevrons are visually hidden.
- Full AECK logo changes to a compact stacked mark, rather than being squeezed.
- Main offset becomes 80px.
- Toggle follows the moving sidebar edge.
- Hovering Tổng quan produced an Ant tooltip to the right around x=91, z-index 10000.
- Collapsed icon-only top-level controls lose useful accessible names in the current target; local implementation should improve this without changing the visual.

## Route and responsive behavior

- The observed study-detail navigation automatically collapsed the sidebar.
- On `/exam-rooms/hsa` at 390x844, the sidebar was 256px wide and positioned off-canvas at x=-256.
- The off-canvas sidebar remained represented in DOM/accessibility inspection; local keyboard inertness must therefore be tested explicitly.
- Some target accessible names combine icon and visible-label text. Local explicit labels are an intentional accessibility improvement.

## Persistence

Reloading after collapse returned the target to expanded. No target persistence is currently confirmed.
