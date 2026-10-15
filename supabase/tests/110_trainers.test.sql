-- Trainers policies of migration 20261015123100_trainers_policies.sql (contract §1.4 file 15, §6 110_trainers):
-- trainer_profiles, trainer_verifications, trainer_certificates, trainer_invites, client_invites, trial_links.
begin;
\ir _helpers.psql
select plan(91);

-- Fixtures: C has a live pair to A and a trial pair to B, E an ended pair to A. V is a trainer used for the
-- verification history and its deletion.
select tests.create_trainer('trainer_a');
select tests.create_trainer('trainer_b');
select tests.create_trainer('trainer_v');
select tests.create_user('client_c');
select tests.create_user('client_e');
select tests.create_user('stranger_s');
select tests.create_admin('admin_x');
select tests.create_pair('trainer_a', 'client_c');
select tests.create_pair('trainer_b', 'client_c', 'trial');
select tests.create_pair('trainer_a', 'client_e', 'ended');

create function tests.u(p_handle text) returns uuid language sql stable set search_path = '' as $$
  select tests.user_id(p_handle)
$$;

-- =========================================================================================================
-- trainer_profiles

select is(
  (select verification_status::text from public.trainer_profiles where user_id = tests.u('trainer_a')),
  'not_submitted',
  'trainer_profiles: a new trainer starts as not_submitted'
);

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ update public.trainer_profiles set headline = 'Strength coach', slug = 'coach-a'
     where user_id = tests.u('trainer_a') returning headline, slug $$,
  $$ values ('Strength coach'::text, 'coach-a'::text) $$,
  'trainer_profiles: the trainer updates own headline and slug'
);
select throws_ok(
  $$ update public.trainer_profiles set verification_status = 'verified' where user_id = tests.u('trainer_a') $$,
  '42501', null, 'trainer_profiles: the trainer cannot set verification_status'
);
select throws_ok(
  $$ update public.trainer_profiles set verified_at = now() where user_id = tests.u('trainer_a') $$,
  '42501', null, 'trainer_profiles: the trainer cannot set verified_at'
);
select throws_ok(
  $$ update public.trainer_profiles set trainer_invite_id = null where user_id = tests.u('trainer_a') $$,
  '42501', null, 'trainer_profiles: the trainer cannot set trainer_invite_id'
);
select throws_ok(
  $$ update public.trainer_profiles set user_id = tests.u('trainer_b') where user_id = tests.u('trainer_a') $$,
  '42501', null, 'trainer_profiles: the trainer cannot change user_id'
);
select is_empty(
  $$ update public.trainer_profiles set headline = 'hijacked' where user_id = tests.u('trainer_b') returning 1 $$,
  'trainer_profiles: A updating B''s profile changes 0 rows'
);
select throws_ok(
  $$ update public.trainer_profiles set slug = 'AB' where user_id = tests.u('trainer_a') $$,
  '23514', null, 'trainer_profiles: slug AB violates the check'
);
select throws_ok(
  $$ update public.trainer_profiles set slug = 'Ab-c' where user_id = tests.u('trainer_a') $$,
  '23514', null, 'trainer_profiles: slug Ab-c violates the check'
);
select throws_ok(
  $$ update public.trainer_profiles set default_client_reminder_offsets = '{60,60}' where user_id = tests.u('trainer_a') $$,
  '23514', null, 'trainer_profiles: duplicate default reminder offsets violate the check'
);
select tests.authenticate_as('stranger_s');
select throws_ok(
  $$ insert into public.trainer_profiles (user_id, slug) values (tests.u('stranger_s'), 'stranger') $$,
  '42501', null, 'trainer_profiles: a user cannot make themselves a trainer by insert'
);
select tests.clear_authentication();
select is(
  (select headline from public.trainer_profiles where user_id = tests.u('trainer_b')), null,
  'trainer_profiles: B''s headline is unchanged'
);

