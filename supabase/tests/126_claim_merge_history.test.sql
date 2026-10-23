-- «Объединить» with a history on both sides (migration 20261023054219_claim_merge_keys.sql, PRD 2.5-3a): the card
-- has two passes and a past session, the person late-cancelled a booking and the trainer waived the charge. The
-- merge used to fail on the ledger row that points at its booking by (id, coaching_id).
begin;
\ir _helpers.psql
select plan(4);
select tests.create_trainer('trainer_a');
insert into public.consents (user_id, kind, version) values (tests.user_id('trainer_a'), 'trainer_dpa', '2026-10-18');
select tests.create_user('client_t');
create table tests.kv (name text primary key, id uuid);
grant all on tests.kv to authenticated;
create table tests.tok (token text);
grant all on tests.tok to authenticated;

select tests.authenticate_as('trainer_a');
insert into tests.kv values ('card_pair', public.create_managed_client('ТонРу', null, 'заметка'));
select public.create_pass((select id from tests.kv where name='card_pair'), null, 'Восемь', 8, 800000, 'RUB', 30, null, current_date, null, 400000, 'cash', now(), gen_random_uuid());
select public.create_pass((select id from tests.kv where name='card_pair'), null, 'Четыре', 4, 400000, 'RUB', 30, null, current_date, null, 400000, 'card', now(), gen_random_uuid());
select public.record_past_session((select id from tests.kv where name='card_pair'), now() - interval '2 days', 60::smallint, 'offline', null, 'attended', null);
insert into tests.tok select token from public.my_client_invite();
select tests.authenticate_as('client_t');
insert into tests.kv values ('new_pair', public.join_by_invite((select token from tests.tok)));
select tests.clear_authentication();
insert into tests.kv values ('s3', tests.create_session('trainer_a', now() + interval '2 hours'));
insert into tests.kv values ('b3', tests.create_booking((select id from tests.kv where name='s3'), 'trainer_a', 'client_t', 'confirmed'));
select tests.authenticate_as('client_t');
select public.cancel_my_booking((select id from tests.kv where name='b3'), 'не успеваю', true);
select tests.authenticate_as('trainer_a');
select public.waive_charge((select id from public.ledger_entries where coaching_id = (select id from tests.kv where name='new_pair') and entry_type::text ~ 'charge' limit 1), 'прощаю');
select lives_ok(format('select public.resolve_managed_client_claim(%L, %L)',
  (select id from public.managed_client_claims where new_coaching_id = (select id from tests.kv where name='new_pair')),
  (select client_id from public.coachings where id = (select id from tests.kv where name='card_pair'))), 'merge');
select tests.clear_authentication();
select is(
  (select status::text from public.managed_client_claims where claimant_id = tests.user_id('client_t')),
  'merged', 'the claim is merged'
);
select results_eq(
  $$ select count(*)::int from public.bookings where coaching_id = (select id from tests.kv where name='card_pair') $$,
  $$ values (2) $$, 'the card''s past session and the person''s cancelled booking are on one pair'
);
select is(
  (select count(*)::int from public.ledger_entries
   where coaching_id = (select id from tests.kv where name='card_pair') and client_id <> tests.user_id('client_t')),
  0, 'every ledger row of the pair now belongs to the person'
);
select * from finish();
rollback;
