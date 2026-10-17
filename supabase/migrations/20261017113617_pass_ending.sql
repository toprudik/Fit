-- "Абонемент заканчивается" (PRD wave-1 §2.9-9, К10 to the client, Т6 to the trainer): when the available balance
-- of a pass drops to 1 or its expiry, freezes counted, is 7 days away, whichever comes first. Once per pass for
-- each condition; both recipients may turn the type off. pg_cron looks every 15 minutes.

create function private.queue_pass_ending(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
  v_base jsonb;
begin
  for r in
    select b.pass_id, b.coaching_id, b.trainer_id, b.client_id, b.title, b.available, b.effective_expires_at,
           c.condition, cl.telegram_id is not null as client_has_chat
    from public.pass_balances b
    join public.coachings co on co.id = b.coaching_id and co.status <> 'ended'
    join public.profiles cl on cl.id = b.client_id
    -- A one-session pass would be "ending" from the start.
    cross join lateral (values
      ('low'::text, b.sessions_total > 1 and b.available <= 1),
      ('expiry', b.effective_expires_at is not null and b.effective_expires_at <= p_now + interval '7 days')
    ) c(condition, due)
    where b.status = 'active' and c.due
  loop
    v_base := pg_catalog.jsonb_build_object(
      'pass_id', r.pass_id, 'coaching_id', r.coaching_id, 'title', r.title, 'condition', r.condition,
      'available', r.available, 'expires_at', r.effective_expires_at);
    -- A client card without an account gets nothing; its trainer still does.
    if r.client_has_chat and private.enqueue_notification('pass_ending', 'pass_ending:' || r.pass_id || ':' || r.condition,
         v_base || private.person_name(r.trainer_id)
           || pg_catalog.jsonb_build_object(
                'username', (select p.username from public.profiles p where p.id = r.trainer_id),
                'payment_url', (select l.url from public.payment_links l
                                where l.trainer_id = r.trainer_id and l.archived_at is null
                                order by l.sort_order, l.created_at limit 1)),
         r.client_id, null, p_now) is not null then
      v_count := v_count + 1;
    end if;
    if private.enqueue_notification('client_pass_ending', 'client_pass_ending:' || r.pass_id || ':' || r.condition,
         v_base || private.person_name(r.client_id)
           || pg_catalog.jsonb_build_object('username', (select p.username from public.profiles p where p.id = r.client_id)),
         r.trainer_id, null, p_now) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

comment on function private.queue_pass_ending(timestamptz) is
  'pg_cron: queues "Абонемент заканчивается" to the client (pass_ending) and the trainer (client_pass_ending) '
  'when a pass has 1 session left or expires within 7 days, once per pass and condition (wave-1 §2.9-9).';
revoke all on function private.queue_pass_ending(timestamptz) from public;

select cron.schedule('pass-ending', '*/15 * * * *', 'select private.queue_pass_ending()');
