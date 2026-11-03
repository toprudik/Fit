-- QA bug 47: a client who left while «Это <Имя>?» was unanswered comes back by the same link; the pending
-- question is reused and the trainer is asked again.
begin;
\ir _helpers.psql
select plan(7);
select tests.create_trainer('trainer_a');
insert into public.consents (user_id, kind, version) values (tests.user_id('trainer_a'), 'trainer_dpa', '2026-10-18');
select tests.create_user('client_t');
create table tests.tok (token text);
grant all on tests.tok to authenticated;

select tests.authenticate_as('trainer_a');
select public.create_managed_client('Карточка', null, null);
insert into tests.tok select token from public.my_client_invite();
select tests.authenticate_as('client_t');
select public.join_by_invite((select token from tests.tok));
select tests.clear_authentication();

select is(
  (select count(*)::int from public.managed_client_claims where claimant_id = tests.user_id('client_t') and status = 'pending'),
  1, 'first join asks the trainer «Это <Имя>?»');

-- The trainer does not answer; the client leaves.
select tests.authenticate_as('client_t');
select lives_ok($$ select public.end_coaching(tests.pair_id('trainer_a', 'client_t'), null) $$, 'the client leaves');
select tests.clear_authentication();

select is(
  (select count(*)::int from public.managed_client_claims where claimant_id = tests.user_id('client_t') and status = 'pending'),
  1, 'the unanswered question stays pending after the pair ended');

-- The trainer got the first message.
update public.notification_outbox set status = 'sent', sent_at = now() where type = 'managed_client_claim';

-- The client comes back by the same link.
select tests.authenticate_as('client_t');
select lives_ok($$ select public.join_by_invite((select token from tests.tok)) $$, 'the client comes back by the same link');
select tests.clear_authentication();

select is(
  (select status::text from public.coachings where id = tests.pair_id('trainer_a', 'client_t')),
  'active', 'the pair is active again');

select is(
  (select count(*)::int from public.managed_client_claims where claimant_id = tests.user_id('client_t')),
  1, 'the pending question is reused, not doubled');
select is(
  (select count(*)::int from public.notification_outbox where type = 'managed_client_claim' and status = 'pending'),
  1, 'and the trainer is asked again');

select * from finish();
rollback;
