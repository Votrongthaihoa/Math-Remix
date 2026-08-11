-- Read-only aggregate inventory for legacy-to-HEAD data mapping.
-- This file returns counts and type distributions only. It does not return
-- application row contents and does not modify schema, policies, or data.

select 'auth.users' as relation_name, count(*) as exact_rows from auth.users
union all
select 'public.attempt_details', count(*) from public.attempt_details
union all
select 'public.attempts', count(*) from public.attempts
union all
select 'public.courses', count(*) from public.courses
union all
select 'public.documents', count(*) from public.documents
union all
select 'public.exam_sections', count(*) from public.exam_sections
union all
select 'public.exams', count(*) from public.exams
union all
select 'public.lesson_progress', count(*) from public.lesson_progress
union all
select 'public.lessons', count(*) from public.lessons
union all
select 'public.profiles', count(*) from public.profiles
union all
select 'public.questions', count(*) from public.questions
order by relation_name;

select profiles.role::text as role,
       count(*) as profile_count,
       count(*) filter (where profiles.full_name is null or pg_catalog.btrim(profiles.full_name) = '') as blank_full_name_count
from public.profiles profiles
group by profiles.role
order by profiles.role::text;

select questions.type as legacy_question_type,
       pg_catalog.jsonb_typeof(questions.options) as options_json_type,
       pg_catalog.jsonb_typeof(questions.correct_answer_json) as answer_json_type,
       count(*) as question_count,
       count(*) filter (where questions.section_id is null) as null_section_count
from public.questions questions
group by questions.type,
         pg_catalog.jsonb_typeof(questions.options),
         pg_catalog.jsonb_typeof(questions.correct_answer_json)
order by questions.type, options_json_type, answer_json_type;

select attempts.is_submitted,
       count(*) as attempt_count,
       count(*) filter (where attempts.exam_id is null) as null_exam_count,
       count(*) filter (where attempts.completed_at is null) as null_completed_at_count,
       min(attempts.started_at) as earliest_started_at,
       max(attempts.started_at) as latest_started_at
from public.attempts attempts
group by attempts.is_submitted
order by attempts.is_submitted;

select 'courses.description null' as condition_name,
       count(*) filter (where courses.description is null) as affected_rows
from public.courses courses
union all
select 'courses.is_published null',
       count(*) filter (where courses.is_published is null)
from public.courses courses
union all
select 'documents.lesson_id null',
       count(*) filter (where documents.lesson_id is null)
from public.documents documents
union all
select 'exam_sections.exam_id null',
       count(*) filter (where exam_sections.exam_id is null)
from public.exam_sections exam_sections
union all
select 'exams.description null',
       count(*) filter (where exams.description is null)
from public.exams exams
union all
select 'exams.is_published null',
       count(*) filter (where exams.is_published is null)
from public.exams exams
union all
select 'lesson_progress.lesson_id null',
       count(*) filter (where lesson_progress.lesson_id is null)
from public.lesson_progress lesson_progress
union all
select 'lesson_progress.user_id null',
       count(*) filter (where lesson_progress.user_id is null)
from public.lesson_progress lesson_progress
union all
select 'lessons.course_id null',
       count(*) filter (where lessons.course_id is null)
from public.lessons lessons
union all
select 'attempt_details.attempt_id null',
       count(*) filter (where attempt_details.attempt_id is null)
from public.attempt_details attempt_details
union all
select 'attempt_details.question_id null',
       count(*) filter (where attempt_details.question_id is null)
from public.attempt_details attempt_details
union all
select 'attempt_details.selected_answer_json null',
       count(*) filter (where attempt_details.selected_answer_json is null)
from public.attempt_details attempt_details
order by condition_name;

select 'auth users without profiles' as orphan_check,
       count(*) as orphan_count
from auth.users auth_user
left join public.profiles profiles on profiles.id = auth_user.id
where profiles.id is null
union all
select 'profiles without auth users',
       count(*)
from public.profiles profiles
left join auth.users auth_user on auth_user.id = profiles.id
where auth_user.id is null
union all
select 'attempts users without auth users',
       count(*)
from public.attempts attempts
left join auth.users auth_user on auth_user.id = attempts.user_id
where auth_user.id is null
union all
select 'attempts users without profiles',
       count(*)
from public.attempts attempts
left join public.profiles profiles on profiles.id = attempts.user_id
where profiles.id is null
union all
select 'attempt details without attempts',
       count(*)
from public.attempt_details attempt_details
left join public.attempts attempts on attempts.id = attempt_details.attempt_id
where attempt_details.attempt_id is not null
  and attempts.id is null
union all
select 'attempt details without questions',
       count(*)
from public.attempt_details attempt_details
left join public.questions questions on questions.id = attempt_details.question_id
where attempt_details.question_id is not null
  and questions.id is null
order by orphan_check;
