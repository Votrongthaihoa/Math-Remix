alter table public.courses add column if not exists cover_color text;

update public.courses
set cover_color = '#cd1627'
where cover_color is null
   or cover_color !~ '^#[0-9A-Fa-f]{6}$';

alter table public.courses alter column cover_color set default '#cd1627';
alter table public.courses alter column cover_color set not null;
alter table public.courses drop constraint if exists courses_cover_color_check;
alter table public.courses
  add constraint courses_cover_color_check
  check (cover_color ~ '^#[0-9A-Fa-f]{6}$');