-- Who reads which trainer profiles.
select tests.authenticate_as('client_c');
select set_eq(
  $$ select user_id from public.trainer_profiles $$, array[tests.u('trainer_a'), tests.u('trainer_b')],
  'trainer_profiles: C reads the trainers of its live and trial pairs only'
);
select tests.authenticate_as('client_e');
select set_eq(
  $$ select user_id from public.trainer_profiles $$, array[tests.u('trainer_a')],
  'trainer_profiles: E still reads A after the pair ended'
);
select tests.authenticate_as('stranger_s');
select is_empty($$ select user_id from public.trainer_profiles $$, 'trainer_profiles: a stranger reads 0 rows');
select tests.authenticate_as('trainer_b');
select set_eq(
  $$ select user_id from public.trainer_profiles $$, array[tests.u('trainer_b')],
  'trainer_profiles: B reads only own profile, never A''s'
);
select tests.authenticate_as('admin_x');
select is(
  (select count(*)::integer from public.trainer_profiles), 3,
  'trainer_profiles: the admin reads every trainer'
);
select tests.authenticate_as_anon();
select throws_ok($$ select user_id from public.trainer_profiles $$, '42501', null, 'trainer_profiles: anon has no access');
select tests.clear_authentication();

-- Verification does not gate the trainer zone (decisions Q55).
insert into public.trainer_verifications (trainer_id, decision, reason, decided_by)
values (tests.u('trainer_a'), 'rejected', 'documents are not readable', tests.u('admin_x'));
select tests.set_claims('trainer_a');
select is(private.is_trainer(), true, 'trainer_profiles: is_trainer() stays true after a rejected verification');
select tests.clear_authentication();

-- =========================================================================================================
-- trainer_verifications (written as postgres: only RPCs write it)

insert into public.trainer_verifications (trainer_id, decision) values (tests.u('trainer_v'), 'pending');
select is(
  (select verification_status::text || ' ' || coalesce(verified_at::text, 'null')
   from public.trainer_profiles where user_id = tests.u('trainer_v')),
  'pending null',
  'trainer_verifications: a pending row syncs the status and leaves verified_at empty'
);
insert into public.trainer_verifications (trainer_id, decision, decided_by, created_at)
values (tests.u('trainer_v'), 'verified', tests.u('admin_x'), '2026-10-01 10:00+00');
select is(
  (select verification_status::text || ' ' || verified_at::text from public.trainer_profiles where user_id = tests.u('trainer_v')),
  'verified ' || '2026-10-01 10:00+00'::timestamptz::text,
  'trainer_verifications: a verified row sets verified_at to its own time'
);
insert into public.trainer_verifications (trainer_id, decision, reason, decided_by)
values (tests.u('trainer_v'), 'rejected', 'the certificate has expired', tests.u('admin_x'));
select is(
  (select verification_status::text || ' ' || coalesce(verified_at::text, 'null')
   from public.trainer_profiles where user_id = tests.u('trainer_v')),
  'rejected null',
  'trainer_verifications: a rejected row clears verified_at'
);
select throws_ok(
  $$ insert into public.trainer_verifications (trainer_id, decision) values (tests.u('trainer_v'), 'rejected') $$,
  '23514', null, 'trainer_verifications: rejected without a reason violates the check'
);
select throws_ok(
  $$ insert into public.trainer_verifications (trainer_id, decision) values (tests.u('trainer_v'), 'not_submitted') $$,
  '23514', null, 'trainer_verifications: not_submitted is not a decision'
);

select throws_ok(
  $$ update public.trainer_verifications set reason = 'changed later' where trainer_id = tests.u('trainer_v') $$,
  'P0001', 'append_only', 'trainer_verifications: postgres cannot update a row'
);
select throws_ok(
  $$ delete from public.trainer_verifications where trainer_id = tests.u('trainer_v') $$,
  'P0001', 'append_only', 'trainer_verifications: postgres cannot delete a row'
);
select throws_ok($$ truncate public.trainer_verifications $$, 'P0001', 'append_only', 'trainer_verifications: truncate raises');
select tests.authenticate_as_service_role();
select throws_ok(
  $$ update public.trainer_verifications set reason = 'changed later' where trainer_id = tests.u('trainer_v') $$,
  'P0001', 'append_only', 'trainer_verifications: service_role cannot update a row'
);
select throws_ok(
  $$ delete from public.trainer_verifications where trainer_id = tests.u('trainer_v') $$,
  'P0001', 'append_only', 'trainer_verifications: service_role cannot delete a row'
);

