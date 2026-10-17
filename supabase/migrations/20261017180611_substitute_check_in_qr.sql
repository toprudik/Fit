-- The substitute shows the check-in QR of their session (PRD wave-3 §1 × §5): session_check_in_qr now also
-- answers the trainer who substitutes on the session, alongside its owner and an assistant with the schedule
-- scope. The substitute's access ends with the session (1.5), so their QR goes away at the end, while the owner's
-- stays until check-in closes 15 minutes later. The body is the one of 20261017032700_qr_check_in.sql otherwise.

create or replace function public.session_check_in_qr(p_session_id uuid)
returns table (code text, refresh_at timestamptz, opens_at timestamptz, checked_in jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window bigint := private.check_in_window(pg_catalog.now());
begin
  select s.* into v_session from public.sessions s where s.id = p_session_id;
  if v_session.id is null
     or not (private.acts_for_trainer(v_session.trainer_id, 'schedule') or private.substitutes_session(v_session.id)) then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if v_session.status = 'cancelled' or pg_catalog.now() > private.check_in_closes_at(v_session) then
    raise exception 'check_in_closed' using errcode = 'P0001';
  end if;
  return query
  select
    case when pg_catalog.now() >= private.check_in_opens_at(v_session)
      then private.check_in_code(v_session.id, v_window) end,
    pg_catalog.to_timestamp((v_window + 1) * 15),
    private.check_in_opens_at(v_session),
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('booking_id', c.booking_id, 'checked_in_at', c.checked_in_at)
               || private.person_name(c.client_id) order by c.checked_in_at)
      from public.check_ins c join public.bookings b on b.id = c.booking_id
      where b.session_id = v_session.id), '[]'::jsonb);
end $$;

comment on function public.session_check_in_qr(uuid) is
  'Trainer or the session''s substitute: the check-in code for the current 15-second window (null before check-in '
  'opens), when to fetch the next one, and the clients checked in so far.';
