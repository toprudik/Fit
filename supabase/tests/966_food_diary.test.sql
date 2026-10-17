-- Food diary of migration 20261017040500_food_diary.sql (wave-2 §3, data-model §2.2): the catalog cache, own
-- products, barcodes and dishes, entries with computed values, edits and copies, who reads the diary, and the
-- trainer's comments on a day.
begin;
\ir _helpers.psql
select plan(67);

-- C trains with A; D trains with B; E is nobody's client.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('user_e');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_d');

create table tests.ids (name text primary key, id uuid not null);
grant select, insert, update on tests.ids to authenticated, service_role;
insert into tests.ids values ('a_c', tests.pair_id('trainer_a', 'client_c'));
create function tests.id(p_name text) returns uuid language sql stable set search_path = '' as $$
  select i.id from tests.ids i where i.name = p_name
$$;
grant execute on function tests.id(text) to authenticated, service_role;

-- =========================================================================================================
-- The catalog cache (§3.5)

select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.cache_off_foods('[{"code":"4601916007082","name":"Гречка","kcal":351}]') $$, '42501', null,
  'a user cannot write the catalog cache');
select throws_ok(
  $$ insert into public.foods (source, off_code, name, kcal_100g) values ('off', '1', 'x', 1) $$, '42501', null,
  'nor insert foods directly');
select tests.clear_authentication();