select tests.authenticate_as('trainer_v');
select is((select count(*)::integer from public.trainer_verifications), 3, 'trainer_verifications: the trainer reads own history');
select throws_ok(
  $$ insert into public.trainer_verifications (trainer_id, decision) values (tests.u('trainer_v'), 'pending') $$,
  '42501', null, 'trainer_verifications: the trainer cannot insert directly (RPC only)'
);
select tests.authenticate_as('admin_x');
select is(
  (select count(*)::integer from public.trainer_verifications where trainer_id = tests.u('trainer_v')), 3,
  'trainer_verifications: the admin reads the history'
);
select throws_ok(
  $$ insert into public.trainer_verifications (trainer_id, decision, decided_by)
     values (tests.u('trainer_v'), 'verified', tests.u('admin_x')) $$,
  '42501', null, 'trainer_verifications: the admin cannot insert directly (RPC only)'
);
select tests.authenticate_as('client_c');
select is_empty($$ select id from public.trainer_verifications $$, 'trainer_verifications: a client reads 0 rows');
select tests.authenticate_as('trainer_b');
select is_empty($$ select id from public.trainer_verifications $$, 'trainer_verifications: another trainer reads 0 rows');
select tests.clear_authentication();

select lives_ok(
  $$ delete from auth.users where id = tests.u('trainer_v') $$,
  'trainer_verifications: deleting the trainer''s auth user cascades through the append-only history'
);
select is_empty(
  $$ select id from public.trainer_verifications where trainer_id = tests.u('trainer_v') $$,
  'trainer_verifications: the history went with the trainer'
);

-- =========================================================================================================
-- trainer_certificates (TINV-6)

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.trainer_certificates (trainer_id, title, storage_path)
     values (tests.u('trainer_a'), 'CPT', tests.u('trainer_a') || '/cpt.pdf') $$,
  'trainer_certificates: the trainer adds a certificate'
);
select results_eq(
  $$ select title from public.trainer_certificates $$, $$ values ('CPT'::text) $$,
  'trainer_certificates: the trainer reads it'
);
select results_eq(
  $$ update public.trainer_certificates set title = 'CPT level 2', issuer = 'NASM'
     where trainer_id = tests.u('trainer_a') returning title $$,
  $$ values ('CPT level 2'::text) $$,
  'trainer_certificates: the trainer updates it'
);
select throws_ok(
  $$ update public.trainer_certificates set trainer_id = tests.u('trainer_b') where trainer_id = tests.u('trainer_a') $$,
  '42501', null, 'trainer_certificates: trainer_id cannot be changed'
);
select throws_ok(
  $$ insert into public.trainer_certificates (trainer_id, title, storage_path)
     values (tests.u('trainer_a'), 'CPT', 'other/c.pdf') $$,
  '23514', null, 'trainer_certificates: a path outside the trainer folder violates the check'
);

select tests.authenticate_as('trainer_b');
select is_empty($$ select id from public.trainer_certificates $$, 'trainer_certificates: B reads 0 of A''s certificates');
select throws_ok(
  $$ insert into public.trainer_certificates (trainer_id, title, storage_path)
     values (tests.u('trainer_a'), 'Fake', tests.u('trainer_a') || '/fake.pdf') $$,
  '42501', 'new row violates row-level security policy for table "trainer_certificates"',
  'trainer_certificates: B cannot add a certificate to A'
);
select is_empty(
  $$ update public.trainer_certificates set title = 'hijacked' returning 1 $$,
  'trainer_certificates: B updating A''s certificate changes 0 rows'
);
select is_empty(
  $$ delete from public.trainer_certificates returning 1 $$,
  'trainer_certificates: B deleting A''s certificate changes 0 rows'
);
select tests.authenticate_as('client_c');
select is_empty($$ select id from public.trainer_certificates $$, 'trainer_certificates: A''s client reads 0 rows');
select throws_ok(
  $$ insert into public.trainer_certificates (trainer_id, title, storage_path)
     values (tests.u('client_c'), 'CPT', tests.u('client_c') || '/cpt.pdf') $$,
  '23503', null, 'trainer_certificates: a non-trainer cannot add a certificate'
);
select tests.authenticate_as('admin_x');
select is(
  (select count(*)::integer from public.trainer_certificates where trainer_id = tests.u('trainer_a')), 1,
  'trainer_certificates: the admin reads them for verification'
);

select tests.authenticate_as('trainer_a');
select lives_ok(
  $$ insert into public.trainer_certificates (trainer_id, title, storage_path)
     select tests.u('trainer_a'), 'Certificate ' || n, tests.u('trainer_a') || '/c' || n || '.pdf'
     from generate_series(2, 5) n $$,
  'trainer_certificates: the trainer reaches 5 certificates'
);
select throws_ok(
  $$ insert into public.trainer_certificates (trainer_id, title, storage_path)
     values (tests.u('trainer_a'), 'Certificate 6', tests.u('trainer_a') || '/c6.pdf') $$,
  'P0001', 'certificate_limit', 'trainer_certificates: the 6th certificate raises certificate_limit'
);
select results_eq(
  $$ delete from public.trainer_certificates where title = 'Certificate 5' returning title $$,
  $$ values ('Certificate 5'::text) $$,
  'trainer_certificates: the trainer deletes a certificate'
);
select tests.clear_authentication();
select is(
  (select count(*)::integer from public.trainer_certificates where trainer_id = tests.u('trainer_a')), 4,
  'trainer_certificates: 4 certificates remain'
);

