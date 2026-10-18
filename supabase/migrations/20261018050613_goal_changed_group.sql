-- §1.3 of wave 2: a trainer whose group template is the client's target is told about a new goal too, as the
-- goal picker promises. set_client_goal (body of 20261017033815_nutrition_targets.sql) also loops over live pairs
-- whose effective nutrition group has an active template and that have no own trainer target; that message carries
-- group_id and group_name. Returns false when the goal did not change.

create or replace function public.set_client_goal(p_goal public.goal_type)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_before public.goal_type;
  v_actor public.profiles;
  v_pair record;
begin
  if v_user is null or p_goal is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client_goal:' || v_user::text, 0));
  v_before := private.current_goal(v_user);
  if v_before is not distinct from p_goal then
    return false;
  end if;
  insert into public.client_goals (user_id, goal) values (v_user, p_goal);

  if v_before is not null then
    select * into v_actor from public.profiles p where p.id = v_user;
    for v_pair in
      select t.coaching_id, c.trainer_id, null::uuid as group_id, null::text as group_name
      from public.nutrition_targets t
      join public.coachings c on c.id = t.coaching_id
      where t.client_id = v_user and t.source = 'trainer' and t.effective_to is null
        and private.trainer_target_counts(t.coaching_id)
      union all
      select c.id, c.trainer_id, g.id, g.name
      from public.coachings c
      join public.groups g on g.id = private.effective_nutrition_group(c.id)
      join public.nutrition_targets t on t.group_id = g.id and t.source = 'group' and t.effective_to is null
      where c.client_id = v_user and private.trainer_target_counts(c.id)
        and not exists (select 1 from public.nutrition_targets o
                        where o.coaching_id = c.id and o.source = 'trainer' and o.effective_to is null)
    loop
      perform private.enqueue_notification(
        'goal_changed',
        'goal_changed:' || v_pair.coaching_id::text || ':' || pg_catalog.now()::text,
        pg_catalog.jsonb_build_object(
          'coaching_id', v_pair.coaching_id, 'goal', p_goal, 'previous_goal', v_before,
          'first_name', v_actor.first_name, 'last_name', v_actor.last_name)
          || case when v_pair.group_id is null then '{}'::jsonb
                  else pg_catalog.jsonb_build_object('group_id', v_pair.group_id, 'group_name', v_pair.group_name) end,
        v_pair.trainer_id);
    end loop;
  end if;
  return true;
end $$;
comment on function public.set_client_goal(public.goal_type) is
  'The client sets the goal (wave-2 §1); trainers with their own or their group''s active target are told (goal_changed).';
revoke all on function public.set_client_goal(public.goal_type) from public, anon;
grant execute on function public.set_client_goal(public.goal_type) to authenticated;
