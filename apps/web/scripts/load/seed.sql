-- Load-test data for the LOCAL Supabase only (apps/web/scripts/load/README.md). Made-up people: handles load_t<N>
-- and load_c<N>_<M>, Telegram ids from 7 700 000 000, which no real account has. Rerunning first deletes the
-- previous load users (cascades remove their rows), so the run always starts from the same data.
--
--   psql "$DB_URL" -v trainers=20 -v clients=25 -v big=300 -f scripts/load/seed.sql
--
-- trainers × clients ordinary pairs, plus one trainer (load_big) with :big clients: the RLS helpers that list
-- a trainer's clients (private.viewable_client_ids) are the part most likely to slow down as a roster grows.
\set ON_ERROR_STOP on
\if :{?trainers} \else \set trainers 20 \endif
\if :{?clients} \else \set clients 25 \endif
\if :{?big} \else \set big 300 \endif

do $guard$
begin
  -- Never on a hosted project: the local stack listens on 127.0.0.1 and has no Supabase-managed roles' config.
  if inet_server_addr() is not null and host(inet_server_addr()) not in ('127.0.0.1', '::1')
     and host(inet_server_addr()) !~ '^(172|10|192\.168)\.' then
    raise exception 'seed.sql runs only against the local Supabase (server address %)', inet_server_addr();
  end if;
end
$guard$;

begin;
set local client_min_messages = warning;
drop schema if exists tests cascade;
\ir ../../../../supabase/tests/_helpers.psql

-- Pairs first: a client's profile cannot go while a pair still names it (account deletion moves pairs to a stub).
create temp table load_ids on commit drop as select id from auth.users where email ~ '^tg77\d{8}@users\.fit\.invalid$';
delete from public.coachings where trainer_id in (select id from load_ids) or client_id in (select id from load_ids);
delete from public.trainer_profiles where user_id in (select id from load_ids);
delete from auth.users where id in (select id from load_ids);

\o /dev/null
select set_config('load.trainers', :'trainers', true), set_config('load.clients', :'clients', true),
       set_config('load.big', :'big', true);
\o

do $seed$
declare
  v_trainers int := current_setting('load.trainers')::int;
  v_clients int := current_setting('load.clients')::int;
  v_big int := current_setting('load.big')::int;
  v_tg bigint := 7700000000;
  v_trainer text;
  v_client text;
  v_session uuid;
  v_today date := current_date;
begin
  for t in 0..v_trainers loop
    v_trainer := case when t = 0 then 'load_big' else 'load_t' || t end;
    v_tg := v_tg + 1;
    perform tests.create_user(v_trainer, v_tg);
    insert into public.trainer_profiles (user_id, slug) values (tests.user_id(v_trainer), replace(v_trainer, '_', '-'));
    for c in 1..(case when t = 0 then v_big else v_clients end) loop
      v_client := 'load_c' || t || '_' || c;
      v_tg := v_tg + 1;
      perform tests.create_user(v_client, v_tg);
      perform tests.create_pair(v_trainer, v_client);
      perform tests.create_pass(v_trainer, v_client, 10, 500000);
      -- Two clients in three follow their trainer's target, every other one of the rest the calculator's.
      if c % 3 <> 0 then
        insert into public.nutrition_targets (source, client_id, coaching_id, kcal, protein_g, fat_g, carbs_g, effective_from, set_by)
        values ('trainer', tests.user_id(v_client), tests.pair_id(v_trainer, v_client), 2000, 120, 70, 220, v_today - 30,
                tests.user_id(v_trainer));
      elsif c % 2 = 0 then
        insert into public.nutrition_targets (source, client_id, kcal, effective_from)
        values ('calculator', tests.user_id(v_client), 1800, v_today - 30);
      end if;
      -- Two weeks of food diary (4 meals a day) and of steps and water.
      insert into public.food_diary_entries (client_id, local_date, meal, title, grams, kcal, protein_g, fat_g, carbs_g)
      select tests.user_id(v_client), v_today - d, m.meal, 'Блюдо ' || m.n, 150 + 10 * m.n, 300 + 20 * m.n, 20, 10, 35
      from generate_series(0, 13) d
      cross join (values (1, 'breakfast'::public.meal_type), (2, 'lunch'), (3, 'dinner'), (4, 'snack')) m(n, meal);
      insert into public.activity_entries (client_id, local_date, metric, value)
      select tests.user_id(v_client), v_today - d, metric, case metric when 'steps' then 6000 + 100 * d else 250 end
      from generate_series(0, 13) d cross join unnest(array['steps', 'water']::public.activity_metric[]) metric;
    end loop;
    -- Three personal sessions a day, from a week ago to a week ahead, each booked by one of the clients.
    for d in -7..7 loop
      for h in 0..2 loop
        v_session := tests.create_session(v_trainer, (v_today + d) + make_interval(hours => 9 + 3 * h));
        v_client := 'load_c' || t || '_' || (1 + ((d + 7) * 3 + h) % (case when t = 0 then v_big else v_clients end));
        perform tests.create_booking(v_session, v_trainer, v_client, case when d < 0 then 'attended' else 'confirmed' end::public.booking_status);
      end loop;
    end loop;
  end loop;

  -- Everyone accepted the beta terms in force, otherwise every page would send them to that screen.
  insert into public.consents (user_id, kind, version)
  select u.id, 'beta_terms', '2026-11-beta' from tests.users u where u.handle like 'load\_%';

  -- What the nutrition-days cron job (every 5 minutes) would have written by now: past days keep their target.
  perform private.freeze_nutrition_days(30);

  -- GoTrue reads these token columns as strings: rows inserted by SQL must not leave them null, or the
  -- magic links the load runner mints for each user fail with "converting NULL to string".
  update auth.users set confirmation_token = '', recovery_token = '', email_change_token_new = '',
    email_change = '', email_change_token_current = '', reauthentication_token = '', phone_change = '',
    phone_change_token = ''
  where email ~ '^tg77\d{8}@users\.fit\.invalid$';
end
$seed$;

-- The runner signs the load users in from schema load. The fixture helpers go again: pgTAP files create them inside
-- their own transaction and expect an empty tests.users.
create schema if not exists load;
revoke all on schema load from public;
drop table if exists load.users;
create table load.users as select handle, id, telegram_id from tests.users where handle like 'load\_%';
drop schema tests cascade;

select count(*) filter (where handle not like 'load\_c%') as trainers, count(*) filter (where handle like 'load\_c%') as clients
from load.users;
commit;
