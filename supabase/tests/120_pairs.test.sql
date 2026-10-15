-- Pairs policies of migration 20261015123200_pairs_policies.sql (contract §1.4 file 16, §6 120_pairs):
-- coachings and its column guard, coaching_trainer_meta, data_shares and its intake guard,
-- managed_client_claims, contact_requests, and the cascades around pairs.
begin;
\ir _helpers.psql
select plan(79);

-- Fixtures: C has live pairs to A and B, D a live pair to A, E an ended pair to A, M is A's card.
-- N is a real user who joined A while A has the card, so a claim asks A whether N is M.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_n');
select tests.create_user('stranger_s');
select tests.create_admin('admin_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');
select tests.create_card('trainer_a', 'card_m');
select tests.create_pair('trainer_a', 'client_n');

create table tests.ids (name text primary key, id uuid not null);
insert into tests.ids values
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d')),
  ('pair_ae', tests.pair_id('trainer_a', 'client_e')),
  ('pair_am', tests.pair_id('trainer_a', 'card_m')),
  ('pair_an', tests.pair_id('trainer_a', 'client_n'));
grant select on tests.ids to authenticated;

create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- =========================================================================================================
-- coachings: who reads which pairs

select tests.authenticate_as('trainer_a');
select set_eq(
  $$ select id from public.coachings $$,
  array[tests.i('pair_ac'), tests.i('pair_ad'), tests.i('pair_ae'), tests.i('pair_am'), tests.i('pair_an')],
  'coachings: A reads all own pairs, the ended one and the card included'
);
select tests.authenticate_as('trainer_b');
select set_eq($$ select id from public.coachings $$, array[tests.i('pair_bc')], 'coachings: B reads only own pair, 0 of A''s');
select tests.authenticate_as('client_c');
select set_eq(
  $$ select id from public.coachings $$, array[tests.i('pair_ac'), tests.i('pair_bc')],
  'coachings: C reads only C''s pairs'
);
select tests.authenticate_as('client_d');
select set_eq($$ select id from public.coachings $$, array[tests.i('pair_ad')], 'coachings: D does not read C''s pairs');
select tests.authenticate_as('client_e');
select set_eq($$ select id from public.coachings $$, array[tests.i('pair_ae')], 'coachings: E still reads the ended pair');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.coachings $$, 'coachings: the admin reads 0 rows');
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.coachings $$, 'coachings: a stranger reads 0 rows');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.coachings $$, '42501', null, 'coachings: anon has no access');

-- Pairs come only from RPCs, so a direct insert cannot skip the Free client limit (PLAN-1).
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ insert into public.coachings (trainer_id, client_id, source) values (tests.u('trainer_a'), tests.u('stranger_s'), 'manual') $$,
  '42501', null, 'coachings: the trainer cannot insert a pair'
);
select tests.authenticate_as('stranger_s');
select throws_ok(
  $$ insert into public.coachings (trainer_id, client_id, source) values (tests.u('trainer_a'), tests.u('stranger_s'), 'client_invite') $$,
  '42501', null, 'coachings: a client cannot insert a pair'
);

-- =========================================================================================================
-- coachings: column guard (trainer vs client)

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ update public.coachings set self_book_on_debt = true, debt_limit_sessions = 2
     where id = tests.i('pair_ac') returning self_book_on_debt, debt_limit_sessions $$,
  $$ values (true, 2::smallint) $$,
  'coachings: the trainer allows booking in debt with a limit'
);
select throws_ok(
  $$ update public.coachings set client_reminder_offsets = '{30}' where id = tests.i('pair_ac') $$,
  '42501', 'forbidden', 'coachings: the trainer cannot change the client''s reminders'
);
select throws_ok(
  $$ update public.coachings set status = 'ended' where id = tests.i('pair_ac') $$,
  '42501', null, 'coachings: the trainer cannot end the pair directly'
);
select throws_ok(
  $$ update public.coachings set ended_at = now() where id = tests.i('pair_ac') $$,
  '42501', null, 'coachings: ended_at is not writable'
);
select throws_ok(
  $$ update public.coachings set client_id = tests.u('client_d') where id = tests.i('pair_ac') $$,
  '42501', null, 'coachings: client_id is not writable'
);
select throws_ok(
  $$ delete from public.coachings where id = tests.i('pair_ac') $$,
  '42501', null, 'coachings: the trainer cannot delete a pair'
);

