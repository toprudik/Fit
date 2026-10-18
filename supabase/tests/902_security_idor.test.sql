-- Cross-tenant access (IDOR) and privilege escalation, as each role (data-model §4.2, §4.3; wave-3 §1 rule 3).
-- 950_privacy_matrix covers direct table reads and blind writes per table; this file covers the RPC surface
-- with someone else's ids, role escalation, writing rows under another user's id, the delegate and money, an
-- ended pair, and a revoked delegation.
--
-- Fixtures: the victim side is trainer A with client D (a live pair with a row in every pair table) and client E
-- (an ended pair). X is A's assistant for D with every scope a delegation allows (never passes or payments).
-- The attacker side is trainer B with client C and a plain user S; neither has anything to do with A, D or E.
begin;
\ir _helpers.psql
select plan(65);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_trainer('trainer_x');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_d');
select tests.create_pair('trainer_a', 'client_e');
select tests.create_pair('trainer_b', 'client_c');
select tests.set_share(t, c, s, true)
from (values ('trainer_a', 'client_d'), ('trainer_a', 'client_e'), ('trainer_b', 'client_c')) p (t, c),
     unnest(enum_range(null::public.share_category)) s;
update public.trainer_profiles set verification_status = 'verified', verified_at = now()
where user_id = tests.user_id('trainer_x');

delete from public.exercises where source = 'wger';
insert into public.exercises (id, source, wger_id, name, license)
values ('00000000-0000-4000-8000-000000000902', 'wger', 902, 'Squat', 'CC-BY-SA-4.0');

-- Trainer-owned rows: a place, an open slot, a package, a payment link, a client link, a trial link, a custom
-- exercise and a workout template.
create function tests.fill_trainer(p_trainer text) returns void language plpgsql set search_path = '' as $$
declare
  v_trainer uuid := tests.user_id(p_trainer);
  v_workout uuid;
begin
  insert into public.locations (trainer_id, name) values (v_trainer, 'Gym of ' || p_trainer);
  insert into public.slots (trainer_id, starts_at, ends_at) values (v_trainer, now() + interval '5 days', now() + interval '5 days 1 hour');
  insert into public.packages (trainer_id, title, sessions_count, price_minor, currency) values (v_trainer, 'Pack of ' || p_trainer, 10, 10000, 'RUB');
  insert into public.payment_links (trainer_id, title, url) values (v_trainer, 'SBP', 'https://pay.example.com/' || p_trainer);
  insert into public.client_invites (trainer_id, label) values (v_trainer, 'QR');
  insert into public.trial_links (trainer_id, title, currency) values (v_trainer, 'Trial', 'RUB');
  insert into public.exercises (source, owner_id, name) values ('custom', v_trainer, 'Move of ' || p_trainer);
  insert into public.workout_templates (owner_id, title) values (v_trainer, 'Template') returning id into v_workout;
  insert into public.workout_template_items (template_id, position, exercise_id)
  values (v_workout, 1, '00000000-0000-4000-8000-000000000902');
end $$;
select tests.fill_trainer('trainer_a');
select tests.fill_trainer('trainer_b');

-- One row of every pair table: a note, a repeat, a session with a booking and its event, a check-in, a waitlist
-- entry, a pass with a freeze and a payment, a pair log, a measurement, a contact request, homework, a nutrition
-- target, a group with a broadcast and a challenge, a food comment and a referral code.
create function tests.fill_pair(p_trainer text, p_client text) returns void language plpgsql set search_path = '' as $$
declare
  v_pair    uuid := tests.pair_id(p_trainer, p_client);
  v_trainer uuid := tests.user_id(p_trainer);
  v_client  uuid := tests.user_id(p_client);
  v_session uuid;
  v_booking uuid;
  v_pass    uuid;
  v_log     uuid;
  v_le      uuid;
  v_group   uuid;
  v_challenge uuid;
