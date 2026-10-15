-- RLS helper predicates of migration 20261015122000_rls_helpers.sql (contract §2, §6 020_rls_helpers).
-- Helpers are called as postgres with tests.set_claims, so auth.uid() is the user under test; the anonymous
-- caller is postgres with no claims (auth.uid() is NULL). is() compares with IS NOT DISTINCT FROM, so an
-- expected false also fails on NULL.
begin;
\ir _helpers.psql
select plan(118);

-- Fixtures: C has a live pair to A and a trial pair to B, D a live pair to A, E an ended pair to A.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_admin('admin_x');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c', 'trial');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');

-- A group session of A with C attended and D cancelled; a session of B with nobody booked.
create table tests.ids (name text primary key, id uuid not null);
insert into tests.ids values
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d')),
  ('pair_ae', tests.pair_id('trainer_a', 'client_e')),
  ('session_a', tests.create_session('trainer_a', now() - interval '1 day', 'group', 5)),
  ('session_b', tests.create_session('trainer_b', now() + interval '1 day'));
-- Fixture ids are stored first: a volatile call in an UPDATE's WHERE runs per scanned row, and the
-- UPDATE cannot see the row the call inserts.
insert into tests.ids values
  ('booking_c', tests.create_booking((select id from tests.ids where name = 'session_a'), 'trainer_a', 'client_c', 'attended')),
  ('booking_d', tests.create_booking((select id from tests.ids where name = 'session_a'), 'trainer_a', 'client_d'));
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'client'
where id = (select id from tests.ids where name = 'booking_d');

create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- Categories the caller may view for the client, in enum order. The policies on large tables use the array
-- form viewable_client_ids; when it disagrees with can_view for any category, this returns NULL, so every
-- assertion below checks both helpers at once.
create function tests.viewable(p_client text) returns public.share_category[] language sql stable set search_path = '' as $$
  select case
    when bool_and((tests.user_id(p_client) = any (private.viewable_client_ids(c))) = private.can_view(tests.user_id(p_client), c))
      then coalesce(array_agg(c order by c) filter (where private.can_view(tests.user_id(p_client), c)), '{}')
  end
  from unnest(enum_range(null::public.share_category)) c
$$;

-- Shares exactly one category of the pair, as postgres.
create function tests.share_only(p_trainer text, p_client text, p_category public.share_category)
returns void language plpgsql set search_path = '' as $$
declare
  c public.share_category;
begin
  foreach c in array enum_range(null::public.share_category) loop
    perform tests.set_share(p_trainer, p_client, c, c = p_category);
  end loop;
end;
$$;

create function tests.sorted(p_ids uuid[]) returns uuid[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) x
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Catalog: every helper exists, is a stable definer owned by postgres with an empty search_path, and only
-- authenticated and service_role may execute it.
create table tests.helpers (sig text primary key, fn regprocedure);
insert into tests.helpers (sig) values
  ('private.is_admin()'),
  ('private.is_trainer()'),
  ('private.is_coaching_client(uuid)'),
  ('private.is_coaching_trainer(uuid, public.delegation_scope)'),
  ('private.is_coaching_member(uuid)'),
  ('private.is_live_coaching(uuid)'),
  ('private.is_trainer_of(uuid, public.delegation_scope)'),
  ('private.can_view(uuid, public.share_category)'),
  ('private.acts_for_trainer(uuid, public.delegation_scope)'),
  ('private.can_manage_session(uuid, public.delegation_scope)'),
  ('private.is_session_participant(uuid)'),
  ('private.trainer_ids_visible(boolean)'),
  ('private.pair_partner_ids()'),
  ('private.attended_count(uuid)'),
  ('private.own_logged_exercise_ids()'),
  ('private.trainer_coaching_ids(public.delegation_scope[])'),
  ('private.acting_trainer_ids(public.delegation_scope[])'),
  ('private.client_trainer_ids(boolean)'),
  ('private.own_booked_session_ids()'),
  ('private.viewable_client_ids(public.share_category)');
update tests.helpers set fn = to_regprocedure(sig);

