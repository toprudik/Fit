-- Client link RPCs of migration 20261016140000_client_invites.sql (PRD wave-1 §2.3 SHOP-2..4, §2.14 PLAN-1
-- and PLAN-9): my_client_invite, reissue_client_invite, resolve_client_invite, join_by_invite, join_by_code.
begin;
\ir _helpers.psql
select plan(51);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_trainer('trainer_full');
select tests.create_trainer('trainer_card');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('stranger_s');
select tests.create_user('fill_1');
select tests.create_user('fill_2');
select tests.create_user('fill_3');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- Links the trainers got back, by name, so steps acting as other users can use them.
create table tests.links (name text primary key, invite_id uuid not null, token text not null, code text not null);
grant select on tests.links to anon;
grant select, insert on tests.links to authenticated;

-- =========================================================================================================
-- my_client_invite and reissue_client_invite

select tests.authenticate_as_anon();
select throws_ok($$ select * from public.my_client_invite() $$, '42501', null, 'my link: anon cannot call it');
select tests.authenticate_as('client_c');
select throws_ok($$ select * from public.my_client_invite() $$, 'P0001', 'not_a_trainer', 'my link: a client has none');
select throws_ok($$ select * from public.reissue_client_invite() $$, 'P0001', 'not_a_trainer', 'reissue: a client cannot');

select tests.authenticate_as('trainer_a');
insert into tests.links select 'first', invite_id, token, code from public.my_client_invite();
select results_eq(
  $$ select invite_id, token, code, uses_count from public.my_client_invite() $$,
  $$ select invite_id, token, code, 0 from tests.links where name = 'first' $$,
  'my link: the second call returns the same link'
);
select is(
  (select count(*)::int from public.client_invites), 1, 'my link: the trainer has exactly one link'
);
insert into tests.links select 'second', invite_id, token, code from public.reissue_client_invite();
select isnt(
  (select token from tests.links where name = 'second'), (select token from tests.links where name = 'first'),
  'reissue: the new link has a new token'
);
select ok(
  (select archived_at is not null from public.client_invites where id = (select invite_id from tests.links where name = 'first')),
  'reissue: the old link is archived'
);
select is(
  (select invite_id from public.my_client_invite()), (select invite_id from tests.links where name = 'second'),
  'reissue: my link is now the new one'
);
-- A link the trainer archives by hand is replaced the next time the screen opens.
update public.client_invites set archived_at = now() where id = (select invite_id from tests.links where name = 'second');
insert into tests.links select 'third', invite_id, token, code from public.my_client_invite();
select isnt(
  (select invite_id from tests.links where name = 'third'), (select invite_id from tests.links where name = 'second'),
  'my link: an archived link is replaced by a new one'
);

select tests.authenticate_as('trainer_b');
insert into tests.links select 'b', invite_id, token, code from public.my_client_invite();
select tests.authenticate_as('trainer_full');
insert into tests.links select 'full', invite_id, token, code from public.my_client_invite();
select tests.authenticate_as('trainer_card');
insert into tests.links select 'card', invite_id, token, code from public.my_client_invite();
select tests.clear_authentication();

-- =========================================================================================================
-- resolve_client_invite

select tests.authenticate_as_anon();
select results_eq(
  $$ select status, trainer_id, first_name, verified, coaching_id
     from public.resolve_client_invite((select token from tests.links where name = 'third')) $$,
  $$ values ('valid'::text, tests.u('trainer_a'), 'trainer_a'::text, false, null::uuid) $$,
  'resolve: anyone sees the trainer card of a working link'
);
select results_eq(
  $$ select status, trainer_id from public.resolve_client_invite((select token from tests.links where name = 'first')) $$,
  $$ values ('invalid'::text, null::uuid) $$,
  'resolve: a reissued link is invalid and shows no trainer (SHOP-3)'
);
select results_eq(
  $$ select status, trainer_id from public.resolve_client_invite('AAAAAAAAAAAAAAAAAAAAAA') $$,
  $$ values ('invalid'::text, null::uuid) $$,
  'resolve: an unknown token is invalid'
);
select throws_ok(
  $$ select * from public.resolve_client_invite(p_code => 'ABCDEF') $$, '42501', null,
  'resolve: anon cannot try codes'
);

select tests.authenticate_as('client_c');
select results_eq(
  $$ select status, trainer_id from public.resolve_client_invite(p_code => lower((select code from tests.links where name = 'third'))) $$,
  $$ values ('valid'::text, tests.u('trainer_a')) $$,
  'resolve: a signed-in user finds the trainer by code, in any case'
);
select results_eq(
  $$ select status, trainer_id from public.resolve_client_invite(p_code => (select code from tests.links where name = 'first')) $$,
  $$ select status, trainer_id from public.resolve_client_invite(p_code => 'ZZZZZZ') $$,
  'resolve: an old code and a code of nobody give the same answer (SHOP-4)'
);
select results_eq(
  $$ select status from public.resolve_client_invite('x', 'y') $$, $$ values ('invalid'::text) $$,
  'resolve: a token and a code together are invalid'
);
select tests.authenticate_as('trainer_a');
select results_eq(
  $$ select status from public.resolve_client_invite((select token from tests.links where name = 'third')) $$,
  $$ values ('own'::text) $$,
  'resolve: the trainer sees their own link as own'
);

