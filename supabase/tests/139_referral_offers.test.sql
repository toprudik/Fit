-- Referral offers, migrations 20261017040300_referral_offers.sql and 20261017152437_referral_bonus_active_pass.sql
-- (PRD wave-3 §3.1): the trainer's offer, the client's link, a friend joining by it, the bonus sessions in the
-- active pass after a payment that meets the offer, a bonus waiting for the next pass, taking it back when the
-- payment is voided, declining, and a pair that ends.
begin;
\ir _helpers.psql
select plan(38);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.create_user('client_c');
select tests.create_user('client_e');
select tests.create_user('friend_f');
select tests.create_user('friend_g');
select tests.create_user('friend_h');
select tests.create_user('friend_k');
select tests.create_user('friend_m');
select tests.create_user('friend_n');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_a', 'client_e');
update public.profiles set first_name = 'Анна' where id = tests.user_id('client_c');
update public.profiles set first_name = 'Фёдор' where id = tests.user_id('friend_f');

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.ids where name = p_name
$$;
create table tests.codes (name text primary key, code text not null);
grant select, insert on tests.codes to authenticated;
grant select on tests.codes to anon;
create function tests.code(p_name text) returns text language sql stable set search_path = '' as $$
  select code from tests.codes where name = p_name
$$;
-- Sessions left on a pass, and the pass of the offer's package in a pair.
create function tests.left_on(p_pass uuid) returns integer language sql stable set search_path = '' as $$
  select coalesce(sum(sessions_delta), 0)::integer from public.ledger_entries where pass_id = p_pass
$$;
create function tests.pack_pass(p_pair uuid) returns uuid language sql stable set search_path = '' as $$
  select p.id from public.passes p join public.packages k on k.id = p.package_id
  where p.coaching_id = p_pair and k.title = 'Pack 8' order by p.created_at limit 1
$$;
-- The sessions bonus a referral (by the friend's pair) gave to one side (by that side's pair).
create function tests.bonus(p_side uuid, p_friend uuid) returns public.bonuses language sql stable set search_path = '' as $$
  select b.* from public.bonuses b join public.referrals r on r.id = b.referral_id
  where r.coaching_id = p_friend and b.coaching_id = p_side
$$;

insert into tests.ids values ('pair_c', tests.pair_id('trainer_a', 'client_c')), ('pair_e', tests.pair_id('trainer_a', 'client_e'));
insert into tests.ids select 'pack', gen_random_uuid();
insert into public.packages (id, trainer_id, title, sessions_count, price_minor, currency)
values (tests.id('pack'), tests.user_id('trainer_a'), 'Pack 8', 8, 800000, 'RUB');
insert into tests.ids values ('pass_c', tests.create_pass('trainer_a', 'client_c', 5, 500000));

-- The trainer's offer
select tests.authenticate_as('trainer_b');
select throws_ok('select public.save_referral_offer(1)', 'P0001', 'plan_required', 'offer: Pro only');
select tests.authenticate_as('trainer_a');
select throws_ok('select public.save_referral_offer(6)', '22023', 'offer_invalid', 'offer: at most 5 sessions');
select throws_ok(format($$ select public.save_referral_offer(1, 0, 1000, 'RUB', %L) $$, tests.id('pack')),
  '22023', 'offer_invalid', 'offer: a sum or a package, not both');
insert into tests.ids select 'offer', public.save_referral_offer(2, 1, p_package_id => tests.id('pack'));
select results_eq('select referrer_sessions::integer, referee_sessions::integer, package_title, live from public.trainer_referral_offer()',
  $$ values (2, 1, 'Pack 8'::text, true) $$, 'offer: the trainer reads the live offer');

-- The client's link
select tests.authenticate_as('client_c');
insert into tests.codes select 'c', code from public.client_referral(tests.id('pair_c'));
select ok(tests.code('c') ~ '^[a-z0-9]{10}$', 'link: the client gets a personal code');
select is((select code from public.client_referral(tests.id('pair_c'))), tests.code('c'),
  'link: the same code next time');
select tests.authenticate_as('friend_f');
select is_empty(format($$ select * from public.client_referral(%L) $$, tests.id('pair_c')),
  'link: someone else''s pair gives nothing');

select tests.authenticate_as_anon();
select results_eq(format($$ select status, referrer_first_name, referee_sessions::integer from public.resolve_referral(%L) $$, tests.code('c')),
  $$ values ('valid'::text, 'Анна'::text, 1) $$, 'link: before sign-in it shows the trainer, who shares it and the friend''s bonus');
select tests.authenticate_as('client_c');
select is((select status from public.resolve_referral(tests.code('c'))), 'self', 'link: the client sees their own link');
select tests.authenticate_as('trainer_a');
select is((select status from public.resolve_referral(tests.code('c'))), 'own', 'link: the trainer sees their own');
select is((select status from public.resolve_referral('zzzzzzzzzz')), 'invalid', 'link: an unknown code is invalid');

