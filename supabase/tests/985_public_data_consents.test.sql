-- Consent to make personal data public, migration 20261020160743_public_data_consents.sql (152-FZ art. 10.1,
-- legal/ru/consent-public-data.md): public_data_consents, give_/revoke_public_data_consent, the showcase switch
-- that needs a consent, and get_showcase_terms.
begin;
\ir _helpers.psql
select plan(34);

-- A trainer who has not consented yet: tests.create_trainer consents on its own, so this one is made by hand.
select tests.create_user('trainer_n');
insert into public.trainer_profiles (user_id, slug) values (tests.user_id('trainer_n'), 'nina-fit');
select tests.create_trainer('trainer_a', 'anna-fit');
select tests.create_user('client_c');
update public.trainer_profiles set headline = 'Силовые', city = 'Казань' where user_id = tests.user_id('trainer_n');
update public.profiles set photo_url = 'https://example.com/nina.jpg' where id = tests.user_id('trainer_n');
insert into public.locations (id, trainer_id, name, address)
values ('00000000-0000-4000-8000-00000000c001', tests.user_id('trainer_n'), 'Студия', 'Баумана, 5');
insert into public.locations (id, trainer_id, name, address)
values ('00000000-0000-4000-8000-00000000c009', tests.user_id('trainer_a'), 'Чужой зал', 'Ленина, 9');
insert into public.packages (trainer_id, title, sessions_count, price_minor, currency)
values (tests.user_id('trainer_n'), 'Разовое', 1, 150000, 'RUB');

select is(
  (select is_public from public.trainer_profiles where user_id = tests.user_id('trainer_n')), false,
  'public data: a new showcase starts closed'
);

select tests.authenticate_as('trainer_n');
select throws_ok(
  $$ update public.trainer_profiles set is_public = true where user_id = auth.uid() $$,
  'P0001', 'consent_required', 'public data: the showcase does not open without a consent (part 8: silence is not consent)'
);
select throws_ok(
  $$ insert into public.public_data_consents (user_id, scope, version) values (auth.uid(), 'showcase', 'v1') $$,
  '42501', null, 'public data: a consent is not written to the table directly'
);
select throws_ok(
  $$ select public.give_public_data_consent('showcase', 'v1', array['photo', 'phone']) $$,
  '22023', 'invalid_consent', 'public data: only known fields can be chosen'
);
select throws_ok(
  $$ select public.give_public_data_consent('showcase', 'v1', '{}', array['no_selling']) $$,
  '22023', 'invalid_consent', 'public data: only known bans can be chosen'
);
select throws_ok(
  $$ select public.give_public_data_consent('showcase', 'v1', '{}', '{}', repeat('x', 501)) $$,
  '22023', 'invalid_consent', 'public data: the own condition is 500 characters at most'
);
select throws_ok(
  $$ select public.give_public_data_consent('profile', 'v1') $$,
  '22023', 'invalid_consent', 'public data: only the showcase and story cards take a consent'
);

select isnt(
  public.give_public_data_consent('showcase', 'v1', array['prices', 'photo', 'photo', 'city'], array['no_index'], '  Не копировать  '),
  null, 'public data: the trainer consents with chosen fields'
);
select is(
  (select is_public from public.trainer_profiles where user_id = auth.uid()), true,
  'public data: consenting opens the showcase'
);
select row_eq(
  $$ select fields, bans, condition, version from public.public_data_consents where user_id = auth.uid() and scope = 'showcase' and revoked_at is null $$,
  row(array['city', 'photo', 'prices'], array['no_index'], 'Не копировать'::text, 'v1'::text),
  'public data: fields and bans are kept sorted once each, the condition trimmed'
);

select tests.authenticate_as_anon();
select is((select status from public.get_trainer_showcase('nina-fit')), 'available', 'public data: the open showcase shows to anyone');
select row_eq(
  $$ select headline, city, photo_url, locations from public.get_trainer_showcase('nina-fit') $$,
  row(null::text, 'Казань'::text, 'https://example.com/nina.jpg'::text, '[]'::jsonb),
  'public data: the showcase shows the chosen city and photo, not the description or places left out'
);
select is((select count(*)::int from public.get_trainer_showcase_prices('nina-fit')), 1, 'public data: chosen prices show');
select row_eq(
  $$ select bans, condition from public.get_showcase_terms('NINA-FIT') $$,
  row(array['no_index'], 'Не копировать'::text),
  'public data: the page can state the bans and the condition (part 10)'
);

