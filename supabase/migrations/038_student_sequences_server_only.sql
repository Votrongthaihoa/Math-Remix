-- Keep the sequence backing generated student codes server-only.
-- Browser roles must not be able to read or mutate this table directly.

alter table if exists public.student_sequences enable row level security;

revoke all on table public.student_sequences
from public, anon, authenticated;

revoke all on function public.next_student_code()
from public, anon, authenticated;

grant execute on function public.next_student_code()
to service_role;
