-- Read-only staging verification for Remix Study Edu migrations 017-042.
-- Run in the Supabase SQL editor/MCP after applying migrations in manifest order.
-- Do not run this file as a migration and do not run DDL from production clients.

select current_database() as database_name,
       current_user as database_user,
       current_setting('server_version') as server_version,
       now() as checked_at;

select to_regclass('supabase_migrations.schema_migrations') as migration_history_table;

select table_name,
       (select c.relrowsecurity
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = information_schema.tables.table_name) as rls_enabled
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'exam_access_slots', 'guest_exam_attempts', 'request_rate_limits',
    'exam_admin_audit_logs', 'exam_attempt_adjustments', 'exam_attempt_grants',
    'exam_scoring_versions', 'exam_question_overrides', 'exam_regrade_runs',
    'exam_policy_presets', 'exam_templates', 'exam_slot_candidates'
  )
order by table_name;

select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('exams', 'exam_attempts', 'guest_exam_attempts')
  and column_name in (
    'dashboard_title', 'settings', 'structure_config', 'results_released_at',
    'policy_snapshot', 'policy_version', 'answer_key_snapshot',
    'question_order', 'option_order', 'flagged_questions', 'exam_code',
    'progress_version', 'time_extension_seconds', 'network_state',
    'scoring_version', 'monitor_events'
  )
order by table_name, column_name;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'exams'
  and column_name = 'dashboard_title';

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and (tablename like 'exam%' or tablename = 'request_rate_limits')
order by tablename, indexname;

select conrelid::regclass as table_name,
       conname,
       contype,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and (conrelid::regclass::text like 'public.exam%' or conrelid::regclass::text = 'public.request_rate_limits')
order by conrelid::regclass::text, conname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (tablename like 'exam%' or tablename = 'request_rate_limits')
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
  and (table_name like 'exam%' or table_name = 'request_rate_limits')
order by table_name, grantee, privilege_type;

select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('exam_sections', 'exam_questions')
  and policyname in (
    'active account exam sections',
    'active account exam questions',
    'exam sections student read',
    'exam questions student read'
  )
order by tablename, policyname;

select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and p.proname in (
    'consume_request_budget',
    'consume_exam_attempt_grant',
    'apply_account_violation',
    'handle_new_user',
    'is_account_active',
    'is_admin',
    'next_student_code'
  );

with helpers as (
  select to_regprocedure('private.is_account_active()') as private_helper,
         to_regprocedure('public.is_account_active(uuid)') as public_uuid_helper
)
select 'private_account_active_helper' as check_name,
       private_helper is not null as helper_exists,
       coalesce(has_function_privilege('anon', private_helper, 'execute'), false) as anon_execute,
       coalesce(has_function_privilege('authenticated', private_helper, 'execute'), false) as authenticated_execute,
       coalesce(has_function_privilege('service_role', private_helper, 'execute'), false) as service_role_execute,
       coalesce(has_function_privilege('anon', public_uuid_helper, 'execute'), false) as public_uuid_anon_execute,
       coalesce(has_function_privilege('authenticated', public_uuid_helper, 'execute'), false) as public_uuid_authenticated_execute,
       coalesce(has_function_privilege('service_role', public_uuid_helper, 'execute'), false) as public_uuid_service_execute
from helpers;

with helpers as (
  select to_regnamespace('private') as private_schema,
         to_regprocedure('private.is_admin()') as private_helper,
         to_regprocedure('public.is_admin()') as public_helper
)
select 'private_admin_helper' as check_name,
       private_helper is not null as helper_exists,
       public_helper is null as public_helper_removed,
       coalesce(has_schema_privilege('anon', private_schema, 'usage'), false) as anon_schema_usage,
       coalesce(has_schema_privilege('authenticated', private_schema, 'usage'), false) as authenticated_schema_usage,
       coalesce(has_schema_privilege('service_role', private_schema, 'usage'), false) as service_role_schema_usage,
       coalesce(has_function_privilege('anon', private_helper, 'execute'), false) as anon_execute,
       coalesce(has_function_privilege('authenticated', private_helper, 'execute'), false) as authenticated_execute,
       coalesce(has_function_privilege('service_role', private_helper, 'execute'), false) as service_role_execute
from helpers;

select count(*) as policies_still_referencing_public_is_admin
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~
      'public[.]is_admin|(^|[^[:alnum:]_.])is_admin[[:space:]]*[(]';

select n.nspname as schema_name,
       c.relname as table_name,
       p.polname as policy_name,
       pg_get_expr(p.polqual, p.polrelid) as using_expression,
       pg_get_expr(p.polwithcheck, p.polrelid) as check_expression
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
       coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) like '%private.is_admin()%'
order by n.nspname, c.relname, p.polname;

with relations as (
  select to_regclass('public.exam_attempts') as exam_attempts,
         to_regclass('public.guest_exam_attempts') as guest_exam_attempts
)
select 'anon_attempt_delete' as check_name,
       exam_attempts is not null as relation_exists,
       coalesce(has_table_privilege('anon', exam_attempts, 'DELETE'), false) as should_be_false
from relations
union all
select 'authenticated_attempt_delete',
       exam_attempts is not null,
       coalesce(has_table_privilege('authenticated', exam_attempts, 'DELETE'), false)
from relations
union all
select 'anon_guest_attempt_select',
       guest_exam_attempts is not null,
       coalesce(has_table_privilege('anon', guest_exam_attempts, 'SELECT'), false)
from relations
union all
select 'authenticated_guest_attempt_select',
       guest_exam_attempts is not null,
       coalesce(has_table_privilege('authenticated', guest_exam_attempts, 'SELECT'), false)
from relations;

do $$
declare
  orphan_count bigint;
begin
  if to_regclass('public.exam_access_slots') is null
     or to_regclass('public.exams') is null then
    raise notice 'SKIP orphan_slot_exam: required relations are missing';
  else
    execute 'select count(*) from public.exam_access_slots s left join public.exams e on e.id = s.exam_id where e.id is null'
      into orphan_count;
    raise notice 'CHECK orphan_slot_exam: %', orphan_count;
  end if;

  if to_regclass('public.guest_exam_attempts') is null
     or to_regclass('public.exam_access_slots') is null then
    raise notice 'SKIP orphan_guest_attempt_slot: required relations are missing';
  else
    execute 'select count(*) from public.guest_exam_attempts a left join public.exam_access_slots s on s.id = a.slot_id where s.id is null'
      into orphan_count;
    raise notice 'CHECK orphan_guest_attempt_slot: %', orphan_count;
  end if;
end
$$;
