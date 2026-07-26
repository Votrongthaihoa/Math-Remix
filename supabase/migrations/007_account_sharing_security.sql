create extension if not exists pgcrypto;

alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check check (account_status in ('active','temporarily_banned','permanently_banned'));
alter table public.profiles add column if not exists violation_count integer not null default 0;
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists banned_until timestamptz;
alter table public.profiles add column if not exists ban_reason text;
alter table public.profiles add column if not exists ban_event_id bigint;
alter table public.profiles add column if not exists banned_by uuid references auth.users(id);

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

alter table public.profiles drop constraint if exists profiles_ban_event_id_fkey;
alter table public.profiles add constraint profiles_ban_event_id_fkey foreign key (ban_event_id) references public.security_events(id) on delete set null;

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

alter table public.trusted_devices enable row level security;
alter table public.user_sessions enable row level security;
alter table public.device_verification_challenges enable row level security;
alter table public.security_events enable row level security;
alter table public.account_violations enable row level security;
alter table public.admin_actions enable row level security;

-- A student may edit their display name, but must never be able to clear their
-- own ban fields through the browser client.
revoke update on table public.profiles from authenticated;
grant update (full_name, updated_at) on table public.profiles to authenticated;

drop policy if exists "devices self read" on public.trusted_devices;
create policy "devices self read" on public.trusted_devices for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "admin devices" on public.trusted_devices;
create policy "admin devices" on public.trusted_devices for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "sessions self read" on public.user_sessions;
create policy "sessions self read" on public.user_sessions for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "admin sessions" on public.user_sessions;
create policy "admin sessions" on public.user_sessions for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin device challenges" on public.device_verification_challenges;
create policy "admin device challenges" on public.device_verification_challenges for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin security events" on public.security_events;
create policy "admin security events" on public.security_events for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin violations" on public.account_violations;
create policy "admin violations" on public.account_violations for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin action read" on public.admin_actions;
create policy "admin action read" on public.admin_actions for select using (public.is_admin());

create or replace function public.is_account_active(target_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_user_id
      and p.status = 'active'
      and (
        p.account_status = 'active'
        or (p.account_status = 'temporarily_banned' and p.banned_until is not null and p.banned_until <= now())
      )
  );
$$;
revoke all on function public.is_account_active(uuid) from public;
grant execute on function public.is_account_active(uuid) to authenticated, service_role;

create or replace function public.apply_account_violation(
  target_user_id uuid,
  target_event_id bigint,
  target_violation_type text,
  target_reason text
)
returns table(violation_number integer, account_status text, banned_at timestamptz, banned_until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  current_count integer;
  next_count integer;
  duration_interval interval;
  permanent_lock boolean;
  started_at timestamptz := now();
  ends_at timestamptz;
begin
  select p.violation_count into current_count from public.profiles p where p.id = target_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;
  next_count := coalesce(current_count, 0) + 1;
  permanent_lock := next_count >= 5;
  duration_interval := case next_count when 1 then interval '24 hours' when 2 then interval '48 hours' when 3 then interval '72 hours' when 4 then interval '7 days' else null end;
  ends_at := case when permanent_lock then null else started_at + duration_interval end;

  update public.profiles set
    violation_count = next_count,
    account_status = case when permanent_lock then 'permanently_banned' else 'temporarily_banned' end,
    banned_at = started_at,
    banned_until = ends_at,
    ban_reason = target_reason,
    ban_event_id = target_event_id,
    updated_at = started_at
  where id = target_user_id;

  insert into public.account_violations(user_id, violation_number, violation_type, reason, security_event_id, ban_started_at, ban_ends_at, permanent)
  values(target_user_id, next_count, target_violation_type, target_reason, target_event_id, started_at, ends_at, permanent_lock);

  update public.user_sessions set revoked_at = started_at where user_id = target_user_id and revoked_at is null;
  insert into public.security_events(user_id, event_type, risk_score, reason, evidence)
  values(target_user_id, case when permanent_lock then 'permanent_ban' else 'temporary_ban' end, 100, target_reason, jsonb_build_object('violationNumber', next_count, 'sourceEventId', target_event_id));

  return query select next_count, case when permanent_lock then 'permanently_banned' else 'temporarily_banned' end, started_at, ends_at;
end;
$$;
revoke all on function public.apply_account_violation(uuid,bigint,text,text) from public;
grant execute on function public.apply_account_violation(uuid,bigint,text,text) to service_role;

-- Restrictive policies are combined with the existing content policies. They
-- prevent a banned student from bypassing the server APIs with the public SDK.
drop policy if exists "active account courses" on public.courses;
create policy "active account courses" on public.courses as restrictive for select to authenticated using (public.is_admin() or public.is_account_active(auth.uid()));
drop policy if exists "active account chapters" on public.chapters;
create policy "active account chapters" on public.chapters as restrictive for select to authenticated using (public.is_admin() or public.is_account_active(auth.uid()));
drop policy if exists "active account lessons" on public.lessons;
create policy "active account lessons" on public.lessons as restrictive for select to authenticated using (public.is_admin() or public.is_account_active(auth.uid()));
drop policy if exists "active account resources" on public.lesson_resources;
create policy "active account resources" on public.lesson_resources as restrictive for select to authenticated using (public.is_admin() or public.is_account_active(auth.uid()));
drop policy if exists "active account course enrollments" on public.course_enrollments;
create policy "active account course enrollments" on public.course_enrollments as restrictive for select to authenticated using (public.is_admin() or public.is_account_active(auth.uid()));
drop policy if exists "active account exam rooms" on public.exam_rooms;
create policy "active account exam rooms" on public.exam_rooms as restrictive for select to authenticated using (public.is_admin() or public.is_account_active(auth.uid()));
drop policy if exists "active account exams" on public.exams;
create policy "active account exams" on public.exams as restrictive for select to authenticated using (public.is_admin() or public.is_account_active(auth.uid()));
drop policy if exists "active account exam sections" on public.exam_sections;
create policy "active account exam sections" on public.exam_sections as restrictive for select to authenticated using (public.is_admin() or public.is_account_active(auth.uid()));
drop policy if exists "active account exam questions" on public.exam_questions;
create policy "active account exam questions" on public.exam_questions as restrictive for select to authenticated using (public.is_admin() or public.is_account_active(auth.uid()));
drop policy if exists "active account exam enrollments" on public.exam_room_enrollments;
create policy "active account exam enrollments" on public.exam_room_enrollments as restrictive for select to authenticated using (public.is_admin() or public.is_account_active(auth.uid()));
drop policy if exists "active account exam attempts" on public.exam_attempts;
create policy "active account exam attempts" on public.exam_attempts as restrictive for all to authenticated using (public.is_admin() or public.is_account_active(auth.uid())) with check (public.is_admin() or public.is_account_active(auth.uid()));
