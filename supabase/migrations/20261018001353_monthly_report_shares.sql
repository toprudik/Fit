-- Forwarding a monthly report to the trainer (PRD wave-3 §4 rule 3): the report stays private, and the client may
-- send it to the trainer of a live pair.
--
-- * The client sends a copy of the report as it is at that moment. The trainer reads only that copy, through a
--   definer function, and only while the pair is live.
-- * Each trainer sees their own pair (§4-3): the copy keeps the sessions with this trainer only, and leaves out
--   homework, which the report counts over all pairs.
-- * One copy per pair and month. Sending again refreshes it without a second message to the trainer.
-- * The copy goes with the client's profile when the account is deleted (client_id cascades).

alter type public.notification_type add value 'monthly_report_shared';

create table public.monthly_report_shares (
  coaching_id uuid not null references public.coachings (id) on delete cascade,
  month       date not null check (extract(day from month) = 1),
  client_id   uuid not null references public.profiles (id) on delete cascade,
  report      jsonb not null,
  shared_at   timestamptz not null default now(),
  primary key (coaching_id, month)
);

comment on table public.monthly_report_shares is
  'A monthly report the client sent to the trainer of a pair (wave-3 §4 rule 3): a copy without the other pairs. '
  'Read through public.shared_monthly_report().';

create index monthly_report_shares_client_id_idx on public.monthly_report_shares (client_id);

alter table public.monthly_report_shares enable row level security;
revoke all on table public.monthly_report_shares from anon, authenticated;

create policy "monthly_report_shares: client reads own"
  on public.monthly_report_shares for select
  to authenticated
  using (client_id = (select auth.uid()));

grant select on table public.monthly_report_shares to authenticated;

-- The caller's live pairs for "Отправить тренеру" under a finished month's report: the trainer's name and when this
-- month was sent to them, or null. An empty array when the month has no report.
create function public.my_monthly_report_shares(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if public.my_monthly_report(p_month) is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'coaching_id', c.id,
             'name', coalesce(nullif(pg_catalog.btrim(p.display_name), ''), nullif(pg_catalog.concat_ws(' ', p.first_name, p.last_name), '')),
             'shared_at', s.shared_at)
           order by c.started_at)
    from public.coachings c
    join public.profiles p on p.id = c.trainer_id
    left join public.monthly_report_shares s on s.coaching_id = c.id and s.month = p_month
    where c.client_id = v_user and c.status in ('trial', 'active')), '[]'::jsonb);
end $$;

comment on function public.my_monthly_report_shares(date) is
  'The caller''s live pairs with the trainer''s name and when the month''s report was sent to them (wave-3 §4 rule 3).';
revoke all on function public.my_monthly_report_shares(date) from public, anon;
grant execute on function public.my_monthly_report_shares(date) to authenticated;

-- Sends the caller's report of a finished month to the trainer of p_coaching, a live pair of the caller. The first
-- send of a month queues a message to the trainer; a later one only refreshes the copy.
create function public.share_monthly_report(p_month date, p_coaching uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_trainer uuid;
  v_report  jsonb;
  v_own     jsonb;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select c.trainer_id into v_trainer
  from public.coachings c
  where c.id = p_coaching and c.client_id = v_user and c.status in ('trial', 'active');
  if v_trainer is null then
    raise exception 'pair_not_found' using errcode = 'P0001';
  end if;
  v_report := public.my_monthly_report(p_month);
  if v_report is null then
    raise exception 'no_report' using errcode = 'P0001';
  end if;

  select t into v_own
  from pg_catalog.jsonb_array_elements(v_report #> '{sessions,trainers}') as x(t)
  where t->>'coaching_id' = p_coaching::text;
  v_report := v_report - 'sessions' - 'homework';
  if v_own is not null then
    v_report := v_report || pg_catalog.jsonb_build_object(
      'sessions', pg_catalog.jsonb_build_object('total', v_own->'count', 'trainers', pg_catalog.jsonb_build_array(v_own)));
  end if;

  insert into public.monthly_report_shares (coaching_id, month, client_id, report)
  values (p_coaching, p_month, v_user, v_report)
  on conflict (coaching_id, month) do update set report = excluded.report, shared_at = pg_catalog.now();

  perform private.enqueue_notification(
    'monthly_report_shared', 'monthly_report_shared:' || p_coaching || ':' || p_month,
    pg_catalog.jsonb_build_object('coaching_id', p_coaching, 'month', p_month, 'name', private.trainer_client_label(p_coaching)),
    v_trainer);
end $$;

comment on function public.share_monthly_report(date, uuid) is
  'Sends the caller''s finished month to the trainer of a live pair (wave-3 §4 rule 3): a copy without the other '
  'pairs; the first send of the month messages the trainer.';
revoke all on function public.share_monthly_report(date, uuid) from public, anon;
grant execute on function public.share_monthly_report(date, uuid) to authenticated;

-- The report a client sent to this pair's trainer for the month: { report, shared_at }, or null. The owner trainer
-- or a delegate with the progress scope, while the pair is live.
create function public.shared_monthly_report(p_coaching uuid, p_month date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('report', s.report, 'shared_at', s.shared_at)
  from public.monthly_report_shares s
  where s.coaching_id = p_coaching and s.month = p_month
    and private.is_coaching_trainer(p_coaching, 'progress') and private.is_live_coaching(p_coaching)
$$;

comment on function public.shared_monthly_report(uuid, date) is
  'The monthly report the client sent to this pair''s trainer (wave-3 §4 rule 3), while the pair is live.';
revoke all on function public.shared_monthly_report(uuid, date) from public, anon;
grant execute on function public.shared_monthly_report(uuid, date) to authenticated;
