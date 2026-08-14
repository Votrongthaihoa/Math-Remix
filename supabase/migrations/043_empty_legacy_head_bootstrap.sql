begin;

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

create extension if not exists pgcrypto;

create table if not exists public.student_sequences (
  singleton boolean primary key default true check (singleton),
  last_value bigint not null default 0
);
insert into public.student_sequences(singleton, last_value) values (true, 0) on conflict do nothing;
alter table public.student_sequences enable row level security;
revoke all on table public.student_sequences from public, anon, authenticated;

create or replace function public.next_student_code() returns text language plpgsql security definer set search_path = '' as $$
declare value bigint;
begin
  update public.student_sequences set last_value = last_value + 1 where singleton = true returning last_value into value;
  return 'REMIX' || lpad(value::text, 6, '0');
end $$;
revoke all on function public.next_student_code() from public, anon, authenticated;
grant execute on function public.next_student_code() to service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_code text not null unique default public.next_student_code(),
  full_name text not null,
  role text not null default 'student' check (role in ('student','admin')),
  status text not null default 'active' check (status in ('active','locked')),
  account_status text not null default 'active' check (account_status in ('active','temporarily_banned','permanently_banned')),
  violation_count integer not null default 0,
  banned_at timestamptz,
  banned_until timestamptz,
  ban_reason text,
  ban_event_id bigint,
  banned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;

create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text,
  browser text,
  operating_system text,
  trusted_by_admin boolean not null default false,
  verified_at timestamptz,
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id text,
  device_id text not null,
  activity_type text not null default 'idle' check (activity_type in ('idle','lesson','video','pdf','quiz','exam')),
  current_resource_id text,
  ip_hash text,
  country_code text,
  region_code text,
  city text,
  latitude double precision,
  longitude double precision,
  risk_score integer not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.device_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  initial_auth_session_id text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('new_device','device_limit','concurrent_session','impossible_travel','otp_required','otp_verified','warning','violation','temporary_ban','permanent_ban','admin_unban')),
  risk_score integer not null default 0,
  reason text not null,
  device_id text,
  conflicting_device_id text,
  distance_km numeric,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_result text check (review_result in ('confirmed','false_positive','ignored'))
);

alter table public.profiles
  add constraint profiles_ban_event_id_fkey
  foreign key (ban_event_id) references public.security_events(id) on delete set null;

create table if not exists public.account_violations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  violation_number integer not null,
  violation_type text not null,
  reason text not null,
  security_event_id bigint references public.security_events(id) on delete set null,
  ban_started_at timestamptz,
  ban_ends_at timestamptz,
  permanent boolean not null default false,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancellation_reason text
);

create table if not exists public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  action text not null check (action in ('unban','extend_ban','permanent_ban','mark_false_positive','trust_device','revoke_device','reset_violation_count')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trusted_devices_user_active_idx on public.trusted_devices(user_id, revoked_at, last_used_at desc);
create index if not exists user_sessions_active_idx on public.user_sessions(user_id, last_seen_at desc) where revoked_at is null;
create index if not exists user_sessions_device_idx on public.user_sessions(user_id, device_id, last_seen_at desc);
create index if not exists security_events_user_date_idx on public.security_events(user_id, created_at desc);
create index if not exists account_violations_user_date_idx on public.account_violations(user_id, created_at desc);
create index if not exists admin_actions_target_date_idx on public.admin_actions(target_user_id, created_at desc);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '', cover_url text,
  cover_color text not null default '#cd1627' check (cover_color ~ '^#[0-9A-Fa-f]{6}$'),
  published boolean not null default false, sort_order int not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses on delete cascade,
  title text not null, sort_order int not null default 0
);
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(), chapter_id uuid not null references public.chapters on delete cascade,
  title text not null, description text not null default '', published boolean not null default false, sort_order int not null default 0
);
create table if not exists public.lesson_resources (
  id uuid primary key default gen_random_uuid(), lesson_id uuid not null references public.lessons on delete cascade,
  title text not null, resource_type text not null check (resource_type in ('youtube','onedrive_video','external_pdf','storage_pdf')),
  resource_url text not null, allow_download boolean not null default false, sort_order int not null default 0,
  provider text check (provider is null or provider in ('sharepoint','onedrive_business','onedrive_personal')),
  provider_drive_id text, provider_item_id text, provider_metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.course_enrollments (
  student_id uuid not null references public.profiles on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  assigned_at timestamptz not null default now(), primary key(student_id, course_id)
);

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  score numeric not null default 0,
  correct_answers int not null default 0,
  total_questions int not null default 0,
  status text not null default 'completed' check (status in ('completed','submitted','graded')),
  submitted_at timestamptz not null default now()
);
create index if not exists exam_attempts_student_date_idx on public.exam_attempts(student_id, submitted_at desc);

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.chapters enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_resources enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.exam_attempts enable row level security;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;

create or replace function private.is_account_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.account_status = 'active'
        or (
          p.account_status = 'temporarily_banned'
          and p.banned_until is not null
          and p.banned_until <= now()
        )
      )
  )
$$;
revoke all on function private.is_account_active() from public, anon, authenticated;
grant execute on function private.is_account_active() to authenticated, service_role;

create or replace function public.is_account_active(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.status = 'active'
      and (
        p.account_status = 'active'
        or (
          p.account_status = 'temporarily_banned'
          and p.banned_until is not null
          and p.banned_until <= now()
        )
      )
  )
