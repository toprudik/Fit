-- "Попросить связаться" (migration 20261017021730_contact_requests.sql, PRIV-2): request_contact,
-- decline_contact_request and the server-only accept_contact_request, with the С1 and С2 messages.
begin;
\ir _helpers.psql
select plan(30);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_named');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e', 'ended');
select tests.create_pair('trainer_a', 'client_named');
update public.profiles set username = 'named_one' where id = tests.user_id('client_named');
select tests.pair_id('trainer_a', 'client_c') as pair_c, tests.pair_id('trainer_a', 'client_d') as pair_d,
       tests.pair_id('trainer_a', 'client_e') as pair_e, tests.pair_id('trainer_a', 'client_named') as pair_named \gset

create function tests.outbox(p_type public.notification_type, p_user text)
returns setof jsonb language sql stable set search_path = '' as $$
  select o.payload from public.notification_outbox o where o.type = p_type and o.user_id = tests.user_id(p_user)
$$;

-- =========================================================================================================
-- request_contact

select tests.authenticate_as_anon();
select throws_ok(
  format('select public.request_contact(%L)', :'pair_c'), '42501', null, 'request: anon cannot'
);

select tests.authenticate_as('stranger_s');
select throws_ok(
  format('select public.request_contact(%L)', :'pair_c'),
  'P0001', 'pair_not_found', 'request: only a member of the pair'
);

select tests.authenticate_as('trainer_a');
select throws_ok(
  format('select public.request_contact(%L)', :'pair_e'),
  'P0001', 'pair_ended', 'request: not in an ended pair'
);
select throws_ok(
  format('select public.request_contact(%L)', :'pair_named'),
  'P0001', 'has_username', 'request: someone with a username gets a message instead'
);

select lives_ok(
  format('select public.request_contact(%L)', :'pair_c'), 'request: the trainer asks the client'
);
select results_eq(
  $$ select status::text, recipient_id from public.contact_requests $$,
  $$ values ('pending', tests.user_id('client_c')) $$,
  'request: a pending request to the other side, which the requester reads'
);
select throws_ok(
  format('select public.request_contact(%L)', :'pair_c'),
  'P0001', 'too_soon', 'request: a second one within 24 hours is refused'
);
select throws_ok(
  $$ insert into public.contact_requests (coaching_id, requester_id, recipient_id)
     values ('00000000-0000-4000-8000-000000000000', tests.user_id('trainer_a'), tests.user_id('client_d')) $$,
  '42501', null, 'request: no direct insert'
);

select tests.clear_authentication();
select results_eq(
  $$ select p ->> 'side', p ->> 'first_name', p ->> 'coaching_id' from tests.outbox('contact_request', 'client_c') p $$,
  $$ values ('trainer', 'trainer_a', tests.pair_id('trainer_a', 'client_c')::text) $$,
  'request: С1 goes to the client with the trainer''s name and side'
);
select is(
  (select count(*)::int from tests.outbox('contact_request', 'client_c')), 1, 'request: one message for one request'
);

-- The other way round: the client asks the trainer, a separate 24 hours.
select tests.authenticate_as('client_c');
select lives_ok(
  format('select public.request_contact(%L)', :'pair_c'), 'request: the client asks the trainer too'
);
select tests.clear_authentication();
select is(
  (select p ->> 'side' from tests.outbox('contact_request', 'trainer_a') p), 'client', 'request: С1 to the trainer names the client side'
);

-- After 24 hours the trainer may ask again, whatever happened to the first request.
update public.contact_requests set created_at = now() - interval '25 hours' where recipient_id = tests.user_id('client_c');
select tests.authenticate_as('trainer_a');
select lives_ok(
  format('select public.request_contact(%L)', :'pair_c'), 'request: allowed again after 24 hours'
);

-- A leaving account takes no requests.
select tests.clear_authentication();
insert into public.account_deletions (user_id, scheduled_for) values (tests.user_id('client_d'), now() + interval '30 days');
select tests.authenticate_as('trainer_a');
select throws_ok(
  format('select public.request_contact(%L)', :'pair_d'),
  'P0001', 'recipient_unavailable', 'request: not to someone deleting the account'
);

