-- trainer_nutrition_adherence of migration 20261021224117_adherence_one_query.sql (one query over the roster) answers
-- what the loop of 20261020125317_adherence_scale.sql answered, for 7, 30 and 90 days, on the fixtures of
-- 979_adherence_scale.test.sql: frozen days, days not frozen yet, a frozen "no target" day, a target that changed, a
-- trainer target, a group template, no target at all, today, nutrition kept private, and a client with no diary.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.grant_plan('trainer_a', 'trainer_pro');
select tests.create_user(c) from unnest(array['client_c', 'client_d', 'client_e', 'client_f', 'client_g', 'client_h', 'client_i', 'client_j']) c;
select tests.create_pair('trainer_a', c) from unnest(array['client_c', 'client_d', 'client_e', 'client_f', 'client_g', 'client_h', 'client_j']) c;
select tests.create_pair('trainer_b', 'client_i');
select tests.set_share('trainer_a', c, 'nutrition', true) from unnest(array['client_c', 'client_d', 'client_e', 'client_f', 'client_g', 'client_j']) c;
select tests.set_share('trainer_a', 'client_h', 'nutrition', false);
select tests.set_share('trainer_b', 'client_i', 'nutrition', true);

create function tests.today(p_name text) returns date language sql stable security definer set search_path = '' as $$
  select private.client_today(tests.user_id(p_name))
$$;
create function tests.eat(p_name text, p_ago integer, p_kcal numeric) returns void language sql set search_path = '' as $$
  insert into public.food_diary_entries (client_id, local_date, meal, kcal)
  values (tests.user_id(p_name), tests.today(p_name) - p_ago, 'lunch', p_kcal)
$$;

-- c: the calculator's 2000, then 2500 from 5 days ago. d: a trainer target of 1800. e: no target of any kind.
-- f: only the template of A's group. g: a target set today for the past, so its frozen days say "no target".
-- h: a target, but nutrition kept private. i: B's client with 2200. j: shares nutrition, has eaten nothing yet.
insert into public.nutrition_targets (source, client_id, kcal, effective_from, effective_to, set_by)
values ('calculator', tests.user_id('client_c'), 2000, tests.today('client_c') - 60, tests.today('client_c') - 5, tests.user_id('client_c')),
       ('calculator', tests.user_id('client_c'), 2500, tests.today('client_c') - 5, null, tests.user_id('client_c')),
       ('calculator', tests.user_id('client_h'), 2000, tests.today('client_h') - 60, null, tests.user_id('client_h')),
       ('calculator', tests.user_id('client_i'), 2200, tests.today('client_i') - 60, null, tests.user_id('client_i'));
insert into public.nutrition_targets (source, client_id, coaching_id, kcal, effective_from, set_by)
values ('trainer', tests.user_id('client_d'), tests.pair_id('trainer_a', 'client_d'), 1800, tests.today('client_d') - 60,
        tests.user_id('trainer_a'));
insert into public.groups (trainer_id, name) values (tests.user_id('trainer_a'), 'Утро');
insert into public.group_members (group_id, coaching_id, client_id, added_at)
select g.id, tests.pair_id('trainer_a', 'client_f'), tests.user_id('client_f'), now() - interval '60 days'
from public.groups g where g.name = 'Утро';
insert into public.nutrition_targets (source, group_id, kcal, effective_from, set_by)
select 'group', g.id, 1600, tests.today('client_f') - 60, tests.user_id('trainer_a') from public.groups g where g.name = 'Утро';

-- Two months of days, every client, a few kcal around and off each target, today included.
select tests.eat(c, ago, 1500 + (ago * 137 + length(c) * 59) % 1200)
from unnest(array['client_c', 'client_d', 'client_e', 'client_f', 'client_g', 'client_h', 'client_i']) c,
     generate_series(0, 70) ago
where (ago + length(c)) % 4 <> 0;

-- Freeze the finished days, then forget a few so they resolve live, and give g its target only now.
select private.freeze_nutrition_days(100);
delete from private.nutrition_day_targets f
where f.client_id in (tests.user_id('client_c'), tests.user_id('client_d'), tests.user_id('client_f'))
  and f.day >= private.client_today(f.client_id) - 3;
insert into private.nutrition_day_targets (client_id, day, target_id)
select tests.user_id('client_g'), tests.today('client_g') - d, null from generate_series(1, 20) d;
insert into public.nutrition_targets (source, client_id, kcal, effective_from, set_by)
values ('calculator', tests.user_id('client_g'), 2100, tests.today('client_g') - 60, tests.user_id('client_g'));

-- The loop of 20261020125317_adherence_scale.sql.
create function tests.old_trainer_nutrition_adherence(p_days integer)
returns table (coaching_id uuid, client_id uuid, days integer, logged integer, counted integer, in_norm integer,
               adherence integer, previous_adherence integer, has_target boolean, last_day date)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_pair record;
  v_today date;
  v_now record;
  v_before record;
begin
  if v_user is null or p_days is null or p_days not in (7, 30, 90) then
    return;
  end if;
  for v_pair in
    select c.id, c.client_id
    from public.coachings c
    where c.trainer_id = v_user and c.status in ('trial', 'active')
  loop
    continue when not private.can_view(v_pair.client_id, 'nutrition');
    v_today := private.client_today(v_pair.client_id);
    select * into v_now from private.adherence_counts(v_pair.client_id, v_today - p_days, v_today - 1);
    select * into v_before from private.adherence_counts(v_pair.client_id, v_today - 2 * p_days, v_today - p_days - 1);
    return query select v_pair.id, v_pair.client_id, p_days, v_now.logged, v_now.counted, v_now.in_norm,
                        private.adherence_share(v_now.in_norm, v_now.counted),
                        private.adherence_share(v_before.in_norm, v_before.counted),
                        private.may_have_nutrition_target(v_pair.client_id)
                          and private.active_nutrition_target(v_pair.client_id, v_today) is not null,
                        (select pg_catalog.max(e.local_date) from public.food_diary_entries e
                         where e.client_id = v_pair.client_id);
  end loop;
end $$;

select tests.authenticate_as('trainer_a');
select is_empty(format($$
  (select * from public.trainer_nutrition_adherence(%1$s) except all select * from tests.old_trainer_nutrition_adherence(%1$s))
  union all
  (select * from tests.old_trainer_nutrition_adherence(%1$s) except all select * from public.trainer_nutrition_adherence(%1$s))
$$, d), 'trainer_nutrition_adherence(' || d || ') answers as before')
from unnest(array[7, 30, 90]) d;
-- The fixtures reach every branch, so "as before" is not "nothing to compare".
select is(
  (select array_agg(u.handle || ':' || a.logged || '/' || a.counted || ':' || a.has_target order by u.handle)
   from public.trainer_nutrition_adherence(30) a join tests.users u on u.id = a.client_id),
  (select array_agg(u.handle || ':' || o.logged || '/' || o.counted || ':' || o.has_target order by u.handle)
   from tests.old_trainer_nutrition_adherence(30) o join tests.users u on u.id = o.client_id),
  'the same clients with the same counts');
select results_eq(
  $$ select a.logged, a.counted, a.adherence, a.last_day from public.trainer_nutrition_adherence(30) a
     where a.client_id = tests.user_id('client_j') $$,
  $$ values (0, 0, null::integer, null::date) $$,
  'a client with no diary is listed with nothing logged');
select tests.clear_authentication();

select * from finish();
rollback;
