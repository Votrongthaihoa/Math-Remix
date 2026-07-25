alter table public.lesson_resources
add column if not exists allow_download boolean not null default false;