-- =========================================================================================================
-- trainer_invites (written as postgres: only admin RPCs write them)

insert into public.trainer_invites (code_hash, code_hint, note, created_by)
values (extensions.digest('invite-one', 'sha256'), 'ONE', 'for a gym in Kazan', tests.u('admin_x'));

select is(
  (select expires_at from public.trainer_invites where code_hint = 'ONE'), now() + interval '14 days',
  'trainer_invites: expires_at defaults to 14 days from now'
);

select tests.authenticate_as('trainer_a');
select is_empty($$ select id from public.trainer_invites $$, 'trainer_invites: a trainer reads 0 rows');
select tests.authenticate_as('stranger_s');
select is_empty($$ select id from public.trainer_invites $$, 'trainer_invites: a plain user reads 0 rows');
select tests.authenticate_as('admin_x');
select results_eq(
  $$ select code_hint, note from public.trainer_invites $$,
  $$ values ('ONE'::text, 'for a gym in Kazan'::text) $$,
  'trainer_invites: the admin reads the invite list'
);
select throws_ok($$ select code_hash from public.trainer_invites $$, '42501', null, 'trainer_invites: code_hash is never readable');
select throws_ok($$ select * from public.trainer_invites $$, '42501', null, 'trainer_invites: select * fails, columns must be listed');
select throws_ok(
  $$ insert into public.trainer_invites (code_hash, code_hint) values (extensions.digest('invite-two', 'sha256'), 'TWO') $$,
  '42501', null, 'trainer_invites: the admin cannot insert directly (RPC only)'
);
select throws_ok(
  $$ update public.trainer_invites set revoked_at = now() $$,
  '42501', null, 'trainer_invites: the admin cannot revoke directly (RPC only)'
);
select tests.clear_authentication();

select throws_ok(
  $$ insert into public.trainer_invites (code_hash, code_hint, redeemed_by, redeemed_at, revoked_at)
     values (extensions.digest('invite-three', 'sha256'), 'THREE', tests.u('client_e'), now(), now()) $$,
  '23514', null, 'trainer_invites: redeemed and revoked together violate the check'
);
insert into public.trainer_invites (code_hash, code_hint, redeemed_by, redeemed_at)
values (extensions.digest('invite-four', 'sha256'), 'FOUR', tests.u('client_e'), now());
select throws_ok(
  $$ insert into public.trainer_invites (code_hash, code_hint, redeemed_by, redeemed_at)
     values (extensions.digest('invite-five', 'sha256'), 'FIVE', tests.u('client_e'), now()) $$,
  '23505', null, 'trainer_invites: one user cannot redeem two invites'
);

-- =========================================================================================================
-- client_invites

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ insert into public.client_invites (trainer_id, label) values (tests.u('trainer_a'), 'QR at the gym')
     returning char_length(token), token ~ '^[A-Za-z0-9_-]{22}$', code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' $$,
  $$ values (22, true, true) $$,
  'client_invites: an insert with only a label gets a 22-character token and a 6-character code without look-alikes'
);
select throws_ok(
  $$ insert into public.client_invites (trainer_id, token) values (tests.u('trainer_a'), 'AAAAAAAAAAAAAAAAAAAAAA') $$,
  '42501', null, 'client_invites: the trainer cannot choose the token'
);
select throws_ok(
  $$ insert into public.client_invites (trainer_id, code) values (tests.u('trainer_a'), 'ABCDEF') $$,
  '42501', null, 'client_invites: the trainer cannot choose the code'
);
select throws_ok(
  $$ insert into public.client_invites (trainer_id, uses_count) values (tests.u('trainer_a'), 5) $$,
  '42501', null, 'client_invites: the trainer cannot set uses_count'
);
select throws_ok(
  $$ insert into public.client_invites (trainer_id, label) values (tests.u('trainer_b'), 'not mine') $$,
  '42501', 'new row violates row-level security policy for table "client_invites"',
  'client_invites: A cannot create an invite for B'
);
select results_eq(
  $$ update public.client_invites set label = 'Front desk QR', max_uses = 10 returning label, max_uses $$,
  $$ values ('Front desk QR'::text, 10) $$,
  'client_invites: the trainer updates the label and the use limit'
);
select throws_ok(
  $$ update public.client_invites set uses_count = 0 $$, '42501', null, 'client_invites: uses_count is not writable'
);
select throws_ok(
  $$ update public.client_invites set trainer_id = tests.u('trainer_b') $$, '42501', null,
  'client_invites: trainer_id is not writable'
);
select lives_ok($$ update public.client_invites set archived_at = now() $$, 'client_invites: the trainer archives a link');
select throws_ok(
  $$ update public.client_invites set archived_at = null $$, 'P0001', 'archived', 'client_invites: un-archiving raises archived'
);
select throws_ok($$ delete from public.client_invites $$, '42501', null, 'client_invites: delete raises 42501');