-- =========================================================================================================
-- join_by_invite and join_by_code

select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.join_by_invite((select token from tests.links where name = 'third')) $$, '42501', null,
  'join: anon cannot call it'
);

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.join_by_invite((select token from tests.links where name = 'third')) $$, 'P0001', 'own_invite',
  'join: a trainer cannot become their own client'
);

select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.join_by_invite((select token from tests.links where name = 'first')) $$, 'P0001', 'invite_invalid',
  'join: a reissued link does not work (SHOP-3)'
);
select throws_ok(
  $$ select public.join_by_code('ZZZZZZ') $$, 'P0001', 'invite_invalid', 'join: a wrong code raises invite_invalid (SHOP-4)'
);
select throws_ok(
  $$ select public.join_by_code((select code from tests.links where name = 'first')) $$, 'P0001', 'invite_invalid',
  'join: an archived code raises the same invite_invalid (SHOP-4)'
);
select throws_ok($$ select public.join_by_invite(null) $$, 'P0001', 'invite_invalid', 'join: no token is invalid');

create temporary table joined (name text, coaching_id uuid) on commit drop;
grant select, insert on joined to authenticated;
insert into joined select 'c', public.join_by_invite((select token from tests.links where name = 'third'));
select tests.clear_authentication();

select results_eq(
  $$ select c.id, c.status::text, c.source::text, c.client_invite_id from public.coachings c
     where c.trainer_id = tests.u('trainer_a') and c.client_id = tests.u('client_c') $$,
  $$ select (select coaching_id from joined where name = 'c'), 'active', 'client_invite', invite_id
     from tests.links where name = 'third' $$,
  'join: the link creates an active pair without the trainer (SHOP-2)'
);
select is(
  (select uses_count from public.client_invites where id = (select invite_id from tests.links where name = 'third')), 1,
  'join: the link counts the use'
);
select results_eq(
  $$ select type::text, user_id, payload ->> 'coaching_id', payload ->> 'first_name' from public.notification_outbox
     where user_id = tests.u('trainer_a') $$,
  $$ select 'coaching_created', tests.u('trainer_a'), coaching_id::text, 'client_c' from joined where name = 'c' $$,
  'join: the trainer gets one "new client" message (Т7)'
);
select is(
  (select last_zone::text from public.user_settings where user_id = tests.u('client_c')), 'client',
  'join: the client zone opens next time'
);
select ok(
  (select intake = false and intake_decided_at is null and photos = false from public.data_shares
   where coaching_id = (select coaching_id from joined where name = 'c')),
  'join: the new pair hides the intake and photos until the client decides'
);

select tests.authenticate_as('client_c');
select is(
  public.join_by_code((select code from tests.links where name = 'third')), (select coaching_id from joined where name = 'c'),
  'join again: the live pair comes back, no duplicate'
);
select results_eq(
  $$ select status, coaching_id from public.resolve_client_invite((select token from tests.links where name = 'third')) $$,
  $$ select 'joined'::text, coaching_id from joined where name = 'c' $$,
  'resolve: a live client sees joined with their pair'
);
select tests.clear_authentication();
select is(
  (select uses_count from public.client_invites where id = (select invite_id from tests.links where name = 'third')), 1,
  'join again: no second use is counted'
);
select is(
  (select count(*)::int from public.notification_outbox where user_id = tests.u('trainer_a')), 1,
  'join again: the trainer gets no second message'
);

-- The code works with separators and in lower case; the pair remembers it came from the code.
select tests.authenticate_as('client_d');
select lives_ok(
  $$ select public.join_by_code(lower(substr(code, 1, 3) || '-' || substr(code, 4))) from tests.links where name = 'b' $$,
  'join by code: dashes and lower case are fine'
);
select tests.clear_authentication();
select is(
  (select source::text from public.coachings where trainer_id = tests.u('trainer_b') and client_id = tests.u('client_d')),
  'trainer_code', 'join by code: the pair source is trainer_code'
);

-- An ended pair comes back with default shares (same row, history kept).
update public.coachings set status = 'ended', ended_at = now(), end_reason = 'moved'
where trainer_id = tests.u('trainer_b') and client_id = tests.u('client_d');
select tests.set_share('trainer_b', 'client_d', 'photos', true);
select tests.set_share('trainer_b', 'client_d', 'intake', true);
select tests.authenticate_as('client_d');
select results_eq(
  $$ select status from public.resolve_client_invite((select token from tests.links where name = 'b')) $$,
  $$ values ('valid'::text) $$,
  'resolve: after an ended pair the link is valid again'
);
select is(
  public.join_by_invite((select token from tests.links where name = 'b')), tests.pair_id('trainer_b', 'client_d'),
  'rejoin: the ended pair row is restored'
);
select tests.clear_authentication();
select ok(
  (select status = 'active' and ended_at is null and end_reason is null from public.coachings
   where id = tests.pair_id('trainer_b', 'client_d')),
  'rejoin: the pair is active and the end fields are cleared'
);
select ok(
  (select photos = false and intake = false and intake_decided_at is null from public.data_shares
   where coaching_id = tests.pair_id('trainer_b', 'client_d')),
  'rejoin: data shares are back to the defaults'
);

