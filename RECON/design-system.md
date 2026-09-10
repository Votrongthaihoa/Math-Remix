# Design-system evidence

## Public landing page, desktop 1920x855

- Primary family: `Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Repeated dark text colors: `rgb(10, 19, 48)` and `rgb(17, 24, 39)`.
- Repeated branded accents observed: red `rgb(205, 22, 39)`, green `rgb(21, 128, 61)`, blue `rgb(29, 78, 216)`.
- Repeated radii: 8px, 12px, 16px, 24px and pill.
- Common subtle shadow: `0 1px 2px rgba(0,0,0,.05)`; public header uses `0 2px 8px rgba(0,0,0,.08)`.

These are measurements, not yet final local tokens. Component-specific colors and typography still require page-by-page verification.

## Authenticated course page

- Expanded sidebar: 288px.
- Collapsed sidebar: 80px.
- Sidebar width transition: 500ms `cubic-bezier(0.22, 1, 0.36, 1)`.
- Main margin transition: 300ms `cubic-bezier(0.4, 0, 0.2, 1)`.
- Expanded topbar: approximately 81px; collapsed state measured approximately 73px on the current target.
- Brand accent on selected course navigation: soft green background plus green text/icon/right indicator.

Exact token normalization remains pending cross-route evidence.
