-- "Записаться на пробное" on the showcase (PRD wave-1 §2.3 rule 1): the trainer picks one of their trial links
-- to show there, and the showcase button opens that link's page /trial/<token>, so booking works exactly as
-- through a shared link (rules 4 to 6). Additive only.

alter table public.trial_links
  add column on_showcase boolean not null default false;

comment on column public.trial_links.on_showcase is
  'The trial link behind "Записаться на пробное" on the trainer''s showcase; at most one live link per trainer.';

-- One live link at a time: the app switches the old one off before it switches the new one on.
create unique index trial_links_one_on_showcase
  on public.trial_links (trainer_id)
  where on_showcase and archived_at is null;

grant update (on_showcase) on table public.trial_links to authenticated;

-- The token of the trial link on an open showcase, or null when there is no button to show: the showcase is
-- closed (R16, Q60), the trainer chose no link or it is not live (switched off, expired, used up), the caller
-- is the trainer, or the caller is already a live client of the trainer (one trial per pair, rule 6). The
-- token is what the trainer shares anyway; the trial page checks it again on its own.
create function public.get_showcase_trial(p_slug text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_trainer public.trainer_profiles;
  v_token text;
begin
  select t.* into v_trainer from public.trainer_profiles t where t.slug = pg_catalog.lower(p_slug);
  if not private.showcase_is_open(v_trainer) or v_user is not distinct from v_trainer.user_id then
    return null;
  end if;
  if v_user is not null and exists (
    select 1 from public.coachings c
    where c.trainer_id = v_trainer.user_id and c.client_id = v_user and c.status <> 'ended'
  ) then
    return null;
  end if;

  select tl.token into v_token
  from public.trial_links tl
  where tl.trainer_id = v_trainer.user_id and tl.on_showcase and private.trial_link_is_live(tl);
  return v_token;
end $$;

comment on function public.get_showcase_trial(text) is
  'Token of the live trial link the trainer put on their open showcase, for anyone; null when the showcase is '
  'closed, there is no such link, or the caller is the trainer or already their live client.';
revoke all on function public.get_showcase_trial(text) from public;
grant execute on function public.get_showcase_trial(text) to anon, authenticated;