begin
  insert into public.coaching_notes (coaching_id, author_id, body, visible_to_client)
  values (v_pair, v_trainer, 'Note of ' || p_trainer, true);
  insert into public.recurrences (trainer_id, coaching_id, rrule, dtstart_local, time_zone, duration_min, kind)
  values (v_trainer, v_pair, 'FREQ=WEEKLY;BYDAY=MO', '2026-10-19 10:00', 'Europe/Moscow', 60, 'personal');
  v_session := tests.create_session(p_trainer, now() + interval '1 day');
  v_booking := tests.create_booking(v_session, p_trainer, p_client);
  insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason)
  values (v_booking, null, 'confirmed', v_trainer, 'trainer', 'test');
  insert into public.check_ins (booking_id, client_id, trainer_id, method, recorded_by)
  values (v_booking, v_client, v_trainer, 'qr', v_client);
  insert into public.waitlist_entries (session_id, coaching_id, client_id, trainer_id)
  values (v_session, v_pair, v_client, v_trainer);
  v_pass := tests.create_pass(p_trainer, p_client, 10, 10000);
  insert into public.pass_freezes (pass_id, period, reason)
  values (v_pass, daterange(current_date + 10, current_date + 12), 'trip');
  insert into public.payments (coaching_id, pass_id, amount_minor, currency, method, paid_at, status)
  values (v_pair, v_pass, 10000, 'RUB', 'cash', now(), 'confirmed');
  insert into public.workout_logs (client_id, coaching_id, performed_at, local_date, created_by)
  values (v_client, v_pair, now() - interval '1 day', current_date - 1, v_trainer)
  returning id into v_log;
  insert into public.workout_log_exercises (log_id, position, exercise_id)
  values (v_log, 1, '00000000-0000-4000-8000-000000000902') returning id into v_le;
  insert into public.workout_sets (log_exercise_id, position, reps, weight_kg) values (v_le, 1, 5, 60);
  insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by)
  values (v_client, 'waist', 80, now(), current_date, v_trainer);
  insert into public.contact_requests (coaching_id, requester_id, recipient_id) values (v_pair, v_trainer, v_client);
  with h as (
    insert into public.homework (coaching_id, title, due_date) values (v_pair, 'Plank', current_date + 1) returning id)
  insert into public.homework_occurrences (homework_id, due_on) select h.id, current_date + 1 from h;
  insert into public.nutrition_targets (source, client_id, coaching_id, kcal, effective_from, set_by)
  values ('trainer', v_client, v_pair, 1800, current_date, v_trainer);
  insert into public.groups (trainer_id, name, goal) values (v_trainer, 'Group of ' || p_trainer, 'lose') returning id into v_group;
  insert into public.group_members (group_id, coaching_id, client_id) values (v_group, v_pair, v_client);
  insert into public.broadcasts (trainer_id, group_id, body, created_by) values (v_trainer, v_group, 'Hello', v_trainer);
  insert into public.challenges (trainer_id, group_id, title, metric, starts_on, ends_on)
  values (v_trainer, v_group, 'Steps', 'steps', current_date, current_date + 13) returning id into v_challenge;
  insert into public.challenge_participants (challenge_id, coaching_id, user_id) values (v_challenge, v_pair, v_client);
  insert into public.food_day_comments (client_id, coaching_id, author_id, local_date, body)
  values (v_client, v_pair, v_trainer, current_date, 'More protein');
  insert into public.referral_codes (coaching_id, code) values (v_pair, left(md5(v_pair::text), 10));
end $$;
select tests.fill_pair('trainer_a', 'client_d');
select tests.fill_pair('trainer_a', 'client_e');
select tests.fill_pair('trainer_b', 'client_c');

-- Personal rows of a client: a self log, a weight, a photo, an intake, a goal, a body profile, a calculator
-- target, a food and a dish, a diary entry, steps and water, feedback, a consent, a calendar feed, a story card.
create function tests.fill_client(p_client text) returns void language plpgsql set search_path = '' as $$
declare
  v_client uuid := tests.user_id(p_client);
  v_log    uuid;
  v_le     uuid;
  v_photo  uuid := gen_random_uuid();
  v_food   uuid;
  v_dish   uuid;
