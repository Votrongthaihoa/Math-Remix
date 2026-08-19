-- Add OneDrive HLS Vault resources. The source URL remains a stable logical
-- reference; the server resolves the vault path only after authorization.
alter table public.lesson_resources
  drop constraint if exists lesson_resources_resource_type_check;

alter table public.lesson_resources
  add constraint lesson_resources_resource_type_check
  check (resource_type in ('youtube', 'onedrive_video', 'hls_vault', 'external_pdf', 'storage_pdf'));

comment on column public.lesson_resources.provider_metadata is
  'Non-secret metadata. HLS Vault uses playbackMode=hls-vault and hlsVideoId; no keys or temporary URLs.';
