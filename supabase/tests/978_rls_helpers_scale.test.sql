-- RLS helpers of migration 20261020090417_rls_helpers_scale.sql: each answers what its previous body answered, for
-- owners, assistants (all clients, chosen clients), a substitute, delegations that are pending, expired or revoked,
-- clients, an admin with break-glass access and a stranger. The previous bodies are copied below as tests.old_*.
begin;
\ir _helpers.psql
select plan(5);

select tests.create_trainer('owner_a');
select tests.create_trainer('owner_b');
select tests.create_trainer('helper_all');
select tests.create_trainer('helper_some');
select tests.create_trainer('sub_s');
select tests.create_trainer('late_l');
select tests.create_trainer('pending_p');
select tests.create_trainer('revoked_r');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('client_e');
select tests.create_user('client_f');
select tests.create_user('stranger_x');
select tests.create_admin('admin_m');
select tests.create_pair('owner_a', 'client_c');
select tests.create_pair('owner_a', 'client_d', 'trial');
select tests.create_pair('owner_a', 'client_e', 'ended');
select tests.create_pair('owner_b', 'client_c');
select tests.create_pair('owner_b', 'client_f');
select tests.set_share('owner_a', 'client_c', 'nutrition', true);
select tests.set_share('owner_a', 'client_d', 'photos', true);
select tests.set_share('owner_b', 'client_f', 'intake', true);
select tests.create_break_glass('admin_m', 'client_f', '{nutrition,steps}');

create temp table session_ids (name text primary key, id uuid not null);
insert into session_ids values
  ('personal', tests.create_session('owner_a', now() + interval '1 day')),
  ('group', tests.create_session('owner_a', now() + interval '2 days', 'group', 4)),
  ('past', tests.create_session('owner_b', now() - interval '2 days'));
select tests.create_booking((select id from session_ids where name = 'personal'), 'owner_a', 'client_c');
select tests.create_booking((select id from session_ids where name = 'group'), 'owner_a', 'client_d');
select tests.create_booking((select id from session_ids where name = 'past'), 'owner_b', 'client_f', 'attended');

insert into public.delegations (owner_trainer_id, delegate_trainer_id, kind, session_id, scopes, all_clients, status, starts_at, ends_at)
values
  (tests.user_id('owner_a'), tests.user_id('helper_all'), 'assistant', null, '{nutrition,progress,schedule}', true, 'active', now() - interval '1 day', null),
  (tests.user_id('owner_b'), tests.user_id('helper_some'), 'assistant', null, '{notes,attendance,workouts}', false, 'active', now() - interval '1 day', now() + interval '1 day'),
  (tests.user_id('owner_a'), tests.user_id('sub_s'), 'substitute', (select id from session_ids where name = 'personal'), '{attendance,notes,nutrition}', false, 'active', now() - interval '1 hour', null),
  (tests.user_id('owner_a'), tests.user_id('late_l'), 'assistant', null, '{nutrition,schedule}', true, 'active', now() - interval '3 days', now() - interval '1 day'),
  (tests.user_id('owner_b'), tests.user_id('pending_p'), 'assistant', null, '{nutrition}', true, 'pending', now() - interval '1 day', null),
  (tests.user_id('owner_b'), tests.user_id('revoked_r'), 'assistant', null, '{progress}', true, 'revoked', now() - interval '1 day', null);
insert into public.delegation_clients (delegation_id, coaching_id)
select d.id, tests.pair_id('owner_b', 'client_f') from public.delegations d where d.delegate_trainer_id = tests.user_id('helper_some');

-- The bodies before 20261020090417 (20261017090713_delegations.sql, 20261017113217_delegate_schedule.sql).
create function tests.old_trainer_coaching_ids(p_scopes public.delegation_scope[] default null) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.array_agg(c.id), '{}')
  from public.coachings c
  where c.trainer_id = auth.uid()
     or (p_scopes is not null and exists (
           select 1 from pg_catalog.unnest(p_scopes) sc (scope) where private.delegate_covers(c.id, sc.scope)))
$$;

