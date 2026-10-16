-- Trainer invite RPCs of migration 20261016120000_trainer_invites.sql (PRD wave-1 §2.2 TINV-1..3, §4 ADM-1..3):
-- admin_create_trainer_invite, admin_revoke_trainer_invite, trainer_invite_status, redeem_trainer_invite.
begin;
\ir _helpers.psql
select plan(42);

select tests.create_admin('admin_x');
select tests.create_trainer('trainer_a');
select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_user('stranger_s');
select tests.create_pair('trainer_a', 'client_c');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- Codes the admin got back, by name, so later steps can use them.
create table tests.invite_codes (name text primary key, invite_id uuid not null, code text not null);
grant select on tests.invite_codes to authenticated;

-- =========================================================================================================
-- admin_create_trainer_invite

select tests.authenticate_as('client_c');
select throws_ok(
  $$ select * from public.admin_create_trainer_invite('for me') $$,
  '42501', null, 'create: a plain user cannot create an invite'
);
select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select * from public.admin_create_trainer_invite('for a friend') $$,
  '42501', null, 'create: a trainer cannot create an invite'
);
select tests.authenticate_as_anon();
select throws_ok(
  $$ select * from public.admin_create_trainer_invite('anon') $$,
  '42501', null, 'create: anon cannot call the function'
);

select tests.authenticate_as('admin_x');
select throws_ok(
  $$ select * from public.admin_create_trainer_invite('too long', 91) $$,
  '22023', null, 'create: more than 90 days is refused'
);
select throws_ok(
  $$ select * from public.admin_create_trainer_invite('none', 0) $$,
  '22023', null, 'create: 0 days is refused'
);
select tests.clear_authentication();

-- Created as the admin; written to the helper table as postgres.
select tests.authenticate_as('admin_x');
create temporary table created on commit drop as
  select 'main' as name, * from public.admin_create_trainer_invite('  Ivan from the Kazan gym  ')
  union all select 'second', * from public.admin_create_trainer_invite(null, 3)
  union all select 'revoke_me', * from public.admin_create_trainer_invite('')
  union all select 'expire_me', * from public.admin_create_trainer_invite('soon', 1)
  union all select 'race', * from public.admin_create_trainer_invite();
select tests.clear_authentication();
insert into tests.invite_codes select name, invite_id, code from created;

