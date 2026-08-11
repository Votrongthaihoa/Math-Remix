-- Sensitive exam content is served only by trusted server routes. Students
-- receive safe exam/section metadata from /api/exams and cannot bypass that
-- projection to dump authoring source or question rows with the public client.
drop policy if exists "exam sections student read" on public.exam_sections;
drop policy if exists "exam questions student read" on public.exam_questions;

create table if not exists public.exam_content_grants (
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  section_id uuid not null references public.exam_sections(id) on delete cascade,
  content_ref text not null,
  first_granted_at timestamptz not null default now(),
  last_granted_at timestamptz not null default now(),
  primary key (attempt_id, section_id, content_ref)
);

create table if not exists public.exam_content_rate_limits (
  attempt_id uuid primary key references public.exam_attempts(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  tokens numeric not null default 8,
  last_refill_at timestamptz not null default now(),
  denial_window_started_at timestamptz,
  denial_count integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists exam_content_grants_student_date_idx
  on public.exam_content_grants(student_id, last_granted_at desc);

alter table public.exam_content_grants enable row level security;
alter table public.exam_content_rate_limits enable row level security;

drop policy if exists "admin exam content grants" on public.exam_content_grants;
create policy "admin exam content grants" on public.exam_content_grants
  for select using (public.is_admin());

drop policy if exists "admin exam content rate limits" on public.exam_content_rate_limits;
create policy "admin exam content rate limits" on public.exam_content_rate_limits
  for select using (public.is_admin());

create or replace function public.consume_exam_content_budget(
  target_attempt_id uuid,
  target_student_id uuid,
  target_section_id uuid,
  target_content_ref text
)
returns table(
  allowed boolean,
  retry_after_seconds integer,
  already_granted boolean,
  denials_last_minute integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_at timestamptz := clock_timestamp();
  rate_row public.exam_content_rate_limits%rowtype;
  was_granted boolean := false;
  available_tokens numeric := 0;
  next_denial_count integer := 0;
  next_denial_window timestamptz;
  retry_seconds integer := 1;
begin
  if length(target_content_ref) < 1 or length(target_content_ref) > 80 then
    return query select false, 0, false, 0;
    return;
  end if;

  if not exists (
    select 1 from public.exam_attempts attempt
    where attempt.id = target_attempt_id
      and attempt.student_id = target_student_id
      and attempt.status = 'in_progress'
  ) then
    return query select false, 0, false, 0;
    return;
  end if;

  insert into public.exam_content_rate_limits(attempt_id, student_id, tokens, last_refill_at, updated_at)
  values(target_attempt_id, target_student_id, 8, checked_at, checked_at)
  on conflict (attempt_id) do nothing;

  select * into rate_row
  from public.exam_content_rate_limits rate_limit
  where rate_limit.attempt_id = target_attempt_id
    and rate_limit.student_id = target_student_id
  for update;

  if not found then
    return query select false, 0, false, 0;
    return;
  end if;

  select exists (
    select 1 from public.exam_content_grants grant_row
    where grant_row.attempt_id = target_attempt_id
      and grant_row.student_id = target_student_id
      and grant_row.section_id = target_section_id
      and grant_row.content_ref = target_content_ref
  ) into was_granted;

  if was_granted then
    update public.exam_content_grants
      set last_granted_at = checked_at
      where attempt_id = target_attempt_id
        and section_id = target_section_id
        and content_ref = target_content_ref;
    return query select true, 0, true, rate_row.denial_count;
    return;
  end if;

  if rate_row.blocked_until is not null and rate_row.blocked_until > checked_at then
    retry_seconds := greatest(1, ceil(extract(epoch from rate_row.blocked_until - checked_at))::integer);
    return query select false, retry_seconds, false, rate_row.denial_count;
    return;
  end if;

  available_tokens := least(
    8::numeric,
    rate_row.tokens + greatest(0::numeric, extract(epoch from checked_at - rate_row.last_refill_at)::numeric) / 3
  );

  if available_tokens >= 1 then
    update public.exam_content_rate_limits
      set tokens = available_tokens - 1,
          last_refill_at = checked_at,
          blocked_until = null,
          denial_window_started_at = case
            when denial_window_started_at is not null and denial_window_started_at < checked_at - interval '60 seconds' then null
            else denial_window_started_at
          end,
          denial_count = case
            when denial_window_started_at is not null and denial_window_started_at < checked_at - interval '60 seconds' then 0
            else denial_count
          end,
          updated_at = checked_at
      where attempt_id = target_attempt_id;

    insert into public.exam_content_grants(attempt_id, student_id, section_id, content_ref, first_granted_at, last_granted_at)
    values(target_attempt_id, target_student_id, target_section_id, target_content_ref, checked_at, checked_at)
    on conflict (attempt_id, section_id, content_ref)
      do update set last_granted_at = excluded.last_granted_at;

    return query select true, 0, false, 0;
    return;
  end if;

  next_denial_window := case
    when rate_row.denial_window_started_at is null or rate_row.denial_window_started_at < checked_at - interval '60 seconds' then checked_at
    else rate_row.denial_window_started_at
  end;
  next_denial_count := case
    when rate_row.denial_window_started_at is null or rate_row.denial_window_started_at < checked_at - interval '60 seconds' then 1
    else rate_row.denial_count + 1
  end;
  retry_seconds := greatest(1, ceil((1 - available_tokens) * 3)::integer);

  update public.exam_content_rate_limits
    set tokens = available_tokens,
        last_refill_at = checked_at,
        denial_window_started_at = next_denial_window,
        denial_count = next_denial_count,
        blocked_until = case when next_denial_count >= 5 then checked_at + interval '15 seconds' else null end,
        updated_at = checked_at
    where attempt_id = target_attempt_id;

  if next_denial_count = 5 then
    insert into public.security_events(user_id, event_type, risk_score, reason, evidence)
    values(
      target_student_id,
      'warning',
      35,
      'Phát hiện yêu cầu tải nội dung đề thi với tốc độ bất thường.',
      jsonb_build_object(
        'signal', 'suspected_exam_scraping',
        'attemptId', target_attempt_id,
        'sectionId', target_section_id,
        'denialsIn60Seconds', next_denial_count
      )
    );
  end if;

  return query select false, case when next_denial_count >= 5 then 15 else retry_seconds end, false, next_denial_count;
end;
$$;

revoke all on function public.consume_exam_content_budget(uuid,uuid,uuid,text) from public;
grant execute on function public.consume_exam_content_budget(uuid,uuid,uuid,text) to service_role;

notify pgrst, 'reload schema';
