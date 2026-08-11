-- Exam engine operations and result-integrity primitives.
-- Forward-only: this migration extends attempts and adds admin-only tables;
-- it does not rewrite or delete historical attempts.

alter table if exists public.exam_attempts
  add column if not exists question_order jsonb not null default '[]'::jsonb,
  add column if not exists option_order jsonb not null default '{}'::jsonb,
  add column if not exists flagged_questions jsonb not null default '[]'::jsonb,
  add column if not exists exam_code text,
  add column if not exists progress_version integer not null default 0,
  add column if not exists time_extension_seconds integer not null default 0,
  add column if not exists network_state text not null default 'online',
  add column if not exists scoring_version integer not null default 1,
  add column if not exists original_score numeric,
  add column if not exists original_correct_answers integer,
  add column if not exists original_total_questions integer;

alter table if exists public.guest_exam_attempts
  add column if not exists exam_code text,
  add column if not exists flagged_questions jsonb not null default '[]'::jsonb,
  add column if not exists time_extension_seconds integer not null default 0,
  add column if not exists network_state text not null default 'online',
  add column if not exists scoring_version integer not null default 1,
  add column if not exists original_score numeric,
  add column if not exists original_correct_answers integer,
  add column if not exists original_total_questions integer;

alter table if exists public.exam_attempts
  drop constraint if exists exam_attempts_question_order_array_check,
  drop constraint if exists exam_attempts_option_order_object_check,
  drop constraint if exists exam_attempts_flagged_questions_array_check,
  drop constraint if exists exam_attempts_progress_version_check,
  drop constraint if exists exam_attempts_time_extension_check,
  drop constraint if exists exam_attempts_network_state_check,
  drop constraint if exists exam_attempts_scoring_version_check;
alter table if exists public.exam_attempts
  add constraint exam_attempts_question_order_array_check check (jsonb_typeof(question_order) = 'array'),
  add constraint exam_attempts_option_order_object_check check (jsonb_typeof(option_order) = 'object'),
  add constraint exam_attempts_flagged_questions_array_check check (jsonb_typeof(flagged_questions) = 'array'),
  add constraint exam_attempts_progress_version_check check (progress_version between 0 and 2000000000),
  add constraint exam_attempts_time_extension_check check (time_extension_seconds between 0 and 86400),
  add constraint exam_attempts_network_state_check check (network_state in ('online','saving','saved','offline','retrying','conflict','failed')),
  add constraint exam_attempts_scoring_version_check check (scoring_version between 1 and 1000000);

alter table if exists public.guest_exam_attempts
  drop constraint if exists guest_exam_attempts_flagged_questions_array_check,
  drop constraint if exists guest_exam_attempts_time_extension_check,
  drop constraint if exists guest_exam_attempts_network_state_check,
  drop constraint if exists guest_exam_attempts_scoring_version_check;
alter table if exists public.guest_exam_attempts
  add constraint guest_exam_attempts_flagged_questions_array_check check (jsonb_typeof(flagged_questions) = 'array'),
  add constraint guest_exam_attempts_time_extension_check check (time_extension_seconds between 0 and 86400),
  add constraint guest_exam_attempts_network_state_check check (network_state in ('online','saving','saved','offline','retrying','conflict','failed')),
  add constraint guest_exam_attempts_scoring_version_check check (scoring_version between 1 and 1000000);

create index if not exists exam_attempts_exam_code_idx
  on public.exam_attempts(exam_id, exam_code)
  where exam_code is not null;
create index if not exists exam_attempts_progress_idx
  on public.exam_attempts(exam_id, student_id, progress_version);
create index if not exists guest_exam_attempts_exam_code_idx
  on public.guest_exam_attempts(slot_id, exam_code)
  where exam_code is not null;

