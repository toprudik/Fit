-- History of passes, freezes and payments (money_events, PRD line 27 «кто, когда, что, причина», decisions Q21,
-- PRD 2.8-13): every direct change is recorded with its actor and reason, the history outlives a deleted pass
-- or freeze, it is append-only, and it follows the pair's visibility.
begin;
\ir _helpers.psql
select plan(28);

-- Fixtures: C has live pairs to A and B, D a live pair to A. X is an admin.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_admin('admin_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c');
select tests.create_pair('trainer_a', 'client_d');

create table tests.ids (name text primary key, id uuid not null);
grant select on tests.ids to authenticated, service_role;
create function tests.i(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;
insert into tests.ids values
  ('pair_ac', tests.pair_id('trainer_a', 'client_c')),
  ('pair_bc', tests.pair_id('trainer_b', 'client_c')),
  ('pair_ad', tests.pair_id('trainer_a', 'client_d'));

-- The create_pass RPC runs with A's claims.
select tests.set_claims('trainer_a');
insert into tests.ids values
  ('pass', tests.create_pass('trainer_a', 'client_c', 10, 16000)),
  ('pass_unused', tests.create_pass('trainer_a', 'client_c', 5));
select tests.clear_authentication();
select tests.set_claims('trainer_b');
insert into tests.ids values ('pass_b', tests.create_pass('trainer_b', 'client_c', 5));
select tests.clear_authentication();

select results_eq(
  $$ select action::text, actor_id, actor_role::text, new_values ->> 'title' from public.money_events
     where pass_id = tests.i('pass') $$,
  $$ values ('pass_created', tests.u('trainer_a'), 'trainer', '10 sessions') $$,
  'pass: creating a pass records pass_created with the actor and the new row'
);

-- A renames the pass directly.
select tests.authenticate_as('trainer_a');
update public.passes set title = 'Ten', note = 'paid in cash' where id = tests.i('pass');
select tests.clear_authentication();
select results_eq(
  $$ select action::text, actor_id, old_values, new_values from public.money_events
     where pass_id = tests.i('pass') and action = 'pass_changed' $$,
  $$ values ('pass_changed', tests.u('trainer_a'),
             '{"title": "10 sessions", "note": null}'::jsonb, '{"title": "Ten", "note": "paid in cash"}'::jsonb) $$,
  'pass: a direct edit records the changed columns before and after'
);

-- Extending the expiry takes a reason, for every role (the extend RPC sets fit.change_reason).
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ update public.passes set expires_at = now() + interval '60 days' where id = tests.i('pass') $$,
  '42501', null, 'pass: expires_at is not writable directly'
);
select tests.clear_authentication();
select throws_ok(
  $$ update public.passes set expires_at = now() + interval '60 days' where id = tests.i('pass') $$,
  'P0001', 'reason_required', 'pass: an expiry change without a reason raises reason_required, even for the server'
);
select tests.set_claims('trainer_a');
select set_config('fit.change_reason', 'client was ill for two weeks', true);
update public.passes set expires_at = now() + interval '60 days' where id = tests.i('pass');
select set_config('fit.change_reason', '', true);
select tests.clear_authentication();
select results_eq(
  $$ select actor_id, reason, (old_values ? 'expires_at') and (new_values ? 'expires_at') from public.money_events
     where pass_id = tests.i('pass') and action = 'pass_changed' and reason is not null $$,
  $$ values (tests.u('trainer_a'), 'client was ill for two weeks', true) $$,
  'pass: an extension records who, the reason and the old and new expiry'
);

