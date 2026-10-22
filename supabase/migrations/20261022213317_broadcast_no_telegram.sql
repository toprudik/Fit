-- QA 22.10: a broadcast to a group with a client who has no Telegram said «ждут конца тихих часов: 1», as if the
-- message would arrive later. It never would.
--
-- send_broadcast writes such a member's row as skipped ('no_telegram') right away, like a muted one, instead of
-- queueing it until quiet hours end.
create or replace function public.send_broadcast(p_group_id uuid, p_body text, p_button_kind text default null, p_button_url text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trainer uuid := private.assert_trainer_feature('trainer.broadcasts');
  v_group public.groups := private.own_group(p_group_id);
  v_body text := pg_catalog.btrim(p_body);
  v_tz text;
  v_day_start timestamptz;
  v_name text;
  v_id uuid;
  v_outbox bigint;
  r record;
begin
  if v_body is null or pg_catalog.char_length(v_body) not between 1 and 2000
     or (p_button_kind is not null and p_button_kind not in ('deep_link', 'url'))
     or ((p_button_kind = 'url') <> (p_button_url is not null and p_button_url ~ '^https://[^\s]+$'
                                     and pg_catalog.char_length(p_button_url) <= 500))
     or (p_button_kind is distinct from 'url' and p_button_url is not null) then
    raise exception 'invalid_broadcast' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('broadcasts:' || v_trainer::text, 0));
  select p.time_zone,
         coalesce(nullif(pg_catalog.btrim(p.display_name), ''), pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)))
  into v_tz, v_name
  from public.profiles p where p.id = v_trainer;
  v_day_start := ((pg_catalog.now() at time zone coalesce(v_tz, 'UTC'))::date)::timestamp at time zone coalesce(v_tz, 'UTC');
  if (select pg_catalog.count(*) from public.broadcasts b where b.trainer_id = v_trainer and b.created_at >= v_day_start) >= 5 then
    raise exception 'broadcast_limit' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.group_members m join public.coachings c on c.id = m.coaching_id
                 where m.group_id = v_group.id and c.status in ('trial', 'active')) then
    raise exception 'group_empty' using errcode = 'P0001';
  end if;

  insert into public.broadcasts (trainer_id, group_id, body, button_kind, button_url, created_by)
  values (v_trainer, v_group.id, v_body, p_button_kind, p_button_url, v_trainer)
  returning id into v_id;

  for r in
    select c.id, c.client_id, c.broadcasts_muted, p.telegram_id
    from public.group_members m join public.coachings c on c.id = m.coaching_id
    join public.profiles p on p.id = c.client_id
    where m.group_id = v_group.id and c.status in ('trial', 'active')
  loop
    if r.broadcasts_muted or r.telegram_id is null then
      insert into public.notification_outbox
        (user_id, type, dedupe_key, payload, scheduled_for, deliver_after, status, last_error, broadcast_id)
      values (r.client_id, 'trainer_broadcast', 'broadcast:' || v_id::text || ':' || r.client_id::text, '{}',
              pg_catalog.now(), pg_catalog.now(), 'skipped',
              case when r.broadcasts_muted then 'muted' else 'no_telegram' end, v_id);
    else
      v_outbox := private.enqueue_notification(
        'trainer_broadcast',
        'broadcast:' || v_id::text || ':' || r.client_id::text,
        pg_catalog.jsonb_build_object('broadcast_id', v_id, 'coaching_id', r.id, 'trainer_name', v_name,
          'body', v_body, 'button_kind', p_button_kind, 'button_url', p_button_url),
        r.client_id);
      update public.notification_outbox o set broadcast_id = v_id where o.id = v_outbox;
    end if;
  end loop;
  return v_id;
end $$;
-- broadcast_history now also returns no_telegram: members without Telegram (a client the trainer keeps without a
-- DaFit account), counted apart from deferred and undelivered. Older rows of such clients may still be pending
-- until the dispatcher skips them, so pending rows of a member without Telegram count here too.
drop function public.broadcast_history(uuid);
create function public.broadcast_history(p_group_id uuid)
returns table (
  id uuid, created_at timestamptz, body text, button_kind text, button_url text,
  recipients integer, sent integer, deferred integer, undelivered integer, muted integer, no_telegram integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.created_at, b.body, b.button_kind, b.button_url,
    pg_catalog.count(o.id)::integer,
    (pg_catalog.count(o.id) filter (where o.status = 'sent'))::integer,
    (pg_catalog.count(o.id) filter (where o.status in ('pending', 'processing') and p.telegram_id is not null))::integer,
    (pg_catalog.count(o.id) filter (where o.status in ('failed', 'cancelled')
       or (o.status = 'skipped' and coalesce(o.last_error, '') not in ('muted', 'disabled', 'no_telegram'))))::integer,
    (pg_catalog.count(o.id) filter (where o.status = 'skipped' and o.last_error in ('muted', 'disabled')))::integer,
    (pg_catalog.count(o.id) filter (where (o.status = 'skipped' and o.last_error = 'no_telegram')
       or (o.status in ('pending', 'processing') and p.telegram_id is null)))::integer
  from public.broadcasts b
  left join public.notification_outbox o on o.broadcast_id = b.id
  left join public.profiles p on p.id = o.user_id
  where b.group_id = (select g.id from public.groups g where g.id = p_group_id and g.trainer_id = auth.uid())
    and b.deleted_at is null
  group by b.id
  order by b.created_at desc
$$;
comment on function public.broadcast_history(uuid) is
  'The trainer''s broadcasts of a group with delivery stats, members without Telegram apart (wave-2 §6.9).';
revoke all on function public.broadcast_history(uuid) from public, anon;
grant execute on function public.broadcast_history(uuid) to authenticated;
