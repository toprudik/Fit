-- "Пригласи своего тренера", migration 20261020155113_invite_your_trainer.sql (marketing backlog 16): a person's
-- inviter code, their trainer becoming a trainer by it without an admin invite, the inviter's bot message, the list
-- of trainers who came, and the inviter starting the pair. Admin invites and trainer referral codes keep working.
begin;
\ir _helpers.psql
select plan(29);

select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('coach_n');
select tests.create_user('coach_m');
update public.profiles set first_name = 'Ника', last_name = 'Петрова' where id = tests.user_id('coach_n');

create table tests.codes (name text primary key, code text not null);
grant select, insert on tests.codes to authenticated;
create function tests.code(p_name text) returns text language sql stable set search_path = '' as $$
  select code from tests.codes where name = p_name
$$;

-- =========================================================================================================
-- my_trainer_inviter_code

select tests.authenticate_as('client_c');
insert into tests.codes values ('c', public.my_trainer_inviter_code());
select matches(tests.code('c'), '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$', 'code: 12 characters of the invite alphabet');
select is(public.my_trainer_inviter_code(), tests.code('c'), 'code: the same code on the next call');
select is((select count(*)::int from public.my_invited_trainers()), 0, 'list: nobody came yet');
select is(public.trainer_invite_status(tests.code('c')), 'invalid', 'status: the owner''s own code reads as invalid');
select throws_ok(format('select public.redeem_trainer_invite(%L)', tests.code('c')), 'P0001', 'invite_invalid',
  'redeem: the owner cannot become a trainer by their own code');
select tests.authenticate_as('trainer_a');
select throws_ok($$ select public.my_trainer_inviter_code() $$, 'P0001', 'already_trainer', 'code: a trainer has none');
select tests.authenticate_as_anon();
select throws_ok($$ select public.my_trainer_inviter_code() $$, '42501', null, 'code: anon cannot call it');
select throws_ok($$ select * from public.my_invited_trainers() $$, '42501', null, 'list: anon cannot call it');

-- =========================================================================================================
-- The trainer comes by the code

select tests.authenticate_as('coach_n');
select is(public.trainer_invite_status(lower(tests.code('c'))), 'invited', 'status: an inviter code in any case');
select lives_ok(format('select public.redeem_trainer_invite(%L)', tests.code('c')), 'redeem: the person becomes a trainer');
select tests.clear_authentication();

select ok(exists (select 1 from public.trainer_profiles t where t.user_id = tests.user_id('coach_n')
                  and t.trainer_invite_id is null and t.verification_status = 'not_submitted'),
          'redeem: a trainer profile without an admin invite');
select is((select s.last_zone::text from public.user_settings s where s.user_id = tests.user_id('coach_n')), 'trainer',
          'redeem: the trainer zone opens');
select ok(not exists (select 1 from public.referrals r where r.referee_id = tests.user_id('coach_n')),
          'redeem: no trainer referral or bonus');
select is((select i.inviter_id from public.invited_trainers i where i.trainer_id = tests.user_id('coach_n')),
          tests.user_id('client_c'), 'redeem: the inviter is recorded');
select is((select o.payload from public.notification_outbox o
           where o.type = 'invited_trainer_joined' and o.user_id = tests.user_id('client_c')),
          jsonb_build_object('trainer_id', tests.user_id('coach_n'), 'first_name', 'Ника', 'last_name', 'Петрова'),
          'redeem: the inviter gets a bot message with the trainer''s name');
select ok(not exists (select 1 from public.coachings c where c.trainer_id = tests.user_id('coach_n')),
          'redeem: no pair is made by itself');

-- A second trainer by the same code; a third person who is already a trainer leaves the code alone.
select tests.authenticate_as('coach_m');
select public.redeem_trainer_invite(tests.code('c'));
select tests.authenticate_as('trainer_a');
select is(public.trainer_invite_status(tests.code('c')), 'already_trainer', 'status: a trainer leaves the code alone');
select throws_ok(format('select public.redeem_trainer_invite(%L)', tests.code('c')), 'P0001', 'already_trainer',
  'redeem: a trainer cannot use it');

-- =========================================================================================================
-- my_invited_trainers and join_invited_trainer

select tests.authenticate_as('client_c');
select is((select array_agg(first_name order by first_name) from public.my_invited_trainers()), array['coach_m', 'Ника'],
          'list: both trainers who came, with their names');
select is((select coaching_id from public.my_invited_trainers() where trainer_id = tests.user_id('coach_n')), null::uuid,
          'list: no pair yet');
select ok((select available from public.my_invited_trainers() where trainer_id = tests.user_id('coach_n')),
          'list: the trainer can take the inviter on');
select lives_ok(format('select public.join_invited_trainer(%L)', tests.user_id('coach_n')), 'join: the inviter starts the pair');
select is((select c.source::text || ':' || c.status::text from public.coachings c
           where c.trainer_id = tests.user_id('coach_n') and c.client_id = tests.user_id('client_c')),
          'invited_trainer:active', 'join: a live pair with the invited_trainer source');
select is((select coaching_id from public.my_invited_trainers() where trainer_id = tests.user_id('coach_n')),
          (select c.id from public.coachings c where c.trainer_id = tests.user_id('coach_n') and c.client_id = tests.user_id('client_c')),
          'list: the pair shows');
select is(public.join_invited_trainer(tests.user_id('coach_n')),
          (select c.id from public.coachings c where c.trainer_id = tests.user_id('coach_n') and c.client_id = tests.user_id('client_c')),
          'join: again returns the same pair');

select tests.authenticate_as('client_d');
select is((select count(*)::int from public.my_invited_trainers()), 0, 'list: another person sees nobody');
select throws_ok(format('select public.join_invited_trainer(%L)', tests.user_id('coach_m')), 'P0001', 'not_invited',
  'join: only the inviter starts a pair this way');
select throws_ok($$ select * from public.trainer_inviter_codes $$, '42501', null, 'tables: codes are not read directly');
select throws_ok($$ select * from public.invited_trainers $$, '42501', null, 'tables: inviters are not read directly');

select * from finish();
rollback;
