-- The monthly report without the health data consent (право 3): when the caller has no pd_health consent in force,
-- public.my_monthly_report leaves out every block built from health data (workouts, records, streaks, measurements,
-- nutrition, steps, sleep) and says so with "health_closed": true. Sending the month to a trainer and the story
-- cards read the report through this function, so they leave them out too. Sessions, badges and homework stay.
-- The rest of the body is the one of 20261017101247_monthly_reports.sql.

create function private.has_health_consent(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.consents c where c.user_id = p_user and c.kind = 'pd_health' and c.revoked_at is null);
$$;

comment on function private.has_health_consent(uuid) is 'Whether the user has a health data consent (pd_health) in force.';
revoke all on function private.has_health_consent(uuid) from public;

create or replace function public.my_monthly_report(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_report jsonb;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_month is null or p_month >= private.user_month(v_user) then
    return null;
  end if;
  v_report := private.monthly_report(v_user, p_month);
  if v_report is not null and not private.has_health_consent(v_user) then
    v_report := v_report - 'workouts' - 'records' - 'streaks' - 'measurements' - 'nutrition' - 'steps' - 'sleep'
      || pg_catalog.jsonb_build_object('health_closed', true);
  end if;
  return v_report;
end $$;

comment on function public.my_monthly_report(date) is
  'The caller''s monthly report of a finished month (wave-3 §4), or null. Only the client reads it (§4-3). Without '
  'the health data consent it has no blocks built from health data, and "health_closed" is true.';
