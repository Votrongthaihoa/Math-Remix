create table if not exists public.course_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null unique references public.courses(id) on delete cascade,
  start_date date not null,
  weekdays smallint[] not null,
  start_time time without time zone not null,
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  time_zone text not null default 'Asia/Ho_Chi_Minh' check (time_zone = 'Asia/Ho_Chi_Minh'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_schedule_rules_weekdays_check check (
    cardinality(weekdays) between 1 and 7
    and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
  )
);

create table if not exists public.course_schedule_events (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  description text not null default '' check (char_length(description) <= 2000),
  start_at timestamptz not null,
  end_at timestamptz not null,
  instructor text not null default '' check (char_length(instructor) <= 160),
  delivery_mode text not null default 'self_study' check (delivery_mode in ('online','offline','hybrid','self_study')),
  meeting_url text check (meeting_url is null or meeting_url ~ '^https?://'),
  event_kind text not null check (event_kind in ('live','lesson')),
  source text not null check (source in ('manual','generated')),
  generation_batch_id uuid,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  published boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_schedule_events_window_check check (end_at > start_at),
  constraint course_schedule_events_kind_check check (
    (event_kind = 'lesson' and lesson_id is not null and source = 'generated' and generation_batch_id is not null and meeting_url is null)
    or (event_kind = 'live' and source = 'manual' and generation_batch_id is null)
  )
);

create unique index if not exists course_schedule_events_lesson_unique
  on public.course_schedule_events(lesson_id)
  where event_kind = 'lesson';
create index if not exists course_schedule_events_course_start_idx
  on public.course_schedule_events(course_id, start_at);
create index if not exists course_schedule_events_visible_start_idx
  on public.course_schedule_events(start_at, end_at)
  where published and status = 'scheduled';

alter table public.course_schedule_rules enable row level security;
alter table public.course_schedule_events enable row level security;

drop policy if exists "admin course schedule rules" on public.course_schedule_rules;
create policy "admin course schedule rules" on public.course_schedule_rules
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "admin course schedule events" on public.course_schedule_events;
create policy "admin course schedule events" on public.course_schedule_events
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "students read enrolled course schedule" on public.course_schedule_events;
create policy "students read enrolled course schedule" on public.course_schedule_events
  for select to authenticated
  using (
    published
    and status = 'scheduled'
    and (select private.is_account_active())
    and exists (
      select 1
      from public.course_enrollments enrollment
      join public.courses course on course.id = enrollment.course_id
      where enrollment.student_id = (select auth.uid())
        and enrollment.course_id = course_schedule_events.course_id
        and course.published
    )
  );

revoke all on table public.course_schedule_rules, public.course_schedule_events from public, anon, authenticated;
grant all on table public.course_schedule_rules, public.course_schedule_events to service_role;
grant select (
  id, course_id, lesson_id, title, description, start_at, end_at, instructor,
  delivery_mode, event_kind, source, status, published, created_at, updated_at
) on table public.course_schedule_events to authenticated;
