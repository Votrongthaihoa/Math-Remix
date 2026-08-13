# Migration manifest

Đây là thứ tự logic của schema hiện tại. Hãy chạy migration một lần trên từng
project Supabase theo đúng thứ tự, sau đó ghi lại trạng thái ở hệ thống quản lý
migration của môi trường đó.

```text
002_exam_attempts.sql
003_course_cover_color.sql
004_resource_download_permission.sql
005_admin_access_hardening.sql
006_exam_room_module.sql
007_account_sharing_security.sql
007_exam_question_formats.sql
008_seed_tsa_response_exam.sql
009_tsa_three_part_exam.sql
010_latex_exam_editor.sql
011_exam_editor_schema_compat.sql
012_thptqg_subject_sections.sql
013_thptqg_schema_compat.sql
014_thptqg_dashboard_title.sql
015_exam_section_source.sql
016_exam_content_protection.sql
017_guest_exam_slots.sql
018_exam_structure_profiles.sql
019_guest_progress_version.sql
020_guest_slot_sections.sql
021_request_rate_limits.sql
022_exam_admin_audit_logs.sql
023_exam_policy_snapshots.sql
024_exam_engine_operations.sql
025_exam_attempt_integrity.sql
026_exam_operations_audit.sql
027_attempt_answer_key_snapshots.sql
028_exam_attempt_least_privilege.sql
029_exam_history_admin_cleanup.sql
030_exam_results_release.sql
031_exam_publish_preflight.sql
032_exam_data_api_hardening.sql
033_rate_limit_claim_fix.sql
034_exam_content_data_api_hardening.sql
035_exam_content_legacy_policy_cleanup.sql
036_legacy_security_definer_acl_hardening.sql
037_exam_dashboard_title_reconciliation.sql
038_student_sequences_server_only.sql
039_private_account_active_helper.sql
040_question_bank.sql
041_private_admin_helper.sql
042_active_account_policy_reconciliation.sql
043_empty_legacy_head_bootstrap.sql
044_exam_catalog_rls_enablement.sql
```

## Lưu ý về tiền tố `007`

Lịch sử repository có hai migration bắt đầu bằng `007`. Đây là hai migration
khác nhau và không được đổi tên nếu một môi trường đã áp dụng chúng. Khi dùng
tool chỉ hỗ trợ số thứ tự duy nhất, chạy `007_account_sharing_security.sql`
trước rồi chạy `007_exam_question_formats.sql`, hoặc đánh dấu cả hai bằng một
manifest riêng của tool đó.

`008_seed_tsa_response_exam.sql` là migration seed lớn; chỉ chạy khi muốn tạo
dữ liệu đề TSA mẫu. Các migration `017` đến `020` là phần thi kíp ngắn hạn,
profile cấu trúc đề, phiên bản autosave và kíp theo từng phần.

## Schema bootstrap

[`supabase/schema.sql`](../schema.sql) là bản bootstrap cho project mới và có
comment chỉ rõ các phần được mirror từ migration. Với project đã có dữ liệu,
ưu tiên migration forward-only; không dùng schema bootstrap để ghi đè schema
đang chạy.

Mọi thay đổi tiếp theo phải dùng số mới sau migration cuối cùng đã phát hành (hiện
đến `039`), kèm
index, constraint và policy cần thiết. Không sửa migration cũ để “đồng bộ” với
code mới.

Sau khi áp dụng `021`, xác minh bằng SQL:

```sql
select to_regprocedure('public.consume_request_budget(text,text,integer,integer,integer)');
select to_regclass('public.request_rate_limits');
```

Sau khi ap dung `022_exam_admin_audit_logs.sql`, xac minh bang SQL:

```sql
select to_regclass('public.exam_admin_audit_logs');
```

Sau khi ap dung `023_exam_policy_snapshots.sql`, xac minh bang SQL:

```sql
select
  to_regclass('public.exam_attempts'),
  to_regclass('public.guest_exam_attempts');
```

Khi cả hai câu trả về khác `null`, có thể đặt `RATE_LIMIT_REQUIRE_DB=1` cho
runtime để endpoint guest fail-closed nếu lớp throttling bị mất.

Sau khi áp dụng `024_exam_engine_operations.sql`, xác minh các bảng vận hành:

```sql
select
  to_regclass('public.exam_attempt_adjustments'),
  to_regclass('public.exam_attempt_grants'),
  to_regclass('public.exam_scoring_versions'),
  to_regclass('public.exam_question_overrides'),
  to_regclass('public.exam_regrade_runs'),
  to_regclass('public.exam_slot_candidates');
select to_regprocedure('public.consume_exam_attempt_grant(uuid,uuid,uuid,text)');

```

Sau khi ap dung `026_exam_operations_audit.sql` va `027_attempt_answer_key_snapshots.sql`, xac minh:

```sql
select to_regclass('public.exam_admin_audit_logs');
select to_regclass('public.exam_attempts'), to_regclass('public.guest_exam_attempts');
```

Migration `027` chi tao snapshot cho attempt moi. Attempt cu co snapshot rong se dung answer key hien tai khi doc lai cho toi khi co quy trinh regrade tuong ung.