create table if not exists public.exam_attempt_adjustments (
  id uuid primary key default gen_random_uuid(),
  attempt_kind text not null check (attempt_kind in ('account','guest')),
  attempt_id uuid not null,
  exam_id uuid not null references public.exams(id) on delete cascade,
  slot_id uuid references public.exam_access_slots(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  extension_seconds integer not null default 0 check (extension_seconds between 1 and 86400),
  reason text not null check (length(trim(reason)) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint exam_attempt_adjustments_scope_check check (
    (attempt_kind = 'account' and slot_id is null and student_id is not null)
    or (attempt_kind = 'guest' and slot_id is not null and student_id is null)
  )
);
create index if not exists exam_attempt_adjustments_attempt_idx
  on public.exam_attempt_adjustments(attempt_kind, attempt_id, created_at desc);
alter table public.exam_attempt_adjustments enable row level security;
drop policy if exists "admin exam attempt adjustments" on public.exam_attempt_adjustments;
create policy "admin exam attempt adjustments" on public.exam_attempt_adjustments
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table if not exists public.exam_attempt_grants (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  slot_id uuid references public.exam_access_slots(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  client_hash text,
  candidate_code text,
  additional_attempts integer not null default 1 check (additional_attempts between 1 and 100),
  consumed_attempts integer not null default 0 check (consumed_attempts between 0 and additional_attempts),
  reason text not null check (length(trim(reason)) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint exam_attempt_grants_scope_check check (
    (student_id is not null and slot_id is null and client_hash is null)
    or (student_id is null and slot_id is not null and length(trim(coalesce(client_hash, ''))) between 32 and 128)
  )
);
create index if not exists exam_attempt_grants_account_idx
  on public.exam_attempt_grants(exam_id, student_id, consumed_attempts)
  where student_id is not null;
create index if not exists exam_attempt_grants_guest_idx
  on public.exam_attempt_grants(exam_id, slot_id, client_hash, consumed_attempts)
  where client_hash is not null;
alter table public.exam_attempt_grants enable row level security;
drop policy if exists "admin exam attempt grants" on public.exam_attempt_grants;
create policy "admin exam attempt grants" on public.exam_attempt_grants
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.consume_exam_attempt_grant(
  target_exam_id uuid,
  target_slot_id uuid,
  target_student_id uuid,
  target_client_hash text
)
returns table(grant_id uuid, allowed boolean, remaining integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  selected_grant public.exam_attempt_grants%rowtype;
begin
  select * into selected_grant
  from public.exam_attempt_grants
  where exam_id = target_exam_id
    and consumed_attempts < additional_attempts
    and (
      (target_student_id is not null and student_id = target_student_id and slot_id is null)
      or (target_client_hash is not null and slot_id = target_slot_id and client_hash = target_client_hash and student_id is null)
    )
  order by created_at
  limit 1
  for update;

  if not found then
    return query select null::uuid, false, 0;
    return;
  end if;

  update public.exam_attempt_grants
  set consumed_attempts = consumed_attempts + 1
  where id = selected_grant.id;

  return query
    select selected_grant.id, true,
      selected_grant.additional_attempts - selected_grant.consumed_attempts - 1;
end;
$$;
revoke all on function public.consume_exam_attempt_grant(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.consume_exam_attempt_grant(uuid, uuid, uuid, text) to service_role;

create table if not exists public.exam_scoring_versions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  version integer not null check (version between 1 and 1000000),
  status text not null default 'draft' check (status in ('draft','applied','superseded')),
  reason text not null check (length(trim(reason)) between 1 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (exam_id, version)
);
create index if not exists exam_scoring_versions_exam_idx
  on public.exam_scoring_versions(exam_id, version desc);
alter table public.exam_scoring_versions enable row level security;
drop policy if exists "admin exam scoring versions" on public.exam_scoring_versions;
create policy "admin exam scoring versions" on public.exam_scoring_versions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table if not exists public.exam_question_overrides (
  id uuid primary key default gen_random_uuid(),
  scoring_version_id uuid not null references public.exam_scoring_versions(id) on delete cascade,
  question_id uuid not null references public.exam_questions(id) on delete cascade,
  override_mode text not null check (override_mode in ('normal','accept_multiple','void_question','award_all')),
  accepted_answers jsonb not null default '[]'::jsonb,
  reason text not null check (length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (scoring_version_id, question_id)
);
create index if not exists exam_question_overrides_question_idx
  on public.exam_question_overrides(question_id, scoring_version_id);
alter table public.exam_question_overrides enable row level security;
drop policy if exists "admin exam question overrides" on public.exam_question_overrides;
create policy "admin exam question overrides" on public.exam_question_overrides
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table if not exists public.exam_regrade_runs (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  scoring_version_id uuid not null references public.exam_scoring_versions(id) on delete restrict,
  status text not null default 'preview' check (status in ('preview','applied','failed')),
  attempt_count integer not null default 0,
  affected_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  reason text not null check (length(trim(reason)) between 1 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index if not exists exam_regrade_runs_exam_idx
  on public.exam_regrade_runs(exam_id, created_at desc);
alter table public.exam_regrade_runs enable row level security;
drop policy if exists "admin exam regrade runs" on public.exam_regrade_runs;
create policy "admin exam regrade runs" on public.exam_regrade_runs
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table if not exists public.exam_policy_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (length(trim(slug)) between 1 and 120),
  policy jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.exam_policy_presets enable row level security;
drop policy if exists "admin exam policy presets" on public.exam_policy_presets;
create policy "admin exam policy presets" on public.exam_policy_presets
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table if not exists public.exam_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  exam_type text not null default 'CUSTOM',
  profile_config jsonb not null default '{}'::jsonb,
  policy jsonb not null default '{}'::jsonb,
  source_exam_id uuid references public.exams(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.exam_templates enable row level security;
drop policy if exists "admin exam templates" on public.exam_templates;
create policy "admin exam templates" on public.exam_templates
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table if not exists public.exam_slot_candidates (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.exam_access_slots(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_code text not null check (length(trim(candidate_code)) between 1 and 120),
  full_name text not null default '',
  class_name text not null default '',
  school text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slot_id, candidate_code)
);
create index if not exists exam_slot_candidates_lookup_idx
  on public.exam_slot_candidates(slot_id, candidate_code);
alter table public.exam_slot_candidates enable row level security;
drop policy if exists "admin exam slot candidates" on public.exam_slot_candidates;
create policy "admin exam slot candidates" on public.exam_slot_candidates
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

notify pgrst, 'reload schema';
