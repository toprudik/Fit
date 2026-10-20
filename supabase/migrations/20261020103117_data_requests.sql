-- "Запрос о моих данных" in feedback (legal/product-changes.md 16; privacy policy §10): a person asks what data
-- DaFit holds, for a copy of it, to correct or delete it, to withdraw a consent, object, stop the processing or
-- appeal a refusal. 152-FZ gives the operator 10 working days (arts. 20, 21), once extendable by 5 with the reason
-- told in advance; GDPR's month is longer, so the shorter term covers both. Withdrawing the consent to publish
-- (art. 10.1 part 12) takes 3 working days. A request keeps its type and deadline; the admin inbox counts it down.
-- Working days are Monday to Friday: public holidays are not skipped, so the deadline only comes earlier.

alter type public.feedback_kind add value if not exists 'data_request';

alter table public.feedback
  add column request_type     text check (request_type in
    ('access', 'export', 'correction', 'deletion', 'withdraw', 'objection', 'stop', 'appeal', 'other')),
  add column consent_kind     text check (consent_kind in ('processing', 'health', 'marketing', 'publication')),
  add column due_on           date,
  add column extended_at      timestamptz,
  add column extended_reason  text check (char_length(extended_reason) between 1 and 1000),
  -- A data request has a type and a deadline, other feedback has neither (kind compared as text: the new enum
  -- value cannot be used in this transaction).
  add constraint feedback_data_request_check check ((kind::text = 'data_request') = (request_type is not null)),
  add constraint feedback_extension_pair_check check ((extended_at is null) = (extended_reason is null)),
  -- Withdrawing a consent names which one, and only then.
  add constraint feedback_withdraw_consent_check check ((request_type is not distinct from 'withdraw') = (consent_kind is not null));

comment on column public.feedback.request_type is
  'What a data request asks for: access, export (a copy), correction, deletion, withdraw (a consent), objection, '
  'stop (the processing), appeal (a refusal), other.';
comment on column public.feedback.consent_kind is
  'The consent a withdraw request takes back: processing, health, marketing or publication.';
comment on column public.feedback.due_on is
  'The day a data request must be answered by: 10 working days after it came, 15 once extended (152-FZ arts. 20, 21); '
  '3 to stop publishing (art. 10.1 part 12).';
comment on column public.feedback.extended_reason is 'Why the answer takes 5 more working days; the author gets it from the bot.';

grant insert (request_type, consent_kind) on table public.feedback to authenticated;

create index feedback_due_on_idx on public.feedback (due_on) where due_on is not null;

-- The day n working days (Monday to Friday) after p_from.
create function private.add_working_days(p_from date, p_days integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select d::date
  from pg_catalog.generate_series(p_from + 1, p_from + p_days * 2 + 7, interval '1 day') as g(d)
  where extract(isodow from d) < 6
  order by d
  offset p_days - 1
  limit 1
$$;

comment on function private.add_working_days(date, integer) is 'The date p_days working days (Mon–Fri) after p_from.';
revoke all on function private.add_working_days(date, integer) from public;

-- The deadline is the server's: whatever the app sends, a data request gets 10 working days from the day it came,
-- in Moscow time (the operator's), and 3 when it takes back the consent to publish.
create function private.feedback_data_request_due()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind::text = 'data_request' then
    new.due_on := private.add_working_days(
      (new.created_at at time zone 'Europe/Moscow')::date,
      case when new.consent_kind = 'publication' then 3 else 10 end);
  else
    new.due_on := null;
  end if;
  new.extended_at := null;
  new.extended_reason := null;
  return new;
end $$;

comment on function private.feedback_data_request_due() is
  'Sets a data request''s deadline: 10 working days from the day it came, 3 to stop publishing.';
revoke all on function private.feedback_data_request_due() from public;

create trigger feedback_data_request_due
  before insert on public.feedback
  for each row execute function private.feedback_data_request_due();

-- Errors (message): forbidden (42501), invalid_reason (22023), not_found (P0002), already_extended,
-- not_extendable (publishing stops in 3 working days, with no extension in art. 10.1), author_deleted, answered (P0001).
create function public.admin_extend_data_request(p_feedback_id uuid, p_reason text)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_row public.feedback;
  v_due date;
  v_at timestamptz := pg_catalog.now();
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) > 1000 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  select f.* into v_row from public.feedback f where f.id = p_feedback_id and f.due_on is not null for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_row.extended_at is not null then
    raise exception 'already_extended' using errcode = 'P0001';
  end if;
  if v_row.consent_kind = 'publication' then
    raise exception 'not_extendable' using errcode = 'P0001';
  end if;
  if v_row.status = 'closed' then
    raise exception 'answered' using errcode = 'P0001';
  end if;
  if v_row.user_id is null then
    raise exception 'author_deleted' using errcode = 'P0001';
  end if;

  v_due := private.add_working_days(v_row.due_on, 5);
  update public.feedback set
    due_on = v_due, extended_at = v_at, extended_reason = v_reason,
    status = case when status = 'new' then 'in_progress'::public.feedback_status else status end,
    updated_at = v_at
  where id = p_feedback_id;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), 'feedback.extend', 'feedback', p_feedback_id, pg_catalog.jsonb_build_object('due_on', v_due));

  -- The author learns the reason and the new date before the first one passes (152-FZ art. 20 part 3).
  perform private.enqueue_notification(
    'feedback_reply', 'feedback_extend:' || p_feedback_id,
    pg_catalog.jsonb_build_object('feedback_id', p_feedback_id, 'kind', 'data_request', 'event', 'extended',
                                  'reply', v_reason, 'due_on', v_due),
    v_row.user_id);
  return v_due;
end $$;

comment on function public.admin_extend_data_request(uuid, text) is
  'Admin: gives a data request 5 more working days, once, with a reason the author gets from the bot (152-FZ arts. 20, 21).';
revoke all on function public.admin_extend_data_request(uuid, text) from public, anon;
grant execute on function public.admin_extend_data_request(uuid, text) to authenticated;
