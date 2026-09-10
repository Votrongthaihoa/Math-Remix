# Scope

## Authorized

- Public pages reachable from `aeck.vn` user-visible navigation.
- The currently signed-in `alpha.aeck.vn` Chrome session.
- Normal, non-destructive UI flows and browser-delivered HTML/CSS/JS/assets.
- Sanitized request/response contracts observed during those flows.

## Excluded

- Authentication or authorization bypass.
- Guessed hidden/admin endpoints.
- Production exam submission, purchases, logout, account/data deletion, or other irreversible actions for recon purposes.
- Cookie, browser storage, password, token, or secret export.
- Claims that the target's private backend source has been recovered.
- Unauthorized copying or hotlinking of third-party-owned content/assets.

## Repository guardrails

- Preserve all pre-existing tracked and untracked user work.
- Keep shared shell changes isolated from protected exam/question/result UI.
- Use the current Next/Vinext/Supabase architecture unless evidence demonstrates a necessary extension.
