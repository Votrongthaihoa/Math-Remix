# Completion matrix

This matrix is scope-aware. Authenticated rows reflect only the normal, read-only flows reached through the existing signed-in Chrome session; protected exam interaction and unobserved states remain explicitly out of scope.

| Route/surface | Recon | Screenshot | Components | Desktop | Tablet | Mobile | Interaction | API/backend | Loading/empty/error | A11y | Visual/E2E |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public `/` and 17 visible secondary routes | pass | target 1440 + local responsive | pass | pass | pass | pass | pass | public calls sanitized | public smoke states | pass | 126 local checks |
| Authenticated app shell and seven safe routes | pass for visible states | desktop observed | pass for shell map | pass target/local | pending target tablet | HSA catalog at 390px | safe navigation pass | sanitized surface only | pending target | pass for inspected controls | local shell pass |
| Local app shell | pass | local artifacts | pass | pass | pass | pass | pass | n/a/mock smoke | pass | pass | 144 student + 323 admin checks |
| Local dashboard/course/study | pass | local artifacts | pass | pass | pass | pass | pass | mock smoke | pass | pass | pass |
| Exam navigation/runner/result | regression-only | local protected artifacts | existing protected components | regression pass | regression pass | regression pass | no destructive flow | existing APIs | regression fixtures | pass | protected findings separated |
| History | verified live + local | local artifacts | pass | pass | pass local | pass local | live transition pass | mock smoke only | pass local | pass | pass |
| Schedule | verified live + local | local artifacts | pass | pass | pass local | pass local | live transition pass | mock smoke only | pass local | pass | pass |
| Account menu/page | verified live + local | target observed | pass | pass | pass local | pass local | open/account pass; logout untouched | not inspected | pass local | pass | pass |
| Public secondary routes | pass | target 1440 screenshots | pass | pass | pass | pass | pass | public smoke | pass | pass | 126 local checks |

Latest verification: production build and 459/459 repository tests passed. Focused student browser smoke passed 46 checks with no runtime/protected findings. Admin protected regression passed 61 checks with no runtime errors and retained one known 320px section-preview overflow finding inside the protected author-preview boundary.