begin
  insert into public.workout_logs (client_id, performed_at, local_date, created_by)
  values (v_client, now(), current_date, v_client) returning id into v_log;
  insert into public.workout_log_exercises (log_id, position, exercise_id)
  values (v_log, 1, '00000000-0000-4000-8000-000000000902') returning id into v_le;
  insert into public.workout_sets (log_exercise_id, position, reps, weight_kg) values (v_le, 1, 5, 100);
  insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by)
  values (v_client, 'weight', 80, now(), current_date, v_client);
  insert into public.progress_photos (id, client_id, angle, taken_on, storage_path, face_blurred, blur_method, width, height)
  values (v_photo, v_client, 'front', current_date, v_client::text || '/' || v_photo::text || '.webp', true, 'auto', 1080, 1440);
  insert into public.intakes (user_id, form_version, answers, parq_answers)
  values (v_client, 'v1', '{"goal": "strength"}', '{"q1": false}');
  insert into public.client_goals (user_id, goal) values (v_client, 'lose');
  insert into public.body_profiles (user_id, calc_sex, birth_date, height_cm, activity_level)
  values (v_client, 'female', '1995-05-05', 165, 'moderate');
  insert into public.foods (source, owner_id, name, kcal_100g) values ('custom', v_client, 'Pancake of ' || p_client, 220)
  returning id into v_food;
  insert into public.foods (source, kind, owner_id, name, kcal_100g, serving_g)
  values ('custom', 'dish', v_client, 'Pancakes of ' || p_client, 220, 300) returning id into v_dish;
  insert into public.food_dish_items (dish_id, position, food_id, grams) values (v_dish, 0, v_food, 300);
  insert into public.food_diary_entries (client_id, local_date, meal, food_id, title, grams, kcal)
  values (v_client, current_date, 'breakfast', v_food, 'Pancake', 100, 220);
  insert into public.activity_entries (client_id, local_date, metric, value)
  values (v_client, current_date, 'steps', 8000), (v_client, current_date, 'water', 250);
  insert into public.feedback (user_id, kind, body) values (v_client, 'bug', 'Bug of ' || p_client);
  insert into public.consents (user_id, kind, version) values (v_client, 'beta_terms', '2026-11-beta');
  insert into public.calendar_feeds (user_id, zone, token_hash) values (v_client, 'client', sha256(convert_to(p_client, 'UTF8')));
  insert into public.story_cards (user_id, month, kind, data) values (v_client, '2026-09-01', 'sessions', '{"count": 2}');
end $$;
select tests.fill_client('client_d');
select tests.fill_client('client_e');
select tests.fill_client('client_c');
insert into public.reviews (coaching_id, client_id, trainer_id, rating, body)
values (tests.pair_id('trainer_a', 'client_d'), tests.user_id('client_d'), tests.user_id('trainer_a'), 2, 'Review of client_d');

-- C reports a payment to B (the client may still edit it, never confirm it).
insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status)
values (tests.pair_id('trainer_b', 'client_c'), 500, 'RUB', 'sbp', now(), 'reported');

-- X assists A with D: every scope but money (the table refuses passes and payments).
insert into public.delegations (owner_trainer_id, delegate_trainer_id, kind, scopes, status, accepted_at)
values (tests.user_id('trainer_a'), tests.user_id('trainer_x'), 'assistant',
        '{schedule,attendance,workouts,homework,notes,progress,nutrition}', 'active', now());
insert into public.delegation_clients (delegation_id, coaching_id)
select d.id, tests.pair_id('trainer_a', 'client_d') from public.delegations d where d.delegate_trainer_id = tests.user_id('trainer_x');

update public.coachings set status = 'ended', ended_at = now() where id = tests.pair_id('trainer_a', 'client_e');
update public.trainer_profiles set is_public = false where user_id = tests.user_id('trainer_a');

-- Victim ids by kind, named after the RPC parameters that take them (p_<kind>_id or p_<kind>).
create table tests.victim (k text primary key, v uuid);
insert into tests.victim
select 'pair', tests.pair_id('trainer_a', 'client_d')
union all select 'pair_e', tests.pair_id('trainer_a', 'client_e')
union all select 'reported_c', (select p.id from public.payments p where p.client_id = tests.user_id('client_c') and p.status = 'reported')
union all select 'client', tests.user_id('client_d')
union all select 'trainer', tests.user_id('trainer_a')
union all select 'session', (select b.session_id from public.bookings b where b.coaching_id = tests.pair_id('trainer_a', 'client_d'))
union all select 'booking', (select b.id from public.bookings b where b.coaching_id = tests.pair_id('trainer_a', 'client_d'))
union all select 'challenge', (select c.id from public.challenges c where c.trainer_id = tests.user_id('trainer_a') order by c.created_at limit 1)
union all select 'charge', (select l.id from public.ledger_entries l where l.coaching_id = tests.pair_id('trainer_a', 'client_d') limit 1)
union all select 'delegation', (select d.id from public.delegations d where d.owner_trainer_id = tests.user_id('trainer_a'))
union all select 'entry', (select w.id from public.waitlist_entries w where w.coaching_id = tests.pair_id('trainer_a', 'client_d'))
union all select 'feedback', (select f.id from public.feedback f where f.user_id = tests.user_id('client_d'))
union all select 'food', (select f.id from public.foods f where f.owner_id = tests.user_id('client_d') and f.kind <> 'dish')
union all select 'dish', (select f.id from public.foods f where f.owner_id = tests.user_id('client_d') and f.kind = 'dish')
union all select 'diary', (select f.id from public.food_diary_entries f where f.client_id = tests.user_id('client_d'))
union all select 'comment', (select f.id from public.food_day_comments f where f.client_id = tests.user_id('client_d'))
union all select 'group', (select g.group_id from public.group_members g where g.coaching_id = tests.pair_id('trainer_a', 'client_d'))
union all select 'homework', (select h.id from public.homework h where h.coaching_id = tests.pair_id('trainer_a', 'client_d'))
union all select 'occurrence', (select o.id from public.homework_occurrences o join public.homework h on h.id = o.homework_id
                                where h.coaching_id = tests.pair_id('trainer_a', 'client_d'))