$$;
revoke all on function public.is_account_active(uuid) from public, anon, authenticated;
grant execute on function public.is_account_active(uuid) to service_role;

create or replace function public.apply_account_violation(
  target_user_id uuid,
  target_event_id bigint,
  target_violation_type text,
  target_reason text
)
returns table(violation_number integer, account_status text, banned_at timestamptz, banned_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  next_count integer;
  duration_interval interval;
  permanent_lock boolean;
  started_at timestamptz := now();
  ends_at timestamptz;
begin
  select p.violation_count
    into current_count
  from public.profiles p
  where p.id = target_user_id
  for update;
  if not found then
    raise exception 'profile_not_found';
  end if;

  next_count := coalesce(current_count, 0) + 1;
  permanent_lock := next_count >= 5;
  duration_interval := case next_count
    when 1 then interval '24 hours'
    when 2 then interval '48 hours'
    when 3 then interval '72 hours'
    when 4 then interval '7 days'
    else null
  end;
  ends_at := case when permanent_lock then null else started_at + duration_interval end;

  update public.profiles
  set violation_count = next_count,
      account_status = case when permanent_lock then 'permanently_banned' else 'temporarily_banned' end,
      banned_at = started_at,
      banned_until = ends_at,
      ban_reason = target_reason,
      ban_event_id = target_event_id,
      updated_at = started_at
  where id = target_user_id;

  insert into public.account_violations(
    user_id, violation_number, violation_type, reason, security_event_id,
    ban_started_at, ban_ends_at, permanent
  ) values (
    target_user_id, next_count, target_violation_type, target_reason,
    target_event_id, started_at, ends_at, permanent_lock
  );

  update public.user_sessions
  set revoked_at = started_at
  where user_id = target_user_id
    and revoked_at is null;

  insert into public.security_events(user_id, event_type, risk_score, reason, evidence)
  values (
    target_user_id,
    case when permanent_lock then 'permanent_ban' else 'temporary_ban' end,
    100,
    target_reason,
    pg_catalog.jsonb_build_object('violationNumber', next_count, 'sourceEventId', target_event_id)
  );

  return query select
    next_count,
    case when permanent_lock then 'permanently_banned' else 'temporarily_banned' end,
    started_at,
    ends_at;
end;
$$;
revoke all on function public.apply_account_violation(uuid, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_account_violation(uuid, bigint, text, text)
  to service_role;

alter table public.trusted_devices enable row level security;
alter table public.user_sessions enable row level security;
alter table public.device_verification_challenges enable row level security;
alter table public.security_events enable row level security;
alter table public.account_violations enable row level security;
alter table public.admin_actions enable row level security;

drop policy if exists "devices self read" on public.trusted_devices;
create policy "devices self read" on public.trusted_devices for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
drop policy if exists "admin devices" on public.trusted_devices;
create policy "admin devices" on public.trusted_devices for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "sessions self read" on public.user_sessions;
create policy "sessions self read" on public.user_sessions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
drop policy if exists "admin sessions" on public.user_sessions;
create policy "admin sessions" on public.user_sessions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin device challenges" on public.device_verification_challenges;
create policy "admin device challenges" on public.device_verification_challenges for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin security events" on public.security_events;
create policy "admin security events" on public.security_events for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin violations" on public.account_violations;
create policy "admin violations" on public.account_violations for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin action read" on public.admin_actions;
create policy "admin action read" on public.admin_actions for select to authenticated
  using ((select private.is_admin()));

revoke all on table public.trusted_devices, public.user_sessions,
  public.device_verification_challenges, public.security_events,
  public.account_violations, public.admin_actions from public, anon, authenticated;
grant select, insert, update, delete on table public.trusted_devices,
  public.user_sessions, public.device_verification_challenges,
  public.security_events, public.account_violations, public.admin_actions to service_role;
revoke all on sequence public.security_events_id_seq,
  public.account_violations_id_seq, public.admin_actions_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.security_events_id_seq,
  public.account_violations_id_seq, public.admin_actions_id_seq
  to service_role;

-- Client accounts may edit their display name, never role or status.
revoke update on table public.profiles from anon;
revoke update on table public.profiles from authenticated;
grant update (full_name) on table public.profiles to authenticated;

create policy "profile self read" on public.profiles for select using (id = auth.uid() or (select private.is_admin()));
create policy "profile self update" on public.profiles for update using (id = auth.uid() or (select private.is_admin())) with check (id = auth.uid() or (select private.is_admin()));
create policy "admin profiles" on public.profiles for all using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "courses enrolled read" on public.courses for select using (published and exists(select 1 from public.course_enrollments e where e.course_id=id and e.student_id=auth.uid()) or (select private.is_admin()));
create policy "admin courses" on public.courses for all using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "chapters read" on public.chapters for select using (exists(select 1 from public.courses c where c.id=course_id and ((select private.is_admin()) or c.published and exists(select 1 from public.course_enrollments e where e.course_id=c.id and e.student_id=auth.uid()))));
create policy "admin chapters" on public.chapters for all using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "lessons read" on public.lessons for select using (published and exists(select 1 from public.chapters ch join public.course_enrollments e on e.course_id=ch.course_id where ch.id=chapter_id and e.student_id=auth.uid()) or (select private.is_admin()));
create policy "admin lessons" on public.lessons for all using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "resources read" on public.lesson_resources for select using (exists(select 1 from public.lessons l join public.chapters ch on ch.id=l.chapter_id join public.course_enrollments e on e.course_id=ch.course_id where l.id=lesson_id and l.published and e.student_id=auth.uid()) or (select private.is_admin()));
create policy "admin resources" on public.lesson_resources for all using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "enrollments self read" on public.course_enrollments for select using (student_id=auth.uid() or (select private.is_admin()));
create policy "admin enrollments" on public.course_enrollments for all using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "attempts self read" on public.exam_attempts for select using (student_id=auth.uid() or (select private.is_admin()));
create policy "admin attempts" on public.exam_attempts for all using ((select private.is_admin())) with check ((select private.is_admin()));

-- -------------------------------------------------------------------------
-- Exam rooms and short-lived guest kíp access (kept here as a bootstrap
-- mirror of migrations 006, 016, 017, 018 and 020 for new Supabase projects).
-- Existing projects should still apply the ordered migrations.
-- -------------------------------------------------------------------------

do $bootstrap_exam_rooms$
begin
  execute $exam_rooms_ddl$
    create table if not exists public.exam_rooms (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      description text not null default '',
      exam_type text not null default 'TSA',
      access_mode text not null default 'open' check (access_mode in ('open','assigned')),
      registration_start timestamptz,
      registration_end timestamptz,
      exam_start timestamptz,
      exam_end timestamptz,
      published boolean not null default false,
      sort_order int not null default 0,
      created_at timestamptz not null default now()
    )
  $exam_rooms_ddl$;
exception
  when others then
    raise exception 'BOOTSTRAP_STAGE_EXAM_ROOMS_CREATE [%]: %', sqlstate, sqlerrm;
end
$bootstrap_exam_rooms$;

do $$
begin
  if pg_catalog.to_regclass('public.exam_rooms') is null then
    raise exception 'BOOTSTRAP_STAGE_EXAM_ROOMS_CREATE: relation was not created';
  end if;
end
$$;

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.exam_rooms(id) on delete cascade,
  title text not null,
  description text not null default '',
  dashboard_title text not null default 'KỲ THI TỐT NGHIỆP THPT 2027',
  exam_type text not null default 'TSA',
  mode text not null default 'free' check (mode in ('free','scheduled')),
  duration_minutes int not null default 90 check (duration_minutes > 0),
  settings jsonb not null default '{}'::jsonb,
  structure_config jsonb not null default '{}'::jsonb,
  results_released_at timestamptz,
  published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table if exists public.exams
  add column if not exists dashboard_title text,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists structure_config jsonb not null default '{}'::jsonb,
  add column if not exists results_released_at timestamptz;

update public.exams
set dashboard_title = 'KỲ THI TỐT NGHIỆP THPT 2027'
where dashboard_title is null or btrim(dashboard_title) = '';

alter table public.exams
  alter column dashboard_title set default 'KỲ THI TỐT NGHIỆP THPT 2027',
  alter column dashboard_title set not null;

create table if not exists public.exam_sections (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  title text not null,
  duration_minutes int,
  subject_code text,
  source_latex text not null default '',
  sort_order int not null default 0
);

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.exam_sections(id) on delete cascade,
  prompt text not null,
  question_type text not null default 'single' check (question_type in ('single','multiple','text','inline','true_false','ordering','drag_drop')),
  options jsonb not null default '[]'::jsonb,
  points numeric not null default 1 check (points >= 0),
  sort_order int not null default 0,
  passage text,
  media_url text,
  instruction text,
  latex_source text not null default '',
  solution_source text not null default ''
);

alter table if exists public.exam_sections
  add column if not exists subject_code text,
  add column if not exists source_latex text not null default '';
alter table if exists public.exam_questions
  add column if not exists passage text,
  add column if not exists media_url text,
  add column if not exists instruction text,
  add column if not exists latex_source text not null default '',
  add column if not exists solution_source text not null default '';
alter table if exists public.exam_questions drop constraint if exists exam_questions_question_type_check;
alter table if exists public.exam_questions add constraint exam_questions_question_type_check check (question_type in ('single','multiple','text','inline','true_false','ordering','drag_drop'));

create table if not exists public.exam_question_keys (
  question_id uuid primary key references public.exam_questions(id) on delete cascade,
  correct_answer jsonb not null,
  explanation text not null default ''
);

create table if not exists public.question_banks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  subject_code text not null default '',
  grade text not null default '',
  curriculum text not null default '',
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_bank_nodes (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  parent_id uuid references public.question_bank_nodes(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  node_type text not null default 'topic' check (node_type in ('topic', 'unit')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (bank_id, parent_id, title)
);

create table if not exists public.question_bank_items (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  node_id uuid references public.question_bank_nodes(id) on delete set null,
  current_version integer not null default 1 check (current_version between 1 and 1000000),
  difficulty text check (difficulty is null or difficulty in ('NB', 'TH', 'VD', 'VDC')),
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_bank_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.question_bank_items(id) on delete cascade,
  version integer not null check (version between 1 and 1000000),
  prompt text not null check (length(trim(prompt)) between 1 and 50000),
  question_type text not null default 'single' check (question_type in ('single', 'multiple', 'text', 'inline', 'true_false', 'ordering', 'drag_drop')),
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb not null default 'null'::jsonb,
  explanation text not null default '',
  passage text,
  media_url text,
  instruction text,
  solution_source text not null default '',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (item_id, version)
);

alter table if exists public.exam_questions
  add column if not exists source_item_id uuid references public.question_bank_items(id) on delete set null,
  add column if not exists source_item_version integer;

create index if not exists question_banks_updated_idx on public.question_banks(updated_at desc);
create index if not exists question_bank_nodes_bank_sort_idx on public.question_bank_nodes(bank_id, parent_id, sort_order);
create index if not exists question_bank_items_lookup_idx on public.question_bank_items(bank_id, status, difficulty, updated_at desc);
create index if not exists question_bank_items_node_idx on public.question_bank_items(node_id, status);
create index if not exists question_bank_item_versions_lookup_idx on public.question_bank_item_versions(item_id, version desc);
create index if not exists exam_questions_source_item_idx on public.exam_questions(source_item_id, source_item_version);

alter table public.question_banks enable row level security;
alter table public.question_bank_nodes enable row level security;
alter table public.question_bank_items enable row level security;
alter table public.question_bank_item_versions enable row level security;
drop policy if exists "admin question banks" on public.question_banks;
create policy "admin question banks" on public.question_banks for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin question bank nodes" on public.question_bank_nodes;
create policy "admin question bank nodes" on public.question_bank_nodes for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin question bank items" on public.question_bank_items;
create policy "admin question bank items" on public.question_bank_items for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin question bank item versions" on public.question_bank_item_versions;
create policy "admin question bank item versions" on public.question_bank_item_versions for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on table public.question_banks, public.question_bank_nodes, public.question_bank_items, public.question_bank_item_versions from public, anon, authenticated;
grant select, insert, update, delete on table public.question_banks, public.question_bank_nodes, public.question_bank_items, public.question_bank_item_versions to service_role;

create table if not exists public.exam_room_enrollments (
  room_id uuid not null references public.exam_rooms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (room_id, student_id)
);

alter table if exists public.exam_attempts
  add column if not exists exam_id uuid references public.exams(id) on delete set null,
  add column if not exists mode text not null default 'practice',
  add column if not exists answers jsonb not null default '{}'::jsonb,
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists duration_seconds int,
  add column if not exists section_id uuid references public.exam_sections(id) on delete set null,
  add column if not exists policy_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists policy_version integer not null default 1,
  add column if not exists answer_key_snapshot jsonb not null default '{}'::jsonb;
alter table if exists public.exam_attempts drop constraint if exists exam_attempts_status_check;
alter table if exists public.exam_attempts add constraint exam_attempts_status_check check (status in ('in_progress','completed','submitted','graded'));
alter table if exists public.exam_attempts drop constraint if exists exam_attempts_policy_snapshot_object_check;
alter table if exists public.exam_attempts drop constraint if exists exam_attempts_policy_version_check;
alter table if exists public.exam_attempts add constraint exam_attempts_policy_snapshot_object_check check (jsonb_typeof(policy_snapshot) = 'object');
alter table if exists public.exam_attempts add constraint exam_attempts_policy_version_check check (policy_version between 1 and 1000000);
alter table if exists public.exam_attempts drop constraint if exists exam_attempts_answer_key_snapshot_object_check;
alter table if exists public.exam_attempts add constraint exam_attempts_answer_key_snapshot_object_check check (jsonb_typeof(answer_key_snapshot) = 'object');

create table if not exists public.exam_access_slots (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  name text not null default 'Kíp thi',
  token_hash text not null unique,
  token_hint text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  grace_period_minutes integer not null default 30 check (grace_period_minutes between 0 and 1440),
  password_hash text,
  enabled boolean not null default true,
  results_released_at timestamptz,
  export_open_at timestamptz,
  export_close_at timestamptz,
  section_id uuid references public.exam_sections(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_access_slots_window_check check (ends_at > starts_at),
  constraint exam_access_slots_export_window_check check (export_close_at is null or export_open_at is null or export_close_at > export_open_at)
);

create table if not exists public.guest_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.exam_access_slots(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  session_hash text not null,
  client_hash text not null default '',
  guest_identity jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  question_order jsonb not null default '[]'::jsonb,
  option_order jsonb not null default '{}'::jsonb,
  config_snapshot jsonb not null default '{}'::jsonb,
  policy_snapshot jsonb not null default '{}'::jsonb,
  policy_version integer not null default 1,
  monitor_events jsonb not null default '[]'::jsonb,
  progress_version integer not null default 0,
  score numeric,
  correct_answers integer not null default 0,
  total_questions integer not null default 0,
  status text not null default 'in_progress' check (status in ('in_progress','submitted','expired')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

alter table if exists public.guest_exam_attempts
  add column if not exists progress_version integer not null default 0,
  add column if not exists answer_key_snapshot jsonb not null default '{}'::jsonb;
alter table if exists public.guest_exam_attempts drop constraint if exists guest_exam_attempts_policy_snapshot_object_check;
alter table if exists public.guest_exam_attempts drop constraint if exists guest_exam_attempts_policy_version_check;
alter table if exists public.guest_exam_attempts add constraint guest_exam_attempts_policy_snapshot_object_check check (jsonb_typeof(policy_snapshot) = 'object');
alter table if exists public.guest_exam_attempts add constraint guest_exam_attempts_policy_version_check check (policy_version between 1 and 1000000);
alter table if exists public.guest_exam_attempts drop constraint if exists guest_exam_attempts_answer_key_snapshot_object_check;
alter table if exists public.guest_exam_attempts add constraint guest_exam_attempts_answer_key_snapshot_object_check check (jsonb_typeof(answer_key_snapshot) = 'object');

create index if not exists exam_access_slots_exam_window_idx on public.exam_access_slots(exam_id, starts_at, ends_at);
create index if not exists guest_exam_attempts_slot_date_idx on public.guest_exam_attempts(slot_id, started_at desc);
create index if not exists guest_exam_attempts_session_idx on public.guest_exam_attempts(slot_id, session_hash, started_at desc);
create index if not exists guest_exam_attempts_client_idx on public.guest_exam_attempts(slot_id, client_hash, started_at desc);

alter table public.exam_access_slots enable row level security;
alter table if exists public.exam_access_slots
  add column if not exists section_id uuid references public.exam_sections(id) on delete set null;
create index if not exists exam_access_slots_section_idx on public.exam_access_slots(section_id);
alter table public.guest_exam_attempts enable row level security;
drop policy if exists "admin exam access slots" on public.exam_access_slots;
create policy "admin exam access slots" on public.exam_access_slots for all using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin guest exam attempts" on public.guest_exam_attempts;
create policy "admin guest exam attempts" on public.guest_exam_attempts for all using ((select private.is_admin())) with check ((select private.is_admin()));

-- Mirror migration 028: learners can read only safe history columns directly;
-- protected attempt payloads remain server-route/service-role only.
revoke all on table public.exam_attempts from anon, authenticated;
grant select (id, student_id, exam_id, title, score, correct_answers, total_questions, submitted_at, status) on table public.exam_attempts to authenticated;
revoke all on table public.guest_exam_attempts from anon, authenticated;

-- Request throttling mirror of migrations/021_request_rate_limits.sql.
create table if not exists public.request_rate_limits (
  scope text not null check (length(scope) between 1 and 64),
  subject_hash text not null check (length(subject_hash) between 32 and 128),
  tokens numeric not null default 10,
  last_refill_at timestamptz not null default now(),
  denial_window_started_at timestamptz,
  denial_count integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash)
);
create index if not exists request_rate_limits_updated_idx on public.request_rate_limits(updated_at);
alter table public.request_rate_limits enable row level security;
drop policy if exists "admin request rate limits" on public.request_rate_limits;
create policy "admin request rate limits" on public.request_rate_limits for select to authenticated using ((select private.is_admin()));

create or replace function public.consume_request_budget(
  target_scope text,
  target_subject_hash text,
  target_capacity integer default 10,
  target_refill_seconds integer default 5,
  target_cost integer default 1
) returns table(allowed boolean, retry_after_seconds integer, denials_last_minute integer)
language plpgsql security definer set search_path = '' as $$
declare
  checked_at timestamptz := clock_timestamp();
  rate_row public.request_rate_limits%rowtype;
  available_tokens numeric := 0;
  next_denial_count integer := 0;
  next_denial_window timestamptz;
  retry_seconds integer := 1;
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    ''
  );
begin
  if request_role <> 'service_role' then
    return query select false, 60, 0;
    return;
  end if;
  if length(coalesce(target_scope, '')) < 1 or length(coalesce(target_scope, '')) > 64
    or length(coalesce(target_subject_hash, '')) < 32 or length(coalesce(target_subject_hash, '')) > 128
    or target_capacity < 1 or target_capacity > 1000
    or target_refill_seconds < 1 or target_refill_seconds > 3600
    or target_cost < 1 or target_cost > target_capacity then
    return query select false, 60, 0;
    return;
  end if;
  insert into public.request_rate_limits(scope, subject_hash, tokens, last_refill_at, updated_at)
  values(target_scope, target_subject_hash, target_capacity, checked_at, checked_at)
  on conflict (scope, subject_hash) do nothing;
  select * into rate_row from public.request_rate_limits rate_limit
    where rate_limit.scope = target_scope and rate_limit.subject_hash = target_subject_hash for update;
  if not found then return query select false, 60, 0; return; end if;
  if rate_row.blocked_until is not null and rate_row.blocked_until > checked_at then
    retry_seconds := greatest(1, ceil(extract(epoch from rate_row.blocked_until - checked_at))::integer);
    return query select false, retry_seconds, rate_row.denial_count;
    return;
  end if;
  available_tokens := least(target_capacity::numeric, rate_row.tokens + greatest(0::numeric,
    extract(epoch from checked_at - rate_row.last_refill_at)::numeric) / target_refill_seconds);
  if available_tokens >= target_cost then
    update public.request_rate_limits set tokens = available_tokens - target_cost, last_refill_at = checked_at,
      blocked_until = null,
      denial_window_started_at = case when denial_window_started_at is not null and denial_window_started_at < checked_at - interval '60 seconds' then null else denial_window_started_at end,
      denial_count = case when denial_window_started_at is not null and denial_window_started_at < checked_at - interval '60 seconds' then 0 else denial_count end,
      updated_at = checked_at where scope = target_scope and subject_hash = target_subject_hash;
    return query select true, 0, 0;
    return;
  end if;
  next_denial_window := case when rate_row.denial_window_started_at is null or rate_row.denial_window_started_at < checked_at - interval '60 seconds' then checked_at else rate_row.denial_window_started_at end;
  next_denial_count := case when rate_row.denial_window_started_at is null or rate_row.denial_window_started_at < checked_at - interval '60 seconds' then 1 else rate_row.denial_count + 1 end;
  retry_seconds := greatest(1, ceil((target_cost - available_tokens) * target_refill_seconds)::integer);
  update public.request_rate_limits set tokens = available_tokens, last_refill_at = checked_at,
    denial_window_started_at = next_denial_window, denial_count = next_denial_count,
    blocked_until = case when next_denial_count >= 10 then checked_at + interval '30 seconds' else null end,
    updated_at = checked_at where scope = target_scope and subject_hash = target_subject_hash;
  return query select false, case when next_denial_count >= 10 then 30 else retry_seconds end, next_denial_count;
end;
$$;
revoke all on function public.consume_request_budget(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_request_budget(text, text, integer, integer, integer) to service_role;

-- Administrative audit mirror of migrations/022_exam_admin_audit_logs.sql.
create table if not exists public.exam_admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  exam_id uuid references public.exams(id) on delete set null,
  room_id uuid references public.exam_rooms(id) on delete set null,
  slot_id uuid references public.exam_access_slots(id) on delete set null,
  action text not null check (action in (
    'save_exam_access_config',
    'create_exam_access_slot',
    'update_exam_access_slot',
    'rotate_exam_access_slot',
    'release_exam_results',
    'export_exam_results'
  )),
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists exam_admin_audit_logs_exam_date_idx on public.exam_admin_audit_logs(exam_id, created_at desc);
create index if not exists exam_admin_audit_logs_room_date_idx on public.exam_admin_audit_logs(room_id, created_at desc);
create index if not exists exam_admin_audit_logs_slot_date_idx on public.exam_admin_audit_logs(slot_id, created_at desc);
create index if not exists exam_admin_audit_logs_admin_date_idx on public.exam_admin_audit_logs(admin_id, created_at desc);
alter table public.exam_admin_audit_logs enable row level security;
drop policy if exists "admins read exam admin audit logs" on public.exam_admin_audit_logs;
create policy "admins read exam admin audit logs" on public.exam_admin_audit_logs for select to authenticated using ((select private.is_admin()));
revoke all on table public.exam_admin_audit_logs from public;
grant select on table public.exam_admin_audit_logs to authenticated;
grant select, insert, update on table public.exam_admin_audit_logs to service_role;
grant usage, select on sequence public.exam_admin_audit_logs_id_seq to service_role;

-- Mirror of migrations/024_exam_engine_operations.sql for new-project bootstrap.
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
create index if not exists exam_attempts_exam_code_idx on public.exam_attempts(exam_id, exam_code) where exam_code is not null;
create index if not exists exam_attempts_progress_idx on public.exam_attempts(exam_id, student_id, progress_version);
create index if not exists guest_exam_attempts_exam_code_idx on public.guest_exam_attempts(slot_id, exam_code) where exam_code is not null;

create table if not exists public.exam_attempt_adjustments (
  id uuid primary key default gen_random_uuid(), attempt_kind text not null check (attempt_kind in ('account','guest')),
  attempt_id uuid not null, exam_id uuid not null references public.exams(id) on delete cascade,
  slot_id uuid references public.exam_access_slots(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  extension_seconds integer not null default 0 check (extension_seconds between 1 and 86400),
  reason text not null check (length(trim(reason)) between 1 and 500), metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
  constraint exam_attempt_adjustments_scope_check check ((attempt_kind = 'account' and slot_id is null and student_id is not null) or (attempt_kind = 'guest' and slot_id is not null and student_id is null))
);
create index if not exists exam_attempt_adjustments_attempt_idx on public.exam_attempt_adjustments(attempt_kind, attempt_id, created_at desc);
alter table public.exam_attempt_adjustments enable row level security;
drop policy if exists "admin exam attempt adjustments" on public.exam_attempt_adjustments;
create policy "admin exam attempt adjustments" on public.exam_attempt_adjustments for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create table if not exists public.exam_attempt_grants (
  id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.exams(id) on delete cascade,
  slot_id uuid references public.exam_access_slots(id) on delete cascade, student_id uuid references public.profiles(id) on delete cascade,
  client_hash text, candidate_code text, additional_attempts integer not null default 1 check (additional_attempts between 1 and 100),
  consumed_attempts integer not null default 0 check (consumed_attempts between 0 and additional_attempts),
  reason text not null check (length(trim(reason)) between 1 and 500), metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
  constraint exam_attempt_grants_scope_check check ((student_id is not null and slot_id is null and client_hash is null) or (student_id is null and slot_id is not null and length(trim(coalesce(client_hash, ''))) between 32 and 128))
);
create index if not exists exam_attempt_grants_account_idx on public.exam_attempt_grants(exam_id, student_id, consumed_attempts) where student_id is not null;
create index if not exists exam_attempt_grants_guest_idx on public.exam_attempt_grants(exam_id, slot_id, client_hash, consumed_attempts) where client_hash is not null;
alter table public.exam_attempt_grants enable row level security;
drop policy if exists "admin exam attempt grants" on public.exam_attempt_grants;
create policy "admin exam attempt grants" on public.exam_attempt_grants for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create or replace function public.consume_exam_attempt_grant(target_exam_id uuid, target_slot_id uuid, target_student_id uuid, target_client_hash text)
returns table(grant_id uuid, allowed boolean, remaining integer) language plpgsql security invoker set search_path = public as $$
declare selected_grant public.exam_attempt_grants%rowtype;
begin
  select * into selected_grant from public.exam_attempt_grants where exam_id = target_exam_id and consumed_attempts < additional_attempts and ((target_student_id is not null and student_id = target_student_id and slot_id is null) or (target_client_hash is not null and slot_id = target_slot_id and client_hash = target_client_hash and student_id is null)) order by created_at limit 1 for update;
  if not found then return query select null::uuid, false, 0; return; end if;
  update public.exam_attempt_grants set consumed_attempts = consumed_attempts + 1 where id = selected_grant.id;
  return query select selected_grant.id, true, selected_grant.additional_attempts - selected_grant.consumed_attempts - 1;
end; $$;
revoke all on function public.consume_exam_attempt_grant(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.consume_exam_attempt_grant(uuid, uuid, uuid, text) to service_role;

-- Mirror migration 034: raw question source and answer keys are server-only;
-- authenticated admin authoring remains protected by admin RLS policies.
alter table if exists public.exam_sections enable row level security;
alter table if exists public.exam_questions enable row level security;
alter table if exists public.exam_question_keys enable row level security;
drop policy if exists "exam sections student read" on public.exam_sections;
drop policy if exists "exam questions student read" on public.exam_questions;
drop policy if exists "exam question keys student read" on public.exam_question_keys;
revoke all on table public.exam_sections, public.exam_questions, public.exam_question_keys from public, anon;
grant select, insert, update, delete on table public.exam_sections, public.exam_questions, public.exam_question_keys to authenticated;
grant select, insert, update, delete on table public.exam_sections, public.exam_questions, public.exam_question_keys to service_role;

create table if not exists public.exam_scoring_versions (
  id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.exams(id) on delete cascade,
  version integer not null check (version between 1 and 1000000), status text not null default 'draft' check (status in ('draft','applied','superseded')),
  reason text not null check (length(trim(reason)) between 1 and 500), created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(), applied_at timestamptz, unique (exam_id, version)
);
create index if not exists exam_scoring_versions_exam_idx on public.exam_scoring_versions(exam_id, version desc);
alter table public.exam_scoring_versions enable row level security;
drop policy if exists "admin exam scoring versions" on public.exam_scoring_versions;
create policy "admin exam scoring versions" on public.exam_scoring_versions for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create table if not exists public.exam_question_overrides (
  id uuid primary key default gen_random_uuid(), scoring_version_id uuid not null references public.exam_scoring_versions(id) on delete cascade,
  question_id uuid not null references public.exam_questions(id) on delete cascade, override_mode text not null check (override_mode in ('normal','accept_multiple','void_question','award_all')),
  accepted_answers jsonb not null default '[]'::jsonb, reason text not null check (length(trim(reason)) between 1 and 500), created_at timestamptz not null default now(), unique (scoring_version_id, question_id)
);
create index if not exists exam_question_overrides_question_idx on public.exam_question_overrides(question_id, scoring_version_id);
alter table public.exam_question_overrides enable row level security;
drop policy if exists "admin exam question overrides" on public.exam_question_overrides;
create policy "admin exam question overrides" on public.exam_question_overrides for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create table if not exists public.exam_regrade_runs (
  id uuid primary key default gen_random_uuid(), exam_id uuid not null references public.exams(id) on delete cascade,
  scoring_version_id uuid not null references public.exam_scoring_versions(id) on delete restrict, status text not null default 'preview' check (status in ('preview','applied','failed')),
  attempt_count integer not null default 0, affected_count integer not null default 0, summary jsonb not null default '{}'::jsonb,
  reason text not null check (length(trim(reason)) between 1 and 500), created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(), applied_at timestamptz
);
create index if not exists exam_regrade_runs_exam_idx on public.exam_regrade_runs(exam_id, created_at desc);
alter table public.exam_regrade_runs enable row level security;
drop policy if exists "admin exam regrade runs" on public.exam_regrade_runs;
create policy "admin exam regrade runs" on public.exam_regrade_runs for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create table if not exists public.exam_policy_presets (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 1 and 120), slug text not null unique check (length(trim(slug)) between 1 and 120),
  policy jsonb not null default '{}'::jsonb, is_system boolean not null default false, created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.exam_policy_presets enable row level security;
drop policy if exists "admin exam policy presets" on public.exam_policy_presets;
create policy "admin exam policy presets" on public.exam_policy_presets for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create table if not exists public.exam_templates (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 1 and 120), exam_type text not null default 'CUSTOM',
  profile_config jsonb not null default '{}'::jsonb, policy jsonb not null default '{}'::jsonb, source_exam_id uuid references public.exams(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.exam_templates enable row level security;
drop policy if exists "admin exam templates" on public.exam_templates;
create policy "admin exam templates" on public.exam_templates for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create table if not exists public.exam_slot_candidates (
  id uuid primary key default gen_random_uuid(), slot_id uuid not null references public.exam_access_slots(id) on delete cascade, exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_code text not null check (length(trim(candidate_code)) between 1 and 120), full_name text not null default '', class_name text not null default '', school text not null default '', metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (slot_id, candidate_code)
);
create index if not exists exam_slot_candidates_lookup_idx on public.exam_slot_candidates(slot_id, candidate_code);
alter table public.exam_slot_candidates enable row level security;
drop policy if exists "admin exam slot candidates" on public.exam_slot_candidates;
create policy "admin exam slot candidates" on public.exam_slot_candidates for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create index if not exists exams_results_released_idx on public.exams(results_released_at) where results_released_at is not null;

-- Mirror of migrations/026_exam_operations_audit.sql.
alter table if exists public.exam_admin_audit_logs drop constraint if exists exam_admin_audit_logs_action_check;
alter table if exists public.exam_admin_audit_logs add constraint exam_admin_audit_logs_action_check check (action in ('save_exam_access_config','publish_exam','create_exam_access_slot','update_exam_access_slot','rotate_exam_access_slot','release_exam_results','export_exam_results','extend_exam_attempt_time','grant_exam_attempt_retry','import_exam_slot_candidates','create_exam_scoring_version','preview_exam_regrade','apply_exam_regrade','override_exam_question','delete_exam_history'));

-- Mirror of migrations/025_exam_attempt_integrity.sql for new-project bootstrap.
alter table if exists public.exam_attempts
  add column if not exists monitor_events jsonb not null default '[]'::jsonb;
alter table if exists public.exam_attempts drop constraint if exists exam_attempts_monitor_events_array_check;
alter table if exists public.exam_attempts add constraint exam_attempts_monitor_events_array_check check (jsonb_typeof(monitor_events) = 'array');
create unique index if not exists exam_attempts_active_scope_idx
  on public.exam_attempts(student_id, exam_id, coalesce(section_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'in_progress' and exam_id is not null;
create unique index if not exists guest_exam_attempts_active_session_idx
  on public.guest_exam_attempts(slot_id, session_hash)
  where status = 'in_progress';
create index if not exists exam_attempts_monitor_idx on public.exam_attempts(exam_id, status, started_at desc);

-- Mirror of migrations/032_exam_data_api_hardening.sql.
drop policy if exists "attempts self read" on public.exam_attempts;
create policy "attempts self read" on public.exam_attempts for select to authenticated
  using ((student_id = (select auth.uid())) or (select private.is_admin()));
drop policy if exists "admin attempts" on public.exam_attempts;
create policy "admin attempts" on public.exam_attempts for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "active account exam attempts" on public.exam_attempts;
create policy "active account exam attempts" on public.exam_attempts as restrictive for all to authenticated
  using ((select private.is_admin()) or (student_id = (select auth.uid()) and (select private.is_account_active())))
  with check ((select private.is_admin()) or (student_id = (select auth.uid()) and (select private.is_account_active())));
drop policy if exists "active account chapters" on public.chapters;
create policy "active account chapters" on public.chapters as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));
drop policy if exists "active account course enrollments" on public.course_enrollments;
create policy "active account course enrollments" on public.course_enrollments as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));
drop policy if exists "active account courses" on public.courses;
create policy "active account courses" on public.courses as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));
drop policy if exists "active account exam enrollments" on public.exam_room_enrollments;
create policy "active account exam enrollments" on public.exam_room_enrollments as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));
drop policy if exists "active account exam rooms" on public.exam_rooms;
create policy "active account exam rooms" on public.exam_rooms as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));
drop policy if exists "active account exams" on public.exams;
create policy "active account exams" on public.exams as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));
drop policy if exists "active account resources" on public.lesson_resources;
create policy "active account resources" on public.lesson_resources as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));
drop policy if exists "active account lessons" on public.lessons;
create policy "active account lessons" on public.lessons as restrictive for select to authenticated
  using ((select private.is_admin()) or (select private.is_account_active()));
