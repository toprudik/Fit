-- Delegation: an assistant and a substitute trainer (PRD wave-3 §1, data-model.md §2.3, criteria 1.1-1.10).
--
-- The owner trainer (Pro, trainer.delegation) creates a delegation and gets a one-time link; a verified DaFit
-- trainer opens it and accepts. Only then does the delegate get access, and only through the RLS helpers below:
--   * substitute: one session, until it ends; attendance and workout logs of its participants, and their intake
--     when the client shares it with the owner;
--   * assistant: chosen pairs or all of them, until a date or for good, with the scopes the owner ticked.
-- Passes and payments are never delegated (rule 3), so every money table and RPC stays owner-only; the waiver,
-- finance and analytics RPCs check the owner inline and are not changed. Delegation creates no pair (rule 9).

-- =========================================================================================================
-- Tables

create type public.delegation_kind as enum ('assistant', 'substitute');
create type public.delegation_status as enum ('pending', 'active', 'declined', 'revoked', 'expired');

create table public.delegations (
  id                  uuid primary key default gen_random_uuid(),
  owner_trainer_id    uuid not null references public.trainer_profiles(user_id) on delete cascade,
  -- Set when the invited trainer accepts the link (rule 1).
  delegate_trainer_id uuid references public.trainer_profiles(user_id) on delete cascade,
  kind                public.delegation_kind not null,
  session_id          uuid references public.sessions(id) on delete cascade,
  scopes              public.delegation_scope[] not null,
  all_clients         boolean not null default false,
  starts_at           timestamptz not null default now(),
  ends_at             timestamptz,
  status              public.delegation_status not null default 'pending',
  invite_hash         bytea unique,
  accepted_at         timestamptz,
  revoked_at          timestamptz,
  reminded_at         timestamptz,
  created_at          timestamptz not null default now(),
  constraint delegations_owner_check check (delegate_trainer_id is null or owner_trainer_id <> delegate_trainer_id),
  constraint delegations_session_check check ((kind = 'substitute') = (session_id is not null)),
  constraint delegations_all_clients_check check (kind = 'assistant' or not all_clients),
  constraint delegations_scopes_check check (
    cardinality(scopes) > 0 and not (scopes && array['passes', 'payments']::public.delegation_scope[])),
  constraint delegations_delegate_check check (status in ('pending', 'expired') or delegate_trainer_id is not null),
  constraint delegations_ends_check check (ends_at is null or ends_at > starts_at)
);
comment on table public.delegations is
  'An owner trainer''s delegation to another verified trainer: a substitute for one session or an assistant '
  '(PRD wave-3 §1). Access starts on acceptance and ends on revocation, at ends_at, or when the session ends.';
comment on column public.delegations.delegate_trainer_id is 'The trainer who accepted the invite link; null while pending.';
comment on column public.delegations.invite_hash is 'sha256 of the one-time invite token; cleared on acceptance.';
comment on column public.delegations.scopes is 'What the delegate may do; passes and payments are never allowed (rule 3).';
comment on column public.delegations.reminded_at is 'When the owner got the reminder about an unaccepted substitute (rule 2).';
create index delegations_delegate_idx on public.delegations (delegate_trainer_id);
create index delegations_owner_idx on public.delegations (owner_trainer_id);
create index delegations_session_idx on public.delegations (session_id) where session_id is not null;

create table public.delegation_clients (
  delegation_id uuid not null references public.delegations(id) on delete cascade,
  coaching_id   uuid not null references public.coachings(id) on delete cascade,
  primary key (delegation_id, coaching_id)
);
comment on table public.delegation_clients is 'The pairs an assistant covers when the delegation is not for all clients.';
create index delegation_clients_coaching_idx on public.delegation_clients (coaching_id);

-- The client's switch: assistants of this pair do not see the client's progress or nutrition (rule 6, 1.7).
create table public.assistant_progress_blocks (
  coaching_id uuid primary key references public.coachings(id) on delete cascade,
  created_at  timestamptz not null default now()
);
comment on table public.assistant_progress_blocks is
  'Pairs whose client turned off assistants'' access to progress and nutrition (PRD wave-3 §1 rule 6).';

-- The trainer who runs a session in place of its owner (data-model.md: set when a substitute accepts).
alter table public.sessions add column conducted_by uuid references public.profiles(id) on delete set null;
comment on column public.sessions.conducted_by is 'The substitute trainer who runs this session (PRD wave-3 §1), or null.';
create index sessions_conducted_by_idx on public.sessions (conducted_by) where conducted_by is not null;

