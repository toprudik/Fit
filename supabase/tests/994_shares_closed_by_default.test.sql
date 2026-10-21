-- «Что видит тренер» is closed by default, migration 20261021033917_shares_closed_by_default.sql: a pair made by
-- a client link shares nothing and waits for the sharing step, a pair coming back after the end is closed again,
-- and the client opens categories themselves.
begin;
\ir _helpers.psql
select plan(6);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');

create table tests.links (token text not null);
grant select, insert on tests.links to authenticated;
select tests.authenticate_as('trainer_a');
insert into tests.links select token from public.my_client_invite();
select tests.clear_authentication();

create table tests.pair (id uuid);
grant select, insert on tests.pair to authenticated;
select tests.authenticate_as('client_c');
insert into tests.pair select public.join_by_invite((select token from tests.links));

select is(
  (select row(nutrition, measurements, photos, steps, intake, workouts)::text || ' ' || (intake_decided_at is null)
   from public.data_shares where coaching_id = (select id from tests.pair)),
  '(f,f,f,f,f,f) true', 'a new pair shares nothing and the sharing step is open');

select tests.authenticate_as('trainer_a');
select is((select count(*)::integer from public.measurements), 0, 'the trainer sees no measurements');

select tests.authenticate_as('client_c');
update public.data_shares set nutrition = true, measurements = true, steps = false, photos = false, workouts = true, intake = false,
  intake_decided_at = now()
where coaching_id = (select id from tests.pair);
select is(
  (select row(nutrition, measurements, photos, steps, intake, workouts)::text || ' ' || (intake_decided_at is not null)
   from public.data_shares where coaching_id = (select id from tests.pair)),
  '(t,t,f,f,f,t) true', 'the client answers the step, and it is stamped');

select public.end_coaching((select id from tests.pair));
select public.join_by_invite((select token from tests.links));
select is(
  (select row(nutrition, measurements, photos, steps, intake, workouts)::text || ' ' || (intake_decided_at is null)
   from public.data_shares where coaching_id = (select id from tests.pair)),
  '(f,f,f,f,f,f) true', 'a pair coming back after the end is closed and asks again');

select tests.clear_authentication();
-- Cards need the data processing agreement (20261020141737_trainer_dpa.sql).
insert into public.consents (user_id, kind, version) values (tests.user_id('trainer_a'), 'trainer_dpa', '2026-10-18');
select tests.authenticate_as('trainer_a');
select isnt(public.create_managed_client('Аня'), null, 'the trainer adds a card');
select tests.clear_authentication();
select ok(
  (select nutrition and measurements and photos and steps and intake and workouts and intake_decided_at is not null
   from public.data_shares d join public.coachings c on c.id = d.coaching_id
   join public.profiles p on p.id = c.client_id where p.first_name = 'Аня'),
  'a card pair still shares everything');

select * from finish();
rollback;