select tests.authenticate_as('client_c');
select results_eq(
  $$ update public.coachings set client_reminder_offsets = '{120,15}' where id = tests.i('pair_ac')
     returning client_reminder_offsets $$,
  $$ values ('{120,15}'::smallint[]) $$,
  'coachings: the client changes own reminders'
);
select throws_ok(
  $$ update public.coachings set self_book_on_debt = false where id = tests.i('pair_ac') $$,
  '42501', 'forbidden', 'coachings: the client cannot change self_book_on_debt'
);
select throws_ok(
  $$ update public.coachings set debt_limit_sessions = 9 where id = tests.i('pair_ac') $$,
  '42501', 'forbidden', 'coachings: the client cannot change debt_limit_sessions'
);
select throws_ok(
  $$ update public.coachings set client_reminder_offsets = '{60,60}' where id = tests.i('pair_ac') $$,
  '23514', null, 'coachings: duplicate reminder offsets violate the check'
);
select throws_ok(
  $$ delete from public.coachings where id = tests.i('pair_ac') $$,
  '42501', null, 'coachings: the client cannot delete a pair'
);

select tests.authenticate_as('trainer_b');
select is_empty(
  $$ update public.coachings set self_book_on_debt = false where id = tests.i('pair_ac') returning 1 $$,
  'coachings: B updating A''s pair changes 0 rows'
);
select tests.authenticate_as('client_d');
select is_empty(
  $$ update public.coachings set client_reminder_offsets = '{5}' where id = tests.i('pair_ac') returning 1 $$,
  'coachings: D updating C''s pair changes 0 rows'
);
select tests.clear_authentication();
select is(
  (select row(self_book_on_debt, debt_limit_sessions, client_reminder_offsets)::text
   from public.coachings where id = tests.i('pair_ac')),
  row(true, 2, '{120,15}'::smallint[])::text,
  'coachings: only the allowed changes reached the row'
);

-- =========================================================================================================
-- coachings: constraints (as postgres, the role the RPCs run as)

select throws_ok(
  $$ insert into public.coachings (trainer_id, client_id, source) values (tests.u('trainer_a'), tests.u('trainer_a'), 'manual') $$,
  '23514', null, 'coachings: a trainer cannot be their own client'
);
select throws_ok(
  $$ insert into public.coachings (trainer_id, client_id, source) values (tests.u('trainer_a'), tests.u('client_c'), 'manual') $$,
  '23505', null, 'coachings: a second pair of the same trainer and client raises 23505'
);
select tests.create_deleted_stub();
select lives_ok(
  $$ insert into public.coachings (trainer_id, client_id, source, status, ended_at)
     values (tests.u('trainer_a'), private.deleted_client_id(), 'client_invite', 'ended', now()),
            (tests.u('trainer_a'), private.deleted_client_id(), 'manual', 'ended', now()) $$,
  'coachings: two anonymized pairs of A to the stub are allowed'
);
select throws_ok(
  $$ insert into public.coachings (trainer_id, client_id, source, status) values (tests.u('trainer_b'), tests.u('client_d'), 'manual', 'ended') $$,
  '23514', null, 'coachings: ended without ended_at violates the check'
);
update public.trainer_profiles set default_client_reminder_offsets = '{180,30}' where user_id = tests.u('trainer_b');
select tests.create_pair('trainer_b', 'client_d');
select is(
  (select client_reminder_offsets from public.coachings where id = tests.pair_id('trainer_b', 'client_d')),
  '{180,30}'::smallint[],
  'coachings: omitted reminder offsets are copied from the trainer default'
);
insert into public.client_invites (trainer_id, label) values (tests.u('trainer_b'), 'B''s link');
insert into public.trial_links (trainer_id, title, currency) values (tests.u('trainer_b'), 'B''s trial', 'RUB');
select throws_ok(
  $$ update public.coachings set client_invite_id = (select id from public.client_invites where trainer_id = tests.u('trainer_b'))
     where id = tests.i('pair_ac') $$,
  '23503', null, 'coachings: A''s pair cannot point at B''s client invite'
);
select throws_ok(
  $$ update public.coachings set trial_link_id = (select id from public.trial_links where trainer_id = tests.u('trainer_b'))
     where id = tests.i('pair_ac') $$,
  '23503', null, 'coachings: A''s pair cannot point at B''s trial link'
);