-- =========================================================================================================
-- The delegate check

-- True when the caller is an active delegate for this pair with this scope. A substitute covers the pairs
-- booked on its session until the session ends; an assistant covers its pairs (or all) until ends_at.
create function private.delegate_covers(p_coaching_id uuid, p_scope public.delegation_scope)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_scope is not null and auth.uid() is not null and exists (
    select 1
    from public.delegations d
    join public.coachings c on c.id = p_coaching_id and c.trainer_id = d.owner_trainer_id
    where d.delegate_trainer_id = auth.uid() and d.status = 'active'
      and d.starts_at <= pg_catalog.now() and (d.ends_at is null or d.ends_at > pg_catalog.now())
      and p_scope = any (d.scopes)
      and case d.kind
            when 'assistant' then d.all_clients or exists (
              select 1 from public.delegation_clients dc where dc.delegation_id = d.id and dc.coaching_id = c.id)
            else exists (
              select 1 from public.sessions s join public.bookings b on b.session_id = s.id
              where s.id = d.session_id and s.ends_at > pg_catalog.now() and s.status = 'scheduled'
                and b.coaching_id = c.id and b.status in ('confirmed', 'attended', 'no_show'))
          end)
$$;
comment on function private.delegate_covers(uuid, public.delegation_scope) is
  'RLS helper: the caller is an active delegate of the pair''s trainer with this scope (PRD wave-3 §1).';
revoke all on function private.delegate_covers(uuid, public.delegation_scope) from public;
grant execute on function private.delegate_covers(uuid, public.delegation_scope) to authenticated, service_role;

-- True when the caller substitutes on this session now.
create function private.substitutes_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.delegations d join public.sessions s on s.id = d.session_id
    where d.session_id = p_session_id and d.kind = 'substitute' and d.status = 'active'
      and d.delegate_trainer_id = auth.uid() and s.ends_at > pg_catalog.now() and s.status = 'scheduled')
$$;
revoke all on function private.substitutes_session(uuid) from public;
grant execute on function private.substitutes_session(uuid) to authenticated, service_role;

-- True when the caller is an active assistant for all of this trainer's clients with this scope: the
-- trainer-owned rows without a pair (sessions, slots, locations, links).
create function private.assists_trainer(p_trainer_id uuid, p_scope public.delegation_scope)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_scope is not null and auth.uid() is not null and exists (
    select 1 from public.delegations d
    where d.owner_trainer_id = p_trainer_id and d.delegate_trainer_id = auth.uid() and d.kind = 'assistant'
      and d.all_clients and d.status = 'active' and p_scope = any (d.scopes)
      and d.starts_at <= pg_catalog.now() and (d.ends_at is null or d.ends_at > pg_catalog.now()))
$$;
revoke all on function private.assists_trainer(uuid, public.delegation_scope) from public;
grant execute on function private.assists_trainer(uuid, public.delegation_scope) to authenticated, service_role;

-- =========================================================================================================
-- RLS helpers learn about delegates (data-model.md "Функции-помощники"; same signatures as wave 1)

create or replace function private.is_coaching_trainer(p_coaching_id uuid, p_scope public.delegation_scope default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coachings c where c.id = p_coaching_id and c.trainer_id = auth.uid())
    or private.delegate_covers(p_coaching_id, p_scope)
$$;
comment on function private.is_coaching_trainer(uuid, public.delegation_scope) is
  'RLS helper: the caller is the owner trainer of the pair (any status), or an active delegate covering it with '
  'this scope. Without a scope only the owner passes.';

create or replace function private.acts_for_trainer(p_trainer_id uuid, p_scope public.delegation_scope default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_trainer_id = auth.uid(), false) or private.assists_trainer(p_trainer_id, p_scope)
$$;
comment on function private.acts_for_trainer(uuid, public.delegation_scope) is
  'RLS helper: the caller is this trainer, or an assistant for all their clients with this scope.';

create or replace function private.can_manage_session(p_session_id uuid, p_scope public.delegation_scope default 'schedule')
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id
      and (s.trainer_id = auth.uid() or private.assists_trainer(s.trainer_id, p_scope)
           or (p_scope in ('attendance', 'workouts') and private.substitutes_session(s.id))))
$$;

create or replace function private.trainer_coaching_ids(p_scopes public.delegation_scope[] default null) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.array_agg(c.id), '{}')
  from public.coachings c
  where c.trainer_id = auth.uid()
     or (p_scopes is not null and exists (
           select 1 from pg_catalog.unnest(p_scopes) sc (scope) where private.delegate_covers(c.id, sc.scope)))
