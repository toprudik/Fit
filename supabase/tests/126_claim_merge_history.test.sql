-- «Объединить» with a history on both sides (migration 20261023054219_claim_merge_keys.sql, PRD 2.5-3a): the card
-- has two passes and a past session, the person late-cancelled a booking and the trainer waived the charge. The
-- merge used to fail on the ledger row that points at its booking by (id, coaching_id). The person had opened
-- measurements, nutrition, steps and the intake on their own pair; the merge used to close them all
-- (20261024015847_claim_merge_keeps_shares.sql). The person's pair was a month older than the card, and the
-- merged pair kept the card's date (QA bug 27). Homework, groups and other rows of the person's pair went with it
-- by cascade (QA 45), and so did the card's groups with the card's user (QA 46).
begin;
\ir _helpers.psql
select plan(18);
select tests.create_trainer('trainer_a');
insert into public.consents (user_id, kind, version) values (tests.user_id('trainer_a'), 'trainer_dpa', '2026-10-18');
select tests.create_user('client_t');
create table tests.kv (name text primary key, id uuid);
grant all on tests.kv to authenticated;
create table tests.tok (token text);
grant all on tests.tok to authenticated;

select tests.authenticate_as('trainer_a');
insert into tests.kv values ('card_pair', public.create_managed_client('ТонРу', null, 'заметка'));
select public.create_pass((select id from tests.kv where name='card_pair'), null, 'Восемь', 8, 800000, 'RUB', 30, null, current_date, null, 400000, 'cash', now(), gen_random_uuid());
select public.create_pass((select id from tests.kv where name='card_pair'), null, 'Четыре', 4, 400000, 'RUB', 30, null, current_date, null, 400000, 'card', now(), gen_random_uuid());
select public.record_past_session((select id from tests.kv where name='card_pair'), now() - interval '2 days', 60::smallint, 'offline', null, 'attended', null);
insert into tests.tok select token from public.my_client_invite();
select tests.authenticate_as('client_t');
insert into tests.kv values ('new_pair', public.join_by_invite((select token from tests.tok)));
select tests.clear_authentication();
update public.data_shares
set measurements = true, nutrition = true, steps = true, intake = true, intake_decided_at = now()
where coaching_id = (select id from tests.kv where name='new_pair');
-- The person has hidden progress and nutrition from the trainer's assistants (QA 38).
insert into public.assistant_progress_blocks (coaching_id) values ((select id from tests.kv where name='new_pair'));
-- The trainer set a nutrition target on the card (QA 42).
insert into public.nutrition_targets (source, client_id, coaching_id, kcal, effective_from)
select 'trainer', c.client_id, c.id, 2000, current_date from public.coachings c where c.id = (select id from tests.kv where name='card_pair');
-- The person's own pair has homework, a group, a food diary comment and a newer trainer target (QA 45).
insert into public.homework (coaching_id, title, due_date)
values ((select id from tests.kv where name='new_pair'), 'Планка', current_date + 3);
insert into public.groups (trainer_id, name) values (tests.user_id('trainer_a'), 'Утро');
insert into public.group_members (group_id, coaching_id, client_id)
select g.id, (select id from tests.kv where name='new_pair'), tests.user_id('client_t') from public.groups g where g.name = 'Утро';
-- The trainer had put the card in the same group and in one more (QA 46).
insert into public.groups (trainer_id, name) values (tests.user_id('trainer_a'), 'Вечер');
insert into public.group_members (group_id, coaching_id, client_id)
select g.id, c.id, c.client_id from public.groups g, public.coachings c
where g.name in ('Утро', 'Вечер') and c.id = (select id from tests.kv where name='card_pair');
insert into public.food_day_comments (client_id, coaching_id, author_id, local_date, body)
values (tests.user_id('client_t'), (select id from tests.kv where name='new_pair'), tests.user_id('trainer_a'), current_date, 'Мало белка');
update public.nutrition_targets set created_at = now() - interval '1 day' where kcal = 2000;
insert into public.nutrition_targets (source, client_id, coaching_id, kcal, effective_from)
values ('trainer', tests.user_id('client_t'), (select id from tests.kv where name='new_pair'), 2500, current_date - 1);
-- The beta area's rows of the person's pair (QA 45): a review, a monthly report, their own «Приведи друга» link
-- and a friend they invited, with a bonus pass waiting for that friend's payment.
select tests.create_user('client_f');
select tests.create_pair('trainer_a', 'client_f');
select tests.authenticate_as('trainer_a');
select public.create_pass((select id from tests.kv where name='new_pair'), null, 'Бонус', 1, 100000, 'RUB', 30, null, current_date, null, 100000, 'cash', now(), gen_random_uuid());
select tests.clear_authentication();
insert into public.reviews (coaching_id, client_id, trainer_id, rating)
values ((select id from tests.kv where name='new_pair'), tests.user_id('client_t'), tests.user_id('trainer_a'), 5);
insert into public.monthly_report_shares (coaching_id, month, client_id, report)
values ((select id from tests.kv where name='new_pair'), date_trunc('month', current_date)::date, tests.user_id('client_t'), '{}');
insert into public.referral_codes (coaching_id, code) values ((select id from tests.kv where name='new_pair'), 'tonru12345');
with r as (
  insert into public.referrals (trainer_id, referrer_id, referee_id, coaching_id, referrer_coaching_id)
  values (tests.user_id('trainer_a'), tests.user_id('client_t'), tests.user_id('client_f'),
    tests.pair_id('trainer_a', 'client_f'), (select id from tests.kv where name='new_pair'))
  returning id)