union all select 'invite', (select i.id from public.client_invites i where i.trainer_id = tests.user_id('trainer_a'))
union all select 'location', (select l.id from public.locations l where l.trainer_id = tests.user_id('trainer_a'))
union all select 'log', (select l.id from public.workout_logs l where l.coaching_id = tests.pair_id('trainer_a', 'client_d'))
union all select 'package', (select p.id from public.packages p where p.trainer_id = tests.user_id('trainer_a'))
union all select 'pass', (select p.id from public.passes p where p.coaching_id = tests.pair_id('trainer_a', 'client_d'))
union all select 'payment', (select p.id from public.payments p where p.coaching_id = tests.pair_id('trainer_a', 'client_d'))
union all select 'photo', (select p.id from public.progress_photos p where p.client_id = tests.user_id('client_d'))
union all select 'recurrence', (select r.id from public.recurrences r where r.coaching_id = tests.pair_id('trainer_a', 'client_d'))
union all select 'request', (select r.id from public.contact_requests r where r.coaching_id = tests.pair_id('trainer_a', 'client_d'))
union all select 'review', (select r.id from public.reviews r where r.client_id = tests.user_id('client_d'))
union all select 'slot', (select s.id from public.slots s where s.trainer_id = tests.user_id('trainer_a'))
union all select 'story', (select s.id from public.story_cards s where s.user_id = tests.user_id('client_d'))
union all select 'exercise', (select e.id from public.exercises e where e.owner_id = tests.user_id('trainer_a'));

grant select on tests.victim to authenticated, anon;

create function tests.victim(p_k text) returns uuid language sql stable set search_path = '' as $$
  select v.v from tests.victim v where v.k = p_k
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 1. Every RPC with the victim's ids, as B, C and S.
--
-- Each RPC that authenticated may execute is called once per attacker. A uuid parameter gets the victim's id of
-- its kind (p_session_id → the victim's session, p_coaching_id → the pair, ...), other parameters a plain valid
-- value. Then two checks: no answer carries an id or name of A, D, E or X, and no row that mentions A, D, E or X
-- changed (writes through a definer function bypass RLS, so this is where a missing owner check shows).

create function tests.arg(p_fn text, p_name text, p_type oid) returns text language plpgsql set search_path = '' as $$
declare
  t text := replace(format_type(p_type, null), 'public.', '');
  k text;
begin
  if t = 'uuid' then
    k := case
      when p_name = 'p_id' and p_fn in ('hide_food_comment', 'edit_food_comment', 'delete_food_comment') then 'comment'
      when p_name = 'p_id' and p_fn = 'save_dish' then 'dish'
      when p_name = 'p_id' and p_fn = 'update_food_entry' then 'diary'
      when p_name = 'p_id' and p_fn = 'story_card' then 'story'
      when p_name = 'p_id' then 'food'
      when p_name in ('p_coaching', 'p_coaching_id', 'p_pair') then 'pair'
      when p_name in ('p_client', 'p_client_id', 'p_user', 'p_user_id', 'p_target_user', 'p_managed_client_id') then 'client'
      when p_name = 'p_trainer_id' then 'trainer'
      else regexp_replace(regexp_replace(p_name, '^p_', ''), '_id$', '')
    end;
    return coalesce(quote_literal(tests.victim(k)) || '::uuid', 'gen_random_uuid()');
  elsif t = 'uuid[]' then
    k := case p_name when 'p_exercises' then 'exercise' when 'p_coaching_ids' then 'pair' else 'session' end;
    return 'array[' || quote_nullable(tests.victim(k)) || ']::uuid[]';
  elsif t in ('integer', 'smallint', 'bigint', 'numeric') then
    return case when p_name like '%duration%' then '60' when p_name = 'p_kcal' then '2000' else '2' end || '::' || t;
  elsif t = 'text' then
    return case p_name when 'p_currency' then '''RUB''' when 'p_metric' then '''steps''' else '''x''' end;
  elsif t = 'boolean' then return 'true';
  elsif t = 'date' then return 'current_date + 2';
  elsif t = 'smallint[]' then return 'array[1]::smallint[]';
  elsif t like 'timestamp%' then return '(now() + interval ''2 days'')';
  elsif t = 'jsonb' then
    return case p_name when 'p_homework' then format('%L::jsonb', jsonb_build_object(
                                                'coaching_id', tests.victim('pair'), 'title', 'x', 'due_date', current_date + 2))
                       when 'p_template' then format('%L::jsonb', jsonb_build_object('id', tests.victim('exercise')))
                       else '''{}''::jsonb' end;
  elsif t like '%[]' then
    return 'array[(enum_range(null::public.' || replace(t, '[]', '') || '))[1]]';
  else
    return '(enum_range(null::public.' || t || '))[1]';
  end if;
end $$;

-- Per table, a digest of every row that mentions a victim user, read as postgres (no RLS).
create function tests.victim_digest(p_label text) returns void language plpgsql set search_path = '' as $$
declare
  r record;
  v_marks text := (select string_agg(id::text, '|') from tests.users
                   where handle in ('trainer_a', 'client_d', 'client_e', 'trainer_x'));
  v_digest text;
begin
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    execute format('select md5(coalesce(string_agg(md5(t::text), '','' order by md5(t::text)), '''')) from public.%I t where t::text ~ %L',
                   r.relname, v_marks)
    into v_digest;
    insert into tests.digest values (p_label, r.relname, v_digest);
  end loop;
