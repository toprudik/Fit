-- Reviews (PRD wave-2 §11, Q53; data-model "reviews"): a client of a pair with three or more attended sessions
-- rates the trainer 1–5 with an optional text, edits it (the admin keeps the history) or deletes it. The trainer
-- answers once (editable) and can dispute a review into the admin's complaint queue (public.reports); the admin
-- keeps or hides it. In wave 2 a review is seen by its author, its trainer (unless hidden) and admins only.
-- Every write goes through the definer functions below; the tables have no write grants.

create type public.review_status as enum ('published', 'disputed', 'hidden');

create table public.reviews (
  id                 uuid primary key default gen_random_uuid(),
  coaching_id        uuid not null unique references public.coachings (id) on delete cascade,
  client_id          uuid not null references public.profiles (id) on delete cascade,
  trainer_id         uuid not null references public.trainer_profiles (user_id) on delete cascade,
  rating             smallint not null check (rating between 1 and 5),
  body               text check (char_length(body) between 1 and 2000),
  status             public.review_status not null default 'published',
  publish_consent    boolean,
  publish_asked_at   timestamptz,
  hidden_reason      text check (char_length(hidden_reason) between 1 and 2000),
  trainer_reply      text check (char_length(trainer_reply) between 1 and 2000),
  trainer_replied_at timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint reviews_hidden_check check ((status = 'hidden') = (hidden_reason is not null)),
  constraint reviews_reply_check check ((trainer_reply is null) = (trainer_replied_at is null))
);

comment on table public.reviews is
  'A client''s review of the trainer of a pair (wave-2 §11): one per pair, soft-deleted by the author, gone with '
  'the author''s account. Written only through the review functions.';
comment on column public.reviews.publish_consent is
  'Wave 4: the author''s consent to show the review publicly; null = not asked yet (every wave-2 review, Q53).';
comment on column public.reviews.hidden_reason is 'Why an admin hid the review; shown to its author.';

create index reviews_trainer_id_idx on public.reviews (trainer_id);
create index reviews_client_id_idx on public.reviews (client_id);

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

