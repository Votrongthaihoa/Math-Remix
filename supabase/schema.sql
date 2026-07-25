create extension if not exists pgcrypto;

create table if not exists public.student_sequences (
  singleton boolean primary key default true check (singleton),
  last_value bigint not null default 0
);
insert into public.student_sequences(singleton, last_value) values (true, 0) on conflict do nothing;

create or replace function public.next_student_code() returns text language plpgsql security definer as $$
declare value bigint;
begin
  update public.student_sequences set last_value = last_value + 1 where singleton = true returning last_value into value;
  return 'REMIX' || lpad(value::text, 6, '0');
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_code text not null unique default public.next_student_code(),
  full_name text not null,
  role text not null default 'student' check (role in ('student','admin')),
  status text not null default 'active' check (status in ('active','locked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

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
  title text not null, resource_type text not null check (resource_type in ('youtube','external_pdf','storage_pdf')),
  resource_url text not null, allow_download boolean not null default false, sort_order int not null default 0
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

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Client accounts may edit their display name, never role or status.
revoke update on table public.profiles from anon;
revoke update on table public.profiles from authenticated;
grant update (full_name) on table public.profiles to authenticated;

create policy "profile self read" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profile self update" on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "admin profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "courses enrolled read" on public.courses for select using (published and exists(select 1 from public.course_enrollments e where e.course_id=id and e.student_id=auth.uid()) or public.is_admin());
create policy "admin courses" on public.courses for all using (public.is_admin()) with check (public.is_admin());
create policy "chapters read" on public.chapters for select using (exists(select 1 from public.courses c where c.id=course_id and (public.is_admin() or c.published and exists(select 1 from public.course_enrollments e where e.course_id=c.id and e.student_id=auth.uid()))));
create policy "admin chapters" on public.chapters for all using (public.is_admin()) with check (public.is_admin());
create policy "lessons read" on public.lessons for select using (published and exists(select 1 from public.chapters ch join public.course_enrollments e on e.course_id=ch.course_id where ch.id=chapter_id and e.student_id=auth.uid()) or public.is_admin());
create policy "admin lessons" on public.lessons for all using (public.is_admin()) with check (public.is_admin());
create policy "resources read" on public.lesson_resources for select using (exists(select 1 from public.lessons l join public.chapters ch on ch.id=l.chapter_id join public.course_enrollments e on e.course_id=ch.course_id where l.id=lesson_id and l.published and e.student_id=auth.uid()) or public.is_admin());
create policy "admin resources" on public.lesson_resources for all using (public.is_admin()) with check (public.is_admin());
create policy "enrollments self read" on public.course_enrollments for select using (student_id=auth.uid() or public.is_admin());
create policy "admin enrollments" on public.course_enrollments for all using (public.is_admin()) with check (public.is_admin());
create policy "attempts self read" on public.exam_attempts for select using (student_id=auth.uid() or public.is_admin());
create policy "admin attempts" on public.exam_attempts for all using (public.is_admin()) with check (public.is_admin());