-- =========================================================================================================
-- decline_contact_request

select tests.clear_authentication();
select id as declined_id from public.contact_requests
where recipient_id = tests.user_id('client_c') order by created_at limit 1 \gset
select id as latest_id from public.contact_requests
where recipient_id = tests.user_id('client_c') order by created_at desc limit 1 \gset
select id as to_trainer_id from public.contact_requests where recipient_id = tests.user_id('trainer_a') \gset

select tests.authenticate_as('trainer_a');
select throws_ok(
  format('select public.decline_contact_request(%L)', :'declined_id'),
  'P0001', 'request_not_found', 'decline: only the recipient answers'
);

select tests.authenticate_as('client_c');
select is(public.decline_contact_request(:'declined_id')::text, 'declined', 'decline: the client says no');
select is(
  public.decline_contact_request(:'declined_id')::text, 'declined', 'decline: a second answer changes nothing'
);
select tests.clear_authentication();
select results_eq(
  $$ select p ->> 'accepted', p ->> 'side', p ->> 'first_name', p ? 'phone' from tests.outbox('contact_response', 'trainer_a') p $$,
  $$ values ('false', 'trainer', 'client_c', false) $$,
  'decline: С2 tells the trainer, without any contact'
);
select ok(
  (select responded_at is not null from public.contact_requests where id = :'declined_id'), 'decline: the answer time is kept'
);

-- =========================================================================================================
-- accept_contact_request

select tests.authenticate_as('client_c');
select throws_ok(
  format('select public.accept_contact_request(%L, %L, %L)', :'latest_id', tests.user_id('client_c'), '+79991234567'),
  '42501', null, 'accept: a signed-in user cannot call it'
);

select tests.authenticate_as_service_role();
select throws_ok(
  format('select public.accept_contact_request(%L, %L, %L)', :'latest_id', tests.user_id('client_c'), 'call me'),
  '22023', 'invalid_phone', 'accept: a phone number only'
);
select throws_ok(
  format('select public.accept_contact_request(%L, %L, %L)', :'latest_id', tests.user_id('client_d'), '+79991234567'),
  'P0001', 'request_not_found', 'accept: only for the recipient'
);
select is(
  public.accept_contact_request(:'latest_id', tests.user_id('client_c'), '7 (999) 123-45-67')::text, 'accepted',
  'accept: the server accepts for the recipient'
);
select tests.clear_authentication();
select results_eq(
  $$ select p ->> 'accepted', p ->> 'phone', (p ->> 'telegram_id')::bigint, p ->> 'request_id'
     from tests.outbox('contact_response', 'trainer_a') p where p ->> 'accepted' = 'true' $$,
  format($$ values ('true', '+79991234567', (select telegram_id from tests.users where handle = 'client_c'), %L) $$, :'latest_id'),
  'accept: С2 gives the trainer the number and the Telegram id'
);

select tests.authenticate_as('client_c');
select is(public.decline_contact_request(:'latest_id')::text, 'accepted', 'accept: declining afterwards keeps the answer');

-- =========================================================================================================
-- Expiry: a request nobody answered in 7 days

select tests.clear_authentication();
update public.contact_requests set created_at = now() - interval '8 days' where id = :'to_trainer_id';
select tests.authenticate_as('trainer_a');
select is(public.decline_contact_request(:'to_trainer_id')::text, 'expired', 'expiry: an old request only expires');
select tests.clear_authentication();
select is(
  (select status::text from public.contact_requests where id = :'to_trainer_id'), 'expired', 'expiry: it is stored as expired'
);
select is(
  (select count(*)::int from tests.outbox('contact_response', 'client_c')), 0, 'expiry: the client gets no answer message'
);

-- Both sides read the requests between them, nobody else does.
select tests.authenticate_as('stranger_s');
select is((select count(*)::int from public.contact_requests), 0, 'read: a stranger sees none');
select tests.authenticate_as('client_c');
select is((select count(*)::int from public.contact_requests), 3, 'read: the client sees requests both ways');

select * from finish();
rollback;
