import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const schema = await readFile(new URL("supabase/schema.sql", root), "utf8");
const bootstrapBody = schema
  .replace(/^\uFEFF?begin;\s*/i, "")
  .replace(/\s*commit;\s*$/i, "")
  .trim();

const preflight = `begin;

-- Replace the verified empty legacy production baseline with schema HEAD.
-- This migration is intentionally target-specific and fails before any DROP
-- unless the table fingerprint and exact row counts match the audited project.

do $$
declare
  expected_tables text[] := array[
    'attempt_details', 'attempts', 'courses', 'documents', 'exam_sections',
    'exams', 'lesson_progress', 'lessons', 'profiles', 'questions'
  ];
  actual_tables text[];
  legacy_rows bigint;
begin
  select pg_catalog.array_agg(relation.relname order by relation.relname)
    into actual_tables
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p');

  if actual_tables is distinct from expected_tables then
    raise exception '043 requires the verified legacy schema fingerprint; public tables are %', actual_tables;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'role' and udt_name = 'user_role'
  ) or exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'status'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'courses' and column_name = 'slug'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lessons' and column_name = 'course_id'
  ) or exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lessons' and column_name = 'chapter_id'
  ) or exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exams' and column_name = 'room_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_sections' and column_name = 'order_index'
  ) then
    raise exception '043 requires the verified legacy schema fingerprint; column contract differs';
  end if;

  if (select count(*) from auth.users) <> 0 then
    raise exception '043 refused: auth.users is not empty';
  end if;

  select
    (select count(*) from public.attempt_details)
    + (select count(*) from public.attempts)
    + (select count(*) from public.courses)
    + (select count(*) from public.documents)
    + (select count(*) from public.exam_sections)
    + (select count(*) from public.exams)
    + (select count(*) from public.lesson_progress)
    + (select count(*) from public.lessons)
    + (select count(*) from public.profiles)
    + (select count(*) from public.questions)
    into legacy_rows;

  if legacy_rows <> 0 then
    raise exception '043 refused: legacy tables are not empty (% rows)', legacy_rows;
  end if;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table public.attempt_details;
drop table public.attempts;
drop table public.questions;
drop table public.exam_sections;
drop table public.exams;
drop table public.documents;
drop table public.lesson_progress;
drop table public.lessons;
drop table public.courses;
drop table public.profiles;

-- Embedded from supabase/schema.sql so the SQL Editor executes one transaction.
`;

const postflight = `

do $$
declare
  missing_relations text[];
  active_policy_count integer;
begin
  select pg_catalog.array_agg(required_relation.relation_name order by required_relation.relation_name)
    into missing_relations
  from (
    values
      ('account_violations'), ('admin_actions'), ('chapters'),
      ('course_enrollments'), ('courses'), ('device_verification_challenges'),
      ('exam_access_slots'), ('exam_admin_audit_logs'),
      ('exam_attempt_adjustments'), ('exam_attempt_grants'), ('exam_attempts'),
      ('exam_policy_presets'), ('exam_question_keys'),
      ('exam_question_overrides'), ('exam_questions'), ('exam_regrade_runs'),
      ('exam_room_enrollments'), ('exam_rooms'), ('exam_scoring_versions'),
      ('exam_sections'), ('exam_slot_candidates'), ('exam_templates'), ('exams'),
      ('guest_exam_attempts'), ('lesson_resources'), ('lessons'), ('profiles'),
      ('question_bank_item_versions'), ('question_bank_items'),
      ('question_bank_nodes'), ('question_banks'), ('request_rate_limits'),
      ('security_events'), ('student_sequences'), ('trusted_devices'), ('user_sessions')
  ) as required_relation(relation_name)
  where pg_catalog.to_regclass('public.' || required_relation.relation_name) is null;

  if missing_relations is not null then
    raise exception '043 expected 36 HEAD relations; missing %',
      pg_catalog.array_to_string(missing_relations, ', ');
  end if;

  if pg_catalog.to_regprocedure('private.is_admin()') is null
     or pg_catalog.to_regprocedure('private.is_account_active()') is null
     or pg_catalog.to_regprocedure('public.is_admin()') is not null then
    raise exception '043 helper final state is invalid';
  end if;

  select count(*)
    into active_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and policyname like 'active account %';

  if active_policy_count <> 9 then
    raise exception '043 expected 9 active-account policies, found %', active_policy_count;
  end if;

  if pg_catalog.to_regclass('public.attempts') is not null
     or pg_catalog.to_regclass('public.attempt_details') is not null
     or pg_catalog.to_regclass('public.documents') is not null
     or pg_catalog.to_regclass('public.lesson_progress') is not null
     or pg_catalog.to_regclass('public.questions') is not null then
    raise exception '043 legacy-only relations remain after bootstrap';
  end if;
end
$$;

commit;
`;

const output = `${preflight}\n${bootstrapBody}\n${postflight}`;
await writeFile(
  new URL("supabase/migrations/043_empty_legacy_head_bootstrap.sql", root),
  output,
  "utf8",
);

const dryRun = `-- DRY RUN ONLY: PostgreSQL executes every check and DDL statement,\n-- then rolls the transaction back. No schema or data change is retained.\n\n${output.replace(/commit;\s*$/i, "rollback;")}`;
await writeFile(
  new URL("docs/production-043-empty-legacy-bootstrap-dry-run.sql", root),
  dryRun,
  "utf8",
);