select is(
  array(select sig from tests.helpers where fn is null order by sig), '{}'::text[],
  'every RLS helper exists with the contract signature'
);
select is(
  array(select h.sig from tests.helpers h join pg_proc p on p.oid = h.fn where not p.prosecdef order by 1), '{}'::text[],
  'every RLS helper is security definer'
);
select is(
  array(select h.sig from tests.helpers h join pg_proc p on p.oid = h.fn
        where p.proconfig is distinct from array['search_path=""'] order by 1), '{}'::text[],
  'every RLS helper has search_path="" and no other setting'
);
select is(
  array(select h.sig from tests.helpers h join pg_proc p on p.oid = h.fn where p.provolatile <> 's' order by 1), '{}'::text[],
  'every RLS helper is stable'
);
select is(
  array(select h.sig from tests.helpers h join pg_proc p on p.oid = h.fn
        where p.proowner <> 'postgres'::regrole order by 1), '{}'::text[],
  'every RLS helper is owned by postgres'
);
select is(
  array(select h.sig from tests.helpers h where has_function_privilege('anon', h.fn, 'execute') order by 1), '{}'::text[],
  'anon may execute no RLS helper'
);
select is(
  array(select h.sig from tests.helpers h where has_function_privilege('public', h.fn, 'execute') order by 1), '{}'::text[],
  'PUBLIC may execute no RLS helper'
);
select is(
  array(select h.sig from tests.helpers h where not has_function_privilege('authenticated', h.fn, 'execute') order by 1),
  '{}'::text[],
  'authenticated may execute every RLS helper'
);
select is(
  array(select h.sig from tests.helpers h where not has_function_privilege('service_role', h.fn, 'execute') order by 1),
  '{}'::text[],
  'service_role may execute every RLS helper'
);
select is(
  array(select h.sig from tests.helpers h where obj_description(h.fn, 'pg_proc') is null order by 1), '{}'::text[],
  'every RLS helper has a comment'
);

-- A policy reaches a helper by OID, so authenticated needs EXECUTE but no USAGE on schema private.
create table tests.rls_probe (id integer primary key);
alter table tests.rls_probe enable row level security;
create policy "rls_probe: trainers read" on tests.rls_probe for select to authenticated using (private.is_trainer());
grant select on tests.rls_probe to authenticated;
insert into tests.rls_probe values (1);

select tests.authenticate_as('trainer_a');
select is((select count(*)::integer from tests.rls_probe), 1, 'a policy calling a helper works for authenticated');
select throws_ok($$ select private.is_trainer() $$, '42501', null,
  'authenticated cannot call a helper by name (no USAGE on schema private)');
select tests.authenticate_as('stranger_s');
select is((select count(*)::integer from tests.rls_probe), 0, 'the same policy hides the row from a non-trainer');
select tests.authenticate_as_anon();
select throws_ok($$ select private.is_admin() $$, '42501', null, 'anon cannot call a helper');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------------------
-- Anonymous caller (no JWT): false, never NULL; set helpers return no rows.
select is(private.is_admin(), false, 'anonymous: is_admin is false');
select is(private.is_trainer(), false, 'anonymous: is_trainer is false');
select is(private.is_coaching_client(tests.i('pair_ac')), false, 'anonymous: is_coaching_client is false');
select is(private.is_coaching_trainer(tests.i('pair_ac')), false, 'anonymous: is_coaching_trainer is false');
select is(private.is_coaching_member(tests.i('pair_ac')), false, 'anonymous: is_coaching_member is false');
select is(private.is_trainer_of(tests.u('client_c')), false, 'anonymous: is_trainer_of is false');
select is(private.can_view(tests.u('client_c'), 'measurements'), false, 'anonymous: can_view is false');
select is(private.can_view(null, 'measurements'), false, 'anonymous: can_view of a NULL client is false, not NULL');
select is(private.acts_for_trainer(tests.u('trainer_a')), false, 'anonymous: acts_for_trainer is false');
select is(private.acts_for_trainer(null), false, 'anonymous: acts_for_trainer of NULL is false, not NULL');
select is(private.can_manage_session(tests.i('session_a')), false, 'anonymous: can_manage_session is false');
select is(private.is_session_participant(tests.i('session_a')), false, 'anonymous: is_session_participant is false');
select is_empty($$ select private.trainer_ids_visible() $$, 'anonymous: trainer_ids_visible returns no rows');
select is_empty($$ select private.pair_partner_ids() $$, 'anonymous: pair_partner_ids returns no rows');
select ok(
  private.trainer_coaching_ids() = '{}' and private.acting_trainer_ids() = '{}' and private.client_trainer_ids() = '{}'
    and private.own_booked_session_ids() = '{}' and private.viewable_client_ids('photos') = '{}',
  'anonymous: the array helpers return empty arrays, never NULL'
);

