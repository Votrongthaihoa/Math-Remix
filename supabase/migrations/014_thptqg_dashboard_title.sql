alter table public.exams
  add column if not exists dashboard_title text not null default 'KỲ THI TỐT NGHIỆP THPT 2027';

update public.exams
set dashboard_title = 'KỲ THI TỐT NGHIỆP THPT 2027'
where dashboard_title is null or btrim(dashboard_title) = '';
