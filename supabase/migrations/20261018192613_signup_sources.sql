-- Where new accounts come from (marketing backlog 1): the channel label of the link that brought a person, kept
-- once when Telegram sign-in creates their account, and a breakdown by label on the owner's statistics.
--   * A label is a short lowercase word from the link: `ch_<label>` or the suffix `__s_<label>` of a Mini App
--     start parameter, `?src=` or `utm_source` on the website (`utm_campaign` as the campaign). No name, no
--     contact, no address: the row says only how the account arrived.
--   * Written only by the web server with the secret key right after sign-in (lib/attribution/record.ts); the
--     first row stays. Users have no access at all; admins see counts through admin_owner_sources.

create type public.signup_entry as enum ('mini_app', 'web');

create table public.signup_sources (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  source     text check (source ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  campaign   text check (campaign ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  entry      public.signup_entry not null,
  created_at timestamptz not null default now(),
  constraint signup_sources_campaign_needs_source check (campaign is null or source is not null)
);

comment on table public.signup_sources is
  'How a new account arrived (marketing backlog 1): the channel label of its first link, null without one, and '
  'whether it signed in in the Mini App or on the website. Written once by the server at sign-in.';

alter table public.signup_sources enable row level security;
revoke all on table public.signup_sources from anon, authenticated;

-- admin_owner_sources ------------------------------------------------------------------------------------

-- Accounts by the label they arrived with (null: none, or signed up before labels were kept), and how many of
-- them are trainers and clients of a live pair now. Counts only.
create function public.admin_owner_sources()
returns table (
  source   text,
  campaign text,
  users    integer,
  trainers integer,
  clients  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_owner_metrics(4);

  return query
  with accounts as (
    select p.id, s.source, s.campaign,
           exists (select 1 from public.trainer_profiles t where t.user_id = p.id) as is_trainer
    from public.profiles p
    left join public.signup_sources s on s.user_id = p.id
    where p.managed_by_trainer_id is null and p.id <> private.deleted_client_id()
  ),
  clients as (select id from private.analytics_clients() as id)
  select a.source, a.campaign,
         count(*)::integer,
         count(*) filter (where a.is_trainer)::integer,
         count(*) filter (where a.id in (select c.id from clients c))::integer
  from accounts a
  group by a.source, a.campaign
  order by count(*) desc, a.source nulls last, a.campaign nulls first;
end $$;

comment on function public.admin_owner_sources() is
  'Admin: accounts by the channel label they arrived with, with trainers and clients among them. Counts only.';
revoke all on function public.admin_owner_sources() from public, anon;
grant execute on function public.admin_owner_sources() to authenticated;