select tests.authenticate_as('trainer_b');
select is_empty($$ select id from public.client_invites $$, 'client_invites: B reads 0 of A''s invites');
select is_empty(
  $$ update public.client_invites set label = 'hijacked' returning 1 $$, 'client_invites: B updating A''s invite changes 0 rows'
);
select tests.authenticate_as('client_c');
select is_empty($$ select id from public.client_invites $$, 'client_invites: A''s client reads 0 rows');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.client_invites $$, '42501', null, 'client_invites: anon has no access');
select tests.clear_authentication();

-- =========================================================================================================
-- trial_links

select tests.authenticate_as('trainer_a');
select results_eq(
  $$ insert into public.trial_links (trainer_id, title, currency) values (tests.u('trainer_a'), 'First session', 'RUB')
     returning token ~ '^[A-Za-z0-9_-]{22}$', duration_min, price_minor $$,
  $$ values (true, 60::smallint, 0::bigint) $$,
  'trial_links: an insert gets a 22-character token and the defaults'
);
select throws_ok(
  $$ insert into public.trial_links (trainer_id, title, currency, token)
     values (tests.u('trainer_a'), 'Trial', 'RUB', 'AAAAAAAAAAAAAAAAAAAAAA') $$,
  '42501', null, 'trial_links: the trainer cannot choose the token'
);
select throws_ok(
  $$ insert into public.trial_links (trainer_id, title, currency, uses_count) values (tests.u('trainer_a'), 'Trial', 'RUB', 3) $$,
  '42501', null, 'trial_links: the trainer cannot set uses_count'
);
select throws_ok(
  $$ insert into public.trial_links (trainer_id, title, currency) values (tests.u('trainer_b'), 'Trial', 'RUB') $$,
  '42501', 'new row violates row-level security policy for table "trial_links"',
  'trial_links: A cannot create a link for B'
);
select throws_ok(
  $$ insert into public.trial_links (trainer_id, title, currency, duration_min) values (tests.u('trainer_a'), 'Trial', 'RUB', 10) $$,
  '23514', null, 'trial_links: duration_min 10 violates the check'
);
select throws_ok(
  $$ insert into public.trial_links (trainer_id, title, currency, price_minor) values (tests.u('trainer_a'), 'Trial', 'RUB', -1) $$,
  '23514', null, 'trial_links: a negative price violates the check'
);
select results_eq(
  $$ update public.trial_links set title = 'Free first session', price_minor = 0, duration_min = 45
     returning title, duration_min $$,
  $$ values ('Free first session'::text, 45::smallint) $$,
  'trial_links: the trainer updates title, price and length'
);
select lives_ok($$ update public.trial_links set archived_at = now() $$, 'trial_links: the trainer archives a link');
select throws_ok(
  $$ update public.trial_links set archived_at = null $$, 'P0001', 'archived', 'trial_links: un-archiving raises archived'
);
select throws_ok($$ delete from public.trial_links $$, '42501', null, 'trial_links: delete raises 42501');

select tests.authenticate_as('trainer_b');
select is_empty($$ select id from public.trial_links $$, 'trial_links: B reads 0 of A''s links');
select is_empty(
  $$ update public.trial_links set title = 'hijacked' returning 1 $$, 'trial_links: B updating A''s link changes 0 rows'
);
select tests.authenticate_as('client_c');
select is_empty($$ select id from public.trial_links $$, 'trial_links: A''s client reads 0 rows');
select tests.clear_authentication();

select * from finish();
rollback;
