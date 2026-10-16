-- Trial links of migration 20261016170000_trial_links.sql (PRD wave-1 §2.3 rules 4–7, TINV-7; Q60):
-- the trainer's own rows under the grants, get_trial_link for anyone, join_by_trial_link, and join_by_invite
-- still working on top of private.join_pair.
begin;
\ir _helpers.psql
select plan(27);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('stranger_s');

-- Tokens by name, so steps acting as other users can use them.
create table tests.trial (name text primary key, token text not null);
grant select on tests.trial to anon;
grant select, insert on tests.trial to authenticated;
create table tests.b_link (token text);
grant select, insert on tests.b_link to authenticated;

insert into public.locations (trainer_id, name, address)
values (tests.user_id('trainer_a'), 'Зал на Тверской', 'Тверская, 1');

-- =========================================================================================================
-- The trainer's links

select tests.authenticate_as('trainer_a');
insert into public.trial_links (trainer_id, title, duration_min, price_minor, currency, location_id, mode)
values (tests.user_id('trainer_a'), 'Пробная силовая', 45, 150000, 'RUB',
        (select id from public.locations where name = 'Зал на Тверской'), 'offline');
insert into public.trial_links (trainer_id, title, currency, max_uses)
values (tests.user_id('trainer_a'), 'Знакомство', 'RUB', 1);
select is((select count(*)::int from public.trial_links), 2, 'trainer: makes and sees their own trial links');
select ok(
  (select bool_and(token ~ '^[A-Za-z0-9_-]{22}$') from public.trial_links), 'trainer: the database makes the tokens'
);
select throws_ok(
  $$ insert into public.trial_links (trainer_id, title, currency) values (tests.user_id('trainer_b'), 'x', 'RUB') $$,
  '42501', null, 'trainer: cannot make a link for another trainer'
);
select throws_ok(
  $$ update public.trial_links set token = 'AAAAAAAAAAAAAAAAAAAAAA' $$, '42501', null, 'trainer: cannot pick a token'
);

insert into tests.trial select 'paid', token from public.trial_links where title = 'Пробная силовая';
insert into tests.trial select 'once', token from public.trial_links where title = 'Знакомство';

select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.trial_links), 0, 'trainer: another trainer''s links are hidden');

-- =========================================================================================================
-- get_trial_link

select tests.authenticate_as_anon();
select results_eq(
  $$ select status, trainer_id, name, verified, title, duration_min, price_minor, currency::text, mode::text,
            location_name, location_address, coaching_id
     from public.get_trial_link((select token from tests.trial where name = 'paid')) $$,
  $$ values ('valid'::text, tests.user_id('trainer_a'), 'trainer_a'::text, false, 'Пробная силовая'::text, 45::smallint,
            150000::bigint, 'RUB'::text, 'offline'::text, 'Зал на Тверской'::text, 'Тверская, 1'::text, null::uuid) $$,
  'link: anyone sees the trainer card and the trial terms'
);
select results_eq(
  $$ select status, trainer_id, title from public.get_trial_link('AAAAAAAAAAAAAAAAAAAAAA') $$,
  $$ values ('invalid'::text, null::uuid, null::text) $$,
  'link: an unknown token is invalid and shows nothing'
);
select is((select status from public.get_trial_link(null)), 'invalid', 'link: no token is invalid');
select throws_ok($$ select token from public.trial_links $$, '42501', null, 'link: anon still cannot read trial_links');

select tests.authenticate_as('trainer_a');
select is(
  (select status from public.get_trial_link((select token from tests.trial where name = 'paid'))), 'own',
  'link: the trainer sees their own link as own'
);

-- Switched off: invalid, and back on works again with the same token.
update public.trial_links set is_enabled = false where title = 'Пробная силовая';
select tests.authenticate_as_anon();
select is(
  (select status from public.get_trial_link((select token from tests.trial where name = 'paid'))), 'invalid',
  'link: a switched-off link is invalid'
);
select tests.authenticate_as('trainer_a');
update public.trial_links set is_enabled = true where title = 'Пробная силовая';
select tests.authenticate_as_anon();
select is(
  (select status from public.get_trial_link((select token from tests.trial where name = 'paid'))), 'valid',
  'link: switched back on, the same token works'
);

