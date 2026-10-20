-- The data processing agreement for trainers (legal/ru/trainer-data-processing-agreement.md, /legal/trainers): the
-- trainer is the operator of what they write about clients themselves, DaFit processes it on their behalf. The
-- trainer accepts it once, as its own kind of consent, before the first client card without an account or the
-- first note; until then both are refused here, not only hidden in the app.
-- The function bodies use the new enum value, so they are plpgsql: it is not read until a call, after this
-- migration's transaction has committed.

alter type public.consent_kind add value if not exists 'trainer_dpa';

-- Whether the trainer holds an unrevoked acceptance of the agreement, any version.
create function private.trainer_dpa_accepted(p_trainer uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.consents c
    where c.user_id = p_trainer and c.kind = 'trainer_dpa' and c.revoked_at is null);
end $$;
comment on function private.trainer_dpa_accepted(uuid) is
  'Whether the trainer accepted the data processing agreement and has not revoked it.';
revoke all on function private.trainer_dpa_accepted(uuid) from public, anon;
grant execute on function private.trainer_dpa_accepted(uuid) to authenticated;

-- A note is written for the pair's trainer, by them or their assistant, so it is the trainer's acceptance that counts.
create function private.coaching_dpa_accepted(p_coaching uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.trainer_dpa_accepted(c.trainer_id) from public.coachings c where c.id = p_coaching
$$;
comment on function private.coaching_dpa_accepted(uuid) is
  'Whether the trainer of this pair accepted the data processing agreement (notes need it).';
revoke all on function private.coaching_dpa_accepted(uuid) from public, anon;
grant execute on function private.coaching_dpa_accepted(uuid) to authenticated;

drop policy "coaching_notes: author trainer inserts" on public.coaching_notes;
create policy "coaching_notes: author trainer inserts"
  on public.coaching_notes for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and private.is_coaching_trainer(coaching_id, 'notes')
    and private.coaching_dpa_accepted(coaching_id));

-- The body of 20261016200000_managed_clients.sql, refusing with dpa_required before anything is written.
create or replace function public.create_managed_client(p_display_name text, p_contact text default null, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := pg_catalog.btrim(p_display_name);
  v_contact text := nullif(pg_catalog.btrim(p_contact), '');
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_card uuid := gen_random_uuid();
  v_pair uuid;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_name is null or pg_catalog.char_length(v_name) not between 1 and 100 then
    raise exception 'name_invalid' using errcode = 'P0001';
  end if;
  if pg_catalog.char_length(v_contact) > 200 then
    raise exception 'contact_too_long' using errcode = 'P0001';
  end if;
  if pg_catalog.char_length(v_note) > 5000 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  -- Raises not_a_trainer or plan_limit_reached, and holds the trainer row until the end.
  perform private.assert_can_add_client(v_user);
  if not private.trainer_dpa_accepted(v_user) then
    raise exception 'dpa_required' using errcode = 'P0001';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, banned_until, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_card, 'authenticated', 'authenticated',
    'managed-' || v_card || '@users.fit.invalid', 'infinity',
    pg_catalog.jsonb_build_object('provider', 'managed', 'providers', pg_catalog.jsonb_build_array()),
    '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
  );
  insert into public.profiles (id, telegram_id, first_name, managed_by_trainer_id)
  values (v_card, null, v_name, v_user);

  insert into public.coachings (trainer_id, client_id, source)
  values (v_user, v_card, 'manual')
  returning id into v_pair;

  if v_contact is not null then
    update public.coaching_trainer_meta m set contact = v_contact where m.coaching_id = v_pair;
  end if;
  if v_note is not null then
    insert into public.coaching_notes (coaching_id, author_id, body, visible_to_client)
    values (v_pair, v_user, v_note, false);
  end if;
  return v_pair;
end $$;
comment on function public.create_managed_client(text, text, text) is
  'The trainer adds a client without an account (PRD 2.5-3): a card that cannot sign in, its active pair with '
  'source manual and every data category shared, the contact in the pair meta and the note hidden from the '
  'client. Returns the pair id. Raises name_invalid, contact_too_long, note_too_long, not_a_trainer, '
  'plan_limit_reached or dpa_required (the trainer has not accepted the data processing agreement).';