-- =========================================================================================================
-- coaching_trainer_meta (R9: trainer only)

select is(
  (select count(*)::integer from public.coaching_trainer_meta
   where coaching_id in (select id from public.coachings where trainer_id = tests.u('trainer_a'))),
  (select count(*)::integer from public.coachings where trainer_id = tests.u('trainer_a')),
  'coaching_trainer_meta: every pair got its row from the trigger'
);
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ update public.coaching_trainer_meta set client_alias = 'Cat from the morning group', archived_at = now()
     where coaching_id = tests.i('pair_ac') returning client_alias $$,
  $$ values ('Cat from the morning group'::text) $$,
  'coaching_trainer_meta: A sets an alias and archives the client'
);
select throws_ok(
  $$ update public.coaching_trainer_meta set coaching_id = tests.i('pair_ad') where coaching_id = tests.i('pair_ac') $$,
  '42501', null, 'coaching_trainer_meta: coaching_id is not writable'
);
select throws_ok(
  $$ insert into public.coaching_trainer_meta (coaching_id) values (tests.i('pair_ac')) $$,
  '42501', null, 'coaching_trainer_meta: insert raises 42501'
);
select throws_ok(
  $$ delete from public.coaching_trainer_meta where coaching_id = tests.i('pair_ac') $$,
  '42501', null, 'coaching_trainer_meta: delete raises 42501'
);
select tests.authenticate_as('client_c');
select is_empty($$ select coaching_id from public.coaching_trainer_meta $$, 'coaching_trainer_meta: C reads 0 rows, not even own pairs');
select is_empty(
  $$ update public.coaching_trainer_meta set client_alias = 'Me' where coaching_id = tests.i('pair_ac') returning 1 $$,
  'coaching_trainer_meta: C updating it changes 0 rows'
);
select tests.authenticate_as('trainer_b');
select set_eq(
  $$ select coaching_id from public.coaching_trainer_meta $$, array[tests.i('pair_bc'), tests.pair_id('trainer_b', 'client_d')],
  'coaching_trainer_meta: B reads only own pairs, 0 of A''s'
);
select tests.authenticate_as('admin_x');
select is_empty($$ select coaching_id from public.coaching_trainer_meta $$, 'coaching_trainer_meta: the admin reads 0 rows');
select tests.clear_authentication();

-- =========================================================================================================
-- data_shares (only the client writes; §4.3)

select is(
  (select row(nutrition, measurements, photos, steps, intake, workouts, intake_decided_at)::text
   from public.data_shares where coaching_id = tests.i('pair_ac')),
  row(true, true, false, true, false, true, null::timestamptz)::text,
  'data_shares: defaults share everything except photos and intake, intake not decided'
);
select is(
  (select row(nutrition, measurements, photos, steps, intake, workouts)::text || ' ' || (intake_decided_at is not null)
   from public.data_shares where coaching_id = tests.i('pair_am')),
  row(true, true, true, true, true, true)::text || ' true',
  'data_shares: a card pair shares everything and has the intake decided'
);

