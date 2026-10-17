-- Homework for delegates (PRD wave-3 §1, data-model "Делегирование"): an assistant with the 'homework' scope
-- gives and archives homework in the pairs they cover, as the owner trainer does. Exercises may be the catalog's,
-- the assistant's own or the owner trainer's, so the assistant can reuse the owner's library. Everyone else
-- still gets not_found, as before.

create or replace function public.save_homework(p_homework jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_homework ->> 'id', '')::uuid;
  v_coaching uuid;
  v_old_due date;
  v_title text := nullif(pg_catalog.btrim(p_homework ->> 'title'), '');
  v_description text := nullif(pg_catalog.btrim(p_homework ->> 'description'), '');
  v_video text := nullif(pg_catalog.btrim(p_homework ->> 'video_url'), '');
  v_due date := (p_homework ->> 'due_date')::date;
  v_until date := nullif(p_homework ->> 'repeat_until', '')::date;
  v_weekdays smallint[];
  v_today date;
  v_exercises jsonb := p_homework -> 'exercises';
begin
  if pg_catalog.jsonb_typeof(p_homework -> 'repeat_weekdays') = 'array'
     and pg_catalog.jsonb_array_length(p_homework -> 'repeat_weekdays') > 0 then
    select pg_catalog.array_agg(distinct x::smallint order by x::smallint) into v_weekdays
    from pg_catalog.jsonb_array_elements_text(p_homework -> 'repeat_weekdays') x;
  end if;
  if v_title is null or v_due is null or (v_weekdays is null) <> (v_until is null) then
    raise exception 'title and due_date are required, weekdays go with repeat_until' using errcode = '22023';
  end if;
  if v_exercises is not null and (pg_catalog.jsonb_typeof(v_exercises) <> 'array'
                                  or pg_catalog.jsonb_array_length(v_exercises) > 30) then
    raise exception 'exercises is a list of up to 30' using errcode = '22023';
  end if;

  if v_id is null then
    v_coaching := nullif(p_homework ->> 'coaching_id', '')::uuid;
  else
    select h.coaching_id, h.due_date into v_coaching, v_old_due
    from public.homework h where h.id = v_id and h.archived_at is null;
  end if;
  if v_coaching is null or not private.is_coaching_trainer(v_coaching, 'homework') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.is_live_coaching(v_coaching) then
    raise exception 'pair_ended' using errcode = 'P0001';
  end if;
  if exists (
       select 1 from public.coachings c join public.profiles p on p.id = c.client_id
       where c.id = v_coaching and (p.managed_by_trainer_id is not null or c.client_id = private.deleted_client_id())) then
    raise exception 'card_client' using errcode = 'P0001';
  end if;
  if exists (
       select 1 from pg_catalog.jsonb_array_elements(coalesce(v_exercises, '[]')) x
       where not exists (
         select 1 from public.exercises e
         where e.id::text = x ->> 'exercise_id' and (e.source = 'wger' or e.owner_id = (select auth.uid())
                or e.owner_id = (select c.trainer_id from public.coachings c where c.id = v_coaching)))) then
    raise exception 'bad_exercise' using errcode = 'P0001';
  end if;

  v_today := private.pair_client_today(v_coaching);
  if v_due < v_today and v_due is distinct from v_old_due then
    raise exception 'due_in_past' using errcode = 'P0001';
  end if;
  if not exists (select 1 from private.homework_dates(v_due, v_weekdays, v_until) d where d >= v_today) then
    raise exception 'no_dates' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.homework (coaching_id, title, description, video_url, due_date, repeat_weekdays, repeat_until)
    values (v_coaching, v_title, v_description, v_video, v_due, v_weekdays, v_until)
    returning id into v_id;
  else
    update public.homework set
      title = v_title, description = v_description, video_url = v_video, due_date = v_due,
      repeat_weekdays = v_weekdays, repeat_until = v_until
    where id = v_id;
    delete from public.homework_occurrences o where o.homework_id = v_id and o.done_at is null and o.due_on >= v_today;
  end if;

  if v_exercises is not null then
    delete from public.homework_exercises he where he.homework_id = v_id;
    insert into public.homework_exercises (homework_id, position, exercise_id, prescription)
    select v_id, x.n, (x.e ->> 'exercise_id')::uuid, nullif(pg_catalog.btrim(x.e ->> 'prescription'), '')
    from pg_catalog.jsonb_array_elements(v_exercises) with ordinality as x (e, n);
  end if;

  insert into public.homework_occurrences (homework_id, due_on)
  select v_id, d from private.homework_dates(v_due, v_weekdays, v_until) d where d >= v_today
  on conflict (homework_id, due_on) do nothing;
  return v_id;
end $$;

comment on function public.save_homework(jsonb) is
  'Trainer of a live pair or their assistant with homework: creates or edits a homework and lays out its open '
  'occurrences from the client''s today.';

create or replace function public.archive_homework(p_homework uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.homework h set archived_at = pg_catalog.now()
  where h.id = p_homework and h.archived_at is null and private.is_coaching_trainer(h.coaching_id, 'homework');
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end $$;

comment on function public.archive_homework(uuid) is 'Trainer of the pair or their assistant with homework: archives a homework.';