create table public.review_revisions (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.reviews (id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  body       text,
  created_at timestamptz not null default now()
);

comment on table public.review_revisions is 'Earlier versions of a review, for the admin who handles a dispute (§11 rule 2).';
create index review_revisions_review_id_idx on public.review_revisions (review_id);

alter table public.reviews enable row level security;
alter table public.review_revisions enable row level security;
revoke all on table public.reviews, public.review_revisions from anon, authenticated;
grant select on table public.reviews, public.review_revisions to authenticated;

create policy "reviews: author, trainer or admin reads"
  on public.reviews for select
  to authenticated
  using (
    (client_id = (select auth.uid()) and deleted_at is null)
    or (trainer_id = (select auth.uid()) and deleted_at is null and status <> 'hidden')
    or (select private.is_admin())
  );
comment on policy "reviews: author, trainer or admin reads" on public.reviews is
  'Wave 2: the author and the trainer (not a hidden review) see it, admins see every version (§11 rule 6).';

create policy "review_revisions: admin reads"
  on public.review_revisions for select
  to authenticated
  using ((select private.is_admin()));

-- =========================================================================================================
-- Who may review

-- Attended sessions of a pair: the session took place and the client came (§11 rule 1, acceptance 11.2).
create function private.review_sessions(p_coaching uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.bookings b where b.coaching_id = p_coaching and b.status = 'attended'
$$;
comment on function private.review_sessions(uuid) is 'Attended sessions of a pair, the count the review rule needs.';
revoke all on function private.review_sessions(uuid) from public;

-- For the client of a pair: attended sessions and whether a review may be left (three or more).
create function public.review_eligibility(p_coaching_id uuid)
returns table (attended integer, eligible boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.coachings c where c.id = p_coaching_id and c.client_id = auth.uid()) then
    return;
  end if;
  attended := private.review_sessions(p_coaching_id);
  eligible := attended >= 3;
  return next;
end $$;
comment on function public.review_eligibility(uuid) is
  'The caller''s attended sessions in their pair and whether a review may be left (§11 rule 1); empty otherwise.';
revoke all on function public.review_eligibility(uuid) from public, anon;
grant execute on function public.review_eligibility(uuid) to authenticated;

-- =========================================================================================================
-- The author

-- save_review: creates the pair's review or replaces it, keeping the previous version for the admin. A deleted
-- review comes back as a new version. Only the client of the pair, with three or more attended sessions.
create function public.save_review(p_coaching_id uuid, p_rating integer, p_body text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair public.coachings;
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_old public.reviews;
  v_id uuid;
begin
  select * into v_pair from public.coachings c where c.id = p_coaching_id;
  if v_user is null or v_pair.id is null or v_pair.client_id <> v_user then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 or char_length(v_body) > 2000 then
    raise exception 'invalid_review' using errcode = '22023';
  end if;
  if private.review_sessions(v_pair.id) < 3 then
    raise exception 'too_few_sessions' using errcode = 'P0001';
  end if;

  select * into v_old from public.reviews r where r.coaching_id = v_pair.id for update;
  if v_old.id is null then
    insert into public.reviews (coaching_id, client_id, trainer_id, rating, body)
    values (v_pair.id, v_user, v_pair.trainer_id, p_rating, v_body)
    returning id into v_id;
    return v_id;
  end if;
  insert into public.review_revisions (review_id, rating, body, created_at)
  values (v_old.id, v_old.rating, v_old.body, v_old.updated_at);
  update public.reviews r set rating = p_rating, body = v_body, deleted_at = null where r.id = v_old.id;
  return v_old.id;
end $$;
comment on function public.save_review(uuid, integer, text) is
  'The client of a pair with 3+ attended sessions leaves or edits the pair''s one review (wave-2 §11 rules 1–3).';
revoke all on function public.save_review(uuid, integer, text) from public, anon;
grant execute on function public.save_review(uuid, integer, text) to authenticated;

-- delete_review: the author removes their review; the admin keeps it for a dispute until the account goes.
create function public.delete_review(p_coaching_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.reviews r set deleted_at = pg_catalog.now()
  where r.coaching_id = p_coaching_id and r.client_id = auth.uid() and r.deleted_at is null;
  return found;
end $$;
comment on function public.delete_review(uuid) is 'The author deletes their review of the pair (soft delete, §11 rule 2).';
revoke all on function public.delete_review(uuid) from public, anon;
grant execute on function public.delete_review(uuid) to authenticated;

-- =========================================================================================================
-- The trainer

-- reply_to_review: the trainer's one public answer, editable; an empty text removes it (§11 rule 5).
create function public.reply_to_review(p_review_id uuid, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_body text := nullif(pg_catalog.btrim(p_body), '');
begin
  if char_length(v_body) > 2000 then
    raise exception 'invalid_reply' using errcode = '22023';
  end if;
  update public.reviews r
  set trainer_reply = v_body, trainer_replied_at = case when v_body is null then null else pg_catalog.now() end
  where r.id = p_review_id and r.trainer_id = auth.uid() and r.deleted_at is null and r.status <> 'hidden';
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;
comment on function public.reply_to_review(uuid, text) is 'The trainer answers a review of theirs once; editable, empty removes it.';
revoke all on function public.reply_to_review(uuid, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;

-- dispute_review: "Оспорить" with a reason, into the admin's queue (§11 rule 7). One open dispute per review.
create function public.dispute_review(p_review_id uuid, p_reason text, p_body text default null)
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
  if p_reason is null or p_reason not in ('insult', 'false_facts', 'not_my_client', 'other') or char_length(v_body) > 2000 then
    raise exception 'invalid_dispute' using errcode = '22023';
  end if;
  update public.reviews r set status = 'disputed'
  where r.id = p_review_id and r.trainer_id = v_user and r.deleted_at is null and r.status = 'published';
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, body)
  values (v_user, 'review', p_review_id, p_reason, v_body)
  returning id into v_id;
  return v_id;
end $$;
comment on function public.dispute_review(uuid, text, text) is
  'The trainer disputes a published review of theirs with a reason; it goes to the admin queue (wave-2 §11 rule 7).';
revoke all on function public.dispute_review(uuid, text, text) from public, anon;
grant execute on function public.dispute_review(uuid, text, text) to authenticated;

-- =========================================================================================================
-- The admin

-- admin_decide_review_dispute: keep (the review is published again) or hide with a reason the author sees.
-- Every open dispute of the review closes with the decision; the decision goes to the audit log.
create function public.admin_decide_review_dispute(p_report_id uuid, p_hide boolean, p_reason text default null)
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
  select * into v_report from public.reports r where r.id = p_report_id and r.target_type = 'review' for update;
  if v_report.id is null or v_report.status <> 'open' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_hide is null or (p_hide and v_reason is null) or char_length(v_reason) > 2000 then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  update public.reviews r
  set status = case when p_hide then 'hidden'::public.review_status else 'published'::public.review_status end,
      hidden_reason = case when p_hide then v_reason end
  where r.id = v_report.target_id;
  update public.reports r
  set status = case when p_hide then 'hidden'::public.report_status else 'kept'::public.report_status end,
      resolved_by = auth.uid(), resolved_at = pg_catalog.now(), resolution_note = v_reason
  where r.target_type = 'review' and r.target_id = v_report.target_id and r.status = 'open';
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'review.decide', 'review', v_report.target_id,
          pg_catalog.jsonb_build_object('report_id', v_report.id, 'hidden', p_hide));
end $$;
comment on function public.admin_decide_review_dispute(uuid, boolean, text) is
  'An admin keeps or hides (with a reason) a disputed review and closes its disputes (wave-2 §11 rule 7).';
revoke all on function public.admin_decide_review_dispute(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_review_dispute(uuid, boolean, text) to authenticated;