select tests.authenticate_as('client_c');
select set_eq(
  $$ select coaching_id from public.data_shares $$, array[tests.i('pair_ac'), tests.i('pair_bc')],
  'data_shares: C reads the shares of both own pairs'
);
select results_eq(
  $$ update public.data_shares set photos = true where coaching_id = tests.i('pair_ac') returning photos, intake_decided_at $$,
  $$ values (true, null::timestamptz) $$,
  'data_shares: C shares photos with A; the intake stays undecided'
);
select results_eq(
  $$ update public.data_shares set intake = true where coaching_id = tests.i('pair_ac') returning intake, intake_decided_at $$,
  $$ values (true, now()) $$,
  'data_shares: deciding the intake stamps intake_decided_at'
);
select results_eq(
  $$ update public.data_shares set intake_decided_at = '2020-01-01' where coaching_id = tests.i('pair_ac') returning intake_decided_at $$,
  $$ values (now()) $$,
  'data_shares: a backdated intake_decided_at is replaced with now()'
);
select throws_ok(
  $$ update public.data_shares set intake_decided_at = null where coaching_id = tests.i('pair_ac') $$,
  '42501', 'forbidden', 'data_shares: the intake decision cannot be reset to NULL'
);
select throws_ok(
  $$ update public.data_shares set coaching_id = tests.i('pair_bc') where coaching_id = tests.i('pair_ac') $$,
  '42501', null, 'data_shares: coaching_id is not writable'
);
select throws_ok(
  $$ insert into public.data_shares (coaching_id) values (tests.i('pair_ac')) $$,
  '42501', null, 'data_shares: insert raises 42501'
);
select throws_ok(
  $$ delete from public.data_shares where coaching_id = tests.i('pair_ac') $$,
  '42501', null, 'data_shares: delete raises 42501'
);

select tests.authenticate_as('trainer_a');
select ok(
  (select photos from public.data_shares where coaching_id = tests.i('pair_ac')),
  'data_shares: A reads what C shares'
);
select is_empty(
  $$ update public.data_shares set nutrition = false, photos = true where coaching_id = tests.i('pair_ad') returning 1 $$,
  'data_shares: A updating a client''s shares changes 0 rows'
);
select is_empty(
  $$ update public.data_shares set nutrition = false where coaching_id = tests.i('pair_am') returning 1 $$,
  'data_shares: nobody can update a card pair (A changes 0 rows)'
);
select tests.authenticate_as('trainer_b');
select is_empty(
  $$ select coaching_id from public.data_shares where coaching_id = tests.i('pair_ac') $$,
  'data_shares: B reads 0 rows of the A-C pair'
);
select tests.authenticate_as('client_e');
select set_eq(
  $$ select coaching_id from public.data_shares $$, array[tests.i('pair_ae')],
  'data_shares: E still reads the shares of the ended pair'
);
select tests.authenticate_as('admin_x');
select is_empty($$ select coaching_id from public.data_shares $$, 'data_shares: the admin reads 0 rows');
select tests.clear_authentication();
select is(
  (select row(nutrition, photos)::text from public.data_shares where coaching_id = tests.i('pair_ad')),
  row(true, false)::text,
  'data_shares: D''s shares are unchanged'
);

-- =========================================================================================================
-- managed_client_claims (written only by RPCs)

insert into public.managed_client_claims (trainer_id, claimant_id, new_coaching_id, managed_client_id)
values (tests.u('trainer_a'), tests.u('client_n'), tests.i('pair_an'), tests.u('card_m'));

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select claimant_id, managed_client_id, status::text from public.managed_client_claims $$,
  $$ values (tests.u('client_n'), tests.u('card_m'), 'pending'::text) $$,
  'managed_client_claims: the trainer reads the pending claim'
);
select throws_ok(
  $$ insert into public.managed_client_claims (trainer_id, claimant_id, new_coaching_id, managed_client_id)
     values (tests.u('trainer_a'), tests.u('client_d'), tests.i('pair_ad'), tests.u('card_m')) $$,
  '42501', null, 'managed_client_claims: insert raises 42501'
);
select throws_ok(
  $$ update public.managed_client_claims set status = 'merged', decided_at = now() $$,
  '42501', null, 'managed_client_claims: the trainer decides only through the RPC'
);
select tests.authenticate_as('client_n');
select is_empty($$ select id from public.managed_client_claims $$, 'managed_client_claims: the claimant reads 0 rows');
select tests.authenticate_as('trainer_b');
select is_empty($$ select id from public.managed_client_claims $$, 'managed_client_claims: B reads 0 rows');
select tests.authenticate_as('admin_x');
select is_empty($$ select id from public.managed_client_claims $$, 'managed_client_claims: the admin reads 0 rows');
select tests.clear_authentication();