Sau khi ap dung `029_exam_history_admin_cleanup.sql`, xac minh quyen xoa lich su chi con
o server route dung service role va vocabulary audit da duoc cap nhat:

```sql
select has_table_privilege('anon', 'public.exam_attempts', 'DELETE') as anon_can_delete,
       has_table_privilege('authenticated', 'public.exam_attempts', 'DELETE') as authenticated_can_delete;
select conname
from pg_constraint
where conrelid = 'public.exam_admin_audit_logs'::regclass
  and conname = 'exam_admin_audit_logs_action_check';
```

Hai cot quyen dau tien phai tra ve `false`. Khong chay `supabase/schema.sql` de thay the
schema cua project da co du lieu; dung dung migration forward-only theo manifest.

Sau khi ap dung `030_exam_results_release.sql`, xac minh:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'exams'
  and column_name = 'results_released_at';
select to_regclass('public.exams_results_released_idx');
```

Sau khi ap dung `031_exam_publish_preflight.sql`, xac minh vocabulary audit co
`publish_exam`; chi server route duoc phep hoan tat chuyen de sang trang thai
published sau preflight.

Sau khi ap dung `032_exam_data_api_hardening.sql`, xac minh learner chi doc duoc
history cua chinh minh; cac bang attempt/slot/operation va rate-limit server-only
khong con grant cho `anon`/`authenticated`.

## Staging forward-fix verification

After `035_exam_content_legacy_policy_cleanup.sql`, verify that the legacy
`active account exam sections` and `active account exam questions` policies are
absent; raw `source_latex`, `latex_source`, and `solution_source` are served
only through server projections.

After `036_legacy_security_definer_acl_hardening.sql`, verify that
`apply_account_violation`, `handle_new_user`, and `next_student_code` are not
executable by `anon` or `authenticated`. Before migration 039, the UUID form
of `is_account_active` was still used by legacy RLS policies; migration 039
replaces that browser-facing dependency with a private no-argument helper.
`is_admin` remains executable by browser roles because legacy `public` RLS
policies use this read-only helper; classify that advisor finding as intentional
until those policies are migrated to authenticated-only admin policies.

After `037_exam_dashboard_title_reconciliation.sql`, verify that
`public.exams.dashboard_title` is `text NOT NULL` with the THPTQG default. The
forward-fix preserves existing non-empty custom titles and only fills missing
or blank values. It reconciles a legacy remote baseline where
`014_thptqg_dashboard_title.sql` was not present in migration history.

After `038_student_sequences_server_only.sql`, verify that
`public.student_sequences` remains RLS-enabled with no browser-role policies,
that `anon` and `authenticated` have no table privileges, and that only
`service_role` can execute `public.next_student_code()`. The table is used only
by the server-owned student-code generator and must not receive a permissive
browser policy merely to silence the advisor.

After `039_private_account_active_helper.sql`, verify that
`private.is_account_active()` has a fixed empty search path and is executable
only by authenticated/service roles, while `public.is_account_active(uuid)` is
service-role-only. Verify all nine active-account restrictive policies use the
private no-argument helper, so authenticated users cannot probe another user's
account status through a public RPC.

After `041_private_admin_helper.sql`, verify that `public.is_admin()` no longer
exists and `private.is_admin()` is `STABLE`, `SECURITY DEFINER`, and fixed to an
empty search path. The `private` schema is not exposed through the Data API;
`anon`, `authenticated`, and `service_role` receive only the schema usage and
function execute privileges required by existing RLS policies. Confirm every
policy previously depending on the public helper now uses
`(select private.is_admin())`, with no remaining dependency on the dropped
function. Migration 041 alters policies in place so their roles, command, and
permissive/restrictive mode remain unchanged. It is convergent when the public
helper is already absent only if public policies already depend on the private
helper; a database missing the expected admin-policy baseline still fails.

Migration `042_active_account_policy_reconciliation.sql` is the forward-only
repair for an environment where the application relations exist but the nine
restrictive `active account %` policies are absent. It recreates the policies
directly with `private.is_admin()` and `private.is_account_active()`; do not
replay migration 039 after migration 041 has removed `public.is_admin()`.
Migration 042 fails before DDL unless the complete migration 041 private-helper
policy baseline and all profile/attempt columns required by the helpers exist.

Migration `043_empty_legacy_head_bootstrap.sql` is a target-specific, atomic
replacement for the audited empty legacy production baseline. It must not be
applied after 042 or to a normal HEAD database. Before any `DROP`, it requires
the exact ten-table legacy fingerprint and verifies that `auth.users` plus all
legacy tables still contain zero rows. It embeds the final bootstrap schema,
then verifies all 36 HEAD relations, both private helpers, removal of
`public.is_admin()`, and exactly nine active-account policies before commit.

Migration `044_exam_catalog_rls_enablement.sql` is a forward-only repair that
enables RLS on `exam_rooms`, `exams`, and `exam_room_enrollments`. Migration
043 and `supabase/schema.sql` remain historical bootstrap inputs and must not
be replayed on an existing project. Verify `pg_class.relrowsecurity` for all
three tables before and after applying 044; production application requires a
separate approved migration gate.
