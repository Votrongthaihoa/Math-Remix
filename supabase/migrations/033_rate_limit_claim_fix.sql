-- Forward-fix for Supabase's current JWT claim propagation.
-- Migration 021 checked the legacy request.jwt.claim.role setting. Current
-- PostgREST requests expose the role in request.jwt.claims, so the service RPC
-- must accept that documented claim source while retaining the legacy fallback.

create or replace function public.consume_request_budget(
  target_scope text,
  target_subject_hash text,
  target_capacity integer default 10,
  target_refill_seconds integer default 5,
  target_cost integer default 1
)
returns table(
  allowed boolean,
  retry_after_seconds integer,
  denials_last_minute integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_at timestamptz := clock_timestamp();
  rate_row public.request_rate_limits%rowtype;
  available_tokens numeric := 0;
  next_denial_count integer := 0;
  next_denial_window timestamptz;
  retry_seconds integer := 1;
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    ''
  );
begin
  if request_role <> 'service_role' then
    return query select false, 60, 0;
    return;
  end if;
  if length(coalesce(target_scope, '')) < 1
    or length(coalesce(target_scope, '')) > 64
    or length(coalesce(target_subject_hash, '')) < 32
    or length(coalesce(target_subject_hash, '')) > 128
    or target_capacity < 1 or target_capacity > 1000
    or target_refill_seconds < 1 or target_refill_seconds > 3600
    or target_cost < 1 or target_cost > target_capacity then
    return query select false, 60, 0;
    return;
  end if;

  insert into public.request_rate_limits(scope, subject_hash, tokens, last_refill_at, updated_at)
  values(target_scope, target_subject_hash, target_capacity, checked_at, checked_at)
  on conflict (scope, subject_hash) do nothing;

  select * into rate_row
  from public.request_rate_limits rate_limit
  where rate_limit.scope = target_scope
    and rate_limit.subject_hash = target_subject_hash
  for update;

  if not found then
    return query select false, 60, 0;
    return;
  end if;

  if rate_row.blocked_until is not null and rate_row.blocked_until > checked_at then
    retry_seconds := greatest(1, ceil(extract(epoch from rate_row.blocked_until - checked_at))::integer);
    return query select false, retry_seconds, rate_row.denial_count;
    return;
  end if;

  available_tokens := least(
    target_capacity::numeric,
    rate_row.tokens + greatest(0::numeric, extract(epoch from checked_at - rate_row.last_refill_at)::numeric) / target_refill_seconds
  );

  if available_tokens >= target_cost then
    update public.request_rate_limits
      set tokens = available_tokens - target_cost,
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
      where scope = target_scope and subject_hash = target_subject_hash;
    return query select true, 0, 0;
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
  retry_seconds := greatest(1, ceil((target_cost - available_tokens) * target_refill_seconds)::integer);

  update public.request_rate_limits
    set tokens = available_tokens,
        last_refill_at = checked_at,
        denial_window_started_at = next_denial_window,
        denial_count = next_denial_count,
        blocked_until = case when next_denial_count >= 10 then checked_at + interval '30 seconds' else null end,
        updated_at = checked_at
    where scope = target_scope and subject_hash = target_subject_hash;

  return query select false, case when next_denial_count >= 10 then 30 else retry_seconds end, next_denial_count;
end;
$$;

revoke all on function public.consume_request_budget(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_request_budget(text, text, integer, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
