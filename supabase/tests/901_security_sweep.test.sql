-- Security sweep over the catalog (data-model §1.1, §1.9, §4.1, §4.3). It adds to 000_schema_invariants, which
-- already checks RLS on every table, policies for anon, search_path of definer functions, anon privileges, the
-- anon RPC allowlist, security_invoker views and default EXECUTE. Each case here loops over whatever objects
-- exist, so a new table, column or function is checked the day it is added.
begin;
\ir _helpers.psql
select plan(11);

-- Which functions each function in public/private calls, by name, followed transitively. A definer function
-- reads the caller if auth.uid() appears in it or in anything it reaches (private.is_admin, own_group, ...).
create table tests.fn (oid oid primary key, nsp text, name text, def text);
insert into tests.fn
select p.oid, n.nspname, p.proname, pg_catalog.pg_get_functiondef(p.oid)
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') and p.prokind = 'f';

create table tests.fn_reach (root oid, fn oid, primary key (root, fn));
with recursive calls as (
  select distinct f.oid as caller, g.oid as callee
  from tests.fn f
  cross join lateral regexp_matches(f.def, '(private|public)\.([a-z_0-9]+)\(', 'g') m
  join tests.fn g on g.nsp = m[1] and g.name = m[2]
  where g.oid <> f.oid
), reach (root, fn) as (
  select f.oid, f.oid from tests.fn f
  union
  select r.root, c.callee from reach r join calls c on c.caller = r.fn
)
insert into tests.fn_reach select root, fn from reach;

-- A definer RPC that never looks at the caller answers everyone alike, so it must be a deliberate public
-- lookup: the showcase prices and honors by slug and a story card by its unguessable id (all also open to anon in 000).
select is(
  array(
    select f.name from tests.fn f join pg_catalog.pg_proc p on p.oid = f.oid
    where f.nsp = 'public' and p.prosecdef and has_function_privilege('authenticated', f.oid, 'EXECUTE')
      and not exists (
        select 1 from tests.fn_reach r join tests.fn g on g.oid = r.fn
        where r.root = f.oid and g.def ~ 'auth\.uid\(\)')
    order by 1
  ),
  array['get_trainer_honors', 'get_trainer_showcase_prices', 'story_card'],
  'every definer RPC reads the caller (auth.uid()), directly or through what it calls, except the listed public lookups'
);

-- Admin RPCs (admin_*) are definer functions over every user's rows; each must reach the admin check.
select is(
  array(
    select f.name from tests.fn f
    where f.nsp = 'public' and f.name like 'admin\_%'
      and has_function_privilege('authenticated', f.oid, 'EXECUTE')
      and not exists (
        select 1 from tests.fn_reach r join tests.fn g on g.oid = r.fn
        where r.root = f.oid and g.nsp = 'private' and g.name = 'is_admin')
    order by 1
  ),
  '{}'::text[],
  'every admin_* RPC reaches private.is_admin()'
);

-- Dynamic SQL in a definer function is where an argument could turn into code with the owner's rights.
select is(
  array(
    select p.oid::regprocedure::text from pg_catalog.pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prosecdef
      and p.prosrc ~* '\mexecute\M'
    order by 1
  ),
  '{}'::text[],
  'no SECURITY DEFINER function in public or private runs dynamic SQL'
);

select is(
  array(
    select distinct p.oid::regprocedure::text
    from pg_catalog.pg_proc p cross join lateral aclexplode(p.proacl) a
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and a.grantee = 0
    order by 1
  ),
  '{}'::text[],
  'no function in public or private grants EXECUTE to PUBLIC'
);

-- An API role that owned an object could alter its policies, grants or body.
select is(
  array(
    select n.nspname || '.' || c.relname || ' ' || pg_catalog.pg_get_userbyid(c.relowner)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and pg_catalog.pg_get_userbyid(c.relowner) <> 'postgres'
    union all
    select p.oid::regprocedure::text || ' ' || pg_catalog.pg_get_userbyid(p.proowner)
    from pg_catalog.pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
    order by 1
  ),
  '{}'::text[],
  'every table, view, sequence and function in public and private is owned by postgres'
);

-- CREATE on a schema would let a caller plant a table or function that shadows ours.
select is(
  array(
    select r || ' ' || s from unnest(array['anon', 'authenticated']) r,
      unnest(array['public', 'private', 'storage', 'extensions']) s
    where has_schema_privilege(r, s, 'CREATE')
    order by 1
  ),
  '{}'::text[],
  'anon and authenticated cannot create objects in public, private, storage or extensions'
);

-- Column grants keep secrets out of reach even of the row's owner: hashes, Telegram ids and meeting links
-- go out only through definer functions (data-model §4.2, §4.3). The listed columns are read only by the
-- trainer who owns the row: the client link, the trial link and the meeting link of a week template.
select is(
  array(
    select c.relname || '.' || a.attname
    from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
      and a.attnum > 0 and not a.attisdropped
      and a.attname ~ '(hash|secret|password|token|telegram_id|meeting_url|blocked_reason|claimed_by)'
      and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')
    order by 1
  ),
  array['client_invites.token', 'trial_links.token', 'week_template_items.meeting_url'],
  'authenticated reads no hash, token, Telegram id or meeting link column except the listed trainer-owned ones'
);

-- Who owns a row is never editable by the API: moving a row to another user or pair goes through an RPC.
-- body_profiles.user_id is granted for the client's upsert; its policy pins the value to auth.uid().
select is(
  array(
    select c.relname || '.' || a.attname
    from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
      and a.attnum > 0 and not a.attisdropped
      and a.attname in ('id', 'user_id', 'client_id', 'trainer_id', 'owner_id', 'coaching_id', 'author_id',
                        'created_by', 'owner_trainer_id', 'delegate_trainer_id', 'reporter_id', 'role',
                        'requester_id', 'recipient_id', 'admin_id', 'target_user_id', 'beneficiary_id',
                        'referrer_id', 'referee_id', 'entered_by', 'reported_by', 'confirmed_by',
                        'managed_by_trainer_id', 'claimant_id', 'verification_status', 'status')
      and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')
    order by 1
  ),
  array['body_profiles.user_id', 'feedback.status', 'payments.status', 'slots.status'],
  'authenticated may update no owner, role or status column except the listed ones (each guarded by policy or trigger)'
);

select is(
  array(
    select p.polrelid::regclass::text || ': ' || p.polname from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    where c.relnamespace = 'public'::regnamespace
      and p.polroles <> array['authenticated'::regrole::oid]
    order by 1
  ),
  '{}'::text[],
  'every policy in public applies to authenticated only (service_role bypasses RLS and needs none)'
);

-- Realtime would stream rows past the RPCs that shape them; no table is published.
select is(
  array(
    select pt.pubname || ' ' || pt.schemaname || '.' || pt.tablename from pg_catalog.pg_publication_tables pt
    where pt.schemaname in ('public', 'private')
    order by 1
  ),
  '{}'::text[],
  'no table in public or private is in a publication'
);

select is(
  array(select b.id from storage.buckets b where b.public order by 1),
  array['avatars', 'exercise-media'],
  'only the avatars and exercise-media buckets are public'
);

select * from finish();
rollback;
