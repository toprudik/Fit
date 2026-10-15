-- Policies and grants for the plans tables (data-model §2.1a, contract §1.4 file 24, R57-R59): plans,
-- plan_grants, access_requests. Grants and decisions are written only by admin RPCs (audit log, outbox),
-- so users get no write path to them.

-- plans ---------------------------------------------------------------------------------------------------

revoke all on table public.plans from anon, authenticated;
grant select on table public.plans to authenticated;

-- Reference data for "My plan" and locked-feature screens. Changed only by migrations.
create policy "plans: signed-in users read"
  on public.plans for select
  to authenticated
  using (true);

comment on policy "plans: signed-in users read" on public.plans is
  'Every signed-in user reads the plan list; nobody writes it through the API.';

-- plan_grants ---------------------------------------------------------------------------------------------

revoke all on table public.plan_grants from anon, authenticated;
grant select on table public.plan_grants to authenticated;

-- Admins read the history for the admin panel (R59). No write policies: a self-granted Pro is impossible.
create policy "plan_grants: owner or admin reads"
  on public.plan_grants for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

comment on policy "plan_grants: owner or admin reads" on public.plan_grants is
  'A user sees their own grants; admins see all. Grants and revocations go through admin RPCs.';

-- access_requests -----------------------------------------------------------------------------------------

revoke all on table public.access_requests from anon, authenticated;
grant select on table public.access_requests to authenticated;
-- status, decided_by and decided_at are not granted: a new request is always open, and the admin RPC decides.
grant insert (user_id, plan_code, feature) on table public.access_requests to authenticated;

create policy "access_requests: owner or admin reads"
  on public.access_requests for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

comment on policy "access_requests: owner or admin reads" on public.access_requests is
  'A user sees their own requests; admins see all of them to decide.';

-- One open request per user and plan is the unique index access_requests_one_open_uniq.
create policy "access_requests: owner inserts"
  on public.access_requests for insert
  to authenticated
  with check (user_id = (select auth.uid()));

comment on policy "access_requests: owner inserts" on public.access_requests is
  'A user asks for a plan for themselves only (the "Request access" button, PLAN-4).';
