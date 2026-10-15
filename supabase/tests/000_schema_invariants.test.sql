-- Invariants for the whole schema (data-model §1.1, §1.9, §4.1; contract §3). Each case loops over whatever
-- objects exist, so it holds while migrations are added and checks every new table, view and function.
begin;
\ir _helpers.psql
select plan(12);

select is(
  array(
    select c.relname::text from pg_catalog.pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
    order by 1
  ),
  '{}'::text[],
  'RLS is enabled on every table in public'
);

-- A policy without a TO clause applies to PUBLIC, which includes anon. On storage.objects only our own
-- policies count: their names start with one of our bucket ids.
select is(
  array(
    select p.polrelid::regclass::text || ': ' || p.polname from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    where (
        c.relnamespace = 'public'::regnamespace
        or (p.polrelid = to_regclass('storage.objects')
            and split_part(p.polname, ':', 1)
                in ('avatars', 'certificates', 'progress-photos', 'exercise-media', 'feedback', 'exports'))
      )
      and (0::oid = any (p.polroles) or 'anon'::regrole::oid = any (p.polroles))
    order by 1
  ),
  '{}'::text[],
  'no policy in public or on our storage buckets applies to anon or PUBLIC'
);

select is(
  array(
    select p.oid::regprocedure::text from pg_catalog.pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and p.prosecdef
      and not ('search_path=""' = any (coalesce(p.proconfig, '{}')))
    order by 1
  ),
  '{}'::text[],
  'every SECURITY DEFINER function in public/private sets search_path to empty'
);

select is(
  array(
    select c.relname::text from pg_catalog.pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
           or has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))
    order by 1
  ),
  '{}'::text[],
  'anon has no privilege on any table or view in public'
);

-- has_table_privilege looks at table-level grants only, so column-list INSERT and UPDATE grants pass.
select is(
  array(
    select c.relname::text from pg_catalog.pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and (has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
           or has_any_column_privilege('authenticated', c.oid, 'REFERENCES'))
    order by 1
  ),
  '{}'::text[],
  'authenticated has no table-level INSERT/UPDATE and no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN in public'
);

select is(
  array(
    select c.relname::text from pg_catalog.pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
      and not coalesce(c.reloptions && array['security_invoker=true', 'security_invoker=on'], false)
    order by 1
  ),
  '{}'::text[],
  'every view in public is security_invoker'
);

select is(
  array(
    select p.oid::regprocedure::text from pg_catalog.pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by 1
  ),
  '{}'::text[],
  'anon cannot execute any function in public or private'
);

-- One permissive policy per (table, command) for authenticated; a FOR ALL policy counts for every command.
select is(
  array(
    select x.tbl || ' ' || x.cmd
    from (
      select p.polrelid::regclass::text as tbl, cmd.cmd
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      cross join lateral unnest(
        case p.polcmd when '*' then array['r', 'a', 'w', 'd'] else array[p.polcmd::text] end
      ) as cmd (cmd)
      where c.relnamespace = 'public'::regnamespace
        and p.polpermissive
        and (0::oid = any (p.polroles) or 'authenticated'::regrole::oid = any (p.polroles))
    ) x
    group by x.tbl, x.cmd
    having count(*) > 1
    order by 1
  ),
  '{}'::text[],
  'no table in public has two permissive policies for the same command'
);

select is(
  array(
    select c.relname::text from pg_catalog.pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
      and obj_description(c.oid, 'pg_class') is null
    order by 1
  ),
  '{}'::text[],
  'every table and view in public has a comment'
);

-- Personal data stays hidden from admins unless break-glass applies through private.can_view (contract §4.3).
select is(
  array(
    select p.polrelid::regclass::text || ': ' || p.polname from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('measurements', 'progress_photos', 'intakes', 'coaching_notes', 'workout_logs',
                        'workout_log_exercises', 'workout_sets', 'personal_records', 'data_exports', 'calendar_feeds')
      and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%is_admin%'
           or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%is_admin%')
    order by 1
  ),
  '{}'::text[],
  'no policy on personal-data tables calls is_admin'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated has no USAGE on schema private'
);

-- A function added by a later migration starts closed: nobody but the owner (and service_role in public)
-- may run it until the migration grants EXECUTE, so a forgotten revoke cannot open an RPC to anon.
create function public.zz_default_acl_probe() returns integer language sql set search_path = '' as $$ select 1 $$;
create function private.zz_default_acl_probe() returns integer language sql set search_path = '' as $$ select 1 $$;
select is(
  array(
    select r || ' ' || f from unnest(array['public', 'anon', 'authenticated']) r,
      unnest(array['public.zz_default_acl_probe()', 'private.zz_default_acl_probe()']) f
    where has_function_privilege(r, f, 'EXECUTE')
    order by 1
  ),
  '{}'::text[],
  'a new function gets no EXECUTE for PUBLIC, anon or authenticated by default'
);

select * from finish();
rollback;