insert into public.bonuses (referral_id, beneficiary_id, kind, sessions, pass_id, coaching_id)
select r.id, tests.user_id('client_t'), 'sessions', 1,
  (select id from public.passes where coaching_id = (select id from tests.kv where name='new_pair') order by created_at desc limit 1),
  (select id from tests.kv where name='new_pair')
from r;
-- The person chose «Без напоминаний» on their own pair (QA 39).
update public.coachings set client_reminder_offsets = '{}' where id = (select id from tests.kv where name='new_pair');
-- The person has trained with the trainer for a month already (QA bug 27).
update public.coachings set started_at = now() - interval '30 days' where id = (select id from tests.kv where name='new_pair');
insert into tests.kv values ('s3', tests.create_session('trainer_a', now() + interval '2 hours'));
insert into tests.kv values ('b3', tests.create_booking((select id from tests.kv where name='s3'), 'trainer_a', 'client_t', 'confirmed'));
select tests.authenticate_as('client_t');
select public.cancel_my_booking((select id from tests.kv where name='b3'), 'не успеваю', true);
select tests.authenticate_as('trainer_a');
select public.waive_charge((select id from public.ledger_entries where coaching_id = (select id from tests.kv where name='new_pair') and entry_type::text ~ 'charge' limit 1), 'прощаю');
select lives_ok(format('select public.resolve_managed_client_claim(%L, %L)',
  (select id from public.managed_client_claims where new_coaching_id = (select id from tests.kv where name='new_pair')),
  (select client_id from public.coachings where id = (select id from tests.kv where name='card_pair'))), 'merge');
select tests.clear_authentication();
select is(
  (select status::text from public.managed_client_claims where claimant_id = tests.user_id('client_t')),
  'merged', 'the claim is merged'
);
select results_eq(
  $$ select count(*)::int from public.bookings where coaching_id = (select id from tests.kv where name='card_pair') $$,
  $$ values (2) $$, 'the card''s past session and the person''s cancelled booking are on one pair'
);
select is(
  (select count(*)::int from public.ledger_entries
   where coaching_id = (select id from tests.kv where name='card_pair') and client_id <> tests.user_id('client_t')),
  0, 'every ledger row of the pair now belongs to the person'
);
select results_eq(
  $$ select measurements, nutrition, steps, intake, intake_decided_at is not null, photos, workouts
     from public.data_shares where coaching_id = (select id from tests.kv where name='card_pair') $$,
  $$ values (true, true, true, true, true, false, false) $$,
  'what the person shared on their own pair carries over to the merged pair'
);
select is(
  (select started_at from public.coachings where id = (select id from tests.kv where name='card_pair')),
  now() - interval '30 days',
  'the merged pair starts on the earlier of the two dates'
);
select ok(
  exists (select 1 from public.assistant_progress_blocks where coaching_id = (select id from tests.kv where name='card_pair')),
  'the person''s block on assistants carries over to the merged pair'
);
select is(
  (select client_reminder_offsets from public.coachings where id = (select id from tests.kv where name='card_pair')),
  '{}'::smallint[],
  'the person''s reminder choice carries over to the merged pair'
);
select is(
  (select client_id from public.nutrition_targets where coaching_id = (select id from tests.kv where name='card_pair') and kcal = 2000),
  tests.user_id('client_t'),
  'the trainer''s nutrition target on the card moves to the person'
);
select is(
  (select count(*)::int from public.homework where coaching_id = (select id from tests.kv where name='card_pair')),
  1, 'the person''s homework moves to the merged pair'
);
select is(
  (select count(*)::int from public.group_members
   where coaching_id = (select id from tests.kv where name='card_pair') and client_id = tests.user_id('client_t')),
  2, 'the person stays in their group and in the card''s groups'
);
select is(
  (select count(*)::int from public.food_day_comments where coaching_id = (select id from tests.kv where name='card_pair')),
  1, 'the trainer''s food diary comment stays'
);
select results_eq(
  $$ select kcal::int, effective_to is null from public.nutrition_targets
     where coaching_id = (select id from tests.kv where name='card_pair') and source = 'trainer' order by kcal $$,
  $$ values (2000, false), (2500, true) $$,
  'of two open trainer targets the newer stays open and the older closes'
);
select results_eq(
  $$ select (select count(*)::int from public.reviews where coaching_id = k.id),
            (select count(*)::int from public.monthly_report_shares where coaching_id = k.id),
            (select code from public.referral_codes where coaching_id = k.id)
     from tests.kv k where k.name = 'card_pair' $$,
  $$ values (1, 1, 'tonru12345') $$,
  'the person''s review, monthly report and r/<код> link move to the merged pair'
);
select is(
  (select status::text from public.referrals where referee_id = tests.user_id('client_f')),
  'pending', 'a friend the person invited stays pending'
);
select is(
  (select referrer_coaching_id from public.referrals where referee_id = tests.user_id('client_f')),
  (select id from tests.kv where name='card_pair'), 'and points at the merged pair'
);
select is(
  (select coaching_id from public.bonuses where beneficiary_id = tests.user_id('client_t')),
  (select id from tests.kv where name='card_pair'), 'the person''s bonus moves to the merged pair'
);
select isnt(
  (select pass_id from public.bonuses where beneficiary_id = tests.user_id('client_t')),
  null, 'and keeps its bonus pass'
);
select * from finish();
rollback;
