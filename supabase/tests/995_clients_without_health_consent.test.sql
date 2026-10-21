-- The trainer's clients without the health data consent, migration 20261021071352_clients_without_health_consent.sql:
-- only the caller's own trial and active pairs, a withdrawn consent counts as none, a client card counts as allowed.
begin;
\ir _helpers.psql
select plan(6);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_yes');
select tests.create_user('client_no');
select tests.create_user('client_gone');
select tests.create_pair('trainer_a', 'client_yes');
select tests.create_pair('trainer_a', 'client_no', 'trial');
select tests.create_pair('trainer_a', 'client_gone', 'ended');
select tests.create_pair('trainer_b', 'client_no');
select tests.create_card('trainer_a', 'card_c');
update public.consents set revoked_at = now()
where kind = 'pd_health' and user_id in (tests.user_id('client_no'), tests.user_id('client_gone'), tests.user_id('card_c'));

select tests.authenticate_as('trainer_a');
select results_eq(
  'select * from public.my_clients_without_health_consent()',
  array[tests.pair_id('trainer_a', 'client_no')],
  'a trial client without the consent is listed; the one with it, the ended pair and the client card are not');

select tests.authenticate_as('trainer_b');
select results_eq(
  'select * from public.my_clients_without_health_consent()',
  array[tests.pair_id('trainer_b', 'client_no')],
  'another trainer sees only their own pair');

select tests.authenticate_as('client_yes');
select is_empty('select * from public.my_clients_without_health_consent()', 'a client with no pairs as a trainer gets nothing');

select tests.clear_authentication();
insert into public.consents (user_id, kind, version) values (tests.user_id('client_no'), 'pd_health', 'tests');
select tests.authenticate_as('trainer_a');
select is_empty('select * from public.my_clients_without_health_consent()', 'a consent given again takes the client off the list');

select tests.authenticate_as_anon();
select throws_ok('select * from public.my_clients_without_health_consent()', '42501', null, 'anon cannot call it');

select tests.clear_authentication();
select is(
  (select prosecdef from pg_proc where oid = 'public.my_clients_without_health_consent()'::regprocedure),
  true, 'it runs as definer, since consents are not readable by the trainer');

select * from finish();
rollback;
