-- «Пожаловаться» on content other people see (legal/product-changes.md Б13; DSA arts. 16, 17, 20): a review reply,
-- a trainer's showcase, a challenge alias and a trainer's comment in the food diary. Anyone can report a showcase,
-- signed in or not; the rest is reported by the person it was shown to. The reporter gets a receipt in the bot;
-- an admin keeps or hides the content with a reason that goes to the reporter and to the author; either of them can
-- appeal once, and another admin decides the appeal. Reviews keep their own dispute (dispute_review and
-- admin_decide_review_dispute) but can be appealed the same way.
--
-- Hiding is reversible, so an appeal can undo it, and it works in the database, so no screen can show hidden
-- content: a reply moves to private.hidden_review_replies, an alias leaves the leaderboard (show_on_leaderboard), a
-- comment gets food_day_comments.hidden_by_admin_at and drops out of its select policy, a showcase goes private.

alter type public.report_target add value if not exists 'review_reply';
alter type public.report_target add value if not exists 'challenge_alias';
alter type public.report_target add value if not exists 'food_comment';

alter table public.reports
  add column target_owner_id  uuid references public.profiles (id) on delete set null,
  add column reporter_contact text check (char_length(reporter_contact) between 1 and 200),
  add column appeal_of        uuid references public.reports (id) on delete cascade,
  add column appealed_by      uuid references public.profiles (id) on delete set null,
  add column target_snapshot  text check (char_length(target_snapshot) <= 2000);

comment on column public.reports.target_owner_id is
  'Who wrote the reported content, when the report was filed: they get the decision and may appeal it.';
comment on column public.reports.reporter_contact is
  'How to answer someone who reported without signing in (an e-mail or a Telegram username they typed).';
comment on column public.reports.appeal_of is 'The decided report this one appeals; another admin decides it (DSA art. 20).';
comment on column public.reports.appealed_by is 'Who appealed: the reporter or the author of the content.';
comment on column public.reports.target_snapshot is
  'The reported text as the reporter saw it (a reply, an alias, a diary comment), so the admin decides without '
  'reading the diary or the pair; a showcase is public, so it has none.';

create unique index reports_appeal_of_key on public.reports (appeal_of) where appeal_of is not null;
create index reports_target_owner_id_idx on public.reports (target_owner_id);
create index reports_appealed_by_idx on public.reports (appealed_by);

-- A reply an admin hid, kept until an appeal brings it back or the review goes.
create table private.hidden_review_replies (
  review_id  uuid primary key references public.reviews (id) on delete cascade,
  body       text not null,
  replied_at timestamptz not null,
  hidden_at  timestamptz not null default now()
);
comment on table private.hidden_review_replies is 'A trainer''s review reply hidden after a report (DSA art. 17), for an appeal.';
revoke all on table private.hidden_review_replies from public, anon, authenticated;

alter table public.food_day_comments add column hidden_by_admin_at timestamptz;

-- As in 20261017081733_food_diary.sql, without comments an admin hid. Admins still don't read diaries: a report
-- carries a copy of the reported text (reports.target_snapshot).
drop policy "food_day_comments: the client and the pair's trainer while nutrition is shared" on public.food_day_comments;
create policy "food_day_comments: the client and the pair's trainer while nutrition is shared"
  on public.food_day_comments for select
  to authenticated
  using (
    (hidden_by_admin_at is null
     and (client_id = (select auth.uid())
          or (exists (select 1 from public.coachings c where c.id = coaching_id and c.trainer_id = (select auth.uid()))
              and private.can_view(client_id, 'nutrition')))));

-- A participant row had no id of its own (the key is challenge + pair); a report needs one.
alter table public.challenge_participants add column id uuid not null default gen_random_uuid();
alter table public.challenge_participants add constraint challenge_participants_id_key unique (id);
comment on column public.food_day_comments.hidden_by_admin_at is 'An admin hid the comment after a report.';

-- =========================================================================================================
-- Targets

