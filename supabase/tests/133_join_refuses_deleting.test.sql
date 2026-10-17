-- Joining refuses accounts that are being deleted (migration 20261017015200_join_refuses_deleting.sql):
-- private.join_pair, behind join_by_invite, join_by_code and join_by_trial_link, says trainer_unavailable for a
-- trainer and account_deleting for a caller with a pending deletion; a cancelled one no longer counts and a
-- live pair still comes back as it is.
begin;
\ir _helpers.psql
select plan(10);

select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_user('client_c');
select tests.create_user('client_d');

create table tests.links (handle text primary key, token text not null, code text not null);
grant select on tests.links to authenticated;
grant insert on tests.links to authenticated;

select tests.authenticate_as('trainer_a');
insert into tests.links select 'trainer_a', token, code from public.my_client_invite();
select tests.authenticate_as('trainer_b');
insert into tests.links select 'trainer_b', token, code from public.my_client_invite();
insert into public.trial_links (trainer_id, title, duration_min, currency)
values (tests.user_id('trainer_b'), 'Знакомство', 45, 'RUB');
select tests.clear_authentication();
select token as trial from public.trial_links where title = 'Знакомство' \gset

create function tests.start_deletion(p_handle text) returns void language sql set search_path = '' as $$
  insert into public.account_deletions (user_id, scheduled_for)
  values (tests.user_id(p_handle), now() + interval '30 days')
  on conflict (user_id) do update set cancelled_at = null, requested_at = now(), scheduled_for = now() + interval '30 days'
$$;

-- A trainer who is deleting the account takes nobody new, through the link or the code.
select tests.start_deletion('trainer_a');
select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.join_by_invite((select token from tests.links where handle = 'trainer_a')) $$,
  'P0001', 'trainer_unavailable', 'trainer deleting: the client link is refused'
);
select throws_ok(
  $$ select public.join_by_code((select code from tests.links where handle = 'trainer_a')) $$,
  'P0001', 'trainer_unavailable', 'trainer deleting: the code is refused'
);
select tests.clear_authentication();
select is((select count(*)::int from public.coachings), 0, 'trainer deleting: no pair was made');

-- Once the trainer cancels, the same link works again.
update public.account_deletions set cancelled_at = now() where user_id = tests.user_id('trainer_a');
select tests.authenticate_as('client_c');
select lives_ok(
  $$ select public.join_by_invite((select token from tests.links where handle = 'trainer_a')) $$,
  'trainer cancelled the deletion: the link works'
);

-- A client who is deleting the account joins nobody, by any way in.
select tests.clear_authentication();
select tests.start_deletion('client_d');
select tests.authenticate_as('client_d');
select throws_ok(
  $$ select public.join_by_invite((select token from tests.links where handle = 'trainer_b')) $$,
  'P0001', 'account_deleting', 'client deleting: the client link is refused'
);
select throws_ok(
  $$ select public.join_by_code((select code from tests.links where handle = 'trainer_b')) $$,
  'P0001', 'account_deleting', 'client deleting: the code is refused'
);
select throws_ok(
  format('select public.join_by_trial_link(%L)', :'trial'),
  'P0001', 'account_deleting', 'client deleting: the trial link is refused'
);
select tests.clear_authentication();
select is(
  (select uses_count from public.trial_links where title = 'Знакомство'), 0, 'client deleting: the trial link counted no use'
);

-- A pair that is already live is returned as it is, even while its client deletes the account.
select tests.start_deletion('client_c');
select tests.authenticate_as('client_c');
select is(
  public.join_by_invite((select token from tests.links where handle = 'trainer_a')),
  (select id from public.coachings where client_id = tests.user_id('client_c')),
  'live pair: joining again returns it'
);
select tests.clear_authentication();
select is((select count(*)::int from public.coachings), 1, 'live pair: nothing new was made');

select * from finish();
rollback;