select tests.authenticate_as_service_role();
select is(
  (select count(*)::int from public.cache_off_foods(
    '[{"code":"4601916007082","name":"Гречка","brand":"Мистраль","kcal":351,"protein":12,"fat":3.4,"carbs":64.2,"lang":"ru"},
      {"code":"4600000000001","name":"Без калорий"},
      {"code":"4600000000002","name":"Сломанный","kcal":300,"protein":80,"fat":30,"carbs":10},
      {"code":"4607016249292","name":"Гречка алтайская","kcal":350,"protein":13,"fat":2.5,"carbs":68,"serving_g":50,"serving_label":"50 г"}]')),
  2, 'the cache keeps products with sane values and skips the rest');
select is(
  (select count(*)::int from public.cache_off_foods('[{"code":"4601916007082","name":"Гречка ядрица","kcal":340}]')),
  1, 'caching the same code again updates it');
insert into tests.ids select 'buckwheat', f.id from public.foods f where f.off_code = '4601916007082';
insert into tests.ids select 'altai', f.id from public.foods f where f.off_code = '4607016249292';
select tests.clear_authentication();

-- =========================================================================================================
-- Search and barcodes (§3.1, §3.3)

select tests.authenticate_as('client_c');
select is((select kcal_100g::int from public.foods where id = tests.id('buckwheat')), 340, 'everyone reads the catalog');
select ok((select count(*) from public.search_foods('гречка')) = 2, 'the cached catalog is searched by name');
select is((select count(*)::int from public.food_by_barcode('9999999999999')), 0, 'an unknown barcode finds nothing');
select throws_ok(
  $$ select public.save_food(null, 'Сырник', 950) $$, '22023', 'invalid_food_values', 'kcal over 900 per 100 g is refused');
select throws_ok(
  $$ select public.save_food(null, 'Сырник', 300, 60, 30, 20) $$, '22023', 'invalid_food_values',
  'macros over 100 g per 100 g are refused');
select throws_ok(
  $$ select public.save_food(null, 'Сырник', 300, p_barcode => '12ab') $$, '22023', 'invalid_barcode', 'a broken barcode is refused');
insert into tests.ids values ('syrnik', public.save_food(null, 'Сырник домашний', 220, 15, 10, 18, 60, '1 шт', '9999999999999'));
select is((select name from public.food_by_barcode('9999999999999')), 'Сырник домашний', '3.3: the same client finds the product by its barcode');
select throws_ok(
  $$ select public.save_food(null, 'Ещё сырник', 200, p_barcode => '9999999999999') $$, '23505', 'barcode_taken',
  'one own product per barcode');
select is(
  (select name from public.search_foods('сырник') limit 1), 'Сырник домашний', 'own products come up in the search');
select tests.clear_authentication();

select tests.authenticate_as('client_d');
select is((select count(*)::int from public.food_by_barcode('9999999999999')), 0, '3.3: another client does not find it');
select is((select count(*)::int from public.foods where id = tests.id('syrnik')), 0, 'nor reads the product');
select is((select count(*)::int from public.search_foods('сырник')), 0, 'nor finds it in the search');
select throws_ok(
  $$ select public.add_food_entry(current_date, 'lunch', tests.id('syrnik'), 100) $$, 'P0002', 'not_found',
  'nor logs it');
select tests.clear_authentication();

-- =========================================================================================================
-- Entries (§3.2–3.4, §3.10)

select tests.authenticate_as('client_c');
insert into tests.ids values ('e1', public.add_food_entry(current_date, 'lunch', tests.id('altai'), 150));
select is(
  (select array[kcal, protein_g, fat_g, carbs_g] from public.food_diary_entries where id = tests.id('e1')),
  array[525.0, 19.5, 3.8, 102.0],
  '3.1: 150 g scales the values per 100 g');
select is(
  (select title from public.food_diary_entries where id = tests.id('e1')), 'Гречка алтайская', 'the entry keeps the name');
insert into tests.ids values ('e2', public.add_food_entry(current_date, 'lunch', tests.id('altai'), p_servings => 2));
select is((select grams::int from public.food_diary_entries where id = tests.id('e2')), 100,
  'servings turn into grams by the serving size');
insert into tests.ids values ('quick', public.add_food_entry(current_date, 'snack', p_kcal => 350));
select is(
  (select array[kcal::int, coalesce(grams, 0)::int] from public.food_diary_entries where id = tests.id('quick')),
  array[350, 0], '3.4: quick 350 kcal without a name');
select is(
  (select sum(kcal)::int from public.food_diary_entries where client_id = auth.uid() and local_date = current_date),
  525 + 350 + 350, 'and the day sum grows by 350');
select throws_ok(
  $$ select public.add_food_entry(current_date, 'lunch', tests.id('altai'), 6000) $$, '22023', 'invalid_amount',
  'more than 5000 g is refused');
select throws_ok(
  $$ select public.add_food_entry(current_date, 'lunch', tests.id('altai'), 0) $$, '22023', 'invalid_amount', 'zero grams is refused');
select throws_ok(
  $$ select public.add_food_entry(current_date, 'snack', p_kcal => 6000) $$, '22023', 'invalid_kcal',
  'quick kcal over 5000 is refused');
select throws_ok(
  $$ select public.add_food_entry(current_date + 5, 'snack', p_kcal => 100) $$, '22023', 'invalid_day', 'a day far ahead is refused');
select throws_ok(
  $$ insert into public.food_diary_entries (client_id, local_date, meal, kcal) values (auth.uid(), current_date, 'lunch', 1) $$,
  '42501', null, 'entries are not written directly');
select ok(public.update_food_entry(tests.id('e1'), 'dinner', 200), 'the client changes the meal and the grams');
select is(
  (select array[kcal::text, meal::text] from public.food_diary_entries where id = tests.id('e1')),
  array['700.0', 'dinner'], 'and the values follow');
select ok(public.update_food_entry(tests.id('quick'), 'snack', p_kcal => 400), 'quick kcal is edited too');
select lives_ok(
  $$ select public.add_food_entry(current_date - 1, 'breakfast', tests.id('syrnik'), p_servings => 1) $$, 'an entry on a past day');
select is(public.copy_food_meal(current_date - 1, 'breakfast', current_date), 1, '"copy yesterday''s meal" copies it');
select is(
  (select kcal::int from public.food_diary_entries where local_date = current_date and meal = 'breakfast'), 132,
  'with its values (1 piece of 60 g at 220 kcal)');
select ok(public.archive_food(tests.id('syrnik')), 'the client removes the product');
select is((select count(*)::int from public.food_by_barcode('9999999999999')), 0, 'a removed product is not found by its barcode');
select is(
  (select count(*)::int from public.food_diary_entries where title = 'Сырник домашний'), 2, 'past entries stay');
select isnt(public.save_food(null, 'Сырник новый', 230, p_barcode => '9999999999999'), null, 'the barcode is free again');
select ok(public.set_food_favorite(tests.id('altai'), true), 'a catalog product goes to favorites');
select is((select count(*)::int from public.food_favorites), 1, 'the client sees own favorites');

-- Dishes (§3.5): 200 g of rice and 100 g of chicken.
insert into tests.ids values ('rice', public.save_food(null, 'Рис варёный', 130, 2.7, 0.3, 28));
insert into tests.ids values ('chicken', public.save_food(null, 'Курица', 165, 31, 3.6, 0));
insert into tests.ids values ('dish', public.save_dish(null, 'Рис с курицей',
  jsonb_build_array(jsonb_build_object('food_id', tests.id('rice'), 'grams', 200),
                    jsonb_build_object('food_id', tests.id('chicken'), 'grams', 100))));
select is(
  (select array[kcal_100g, protein_100g, serving_g] from public.foods where id = tests.id('dish')),
  array[141.7, 12.1, 300.0], '3.5: the dish shows kcal and macros per 100 g and weighs 300 g');
insert into tests.ids values ('e3', public.add_food_entry(current_date, 'dinner', tests.id('dish'), p_servings => 1));
select is((select kcal::int from public.food_diary_entries where id = tests.id('e3')), 425, '3.5: one serving is the whole dish');
select is((select count(*)::int from public.food_dish_items where dish_id = tests.id('dish')), 2, 'the client reads the items');
select tests.clear_authentication();

select tests.authenticate_as('client_d');
select throws_ok(
  format($$ select public.save_dish(null, 'Чужое', '[{"food_id":"%s","grams":100}]') $$, tests.id('rice')),
  '22023', 'invalid_items', 'a dish cannot use another client''s product');
select is((select count(*)::int from public.food_favorites), 0, 'favorites are private');
select throws_ok(
  $$ select public.update_food_entry(tests.id('e1'), 'lunch', 10) $$, 'P0002', 'not_found', 'nor edits another client''s entry');
delete from public.food_diary_entries where id = tests.id('e1');
select tests.clear_authentication();
select is((select count(*)::int from public.food_diary_entries where id = tests.id('e1')), 1, 'nor deletes it');

-- =========================================================================================================
-- Who reads the diary (§3.6)

select tests.authenticate_as('trainer_a');
select ok((select count(*) from public.food_diary_entries where client_id = tests.user_id('client_c')) > 0,
  'the trainer reads the diary while nutrition is shared');
select is((select count(*)::int from public.foods where owner_id = tests.user_id('client_c')), 0,
  'but not the client''s own products (entries keep the names)');
select tests.clear_authentication();
select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.food_diary_entries where client_id = tests.user_id('client_c')), 0,
  'another trainer does not');
