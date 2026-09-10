# Skills used

| Skill | Source | Version/license | Purpose | Reason chosen |
| --- | --- | --- | --- | --- |
| `chrome:control-chrome` | OpenAI bundled Chrome plugin | plugin `26.901.41600` | Reuse and inspect the currently signed-in Chrome session | Required for live authenticated evidence without launching another browser |
| `clone-website` | Local Codex skill | version not declared in entrypoint | Evidence-first authorized site capture/rebuild workflow | The mission is a high-fidelity full-site reconstruction |
| `ui-design` | Local Codex skill | local skill metadata | Production UI implementation guidance | Used after recon to avoid generic or speculative design |
| `better-layout` | Repository skill | local repository skill | Adaptive layout and scroll-ownership review | App Shell and breakpoint behavior are P0 requirements |
| `better-ui` | Repository skill | local repository skill | Interaction, state and motion review | Target fidelity includes hover/dropdown/collapse motion |
| `better-accessibility` | Repository skill | local repository skill | Keyboard, ARIA, focus and responsive accessibility | Required for drawer, menus, tooltips and forms |
| `vercel-react-best-practices` | Vercel repository skill | 1.0.0 / MIT | React/Next implementation performance review | Current project is Next.js 16 + React 19 |
| `codebase-orientation` | Local Codex skill | local skill metadata | Systematic repository entry-point and module audit | The mission requires reading and mapping the existing project before edits |

No third-party helper script has been executed from these skills. Browser interaction used the existing OpenAI Chrome integration; repeatable local verification used the repository's Playwright scripts.

Current verification additions:

- `frontend-testing-debugging`: used for the browser validation loop, responsive smoke, screenshot evidence and fallback documentation.
- `tdd-red-green-refactor`: used for incremental regression tests for lesson navigation, drawer focus and inline curriculum behavior.
- Chrome Control was repaired and used successfully for authenticated route, interaction, shell, console, and 390px responsive observations. After a host refresh closed the original tool transport, the same Chrome thread reconnected and completed a final read-only handoff check successfully.
