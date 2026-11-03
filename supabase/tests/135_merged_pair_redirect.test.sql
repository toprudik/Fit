-- Old links of a merged-away pair (migration 20261103072824_merged_pair_redirect.sql, QA bug 28): the merged claim
-- keeps the deleted pair's id in merged_from_coaching_id, and merged_pair_id() gives the merged pair to its trainer and person only.
begin;
\ir _helpers.psql
select plan(6);
select tests.create_trainer('trainer_a');
insert into public.consents (user_id, kind, version) values (tests.user_id('trainer_a'), 'trainer_dpa', '2026-10-18');
select tests.create_user('client_t');
select tests.create_user('stranger_s');
create table tests.kv (name text primary key, id uuid);
grant all on tests.kv to authenticated;
create table tests.tok (token text);
grant all on tests.tok to authenticated;

select tests.authenticate_as('trainer_a');
insert into tests.kv values ('card_pair', public.create_managed_client('Карточка', null, null));
insert into tests.tok select token from public.my_client_invite();
select tests.authenticate_as('client_t');
insert into tests.kv values ('new_pair', public.join_by_invite((select token from tests.tok)));

select is(
  public.merged_pair_id((select id from tests.kv where name = 'new_pair')), null,
  'before the merge: the pair has not moved'
);

select tests.authenticate_as('trainer_a');
select public.resolve_managed_client_claim(
  (select id from public.managed_client_claims where new_coaching_id = (select id from tests.kv where name = 'new_pair')),
  (select client_id from public.coachings where id = (select id from tests.kv where name = 'card_pair'))
);
select tests.clear_authentication();

select is(
  (select merged_from_coaching_id from public.managed_client_claims where claimant_id = tests.user_id('client_t')),
  (select id from tests.kv where name = 'new_pair'),
  'the merged claim keeps the deleted pair''s id'
);

select tests.authenticate_as('trainer_a');
select is(
  public.merged_pair_id((select id from tests.kv where name = 'new_pair')),
  (select id from tests.kv where name = 'card_pair'),
  'the trainer is sent to the merged pair'
);
select tests.authenticate_as('client_t');
select is(
  public.merged_pair_id((select id from tests.kv where name = 'new_pair')),
  (select id from tests.kv where name = 'card_pair'),
  'the person is sent to the merged pair'
);
select tests.authenticate_as('stranger_s');
select is(public.merged_pair_id((select id from tests.kv where name = 'new_pair')), null, 'anyone else learns nothing');
select tests.clear_authentication();
select id as new_pair from tests.kv where name = 'new_pair' \gset
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.merged_pair_id(%L)', :'new_pair'),
  '42501', null, 'anon cannot call it'
);

select * from finish();
rollback;
