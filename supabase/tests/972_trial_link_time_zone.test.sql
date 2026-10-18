-- get_trial_link returns the trainer's time zone, so the trial landing can add «по времени тренера» for a visitor
-- whose clock differs (SCHED-19). The visitor is not paired yet and cannot read it from public_profiles.
begin;
\ir _helpers.psql
select plan(4);

select tests.create_trainer('trainer_a');
select tests.create_user('visitor_v');
update public.user_settings set time_zone = 'Asia/Yekaterinburg' where user_id = tests.user_id('trainer_a');

create table tests.trial (token text not null);
grant select on tests.trial to anon, authenticated;

select tests.authenticate_as('trainer_a');
insert into public.trial_links (trainer_id, title, currency) values (tests.user_id('trainer_a'), 'Знакомство', 'RUB');
reset role;
insert into tests.trial select token from public.trial_links;

select tests.authenticate_as_anon();
select is(
  (select time_zone from public.get_trial_link((select token from tests.trial))), 'Asia/Yekaterinburg',
  'anon: the landing gets the trainer''s time zone'
);
select is(
  (select time_zone from public.get_trial_link('AAAAAAAAAAAAAAAAAAAAAA')), null,
  'anon: an unknown token gives no time zone'
);

select tests.authenticate_as('visitor_v');
select is(
  (select time_zone from public.public_profiles where id = tests.user_id('trainer_a')), null,
  'visitor: public_profiles still hides the zone of a trainer they are not paired with'
);
select is(
  (select time_zone from public.get_trial_link((select token from tests.trial))), 'Asia/Yekaterinburg',
  'visitor: the landing gets the trainer''s time zone when signed in too'
);

select * from finish();
rollback;