-- Helpers that do not look at the caller.
select is(private.is_live_coaching(tests.i('pair_ac')), true, 'is_live_coaching: an active pair is live');
select is(private.is_live_coaching(tests.i('pair_bc')), true, 'is_live_coaching: a trial pair is live');
select is(private.is_live_coaching(tests.i('pair_ae')), false, 'is_live_coaching: an ended pair is not live');
select is(private.is_live_coaching(gen_random_uuid()), false, 'is_live_coaching: an unknown pair is false');
select is(private.is_live_coaching(null), false, 'is_live_coaching: NULL is false, not NULL');
select is(private.attended_count(tests.i('pair_ac')), 1, 'attended_count: one attended booking, whoever asks');
select is(
  (select status::text from public.bookings where id = tests.i('booking_d')), 'cancelled',
  'fixture: D''s booking is cancelled'
);
select is(private.attended_count(tests.i('pair_ad')), 0, 'attended_count: a cancelled booking does not count');
select is(private.attended_count(gen_random_uuid()), 0, 'attended_count: an unknown pair counts 0');

-- ---------------------------------------------------------------------------------------------------------
-- Trainer A, the owner trainer.
select tests.set_claims('trainer_a');
select is(private.is_admin(), false, 'trainer: is_admin is false');
select is(private.is_trainer(), true, 'trainer: is_trainer is true');
select is(private.is_coaching_client(tests.i('pair_ac')), false, 'trainer: is_coaching_client of own pair is false');
select is(private.is_coaching_trainer(tests.i('pair_ac')), true, 'trainer: is_coaching_trainer of own pair is true');
select is(private.is_coaching_trainer(tests.i('pair_ac'), 'schedule'), true, 'trainer: the scope argument is ignored in wave 1');
select is(private.is_coaching_trainer(tests.i('pair_bc')), false, 'trainer: is_coaching_trainer of another trainer''s pair is false');
select is(private.is_coaching_member(tests.i('pair_ac')), true, 'trainer: is_coaching_member of own pair is true');
select is(private.is_coaching_member(tests.i('pair_bc')), false, 'trainer: is_coaching_member of another trainer''s pair is false');
select is(private.is_trainer_of(tests.u('client_c')), true, 'trainer: is_trainer_of a live client is true');
select is(private.is_trainer_of(tests.u('stranger_s')), false, 'trainer: is_trainer_of a stranger is false');
select is(private.is_trainer_of(null), false, 'trainer: is_trainer_of NULL is false, not NULL');
select is(private.is_trainer_of(tests.u('client_e')), false, 'trainer: is_trainer_of is false for an ended pair');
select is(private.is_coaching_trainer(tests.i('pair_ae')), true, 'trainer: is_coaching_trainer stays true for an ended pair');
select is(private.is_coaching_member(tests.i('pair_ae')), true, 'trainer: is_coaching_member stays true for an ended pair');
select is(private.acts_for_trainer(tests.u('trainer_a')), true, 'trainer: acts_for_trainer of self is true');
select is(private.acts_for_trainer(tests.u('trainer_b')), false, 'trainer: acts_for_trainer of another trainer is false');
select is(private.can_manage_session(tests.i('session_a')), true, 'trainer: can_manage_session of own session is true');
select is(private.can_manage_session(tests.i('session_b')), false, 'trainer: can_manage_session of another trainer''s session is false');
select is(private.is_session_participant(tests.i('session_a')), false, 'trainer: is_session_participant of own session is false');
select is_empty($$ select private.trainer_ids_visible() $$, 'trainer: trainer_ids_visible is empty without pairs as a client');
select is(
  tests.sorted(private.trainer_coaching_ids('{schedule,attendance}')),
  tests.sorted(array[tests.i('pair_ac'), tests.i('pair_ad'), tests.i('pair_ae')]),
  'trainer: trainer_coaching_ids lists every own pair, the ended one too, never B''s'
);
select is(private.acting_trainer_ids('{schedule}'), array[tests.u('trainer_a')], 'trainer: acting_trainer_ids is the trainer');
select is(private.own_booked_session_ids(), '{}'::uuid[], 'trainer: own_booked_session_ids is empty without own bookings');
select is(
  tests.sorted(array(select private.pair_partner_ids())),
  tests.sorted(array[tests.u('client_c'), tests.u('client_d'), tests.u('client_e')]),
  'trainer: pair_partner_ids lists every client of the trainer, ended pairs too'
);

