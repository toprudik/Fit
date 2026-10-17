-- Homework (PRD wave-2 §10, data-model "homework"): the trainer of a live pair gives the client a task between
-- sessions with a deadline, once or on weekdays up to a date; each deadline is an occurrence the client marks
-- done, with an optional comment, and may unmark within 24 hours. "Overdue" is derived: an occurrence past its
-- day (in the client's time zone) without a mark. The client gets a bot reminder at 10:00 on the day; the
-- trainer gets a note when it is done, only after turning that on (off by default). Ending the pair archives
-- its homework. Exercises, a workout template and a set log on completion come in a later migration.
-- Every write goes through the functions below: they expand the repeats into occurrences, which no user writes.

create table public.homework (
  id              uuid primary key default gen_random_uuid(),
  coaching_id     uuid not null references public.coachings (id) on delete cascade,
  title           text not null check (char_length(pg_catalog.btrim(title)) between 1 and 200),
  description     text check (char_length(description) <= 2000),
  video_url       text check (video_url ~ '^https://' and char_length(video_url) <= 500),
  due_date        date not null,                       -- the first (or only) deadline, the client's day
  repeat_weekdays smallint[] check (repeat_weekdays <@ '{1,2,3,4,5,6,7}' and cardinality(repeat_weekdays) >= 1),
  repeat_until    date,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint homework_repeat_check check ((repeat_weekdays is null) = (repeat_until is null)),
  constraint homework_repeat_until_check check (repeat_until is null or repeat_until between due_date and due_date + 183)
);

comment on table public.homework is
  'A task the trainer gives the client of a pair between sessions: once, or on ISO weekdays from due_date to repeat_until.';

create index homework_coaching_id_idx on public.homework (coaching_id);

create trigger homework_set_updated_at
  before update on public.homework
  for each row execute function public.set_updated_at();

create table public.homework_occurrences (
  id          uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework (id) on delete cascade,
  due_on      date not null,
  done_at     timestamptz,
  comment     text check (char_length(comment) <= 1000),
  unique (homework_id, due_on)
);

comment on table public.homework_occurrences is
  'One deadline of a homework and its mark. Overdue = done_at null after due_on in the client''s time zone.';

create index homework_occurrences_open_idx on public.homework_occurrences (due_on) where done_at is null;

alter table public.homework enable row level security;
alter table public.homework_occurrences enable row level security;
revoke all on table public.homework, public.homework_occurrences from anon, authenticated;

-- Both sides of the pair read, in any pair status; another trainer of the same client does not (10.5).
create policy "homework: pair reads"
  on public.homework for select
  to authenticated
  using (private.is_coaching_client(coaching_id) or private.is_coaching_trainer(coaching_id, 'homework'));

-- Readable with the homework (the subquery runs under the homework policy).
create policy "homework_occurrences: homework readers read"
  on public.homework_occurrences for select
  to authenticated
  using (exists (select 1 from public.homework h where h.id = homework_id));

grant select on table public.homework, public.homework_occurrences to authenticated;

-- The client's day now: their time zone, else Moscow as everywhere else.
create function private.client_today(p_coaching uuid, p_now timestamptz default now())
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (p_now at time zone coalesce(
            (select s.time_zone from public.coachings c
             join public.user_settings s on s.user_id = c.client_id
             where c.id = p_coaching),
            'Europe/Moscow'))::date
$$;

comment on function private.client_today(uuid, timestamptz) is 'The current day of the pair''s client, in their time zone.';
revoke all on function private.client_today(uuid, timestamptz) from public;

-- The client's day for either side of the pair: deadlines and "overdue" are in the client's days, and the
-- trainer cannot read the client's settings. Null for anyone else.
create function public.homework_today(p_coaching uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select private.client_today(p_coaching) where private.is_coaching_member(p_coaching)
$$;

comment on function public.homework_today(uuid) is 'Pair members: the client''s current day, which homework deadlines follow.';
revoke all on function public.homework_today(uuid) from public, anon;
grant execute on function public.homework_today(uuid) to authenticated;

-- The deadlines of a homework: the one day, or every listed ISO weekday from the first day to the last.
create function private.homework_dates(p_due date, p_weekdays smallint[], p_until date)
returns setof date
language sql
immutable
set search_path = ''
as $$
  select p_due where p_weekdays is null
  union all
  select d::date
  from pg_catalog.generate_series(p_due::timestamp, p_until::timestamp, interval '1 day') d
  where p_weekdays is not null and pg_catalog.date_part('isodow', d)::smallint = any (p_weekdays)
$$;

comment on function private.homework_dates(date, smallint[], date) is
  'Deadlines of a homework: due_date alone, or each of repeat_weekdays (ISO) between due_date and repeat_until.';
revoke all on function private.homework_dates(date, smallint[], date) from public;

-- Creates (no "id") or edits (with "id") a homework of a live pair the caller trains, and lays out its
-- occurrences. An edit keeps the marks and past deadlines and lays out the open ones from today again.
-- p_homework: {id?, coaching_id (new only), title, description?, video_url?, due_date, repeat_weekdays?: [1..7],
--              repeat_until?}
-- Errors (message): not_found, pair_ended, card_client, due_in_past, no_dates; 22023 for bad input.
create function public.save_homework(p_homework jsonb)
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
begin
  if pg_catalog.jsonb_typeof(p_homework -> 'repeat_weekdays') = 'array'
     and pg_catalog.jsonb_array_length(p_homework -> 'repeat_weekdays') > 0 then
    select pg_catalog.array_agg(distinct x::smallint order by x::smallint) into v_weekdays
    from pg_catalog.jsonb_array_elements_text(p_homework -> 'repeat_weekdays') x;
  end if;
  if v_title is null or v_due is null or (v_weekdays is null) <> (v_until is null) then
    raise exception 'title and due_date are required, weekdays go with repeat_until' using errcode = '22023';
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

  v_today := private.client_today(v_coaching);
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

  insert into public.homework_occurrences (homework_id, due_on)
  select v_id, d from private.homework_dates(v_due, v_weekdays, v_until) d where d >= v_today
  on conflict (homework_id, due_on) do nothing;
  return v_id;
end $$;

comment on function public.save_homework(jsonb) is
  'Trainer of a live pair: creates or edits a homework and lays out its open occurrences from the client''s today.';
revoke all on function public.save_homework(jsonb) from public, anon;
grant execute on function public.save_homework(jsonb) to authenticated;

-- "В архив": the trainer takes a homework off both sides' lists; its marks stay.
create function public.archive_homework(p_homework uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.homework h set archived_at = pg_catalog.now()
  where h.id = p_homework and h.archived_at is null
    and exists (select 1 from public.coachings c where c.id = h.coaching_id and c.trainer_id = (select auth.uid()));
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end $$;

comment on function public.archive_homework(uuid) is 'Trainer of the pair: archives a homework.';
revoke all on function public.archive_homework(uuid) from public, anon;
grant execute on function public.archive_homework(uuid) to authenticated;

-- "Выполнено" by the client of a live pair: a deadline that has come, or the nearest open one ahead (the task
-- may be done before its day). A second call only changes the comment. The trainer hears of it when they
-- turned homework_done on (a row with enabled = true; the type is off by default, PRD 10-5).
-- Errors (message): not_found, not_yet.
create function public.mark_homework_done(p_occurrence uuid, p_comment text default null)
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

  if r.done_at is not null then
    update public.homework_occurrences set comment = v_comment where id = r.id;
    return r.done_at;
  end if;
  if r.due_on > private.client_today(r.coaching_id) and exists (
       select 1 from public.homework_occurrences o
       where o.homework_id = r.homework_id and o.done_at is null and o.due_on < r.due_on) then
    raise exception 'not_yet' using errcode = 'P0001';
  end if;

  update public.homework_occurrences set done_at = pg_catalog.now(), comment = v_comment
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

comment on function public.mark_homework_done(uuid, text) is
  'Client of a live pair: marks a homework occurrence done (or changes its comment) and tells the trainer if they asked.';
revoke all on function public.mark_homework_done(uuid, text) from public, anon;
grant execute on function public.mark_homework_done(uuid, text) to authenticated;

-- Takes a mark back within 24 hours (PRD 10-4). Errors (message): not_found, too_late.
create function public.unmark_homework_done(p_occurrence uuid)
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
  update public.homework_occurrences set done_at = null, comment = null where id = p_occurrence;
end $$;

comment on function public.unmark_homework_done(uuid) is 'Client: takes back a homework mark made less than 24 hours ago.';
revoke all on function public.unmark_homework_done(uuid) from public, anon;
grant execute on function public.unmark_homework_done(uuid) to authenticated;

-- Ending a pair archives its homework (wave-2 edge cases).
create function private.archive_homework_of_ended_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.homework set archived_at = pg_catalog.now()
  where coaching_id = new.id and archived_at is null;
  return null;
end $$;

comment on function private.archive_homework_of_ended_pair() is 'Trigger: archives the homework of a pair that ends.';
revoke all on function private.archive_homework_of_ended_pair() from public;

create trigger coachings_archive_homework
  after update of status on public.coachings
  for each row when (new.status = 'ended' and old.status is distinct from 'ended')
  execute function private.archive_homework_of_ended_pair();

-- Queues the reminder of every open occurrence due today in its client's time zone once it is 10:00 there
-- (PRD 10-5, 10.1), once per occurrence (the dedupe key). Quiet hours and a switched-off type apply in the
-- dispatcher. A homework given for today after 10:00 is reminded at once.
create function private.queue_homework_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select o.id, o.homework_id, h.title, h.coaching_id, c.client_id, c.trainer_id
    from public.homework_occurrences o
    join public.homework h on h.id = o.homework_id
    join public.coachings c on c.id = h.coaching_id
    left join public.user_settings s on s.user_id = c.client_id
    where o.done_at is null
      and o.due_on between (p_now at time zone 'UTC')::date - 1 and (p_now at time zone 'UTC')::date + 1
      and h.archived_at is null
      and c.status in ('trial', 'active')
      and o.due_on = (p_now at time zone coalesce(s.time_zone, 'Europe/Moscow'))::date
      and (p_now at time zone coalesce(s.time_zone, 'Europe/Moscow'))::time >= time '10:00'
      and not exists (select 1 from public.notification_outbox x where x.dedupe_key = 'homework:' || o.id)
  loop
    if private.enqueue_notification(
         'homework_reminder', 'homework:' || r.id,
         (select pg_catalog.jsonb_build_object(
                   'coaching_id', r.coaching_id, 'homework_id', r.homework_id, 'title', r.title,
                   'first_name', p.first_name, 'last_name', p.last_name)
          from public.profiles p where p.id = r.trainer_id),
         r.client_id, null, p_now) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

comment on function private.queue_homework_reminders(timestamptz) is
  'pg_cron: queues the 10:00 reminder of each open homework occurrence due today in its client''s time zone.';
revoke all on function private.queue_homework_reminders(timestamptz) from public;

select cron.schedule('homework-reminders', '*/5 * * * *', 'select private.queue_homework_reminders()');
