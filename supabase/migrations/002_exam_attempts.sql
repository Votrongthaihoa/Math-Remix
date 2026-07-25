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

create index if not exists exam_attempts_student_date_idx
  on public.exam_attempts(student_id, submitted_at desc);

alter table public.exam_attempts enable row level security;

drop policy if exists "attempts self read" on public.exam_attempts;
create policy "attempts self read" on public.exam_attempts
  for select using (student_id = auth.uid() or public.is_admin());

drop policy if exists "admin attempts" on public.exam_attempts;
create policy "admin attempts" on public.exam_attempts
  for all using (public.is_admin()) with check (public.is_admin());