select tests.clear_authentication();
select tests.authenticate_as('user_e');
select is((select count(*)::int from public.food_diary_entries), 0, 'a stranger reads nothing');
select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'nutrition', false);
select tests.authenticate_as('trainer_a');
select is((select count(*)::int from public.food_diary_entries where client_id = tests.user_id('client_c')), 0,
  '3.6: without the nutrition share the trainer sees no diary');
select throws_ok(
  $$ select public.add_food_comment(tests.id('a_c'), current_date, 'Отлично') $$, '42501', null, 'nor comments');
select tests.clear_authentication();
select tests.set_share('trainer_a', 'client_c', 'nutrition', true);

-- The target of a day (§3.9).
insert into public.nutrition_targets (source, client_id, kcal, effective_from, set_by)
values ('calculator', tests.user_id('client_c'), 2000, current_date - 3, tests.user_id('client_c'));
select tests.authenticate_as('client_c');
select is((select kcal from public.nutrition_target_on(auth.uid(), current_date)), 2000, 'the client gets the target of the day');
select is((select count(*)::int from public.nutrition_target_on(auth.uid(), current_date - 10)), 0, 'and none before it');
select tests.clear_authentication();
select tests.authenticate_as('trainer_a');
select is((select kcal from public.nutrition_target_on(tests.user_id('client_c'), current_date)), 2000, 'so does the trainer');
select tests.clear_authentication();
select tests.authenticate_as('trainer_b');
select is((select count(*)::int from public.nutrition_target_on(tests.user_id('client_c'), current_date)), 0, 'another trainer gets nothing');
select tests.clear_authentication();

-- =========================================================================================================
-- The trainer's comments (§3.11–3.14)

select tests.authenticate_as('trainer_a');
insert into tests.ids values ('comment', public.add_food_comment(tests.id('a_c'), current_date, 'Добавь белка на ужин'));
select throws_ok(
  $$ select public.add_food_comment(tests.id('a_c'), current_date, repeat('a', 1001)) $$, '22023', 'invalid_body',
  'over 1000 characters is refused');
select ok(public.edit_food_comment(tests.id('comment'), 'Добавь белка на ужин, 30 г'), 'the author edits the comment');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notification_outbox
   where type = 'trainer_comment' and user_id = tests.user_id('client_c') and payload ->> 'day' = current_date::text),
  1, '3.12: the client gets one message with the day');

select tests.authenticate_as('trainer_b');
select throws_ok(
  $$ select public.add_food_comment(tests.id('a_c'), current_date, 'Привет') $$, '42501', null,
  'a trainer cannot comment another trainer''s client');
select is((select count(*)::int from public.food_day_comments), 0, 'nor read the comments');
select ok(not public.delete_food_comment(tests.id('comment')), 'nor delete them');
select tests.clear_authentication();

select tests.authenticate_as('client_c');
select is((select body from public.food_day_comments where id = tests.id('comment')), 'Добавь белка на ужин, 30 г',
  'the client reads the comment');
select ok(not public.edit_food_comment(tests.id('comment'), 'Нет'), 'the client cannot edit it');
select ok(public.hide_food_comment(tests.id('comment')), 'the client hides it');
select isnt((select hidden_by_client_at from public.food_day_comments where id = tests.id('comment')), null, 'on their side');
select tests.clear_authentication();

select tests.authenticate_as('trainer_a');
select ok(public.delete_food_comment(tests.id('comment')), 'the author deletes the comment');
select tests.clear_authentication();

select * from finish();
rollback;