-- A freeze added and removed again leaves both steps in the history.
select tests.authenticate_as('trainer_a');
insert into public.pass_freezes (pass_id, period, reason) values (tests.i('pass'), daterange(current_date + 10, current_date + 14), 'trip');
select tests.clear_authentication();
insert into tests.ids select 'freeze', id from public.pass_freezes where pass_id = tests.i('pass');
select tests.authenticate_as('trainer_a');
delete from public.pass_freezes where id = tests.i('freeze');
select tests.clear_authentication();
select is_empty($$ select 1 from public.pass_freezes where id = tests.i('freeze') $$, 'freeze: the freeze is gone');
select results_eq(
  $$ select action::text, pass_id, actor_role::text, reason from public.money_events
     where freeze_id = tests.i('freeze') order by id $$,
  $$ values ('freeze_added', tests.i('pass'), 'trainer', 'trip'), ('freeze_removed', tests.i('pass'), 'trainer', 'trip') $$,
  'freeze: adding and removing a freeze are both recorded, and outlive the freeze'
);

-- Payments: C reports, A confirms; another report is withdrawn by C; A voids an entry with a reason.
select tests.authenticate_as('client_c');
insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status, note)
values (tests.i('pair_ac'), tests.i('pass'), 16000, 'RUB', 'sbp', now(), 'reported', 'report');
insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status, note)
values (tests.i('pair_ac'), 500, 'RUB', 'cash', now(), 'reported', 'mistake');
update public.payments set status = 'voided', void_reason = 'sent twice' where note = 'mistake';
select tests.authenticate_as('trainer_a');
update public.payments set status = 'confirmed' where note = 'report';
insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status, note)
values (tests.i('pair_ac'), tests.i('pass'), 1000, 'RUB', 'cash', now(), 'confirmed', 'entry');
update public.payments set status = 'voided', void_reason = 'wrong amount' where note = 'entry';
select tests.clear_authentication();
insert into tests.ids select 'pay_' || note, id from public.payments where note in ('report', 'mistake', 'entry');

select results_eq(
  $$ select action::text, actor_role::text from public.money_events where payment_id = tests.i('pay_report') order by id $$,
  $$ values ('payment_created', 'client'), ('payment_confirmed', 'trainer') $$,
  'payment: the client report and the trainer confirmation are recorded with their actors'
);
select results_eq(
  $$ select actor_id, reason from public.money_events where payment_id = tests.i('pay_mistake') and action = 'payment_voided' $$,
  $$ values (tests.u('client_c'), 'sent twice') $$,
  'payment: the client withdrawing a report is recorded as the voider, with the reason'
);
select results_eq(
  $$ select voided_by from public.payments where id in (tests.i('pay_mistake'), tests.i('pay_entry')) order by note $$,
  $$ values (tests.u('trainer_a')), (tests.u('client_c')) $$,
  'payment: voided_by is stamped on the row (A for the entry, C for the withdrawn report)'
);
select results_eq(
  $$ select actor_id, reason from public.money_events where payment_id = tests.i('pay_entry') and action = 'payment_voided' $$,
  $$ values (tests.u('trainer_a'), 'wrong amount') $$,
  'payment: the trainer voiding a payment is recorded with the reason'
);

