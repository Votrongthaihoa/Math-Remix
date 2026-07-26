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
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.exam_rooms(id) on delete cascade,
  title text not null,
  description text not null default '',
  exam_type text not null default 'TSA',
  mode text not null default 'free' check (mode in ('free','scheduled')),
  duration_minutes int not null default 90 check (duration_minutes > 0),
  published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.exam_sections (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  title text not null,
  duration_minutes int,
  sort_order int not null default 0
);

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.exam_sections(id) on delete cascade,
  prompt text not null,
  question_type text not null default 'single' check (question_type in ('single','multiple','text')),
  options jsonb not null default '[]'::jsonb,
  points numeric not null default 1 check (points >= 0),
  sort_order int not null default 0
);

create table if not exists public.exam_question_keys (
  question_id uuid primary key references public.exam_questions(id) on delete cascade,
  correct_answer jsonb not null,
  explanation text not null default ''
);

create table if not exists public.exam_room_enrollments (
  room_id uuid not null references public.exam_rooms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (room_id, student_id)
);

alter table public.exam_attempts drop constraint if exists exam_attempts_status_check;
alter table public.exam_attempts alter column submitted_at drop not null;
alter table public.exam_attempts add column if not exists exam_id uuid references public.exams(id) on delete set null;
alter table public.exam_attempts add column if not exists mode text not null default 'practice' check (mode in ('practice','exam'));
alter table public.exam_attempts add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.exam_attempts add column if not exists started_at timestamptz not null default now();
alter table public.exam_attempts add column if not exists duration_seconds int;
alter table public.exam_attempts add constraint exam_attempts_status_check check (status in ('in_progress','completed','submitted','graded'));

create index if not exists exams_room_sort_idx on public.exams(room_id, sort_order);
create index if not exists exam_sections_exam_sort_idx on public.exam_sections(exam_id, sort_order);
create index if not exists exam_questions_section_sort_idx on public.exam_questions(section_id, sort_order);
create index if not exists exam_attempts_exam_student_idx on public.exam_attempts(exam_id, student_id, started_at desc);

alter table public.exam_rooms enable row level security;
alter table public.exams enable row level security;
alter table public.exam_sections enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_question_keys enable row level security;
alter table public.exam_room_enrollments enable row level security;

drop policy if exists "exam rooms student read" on public.exam_rooms;
create policy "exam rooms student read" on public.exam_rooms for select using (
  public.is_admin() or published and (
    access_mode = 'open' or exists (
      select 1 from public.exam_room_enrollments e where e.room_id = id and e.student_id = auth.uid()
    )
  )
);
drop policy if exists "admin exam rooms" on public.exam_rooms;
create policy "admin exam rooms" on public.exam_rooms for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "exams student read" on public.exams;
create policy "exams student read" on public.exams for select using (
  public.is_admin() or published and exists (
    select 1 from public.exam_rooms r where r.id = room_id and r.published and (
      r.access_mode = 'open' or exists (
        select 1 from public.exam_room_enrollments e where e.room_id = r.id and e.student_id = auth.uid()
      )
    )
  )
);
drop policy if exists "admin exams" on public.exams;
create policy "admin exams" on public.exams for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "exam sections student read" on public.exam_sections;
create policy "exam sections student read" on public.exam_sections for select using (
  public.is_admin() or exists (
    select 1 from public.exams e join public.exam_rooms r on r.id = e.room_id
    where e.id = exam_id and e.published and r.published and (
      r.access_mode = 'open' or exists (
        select 1 from public.exam_room_enrollments enrollment where enrollment.room_id = r.id and enrollment.student_id = auth.uid()
      )
    )
  )
);
drop policy if exists "admin exam sections" on public.exam_sections;
create policy "admin exam sections" on public.exam_sections for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "exam questions student read" on public.exam_questions;
create policy "exam questions student read" on public.exam_questions for select using (
  public.is_admin() or exists (
    select 1 from public.exam_sections s join public.exams e on e.id = s.exam_id join public.exam_rooms r on r.id = e.room_id
    where s.id = section_id and e.published and r.published and (
      r.access_mode = 'open' or exists (
        select 1 from public.exam_room_enrollments enrollment where enrollment.room_id = r.id and enrollment.student_id = auth.uid()
      )
    )
  )
);
drop policy if exists "admin exam questions" on public.exam_questions;
create policy "admin exam questions" on public.exam_questions for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin exam question keys" on public.exam_question_keys;
create policy "admin exam question keys" on public.exam_question_keys for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "exam room enrollments self read" on public.exam_room_enrollments;
create policy "exam room enrollments self read" on public.exam_room_enrollments for select using (student_id = auth.uid() or public.is_admin());
drop policy if exists "admin exam room enrollments" on public.exam_room_enrollments;
create policy "admin exam room enrollments" on public.exam_room_enrollments for all using (public.is_admin()) with check (public.is_admin());
