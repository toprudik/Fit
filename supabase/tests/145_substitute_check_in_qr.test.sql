-- session_check_in_qr of migration 20261017202743_substitute_check_in_qr.sql (PRD wave-3 §1 × §5): the substitute
-- shows the session's QR, a client checks in by it, and the QR goes away with the substitute's access (1.5).
begin;
\ir _helpers.psql
select plan(6);

select tests.create_trainer('owner_a');
select tests.create_trainer('sub_s');
select tests.create_trainer('other_o');
select tests.create_user('client_c');
select tests.create_pair('owner_a', 'client_c');
select tests.grant_plan('owner_a', 'trainer_pro');
update public.trainer_profiles set verification_status = 'verified', verified_at = now() where user_id = tests.user_id('sub_s');

create table tests.ids (name text primary key, id uuid not null, token text);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;

insert into tests.ids (name, id) values ('pass_c', tests.create_pass('owner_a', 'client_c', 3, 900000));
insert into tests.ids (name, id) values ('session', tests.create_session('owner_a', now() + interval '10 minutes'));
insert into tests.ids (name, id) values ('booking', tests.create_booking(tests.id('session'), 'owner_a', 'client_c'));

select tests.authenticate_as('owner_a');
insert into tests.ids select 'delegation', delegation_id, token from public.create_delegation('substitute', tests.id('session'));

select tests.authenticate_as('sub_s');
select throws_ok(format($$ select * from public.session_check_in_qr(%L) $$, tests.id('session')),
  'P0001', 'session_not_found', 'before acceptance the substitute gets no QR');
select public.accept_delegation((select token from tests.ids where name = 'delegation'));
select isnt((select code from public.session_check_in_qr(tests.id('session'))), null,
  'the substitute gets the session''s current code');
insert into tests.ids (name, id, token)
select 'code', tests.id('session'), code from public.session_check_in_qr(tests.id('session'));

select tests.authenticate_as('other_o');
select throws_ok(format($$ select * from public.session_check_in_qr(%L) $$, tests.id('session')),
  'P0001', 'session_not_found', 'another trainer gets no QR');

select tests.authenticate_as('client_c');
select is((select outcome from public.check_in_by_qr(tests.id('session'), (select token from tests.ids where name = 'code'))),
  'checked_in', 'the client checks in by the substitute''s QR');

select tests.authenticate_as('sub_s');
select is((select checked_in->0->>'first_name' from public.session_check_in_qr(tests.id('session'))), 'client_c',
  'the substitute sees who has checked in');

select tests.clear_authentication();
update public.sessions set starts_at = now() - interval '70 minutes', ends_at = now() - interval '5 minutes'
where id = tests.id('session');
select tests.authenticate_as('sub_s');
select throws_ok(format($$ select * from public.session_check_in_qr(%L) $$, tests.id('session')),
  'P0001', 'session_not_found', '1.5: after the session the substitute gets no QR');

select * from finish();
rollback;