-- can_view follows each data_shares flag of a live pair.
select is(tests.viewable('client_c'), '{nutrition,measurements,steps,workouts}'::public.share_category[],
  'can_view: a new pair shares everything except photos and intake');
select tests.share_only('trainer_a', 'client_c', 'nutrition');
select is(tests.viewable('client_c'), '{nutrition}'::public.share_category[], 'can_view follows the nutrition flag alone');
select tests.share_only('trainer_a', 'client_c', 'measurements');
select is(tests.viewable('client_c'), '{measurements}'::public.share_category[], 'can_view follows the measurements flag alone');
select tests.share_only('trainer_a', 'client_c', 'photos');
select is(tests.viewable('client_c'), '{photos}'::public.share_category[], 'can_view follows the photos flag alone');
select tests.share_only('trainer_a', 'client_c', 'steps');
select is(tests.viewable('client_c'), '{steps}'::public.share_category[], 'can_view follows the steps flag alone');
select tests.share_only('trainer_a', 'client_c', 'intake');
select is(tests.viewable('client_c'), '{intake}'::public.share_category[], 'can_view follows the intake flag alone');
select tests.share_only('trainer_a', 'client_c', 'workouts');
select is(tests.viewable('client_c'), '{workouts}'::public.share_category[], 'can_view follows the workouts flag alone');
select tests.share_only('trainer_a', 'client_e', 'photos');
select tests.set_share('trainer_a', 'client_e', 'measurements', true);
select is(tests.viewable('client_e'), '{}'::public.share_category[], 'can_view: the trainer of an ended pair sees nothing');
select is(tests.viewable('stranger_s'), '{}'::public.share_category[], 'can_view: the trainer sees nothing of a stranger');

-- Trainer B: the trial pair counts as live; B does not see through A's pair.
select tests.set_claims('trainer_b');
select is(private.is_trainer_of(tests.u('client_c')), true, 'trainer B: is_trainer_of a trial client is true');
select is(tests.viewable('client_c'), '{nutrition,measurements,steps,workouts}'::public.share_category[],
  'trainer B: can_view uses the flags of B''s own pair, not A''s');
select is(private.is_trainer_of(tests.u('client_d')), false, 'trainer B: is_trainer_of A''s client is false');

-- ---------------------------------------------------------------------------------------------------------
-- Client C.
select tests.set_claims('client_c');
select is(private.is_trainer(), false, 'client: is_trainer is false');
select is(private.is_coaching_client(tests.i('pair_ac')), true, 'client: is_coaching_client of own pair is true');
select is(private.is_coaching_client(tests.i('pair_ad')), false, 'client: is_coaching_client of another client''s pair is false');
select is(private.is_coaching_trainer(tests.i('pair_ac')), false, 'client: is_coaching_trainer of own pair is false');
select is(private.is_coaching_member(tests.i('pair_ac')), true, 'client: is_coaching_member of own pair is true');
select is(private.is_coaching_member(tests.i('pair_ad')), false, 'client: is_coaching_member of another client''s pair is false');
select is(private.is_trainer_of(tests.u('client_c')), false, 'client: is_trainer_of self is false');
select is(private.acts_for_trainer(tests.u('trainer_a')), false, 'client: acts_for_trainer of the trainer is false');
select is(private.can_manage_session(tests.i('session_a')), false, 'client: can_manage_session is false');
select is(private.is_session_participant(tests.i('session_a')), true, 'client: is_session_participant with an attended booking is true');
select is(private.is_session_participant(tests.i('session_b')), false, 'client: is_session_participant without a booking is false');
select is(tests.viewable('client_c'), enum_range(null::public.share_category), 'client: can_view of own data is true for every category');
select is(tests.viewable('client_d'), '{}'::public.share_category[], 'client: can_view of another client is false');
select is(
  tests.sorted(array(select private.trainer_ids_visible())),
  tests.sorted(array[tests.u('trainer_a'), tests.u('trainer_b')]),
  'client: trainer_ids_visible lists both trainers'
);
select is(
  tests.sorted(array(select private.pair_partner_ids())),
  tests.sorted(array[tests.u('trainer_a'), tests.u('trainer_b')]),
  'client: pair_partner_ids lists both trainers'
);
select is(private.trainer_coaching_ids(), '{}'::uuid[], 'client: trainer_coaching_ids is empty for a client');
select is(private.own_booked_session_ids(), array[tests.i('session_a')], 'client: own_booked_session_ids lists the booked session');
select is(
  tests.sorted(private.client_trainer_ids()), tests.sorted(array(select private.trainer_ids_visible())),
  'client: client_trainer_ids is trainer_ids_visible as an array'
);

