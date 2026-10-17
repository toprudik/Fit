-- Second buttons in the bot (PRD wave-1 §3, К1/К4–К6): «Написать тренеру» opens the trainer's Telegram chat, so the
-- payloads signed with private.trainer_name also carry the trainer's username. Every caller merges the result into
-- a payload for the trainer's own client or one who booked with them; the username is shown to them in the app too.
create or replace function private.trainer_name(p_trainer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
                     'first_name', p.first_name, 'last_name', p.last_name, 'username', p.username))
                   from public.profiles p where p.id = p_trainer), '{}'::jsonb)
$$;

revoke all on function private.trainer_name(uuid) from public;