$$;
comment on function private.trainer_coaching_ids(public.delegation_scope[]) is
  'RLS helper: ids of the pairs the caller works on as their trainer (any status) or as a delegate with one of '
  'the scopes.';

create or replace function private.acting_trainer_ids(p_scopes public.delegation_scope[] default null) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then '{}'::uuid[] else
    array[auth.uid()] || coalesce((
      select pg_catalog.array_agg(distinct d.owner_trainer_id)
      from public.delegations d
      where p_scopes is not null and d.delegate_trainer_id = auth.uid() and d.kind = 'assistant' and d.all_clients
        and d.status = 'active' and d.scopes && p_scopes
        and d.starts_at <= pg_catalog.now() and (d.ends_at is null or d.ends_at > pg_catalog.now())), '{}')
  end
$$;
comment on function private.acting_trainer_ids(public.delegation_scope[]) is
  'RLS helper: the caller and the trainers they assist for all clients with one of the scopes.';

-- The delegate half of a category check for one pair (the share flag is checked by the caller): progress needs
-- the progress scope, nutrition and steps the nutrition scope, the intake notes or attendance, workout logs
-- workouts; a client's switch takes progress and nutrition from assistants (rules 4 and 6).
create function private.delegate_views(p_coaching_id uuid, p_category public.share_category)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_category
           when 'measurements' then private.delegate_covers(p_coaching_id, 'progress')
           when 'photos'       then private.delegate_covers(p_coaching_id, 'progress')
           when 'nutrition'    then private.delegate_covers(p_coaching_id, 'nutrition')
           when 'steps'        then private.delegate_covers(p_coaching_id, 'nutrition')
           when 'intake'       then private.delegate_covers(p_coaching_id, 'notes')
                                    or private.delegate_covers(p_coaching_id, 'attendance')
           when 'workouts'     then private.delegate_covers(p_coaching_id, 'workouts')
           else false
         end
     and (p_category in ('intake', 'workouts')
          or not exists (select 1 from public.assistant_progress_blocks pb where pb.coaching_id = p_coaching_id))
$$;
revoke all on function private.delegate_views(uuid, public.share_category) from public;
grant execute on function private.delegate_views(uuid, public.share_category) to authenticated, service_role;

create or replace function private.is_trainer_of(p_client_id uuid, p_scope public.delegation_scope default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.coachings c
    where c.client_id = p_client_id and c.status in ('trial', 'active')
      and (c.trainer_id = auth.uid() or private.delegate_covers(c.id, p_scope)))
$$;
comment on function private.is_trainer_of(uuid, public.delegation_scope) is
  'RLS helper: true when the caller trains this client in a live pair, or is a delegate covering it with the scope.';

create or replace function private.viewable_client_ids(p_category public.share_category) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.array_agg(distinct x.id), '{}')
  from (
    select auth.uid() as id
    union all
    select c.client_id
    from public.coachings c
    join public.data_shares d on d.coaching_id = c.id
    where c.status in ('trial', 'active')
      and case p_category
            when 'nutrition'    then d.nutrition
            when 'measurements' then d.measurements
            when 'photos'       then d.photos
            when 'steps'        then d.steps
            when 'intake'       then d.intake
            when 'workouts'     then d.workouts
          end
      and (c.trainer_id = auth.uid()
           or (auth.uid() is not null
               and exists (select 1 from public.delegations dl
                           where dl.delegate_trainer_id = auth.uid() and dl.owner_trainer_id = c.trainer_id
                             and dl.status = 'active')
               and private.delegate_views(c.id, p_category)))
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

-- A delegate sees a category only when the client shares it with the owner in a live pair and the delegation
-- has the matching scope (data-model.md "Делегат не видит больше владельца"); a client can switch an assistant
-- off for progress and nutrition. A substitute sees the intake and workout logs of its participants (rule 4).
create or replace function private.can_view(p_client_id uuid, p_category public.share_category) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_client_id = auth.uid(), false)
    or exists (
      select 1
      from public.coachings c
      join public.data_shares d on d.coaching_id = c.id
      where c.client_id = p_client_id and c.status in ('trial', 'active')
        and case p_category
              when 'nutrition'    then d.nutrition
              when 'measurements' then d.measurements
              when 'photos'       then d.photos
              when 'steps'        then d.steps
              when 'intake'       then d.intake
              when 'workouts'     then d.workouts
            end
        and (c.trainer_id = auth.uid() or private.delegate_views(c.id, p_category)))
    or exists (
      select 1
      from public.break_glass_grants g
      join public.user_roles r on r.user_id = g.admin_id and r.role = 'admin'
      where g.admin_id = auth.uid() and g.target_user_id = p_client_id
        and g.revoked_at is null and g.expires_at > pg_catalog.now()
        and p_category = any (g.categories))