create function tests.old_viewable_client_ids(p_category public.share_category) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.array_agg(distinct x.id), '{}')
  from (
    select auth.uid() as id
    union all
    select c.client_id
    from public.coachings c
    join public.data_shares d on d.coaching_id = c.id
    where c.status in ('trial', 'active')
      and case p_category
            when 'nutrition'    then d.nutrition
            when 'measurements' then d.measurements
            when 'photos'       then d.photos
            when 'steps'        then d.steps
            when 'intake'       then d.intake
            when 'workouts'     then d.workouts
          end
      and (c.trainer_id = auth.uid()
           or (auth.uid() is not null
               and exists (select 1 from public.delegations dl
                           where dl.delegate_trainer_id = auth.uid() and dl.owner_trainer_id = c.trainer_id
                             and dl.status = 'active')
               and private.delegate_views(c.id, p_category)))
    union all
    select g.target_user_id
    from public.break_glass_grants g
    join public.user_roles r on r.user_id = g.admin_id and r.role = 'admin'
    where g.admin_id = auth.uid()
      and g.revoked_at is null and g.expires_at > pg_catalog.now()
      and p_category = any (g.categories)
  ) x
  where x.id is not null
$$;

create function tests.old_delegated_client_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.array_agg(distinct c.client_id), '{}')
  from public.coachings c
  where c.id = any (private.delegated_coaching_ids())
$$;

create function tests.old_delegated_session_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.array_agg(distinct x.id), '{}')
  from (
    select s.id
    from public.sessions s
    join public.bookings b on b.session_id = s.id
    where s.kind <> 'group'
      and b.coaching_id = any (private.delegated_coaching_ids('{schedule,attendance}'))
    union all
    select d.session_id
    from public.delegations d
    where d.delegate_trainer_id = auth.uid() and d.kind = 'substitute' and private.substitutes_session(d.session_id)
  ) x
$$;

-- Every user × every argument where the new and the old answer differ, as "user: call", sorted sets compared.
create function tests.differences(p_call text) returns setof text language plpgsql set search_path = '' as $$
declare
  v_user record;
  v_arg text;
  v_args text[];
  v_new uuid[];
  v_old uuid[];
begin
  v_args := case p_call
    when 'trainer_coaching_ids' then array['null', '''{passes}''', '''{nutrition}''', '''{attendance,notes}''', '''{progress,workouts}''', '''{schedule}''', '''{homework}''']
    when 'viewable_client_ids' then array['''nutrition''', '''measurements''', '''photos''', '''steps''', '''intake''', '''workouts''']
    else array[''] end;
  for v_user in select u.handle from tests.users u order by u.handle loop
    perform tests.set_claims(v_user.handle);
    foreach v_arg in array v_args loop
      execute format('select array(select unnest(private.%s(%s)) order by 1), array(select unnest(tests.old_%s(%s)) order by 1)',
                     p_call, v_arg, p_call, v_arg)
        into v_new, v_old;
      if v_new is distinct from v_old then
        return next v_user.handle || ': ' || p_call || '(' || v_arg || ')';
      end if;
    end loop;
  end loop;
  perform tests.clear_authentication();
end $$;

select is_empty($$ select tests.differences('trainer_coaching_ids') $$, 'trainer_coaching_ids answers as before');
select is_empty($$ select tests.differences('viewable_client_ids') $$, 'viewable_client_ids answers as before');
select is_empty($$ select tests.differences('delegated_client_ids') $$, 'delegated_client_ids answers as before');
select is_empty($$ select tests.differences('delegated_session_ids') $$, 'delegated_session_ids answers as before');

-- The fixtures reach every branch, so "as before" is not "empty for everyone".
select tests.set_claims('sub_s');
select ok(
  cardinality(private.trainer_coaching_ids('{attendance}')) = 1
    and (select count(*) from tests.users u where u.handle like 'helper%' or u.handle = 'admin_m') = 3
    and cardinality(private.delegated_session_ids()) = 1,
  'the fixtures cover a substitute, assistants and an admin');
select tests.clear_authentication();

select * from finish();
rollback;
