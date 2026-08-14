-- Forward-only extension for Microsoft-hosted lesson videos. Temporary
-- preauthenticated download URLs are deliberately never stored here.
alter table public.lesson_resources
  drop constraint if exists lesson_resources_resource_type_check;

alter table public.lesson_resources
  add constraint lesson_resources_resource_type_check
  check (resource_type in ('youtube', 'onedrive_video', 'external_pdf', 'storage_pdf'));

alter table public.lesson_resources
  add column if not exists provider text,
  add column if not exists provider_drive_id text,
  add column if not exists provider_item_id text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

alter table public.lesson_resources
  drop constraint if exists lesson_resources_provider_check;

alter table public.lesson_resources
  add constraint lesson_resources_provider_check
  check (provider is null or provider in ('sharepoint', 'onedrive_business', 'onedrive_personal'));

comment on column public.lesson_resources.resource_url is
  'Stable source/share URL. Never store expiring CDN download URLs here.';
comment on column public.lesson_resources.provider_metadata is
  'Stable non-secret provider metadata only; Graph access tokens and preauthenticated URLs are forbidden.';
