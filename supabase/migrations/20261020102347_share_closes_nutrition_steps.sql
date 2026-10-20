-- Closing nutrition or steps for a trainer closes everything derived from them (beta terms: the client hides
-- nutrition and steps on «Что видит тренер»). The raw rows were already behind private.can_view; two derived paths
-- still showed them:
--   * user_badges: a trainer saw the food-diary badges (family 'diary') whatever the nutrition share.
--   * shared_monthly_report: the copy the client sent keeps nutrition, steps, sleep and their streaks; the trainer
--     now reads it without what the pair's shares close at reading time (measurements too, for the same reason).
-- The rest of shared_monthly_report is the one of 20261018001353_monthly_report_shares.sql.

drop policy "user_badges: owner and trainers read" on public.user_badges;
create policy "user_badges: owner and trainers read"
  on public.user_badges for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (private.is_trainer_of(user_id)
        and (badge_code not in (select b.code from public.badges b where b.family = 'diary')
             or private.can_view(user_id, 'nutrition'))));

create or replace function public.shared_monthly_report(p_coaching uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_report jsonb;
  v_shared timestamptz;
  v_shares public.data_shares;
begin
  select s.report, s.shared_at into v_report, v_shared
  from public.monthly_report_shares s
  where s.coaching_id = p_coaching and s.month = p_month
    and private.is_coaching_trainer(p_coaching, 'progress') and private.is_live_coaching(p_coaching);
  if v_report is null then
    return null;
  end if;
  select d.* into v_shares from public.data_shares d where d.coaching_id = p_coaching;

  if not coalesce(v_shares.nutrition, false) then
    v_report := (v_report - 'nutrition') #- '{streaks,diary}';
    if v_report ? 'badges' then
      v_report := pg_catalog.jsonb_set(v_report, '{badges}', coalesce((
        select pg_catalog.jsonb_agg(b.code order by b.n)
        from pg_catalog.jsonb_array_elements_text(v_report->'badges') with ordinality as b(code, n)
        where b.code not in (select x.code from public.badges x where x.family = 'diary')), '[]'::jsonb));
      if v_report->'badges' = '[]'::jsonb then
        v_report := v_report - 'badges';
      end if;
    end if;
  end if;
  if not coalesce(v_shares.steps, false) then
    v_report := (v_report - 'steps' - 'sleep') #- '{streaks,steps}';
  end if;
  if not coalesce(v_shares.measurements, false) then
    v_report := v_report - 'measurements';
  end if;

  return pg_catalog.jsonb_build_object('report', v_report, 'shared_at', v_shared);
end $$;

comment on function public.shared_monthly_report(uuid, date) is
  'The monthly report the client sent to this pair''s trainer (wave-3 §4 rule 3), while the pair is live, without '
  'nutrition, steps, sleep or measurements when the pair''s shares close them now.';