$$;
comment on function private.can_view(uuid, public.share_category) is
  'RLS helper: true when the caller may see this category of the client''s data: the client, the trainer of a live '
  'pair with the category shared or a delegate of that trainer with the matching scope (wave-3 §1), or an admin '
  'with a live break-glass grant that lists it.';

-- A booking the caller may mark: the owner's, a substitute's on its session, or an assistant's with attendance.
create or replace function private.own_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id
    and (b.trainer_id = auth.uid() or private.substitutes_session(b.session_id)
         or private.delegate_covers(b.coaching_id, 'attendance'))
  for update;
  if v_booking.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  return v_booking;
end $$;

-- A future session the caller may change: the owner's, or an assistant's for all clients with schedule.
create or replace function private.own_future_session(p_session_id uuid)
returns public.sessions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
begin
  select s.* into v_session from public.sessions s
  where s.id = p_session_id and (s.trainer_id = auth.uid() or private.assists_trainer(s.trainer_id, 'schedule'))
  for update;
  if v_session.id is null then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if v_session.status <> 'scheduled' or v_session.starts_at <= pg_catalog.now() then
    raise exception 'not_editable' using errcode = 'P0001';
  end if;
  return v_session;
end $$;

-- A client cancels a booking on a substituted session without a charge, whatever the deadline (rule 5, 1.4).
create or replace function private.cancel_deadline(p_booking_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.conducted_by is not null then s.starts_at
              else s.starts_at - pg_catalog.make_interval(hours => t.cancellation_deadline_hours) end
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.trainer_profiles t on t.user_id = b.trainer_id
  where b.id = p_booking_id
$$;
comment on function private.cancel_deadline(uuid) is
  'End of free cancellation for a booking: session start minus the trainer''s cancellation_deadline_hours, or the '
  'start itself when a substitute runs the session (wave-3 §1 rule 5).';

-- The journal (rule 8): a booking event by a delegate is marked as such, with the owner it acted for.
create function private.booking_events_mark_delegate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if new.actor_role = 'trainer' and new.actor_id is not null then
    select b.trainer_id into v_owner from public.bookings b where b.id = new.booking_id;
    if v_owner is not null and v_owner <> new.actor_id then
      new.actor_role := 'delegate';
      new.payload := coalesce(new.payload, '{}'::jsonb) || pg_catalog.jsonb_build_object('on_behalf_of', v_owner);
    end if;
  end if;
  return new;
end $$;
revoke all on function private.booking_events_mark_delegate() from public;
create trigger booking_events_mark_delegate
before insert on public.booking_events
for each row execute function private.booking_events_mark_delegate();

-- =========================================================================================================
-- RLS

-- The ledger holds amounts and debts, which a delegate never sees (rule 3, 1.3): only the passes scope, never
-- delegated, reads it besides the owner and the client.
drop policy "ledger_entries: client and pair trainer read" on public.ledger_entries;
create policy "ledger_entries: client and pair trainer read"
  on public.ledger_entries for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or coaching_id = any ((select private.trainer_coaching_ids('{passes}'))::uuid[])
  );
comment on policy "ledger_entries: client and pair trainer read" on public.ledger_entries is
  'The client and the pair''s owner trainer read the pair''s ledger, in any pair status; delegates do not (wave-3 §1 '
  'rule 3). Rows come only from RPCs and triggers.';

alter table public.delegations enable row level security;
alter table public.delegation_clients enable row level security;
alter table public.assistant_progress_blocks enable row level security;

create policy "delegations: owner and delegate read" on public.delegations
for select to authenticated
using (owner_trainer_id = (select auth.uid()) or delegate_trainer_id = (select auth.uid()));

create policy "delegation_clients: owner and delegate read" on public.delegation_clients
for select to authenticated
using (exists (
  select 1 from public.delegations d
  where d.id = delegation_id
    and (d.owner_trainer_id = (select auth.uid()) or d.delegate_trainer_id = (select auth.uid()))));

create policy "assistant_progress_blocks: client reads own" on public.assistant_progress_blocks
for select to authenticated
using (exists (select 1 from public.coachings c where c.id = coaching_id and c.client_id = (select auth.uid())));

