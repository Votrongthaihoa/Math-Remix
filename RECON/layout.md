# Layout evidence

## Live target app shell

Across the authenticated desktop shell, including the course route:

- Sidebar: fixed at `(0,0)`, 288px wide, viewport height, z-index 40.
- Topbar: sticky at `(0,0)`, full viewport width, z-index 50.
- Main: normal-flow block with `margin-left: 288px`, visible overflow.
- Document: `html` was the scrolling element; `html`/`body` overflow computed to `visible`.
- Therefore the live target currently does not implement the independently scrolling fixed App Shell requested for the local product.
- The study route auto-collapsed the sidebar. During that capture no `main` landmark was exposed, and the sticky topbar sat above the viewport after navigation.
- At 390x844 on `/exam-rooms/hsa`, the sidebar measured 256px and moved off-canvas to x=-256. The document did not horizontally overflow.

## Local product decision boundary

The user separately requires the local authenticated dashboard to use a fixed topbar/sidebar and an independently scrolling main viewport. This is an explicit product requirement, even where it intentionally improves upon current target scroll ownership. The implementation must log this as a deliberate target/local difference and keep protected exam layouts isolated.