-- The author of a reported object, or null when there is no such object. target_id is reviews.id for a review and
-- its reply, trainer_profiles.user_id for a showcase, challenge_participants.id for an alias, food_day_comments.id.
create function private.report_target_owner(p_type public.report_target, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type::text
    when 'review' then (select r.client_id from public.reviews r where r.id = p_id and r.deleted_at is null)
    when 'review_reply' then (select r.trainer_id from public.reviews r where r.id = p_id and r.deleted_at is null and r.trainer_reply is not null)
    when 'trainer_profile' then (select t.user_id from public.trainer_profiles t where t.user_id = p_id)
    when 'challenge_alias' then (select p.user_id from public.challenge_participants p where p.id = p_id and p.alias is not null)
    when 'food_comment' then (select c.author_id from public.food_day_comments c where c.id = p_id)
  end
$$;
revoke all on function private.report_target_owner(public.report_target, uuid) from public;

-- Whether the caller is shown the object, so a report can't be used to probe ids. A showcase counts while it is
-- open; the caller's own content can't be reported.
create function private.report_target_visible(p_type public.report_target, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type::text
    when 'review_reply' then exists (
      select 1 from public.reviews r
      where r.id = p_id and r.client_id = auth.uid() and r.deleted_at is null and r.trainer_reply is not null
        and r.status <> 'hidden')
    when 'trainer_profile' then exists (
      select 1 from public.trainer_profiles t
      where t.user_id = p_id and t.user_id is distinct from auth.uid() and private.showcase_is_open(t))
    when 'challenge_alias' then exists (
      select 1 from public.challenge_participants p
      join public.challenge_participants me on me.challenge_id = p.challenge_id and me.user_id = auth.uid()
      where p.id = p_id and p.user_id <> auth.uid() and p.alias is not null and p.show_on_leaderboard)
    when 'food_comment' then exists (
      select 1 from public.food_day_comments c
      where c.id = p_id and c.client_id = auth.uid() and c.author_id is distinct from auth.uid()
        and c.hidden_by_admin_at is null)
    else false
  end
$$;
revoke all on function private.report_target_visible(public.report_target, uuid) from public;

-- The reported text, for the admin (see reports.target_snapshot).
create function private.report_target_snapshot(p_type public.report_target, p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type::text
    when 'review_reply' then (select r.trainer_reply from public.reviews r where r.id = p_id)
    when 'challenge_alias' then (select p.alias from public.challenge_participants p where p.id = p_id)
    when 'food_comment' then (select c.body from public.food_day_comments c where c.id = p_id)
  end
$$;
revoke all on function private.report_target_snapshot(public.report_target, uuid) from public;

-- Hides (p_hide) or shows again what a decision is about. A review goes through its own status.
create function private.apply_report_decision(p_type public.report_target, p_id uuid, p_hide boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  case p_type::text
    when 'review' then
      update public.reviews r
      set status = case when p_hide then 'hidden'::public.review_status else 'published'::public.review_status end,
          hidden_reason = case when p_hide then p_reason end
      where r.id = p_id;
    when 'review_reply' then
      if p_hide then
        insert into private.hidden_review_replies (review_id, body, replied_at)
        select r.id, r.trainer_reply, r.trainer_replied_at from public.reviews r where r.id = p_id and r.trainer_reply is not null
        on conflict (review_id) do nothing;
        update public.reviews r set trainer_reply = null, trainer_replied_at = null where r.id = p_id;
      else
        -- Back, unless the trainer has written a new reply since.
        update public.reviews r set trainer_reply = h.body, trainer_replied_at = h.replied_at
        from private.hidden_review_replies h
        where h.review_id = p_id and r.id = p_id and r.trainer_reply is null;
        delete from private.hidden_review_replies h where h.review_id = p_id;
      end if;
    when 'trainer_profile' then
      -- Hiding closes the showcase; keeping it after an appeal opens it again only if the trainer had it open.
      if p_hide then
        update public.trainer_profiles t set is_public = false where t.user_id = p_id;
      end if;
    when 'challenge_alias' then
      if p_hide then
        update public.challenge_participants p set show_on_leaderboard = false where p.id = p_id;
      end if;
    when 'food_comment' then
      update public.food_day_comments c set hidden_by_admin_at = case when p_hide then pg_catalog.now() end where c.id = p_id;
    else
      raise exception 'invalid_target' using errcode = '22023';
  end case;
end $$;
revoke all on function private.apply_report_decision(public.report_target, uuid, boolean, text) from public;

-- =========================================================================================================
-- Reporting

-- Reason codes the report form offers (legal/product-changes.md Б13).
create function private.report_reason_ok(p_reason text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_reason in ('insult', 'spam', 'false_facts', 'personal_data', 'illegal', 'other')
$$;
revoke all on function private.report_reason_ok(text) from public;

-- report_content: a signed-in person reports something they were shown. One open report per person and object (a
-- second tap returns the first), at most 20 a day per person. The receipt goes to the reporter's bot chat.
create function public.report_content(p_target_type public.report_target, p_target_id uuid, p_reason text, p_body text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_id uuid;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.report_reason_ok(p_reason) or char_length(v_body) > 2000 then
    raise exception 'invalid_report' using errcode = '22023';
  end if;
  if not private.report_target_visible(p_target_type, p_target_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select r.id into v_id from public.reports r
  where r.reporter_id = v_user and r.target_type = p_target_type and r.target_id = p_target_id
    and r.status = 'open' and r.appeal_of is null;
  if v_id is not null then
    return v_id;
  end if;
  if (select count(*) from public.reports r
      where r.reporter_id = v_user and r.created_at > pg_catalog.now() - interval '1 day') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_owner_id, reason, body, target_snapshot)
  values (v_user, p_target_type, p_target_id, private.report_target_owner(p_target_type, p_target_id), p_reason, v_body,
          private.report_target_snapshot(p_target_type, p_target_id))
  returning id into v_id;
  perform private.enqueue_notification(
    'report_resolution', pg_catalog.format('report_received:%s', v_id),
    pg_catalog.jsonb_build_object('event', 'received', 'target_type', p_target_type, 'report_id', v_id), v_user);
  return v_id;
end $$;
comment on function public.report_content(public.report_target, uuid, text, text) is
  'A signed-in person reports a review reply, a showcase, a challenge alias or a diary comment they were shown (DSA art. 16).';
revoke all on function public.report_content(public.report_target, uuid, text, text) from public, anon;
grant execute on function public.report_content(public.report_target, uuid, text, text) to authenticated;

-- report_showcase_public: the form on a public trainer page, without signing in. Only an open showcase can be
-- reported; a contact is optional. Limits: 5 open anonymous reports per showcase, 200 anonymous reports an hour.
create function public.report_showcase_public(p_slug text, p_reason text, p_body text default null, p_contact text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_contact text := nullif(pg_catalog.btrim(p_contact), '');
  v_trainer uuid;
  v_id uuid;
begin
  if not private.report_reason_ok(p_reason) or char_length(v_body) > 2000 or char_length(v_contact) > 200 then
    raise exception 'invalid_report' using errcode = '22023';
  end if;
  select t.user_id into v_trainer from public.trainer_profiles t
  where t.slug = p_slug and private.showcase_is_open(t);
  if v_trainer is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.reports r
      where r.reporter_id is null and r.target_type = 'trainer_profile' and r.target_id = v_trainer and r.status = 'open') >= 5
     or (select count(*) from public.reports r
         where r.reporter_id is null and r.created_at > pg_catalog.now() - interval '1 hour') >= 200 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_owner_id, reason, body, reporter_contact)
  values (auth.uid(), 'trainer_profile', v_trainer, v_trainer, p_reason, v_body, v_contact)
  returning id into v_id;
  return v_id;
end $$;
comment on function public.report_showcase_public(text, text, text, text) is
  'Anyone, signed in or not, reports an open trainer showcase by its slug (DSA art. 16); the page shows the receipt.';
revoke all on function public.report_showcase_public(text, text, text, text) from public;
grant execute on function public.report_showcase_public(text, text, text, text) to anon, authenticated;

-- =========================================================================================================
-- Deciding

-- Tells the reporter (if signed in) and the author what was decided and why (DSA art. 17).
create function private.notify_report_decision(p_report public.reports, p_hidden boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := pg_catalog.jsonb_build_object(
    'event', 'decided', 'target_type', p_report.target_type, 'report_id', p_report.id,
    'hidden', p_hidden, 'reason', p_reason, 'appeal', p_report.appeal_of is not null);
begin
  if p_report.target_type = 'review' and p_report.appeal_of is null then
    return; -- admin_decide_review_dispute tells both sides itself
  end if;
  if p_report.reporter_id is not null and p_report.reporter_id is distinct from p_report.target_owner_id then
    perform private.enqueue_notification(
      'report_resolution', pg_catalog.format('report_resolution:%s:reporter', p_report.id),
      v_payload || pg_catalog.jsonb_build_object('role', 'reporter'), p_report.reporter_id);
  end if;
  if p_report.target_owner_id is not null and (p_hidden or p_report.appeal_of is not null) then
    perform private.enqueue_notification(
      'report_resolution', pg_catalog.format('report_resolution:%s:owner', p_report.id),
      v_payload || pg_catalog.jsonb_build_object('role', 'owner'), p_report.target_owner_id);
  end if;
end $$;
revoke all on function private.notify_report_decision(public.reports, boolean, text) from public;

-- admin_decide_report: keep or hide with a reason (required either way: it goes to both sides), or dismiss as
-- unfounded. Closes every open first report of the same object. An appeal is decided by an admin other than the one
-- who made the decision under appeal, and its outcome is applied: hiding again, or showing again.
create function public.admin_decide_report(p_report_id uuid, p_hide boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_original public.reports;
  v_ids uuid[];
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_status public.report_status := case when p_hide then 'hidden'::public.report_status else 'kept'::public.report_status end;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_report from public.reports r where r.id = p_report_id for update;
  if v_report.id is null or v_report.status <> 'open' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_report.target_type = 'review' and v_report.appeal_of is null then
    raise exception 'use_review_dispute' using errcode = '22023';
  end if;
  if p_hide is null or v_reason is null or char_length(v_reason) > 2000 then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if v_report.appeal_of is not null then
    select * into v_original from public.reports r where r.id = v_report.appeal_of;
    if v_original.resolved_by = auth.uid() then
      raise exception 'another_admin' using errcode = '42501';
    end if;
  end if;

  perform private.apply_report_decision(v_report.target_type, v_report.target_id, p_hide, v_reason);
  with decided as (
    update public.reports r
    set status = v_status, resolved_by = auth.uid(), resolved_at = pg_catalog.now(), resolution_note = v_reason
    where r.id = v_report.id
       or (v_report.appeal_of is null and r.appeal_of is null and r.status = 'open'
           and r.target_type = v_report.target_type and r.target_id = v_report.target_id)
    returning r.id
  )
  select pg_catalog.array_agg(d.id) into v_ids from decided d;
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'report.decide', v_report.target_type::text, v_report.target_id,
          pg_catalog.jsonb_build_object('report_id', v_report.id, 'hidden', p_hide, 'appeal', v_report.appeal_of is not null));

  for v_original in select * from public.reports r where r.id = any (v_ids) loop
    perform private.notify_report_decision(v_original, p_hide, v_reason);
  end loop;
end $$;
comment on function public.admin_decide_report(uuid, boolean, text) is
  'An admin keeps or hides reported content with a reason both sides get (DSA art. 17); appeals need another admin (art. 20).';
revoke all on function public.admin_decide_report(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_report(uuid, boolean, text) to authenticated;

-- admin_dismiss_report: an empty or abusive report closes without touching the content; the reporter is told why.
create function public.admin_dismiss_report(p_report_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  update public.reports r
  set status = 'dismissed', resolved_by = auth.uid(), resolved_at = pg_catalog.now(), resolution_note = v_reason
  where r.id = p_report_id and r.status = 'open' and r.appeal_of is null and r.target_type <> 'review'
  returning * into v_report;
  if v_report.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'report.dismiss', v_report.target_type::text, v_report.target_id,
          pg_catalog.jsonb_build_object('report_id', v_report.id));
  if v_report.reporter_id is not null then
    perform private.enqueue_notification(
      'report_resolution', pg_catalog.format('report_resolution:%s:reporter', v_report.id),
      pg_catalog.jsonb_build_object('event', 'dismissed', 'target_type', v_report.target_type, 'report_id', v_report.id,
                                    'reason', v_reason, 'role', 'reporter'),
      v_report.reporter_id);
  end if;
end $$;
comment on function public.admin_dismiss_report(uuid, text) is
  'An admin closes an unfounded report with a reason the reporter gets; the content stays as it is.';
revoke all on function public.admin_dismiss_report(uuid, text) from public, anon;
grant execute on function public.admin_dismiss_report(uuid, text) to authenticated;

-- The reporter follows their own reports, but not an appeal the author filed against the decision: its text is
-- the author's and goes to admins only.
drop policy "reports: reporter or admin reads" on public.reports;
create policy "reports: reporter or admin reads"
  on public.reports for select
  to authenticated
  using ((reporter_id = (select auth.uid()) and (appealed_by is null or appealed_by = (select auth.uid())))
         or (select private.is_admin()));
comment on policy "reports: reporter or admin reads" on public.reports is
  'The reporter follows their own complaints and appeals; admins read all of them. The reported user does not see them.';

-- =========================================================================================================
-- Appeals

-- appeal_report: the reporter or the author contests a decision once, within six months (DSA art. 20). The appeal
-- is a new open report on the same object, linked by appeal_of, for another admin.
create function public.appeal_report(p_report_id uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_report public.reports;
  v_id uuid;
begin
  if v_body is null or char_length(v_body) > 2000 then
    raise exception 'invalid_appeal' using errcode = '22023';
  end if;
  select * into v_report from public.reports r
  where r.id = p_report_id and r.appeal_of is null and r.status <> 'open'
    and r.resolved_at > pg_catalog.now() - interval '6 months'
    and v_user is not null
    and v_user in (r.reporter_id, coalesce(r.target_owner_id, private.report_target_owner(r.target_type, r.target_id)))
    and not (r.target_type = 'review' and r.status = 'dismissed');
  if v_report.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.reports r where r.appeal_of = v_report.id) then
    raise exception 'already_appealed' using errcode = '23505';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_owner_id, reason, body, appeal_of, appealed_by,
                              target_snapshot)
  values (v_report.reporter_id, v_report.target_type, v_report.target_id,
          coalesce(v_report.target_owner_id, private.report_target_owner(v_report.target_type, v_report.target_id)), 'appeal', v_body,
          v_report.id, v_user, v_report.target_snapshot)
  returning id into v_id;
  perform private.enqueue_notification(
    'report_resolution', pg_catalog.format('report_received:%s', v_id),
    pg_catalog.jsonb_build_object('event', 'appeal_received', 'target_type', v_report.target_type, 'report_id', v_id), v_user);
  return v_id;
end $$;
comment on function public.appeal_report(uuid, text) is
  'The reporter or the author appeals a decided report once within six months; another admin decides (DSA art. 20).';
revoke all on function public.appeal_report(uuid, text) from public, anon;
grant execute on function public.appeal_report(uuid, text) to authenticated;

-- my_report_decisions: decisions about the caller's content, so the author can appeal them. Who reported and what
-- they wrote stays with the admins (DSA art. 16(5) asks for the notifier's details only where needed).
create function public.my_report_decisions()
returns table (report_id uuid, target_type public.report_target, target_id uuid, status public.report_status,
               resolution_note text, resolved_at timestamptz, appealed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.target_type, r.target_id, r.status, r.resolution_note, r.resolved_at,
         exists (select 1 from public.reports a where a.appeal_of = r.id)
  from public.reports r
  where (r.target_owner_id = auth.uid()
         or (r.target_type = 'review'
             and exists (select 1 from public.reviews v where v.id = r.target_id and v.client_id = auth.uid())))
    and r.appeal_of is null and r.status in ('hidden', 'kept')
    and r.resolved_at > pg_catalog.now() - interval '6 months'
  order by r.resolved_at desc
$$;
comment on function public.my_report_decisions() is
  'Decided reports about the caller''s content from the last six months, without the reporter, for an appeal.';
revoke all on function public.my_report_decisions() from public, anon;
grant execute on function public.my_report_decisions() to authenticated;

-- admin_decide_review_dispute (body from 20261018012237_review_prompt.sql) decides first disputes only: an appeal
-- about a review goes through admin_decide_report, which keeps the admin who decided away from it, and a new
-- dispute decision does not close an appeal still waiting for another admin.
create or replace function public.admin_decide_review_dispute(p_report_id uuid, p_hide boolean, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_review public.reviews;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_payload jsonb;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_report from public.reports r
  where r.id = p_report_id and r.target_type = 'review' and r.appeal_of is null for update;
  if v_report.id is null or v_report.status <> 'open' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_hide is null or (p_hide and v_reason is null) or char_length(v_reason) > 2000 then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  update public.reviews r
  set status = case when p_hide then 'hidden'::public.review_status else 'published'::public.review_status end,
      hidden_reason = case when p_hide then v_reason end
  where r.id = v_report.target_id
  returning * into v_review;
  update public.reports r
  set status = case when p_hide then 'hidden'::public.report_status else 'kept'::public.report_status end,
      resolved_by = auth.uid(), resolved_at = pg_catalog.now(), resolution_note = v_reason
  where r.target_type = 'review' and r.target_id = v_report.target_id and r.status = 'open' and r.appeal_of is null;
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'review.decide', 'review', v_report.target_id,
          pg_catalog.jsonb_build_object('report_id', v_report.id, 'hidden', p_hide));

  if v_review.id is not null then
    v_payload := pg_catalog.jsonb_build_object('target_type', 'review', 'review_id', v_review.id,
                                               'coaching_id', v_review.coaching_id, 'hidden', p_hide);
    perform private.enqueue_notification(
      'report_resolution', pg_catalog.format('report_resolution:%s:trainer', v_report.id),
      v_payload || pg_catalog.jsonb_build_object('role', 'trainer'), v_review.trainer_id);
    perform private.enqueue_notification(
      'report_resolution', pg_catalog.format('report_resolution:%s:author', v_report.id),
      v_payload || pg_catalog.jsonb_build_object('role', 'author', 'reason', v_reason), v_review.client_id);
  end if;
end $$;