end $$;

create table tests.calls (who text, fn text, outcome text);
grant all on tests.calls to public;
create table tests.digest (label text, rel text, digest text, primary key (label, rel));
select tests.victim_digest('before');

do $$
declare
  f record;
  v_args text;
  v_res text;
  v_who text;
begin
  foreach v_who in array array['trainer_b', 'client_c', 'stranger_s'] loop
    for f in
      select p.oid, p.proname, p.proargnames, p.proargtypes, p.pronargs from pg_proc p
      where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and p.prorettype <> 'trigger'::regtype
      order by p.proname, p.oid
    loop
      select string_agg(tests.arg(f.proname, f.proargnames[i], f.proargtypes[i - 1]), ', ' order by i)
      into v_args from generate_series(1, f.pronargs) i;
      begin
        perform tests.authenticate_as(v_who);
        execute format('select coalesce(string_agg(t::text, '' | ''), '''') from public.%I(%s) t', f.proname, coalesce(v_args, ''))
        into v_res;
        perform tests.clear_authentication();
        insert into tests.calls values (v_who, f.proname, 'ok ' || v_res);
      exception when others then
        insert into tests.calls values (v_who, f.proname, 'error ' || sqlstate);
      end;
    end loop;
  end loop;
end $$;
select tests.clear_authentication();
select tests.victim_digest('after');

select is(
  (select count(*)::int from tests.calls),
  (select 3 * count(*)::int from pg_proc p
   where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and p.prorettype <> 'trigger'::regtype),
  'the sweep called every RPC as each attacker'
);
select is(array(select k from tests.victim where v is null order by 1), '{}'::text[], 'every victim id of the sweep exists');
select is(
  array(
    select c.who || ' ' || c.fn from tests.calls c
    where c.outcome ~ (select string_agg(u.id::text || '|' || u.handle, '|') from tests.users u
                       where u.handle in ('trainer_a', 'client_d', 'client_e', 'trainer_x'))
       or c.outcome ~ (select string_agg(v.v::text, '|') from tests.victim v)
    order by 1
  ),
  '{}'::text[],
  'no RPC answers B, C or S with an id or name of A, D, E or X'
);
select is(
  array(
    select b.rel from tests.digest b join tests.digest a on a.label = 'after' and a.rel = b.rel
    where b.label = 'before' and a.digest <> b.digest
    order by 1
  ),
  '{}'::text[],
  'no RPC called by B, C or S changes a row that mentions A, D, E or X'
);

-- ---------------------------------------------------------------------------------------------------------
-- 2. Nobody raises their own role.
select tests.authenticate_as('client_c');
select throws_ok($$ insert into public.user_roles (user_id, role) values (auth.uid(), 'admin') $$, '42501', null,
  'a client cannot make themselves admin');
select throws_ok($$ insert into public.trainer_profiles (user_id, slug) values (auth.uid(), 'self-made') $$, '42501', null,
  'a client cannot make themselves a trainer');
select throws_ok($$ update public.profiles set managed_by_trainer_id = null where id = auth.uid() $$, '42501', null,
  'a client cannot update their profile row directly');
select throws_ok($$ insert into public.plan_grants (user_id, plan_code, reason) values (auth.uid(), 'client_pro', 'free') $$, '42501', null,
  'a client cannot grant themselves a plan');
select throws_ok(format($$ update public.coachings set debt_limit_sessions = 99, self_book_on_debt = true where id = %L $$,
                        tests.pair_id('trainer_b', 'client_c')),
  '42501', 'forbidden', 'a client cannot change the debt settings of their pair');
select throws_ok(format($$ update public.payments set status = 'confirmed' where id = %L $$, tests.victim('reported_c')),
  '42501', 'forbidden', 'a client cannot confirm a payment');
select throws_ok($$ select * from public.admin_search_users('client') $$, '42501', null,
  'a client cannot run an admin RPC');
select tests.authenticate_as('trainer_b');
select throws_ok($$ update public.trainer_profiles set verification_status = 'verified' where user_id = auth.uid() $$, '42501', null,
  'a trainer cannot verify themselves');
select is_empty(format($$ update public.data_shares set photos = false where coaching_id = %L returning 1 $$,
                       tests.pair_id('trainer_b', 'client_c')),
  'a trainer cannot change what the client shares');
select throws_ok($$ select * from public.admin_user_card(auth.uid()) $$, '42501', null,
  'a trainer cannot run an admin RPC');

-- ---------------------------------------------------------------------------------------------------------
-- 3. Rows under another user's id.
select tests.authenticate_as('client_c');
select throws_ok(format($$ insert into public.consents (user_id, kind, version) values (%L, 'beta_terms', 'v') $$, tests.user_id('client_d')),
  '42501', null, 'a consent cannot be given for another user');
select throws_ok(format($$ insert into public.feedback (user_id, kind, body) values (%L, 'bug', 'x') $$, tests.user_id('client_d')),
  '42501', null, 'feedback cannot be sent as another user');
select throws_ok(format($$ insert into public.intakes (user_id, form_version, answers, parq_answers) values (%L, 'v1', '{}', '{}') $$,
                        tests.user_id('client_d')),
  '42501', null, 'an intake cannot be filed for another user');
select throws_ok(format($$ insert into public.body_profiles (user_id, calc_sex, birth_date, height_cm, activity_level)
                           values (%L, 'male', '1990-01-01', 180, 'moderate') $$, tests.user_id('client_d')),
  '42501', null, 'a body profile cannot be written for another user');
select throws_ok(format($$ insert into public.notification_preferences (user_id, type, enabled) values (%L, 'debt', false) $$,
                        tests.user_id('client_d')),
  '42501', null, 'notification preferences cannot be written for another user');
select throws_ok(format($$ insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status)
                           values (%L, 1, 'RUB', 'cash', now(), 'reported') $$, tests.victim('pair')),
  '42501', null, 'a client cannot report a payment in another pair');
select throws_ok(format($$ insert into public.payments (coaching_id, trainer_id, client_id, amount_minor, currency, method, paid_at, status)
                           values (%L, %L, auth.uid(), 1, 'RUB', 'cash', now(), 'reported') $$,
                        tests.victim('pair'), tests.user_id('trainer_a')),
  '23503', null, 'a client cannot report a payment in another pair under their own id');
select throws_ok(format($$ insert into public.access_requests (user_id, plan_code) values (%L, 'client_pro') $$, tests.user_id('client_d')),
  '42501', null, 'a plan request cannot be filed for another user');
select is_empty(format($$ update public.user_settings set display_name = 'Hijacked' where user_id = %L returning 1 $$, tests.user_id('client_d')),
  'a client cannot change another user''s settings');
select tests.authenticate_as('trainer_b');
select throws_ok(format($$ insert into public.coaching_notes (coaching_id, author_id, body) values (%L, auth.uid(), 'x') $$,
                        tests.victim('pair')),
  '42501', null, 'a trainer cannot add a note to another trainer''s pair');
select throws_ok(format($$ insert into public.coaching_notes (coaching_id, author_id, body) values (%L, %L, 'x') $$,
                        tests.pair_id('trainer_b', 'client_c'), tests.user_id('trainer_a')),
  '42501', null, 'a trainer cannot sign a note with another trainer''s id');
select throws_ok(format($$ insert into public.packages (trainer_id, title, sessions_count, price_minor, currency) values (%L, 'x', 1, 1, 'RUB') $$,
                        tests.user_id('trainer_a')),
  '42501', null, 'a trainer cannot create a package for another trainer');
select throws_ok(format($$ insert into public.sessions (trainer_id, kind, starts_at, ends_at, mode)
                           values (%L, 'personal', now() + interval '3 days', now() + interval '3 days 1 hour', 'online') $$,
                        tests.user_id('trainer_a')),
  '42501', null, 'a trainer cannot put a session into another trainer''s schedule');
select throws_ok(format($$ insert into public.locations (trainer_id, name) values (%L, 'x') $$, tests.user_id('trainer_a')),
  '42501', null, 'a trainer cannot add a place for another trainer');
select throws_ok(format($$ insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status)
                           values (%L, 1, 'RUB', 'cash', now(), 'confirmed') $$, tests.victim('pair')),
  '42501', null, 'a trainer cannot enter a payment in another trainer''s pair');
select throws_ok(format($$ select public.create_session(%L, now() + interval '3 days', 60::smallint, 'online') $$, tests.victim('pair')),
  '42501', 'not_your_client', 'a trainer cannot book another trainer''s client');
select throws_ok(format($$ select public.create_session(%L, now() + interval '3 days', 60::smallint, 'offline', %L) $$,
                        tests.pair_id('trainer_b', 'client_c'), tests.victim('location')),
  '22023', 'invalid_location', 'a trainer cannot hold a session at another trainer''s place');
select throws_ok(format($$ select public.save_workout_log(%L::jsonb) $$, jsonb_build_object(
                          'client_id', tests.user_id('client_d'), 'coaching_id', tests.victim('pair'),
                          'performed_at', now(), 'exercises', jsonb_build_array(jsonb_build_object(
                            'exercise_id', '00000000-0000-4000-8000-000000000902', 'sets', jsonb_build_array(jsonb_build_object('reps', 1)))))),
  '42501', null, 'a trainer cannot log a workout into another trainer''s pair');
select throws_ok(format($$ select public.set_nutrition_target(%L, 2000) $$, tests.victim('pair')),
  '42501', null, 'a trainer cannot set a nutrition target in another trainer''s pair');
select is_empty(format($$ update public.workout_logs set notes = 'x' where client_id = %L returning 1 $$, tests.user_id('client_d')),
  'a trainer cannot edit another trainer''s client''s logs');
select is_empty(format($$ delete from public.measurements where client_id = %L returning 1 $$, tests.user_id('client_d')),
  'a trainer cannot delete another trainer''s client''s measurements');

-- ---------------------------------------------------------------------------------------------------------
-- 4. The assistant works with D but never sees or moves money (wave-3 §1 rule 3).
select tests.authenticate_as('trainer_x');
select results_eq('select count(*)::int from public.coachings', array[1], 'X sees the one pair it assists with');
select results_eq('select count(*)::int from public.homework', array[1], 'X sees the pair''s homework (homework scope)');
select is_empty('select 1 from public.passes', 'X reads no pass');
select is_empty('select 1 from public.payments', 'X reads no payment');
select is_empty('select 1 from public.ledger_entries', 'X reads no ledger row');
select is_empty('select 1 from public.money_events', 'X reads no money event');
select is_empty('select 1 from public.pass_balances', 'X reads no pass balance');
select is_empty($$ select 1 from public.coaching_balances where debt_amounts <> '{}' or unpaid_amounts <> '{}' or available_sessions <> 0 $$,
  'X sees no amount, debt or remaining sessions in coaching_balances');
select is_empty('select 1 from public.packages union all select 1 from public.price_grid union all select 1 from public.payment_links',
  'X reads none of A''s prices or payment links');
select throws_ok(format($$ select * from public.create_pass(%L, null, 'p', 5, 100, 'RUB') $$, tests.victim('pair')),
  'P0001', 'coaching_not_found', 'X cannot sell a pass');
select throws_ok(format($$ select public.adjust_pass(%L, 1, 'x') $$, tests.victim('pass')),
  'P0002', 'pass_not_found', 'X cannot adjust a pass');
select throws_ok(format($$ select public.cancel_pass(%L, 'x') $$, tests.victim('pass')),
  'P0001', 'pass_not_found', 'X cannot cancel a pass');
select throws_ok(format($$ select public.correct_payment(%L, 1, 'cash', now(), 'x') $$, tests.victim('payment')),
  'P0002', 'payment_not_found', 'X cannot correct a payment');
select throws_ok(format($$ insert into public.payments (coaching_id, amount_minor, currency, method, paid_at, status)
                           values (%L, 1, 'RUB', 'cash', now(), 'confirmed') $$, tests.victim('pair')),
  '42501', null, 'X cannot enter a payment');
select throws_ok($$ update public.delegations set scopes = '{workouts,passes}' $$, '42501', null, 'X cannot widen its own delegation');
select throws_ok(format($$ insert into public.delegation_clients (delegation_id, coaching_id) values (%L, %L) $$,
                        tests.victim('delegation'), tests.victim('pair_e')),
  '42501', null, 'X cannot add pairs to its delegation');
select throws_ok(format($$ select public.create_session(%L, now() + interval '3 days', 60::smallint, 'online') $$, tests.victim('pair_e')),
  '42501', 'not_your_client', 'X cannot act for a pair outside its delegation');

-- Once A revokes the delegation, X is back to nothing.
select tests.clear_authentication();
update public.delegations set status = 'revoked', revoked_at = now() where id = tests.victim('delegation');
select tests.authenticate_as('trainer_x');
select is_empty('select 1 from public.coachings union all select 1 from public.homework union all select 1 from public.coaching_notes',
  'after revocation X sees none of A''s pairs, homework or notes');
select throws_ok(format($$ select public.save_homework(%L::jsonb) $$, jsonb_build_object(
                          'coaching_id', tests.victim('pair'), 'title', 'x', 'due_date', current_date + 2)),
  'P0002', 'not_found', 'after revocation X cannot assign homework');

-- ---------------------------------------------------------------------------------------------------------
-- 5. A's pair with E has ended: the accounting stays, the personal data closes, nothing new goes in.
select tests.authenticate_as('trainer_a');
select results_eq(format('select count(*)::int from public.passes where client_id = %L', tests.user_id('client_e')), array[1],
  'A still reads the ended pair''s pass');
select results_eq(format('select count(*)::int from public.payments where client_id = %L', tests.user_id('client_e')), array[1],
  'A still reads the ended pair''s payment');
select is_empty(format($$ select 1 from public.measurements where client_id = %1$L
                         union all select 1 from public.food_diary_entries where client_id = %1$L
                         union all select 1 from public.progress_photos where client_id = %1$L
                         union all select 1 from public.intakes where user_id = %1$L
                         union all select 1 from public.body_profiles where user_id = %1$L
                         union all select 1 from public.activity_entries where client_id = %1$L
                         union all select 1 from public.workout_logs where client_id = %1$L and coaching_id is null $$,
                       tests.user_id('client_e')),
  'A reads none of E''s personal data after the pair ended');
select throws_ok(format($$ select public.add_food_comment(%L, current_date, 'x') $$, tests.victim('pair_e')),
  '42501', 'forbidden', 'A cannot comment on E''s food diary after the pair ended');
select throws_ok(format($$ select * from public.create_pass(%L, null, 'p', 5, 100, 'RUB') $$, tests.victim('pair_e')),
  'P0001', 'coaching_ended', 'A cannot sell E a pass after the pair ended');
select throws_ok(format($$ select public.save_homework(%L::jsonb) $$, jsonb_build_object(
                          'coaching_id', tests.victim('pair_e'), 'title', 'x', 'due_date', current_date + 2)),
  'P0001', 'pair_ended', 'A cannot assign E homework after the pair ended');
select throws_ok(format($$ insert into public.measurements (client_id, kind, value, measured_at, local_date, entered_by)
                           values (%L, 'weight', 1, now(), current_date, auth.uid()) $$, tests.user_id('client_e')),
  '42501', null, 'A cannot add E''s measurements after the pair ended');

-- ---------------------------------------------------------------------------------------------------------
-- 6. Without a session: no table, no RPC outside the public lookups.
select tests.authenticate_as_anon();
select throws_ok('select 1 from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.my_plan()', '42501', null, 'anon cannot call a signed-in RPC');
select is((public.get_trainer_showcase('trainer-a')).status, 'unavailable', 'anon gets no showcase for a non-public trainer');
select is(public.story_card(gen_random_uuid()), null, 'anon gets nothing for an unknown story card id');

select tests.clear_authentication();
select * from finish();
rollback;
