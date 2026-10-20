-- Opting out of the app-opening count (legal item Б12). app_opens is first-party statistics tied to the account:
-- in the EU it needs consent, in the UK a free and simple way to object. Any user can switch the count off in
-- settings; that deletes their past openings and record_app_open stops writing new ones. Switching it back on only
-- counts openings from then on. We do not know where a user lives, so the switch is there for everyone.
--
-- record_app_open is the body of 20261017023400_admin_analytics.sql with the opt-out check added.

create table public.app_open_opt_outs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.app_open_opt_outs is
  'Users who switched off the app-opening count in settings; record_app_open writes nothing for them.';

alter table public.app_open_opt_outs enable row level security;
revoke all on table public.app_open_opt_outs from anon, authenticated;

create or replace function public.record_app_open(p_source text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_source public.notification_type;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.app_open_opt_outs x where x.user_id = v_user) then
    return;
  end if;
  if p_source is not null and p_source = any (enum_range(null::public.notification_type)::text[]) then
    v_source := p_source::public.notification_type;
  end if;

  insert into public.app_opens (user_id, source)
  select v_user, v_source
  where not exists (
    select 1 from public.app_opens o
    where o.user_id = v_user and o.source is not distinct from v_source
      and o.opened_at > pg_catalog.now() - interval '30 minutes'
  );
end $$;

comment on function public.record_app_open(text) is
  'Records that the signed-in user opened the app, from a bot button (?source=) or directly; repeats within 30 minutes are one visit. Nothing for a user who switched the count off.';

-- my_app_opens_counted: whether the signed-in user's openings are counted (the switch in settings).
create function public.my_app_opens_counted()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return not exists (select 1 from public.app_open_opt_outs x where x.user_id = v_user);
end $$;

comment on function public.my_app_opens_counted() is 'Whether the signed-in user''s app openings are counted.';
revoke all on function public.my_app_opens_counted() from public, anon;
grant execute on function public.my_app_opens_counted() to authenticated;

-- set_app_opens_counted: the switch. Off deletes the user's past openings and stops new ones; on counts from now.
create function public.set_app_opens_counted(p_counted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_counted is null then
    raise exception 'counted_required' using errcode = '22023';
  end if;
  if p_counted then
    delete from public.app_open_opt_outs x where x.user_id = v_user;
  else
    insert into public.app_open_opt_outs (user_id) values (v_user) on conflict (user_id) do nothing;
    delete from public.app_opens o where o.user_id = v_user;
  end if;
end $$;

comment on function public.set_app_opens_counted(boolean) is
  'Switches counting of the signed-in user''s app openings on or off; off also deletes their past openings.';
revoke all on function public.set_app_opens_counted(boolean) from public, anon;
grant execute on function public.set_app_opens_counted(boolean) to authenticated;