-- A friend joins
select tests.authenticate_as('friend_f');
insert into tests.ids select 'pair_f', public.join_by_referral(tests.code('c'));
select tests.clear_authentication();
select is((select source::text from public.coachings where id = tests.id('pair_f')), 'referral', 'join: the friend is a client');
select results_eq(format($$ select status::text, referrer_id from public.referrals where coaching_id = %L $$, tests.id('pair_f')),
  format($$ values ('pending'::text, %L::uuid) $$, tests.user_id('client_c')), 'join: a pending referral of the client');
select tests.authenticate_as('client_e');
select is(public.join_by_referral(tests.code('c')), tests.id('pair_e'), 'join: an existing client keeps their pair');
select tests.clear_authentication();
select is((select count(*) from public.referrals where referee_id = tests.user_id('client_e')), 0::bigint,
  'join: an existing client is not counted (3.5)');
select tests.authenticate_as('trainer_a');
select results_eq('select status, referee ->> ''first_name'' from public.trainer_referrals()',
  $$ values ('pending'::text, 'Фёдор'::text) $$, 'join: the trainer sees it as pending (3.1)');

-- The payment
select public.create_pass(tests.id('pair_f'), p_title => 'One', p_sessions => 1, p_price_minor => 100000,
  p_currency => 'RUB', p_payment_minor => 100000, p_payment_method => 'cash');
select tests.clear_authentication();
select is((select status::text from public.referrals where coaching_id = tests.id('pair_f')), 'pending',
  'payment: a pass outside the offer''s package grants nothing (3.3)');
select tests.authenticate_as('trainer_a');
select public.create_pass(tests.id('pair_f'), p_package_id => tests.id('pack'), p_payment_minor => 800000,
  p_payment_method => 'cash');
select tests.clear_authentication();
select is((select status::text from public.referrals where coaching_id = tests.id('pair_f')), 'qualified',
  'payment: the package of the offer qualifies it (3.2)');
select is(tests.left_on(tests.id('pass_c')), 7, 'payment: the client gets 2 sessions in their active pass (3.6)');
select results_eq($$ select status::text, pass_id from tests.bonus(tests.id('pair_c'), tests.id('pair_f')) $$,
  $$ values ('granted'::text, tests.id('pass_c')) $$, 'payment: the bonus is granted with that pass');
select is(tests.left_on(tests.pack_pass(tests.id('pair_f'))), 9, 'payment: the friend gets their session in the pass they paid for');
select is((select count(*) from public.passes where is_bonus), 0::bigint, 'payment: no separate bonus pass');
select is((select coalesce(sum(amount_minor), 0) from public.ledger_entries where note = 'referral_bonus'), 0::numeric,
  'payment: the bonus sessions carry no money');
select ok(exists (select 1 from public.notification_outbox o where o.type = 'referral_bonus'
                  and o.user_id = tests.user_id('client_c') and (o.payload ->> 'sessions')::integer = 2),
  'payment: the client is told');
select tests.authenticate_as('client_c');
select is((select friends -> 0 ->> 'status' from public.client_referral(tests.id('pair_c'))), 'qualified',
  'payment: the client sees the friend paid');

-- The payment is voided within 14 days
select tests.authenticate_as('trainer_a');
update public.payments set status = 'voided', void_reason = 'mistake'
where coaching_id = tests.id('pair_f') and amount_minor = 800000;
select tests.clear_authentication();
select ok((select status::text from public.referrals where coaching_id = tests.id('pair_f')) = 'void'
          and (tests.bonus(tests.id('pair_c'), tests.id('pair_f'))).status = 'void'
          and tests.left_on(tests.id('pass_c')) = 5 and tests.left_on(tests.pack_pass(tests.id('pair_f'))) = 8,
  'void: unused bonus sessions are taken back (3.4)');

-- A partly used bonus
select tests.authenticate_as('friend_g');
insert into tests.ids select 'pair_g', public.join_by_referral(tests.code('c'));
select tests.authenticate_as('trainer_a');
select public.create_pass(tests.id('pair_g'), p_package_id => tests.id('pack'), p_payment_minor => 800000,
  p_payment_method => 'cash');
select tests.clear_authentication();
select is(tests.left_on(tests.id('pass_c')), 7, 'used: the bonus is in the pass again');
insert into public.ledger_entries (coaching_id, entry_type, pass_id, sessions_delta, amount_minor, occurred_at, charge_reason, note)
select tests.id('pair_c'), 'charge', tests.id('pass_c'), -1, 0, now(), 'manual', 'used' from generate_series(1, 6);
select tests.authenticate_as('trainer_a');
update public.payments set status = 'voided', void_reason = 'mistake'
where coaching_id = tests.id('pair_g') and amount_minor = 800000;
select tests.clear_authentication();
select ok(tests.left_on(tests.id('pass_c')) = 0 and tests.left_on(tests.pack_pass(tests.id('pair_g'))) = 8,
  'void: only the free part of a used bonus goes back');

