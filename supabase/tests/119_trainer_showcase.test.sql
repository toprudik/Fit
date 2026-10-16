-- The public showcase of migration 20261016160000_trainer_showcase.sql (PRD wave-1 §2.3 rule 1, SHOP-1, SHOP-7,
-- TINV-7; R16, Q60): get_trainer_showcase and join_by_showcase.
begin;
\ir _helpers.psql
select plan(25);

select tests.create_trainer('trainer_a', 'anna-fit');
select tests.create_trainer('trainer_b', 'boris');
select tests.create_user('client_c');
select tests.create_user('client_d');

insert into public.locations (trainer_id, name, address)
values (tests.user_id('trainer_a'), 'Зал на Тверской', 'Тверская, 1');
insert into public.locations (trainer_id, name, address, archived_at)
values (tests.user_id('trainer_a'), 'Старый зал', null, now());
update public.trainer_profiles
set headline = 'Силовые и мобильность', bio = 'Тренирую 8 лет', specialties = '{strength,mobility}', city = 'Москва',
    works_online = true
where user_id = tests.user_id('trainer_a');

-- =========================================================================================================
-- get_trainer_showcase

select tests.authenticate_as_anon();
select results_eq(
  $$ select status, slug, name, headline, bio, specialties, city, works_offline, works_online, verified, is_own, coaching_id
     from public.get_trainer_showcase('anna-fit') $$,
  $$ values ('available'::text, 'anna-fit'::text, 'trainer_a'::text, 'Силовые и мобильность'::text, 'Тренирую 8 лет'::text,
            '{strength,mobility}'::text[], 'Москва'::text, true, true, false, false, null::uuid) $$,
  'showcase: anyone sees an open showcase without signing in (SHOP-1)'
);
select is(
  (select locations from public.get_trainer_showcase('anna-fit')),
  '[{"name": "Зал на Тверской", "address": "Тверская, 1"}]'::jsonb,
  'showcase: only live locations, name and address'
);
select is(
  (select status from public.get_trainer_showcase('ANNA-FIT')), 'available', 'showcase: the address ignores case'
);
select results_eq(
  $$ select status, slug, name, locations from public.get_trainer_showcase('nobody-here') $$,
  $$ values ('unavailable'::text, null::text, null::text, null::jsonb) $$,
  'showcase: an unknown address is unavailable and shows nothing'
);
select is((select status from public.get_trainer_showcase(null)), 'unavailable', 'showcase: no address is unavailable');
select throws_ok(
  $$ select slug from public.trainer_profiles $$, '42501', null, 'showcase: anon still cannot read trainer_profiles'
);

select tests.authenticate_as('trainer_a');
select is((select is_own from public.get_trainer_showcase('anna-fit')), true, 'showcase: the trainer sees it as their own');

select tests.clear_authentication();
select tests.create_pair('trainer_a', 'client_d');
select tests.authenticate_as('client_d');
select is(
  (select coaching_id from public.get_trainer_showcase('anna-fit')), tests.pair_id('trainer_a', 'client_d'),
  'showcase: a client of the trainer gets their pair'
);

-- Verification: pending and not submitted show it without the badge, verified with it, rejected hides it (Q60).
select tests.clear_authentication();
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select is((select verified from public.get_trainer_showcase('anna-fit')), true, 'showcase: a verified trainer has the badge');

select tests.clear_authentication();
update public.trainer_profiles set verification_status = 'rejected', verified_at = null
where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select results_eq(
  $$ select status, name from public.get_trainer_showcase('anna-fit') $$,
  $$ values ('unavailable'::text, null::text) $$,
  'showcase: a rejected trainer''s showcase is unavailable (R16, Q60)'
);
select tests.authenticate_as('trainer_a');
select is(
  (select status from public.get_trainer_showcase('anna-fit')), 'unavailable',
  'showcase: the rejected trainer sees what everyone sees'
);

select tests.clear_authentication();
update public.trainer_profiles set verification_status = 'pending' where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select results_eq(
  $$ select status, verified from public.get_trainer_showcase('anna-fit') $$,
  $$ values ('available'::text, false) $$,
  'showcase: documents sent again open it without the badge (TINV-7)'
);

-- The trainer's own switch, through the column grant.
select tests.authenticate_as('trainer_a');
update public.trainer_profiles set is_public = false where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select is((select status from public.get_trainer_showcase('anna-fit')), 'unavailable', 'showcase: switched off is unavailable');
select tests.authenticate_as('trainer_a');
update public.trainer_profiles set is_public = true where user_id = tests.user_id('trainer_a');

-- The trainer changes the address; the old one stops working, a taken or malformed one is refused.
update public.trainer_profiles set slug = 'anna' where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select results_eq(
  $$ select (select status from public.get_trainer_showcase('anna')), (select status from public.get_trainer_showcase('anna-fit')) $$,
  $$ values ('available'::text, 'unavailable'::text) $$,
  'showcase: a new address works and the old one does not'
);
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ update public.trainer_profiles set slug = 'boris' where user_id = tests.user_id('trainer_a') $$, '23505', null,
  'showcase: another trainer''s address is refused'
);
select throws_ok(
  $$ update public.trainer_profiles set slug = 'A b' where user_id = tests.user_id('trainer_a') $$, '23514', null,
  'showcase: a malformed address is refused'
);
select tests.authenticate_as('trainer_b');
update public.trainer_profiles set is_public = false where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select is((select status from public.get_trainer_showcase('anna')), 'available', 'showcase: another trainer cannot switch it off');

-- A blocked trainer's showcase is unavailable.
select tests.clear_authentication();
update public.profiles set blocked_at = now(), blocked_reason = 'spam' where id = tests.user_id('trainer_b');
select tests.authenticate_as_anon();
select is((select status from public.get_trainer_showcase('boris')), 'unavailable', 'showcase: a blocked trainer is unavailable');

-- =========================================================================================================
-- join_by_showcase

select throws_ok($$ select public.join_by_showcase('anna') $$, '42501', null, 'join: anon cannot call it');

select tests.authenticate_as('trainer_a');
select throws_ok($$ select public.join_by_showcase('anna') $$, 'P0001', 'own_invite', 'join: not on your own showcase');

select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.join_by_showcase('boris') $$, 'P0001', 'trainer_unavailable', 'join: not through a closed showcase'
);
select isnt(public.join_by_showcase('anna'), null, 'join: a signed-in person becomes a client and gets the pair');
select tests.clear_authentication();
select results_eq(
  $$ select c.source::text, ci.trainer_id, ci.uses_count
     from public.coachings c join public.client_invites ci on ci.id = c.client_invite_id
     where c.client_id = tests.user_id('client_c') $$,
  $$ values ('client_invite'::text, tests.user_id('trainer_a'), 1) $$,
  'join: through the trainer''s client link, created on the way and counted'
);
select is(
  (select count(*)::int from public.notification_outbox
   where user_id = tests.user_id('trainer_a') and type = 'coaching_created'),
  1, 'join: the trainer gets the new client message'
);
select tests.authenticate_as('client_c');
select is(
  public.join_by_showcase('anna'), tests.pair_id('trainer_a', 'client_c'),
  'join: a second press returns the same pair'
);

select * from finish();
rollback;
