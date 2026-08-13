begin;

-- Forward-only repair for tables created by the 043 bootstrap without an
-- explicit RLS enablement statement. Existing policies and grants are kept.
alter table public.exam_rooms enable row level security;
alter table public.exams enable row level security;
alter table public.exam_room_enrollments enable row level security;

do $$
declare
  missing_rls text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}'::text[])
    into missing_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any (array['exam_rooms', 'exams', 'exam_room_enrollments'])
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;

  if cardinality(missing_rls) > 0 then
    raise exception '044 failed to enable RLS for %', missing_rls;
  end if;
end
$$;

commit;
