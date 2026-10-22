-- "Разморозить" (QA U8): a freeze that starts today can be taken back the same day. Only its first day is today,
-- so removing it undoes no frozen day in the past; a freeze that started earlier still only ends early (the
-- pass_freezes_guard_started trigger keeps its past days).
drop policy "pass_freezes: trainer deletes future" on public.pass_freezes;
create policy "pass_freezes: trainer deletes future"
  on public.pass_freezes for delete
  to authenticated
  using (
    exists (
      select 1
      from public.passes p
      join public.profiles pr on pr.id = p.trainer_id
      where p.id = pass_freezes.pass_id and p.status = 'active'
        and private.is_coaching_trainer(p.coaching_id, 'passes')
        and lower(pass_freezes.period) >= (pg_catalog.now() at time zone pr.time_zone)::date)
  );
comment on policy "pass_freezes: trainer deletes future" on public.pass_freezes is
  'The pair''s trainer removes a freeze that starts today or later; an earlier one is only ended early.';
