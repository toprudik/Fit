-- Health data erasure after the consent is withdrawn (legal право 5; consent-health-data.md 8.3; 152-FZ art. 10
-- part 4, art. 21 part 5). Withdrawing pd_health in the settings schedules the erasure 30 days ahead; giving the
-- consent again before then cancels it. The privacy route removes the progress photo files, then
-- purge_health_data deletes the rows. Sessions, bookings, passes and payments are not health data and stay.

create table public.health_erasures (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  revoked_at   timestamptz not null default pg_catalog.now(),
  scheduled_for timestamptz not null default pg_catalog.now() + interval '30 days',
  done_at      timestamptz,
  constraint health_erasures_order_check check (scheduled_for >= revoked_at and (done_at is null or done_at >= revoked_at))
);

comment on table public.health_erasures is
  'The pending or done erasure of a user''s health data after they withdrew the pd_health consent (право 5).';

create index health_erasures_due_idx on public.health_erasures (scheduled_for) where done_at is null;

alter table public.health_erasures enable row level security;
revoke all on table public.health_erasures from anon, authenticated;
grant select on table public.health_erasures to authenticated;

create policy "health_erasures: owner reads"
  on public.health_erasures for select
  to authenticated
  using (user_id = (select auth.uid()));

comment on policy "health_erasures: owner reads" on public.health_erasures is
  'A user sees when their health data will be erased; only the consent triggers and the privacy route write.';

-- Withdrawn, with no other pd_health consent in force (8.3): processing stops at once. The trainers lose every
-- category of the user's pairs, and after a new consent the client chooses them again; the iOS Shortcuts token
-- stops taking steps; the user leaves the challenges, whose scores come from health data. The erasure itself is
-- scheduled (again from today if one was done).
create function private.schedule_health_erasure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'pd_health' or old.revoked_at is not null or new.revoked_at is null then
    return null;
  end if;
  if exists (select 1 from public.consents c where c.user_id = new.user_id and c.kind = 'pd_health' and c.revoked_at is null) then
    return null;
  end if;
  update public.data_shares ds
  set nutrition = false, measurements = false, photos = false, steps = false, intake = false, workouts = false,
    intake_decided_at = null
  where ds.coaching_id in (select c.id from public.coachings c where c.client_id = new.user_id);
  delete from public.ingest_tokens t where t.user_id = new.user_id;
  delete from public.challenge_participants cp where cp.user_id = new.user_id;
  insert into public.health_erasures (user_id, revoked_at, scheduled_for, done_at)
  values (new.user_id, new.revoked_at, new.revoked_at + interval '30 days', null)
  on conflict (user_id) do update
    set revoked_at = excluded.revoked_at, scheduled_for = excluded.scheduled_for, done_at = null;
  return null;
end $$;

comment on function private.schedule_health_erasure() is
  'After a pd_health consent is revoked: closes the trainers'' access, the steps token and the challenges at once '
  'and schedules the erasure of the user''s health data in 30 days.';
revoke all on function private.schedule_health_erasure() from public;

create trigger consents_schedule_health_erasure
  after update of revoked_at on public.consents
  for each row execute function private.schedule_health_erasure();

-- Given again before the erasure ran: nothing is erased.
create function private.cancel_health_erasure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'pd_health' then
    delete from public.health_erasures e where e.user_id = new.user_id and e.done_at is null;
  end if;
  return null;
end $$;

comment on function private.cancel_health_erasure() is
  'After a pd_health consent is given: cancels an erasure that has not run yet.';
revoke all on function private.cancel_health_erasure() from public;

create trigger consents_cancel_health_erasure
  after insert on public.consents
  for each row execute function private.cancel_health_erasure();

-- purge_health_data: the erasure itself, for a due one only. The route removes the progress photo files first.
-- Returns false when nothing was due.
create function public.purge_health_data(p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.health_erasures e
    where e.user_id = p_user and e.done_at is null and e.scheduled_for <= pg_catalog.now()
  ) then
    return false;
  end if;

  -- 4.1 the questionnaire and goals; 4.2 measurements; 4.3 progress photos.
  delete from public.intakes i where i.user_id = p_user;
  delete from public.client_goals g where g.user_id = p_user;
  delete from public.measurements m where m.client_id = p_user;
  delete from public.progress_photos ph where ph.client_id = p_user;
  -- 4.4 nutrition: the diary, own foods (their dish items cascade; a diary row of someone else keeps its own name and
  -- numbers, food_id is set null) and favourites, the target and what it is computed from, trainer comments.
  delete from public.food_day_comments fc where fc.client_id = p_user;
  delete from public.food_diary_entries fd where fd.client_id = p_user;
  delete from public.food_favorites ff where ff.user_id = p_user;
  delete from public.foods f where f.owner_id = p_user;
  delete from public.nutrition_targets nt where nt.client_id = p_user;
  delete from public.body_profiles bp where bp.user_id = p_user;
  -- 4.5 sleep and steps.
  delete from public.activity_entries a where a.client_id = p_user;
  -- 4.6 workouts and their log (sets and exercises cascade), records, the weekly goal, reports sent to a trainer.
  delete from public.personal_records pr where pr.client_id = p_user;
  delete from public.workout_logs w where w.client_id = p_user;
  delete from public.workout_week_goals wg where wg.client_id = p_user;
  delete from public.monthly_report_shares rs where rs.client_id = p_user;
  -- Story cards drawn from these data; the sessions, trainer and badges cards stay.
  delete from public.story_cards sc
  where sc.user_id = p_user and sc.kind in ('records', 'weight', 'streak_workouts', 'streak_diary', 'streak_steps');

  update public.health_erasures e set done_at = pg_catalog.now() where e.user_id = p_user;
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (null, 'health_data.purge', 'user', p_user, '{}'::jsonb);
  return true;
end $$;

comment on function public.purge_health_data(uuid) is
  'Privacy route: erases the health data of a user whose erasure is due, 30 days after they withdrew pd_health.';
revoke all on function public.purge_health_data(uuid) from public, anon, authenticated;
grant execute on function public.purge_health_data(uuid) to service_role;

-- From 20261017023500_account_privacy.sql, plus a due health data erasure as work.
create or replace function private.dispatch_privacy()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.data_exports e where e.status = 'queued'
                   or (e.status = 'processing' and e.updated_at < pg_catalog.now() - interval '15 minutes')
                   or (e.status = 'ready' and e.expires_at <= pg_catalog.now()))
     and not exists (select 1 from public.account_deletions d where d.cancelled_at is null and d.scheduled_for <= pg_catalog.now())
     and not exists (select 1 from public.health_erasures h where h.done_at is null and h.scheduled_for <= pg_catalog.now())
  then
    return null;
  end if;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'notifications_dispatch_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'notifications_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  return net.http_post(
    url := pg_catalog.regexp_replace(v_url, '/api/cron/notifications$', '/api/cron/privacy'),
    body := '{}'::jsonb,
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000);
end $$;
