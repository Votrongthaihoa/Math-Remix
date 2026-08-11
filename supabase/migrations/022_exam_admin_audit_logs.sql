-- Server audit trail for administrative exam-access actions.
-- Writes are intentionally limited to the service role; administrators can
-- read rows through RLS for the future audit UI/reporting.
create table if not exists public.exam_admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  exam_id uuid references public.exams(id) on delete set null,
  room_id uuid references public.exam_rooms(id) on delete set null,
  slot_id uuid references public.exam_access_slots(id) on delete set null,
  action text not null check (action in (
    'save_exam_access_config',
    'create_exam_access_slot',
    'update_exam_access_slot',
    'rotate_exam_access_slot',
    'release_exam_results',
    'export_exam_results'
  )),
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists exam_admin_audit_logs_exam_date_idx
  on public.exam_admin_audit_logs(exam_id, created_at desc);
create index if not exists exam_admin_audit_logs_room_date_idx
  on public.exam_admin_audit_logs(room_id, created_at desc);
create index if not exists exam_admin_audit_logs_slot_date_idx
  on public.exam_admin_audit_logs(slot_id, created_at desc);
create index if not exists exam_admin_audit_logs_admin_date_idx
  on public.exam_admin_audit_logs(admin_id, created_at desc);

alter table public.exam_admin_audit_logs enable row level security;
drop policy if exists "admins read exam admin audit logs" on public.exam_admin_audit_logs;
create policy "admins read exam admin audit logs" on public.exam_admin_audit_logs
  for select to authenticated
  using ((select public.is_admin()));

revoke all on table public.exam_admin_audit_logs from public;
grant select on table public.exam_admin_audit_logs to authenticated;
grant select, insert, update on table public.exam_admin_audit_logs to service_role;
grant usage, select on sequence public.exam_admin_audit_logs_id_seq to service_role;

notify pgrst, 'reload schema';
