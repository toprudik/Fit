-- Policies, grants, guards and audit triggers for the admin tables (data-model §4.2, contract §1.4 file 23):
-- feedback, reports, admin_audit_log, break_glass_grants. Tables: 20261015121000_admin_tables.sql.
-- Every table starts from "revoke all" and gets back exactly the privileges below. Server code with the
-- secret key (service_role) keeps its default privileges and bypasses RLS, but not the triggers.
-- Admin actions go through admin_* RPCs later (R13). The two direct admin updates the matrix keeps (feedback
-- status and issue link, break-glass revocation) are written to admin_audit_log by triggers here (R47).

revoke all on table public.feedback, public.reports, public.admin_audit_log, public.break_glass_grants
  from anon, authenticated;

-- feedback ------------------------------------------------------------------------------------------------

grant select on table public.feedback to authenticated;
-- id is insertable so the app can upload screenshots to <user_id>/<id>/ before it inserts the row.
-- status and github_issue_url are not: a new message always starts as 'new' without an issue.
grant insert (id, user_id, zone, kind, body, route, platform, app_version, locale, theme, attachment_paths)
  on table public.feedback to authenticated;
grant update (status, github_issue_url) on table public.feedback to authenticated;

create policy "feedback: author or admin reads"
  on public.feedback for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

comment on policy "feedback: author or admin reads" on public.feedback is
  'The author reads their own messages; admins read all of them (feedback inbox).';

-- Signed-out feedback is not supported in wave 1 (R71).
create policy "feedback: author inserts"
  on public.feedback for insert
  to authenticated
  with check (user_id = (select auth.uid()));

comment on policy "feedback: author inserts" on public.feedback is
  'A signed-in user sends feedback as themselves; the screenshot paths are a table check.';

-- The column grant limits admins to status and github_issue_url; feedback_audit logs every such update.
create policy "feedback: admin updates"
  on public.feedback for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

comment on policy "feedback: admin updates" on public.feedback is
  'Admins move a message through its statuses and attach the issue link; each update is audited.';

-- AFTER UPDATE OF the two admin columns, so the FK set-null on user_id (account deletion) never fires it.
-- Server code without a JWT (the automatic GitHub issue, R49) is not an admin action and is not logged.
create function private.feedback_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_admin() then
    insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
    values (
      auth.uid(), 'feedback.update', 'feedback', new.id,
      pg_catalog.jsonb_build_object(
        'from', old.status, 'to', new.status, 'issue', new.github_issue_url is not null)
    );
  end if;
  return null;
end $$;

comment on function private.feedback_audit() is
  'Trigger: writes feedback.update to admin_audit_log when an admin changes a feedback message (R47).';
revoke all on function private.feedback_audit() from public;

create trigger feedback_audit
  after update of status, github_issue_url on public.feedback
  for each row execute function private.feedback_audit();

-- reports -------------------------------------------------------------------------------------------------

-- No write path in wave 1 (R55): create_report and admin_resolve_report are RPCs that come later.
grant select on table public.reports to authenticated;

create policy "reports: reporter or admin reads"
  on public.reports for select
  to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));

comment on policy "reports: reporter or admin reads" on public.reports is
  'The reporter follows their own complaints; admins read all of them. The reported user does not see them.';

-- admin_audit_log -----------------------------------------------------------------------------------------

-- Written only by admin RPCs and the audit triggers (security definer); append-only for every role.
grant select on table public.admin_audit_log to authenticated;

create policy "admin_audit_log: admin reads"
  on public.admin_audit_log for select
  to authenticated
  using ((select private.is_admin()));

comment on policy "admin_audit_log: admin reads" on public.admin_audit_log is
  'Only admins read the audit log; nobody writes it directly.';

-- break_glass_grants --------------------------------------------------------------------------------------

-- Opened only by admin_open_break_glass later. The one direct write is the issuing admin revoking it early.
grant select on table public.break_glass_grants to authenticated;
grant update (revoked_at) on table public.break_glass_grants to authenticated;

-- The issuing admin sees own grants while still an admin; other admins do not. The target user sees the
-- whole row, reason included (R73), so the access is never hidden from them.
create policy "break_glass_grants: issuing admin or target reads"
  on public.break_glass_grants for select
  to authenticated
  using (target_user_id = (select auth.uid()) or (admin_id = (select auth.uid()) and (select private.is_admin())));

comment on policy "break_glass_grants: issuing admin or target reads" on public.break_glass_grants is
  'The admin who opened the grant (while an admin) and the user it covers.';

-- Only a grant that is not revoked yet can be revoked; break_glass_grants_guard_revoke stamps the time.
create policy "break_glass_grants: issuing admin revokes"
  on public.break_glass_grants for update
  to authenticated
  using (admin_id = (select auth.uid()) and (select private.is_admin()) and revoked_at is null)
  with check (admin_id = (select auth.uid()));

comment on policy "break_glass_grants: issuing admin revokes" on public.break_glass_grants is
  'The issuing admin ends the grant early; the guard forces revoked_at to now() and the audit trigger logs it.';

-- Guard: a revocation happens once and always at the current time, whatever the client sends. An explicit
-- NULL is refused rather than turned into a revocation, so un-revoking cannot be mistaken for revoking.
-- Applies only to direct API calls; server code and definer RPCs (current_user postgres) are not bound.
create function private.break_glass_grants_guard_revoke()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if old.revoked_at is not null or new.revoked_at is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'a break-glass grant can only be revoked once';
  end if;
  new.revoked_at := pg_catalog.now();
  return new;
end $$;

comment on function private.break_glass_grants_guard_revoke() is
  'Guard trigger for signed-in users: a break-glass grant is revoked once, and revoked_at is always now().';
revoke all on function private.break_glass_grants_guard_revoke() from public;

create trigger break_glass_grants_guard_revoke
  before update on public.break_glass_grants
  for each row execute function private.break_glass_grants_guard_revoke();

-- Logs the revocation itself (null to a time), whoever does it: the admin directly or a later RPC.
-- metadata holds only the grant id, no personal data.
create function private.break_glass_grants_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'break_glass.revoke', 'user', new.target_user_id, pg_catalog.jsonb_build_object('grant_id', new.id));
  return null;
end $$;

comment on function private.break_glass_grants_audit() is
  'Trigger: writes break_glass.revoke to admin_audit_log when a break-glass grant is revoked (R47).';
revoke all on function private.break_glass_grants_audit() from public;

create trigger break_glass_grants_audit
  after update of revoked_at on public.break_glass_grants
  for each row
  when (old.revoked_at is null and new.revoked_at is not null)
  execute function private.break_glass_grants_audit();
