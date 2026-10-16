-- The client intake (PAR-Q) around the existing tables (PRD wave-1 §2.4 INTK-2, INTK-5; screens.md §3.1 "Анкета
-- клиента", §2.2 "↳ Анкета"; decisions Q38). intakes, data_shares.intake and its consent guard already exist
-- (20261015120300_pairs_tables.sql, 20261015123200_pairs_policies.sql): the client writes versions, a trainer
-- reads them only in a live pair with share:intake. This adds the two messages around it:
--   * Т: "the client filled in the intake", to each trainer the intake is shown to, on the first version only;
--   * К: "Напомнить" from the trainer's intake screen while the client has not filled it in.

-- INTK-5: the first version only, and only to trainers of live pairs that already see the intake. A trainer the
-- client allows later is not told: the pair card shows the intake from then on.
create function private.intake_notify_trainers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.profiles;
  v_pair record;
begin
  -- Rows of one statement see each other here, so the earliest (then the smallest id) counts as the first.
  if exists (
    select 1 from public.intakes i
    where i.user_id = new.user_id and i.id <> new.id and (i.submitted_at, i.id) < (new.submitted_at, new.id)
  ) then
    return null;
  end if;
  select p.* into v_client from public.profiles p where p.id = new.user_id;
  for v_pair in
    select c.id, c.trainer_id
    from public.coachings c
    join public.data_shares d on d.coaching_id = c.id
    where c.client_id = new.user_id and c.status <> 'ended' and d.intake
  loop
    perform private.enqueue_notification(
      'intake_submitted', pg_catalog.format('intake_submitted:%s', v_pair.id),
      pg_catalog.jsonb_build_object('coaching_id', v_pair.id, 'first_name', v_client.first_name,
                                    'last_name', v_client.last_name, 'parq_flagged', new.parq_flagged),
      v_pair.trainer_id);
  end loop;
  return null;
end $$;

comment on function private.intake_notify_trainers() is
  'After the first intake version of a client, queues intake_submitted to each trainer of a live pair with share:intake.';
revoke all on function private.intake_notify_trainers() from public;

create trigger intakes_notify_trainers
  after insert on public.intakes
  for each row execute function private.intake_notify_trainers();

-- "Напомнить" on /trainer/clients/<id>/intake (screens.md §2.2): the trainer of a live pair asks the client to
-- fill in the intake. Only while the client has none and shows it to this trainer: a hidden intake has no
-- request button (Q38), so a reminder cannot reveal whether it exists. At most one reminder per pair a day.
-- Returns false when today's reminder was already sent.
create function public.remind_intake(p_coaching_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair public.coachings;
  v_trainer public.profiles;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.* into v_pair from public.coachings c where c.id = p_coaching_id and c.trainer_id = v_user;
  if v_pair.id is null or v_pair.status = 'ended' then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.data_shares d where d.coaching_id = v_pair.id and d.intake) then
    raise exception 'intake_hidden' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.intakes i where i.user_id = v_pair.client_id) then
    raise exception 'intake_filled' using errcode = 'P0001';
  end if;

  select p.* into v_trainer from public.profiles p where p.id = v_user;
  return private.enqueue_notification(
    'intake_reminder',
    pg_catalog.format('intake_reminder:%s:%s', v_pair.id, pg_catalog.to_char(pg_catalog.now() at time zone 'UTC', 'YYYY-MM-DD')),
    pg_catalog.jsonb_build_object('coaching_id', v_pair.id, 'first_name', v_trainer.first_name,
                                  'last_name', v_trainer.last_name),
    v_pair.client_id) is not null;
end $$;

comment on function public.remind_intake(uuid) is
  'Trainer of a live pair asks the client to fill in the intake (intake_reminder), once a day per pair. Raises '
  'not_found, intake_hidden (not shown to this trainer) or intake_filled. False when today''s was already sent.';
revoke all on function public.remind_intake(uuid) from public, anon;
grant execute on function public.remind_intake(uuid) to authenticated;