-- A pending claim needs its pair: the merge RPC decides the claim before it deletes the new pair.
select throws_ok(
  $$ delete from public.coachings where id = tests.i('pair_an') $$,
  '23514', null, 'managed_client_claims: deleting the new pair of a pending claim raises 23514'
);
update public.managed_client_claims set status = 'merged', decided_at = now() where new_coaching_id = tests.i('pair_an');
select lives_ok(
  $$ delete from public.coachings where id = tests.i('pair_an') $$,
  'managed_client_claims: the new pair of a decided claim can be deleted'
);
select results_eq(
  $$ select new_coaching_id, managed_client_id, status::text from public.managed_client_claims where claimant_id = tests.u('client_n') $$,
  $$ values (null::uuid, tests.u('card_m'), 'merged'::text) $$,
  'managed_client_claims: the decided claim stays with new_coaching_id NULL'
);

-- =========================================================================================================
-- contact_requests (written only by RPCs)

insert into public.contact_requests (coaching_id, requester_id, recipient_id)
values (tests.i('pair_ac'), tests.u('client_c'), tests.u('trainer_a'));

select tests.authenticate_as('client_c');
select is((select count(*)::integer from public.contact_requests), 1, 'contact_requests: the requester reads it');
select throws_ok(
  $$ insert into public.contact_requests (coaching_id, requester_id, recipient_id)
     values (tests.i('pair_bc'), tests.u('client_c'), tests.u('trainer_b')) $$,
  '42501', null, 'contact_requests: insert raises 42501'
);
select tests.authenticate_as('trainer_a');
select is((select count(*)::integer from public.contact_requests), 1, 'contact_requests: the recipient reads it');
select throws_ok(
  $$ update public.contact_requests set status = 'accepted', responded_at = now() $$,
  '42501', null, 'contact_requests: the recipient answers only through the RPC'
);
select tests.authenticate_as('trainer_b');
select is_empty($$ select id from public.contact_requests $$, 'contact_requests: B reads 0 rows');
select tests.authenticate_as('client_d');
select is_empty($$ select id from public.contact_requests $$, 'contact_requests: another client of A reads 0 rows');
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.contact_requests $$, 'contact_requests: a stranger reads 0 rows');
select tests.clear_authentication();
select throws_ok(
  $$ insert into public.contact_requests (coaching_id, requester_id, recipient_id)
     values (tests.i('pair_ac'), tests.u('client_c'), tests.u('client_c')) $$,
  '23514', null, 'contact_requests: requester = recipient violates the check'
);

-- =========================================================================================================
-- Cascades (as postgres)

select throws_ok(
  $$ delete from public.profiles where id = tests.u('client_c') $$,
  '23503', null, 'cascades: deleting a client profile with pairs raises 23503 (pairs move to the stub first)'
);
select lives_ok(
  $$ delete from auth.users where id = tests.u('trainer_a') $$,
  'cascades: deleting A''s auth user succeeds while A has a card with a pair'
);
select is_empty(
  $$ select id from public.profiles where id in (tests.u('trainer_a'), tests.u('card_m')) $$,
  'cascades: A''s profile and A''s card are gone'
);
select is_empty(
  $$ select id from public.coachings where trainer_id = tests.u('trainer_a') $$,
  'cascades: A''s pairs are gone'
);
select is(
  (select count(*)::integer from public.coachings where trainer_id = tests.u('trainer_b')), 2,
  'cascades: B''s pairs stay'
);

select * from finish();
rollback;