-- Link limits.
update public.client_invites set max_uses = 1 where id = (select invite_id from tests.links where name = 'third');
select tests.authenticate_as('client_e');
select throws_ok(
  $$ select public.join_by_invite((select token from tests.links where name = 'third')) $$, 'P0001', 'invite_invalid',
  'join: a used-up link is invalid'
);
select tests.clear_authentication();
update public.client_invites set max_uses = null, expires_at = now() - interval '1 minute'
where id = (select invite_id from tests.links where name = 'third');
select tests.authenticate_as('client_e');
select throws_ok(
  $$ select public.join_by_invite((select token from tests.links where name = 'third')) $$, 'P0001', 'invite_invalid',
  'join: an expired link is invalid'
);
select tests.clear_authentication();

-- A blocked trainer: nothing about them is shown and nobody joins.
update public.profiles set blocked_at = now(), blocked_reason = 'test' where id = tests.u('trainer_b');
select tests.authenticate_as_anon();
select results_eq(
  $$ select status, trainer_id, first_name from public.resolve_client_invite((select token from tests.links where name = 'b')) $$,
  $$ values ('unavailable'::text, null::uuid, null::text) $$,
  'resolve: a blocked trainer is unavailable, without the card'
);
select tests.authenticate_as('client_e');
select throws_ok(
  $$ select public.join_by_invite((select token from tests.links where name = 'b')) $$, 'P0001', 'trainer_unavailable',
  'join: nobody joins a blocked trainer'
);
select tests.clear_authentication();

-- =========================================================================================================
-- Free limit (PLAN-1) and the card exception (PLAN-9)

select tests.create_pair('trainer_full', 'fill_1');
select tests.create_pair('trainer_full', 'fill_2');
select tests.create_pair('trainer_full', 'fill_3');
select tests.authenticate_as('client_e');
select throws_ok(
  $$ select public.join_by_invite((select token from tests.links where name = 'full')) $$, 'P0001', 'plan_limit_reached',
  'limit: a Free trainer with 3 live clients gets no 4th by link'
);
select throws_ok(
  $$ select public.join_by_code((select code from tests.links where name = 'full')) $$, 'P0001', 'plan_limit_reached',
  'limit: nor by code'
);
select tests.clear_authentication();
select is(
  (select uses_count from public.client_invites where id = (select invite_id from tests.links where name = 'full')), 0,
  'limit: a refused join counts no use'
);
select tests.grant_plan('trainer_full', 'trainer_pro');
select tests.authenticate_as('client_e');
select lives_ok(
  $$ select public.join_by_invite((select token from tests.links where name = 'full')) $$,
  'limit: with Pro the same join works (PLAN-2)'
);
select tests.clear_authentication();

select tests.create_card('trainer_card', 'card_k');
select tests.create_pair('trainer_card', 'fill_1');
select tests.create_pair('trainer_card', 'fill_2');
select tests.authenticate_as('client_e');
insert into joined select 'card', public.join_by_invite((select token from tests.links where name = 'card'));
select tests.clear_authentication();
select is(
  (select status::text from public.coachings where id = (select coaching_id from joined where name = 'card')), 'active',
  'card exception: a Free trainer at the limit with a card still gets the pair (PLAN-9)'
);
select results_eq(
  $$ select trainer_id, claimant_id, status::text from public.managed_client_claims
     where new_coaching_id = (select coaching_id from joined where name = 'card') $$,
  $$ values (tests.u('trainer_card'), tests.u('client_e'), 'pending') $$,
  'card exception: a pending "Is this <name>?" claim is created'
);
select results_eq(
  $$ select type::text from public.notification_outbox where user_id = tests.u('trainer_card') $$,
  $$ values ('managed_client_claim') $$,
  'card exception: the trainer gets the claim message (Т7a) instead of "new client"'
);

-- =========================================================================================================
-- No direct writes

select tests.authenticate_as('stranger_s');
select throws_ok(
  $$ insert into public.coachings (trainer_id, client_id, source) values (tests.u('trainer_a'), tests.u('stranger_s'), 'client_invite') $$,
  '42501', null, 'direct: a user cannot insert a pair'
);
select is_empty(
  $$ update public.client_invites set label = 'mine' returning 1 $$, 'direct: a stranger changes no link'
);
select tests.clear_authentication();

select * from finish();
rollback;
