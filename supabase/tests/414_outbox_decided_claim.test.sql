-- «Это <Имя>?» held back by quiet hours goes out only while the claim still waits for the trainer's answer
-- (QA 41, 20261103125344_outbox_skip_decided_claim.sql).
begin;
\ir _helpers.psql
select plan(2);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_d');
update public.user_settings set quiet_hours_start = null, quiet_hours_end = null;

create table tests.ids (name text primary key, id uuid not null);
with x as (insert into public.managed_client_claims (trainer_id, claimant_id, new_coaching_id)
  values (tests.user_id('trainer_a'), tests.user_id('client_c'), tests.pair_id('trainer_a', 'client_c')) returning id)
insert into tests.ids select 'decided', id from x;
with x as (insert into public.managed_client_claims (trainer_id, claimant_id, new_coaching_id)
  values (tests.user_id('trainer_a'), tests.user_id('client_d'), tests.pair_id('trainer_a', 'client_d')) returning id)
insert into tests.ids select 'pending', id from x;

select private.enqueue_notification('managed_client_claim', 'k:decided',
  pg_catalog.jsonb_build_object('claim_id', (select id from tests.ids where name = 'decided')), tests.user_id('trainer_a'));
select private.enqueue_notification('managed_client_claim', 'k:pending',
  pg_catalog.jsonb_build_object('claim_id', (select id from tests.ids where name = 'pending')), tests.user_id('trainer_a'));
update public.managed_client_claims set status = 'rejected', decided_at = now() where id = (select id from tests.ids where name = 'decided');

select tests.authenticate_as_service_role();
create temp table claimed on commit drop as select * from public.claim_outbox(50);
select tests.clear_authentication();

select is(
  array(select o.dedupe_key from claimed c join public.notification_outbox o on o.id = c.outbox_id where o.dedupe_key like 'k:%'),
  array['k:pending'], 'claim: a question still waiting for an answer goes out');
select is(
  (select last_error from public.notification_outbox where dedupe_key = 'k:decided' and status = 'skipped'),
  'claim_outdated', 'claim: a question the trainer already answered is skipped');

select * from finish();
rollback;
