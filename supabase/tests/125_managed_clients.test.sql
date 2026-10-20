-- Clients without an account of migration 20261016200000_managed_clients.sql (PRD wave-1 §2.5-3, 3a, §2.14-3,
-- Q65): create_managed_client, get_managed_client_claim, resolve_managed_client_claim and the reason that
-- end_coaching now puts in its message.
begin;
\ir _helpers.psql
select plan(43);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('stranger_s');
select tests.grant_plan('trainer_b', 'trainer_pro');
-- Both trainers accepted the data processing agreement (20261020141737_trainer_dpa.sql); 979 tests without it.
insert into public.consents (user_id, kind, version)
select tests.user_id(h), 'trainer_dpa', '2026-10-18' from unnest(array['trainer_a', 'trainer_b']) h;

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- Ids the steps get back, by name, so steps acting as other users can use them.
create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create table tests.links (name text primary key, token text not null);
grant select, insert on tests.links to authenticated;

-- =========================================================================================================
-- create_managed_client

select tests.authenticate_as_anon();
select throws_ok($$ select public.create_managed_client('Аня') $$, '42501', null, 'create: anon cannot');
select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.create_managed_client('Аня') $$, 'P0001', 'not_a_trainer', 'create: a client cannot add a card'
);
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.create_managed_client('   ') $$, 'P0001', 'name_invalid', 'create: a blank name is refused'
);
select throws_ok(
  $$ select public.create_managed_client(repeat('x', 101)) $$, 'P0001', 'name_invalid', 'create: a name over 100 is refused'
);
select throws_ok(
  $$ select public.create_managed_client('Аня', repeat('x', 201)) $$, 'P0001', 'contact_too_long',
  'create: a contact over 200 is refused'
);
select throws_ok(
  $$ select public.create_managed_client('Аня', null, repeat('x', 5001)) $$, 'P0001', 'note_too_long',
  'create: a note over 5000 is refused'
);
insert into tests.ids values ('anya_pair', public.create_managed_client('  Аня  ', '+7 900 000-00-00', 'Колено'));
insert into tests.ids values ('boris_pair', public.create_managed_client('Борис'));
select tests.clear_authentication();
insert into tests.ids select 'anya', client_id from public.coachings where id = tests.id('anya_pair');
insert into tests.ids select 'boris', client_id from public.coachings where id = tests.id('boris_pair');
-- Registered as handles, so the fixture helpers can add history to the cards.
insert into tests.users (handle, id, telegram_id) values ('card_anya', tests.id('anya'), null), ('card_boris', tests.id('boris'), null);

select results_eq(
  $$ select first_name, telegram_id, managed_by_trainer_id from public.profiles where id = tests.id('anya') $$,
  $$ values ('Аня'::text, null::bigint, tests.u('trainer_a')) $$,
  'create: the card has the trimmed name, no Telegram id and is kept by the trainer'
);
select ok(
  (select banned_until = 'infinity' and email = 'managed-' || id || '@users.fit.invalid'
   from auth.users where id = tests.id('anya')),
  'create: the card cannot sign in'
);
select results_eq(
  $$ select trainer_id, status::text, source::text from public.coachings where id = tests.id('anya_pair') $$,
  $$ values (tests.u('trainer_a'), 'active', 'manual') $$,
  'create: the pair is active with source manual'
);
select ok(
  (select measurements and photos and intake and workouts from public.data_shares where coaching_id = tests.id('anya_pair')),
  'create: every data category of a card is shared'
);
select is(
  (select contact from public.coaching_trainer_meta where coaching_id = tests.id('anya_pair')), '+7 900 000-00-00',
  'create: the contact lands in the pair meta'
);
select results_eq(
  $$ select body, visible_to_client, author_id from public.coaching_notes where coaching_id = tests.id('anya_pair') $$,
  $$ values ('Колено'::text, false, tests.u('trainer_a')) $$,
  'create: the note is the trainer''s and hidden from the client'
);
select is(
  (select count(*)::int from public.coaching_notes where coaching_id = tests.id('boris_pair')), 0,
  'create: no note without one'
);

-- Only the trainer sees the card.
select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.profiles where id = tests.id('anya')), 1, 'rls: the trainer sees the card');
select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.profiles where id = tests.id('anya')), 0, 'rls: another trainer does not');
select is((select count(*)::int from public.coachings where id = tests.id('anya_pair')), 0, 'rls: nor its pair');
select tests.authenticate_as('stranger_s');
select is((select count(*)::int from public.profiles where id = tests.id('anya')), 0, 'rls: a stranger does not');

