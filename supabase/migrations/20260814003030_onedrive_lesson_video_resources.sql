-- Forward-only extension for Microsoft-hosted lesson videos shared publicly.
-- The application stores a stable public Microsoft playback URL and does not
-- require Graph credentials or persist short-lived access tokens.
alter table public.lesson_resources
  drop constraint if exists lesson_resources_resource_type_check;

alter table public.lesson_resources
  add constraint lesson_resources_resource_type_check
  check (resource_type in ('youtube', 'onedrive_video', 'external_pdf', 'storage_pdf'));

comment on column public.lesson_resources.resource_url is
  'Stable source/share URL. Public Microsoft playback URLs may be stored; expiring CDN and OAuth URLs are forbidden.';
