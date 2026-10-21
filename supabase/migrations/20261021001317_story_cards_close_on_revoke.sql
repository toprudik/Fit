-- Withdrawing the consent to publish stops the publication at once (152-FZ art. 10.1 part 14: no later than three
-- working days after the request). The showcase already closed on revoke; now the story cards do too: revoking
-- closes the person's cards for good, and a card opens only while its author's consent is in force, which also
-- closes the cards made before consents to publish existed (20261020171523).

create or replace function public.revoke_public_data_consent(p_scope text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_found boolean;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.public_data_consents c set revoked_at = pg_catalog.now()
  where c.user_id = v_user and c.scope = p_scope and c.revoked_at is null;
  v_found := found;
  if p_scope = 'showcase' then
    update public.trainer_profiles t set is_public = false where t.user_id = v_user and t.is_public;
  end if;
  -- A card of the showcase goes with the showcase consent, every other card with the story one.
  update public.story_cards s set expires_at = pg_catalog.now()
  where s.user_id = v_user and s.expires_at > pg_catalog.now()
    and (s.kind = 'trainer_showcase') = (p_scope = 'showcase');
  return v_found;
end $$;

comment on function public.revoke_public_data_consent(text) is
  'The caller revokes their consent to publish for a scope; revoking the showcase one closes the showcase, and '
  'either one closes the caller''s story cards that it covered.';

create or replace function public.story_card(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('kind', c.kind, 'month', c.month, 'data', c.data)
  from public.story_cards c
  where c.id = p_id and c.expires_at > now()
    and (private.public_consent(c.user_id, case when c.kind = 'trainer_showcase' then 'showcase' else 'story' end)).id
        is not null
$$;
comment on function public.story_card(uuid) is
  'A story card by its id for the image route (wave-3 §4-4): kind, month and the frozen numbers; null when expired '
  'or when its author has no consent to publish it in force (152-FZ art. 10.1).';
