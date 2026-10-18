-- Waitlist of trainers from the landing page /for-trainers (marketing backlog item 10): a trainer leaves a name
-- and a way to reach them, or signs in with Telegram, and agrees to the processing of what they left. Admins
-- read the list in /admin/waitlist. Nobody writes the table directly: join_trainer_waitlist checks the input.

create table public.trainer_waitlist (
  id              uuid primary key default gen_random_uuid(),
  -- Set when the trainer joined signed in; the row goes with the account.
  user_id         uuid unique references public.profiles (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  -- A Telegram username, phone or email, as typed; required when signed out.
  contact         text check (char_length(contact) between 3 and 120),
  clients         text check (clients in ('up_to_5', '6_15', '16_40', 'over_40')),
  locale          text not null check (locale in ('ru', 'en')),
  -- The channel label from ?src= or utm_source, same alphabet as the start parameter.
  source          text check (source ~ '^[A-Za-z0-9_-]{1,64}$'),
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  consented_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint trainer_waitlist_reachable check (user_id is not null or contact is not null)
);

comment on table public.trainer_waitlist is
  'Trainers who asked to join DaFit from /for-trainers. Written only by join_trainer_waitlist, read by admins.';

-- One row per contact for signed-out entries: a second try with the same contact changes nothing.
create unique index trainer_waitlist_contact_key on public.trainer_waitlist (lower(contact)) where user_id is null;
create index trainer_waitlist_created_at_idx on public.trainer_waitlist (created_at desc);

alter table public.trainer_waitlist enable row level security;

-- Admins see the whole list; a signed-in trainer sees their own row, so the page can say they are in.
create policy "trainer_waitlist: admins and own row read" on public.trainer_waitlist for select to authenticated
using (private.is_admin() or user_id = (select auth.uid()));

grant select on public.trainer_waitlist to authenticated;

-- Join the waitlist, signed in or not. Signed in, the row is the caller's and is updated on a second call;
-- signed out, a contact already in the list is left as it is, and the answer is the same either way, so the
-- function never tells who else is on the list. More than 30 signed-out entries in a minute are refused.
create function public.join_trainer_waitlist(
  p_name text,
  p_locale text,
  p_consent_version text,
  p_contact text default null,
  p_clients text default null,
  p_source text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(pg_catalog.btrim(p_name), '');
  v_contact text := nullif(pg_catalog.btrim(p_contact), '');
  v_source text := nullif(pg_catalog.btrim(p_source), '');
begin
  if v_name is null or pg_catalog.char_length(v_name) > 80
     or (v_contact is not null and pg_catalog.char_length(v_contact) not between 3 and 120)
     or (v_user is null and v_contact is null)
     or (p_clients is not null and p_clients not in ('up_to_5', '6_15', '16_40', 'over_40'))
     or p_locale is null or p_locale not in ('ru', 'en')
     or nullif(pg_catalog.btrim(p_consent_version), '') is null or pg_catalog.char_length(p_consent_version) > 40 then
    raise exception 'waitlist_invalid' using errcode = '22023';
  end if;
  -- A label in an unexpected shape is dropped, not refused: the trainer still gets on the list.
  if v_source is not null and v_source !~ '^[A-Za-z0-9_-]{1,64}$' then
    v_source := null;
  end if;

  if v_user is not null then
    insert into public.trainer_waitlist (user_id, name, contact, clients, locale, source, consent_version)
    values (v_user, v_name, v_contact, p_clients, p_locale, v_source, p_consent_version)
    on conflict (user_id) do update
    set name = excluded.name, contact = excluded.contact, clients = excluded.clients, locale = excluded.locale,
        consent_version = excluded.consent_version, consented_at = pg_catalog.now();
    return;
  end if;

  if (select pg_catalog.count(*) from public.trainer_waitlist w
      where w.user_id is null and w.created_at > pg_catalog.now() - interval '1 minute') >= 30 then
    raise exception 'waitlist_busy' using errcode = 'P0001';
  end if;
  insert into public.trainer_waitlist (name, contact, clients, locale, source, consent_version)
  values (v_name, v_contact, p_clients, p_locale, v_source, p_consent_version)
  on conflict (lower(contact)) where user_id is null do nothing;
end $$;

comment on function public.join_trainer_waitlist(text, text, text, text, text, text) is
  'Anyone: puts a trainer on the waitlist of /for-trainers with their consent. Signed in, updates the own row; '
  'signed out, needs a contact and keeps the first entry for it. Raises waitlist_invalid or waitlist_busy.';
revoke all on function public.join_trainer_waitlist(text, text, text, text, text, text) from public;
grant execute on function public.join_trainer_waitlist(text, text, text, text, text, text) to anon, authenticated;
