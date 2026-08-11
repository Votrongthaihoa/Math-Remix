-- Short-lived, shareable exam links for candidates without an account.
-- All guest rows are accessed through trusted server routes; no browser RLS
-- policy is intentionally granted for these tables.

alter table if exists public.exams
  add column if not exists settings jsonb not null default '{}'::jsonb;

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
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_access_slots_window_check check (ends_at > starts_at),
  constraint exam_access_slots_export_window_check check (export_close_at is null or export_open_at is null or export_close_at > export_open_at)
);

create index if not exists exam_access_slots_exam_window_idx
  on public.exam_access_slots(exam_id, starts_at, ends_at);

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
  monitor_events jsonb not null default '[]'::jsonb,
  score numeric,
  correct_answers integer not null default 0,
  total_questions integer not null default 0,
  status text not null default 'in_progress' check (status in ('in_progress','submitted','expired')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists guest_exam_attempts_slot_date_idx
  on public.guest_exam_attempts(slot_id, started_at desc);
create index if not exists guest_exam_attempts_session_idx
  on public.guest_exam_attempts(slot_id, session_hash, started_at desc);
create index if not exists guest_exam_attempts_client_idx
  on public.guest_exam_attempts(slot_id, client_hash, started_at desc);

alter table public.exam_access_slots enable row level security;
alter table public.guest_exam_attempts enable row level security;

drop policy if exists "admin exam access slots" on public.exam_access_slots;
create policy "admin exam access slots" on public.exam_access_slots
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin guest exam attempts" on public.guest_exam_attempts;
create policy "admin guest exam attempts" on public.guest_exam_attempts
  for all using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
