# Exam engine deployment runbook

This repository contains the application and forward-only Supabase migrations. It
does not imply that a remote project has been migrated.

## Migration order

For an existing project, apply the manifest in `supabase/migrations/README.md`.
The exam-engine rollout ends at:

```text
017 -> 018 -> 019 -> 020 -> 021 -> 022 -> 023 -> 024 -> 025 -> 026 -> 027 -> 028 -> 029 -> 030 -> 031 -> 032 -> 033 -> 034 -> 035 -> 036 -> 037 -> 038 -> 039 -> 040 -> 041 -> 042
```

The two `007_*` files are distinct historical migrations. Apply both according to
the target project's migration history. `008_seed_tsa_response_exam.sql` is an
optional sample-data seed, not a required production migration.

Do not edit an already applied migration and do not run `supabase/schema.sql` over
an existing project. Use a new forward-fix migration for later changes.

The audited production project `glxlzzxpfmtulppojwis` is a special empty legacy
baseline, not an existing exam-engine baseline. For that project only, use the
single atomic `043_empty_legacy_head_bootstrap.sql` instead of replaying 002-042
or running `schema.sql` directly. Migration 043 refuses to start unless the
verified ten-table fingerprint, all legacy counts, and `auth.users` remain empty.

## Required server configuration

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY   # server-only; never expose to the browser
```

After verifying migrations `021` and `033`, the database-backed rate-limit RPC,
and its smoke test on staging, set `RATE_LIMIT_REQUIRE_DB=1`. Keep it unset
during local development if the local database has not received the rate-limit
migrations yet.

## Verification queries

Run [exam-engine-staging-verification.sql](./exam-engine-staging-verification.sql)
and the queries in the migration README. Confirm at minimum:

After the approved production migration and smoke fixture are present, run the
complete deploy gate with one command:

```text
npm run deploy:check -- --allow-remote-writes
```

The command is locked to project `glxlzzxpfmtulppojwis`, loads
`.env.production.smoke`, runs the local release gate, then creates and cleans up
temporary production smoke records. It prints `DEPLOY_READY` only when every
local, schema, RLS, integrity, rate-limit, auth-route, and cleanup gate passes.
Omitting `--allow-remote-writes` prevents the write-based smoke phase.

```sql
select to_regclass('public.exam_admin_audit_logs');
select to_regclass('public.exam_attempt_adjustments');
select to_regclass('public.exam_scoring_versions');
select to_regclass('public.exam_slot_candidates');
select to_regclass('public.exams_results_released_idx');
select has_table_privilege('anon', 'public.exam_attempts', 'DELETE');
select has_table_privilege('authenticated', 'public.exam_attempts', 'DELETE');
select has_table_privilege('anon', 'public.guest_exam_attempts', 'SELECT');
select has_table_privilege('authenticated', 'public.guest_exam_attempts', 'SELECT');
```

All four privilege checks must be `false`. Browser clients do not perform
destructive attempt cleanup; the admin route performs an audit preflight before
using the server role. Migration 032 also removes browser grants from
server-owned slot, guest, rate-limit, audit and scoring-operation tables.

## Staging smoke path

1. Publish one TSA, HSA, V-SAT, THPTQG and CUSTOM fixture without changing the
   authoring/parser flow.
2. Run preflight; fix all `ERROR` checks before publishing or opening a slot.
3. Start an authenticated attempt and a guest slot attempt.
4. Verify deterministic question/option order, exam code, timer resume, autosave
   state, flagged questions and submit idempotency.
5. Verify fullscreen/visibility/focus events are factual events, not an automatic
   cheating verdict.
6. Test per-attempt time extension and retry grant with an audit record.
7. Test manual account release from Exam Policy and manual guest release from the
   selected slot.
8. Preview and apply a regrade; verify original score/version remain available.
9. Export the guest slot workbook and confirm input, selected answers, scoring,
   monitoring and configuration sheets are present.

## Rollback and operations

Application rollback must remain compatible with the latest applied migration.
Database rollback is not performed by editing or reversing a released migration;
use a reviewed forward-fix migration. If a sensitive admin mutation fails its
audit preflight, the mutation must remain unapplied. Audit completion is best
effort after a successful mutation, so monitor the audit table after incidents.

Browser visual/E2E checks require a running deployment with an authenticated test
account. They were not treated as passing solely from a production build.

## Environment safety

The repository does not infer staging from a Supabase URL. Before applying any
DDL, record the project ref and environment owner in the release ticket. If the
project is not explicitly identified as staging/test, stop at read-only metadata
verification and report `REMOTE STATUS NOT VERIFIED` for migration history.

The current local checkout does not have the Supabase CLI. It does have a
Playwright setup under `e2e/` for the authenticated browser release gate. A
staging operator must still run the SQL verifier, database integration matrix
and authenticated browser E2E before production.

## Current staging baseline and rollout

Project `slkuxrdbnlalrtdorgpq` is explicitly designated DEVELOPMENT/STAGING.
The remote schema already contained the effects of migrations `017` through
`020`, but its migration registry was empty before rollout. Those migrations
were not rerun. MCP `apply_migration` then recorded and applied, in order:

```text
021 -> 022 -> 023 -> 024 -> 025 -> 026 -> 027 -> 028 -> 029 -> 030 -> 031 -> 032 -> 033 -> 034 -> 035 -> 036 -> 037 -> 038 -> 039 -> 040 -> 041
```

Two forward-only fixes were required by real staging verification:

```text
033_rate_limit_claim_fix
034_exam_content_data_api_hardening
035_exam_content_legacy_policy_cleanup
036_legacy_security_definer_acl_hardening
037_exam_dashboard_title_reconciliation
038_student_sequences_server_only
039_private_account_active_helper
040_question_bank
041_private_admin_helper
```

Migration `033` accepts the current `request.jwt.claims` role source and
retains a legacy fallback; it also explicitly revokes the rate-limit RPC from
`public`, `anon`, and `authenticated`. Migration `034` keeps authenticated
admin authoring available while removing student/anonymous direct access to
raw question source and answer-key tables. Existing migrations `017`-`032`
were not modified.

Migration `035` removes the legacy learner-read policy names that remained after
034, so authenticated students cannot read raw section/question authoring
columns. Migration `036` removes direct anonymous/authenticated execution from
mutation-capable legacy SECURITY DEFINER functions and locks their search paths.
`is_admin()` remains callable by browser roles only because older `public` RLS
policies use it as a read-only predicate; this is an intentional advisor finding
until those policies are migrated to authenticated-only admin policies.

Migration `039` removes the browser-callable UUID parameter from
`is_account_active(uuid)`. The nine active-account restrictive policies now use
`private.is_account_active()` bound to `auth.uid()`. The public UUID overload is
service-role-only, and the private helper has a fixed empty search path.

Migration `041` removes the final exposed-schema SECURITY DEFINER helper.
All policies that depended on `public.is_admin()` are altered in place to call
`(select private.is_admin())`; policy roles, commands, and permissive/restrictive
mode are preserved. The migration asserts that every dependency is a policy,
refuses to drop the public helper while any dependency remains, and accepts an
already-migrated database only when public policies already depend on the
private helper. A database with neither helper dependency still fails closed.
The migration then reloads the PostgREST schema.
The private schema is not included in the Data API exposed-schema list.

Migration `037` reconciles a legacy schema gap discovered during staging: the
remote `public.exams` table existed without `dashboard_title` while the app and
bootstrap schema already selected it. It adds the column, backfills only null or
blank rows, applies the expected default/NOT NULL contract, and reloads PostgREST.
Migration `014` was not edited or rerun.

Migration `038` keeps `public.student_sequences` server-only. It enables RLS,
removes direct table privileges from `anon` and `authenticated`, and leaves
`public.next_student_code()` executable only by `service_role`. No browser
route reads or writes the sequence table directly; the profile creation path
uses the server-owned generator. The security advisor's no-policy notice for
this table is therefore intentional and is preferred over adding a permissive
policy.

The staging database-backed rate-limit smoke test passed (allow, allow, deny,
scope isolation, refill) and cleaned its temporary rows. The staging
environment has `RATE_LIMIT_REQUIRE_DB=1` enabled only after that verification.

Auth leaked-password protection is a project-level Supabase Auth setting and is
not changed by SQL migrations; enable it in the staging/production Auth
configuration before release.

## Auth/session troubleshooting

Protected API responses use the following distinction:

```text
AUTH_REQUIRED          no bearer token reached the server
AUTH_SESSION_INVALID   token was expired, revoked, for another Supabase project,
                       or could not be matched to an active profile
```

The browser uses `lib/auth-client.ts` for protected requests. It refreshes a
near-expiry session, serializes concurrent refreshes, retries one `401`, and
clears only the local session when the refresh token is no longer usable. Do
not copy an access token from an old tab or manually hard-code it in a request.

Local `npm run dev` explicitly uses the Node/Vite runtime
(`VINEXT_CLOUDFLARE_DEV=0`). This is required for local protected routes to
reach Supabase Auth; the local Cloudflare/Miniflare runtime may not have
outbound Supabase connectivity and would incorrectly surface a valid token as
`AUTH_SESSION_INVALID`. Use a fresh dev process after changing `.env.local`.

When a user sees the session message, first reload the page and sign in again.
If it repeats, verify that `NEXT_PUBLIC_SUPABASE_URL` and the publishable key
belong to the same Supabase project, restart the dev server after changing
`.env.local`, and inspect the failed request's status/code without logging the
token itself. The `dashboard_title` schema gap is a separate database issue;
it is reconciled by migration `037` and does not invalidate a Supabase session.