revoke all on public.delegations, public.delegation_clients, public.assistant_progress_blocks from anon, authenticated;
grant select (id, owner_trainer_id, delegate_trainer_id, kind, session_id, scopes, all_clients, starts_at, ends_at,
              status, accepted_at, revoked_at, created_at)
  on public.delegations to authenticated;
grant select on public.delegation_clients, public.assistant_progress_blocks to authenticated;

-- =========================================================================================================
-- RPCs

-- A person's name for delegation rows and messages: first and last name from the profile.
create function private.delegation_person(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)), '')
  from public.profiles p where p.id = p_user
$$;
revoke all on function private.delegation_person(uuid) from public;

-- The scopes an owner may give, by kind: a substitute runs the session, an assistant gets what is ticked.
create function private.delegation_scopes(p_kind public.delegation_kind, p_scopes public.delegation_scope[])
returns public.delegation_scope[]
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'substitute' then array['attendance', 'workouts']::public.delegation_scope[]
    else (select pg_catalog.array_agg(distinct s order by s) from pg_catalog.unnest(p_scopes) s
          where s in ('schedule', 'attendance', 'workouts', 'homework', 'notes', 'progress', 'nutrition'))
  end
$$;
revoke all on function private.delegation_scopes(public.delegation_kind, public.delegation_scope[]) from public;

