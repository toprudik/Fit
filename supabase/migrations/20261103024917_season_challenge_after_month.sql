-- The client's season challenge card after its month (QA bug 25, 03.11): an October challenge still showed in
-- «Прогресс» on 3 November to every client, and a November one could not replace it, because my_season_challenge
-- kept a challenge for two weeks after finished_at for everyone and picked the oldest month first. Now:
--   * a challenge whose month is over in the client's time zone counts as finished on the card (the «Челлендж
--     закончился» text, no «Участвовать»), even before the hourly finishing sets its result;
--   * after its month it stays only for a client who joined it, until two weeks after its result is set;
--   * a running or coming challenge always comes first, so the next month's challenge replaces the last one.
-- The rest is the body of 20261021003117_season_challenges.sql.

create or replace function public.my_season_challenge()
returns table (
  id uuid, title text, month date, joined boolean, finished boolean, result text,
  attended integer, missed integer, ahead integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date;
begin
  if v_user is null then
    return;
  end if;
  v_today := private.user_today(v_user);
  return query
  select c.id, c.title, c.month, p.user_id is not null,
         c.finished_at is not null or v_today >= (c.month + interval '1 month')::date, p.result,
         a.attended, a.missed, a.ahead
  from public.season_challenges c
  left join public.season_challenge_participants p on p.challenge_id = c.id and p.user_id = v_user
  cross join lateral private.season_attendance(v_user, c.month) a
  where c.cancelled_at is null
    and (v_today < (c.month + interval '1 month')::date
         or (p.user_id is not null and (c.finished_at is null or c.finished_at > pg_catalog.now() - interval '14 days')))
  order by v_today >= (c.month + interval '1 month')::date, c.month
  limit 1;
end $$;

comment on function public.my_season_challenge() is
  'Client: the season challenge to show: the running or coming one first, else one they joined until two weeks '
  'after its result, with own attendance.';