-- Client D: a cancelled booking still makes a participant.
select tests.set_claims('client_d');
select is(private.is_session_participant(tests.i('session_a')), true, 'client: is_session_participant with a cancelled booking is true');
select is(private.own_booked_session_ids(), array[tests.i('session_a')], 'client: own_booked_session_ids counts a cancelled booking too');

-- Client E: the ended pair.
select tests.set_claims('client_e');
select is(private.is_coaching_client(tests.i('pair_ae')), true, 'client: is_coaching_client stays true for an ended pair');
select is(
  array(select private.trainer_ids_visible()), array[tests.u('trainer_a')],
  'client: trainer_ids_visible() includes the trainer of an ended pair'
);
select is_empty($$ select private.trainer_ids_visible(true) $$, 'client: trainer_ids_visible(true) excludes an ended pair');
select ok(
  private.client_trainer_ids() = array[tests.u('trainer_a')] and private.client_trainer_ids(true) = '{}',
  'client: client_trainer_ids keeps the ended pair''s trainer, client_trainer_ids(true) does not'
);
select is(array(select private.pair_partner_ids()), array[tests.u('trainer_a')], 'client: pair_partner_ids includes an ended pair');

-- ---------------------------------------------------------------------------------------------------------
-- Stranger S.
select tests.set_claims('stranger_s');
select is(private.is_admin(), false, 'stranger: is_admin is false');
select is(private.is_trainer(), false, 'stranger: is_trainer is false');
select is(private.is_coaching_client(tests.i('pair_ac')), false, 'stranger: is_coaching_client is false');
select is(private.is_coaching_trainer(tests.i('pair_ac')), false, 'stranger: is_coaching_trainer is false');
select is(private.is_coaching_member(tests.i('pair_ac')), false, 'stranger: is_coaching_member is false');
select is(private.is_trainer_of(tests.u('client_c')), false, 'stranger: is_trainer_of is false');
select is(tests.viewable('client_c'), '{}'::public.share_category[], 'stranger: can_view is false for every category');
select is(private.can_manage_session(tests.i('session_a')), false, 'stranger: can_manage_session is false');
select is(private.is_session_participant(tests.i('session_a')), false, 'stranger: is_session_participant is false');
select is_empty($$ select private.pair_partner_ids() $$, 'stranger: pair_partner_ids returns no rows');

-- ---------------------------------------------------------------------------------------------------------
-- Admin X: break-glass only with a matching, unrevoked, unexpired grant, and only while still an admin.
select tests.set_claims('admin_x');
select is(private.is_admin(), true, 'admin: is_admin is true');
select is(tests.viewable('client_c'), '{}'::public.share_category[], 'admin: can_view is false without a grant');

select tests.create_break_glass('admin_x', 'client_c', '{photos,intake}');
select is(tests.viewable('client_c'), '{photos,intake}'::public.share_category[],
  'admin: a live grant opens exactly the listed categories');

select tests.create_break_glass('admin_x', 'client_d', '{photos}', now() - interval '1 minute', now() - interval '1 hour');
select is(tests.viewable('client_d'), '{}'::public.share_category[], 'admin: an expired grant opens nothing');

insert into tests.ids values ('grant_e', tests.create_break_glass('admin_x', 'client_e', '{photos}'));
update public.break_glass_grants set revoked_at = now() where id = tests.i('grant_e');
select is(
  (select count(*)::integer from public.break_glass_grants where target_user_id = tests.u('client_e') and revoked_at is not null),
  1, 'fixture: the grant on E is revoked'
);
select is(tests.viewable('client_e'), '{}'::public.share_category[], 'admin: a revoked grant opens nothing');

select tests.set_claims('stranger_s');
select is(tests.viewable('client_c'), '{}'::public.share_category[], 'can_view: another user''s grant opens nothing');

select tests.set_claims('admin_x');
delete from public.user_roles where user_id = tests.u('admin_x');
select is(private.is_admin(), false, 'admin: is_admin is false once the role is removed');
select is(tests.viewable('client_c'), '{}'::public.share_category[], 'admin: a live grant opens nothing once the role is removed');

select tests.clear_authentication();
select * from finish();
rollback;