-- Cards count towards the Free limit (PLAN-1).
select tests.authenticate_as('trainer_a');
insert into tests.ids values ('vera_pair', public.create_managed_client('Вера'));
select throws_ok(
  $$ select public.create_managed_client('Гриша') $$, 'P0001', 'plan_limit_reached',
  'create: a Free trainer with 3 live clients gets no 4th card'
);
select tests.authenticate_as('trainer_b');
select lives_ok(
  $$ insert into tests.ids values ('b_card_pair', public.create_managed_client('Дина')) $$,
  'create: a Pro trainer adds cards without a limit'
);
select tests.clear_authentication();

-- History of Anya's card: a session she attended, a pass with its ledger row, a weight.
insert into tests.ids values ('anya_session', tests.create_session('trainer_a', now() - interval '3 days'));
insert into tests.ids values (
  'anya_booking', tests.create_booking(tests.id('anya_session'), 'trainer_a', 'card_anya', 'attended')
);
insert into tests.ids values ('anya_pass', tests.create_pass('trainer_a', 'card_anya', 8));
insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by)
values (tests.id('anya'), 'weight', 61.5, now() - interval '3 days', current_date - 3, tests.u('trainer_a'));

-- =========================================================================================================
-- A person comes by link: the claim (PLAN-9 lets the join through at the limit)

select tests.authenticate_as('trainer_a');
insert into tests.links select 'a', token from public.my_client_invite();
select tests.authenticate_as('trainer_b');
insert into tests.links select 'b', token from public.my_client_invite();

select tests.authenticate_as('client_c');
insert into tests.ids select 'c_new_pair', public.join_by_invite((select token from tests.links where name = 'a'));
select tests.clear_authentication();
insert into tests.ids select 'claim_c', id from public.managed_client_claims where new_coaching_id = tests.id('c_new_pair');

select tests.authenticate_as('trainer_b');
select throws_ok(
  format('select public.get_managed_client_claim(%L)', tests.id('claim_c')), 'P0001', 'claim_not_found',
  'claim: another trainer cannot read it'
);
select tests.authenticate_as('client_c');
select throws_ok(
  format('select public.get_managed_client_claim(%L)', tests.id('claim_c')), 'P0001', 'claim_not_found',
  'claim: nor can the person who came'
);

select tests.authenticate_as('trainer_a');
select results_eq(
  format($$ select c ->> 'status', (c ->> 'limit_full')::boolean, c -> 'person' ->> 'first_name',
                   jsonb_array_length(c -> 'cards')
            from public.get_managed_client_claim(%L) c $$, tests.id('claim_c')),
  $$ values ('pending'::text, true, 'client_c'::text, 3) $$,
  'claim: pending, the person, three cards, and a full Free plan'
);
select results_eq(
  format($$ select k ->> 'name', (k ->> 'sessions')::int, (k ->> 'passes')::int, (k ->> 'notes')::int,
                   (k ->> 'measurements')::int
            from public.get_managed_client_claim(%L) c, jsonb_array_elements(c -> 'cards') k
            where (k ->> 'id')::uuid = %L $$, tests.id('claim_c'), tests.id('anya')),
  $$ values ('Аня'::text, 1, 1, 1, 1) $$,
  'claim: a card shows what a merge carries over'
);

-- =========================================================================================================
-- resolve_managed_client_claim: merge

select tests.authenticate_as('trainer_b');
select throws_ok(
  format('select public.resolve_managed_client_claim(%L, %L)', tests.id('claim_c'), tests.id('anya')),
  'P0001', 'claim_not_found', 'merge: another trainer cannot answer'
);
select tests.authenticate_as('trainer_a');
select throws_ok(
  format('select public.resolve_managed_client_claim(%L, %L)', tests.id('claim_c'), tests.u('client_d')),
  'P0001', 'card_not_found', 'merge: only a card of the trainer can be picked'
);
select throws_ok(
  format('select public.resolve_managed_client_claim(%L, %L)', tests.id('claim_c'), tests.id('b_card_pair')),
  'P0001', 'card_not_found', 'merge: a pair id is not a card'
);
select is(
  public.resolve_managed_client_claim(tests.id('claim_c'), tests.id('anya')), tests.id('anya_pair'),
  'merge: returns the card pair'
);
select throws_ok(
  format('select public.resolve_managed_client_claim(%L)', tests.id('claim_c')),
  'P0001', 'claim_decided', 'merge: a decided claim cannot be answered again'
);
select tests.clear_authentication();