-- Places are ticked one by one: "locations" alone publishes none, someone else's place is refused.
select tests.authenticate_as('trainer_n');
select throws_ok(
  $$ select public.give_public_data_consent('showcase', 'v1', '{}', '{}', null, array['00000000-0000-4000-8000-00000000c009'::uuid]) $$,
  '22023', 'invalid_consent', 'public data: only the trainer''s own places can be ticked'
);
select isnt(
  public.give_public_data_consent('showcase', 'v1', array['locations'], '{}', null, array['00000000-0000-4000-8000-00000000c001'::uuid]),
  null, 'public data: the trainer ticks a place'
);
insert into public.locations (trainer_id, name, address) values (auth.uid(), 'Дом', 'Садовая, 3, кв. 7');
select tests.authenticate_as_anon();
select is(
  (select locations from public.get_trainer_showcase('nina-fit')),
  '[{"name": "Студия", "address": "Баумана, 5"}]'::jsonb,
  'public data: only the ticked place shows, one added later stays private'
);
select tests.authenticate_as('trainer_n');
select isnt(public.give_public_data_consent('showcase', 'v1', array['locations']), null, 'public data: "locations" without a place ticked');
select row_eq(
  $$ select fields, location_ids from public.public_data_consents where user_id = auth.uid() and scope = 'showcase' and revoked_at is null $$,
  row('{}'::text[], '{}'::uuid[]),
  'public data: with no place ticked, places stay private'
);

-- A change of fields is a new consent; the old ones stay on record, revoked.
select isnt(public.give_public_data_consent('showcase', 'v2', array['about']), null, 'public data: the trainer changes the fields');
select is(
  (select count(*)::int from public.public_data_consents where user_id = auth.uid() and scope = 'showcase'), 4,
  'public data: the earlier consents stay on record'
);
select is(
  (select pg_catalog.array_agg(version order by version) from public.public_data_consents where user_id = auth.uid() and scope = 'showcase' and revoked_at is null),
  array['v2'], 'public data: one consent is in force per scope'
);

select tests.authenticate_as_anon();
select row_eq(
  $$ select headline, city, photo_url, locations from public.get_trainer_showcase('nina-fit') $$,
  row('Силовые'::text, null::text, null::text, '[]'::jsonb),
  'public data: with only the description chosen, city, photo and places go private'
);
select is((select count(*)::int from public.get_trainer_showcase_prices('nina-fit')), 0, 'public data: prices left out show no grid');

select tests.authenticate_as('client_c');
select is((select count(*)::int from public.public_data_consents where user_id <> auth.uid()), 0, 'public data: nobody reads another person''s consents');
select throws_ok(
  $$ select public.give_public_data_consent('showcase', 'v1') $$,
  '42501', 'forbidden', 'public data: a person without a trainer profile has no showcase to consent to'
);
select isnt(public.give_public_data_consent('story', 'v1', '{}', array['no_transfer']), null, 'public data: a person consents to story cards');
select throws_ok(
  $$ select public.give_public_data_consent('story', 'v1', array['photo']) $$,
  '22023', 'invalid_consent', 'public data: a story card consent has no showcase fields'
);

select tests.authenticate_as('trainer_n');
select is(public.revoke_public_data_consent('showcase'), true, 'public data: the trainer revokes the consent');
select tests.authenticate_as_anon();
select is((select status from public.get_trainer_showcase('nina-fit')), 'unavailable', 'public data: revoking closes the showcase at once (part 13)');
select is((select count(*)::int from public.get_showcase_terms('nina-fit')), 0, 'public data: a closed showcase states no terms');

-- Story cards: without the consent no card is made, whatever makes it.
select tests.clear_authentication();
delete from public.public_data_consents where user_id = tests.user_id('trainer_a') and scope = 'story';
select throws_ok(
  format($$ insert into public.story_cards (user_id, month, kind, data) values (%L, '2026-09-01', 'sessions', '{"count": 2}') $$, tests.user_id('trainer_a')),
  'P0001', 'consent_required', 'public data: no story card without the consent to publish story cards'
);
select lives_ok(
  format($$ insert into public.story_cards (user_id, month, kind, data) values (%L, '2026-09-01', 'sessions', '{"count": 2}') $$, tests.user_id('client_c')),
  'public data: with the consent the card is made'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.give_public_data_consent('story', 'v1') $$,
  '42501', null, 'public data: anon cannot consent'
);

select * from finish();
rollback;
