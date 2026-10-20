-- RLS helpers that grew with the whole platform instead of the caller's own pairs (load run 18.10, reports/load-*.md).
-- Each answers exactly what it answered before; only the way it finds the rows changes, from "every pair or
-- session in the database, filtered" to "start from the caller's own pairs and delegations":
--   * private.trainer_coaching_ids(p_scopes): called delegate_covers() for every pair in the database whenever
--     scopes were given (passes, ledger_entries, payments, bookings policies), 22 ms per query at 800 pairs, for
--     clients too. Bodies: 20261017090713_delegations.sql (this one and delegate_covers).
--   * private.viewable_client_ids(p_category): scanned every live pair because of the OR between the own-pair and
--     the delegate branches (food diary, activity, measurements, photos, workouts policies). Body: same file.
--   * private.delegated_client_ids() and private.delegated_session_ids(): compared every pair or booked session with
--     the array of delegated pairs (profiles and sessions policies). Bodies: 20261017113217_delegate_schedule.sql.
-- supabase/tests/978_rls_helpers_scale.test.sql checks each against its previous definition.

-- The data_shares flag of one category (the CASE of viewable_client_ids before this migration).
create function private.shares_category(p_share public.data_shares, p_category public.share_category)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_category
           when 'nutrition'    then p_share.nutrition
           when 'measurements' then p_share.measurements
           when 'photos'       then p_share.photos
           when 'steps'        then p_share.steps
           when 'intake'       then p_share.intake
           when 'workouts'     then p_share.workouts
         end
$$;
comment on function private.shares_category(public.data_shares, public.share_category) is
  'Whether a pair''s data_shares row shares the category.';
revoke all on function private.shares_category(public.data_shares, public.share_category) from public;

-- Own pairs through the trainer_id index; delegated pairs through the caller's delegations, with the conditions of
-- delegate_covers(c.id, scope) for a scope in p_scopes (an assistant for all or the chosen clients, a substitute
-- for the pairs booked on the session).
create or replace function private.trainer_coaching_ids(p_scopes public.delegation_scope[] default null) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.array_agg(distinct x.id), '{}')
  from (
    select c.id
    from public.coachings c
    where c.trainer_id = auth.uid()
    union all
    select c.id
    from public.delegations d
    join public.coachings c on c.trainer_id = d.owner_trainer_id
    where p_scopes is not null and d.delegate_trainer_id = auth.uid() and d.status = 'active'
      and d.starts_at <= pg_catalog.now() and (d.ends_at is null or d.ends_at > pg_catalog.now())
      and d.scopes && p_scopes
      and case d.kind
            when 'assistant' then d.all_clients or exists (
              select 1 from public.delegation_clients dc where dc.delegation_id = d.id and dc.coaching_id = c.id)
            else exists (
              select 1 from public.sessions s join public.bookings b on b.session_id = s.id
              where s.id = d.session_id and s.ends_at > pg_catalog.now() and s.status = 'scheduled'
                and b.coaching_id = c.id and b.status in ('confirmed', 'attended', 'no_show'))
          end
  ) x
$$;

-- The caller, the clients of its own live pairs that share the category, the clients of live pairs of trainers it
-- is an active delegate of when delegate_views allows it, and break-glass grants.
create or replace function private.viewable_client_ids(p_category public.share_category) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.array_agg(distinct x.id), '{}')
  from (
    select auth.uid() as id
    union all
    select c.client_id
    from public.coachings c
    join public.data_shares d on d.coaching_id = c.id
    where c.trainer_id = auth.uid() and c.status in ('trial', 'active') and private.shares_category(d, p_category)
    union all
    select c.client_id
    from (select distinct dl.owner_trainer_id
          from public.delegations dl
          where dl.delegate_trainer_id = auth.uid() and dl.status = 'active') o
    join public.coachings c on c.trainer_id = o.owner_trainer_id
    join public.data_shares d on d.coaching_id = c.id
    where c.status in ('trial', 'active') and private.shares_category(d, p_category)
      and private.delegate_views(c.id, p_category)
    union all
    select g.target_user_id
    from public.break_glass_grants g
    join public.user_roles r on r.user_id = g.admin_id and r.role = 'admin'
    where g.admin_id = auth.uid()
      and g.revoked_at is null and g.expires_at > pg_catalog.now()
      and p_category = any (g.categories)
  ) x
  where x.id is not null
$$;

-- From the delegated pairs to their clients, not from every pair to the array.
create or replace function private.delegated_client_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(distinct c.client_id), '{}')
  from pg_catalog.unnest(private.delegated_coaching_ids()) x (id)
  join public.coachings c on c.id = x.id
$$;

-- From the delegated pairs to their bookings and sessions, not from every booked session to the array.
create or replace function private.delegated_session_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(distinct x.id), '{}')
  from (
    select s.id
    from pg_catalog.unnest(private.delegated_coaching_ids('{schedule,attendance}')) p (id)
    join public.bookings b on b.coaching_id = p.id
    join public.sessions s on s.id = b.session_id
    where s.kind <> 'group'
    union all
    select d.session_id
    from public.delegations d
    where d.delegate_trainer_id = auth.uid() and d.kind = 'substitute' and private.substitutes_session(d.session_id)
  ) x
$$;
