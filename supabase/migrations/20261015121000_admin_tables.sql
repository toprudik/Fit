-- Admin (data-model §2.1 "Обратная связь, жалобы, аудит, аварийный доступ"): feedback, reports, admin_audit_log,
-- break_glass_grants. Policies and the audit triggers on admin updates: 20261015123900_admin_policies.sql.

-- feedback: one message from the feedback button (PRD 2.13); the server also files a GitHub issue.
create table public.feedback (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid default auth.uid() references public.profiles (id) on delete set null,
  zone             public.app_zone,
  kind             public.feedback_kind not null,
  body             text not null check (char_length(body) between 1 and 5000),
  route            text check (char_length(route) <= 200),
  platform         text check (char_length(platform) <= 32),     -- 'tma-android', 'web-desktop' ...
  app_version      text check (char_length(app_version) <= 32),
  locale           public.app_locale,
  theme            public.app_theme,
  attachment_paths text[] not null default '{}' check (cardinality(attachment_paths) <= 3),
  status           public.feedback_status not null default 'new',
  github_issue_url text check (github_issue_url is null or github_issue_url like 'https://github.com/%'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- user_id goes null when the author deletes the account, so the check lets that row keep its paths.
  constraint feedback_attachment_paths_owner_check
    check (user_id is null or private.all_paths_under(attachment_paths, user_id::text || '/' || id::text || '/'))
);

comment on table public.feedback is
  'A message sent with the feedback button. The author inserts it; admins change status and the issue link.';
comment on column public.feedback.user_id is 'Author; defaults to the caller. Null after the author deleted the account.';
comment on column public.feedback.zone is 'Zone the user was in when sending (trainer or client).';
comment on column public.feedback.route is 'App route the button was pressed on.';
comment on column public.feedback.locale is 'Interface language at the time of sending.';
comment on column public.feedback.theme is 'Interface theme at the time of sending.';
comment on column public.feedback.attachment_paths is
  'At most 3 screenshots: object names in bucket feedback under <user_id>/<feedback id>/ (no bucket prefix).';
comment on column public.feedback.github_issue_url is 'Issue the server filed for this message; holds no personal data (FDBK-2).';

create index feedback_user_id_idx on public.feedback (user_id);
create index feedback_status_created_at_idx on public.feedback (status, created_at desc);

create trigger feedback_set_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

alter table public.feedback enable row level security;
revoke all on table public.feedback from anon, authenticated;

-- reports: complaints and disputes (W2 adds the review "Dispute" flow). No write path in wave 1 (R55).
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.profiles (id) on delete set null,
  target_type     public.report_target not null,
  target_id       uuid not null,                                          -- no FK: polymorphic reference
  reason          text not null check (char_length(reason) between 1 and 64),  -- 'insult', 'false_facts', 'not_my_client', 'spam', 'other' ...
  body            text check (char_length(body) <= 2000),
  status          public.report_status not null default 'open',
  resolved_by     uuid references public.profiles (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text check (char_length(resolution_note) <= 2000),
  created_at      timestamptz not null default now(),
  constraint reports_resolved_check check ((status = 'open') = (resolved_at is null))
);

comment on table public.reports is
  'A complaint about a review, user, profile or other object. Written only by RPCs; admins resolve it.';
comment on column public.reports.target_id is 'Id of the reported object in the table named by target_type; no FK.';
comment on column public.reports.reason is 'Reason code chosen by the reporter.';

create index reports_status_created_at_idx on public.reports (status, created_at);
create index reports_target_type_target_id_idx on public.reports (target_type, target_id);
create index reports_reporter_id_idx on public.reports (reporter_id);

alter table public.reports enable row level security;
revoke all on table public.reports from anon, authenticated;

-- admin_audit_log: every admin action, written in the same transaction as the action (data-model §1.7).
create table public.admin_audit_log (
  id          bigint generated always as identity primary key,
  -- No FK (R45): an FK set-null on account deletion would be an UPDATE, which the append-only trigger forbids.
  actor_id    uuid,
  action      text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),  -- 'trainer_invite.create', 'verification.decide', 'break_glass.open' ...
  target_type text,
  target_id   uuid,
  reason      text,
  metadata    jsonb not null default '{}',                           -- no personal data of clients
  created_at  timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'One admin action. Written only by admin RPCs and audit triggers; append-only for every role, including service_role.';
comment on column public.admin_audit_log.actor_id is
  'Admin who acted (auth.uid() at the time). Plain uuid without FK, so it survives deletion of the account.';
comment on column public.admin_audit_log.action is 'Object and verb as <object>.<verb>, for example feedback.update.';
comment on column public.admin_audit_log.metadata is 'Action details without personal data of clients.';

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_type_target_id_idx on public.admin_audit_log (target_type, target_id);

-- No arguments: no column may change and no row may be deleted. Clearing the log needs a migration.
create trigger admin_audit_log_append_only
  before update or delete on public.admin_audit_log
  for each row execute function private.enforce_append_only();

create trigger admin_audit_log_no_truncate
  before truncate on public.admin_audit_log
  for each statement execute function private.forbid_truncate();

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from anon, authenticated;
revoke all on sequence public.admin_audit_log_id_seq from anon, authenticated;

-- break_glass_grants: logged, time-limited admin access to chosen data of one user (decisions Q41, ADM-13..15).
create table public.break_glass_grants (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  categories     public.share_category[] not null check (cardinality(categories) > 0),
  reason         text not null check (char_length(reason) >= 20),
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  constraint break_glass_grants_expires_check
    check (expires_at > created_at and expires_at <= created_at + interval '1 hour'),
  constraint break_glass_grants_revoked_check check (revoked_at is null or revoked_at >= created_at)
);

comment on table public.break_glass_grants is
  'Time-limited admin access to some data categories of one user. Created only by admin_open_break_glass; the target user reads the whole row.';
comment on column public.break_glass_grants.categories is 'Data categories private.can_view opens to this admin while the grant is live.';
comment on column public.break_glass_grants.reason is 'Why access was needed; at least 20 characters. The target user sees it.';
comment on column public.break_glass_grants.expires_at is 'End of access, at most one hour after created_at.';

create index break_glass_grants_admin_id_target_user_id_idx on public.break_glass_grants (admin_id, target_user_id)
  where revoked_at is null;
create index break_glass_grants_target_user_id_idx on public.break_glass_grants (target_user_id);

-- A revoked grant stays revoked, for every role: revoked_at is written once and never cleared or moved, so
-- access that was ended cannot be reopened or its end rewritten. Access is opened again only with a new grant.
create function private.break_glass_grants_keep_revoked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'append_only' using errcode = 'P0001',
      detail = 'a revoked break-glass grant stays revoked';
  end if;
  return new;
end $$;

comment on function private.break_glass_grants_keep_revoked() is
  'Trigger: once revoked_at is set it cannot be cleared or changed, by any role.';
revoke all on function private.break_glass_grants_keep_revoked() from public;

create trigger break_glass_grants_keep_revoked
  before update of revoked_at on public.break_glass_grants
  for each row execute function private.break_glass_grants_keep_revoked();

alter table public.break_glass_grants enable row level security;
revoke all on table public.break_glass_grants from anon, authenticated;