-- Cancelling (cancel_pass RPC, with A's claims) stamps cancelled_by and records the reason.
select tests.set_claims('trainer_a');
update public.passes set status = 'cancelled', cancelled_at = now(), cancel_reason = 'client moved away'
where id = tests.i('pass_unused');
select tests.clear_authentication();
select results_eq(
  $$ select cancelled_by from public.passes where id = tests.i('pass_unused') $$,
  $$ values (tests.u('trainer_a')) $$,
  'pass: cancelled_by is stamped with the caller'
);
select results_eq(
  $$ select action::text, actor_id, reason from public.money_events where pass_id = tests.i('pass_unused') and action = 'pass_cancelled' $$,
  $$ values ('pass_cancelled', tests.u('trainer_a'), 'client moved away') $$,
  'pass: a cancellation is recorded with its reason'
);

-- A deletes an unused pass (R27): the history stays.
select tests.set_claims('trainer_a');
insert into tests.ids values ('pass_del', tests.create_pass('trainer_a', 'client_c', 3));
select tests.clear_authentication();
select tests.authenticate_as('trainer_a');
delete from public.passes where id = tests.i('pass_del');
select tests.clear_authentication();
select results_eq(
  $$ select action::text, actor_id from public.money_events where pass_id = tests.i('pass_del') order by id $$,
  $$ values ('pass_created', tests.u('trainer_a')), ('pass_deleted', tests.u('trainer_a')) $$,
  'pass: deleting a pass is recorded, and the history outlives it'
);

-- Visibility: the pair's client and trainer; nobody else.
create table tests.expect as
select 'client_c' as who, id from public.money_events where client_id = tests.u('client_c')
union all select 'trainer_a', id from public.money_events where coaching_id = tests.i('pair_ac')
union all select 'trainer_b', id from public.money_events where coaching_id = tests.i('pair_bc');
grant select on tests.expect to authenticated;
select tests.authenticate_as('client_c');
select set_eq($$ select id from public.money_events $$, $$ select id from tests.expect where who = 'client_c' $$,
  'visibility: C reads the history of both own pairs');
select tests.authenticate_as('trainer_a');
select set_eq($$ select id from public.money_events $$, $$ select id from tests.expect where who = 'trainer_a' $$,
  'visibility: A reads the history of the A-C pair, not B-C');
select tests.authenticate_as('trainer_b');
select set_eq($$ select id from public.money_events $$, $$ select id from tests.expect where who = 'trainer_b' $$,
  'visibility: B reads only the B-C history');
select tests.authenticate_as('client_d');
select is_empty($$ select 1 from public.money_events $$, 'visibility: D reads none of C''s history');
select tests.authenticate_as('admin_x');
select is_empty($$ select 1 from public.money_events $$, 'visibility: the admin reads no money history');
select tests.authenticate_as_anon();
select throws_ok($$ select 1 from public.money_events $$, '42501', null, 'visibility: anon has no access');

-- Nobody writes it directly; it is append-only for every role.
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ insert into public.money_events (coaching_id, client_id, trainer_id, pass_id, action, actor_role)
     values (tests.i('pair_ac'), tests.u('client_c'), tests.u('trainer_a'), tests.i('pass'), 'pass_changed', 'trainer') $$,
  '42501', null, 'writes: a trainer cannot insert history'
);
select throws_ok($$ delete from public.money_events where pass_id = tests.i('pass') $$, '42501', null,
  'writes: a trainer cannot delete history');
select tests.clear_authentication();
select throws_ok($$ update public.money_events set reason = 'rewritten' where pass_id = tests.i('pass') $$,
  'P0001', 'append_only', 'append-only: changing a row raises as postgres');
select throws_ok($$ delete from public.money_events where pass_id = tests.i('pass') $$,
  'P0001', 'append_only', 'append-only: deleting a row raises as postgres');
select tests.authenticate_as_service_role();
select throws_ok($$ update public.money_events set actor_id = null where pass_id = tests.i('pass') $$,
  'P0001', 'append_only', 'append-only: service_role cannot erase the actor');
select tests.clear_authentication();

-- The pair moves to the stub (account deletion): the history follows; deleting a pair takes it along, without
-- recording the cascade as user actions.
select tests.create_deleted_stub();
update public.coachings set client_id = private.deleted_client_id() where id = tests.i('pair_bc');
select is_empty(
  $$ select 1 from public.money_events where coaching_id = tests.i('pair_bc') and client_id <> private.deleted_client_id() $$,
  'reassignment: the history of the pair now points to the stub'
);
select tests.set_claims('trainer_a');
select tests.create_pass('trainer_a', 'client_d', 5);
select tests.clear_authentication();
select lives_ok($$ delete from public.coachings where id = tests.i('pair_ad') $$,
  'cascade: deleting a pair with passes and history passes');
select is_empty($$ select 1 from public.money_events where coaching_id = tests.i('pair_ad') $$,
  'cascade: the deleted pair''s history is gone, with no pass_deleted rows written by the cascade');

select * from finish();
rollback;
