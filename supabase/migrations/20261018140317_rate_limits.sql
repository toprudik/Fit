-- Rate limits for the writes that are cheap to repeat and expensive to receive (security review 2026-10-18):
--   * feedback: every row queues a message to the team's Telegram group (feedback_received) and the web files a
--     GitHub issue for it. Any signed-in user can insert rows straight through PostgREST, so the limit lives in
--     the database, where no client can skip it: at most 5 messages in 10 minutes and 20 a day per author.
--   * the web's own endpoints without a per-user table to count (Mini App sign-in, bot action taps) call
--     public.rate_limit_hit with the secret key.
-- Fixed windows aligned with date_bin, one counter row per bucket, subject and window. A refused write rolls its
-- own increment back with the transaction, so refusals don't stretch the wait.

create table private.rate_limits (
  bucket       text        not null check (char_length(bucket) between 1 and 64),
  subject      text        not null check (char_length(subject) between 1 and 128),
  window_start timestamptz not null,
  hits         integer     not null check (hits > 0),
  primary key (bucket, subject, window_start)
);

comment on table private.rate_limits is
  'Hit counters of the rate limits: one row per bucket, subject (a user id or Telegram id) and fixed window.';
revoke all on table private.rate_limits from public;

-- Counts one hit and says whether it is within p_limit hits per p_window. Older windows of the same subject go.
create function private.rate_limit_take(p_bucket text, p_subject text, p_limit integer, p_window interval)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := pg_catalog.date_bin(p_window, pg_catalog.now(), timestamptz '2000-01-01 00:00:00+00');
  v_hits integer;
begin
  if p_bucket is null or p_subject is null or p_limit is null or p_limit < 1
     or p_window is null or p_window < interval '1 second' then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;

  insert into private.rate_limits as r (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, v_start, 1)
  on conflict (bucket, subject, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  delete from private.rate_limits r
  where r.bucket = p_bucket and r.subject = p_subject and r.window_start < v_start;

  return v_hits <= p_limit;
end $$;

comment on function private.rate_limit_take(text, text, integer, interval) is
  'Counts a hit of p_subject in p_bucket and returns true while the current fixed window of p_window has at '
  'most p_limit hits.';
revoke all on function private.rate_limit_take(text, text, integer, interval) from public;

-- The web's entry (service_role only): the same, with the window in seconds.
create function public.rate_limit_hit(p_bucket text, p_subject text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;
  return private.rate_limit_take(p_bucket, p_subject, p_limit, pg_catalog.make_interval(secs => p_window_seconds));
end $$;

comment on function public.rate_limit_hit(text, text, integer, integer) is
  'Server only (secret key): counts a hit of p_subject in p_bucket; true while the current window of '
  'p_window_seconds has at most p_limit hits.';
revoke all on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;

-- Feedback: 5 in 10 minutes and 20 a day per author. Raises rate_limited; the web shows "try later".
create function private.feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Authors are always set by RLS (user_id = auth.uid()); a row without one comes from the server itself.
  if new.user_id is null then
    return new;
  end if;
  if not private.rate_limit_take('feedback:10m', new.user_id::text, 5, interval '10 minutes')
     or not private.rate_limit_take('feedback:day', new.user_id::text, 20, interval '1 day') then
    raise exception 'rate_limited' using errcode = 'P0001', detail = 'too many feedback messages, try later';
  end if;
  return new;
end $$;

comment on function private.feedback_rate_limit() is
  'Trigger: refuses a feedback message past 5 in 10 minutes or 20 a day per author, so nobody floods the team '
  'group and the issue tracker.';
revoke all on function private.feedback_rate_limit() from public;

create trigger feedback_rate_limit
  before insert on public.feedback
  for each row execute function private.feedback_rate_limit();

-- Retention: counters older than two days answer nothing.
select cron.schedule(
  'rate-limits-retention',
  '23 3 * * *',
  $$delete from private.rate_limits where window_start < now() - interval '2 days'$$);