-- No active pass: the bonus waits for the next one
select tests.authenticate_as('client_e');
insert into tests.codes select 'e', code from public.client_referral(tests.id('pair_e'));
select tests.authenticate_as('friend_m');
insert into tests.ids select 'pair_m', public.join_by_referral(tests.code('e'));
select tests.authenticate_as('friend_n');
insert into tests.ids select 'pair_n', public.join_by_referral(tests.code('e'));
select tests.authenticate_as('trainer_a');
select public.create_pass(tests.id('pair_m'), p_package_id => tests.id('pack'), p_payment_minor => 800000,
  p_payment_method => 'cash');
select public.create_pass(tests.id('pair_n'), p_package_id => tests.id('pack'), p_payment_minor => 800000,
  p_payment_method => 'cash');
select tests.clear_authentication();
select results_eq($$ select status::text, pass_id from tests.bonus(tests.id('pair_e'), tests.id('pair_m')) $$,
  $$ values ('pending'::text, null::uuid) $$, 'waiting: without an active pass the bonus is pending');
select ok(exists (select 1 from public.notification_outbox o where o.type = 'referral_bonus'
                  and o.user_id = tests.user_id('client_e') and (o.payload ->> 'waiting')::boolean),
  'waiting: the client is told it waits for the next pass');
select tests.authenticate_as('trainer_a');
update public.payments set status = 'voided', void_reason = 'mistake'
where coaching_id = tests.id('pair_n') and amount_minor = 800000;
select public.create_pass(tests.id('pair_e'), p_title => 'One', p_sessions => 1, p_price_minor => 100000,
  p_currency => 'RUB', p_payment_minor => 100000, p_payment_method => 'cash');
select tests.clear_authentication();
select ok((tests.bonus(tests.id('pair_e'), tests.id('pair_n'))).status = 'void'
          and (tests.bonus(tests.id('pair_e'), tests.id('pair_m'))).status = 'pending',
  'waiting: a voided payment voids its waiting bonus; a drop-in visit does not take the other');
select tests.authenticate_as('trainer_a');
select public.create_pass(tests.id('pair_e'), p_package_id => tests.id('pack'));
select tests.clear_authentication();
select results_eq($$ select status::text, pass_id from tests.bonus(tests.id('pair_e'), tests.id('pair_m')) $$,
  $$ values ('granted'::text, tests.pack_pass(tests.id('pair_e'))) $$, 'waiting: the next pass takes the bonus');
select ok(tests.left_on(tests.pack_pass(tests.id('pair_e'))) = 10
          and exists (select 1 from public.notification_outbox o where o.type = 'referral_bonus'
                      and o.user_id = tests.user_id('client_e') and (o.payload ->> 'applied')::boolean
                      and o.payload ->> 'pass_id' = tests.pack_pass(tests.id('pair_e'))::text),
  'waiting: its 2 sessions are in that pass and the client is told');

-- Declining and an ended pair
select tests.authenticate_as('friend_h');
insert into tests.ids select 'pair_h', public.join_by_referral(tests.code('c'));
select tests.clear_authentication();
insert into tests.ids select 'ref_h', id from public.referrals where coaching_id = tests.id('pair_h');
select tests.authenticate_as('trainer_b');
select throws_ok(format($$ select public.decline_referral(%L) $$, tests.id('ref_h')),
  'P0001', 'referral_not_found', 'decline: another trainer cannot decline it');
select tests.authenticate_as('trainer_a');
select public.decline_referral(tests.id('ref_h'));
select tests.clear_authentication();
select is((select void_reason::text from public.referrals where coaching_id = tests.id('pair_h')), 'declined',
  'decline: the trainer declines a pending referral');

select tests.authenticate_as('friend_k');
insert into tests.ids select 'pair_k', public.join_by_referral(tests.code('c'));
select tests.clear_authentication();
update public.coachings set status = 'ended', ended_at = now() where id = tests.id('pair_k');
select is((select void_reason::text from public.referrals where coaching_id = tests.id('pair_k')), 'pair_ended',
  'end: a pending referral is void when the pair ends');

-- Stopping the offer
select tests.authenticate_as('trainer_a');
select public.stop_referral_offer();
select tests.authenticate_as('client_c');
select is_empty(format($$ select * from public.client_referral(%L) $$, tests.id('pair_c')),
  'stop: the client has no offer to share');
select throws_ok('select * from public.referrals', '42501', null, 'tables: a client cannot read them directly');

select * from finish();
rollback;