select ok(
  (select bool_and(code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$') from tests.invite_codes),
  'create: codes are 12 characters without look-alikes'
);
select is(
  (select count(distinct code)::int from tests.invite_codes), 5, 'create: every code is different'
);
select results_eq(
  $$ select ti.code_hint, ti.note, ti.created_by from public.trainer_invites ti
     join tests.invite_codes c on c.invite_id = ti.id where c.name = 'main' $$,
  $$ select right(code, 4), 'Ivan from the Kazan gym'::text, tests.u('admin_x') from tests.invite_codes where name = 'main' $$,
  'create: the row keeps the last 4 characters, the trimmed note and the admin'
);
select is(
  (select ti.code_hash from public.trainer_invites ti join tests.invite_codes c on c.invite_id = ti.id where c.name = 'main'),
  (select extensions.digest(code, 'sha256') from tests.invite_codes where name = 'main'),
  'create: only the sha256 of the code is stored'
);
select is(
  (select ti.note from public.trainer_invites ti join tests.invite_codes c on c.invite_id = ti.id where c.name = 'revoke_me'),
  null, 'create: an empty note is stored as null'
);
select ok(
  (select ti.expires_at between now() + interval '14 days' - interval '1 minute' and now() + interval '14 days' + interval '1 minute'
   from public.trainer_invites ti join tests.invite_codes c on c.invite_id = ti.id where c.name = 'main'),
  'create: valid for 14 days by default'
);
select ok(
  (select ti.expires_at < now() + interval '3 days 1 minute' and ti.expires_at > now() + interval '2 days 23 hours'
   from public.trainer_invites ti join tests.invite_codes c on c.invite_id = ti.id where c.name = 'second'),
  'create: valid for the days asked'
);
select is(
  (select count(*)::int from public.admin_audit_log
   where action = 'trainer_invite.create' and actor_id = tests.u('admin_x')
     and target_id in (select invite_id from tests.invite_codes)),
  5, 'create: each invite is in the audit log'
);

-- =========================================================================================================
-- admin_revoke_trainer_invite

select tests.authenticate_as('client_c');
select throws_ok(
  $$ select public.admin_revoke_trainer_invite((select invite_id from tests.invite_codes where name = 'revoke_me')) $$,
  '42501', null, 'revoke: a plain user cannot revoke'
);
select tests.authenticate_as('admin_x');
select lives_ok(
  $$ select public.admin_revoke_trainer_invite((select invite_id from tests.invite_codes where name = 'revoke_me')) $$,
  'revoke: the admin revokes an unused invite'
);
select throws_ok(
  $$ select public.admin_revoke_trainer_invite((select invite_id from tests.invite_codes where name = 'revoke_me')) $$,
  'P0001', 'invite_not_revocable', 'revoke: a revoked invite cannot be revoked again'
);
select throws_ok(
  $$ select public.admin_revoke_trainer_invite(gen_random_uuid()) $$,
  'P0001', 'invite_not_found', 'revoke: an unknown id is reported'
);
select tests.clear_authentication();
select isnt(
  (select ti.revoked_at from public.trainer_invites ti join tests.invite_codes c on c.invite_id = ti.id where c.name = 'revoke_me'),
  null, 'revoke: revoked_at is set'
);
select is(
  (select count(*)::int from public.admin_audit_log
   where action = 'trainer_invite.revoke' and target_id = (select invite_id from tests.invite_codes where name = 'revoke_me')),
  1, 'revoke: the revocation is in the audit log once'
);

-- Expire one invite by moving its date back, as the clock would.
update public.trainer_invites set expires_at = now() - interval '1 second'
where id = (select invite_id from tests.invite_codes where name = 'expire_me');

-- =========================================================================================================
-- trainer_invite_status

select tests.authenticate_as('client_c');
select is(
  public.trainer_invite_status((select code from tests.invite_codes where name = 'main')), 'valid',
  'status: an unused invite is valid'
);
select is(
  public.trainer_invite_status((select lower(substr(code, 1, 4) || '-' || substr(code, 5, 4) || ' ' || substr(code, 9))
                                from tests.invite_codes where name = 'main')),
  'valid', 'status: case, dashes and spaces do not matter'
);
select is(public.trainer_invite_status('NOPE-NOPE-NOPE'), 'invalid', 'status: an unknown code is invalid');
select is(public.trainer_invite_status(''), 'invalid', 'status: an empty code is invalid');
select is(
  public.trainer_invite_status((select code from tests.invite_codes where name = 'revoke_me')), 'revoked',
  'status: a revoked invite says so'
);
select is(
  public.trainer_invite_status((select code from tests.invite_codes where name = 'expire_me')), 'expired',
  'status: an expired invite says so'
);
select tests.authenticate_as('trainer_a');
select is(
  public.trainer_invite_status((select code from tests.invite_codes where name = 'main')), 'already_trainer',
  'status: a trainer is told they already are one'
);
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.trainer_invite_status('ABCD') $$, '42501', null, 'status: anon cannot check codes'
);

-- =========================================================================================================
-- redeem_trainer_invite

select tests.authenticate_as('trainer_a');
select throws_ok(
  $$ select public.redeem_trainer_invite((select code from tests.invite_codes where name = 'main')) $$,
  'P0001', 'already_trainer', 'redeem: a trainer gets already_trainer'
);
select tests.clear_authentication();
select is(
  (select redeemed_at from public.trainer_invites where id = (select invite_id from tests.invite_codes where name = 'main')),
  null, 'redeem: already_trainer leaves the invite unused'
);

select tests.authenticate_as('client_d');
select throws_ok(
  $$ select public.redeem_trainer_invite('NOPE-NOPE-NOPE') $$, 'P0001', 'invite_invalid', 'redeem: an unknown code fails'
);
select throws_ok(
  $$ select public.redeem_trainer_invite((select code from tests.invite_codes where name = 'revoke_me')) $$,
  'P0001', 'invite_revoked', 'redeem: a revoked invite fails (TINV-3, ADM-2)'
);
select throws_ok(
  $$ select public.redeem_trainer_invite((select code from tests.invite_codes where name = 'expire_me')) $$,
  'P0001', 'invite_expired', 'redeem: an expired invite fails (TINV-3)'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.trainer_profiles where user_id = tests.u('client_d')), 0,
  'redeem: failed attempts create no trainer profile'
);

-- client_c already trains with trainer_a: redeeming adds the trainer zone and leaves the pair alone.
select tests.authenticate_as('client_c');
select lives_ok(
  $$ select public.redeem_trainer_invite((select lower(code) from tests.invite_codes where name = 'main')) $$,
  'redeem: a client redeems a valid invite, in any case'
);
select results_eq(
  $$ select verification_status::text, slug ~ '^trainer-[a-z0-9]{6}$', trainer_invite_id
     from public.trainer_profiles where user_id = tests.u('client_c') $$,
  $$ select 'not_submitted'::text, true, invite_id from tests.invite_codes where name = 'main' $$,
  'redeem: the trainer profile starts not submitted, with a random slug and the invite'
);
select is(
  (select last_zone::text from public.user_settings where user_id = tests.u('client_c')), 'trainer',
  'redeem: the last zone becomes trainer'
);
select is(
  (select count(*)::int from public.coachings where client_id = tests.u('client_c') and status = 'active'), 1,
  'redeem: the client''s own pair stays as it was'
);
select is(public.trainer_invite_status('NOPE'), 'already_trainer', 'redeem: after it the user is a trainer');
select tests.clear_authentication();
select results_eq(
  $$ select redeemed_by, redeemed_at is not null from public.trainer_invites
     where id = (select invite_id from tests.invite_codes where name = 'main') $$,
  $$ values (tests.u('client_c'), true) $$,
  'redeem: the invite records who used it and when (ADM-3)'
);

-- The same code a second time, by someone else (TINV-2, ADM-1).
select tests.authenticate_as('client_d');
select is(
  public.trainer_invite_status((select code from tests.invite_codes where name = 'main')), 'redeemed',
  'status: a used invite says so'
);
select throws_ok(
  $$ select public.redeem_trainer_invite((select code from tests.invite_codes where name = 'main')) $$,
  'P0001', 'invite_redeemed', 'redeem: a used invite cannot be used by another user (TINV-2)'
);
select tests.authenticate_as('admin_x');
select throws_ok(
  $$ select public.admin_revoke_trainer_invite((select invite_id from tests.invite_codes where name = 'main')) $$,
  'P0001', 'invite_not_revocable', 'revoke: a used invite cannot be revoked'
);
select tests.clear_authentication();

select * from finish();
rollback;