-- The owner creates a delegation and gets the one-time token for the invite link (rule 1). A substitute is for
-- one future session of the owner; an assistant is for the given pairs or all of them, until p_ends_at or for
-- good. Raises plan_required, session_not_found, invalid_scopes, pair_not_found, invalid_dates, already_delegated.
create function public.create_delegation(
  p_kind public.delegation_kind,
  p_session_id uuid default null,
  p_scopes public.delegation_scope[] default null,
  p_all_clients boolean default false,
  p_coaching_ids uuid[] default null,
  p_ends_at timestamptz default null
)
returns table (delegation_id uuid, token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session public.sessions;
  v_scopes public.delegation_scope[];
  v_token text := pg_catalog.rtrim(pg_catalog.translate(pg_catalog.encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'), '=');
  v_id uuid;
  v_all boolean := coalesce(p_all_clients, false) and p_kind = 'assistant';
  v_ends timestamptz := p_ends_at;
begin
  if v_owner is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_owner) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.has_entitlement(v_owner, 'trainer.delegation') then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  if p_kind = 'substitute' then
    select * into v_session from public.sessions s
    where s.id = p_session_id and s.trainer_id = v_owner and s.status = 'scheduled' and s.starts_at > pg_catalog.now();
    if v_session.id is null then
      raise exception 'session_not_found' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.delegations d
               where d.session_id = v_session.id and d.status in ('pending', 'active')) then
      raise exception 'already_delegated' using errcode = 'P0001';
    end if;
    v_ends := v_session.ends_at;
  else
    if v_ends is not null and v_ends <= pg_catalog.now() then
      raise exception 'invalid_dates' using errcode = '22023';
    end if;
    if not v_all and (p_coaching_ids is null or cardinality(p_coaching_ids) = 0 or exists (
          select 1 from pg_catalog.unnest(p_coaching_ids) x (id)
          where not exists (select 1 from public.coachings c
                            where c.id = x.id and c.trainer_id = v_owner and c.status in ('trial', 'active')))) then
      raise exception 'pair_not_found' using errcode = 'P0001';
    end if;
  end if;
  v_scopes := private.delegation_scopes(p_kind, p_scopes);
  if v_scopes is null or cardinality(v_scopes) = 0 then
    raise exception 'invalid_scopes' using errcode = '22023';
  end if;

  insert into public.delegations (owner_trainer_id, kind, session_id, scopes, all_clients, ends_at, invite_hash)
  values (v_owner, p_kind, v_session.id, v_scopes, v_all, v_ends, extensions.digest(v_token, 'sha256'))
  returning id into v_id;
  if p_kind = 'assistant' and not v_all then
    insert into public.delegation_clients (delegation_id, coaching_id)
    select distinct v_id, x.id from pg_catalog.unnest(p_coaching_ids) x (id);
  end if;
  return query select v_id, v_token;
end $$;
comment on function public.create_delegation(public.delegation_kind, uuid, public.delegation_scope[], boolean, uuid[], timestamptz) is
  'The owner trainer creates a substitute or assistant delegation; returns its id and the one-time invite token '
  '(PRD wave-3 §1 rule 1).';
revoke all on function public.create_delegation(public.delegation_kind, uuid, public.delegation_scope[], boolean, uuid[], timestamptz) from public, anon;
grant execute on function public.create_delegation(public.delegation_kind, uuid, public.delegation_scope[], boolean, uuid[], timestamptz) to authenticated;

-- A pending delegation by its invite token, locked; a substitute whose session already started has expired.
create function private.pending_delegation(p_token text)
returns public.delegations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delegation public.delegations;
begin
  select d.* into v_delegation from public.delegations d
  where d.invite_hash = extensions.digest(coalesce(p_token, ''), 'sha256') and d.status = 'pending'
  for update;
  if v_delegation.id is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if (v_delegation.kind = 'substitute' and not exists (
        select 1 from public.sessions s
        where s.id = v_delegation.session_id and s.status = 'scheduled' and s.starts_at > pg_catalog.now()))
     or (v_delegation.ends_at is not null and v_delegation.ends_at <= pg_catalog.now()) then
    update public.delegations set status = 'expired', invite_hash = null where id = v_delegation.id;
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;
  return v_delegation;
end $$;
revoke all on function private.pending_delegation(text) from public;

-- What the invited trainer sees before accepting: who invites, the kind, the session and the scopes.
create function public.delegation_invite(p_token text)
returns table (
  kind public.delegation_kind, owner_name text, scopes public.delegation_scope[], all_clients boolean,
  clients integer, session_starts_at timestamptz, ends_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delegation public.delegations;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_delegation := private.pending_delegation(p_token);
  return query
  select v_delegation.kind, private.delegation_person(v_delegation.owner_trainer_id), v_delegation.scopes,
         v_delegation.all_clients,
         (select pg_catalog.count(*)::integer from public.delegation_clients dc where dc.delegation_id = v_delegation.id),
         (select s.starts_at from public.sessions s where s.id = v_delegation.session_id),
         v_delegation.ends_at;
end $$;
revoke all on function public.delegation_invite(text) from public, anon;
grant execute on function public.delegation_invite(text) to authenticated;

-- The clients a delegation tells about itself: the participants of a substituted session, or the assistant's pairs.
create function private.delegation_audience(p_delegation public.delegations)
returns table (client_id uuid, coaching_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct b.client_id, b.coaching_id
  from public.bookings b
  where p_delegation.kind = 'substitute' and b.session_id = p_delegation.session_id
    and b.status in ('requested', 'confirmed')
  union
  select distinct c.client_id, c.id
  from public.coachings c
  where p_delegation.kind = 'assistant' and c.trainer_id = p_delegation.owner_trainer_id
    and c.status in ('trial', 'active') and c.client_id is not null
    and (p_delegation.all_clients or exists (
      select 1 from public.delegation_clients dc where dc.delegation_id = p_delegation.id and dc.coaching_id = c.id))
$$;
revoke all on function private.delegation_audience(public.delegations) from public;

-- The invited trainer accepts (rule 2). Only a verified DaFit trainer other than the owner can (1.10). A
-- substitute becomes the session's conducted_by and its participants get "Занятие <дата> проведёт <имя>"
-- (rule 5, 1.1); an assistant's clients are told too (rule 6). Raises forbidden, not_verified, invite_not_found,
-- invite_expired, own_delegation.
create function public.accept_delegation(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_delegation public.delegations;
  v_client record;
  v_starts timestamptz;
begin
  if v_user is null or not exists (select 1 from public.trainer_profiles t where t.user_id = v_user) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.trainer_profiles t where t.user_id = v_user and t.verification_status = 'verified') then
    raise exception 'not_verified' using errcode = 'P0001';
  end if;
  v_delegation := private.pending_delegation(p_token);
  if v_delegation.owner_trainer_id = v_user then
    raise exception 'own_delegation' using errcode = 'P0001';
  end if;
  update public.delegations
  set delegate_trainer_id = v_user, status = 'active', accepted_at = pg_catalog.now(),
      starts_at = least(starts_at, pg_catalog.now()), invite_hash = null
  where id = v_delegation.id
  returning * into v_delegation;

  if v_delegation.kind = 'substitute' then
    update public.sessions set conducted_by = v_user where id = v_delegation.session_id
    returning starts_at into v_starts;
  end if;
  for v_client in select * from private.delegation_audience(v_delegation) loop
    perform private.enqueue_notification(
      'delegation',
      pg_catalog.format('delegation:%s:%s', v_delegation.id, v_client.client_id),
      pg_catalog.jsonb_build_object(
        'event', v_delegation.kind, 'delegation_id', v_delegation.id, 'coaching_id', v_client.coaching_id,
        'session_id', v_delegation.session_id, 'starts_at', v_starts,
        'delegate_name', private.delegation_person(v_user), 'owner_name', private.delegation_person(v_delegation.owner_trainer_id)),
      v_client.client_id,
      p_session_id => v_delegation.session_id);
  end loop;
  perform private.enqueue_notification(
    'delegation',
    pg_catalog.format('delegation-accepted:%s', v_delegation.id),
    pg_catalog.jsonb_build_object(
      'event', 'accepted', 'delegation_id', v_delegation.id, 'kind', v_delegation.kind,
      'session_id', v_delegation.session_id, 'starts_at', v_starts, 'delegate_name', private.delegation_person(v_user)),
    v_delegation.owner_trainer_id);
  return v_delegation.id;
end $$;
comment on function public.accept_delegation(text) is
  'A verified trainer accepts a delegation invite; access starts now and the covered clients are told (wave-3 §1).';
revoke all on function public.accept_delegation(text) from public, anon;
grant execute on function public.accept_delegation(text) to authenticated;

-- The invited trainer declines; the owner can make a new link.
create function public.decline_delegation(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delegation public.delegations;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_delegation := private.pending_delegation(p_token);
  update public.delegations set status = 'declined', invite_hash = null where id = v_delegation.id;
  perform private.enqueue_notification(
    'delegation',
    pg_catalog.format('delegation-declined:%s', v_delegation.id),
    pg_catalog.jsonb_build_object('event', 'declined', 'delegation_id', v_delegation.id, 'kind', v_delegation.kind,
                                  'session_id', v_delegation.session_id),
    v_delegation.owner_trainer_id);
end $$;
revoke all on function public.decline_delegation(text) from public, anon;
grant execute on function public.decline_delegation(text) to authenticated;

-- The owner revokes at any time; access ends at once (rule 7, 1.8). The delegate may also step down.
create function public.revoke_delegation(p_delegation_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_delegation public.delegations;
begin
  select d.* into v_delegation from public.delegations d
  where d.id = p_delegation_id and (d.owner_trainer_id = v_user or d.delegate_trainer_id = v_user)
    and d.status in ('pending', 'active')
  for update;
  if v_delegation.id is null then
    return false;
  end if;
  update public.delegations set status = 'revoked', revoked_at = pg_catalog.now(), invite_hash = null
  where id = v_delegation.id;
  if v_delegation.kind = 'substitute' then
    update public.sessions set conducted_by = null
    where id = v_delegation.session_id and conducted_by = v_delegation.delegate_trainer_id;
  end if;
  return true;
end $$;
comment on function public.revoke_delegation(uuid) is
  'The owner (or the delegate) ends a delegation; the delegate loses access at once (wave-3 §1 rule 7).';
revoke all on function public.revoke_delegation(uuid) from public, anon;
grant execute on function public.revoke_delegation(uuid) to authenticated;

-- The owner's team list and the delegate's "Делегировано мне" list in one: each row says the caller's side.
create function public.my_delegations()
returns table (
  id uuid, side text, kind public.delegation_kind, status public.delegation_status, other_id uuid, other_name text,
  session_id uuid, session_starts_at timestamptz, scopes public.delegation_scope[], all_clients boolean,
  clients integer, starts_at timestamptz, ends_at timestamptz, accepted_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id,
         case when d.owner_trainer_id = auth.uid() then 'owner' else 'delegate' end,
         d.kind,
         case when d.status = 'active' and ((d.ends_at is not null and d.ends_at <= pg_catalog.now())
                                            or (d.kind = 'substitute' and s.ends_at <= pg_catalog.now()))
              then 'expired'::public.delegation_status else d.status end,
         case when d.owner_trainer_id = auth.uid() then d.delegate_trainer_id else d.owner_trainer_id end,
         case when d.owner_trainer_id = auth.uid() then private.delegation_person(d.delegate_trainer_id)
              else private.delegation_person(d.owner_trainer_id) end,
         d.session_id, s.starts_at, d.scopes, d.all_clients,
         (select pg_catalog.count(*)::integer from public.delegation_clients dc where dc.delegation_id = d.id),
         d.starts_at, d.ends_at, d.accepted_at, d.created_at
  from public.delegations d
  left join public.sessions s on s.id = d.session_id
  where auth.uid() is not null
    and (d.owner_trainer_id = auth.uid() or (d.delegate_trainer_id = auth.uid() and d.status <> 'pending'))
  order by d.created_at desc
$$;
revoke all on function public.my_delegations() from public, anon;
grant execute on function public.my_delegations() to authenticated;

-- The client's view: who else works with them for each trainer, and whether assistants see their progress.
create function public.my_pair_delegates()
returns table (
  coaching_id uuid, kind public.delegation_kind, delegate_name text, session_starts_at timestamptz,
  ends_at timestamptz, progress_blocked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, d.kind, private.delegation_person(d.delegate_trainer_id), s.starts_at, d.ends_at,
         exists (select 1 from public.assistant_progress_blocks pb where pb.coaching_id = c.id)
  from public.coachings c
  join public.delegations d on d.owner_trainer_id = c.trainer_id and d.status = 'active'
  left join public.sessions s on s.id = d.session_id
  where c.client_id = auth.uid() and auth.uid() is not null and c.status in ('trial', 'active')
    and (d.ends_at is null or d.ends_at > pg_catalog.now())
    and case d.kind
          when 'assistant' then d.all_clients or exists (
            select 1 from public.delegation_clients dc where dc.delegation_id = d.id and dc.coaching_id = c.id)
          else s.ends_at > pg_catalog.now() and exists (
            select 1 from public.bookings b where b.session_id = s.id and b.coaching_id = c.id
              and b.status in ('requested', 'confirmed'))
        end
$$;
revoke all on function public.my_pair_delegates() from public, anon;
grant execute on function public.my_pair_delegates() to authenticated;

-- The client's switch for assistants' access to progress and nutrition (rule 6, 1.7). Returns false for a pair
-- that is not the caller's.
create function public.set_assistant_progress(p_coaching_id uuid, p_allowed boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.coachings c where c.id = p_coaching_id and c.client_id = auth.uid()) then
    return false;
  end if;
  if coalesce(p_allowed, true) then
    delete from public.assistant_progress_blocks where coaching_id = p_coaching_id;
  else
    insert into public.assistant_progress_blocks (coaching_id) values (p_coaching_id) on conflict do nothing;
  end if;
  return true;
end $$;
revoke all on function public.set_assistant_progress(uuid, boolean) from public, anon;
grant execute on function public.set_assistant_progress(uuid, boolean) to authenticated;

-- The pair's journal of delegate actions for the owner (rule 8, 1.9): booking events and workout logs a
-- delegate made, with both names.
create function public.delegate_journal(p_coaching_id uuid)
returns table (at timestamptz, action text, delegate_name text, owner_name text, booking_id uuid, workout_log_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select e.created_at, 'booking:' || e.to_status::text, private.delegation_person(e.actor_id),
         private.delegation_person(c.trainer_id), e.booking_id, null::uuid
  from public.coachings c
  join public.bookings b on b.coaching_id = c.id
  join public.booking_events e on e.booking_id = b.id and e.actor_role = 'delegate'
  where c.id = p_coaching_id and c.trainer_id = auth.uid()
  union all
  select w.created_at, 'workout_log', private.delegation_person(w.created_by), private.delegation_person(c.trainer_id),
         null::uuid, w.id
  from public.coachings c
  join public.workout_logs w on w.coaching_id = c.id and w.created_by <> c.trainer_id
  where c.id = p_coaching_id and c.trainer_id = auth.uid() and w.created_by is not null
  order by 1 desc
$$;
revoke all on function public.delegate_journal(uuid) from public, anon;
grant execute on function public.delegate_journal(uuid) to authenticated;

-- An unaccepted substitute two hours before the session: one reminder to the owner (rule 2).
create function private.queue_delegation_reminders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select d.id, d.owner_trainer_id, s.id as session_id, s.starts_at
    from public.delegations d join public.sessions s on s.id = d.session_id
    where d.kind = 'substitute' and d.status = 'pending' and d.reminded_at is null and s.status = 'scheduled'
      and s.starts_at > pg_catalog.now() and s.starts_at <= pg_catalog.now() + interval '2 hours'
    for update of d skip locked
  loop
    perform private.enqueue_notification(
      'delegation',
      pg_catalog.format('delegation-pending:%s', v_row.id),
      pg_catalog.jsonb_build_object('event', 'pending', 'delegation_id', v_row.id, 'session_id', v_row.session_id,
                                    'starts_at', v_row.starts_at),
      v_row.owner_trainer_id,
      p_session_id => v_row.session_id);
    update public.delegations set reminded_at = pg_catalog.now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function private.queue_delegation_reminders() from public;

select cron.schedule('delegation-reminders', '*/5 * * * *', 'select private.queue_delegation_reminders()');
