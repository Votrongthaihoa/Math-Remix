# Responsive matrix

Required target evidence viewports:

| Width x representative height | Public | App shell | Main routes |
| --- | --- | --- | --- |
| 1920x855 | home initial verified | courses expanded/collapsed verified | courses initial verified |
| 1600 | pending | pending | pending |
| 1440 | pending | pending | pending |
| 1366 | pending | pending | pending |
| 1280 | pending | pending | pending |
| 1024 | pending | pending | pending |
| 768 | pending | pending | pending |
| 430 | pending | pending | pending |
| 390 | pending | verified HSA off-canvas shell | `/exam-rooms/hsa` verified |
| 360 | pending | pending | pending |

Temporary viewport overrides must be reset after each responsive batch.

Local validation completed:

- Public smoke: 1440, 768, 390 and 320px; 18 routes and 126 checks.
- Student/admin product smoke: 1440, 1280, 768, 740, 720, 390, 360 and 320px; study-specific drawer checks also cover 1100px and inline layout at 768px/320px.
- Local screenshot artifacts are under `artifacts/product-shell-ui-audit-student/` and `artifacts/product-shell-ui-audit-admin/`.
- Target authenticated mobile evidence: `/exam-rooms/hsa` at 390x844 had no horizontal document overflow; the 256px sidebar was off-canvas at x=-256. It remained visible to DOM/accessibility inspection.
- Authenticated tablet and the remaining target mobile routes are pending safe observations.
- The Chrome viewport was restored to 1428x847 after the narrow check.
