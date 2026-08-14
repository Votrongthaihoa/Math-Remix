-- Forward-only reconciliation for legacy production databases where
-- lesson_resources predates the Microsoft Graph metadata columns already
-- present in the HEAD bootstrap/schema.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if to_regclass('public.lesson_resources') is null then
    raise exception 'public.lesson_resources is required before Microsoft Graph reconciliation';
  end if;
end
$$;

alter table public.lesson_resources
  add column if not exists provider text,
  add column if not exists provider_drive_id text,
  add column if not exists provider_item_id text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.lesson_resources'::regclass
      and conname = 'lesson_resources_provider_check'
  ) then
    alter table public.lesson_resources
      add constraint lesson_resources_provider_check
      check (provider is null or provider in ('sharepoint', 'onedrive_business', 'onedrive_personal'))
      not valid;
  end if;
end
$$;

alter table public.lesson_resources
  validate constraint lesson_resources_provider_check;

comment on column public.lesson_resources.provider is
  'Microsoft storage provider for server-resolved lesson videos.';
comment on column public.lesson_resources.provider_drive_id is
  'Stable Microsoft Graph drive identifier; never a temporary download URL.';
comment on column public.lesson_resources.provider_item_id is
  'Stable Microsoft Graph drive item identifier; never a temporary download URL.';
comment on column public.lesson_resources.provider_metadata is
  'Non-secret video metadata. OAuth tokens and temporary CDN URLs are forbidden.';

do $$
declare
  missing_columns text[];
  provider_constraint text;
begin
  select array_agg(required.name order by required.name)
    into missing_columns
  from (
    values
      ('provider', 'text', 'YES'),
      ('provider_drive_id', 'text', 'YES'),
      ('provider_item_id', 'text', 'YES'),
      ('provider_metadata', 'jsonb', 'NO')
  ) as required(name, data_type, is_nullable)
  left join information_schema.columns column_info
    on column_info.table_schema = 'public'
   and column_info.table_name = 'lesson_resources'
   and column_info.column_name = required.name
   and column_info.data_type = required.data_type
   and column_info.is_nullable = required.is_nullable
  where column_info.column_name is null;

  if coalesce(cardinality(missing_columns), 0) > 0 then
    raise exception 'Microsoft Graph lesson resource columns are missing or invalid: %', missing_columns;
  end if;

  select pg_catalog.pg_get_constraintdef(constraint_row.oid)
    into provider_constraint
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.lesson_resources'::regclass
    and constraint_row.conname = 'lesson_resources_provider_check'
    and constraint_row.contype = 'c'
    and constraint_row.convalidated;

  if provider_constraint is null
     or provider_constraint not like '%sharepoint%'
     or provider_constraint not like '%onedrive_business%'
     or provider_constraint not like '%onedrive_personal%' then
    raise exception 'lesson_resources_provider_check is missing or invalid';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