select results_eq(
  $$ select status::text, managed_client_id, decided_at is not null from public.managed_client_claims
     where id = tests.id('claim_c') $$,
  $$ values ('merged'::text, null::uuid, true) $$,
  'merge: the claim is merged (the card id is gone with the card)'
);
select results_eq(
  $$ select client_id, status::text, source::text from public.coachings where id = tests.id('anya_pair') $$,
  $$ values (tests.u('client_c'), 'active', 'manual') $$,
  'merge: the card pair is now the person''s, with its source kept'
);
select is_empty(
  $$ select 1 from public.coachings where id = tests.id('c_new_pair') $$, 'merge: the new pair is gone'
);
select is_empty(
  $$ select 1 from auth.users where id = tests.id('anya') union all select 1 from public.profiles where id = tests.id('anya') $$,
  'merge: the card is deleted'
);
select results_eq(
  $$ select (select client_id from public.bookings where id = tests.id('anya_booking')),
            (select client_id from public.passes where id = tests.id('anya_pass')),
            (select count(*)::int from public.ledger_entries where coaching_id = tests.id('anya_pair') and client_id = tests.u('client_c')),
            (select count(*)::int from public.measurements where client_id = tests.u('client_c')),
            (select count(*)::int from public.coaching_notes where coaching_id = tests.id('anya_pair')) $$,
  $$ values (tests.u('client_c'), tests.u('client_c'), 1, 1, 1) $$,
  'merge: bookings, passes, the ledger, measurements and notes moved to the person'
);
select ok(
  (select measurements and workouts and not photos and not intake and intake_decided_at is null
   from public.data_shares where coaching_id = tests.id('anya_pair')),
  'merge: data shares go back to the client''s defaults'
);
select tests.authenticate_as('client_c');
select is(
  (select count(*)::int from public.coachings where trainer_id = tests.u('trainer_a')), 1,
  'merge: the person sees one pair with the trainer'
);
select tests.clear_authentication();

-- =========================================================================================================
-- resolve_managed_client_claim: a new client

-- Free and full: the new pair closes with plan_limit_reached and the person hears why (К12).
select tests.authenticate_as('client_d');
insert into tests.ids select 'd_new_pair', public.join_by_invite((select token from tests.links where name = 'a'));
select tests.clear_authentication();
insert into tests.ids select 'claim_d', id from public.managed_client_claims where new_coaching_id = tests.id('d_new_pair');
select tests.authenticate_as('trainer_a');
select is(
  public.resolve_managed_client_claim(tests.id('claim_d')), tests.id('d_new_pair'),
  'new client: returns the new pair'
);
select tests.clear_authentication();
select results_eq(
  $$ select status::text, end_reason from public.coachings where id = tests.id('d_new_pair') $$,
  $$ values ('ended'::text, 'plan_limit_reached'::text) $$,
  'new client: on a full Free plan the new pair ends with plan_limit_reached'
);
select results_eq(
  $$ select payload ->> 'reason', payload ->> 'ended_by' from public.notification_outbox
     where user_id = tests.u('client_d') and type = 'coaching_ended' $$,
  $$ values ('plan_limit_reached'::text, 'trainer'::text) $$,
  'new client: the person gets coaching_ended with the reason'
);
select is(
  (select status::text from public.managed_client_claims where id = tests.id('claim_d')), 'rejected',
  'new client: the claim is rejected'
);
select is(
  (select count(*)::int from public.profiles where managed_by_trainer_id = tests.u('trainer_a')), 2,
  'new client: the cards stay'
);
select tests.authenticate_as('trainer_a');
select throws_ok(
  format('select public.resolve_managed_client_claim(%L, %L)', tests.id('claim_d'), tests.id('boris')),
  'P0001', 'claim_decided', 'new client: the answer cannot be changed to a merge'
);
select tests.clear_authentication();

-- Pro: the new pair stays.
select tests.authenticate_as('client_e');
insert into tests.ids select 'e_new_pair', public.join_by_invite((select token from tests.links where name = 'b'));
select tests.clear_authentication();
insert into tests.ids select 'claim_e', id from public.managed_client_claims where new_coaching_id = tests.id('e_new_pair');
select tests.authenticate_as('trainer_b');
select lives_ok(
  format('select public.resolve_managed_client_claim(%L)', tests.id('claim_e')), 'new client: a Pro trainer answers'
);
select tests.clear_authentication();
select is(
  (select status::text from public.coachings where id = tests.id('e_new_pair')), 'active',
  'new client: with Pro the new pair stays'
);

select * from finish();
rollback;