revoke insert, update, delete on table public.exam_attempts from anon, authenticated;
grant select (id, student_id, exam_id, title, score, correct_answers, total_questions, submitted_at, status) on table public.exam_attempts to authenticated;
revoke all on table public.exam_access_slots, public.guest_exam_attempts, public.request_rate_limits,
  public.exam_attempt_adjustments, public.exam_attempt_grants, public.exam_scoring_versions,
  public.exam_question_overrides, public.exam_regrade_runs, public.exam_policy_presets,
  public.exam_templates, public.exam_slot_candidates from public, anon, authenticated;
grant select, insert, update, delete on table public.exam_access_slots, public.guest_exam_attempts,
  public.request_rate_limits, public.exam_attempt_adjustments, public.exam_attempt_grants,
  public.exam_scoring_versions, public.exam_question_overrides, public.exam_regrade_runs,
  public.exam_policy_presets, public.exam_templates, public.exam_slot_candidates to service_role;
revoke all on table public.exam_admin_audit_logs from public, anon, authenticated;
grant select, insert, update on table public.exam_admin_audit_logs to service_role;
grant usage, select on sequence public.exam_admin_audit_logs_id_seq to service_role;
revoke all on function public.consume_request_budget(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_request_budget(text, text, integer, integer, integer) to service_role;
revoke all on function public.consume_exam_attempt_grant(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.consume_exam_attempt_grant(uuid, uuid, uuid, text) to service_role;

-- RLS does not govern these table-level capabilities.
do $$
declare
  target_relation record;
begin
  for target_relation in
    select namespace.nspname as schema_name,
           relation.relname as relation_name
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
  loop
    execute pg_catalog.format(
      'revoke truncate, references, trigger on table %I.%I from anon, authenticated',
      target_relation.schema_name,
      target_relation.relation_name
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';


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