-- A rejected trainer's link works without the badge (TINV-7); a blocked trainer's does not.
select tests.clear_authentication();
update public.trainer_profiles set verification_status = 'rejected' where user_id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select results_eq(
  $$ select status, verified from public.get_trial_link((select token from tests.trial where name = 'paid')) $$,
  $$ values ('valid'::text, false) $$,
  'link: a rejected trainer''s link still works, without the badge (Q60)'
);
select tests.clear_authentication();
update public.profiles set blocked_at = now(), blocked_reason = 'spam' where id = tests.user_id('trainer_a');
select tests.authenticate_as_anon();
select results_eq(
  $$ select status, name, title from public.get_trial_link((select token from tests.trial where name = 'paid')) $$,
  $$ values ('unavailable'::text, null::text, null::text) $$,
  'link: a blocked trainer shows only unavailable'
);
select tests.clear_authentication();
update public.profiles set blocked_at = null, blocked_reason = null where id = tests.user_id('trainer_a');

-- =========================================================================================================
-- join_by_trial_link

select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.join_by_trial_link((select token from tests.trial where name = 'paid')) $$, '42501', null,
  'join: anon cannot call it'
);
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.join_by_trial_link((select token from tests.trial where name = 'paid')) $$, 'P0001', 'own_invite',
  'join: not through your own link'
);
select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.join_by_trial_link('AAAAAAAAAAAAAAAAAAAAAA') $$, 'P0001', 'invite_invalid', 'join: not through an unknown link'
);
select isnt(
  public.join_by_trial_link((select token from tests.trial where name = 'paid')), null,
  'join: a signed-in person becomes a client'
);
select tests.clear_authentication();
select results_eq(
  $$ select c.source::text, tl.title, tl.uses_count, c.client_invite_id
     from public.coachings c join public.trial_links tl on tl.id = c.trial_link_id
     where c.client_id = tests.user_id('client_c') $$,
  $$ values ('trial_link'::text, 'Пробная силовая'::text, 1, null::uuid) $$,
  'join: the pair remembers the trial link, which counts the use'
);
select is(
  (select count(*)::int from public.notification_outbox where user_id = tests.user_id('trainer_a') and type = 'coaching_created'),
  1, 'join: the trainer gets the new client message'
);
select tests.authenticate_as('client_c');
select results_eq(
  $$ select status, coaching_id from public.get_trial_link((select token from tests.trial where name = 'paid')) $$,
  $$ values ('joined'::text, tests.pair_id('trainer_a', 'client_c')) $$,
  'join: afterwards the link shows the pair'
);
select is(
  public.join_by_trial_link((select token from tests.trial where name = 'paid')), tests.pair_id('trainer_a', 'client_c'),
  'join: a second press returns the same pair without a new use'
);
select tests.clear_authentication();
select is((select uses_count from public.trial_links where title = 'Пробная силовая'), 1, 'join: still one use');

-- A link with one use stops working after it.
select tests.authenticate_as('client_d');
select isnt(public.join_by_trial_link((select token from tests.trial where name = 'once')), null, 'join: the last use works');
select tests.authenticate_as('stranger_s');
select throws_ok(
  $$ select public.join_by_trial_link((select token from tests.trial where name = 'once')) $$, 'P0001', 'invite_invalid',
  'join: a used-up link is invalid'
);

-- =========================================================================================================
-- The client link still joins the same way on top of join_pair.

select tests.authenticate_as('trainer_b');
insert into tests.b_link select token from public.my_client_invite();
select tests.authenticate_as('stranger_s');
select isnt(public.join_by_invite((select token from tests.b_link)), null, 'client link: still joins');
select tests.clear_authentication();
select results_eq(
  $$ select c.source::text, ci.uses_count, c.trial_link_id
     from public.coachings c join public.client_invites ci on ci.id = c.client_invite_id
     where c.client_id = tests.user_id('stranger_s') and c.trainer_id = tests.user_id('trainer_b') $$,
  $$ values ('client_invite'::text, 1, null::uuid) $$,
  'client link: the pair remembers the client link, which counts the use'
);

select * from finish();
rollback;
