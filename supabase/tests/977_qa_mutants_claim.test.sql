-- «Объединить» and «Новый клиент» on a card claim (resolve_managed_client_claim): branches that the pre-beta mutation
-- run (04.11) broke without any test noticing. The merged pair keeps the older start and takes the person's status,
-- the person's waitlist places and ledger rows move with them, the card's waitlist place names the person, the
-- better personal record wins, and a rejected claim ends the new pair only past the Free limit.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_trainer(h) from unnest(array['trainer_a', 'trainer_b']) h;
insert into public.consents (user_id, kind, version)
select tests.user_id(h), 'trainer_dpa', '2026-10-18' from unnest(array['trainer_a', 'trainer_b']) h;
select tests.create_user(h) from unnest(array['client_t', 'client_u']) h;
create table tests.kv (name text primary key, id uuid);
grant all on tests.kv to authenticated;
create function tests.kv(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from tests.kv where name = p_name
$$;
grant execute on function tests.kv(text) to authenticated;
create table tests.tok (trainer text, token text);
grant all on tests.tok to authenticated;

-- trainer_a: a card with a waitlist place, and client_t who joins by the link with a pass and a waitlist place.
select tests.authenticate_as('trainer_a');
insert into tests.kv values ('card_pair', public.create_managed_client('ТонРу', null, null));
insert into tests.tok select 'trainer_a', token from public.my_client_invite();
select tests.authenticate_as('client_t');
insert into tests.kv values ('new_pair', public.join_by_invite((select token from tests.tok where trainer = 'trainer_a')));
select tests.authenticate_as('trainer_a');
select public.create_pass(tests.kv('new_pair'), null, 'Пять', 5, 500000, 'RUB', 30, null, current_date, null, null, null, null,
  gen_random_uuid());
select tests.clear_authentication();
insert into tests.kv values ('card_user', (select client_id from public.coachings where id = tests.kv('card_pair')));
insert into tests.kv values
  ('group_card', tests.create_session('trainer_a', now() + interval '3 days', 'group', 1)),
  ('group_person', tests.create_session('trainer_a', now() + interval '4 days', 'group', 1));
insert into public.waitlist_entries (session_id, coaching_id, client_id, trainer_id, status)
values (tests.kv('group_card'), tests.kv('card_pair'), tests.kv('card_user'), tests.user_id('trainer_a'), 'waiting'),
       (tests.kv('group_person'), tests.kv('new_pair'), tests.user_id('client_t'), tests.user_id('trainer_a'), 'waiting');
-- The card is older than the person's pair and was archived to a trial; the person is active.
update public.coachings set started_at = now() - interval '60 days', status = 'trial' where id = tests.kv('card_pair');
update public.coachings set status = 'active' where id = tests.kv('new_pair');
-- The person lifted more on their own than the trainer wrote on the card.
insert into tests.kv values ('exercise', (select id from public.exercises order by id limit 1));
insert into public.personal_records (client_id, exercise_id, record_type, value, achieved_at)
values (tests.user_id('client_t'), tests.kv('exercise'), 'max_weight', 100, now() - interval '1 day'),
       (tests.kv('card_user'), tests.kv('exercise'), 'max_weight', 80, now() - interval '5 days');

select tests.authenticate_as('trainer_a');
select lives_ok(format('select public.resolve_managed_client_claim(%L, %L)',
  (select id from public.managed_client_claims where new_coaching_id = tests.kv('new_pair')), tests.kv('card_user')),
  'merge');
select tests.clear_authentication();

select is((select started_at from public.coachings where id = tests.kv('card_pair')), now() - interval '60 days',
  'merge: the older start of the card stays');
select is((select status::text from public.coachings where id = tests.kv('card_pair')), 'active',
  'merge: the pair takes the person''s status');
select is((select coaching_id from public.waitlist_entries where session_id = tests.kv('group_person')), tests.kv('card_pair'),
  'merge: the person''s waitlist place moves to the merged pair');
select is((select client_id from public.waitlist_entries where session_id = tests.kv('group_card')), tests.user_id('client_t'),
  'merge: the card''s waitlist place now names the person');
select is((select count(*)::int from public.ledger_entries
           where coaching_id = tests.kv('card_pair') and entry_type = 'grant'), 1,
  'merge: the ledger of the person''s pass moves with it');
select is((select value from public.personal_records where client_id = tests.user_id('client_t') and exercise_id = tests.kv('exercise')),
  100.00::numeric, 'merge: the better personal record wins');

-- trainer_b on Free: a card, two more clients and client_u who joins by the link. Rejecting the claim keeps client_u
-- while the trainer is within the limit, and ends the pair once over it.
select tests.authenticate_as('trainer_b');
insert into tests.kv values ('card_b', public.create_managed_client('Карточка', null, null));
insert into tests.tok select 'trainer_b', token from public.my_client_invite();
select tests.authenticate_as('client_u');
insert into tests.kv values ('pair_u', public.join_by_invite((select token from tests.tok where trainer = 'trainer_b')));
select tests.clear_authentication();
update public.plans set limits = jsonb_set(limits, '{max_active_clients}', to_jsonb(private.active_client_count(tests.user_id('trainer_b'))))
where code = 'trainer_free';
select tests.authenticate_as('trainer_b');
select public.resolve_managed_client_claim((select id from public.managed_client_claims where new_coaching_id = tests.kv('pair_u')));
select tests.clear_authentication();
select is((select status::text from public.coachings where id = tests.kv('pair_u')), 'active',
  'reject: at exactly the Free limit the new client stays');
select ok(private.active_client_count(tests.user_id('trainer_b')) =
          (select (limits ->> 'max_active_clients')::int from public.plans where code = 'trainer_free'),
  'reject: the trainer is at the limit, not over it');

select * from finish();
rollback;
