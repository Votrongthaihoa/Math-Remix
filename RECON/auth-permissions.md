# Authentication and permissions

- The existing signed-in Chrome session was used successfully for authenticated recon across seven safe routes.
- Recon does not inspect or export browser storage, cookies, authorization headers, passwords or tokens.
- Alpha app visibly exposes a user menu with account and logout actions; logout will not be invoked for recon.
- Browser-delivered code references a separate account origin and auth login/register/logout paths.
- Public login/signup/forgot/reset route surfaces are covered by local smoke. Live credential entry, registration, expiration, logout, and authorization-denial behavior were deliberately not exercised.
- Local auth and permissions remain source-of-truth from the current repository and project-scoped Supabase evidence.
- Local browser smoke uses a non-production mock session and does not persist credentials, tokens or cookies outside the test context.
