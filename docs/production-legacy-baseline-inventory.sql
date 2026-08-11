-- Read-only inventory for planning a data-preserving legacy-to-HEAD migration.
-- Run the complete file in the target Supabase SQL editor. It reads metadata
-- and estimated row counts only; it does not read application row contents.

select current_database() as database_name,
       current_user as database_user,
       current_setting('server_version') as server_version,
       pg_catalog.now() as checked_at;

select extension.extname as extension_name,
       extension.extversion as extension_version
from pg_catalog.pg_extension extension
order by extension_name;

select namespace.nspname as schema_name,
       relation.relname as table_name,
       relation.relrowsecurity as rls_enabled,
       relation.relforcerowsecurity as rls_forced,
       coalesce(statistics.n_live_tup, 0) as estimated_live_rows,
       pg_catalog.pg_total_relation_size(relation.oid) as total_bytes
from pg_catalog.pg_class relation
join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
left join pg_catalog.pg_stat_user_tables statistics on statistics.relid = relation.oid
where namespace.nspname = 'public'
  and relation.relkind in ('r', 'p')
order by relation.relname;

with expected_relations(relation_name) as (
  values
    ('account_violations'),
    ('admin_actions'),
    ('chapters'),
    ('course_enrollments'),
    ('courses'),
    ('device_verification_challenges'),
    ('exam_access_slots'),
    ('exam_admin_audit_logs'),
    ('exam_attempt_adjustments'),
    ('exam_attempt_grants'),
    ('exam_attempts'),
    ('exam_policy_presets'),
    ('exam_question_keys'),
    ('exam_question_overrides'),
    ('exam_questions'),
    ('exam_regrade_runs'),
    ('exam_room_enrollments'),
    ('exam_rooms'),
    ('exam_scoring_versions'),
    ('exam_sections'),
    ('exam_slot_candidates'),
    ('exam_templates'),
    ('exams'),
    ('guest_exam_attempts'),
    ('lesson_resources'),
    ('lessons'),
    ('profiles'),
    ('question_bank_item_versions'),
    ('question_bank_items'),
    ('question_bank_nodes'),
    ('question_banks'),
    ('request_rate_limits'),
    ('security_events'),
    ('student_sequences'),
    ('trusted_devices'),
    ('user_sessions')
)
select relation_name,
       pg_catalog.to_regclass('public.' || relation_name) is not null as exists_on_target
from expected_relations
order by relation_name;

with legacy_relations(relation_name) as (
  values
    ('attempt_details'),
    ('attempts'),
    ('courses'),
    ('documents'),
    ('exam_sections'),
    ('exams'),
    ('lesson_progress'),
    ('lessons'),
    ('profiles'),
    ('questions')
)
select relation_name,
       pg_catalog.to_regclass('public.' || relation_name) is not null as exists_on_target
from legacy_relations
order by relation_name;

select namespace.nspname as schema_name,
       relation.relname as table_name,
       attribute.attnum as ordinal_position,
       attribute.attname as column_name,
       pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as data_type,
       not attribute.attnotnull as is_nullable,
       pg_catalog.pg_get_expr(column_default.adbin, column_default.adrelid) as column_default,
       attribute.attidentity as identity_kind,
       attribute.attgenerated as generated_kind
from pg_catalog.pg_attribute attribute
join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
left join pg_catalog.pg_attrdef column_default
  on column_default.adrelid = attribute.attrelid
 and column_default.adnum = attribute.attnum
where namespace.nspname = 'public'
  and relation.relkind in ('r', 'p')
  and attribute.attnum > 0
  and not attribute.attisdropped
order by relation.relname, attribute.attnum;

select namespace.nspname as schema_name,
       relation.relname as table_name,
       constraint_record.conname as constraint_name,
       constraint_record.contype as constraint_type,
       pg_catalog.pg_get_constraintdef(constraint_record.oid, true) as definition
from pg_catalog.pg_constraint constraint_record
join pg_catalog.pg_class relation on relation.oid = constraint_record.conrelid
join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
order by relation.relname, constraint_record.contype, constraint_record.conname;

select schemaname as schema_name,
       tablename as table_name,
       indexname as index_name,
       indexdef as definition
from pg_catalog.pg_indexes
where schemaname = 'public'
order by tablename, indexname;

select schemaname as schema_name,
       tablename as table_name,
       policyname as policy_name,
       permissive,
       roles,
       cmd,
       qual,
       with_check
from pg_catalog.pg_policies
where schemaname = 'public'
order by tablename, policyname;

select table_schema as schema_name,
       table_name,
       grantee,
       privilege_type,
       is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select namespace.nspname as schema_name,
       procedure.proname as function_name,
       pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments,
       pg_catalog.pg_get_function_result(procedure.oid) as result_type,
       language.lanname as language,
       procedure.provolatile as volatility,
       procedure.prosecdef as security_definer,
       procedure.proconfig as configuration,
       procedure.proacl as acl,
       pg_catalog.has_function_privilege('anon', procedure.oid, 'execute') as anon_execute,
       pg_catalog.has_function_privilege('authenticated', procedure.oid, 'execute') as authenticated_execute,
       pg_catalog.has_function_privilege('service_role', procedure.oid, 'execute') as service_role_execute,
       pg_catalog.pg_get_functiondef(procedure.oid) as definition
from pg_catalog.pg_proc procedure
join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
join pg_catalog.pg_language language on language.oid = procedure.prolang
where namespace.nspname in ('public', 'private')
  and procedure.prokind in ('f', 'p')
order by namespace.nspname, procedure.proname,
         pg_catalog.pg_get_function_identity_arguments(procedure.oid);

select namespace.nspname as schema_name,
       relation.relname as relation_name,
       trigger_record.tgname as trigger_name,
       trigger_record.tgenabled as enabled_mode,
       pg_catalog.pg_get_triggerdef(trigger_record.oid, true) as definition
from pg_catalog.pg_trigger trigger_record
join pg_catalog.pg_class relation on relation.oid = trigger_record.tgrelid
join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname in ('public', 'auth')
  and not trigger_record.tgisinternal
order by namespace.nspname, relation.relname, trigger_record.tgname;

select namespace.nspname as schema_name,
       type_record.typname as type_name,
       enum_record.enumsortorder as sort_order,
       enum_record.enumlabel as enum_label
from pg_catalog.pg_type type_record
join pg_catalog.pg_namespace namespace on namespace.oid = type_record.typnamespace
join pg_catalog.pg_enum enum_record on enum_record.enumtypid = type_record.oid
where namespace.nspname = 'public'
order by type_record.typname, enum_record.enumsortorder;
