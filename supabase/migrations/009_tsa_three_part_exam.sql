-- TSA is one exam made of three ordered parts, not three separate exams.
-- This migration normalizes the reference seed created by 008_seed_tsa_response_exam.sql.

update public.exam_sections
set exam_id = '10000000-0000-4000-8000-000000000001',
    title = 'Tư duy Đọc hiểu',
    duration_minutes = 30,
    sort_order = 1
where id = '20000000-0000-4000-8000-000000000002';

update public.exam_sections
set exam_id = '10000000-0000-4000-8000-000000000001',
    title = 'Tư duy Khoa học',
    duration_minutes = 60,
    sort_order = 2
where id = '20000000-0000-4000-8000-000000000003';

update public.exam_sections
set title = 'Tư duy Toán học',
    duration_minutes = 60,
    sort_order = 0
where id = '20000000-0000-4000-8000-000000000001';

update public.exams
set title = 'Đề TSA tham khảo 01',
    description = 'Một đề TSA gồm ba phần: Tư duy Toán học, Tư duy Đọc hiểu và Tư duy Khoa học.',
    exam_type = 'TSA',
    duration_minutes = 150,
    published = true
where id = '10000000-0000-4000-8000-000000000001';

-- The reference seed uses these IDs for the two extra exams.
delete from public.exams
where id in (
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);
