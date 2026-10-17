-- Homework with exercises and a log of sets (PRD wave-2 §10-1, 10-3, acceptance 10.2). The trainer lists
-- exercises from the library (or fills the list from a template) with a short prescription; the client may
-- write the sets as a workout of their own, and the mark keeps a link to that log.

create table public.homework_exercises (
  homework_id  uuid not null references public.homework (id) on delete cascade,
  position     smallint not null check (position between 1 and 30),
  exercise_id  uuid not null references public.exercises (id),
  prescription text check (char_length(prescription) <= 200),
  primary key (homework_id, position)
);

comment on table public.homework_exercises is
  'Exercises of a homework in order, with the trainer''s prescription ("3 × 12"); written by save_homework.';

create index homework_exercises_exercise_id_idx on public.homework_exercises (exercise_id);

alter table public.homework_exercises enable row level security;
revoke all on table public.homework_exercises from anon, authenticated;

create policy "homework_exercises: homework readers read"
  on public.homework_exercises for select
  to authenticated
  using (homework_id in (select h.id from public.homework h));

grant select on table public.homework_exercises to authenticated;

-- The client's own workout written for this deadline. The log stays when the mark is taken back.
alter table public.homework_occurrences
  add column workout_log_id uuid references public.workout_logs (id) on delete set null;

comment on column public.homework_occurrences.workout_log_id is
  'The client''s self log of the sets done for this deadline (PRD 10.2); null when marked without one.';

create index homework_occurrences_workout_log_id_idx on public.homework_occurrences (workout_log_id);

-- save_homework takes "exercises": [{exercise_id, prescription?}] (up to 30) and replaces the list; without
-- the key an edit keeps the list. An exercise is one the trainer can pick: the catalog or their own.
-- Errors (message): not_found, pair_ended, card_client, due_in_past, no_dates, bad_exercise; 22023 for bad input.
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
  if v_coaching is null or not exists (
       select 1 from public.coachings c where c.id = v_coaching and c.trainer_id = (select auth.uid())) then
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
         where e.id::text = x ->> 'exercise_id' and (e.source = 'wger' or e.owner_id = (select auth.uid())))) then
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

-- mark_homework_done takes the client's self log of the sets (p_log); a second call keeps an earlier link
-- unless a new log is given. Errors (message): not_found, not_yet, bad_log.
drop function public.mark_homework_done(uuid, text);

create function public.mark_homework_done(p_occurrence uuid, p_comment text default null, p_log uuid default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_comment text := nullif(pg_catalog.btrim(p_comment), '');
  v_done timestamptz;
begin
  select o.id, o.homework_id, o.due_on, o.done_at, h.title, h.coaching_id, c.trainer_id
  into r
  from public.homework_occurrences o
  join public.homework h on h.id = o.homework_id
  join public.coachings c on c.id = h.coaching_id
  where o.id = p_occurrence and c.client_id = (select auth.uid()) and h.archived_at is null
    and c.status in ('trial', 'active')
  for update of o;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if char_length(v_comment) > 1000 then
    raise exception 'a comment holds up to 1000 characters' using errcode = '22023';
  end if;
  if p_log is not null and not exists (
       select 1 from public.workout_logs l
       where l.id = p_log and l.client_id = (select auth.uid()) and l.coaching_id is null) then
    raise exception 'bad_log' using errcode = 'P0001';
  end if;

  if r.done_at is not null then
    update public.homework_occurrences set comment = v_comment, workout_log_id = coalesce(p_log, workout_log_id)
    where id = r.id;
    return r.done_at;
  end if;
  if r.due_on > private.pair_client_today(r.coaching_id) and exists (
       select 1 from public.homework_occurrences o
       where o.homework_id = r.homework_id and o.done_at is null and o.due_on < r.due_on) then
    raise exception 'not_yet' using errcode = 'P0001';
  end if;

  update public.homework_occurrences set done_at = pg_catalog.now(), comment = v_comment, workout_log_id = p_log
  where id = r.id
  returning done_at into v_done;

  if exists (select 1 from public.notification_preferences np
             where np.user_id = r.trainer_id and np.type = 'homework_done' and np.enabled) then
    perform private.enqueue_notification(
      'homework_done', 'homework_done:' || r.id,
      (select pg_catalog.jsonb_build_object(
                'coaching_id', r.coaching_id, 'homework_id', r.homework_id, 'title', r.title,
                'name', private.trainer_client_label(r.coaching_id), 'comment', v_comment)),
      r.trainer_id);
  end if;
  return v_done;
end $$;

comment on function public.mark_homework_done(uuid, text, uuid) is
  'Client of a live pair: marks a homework occurrence done (or changes its comment), optionally with their log of sets, and tells the trainer if they asked.';
revoke all on function public.mark_homework_done(uuid, text, uuid) from public, anon;
grant execute on function public.mark_homework_done(uuid, text, uuid) to authenticated;

-- Taking a mark back unlinks the log; the log itself stays in the client's diary.
create or replace function public.unmark_homework_done(p_occurrence uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_done timestamptz;
begin
  select o.done_at into v_done
  from public.homework_occurrences o
  join public.homework h on h.id = o.homework_id
  join public.coachings c on c.id = h.coaching_id
  where o.id = p_occurrence and c.client_id = (select auth.uid()) and h.archived_at is null
    and o.done_at is not null
  for update of o;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_done < pg_catalog.now() - interval '24 hours' then
    raise exception 'too_late' using errcode = 'P0001';
  end if;
  update public.homework_occurrences set done_at = null, comment = null, workout_log_id = null where id = p_occurrence;
end $$;
