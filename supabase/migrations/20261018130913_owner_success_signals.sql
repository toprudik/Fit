-- The success signals of wave 3 on the owner's statistics (/admin/stats; PRD wave-3, the signals at the top
-- and acceptance 1): the share of clients with a weekly streak and how many trainers run a referral offer.
-- Counts only, like the rest of 20261017172329_owner_metrics.sql, never a person's name or id.
--   * A client is an account with a live pair (private.analytics_clients). Their weekly streak is the
--     "Тренировки" streak of 20261017100917_streaks_badges.sql as of their own today; one week or more counts.
--   * A trainer runs an offer when it takes new friends now (private.referral_offer_live); "ever" also counts
--     offers stopped or past their last day, since the signal is about trainers trying the feature.

create function public.admin_owner_success()
returns table (
  clients               integer,
  clients_with_streak   integer,
  trainers              integer,
  trainers_offer_live   integer,
  trainers_offer_ever   integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_owner_metrics(4);

  return query
  with clients as (
    select c.id, private.workout_streak(c.id, private.user_today(c.id)) as streak
    from private.analytics_clients() as c (id)
  )
  select
    (select count(*)::integer from clients),
    (select count(*)::integer from clients c where c.streak >= 1),
    (select count(*)::integer from public.trainer_profiles),
    (select count(distinct o.trainer_id)::integer from public.referral_offers o where private.referral_offer_live(o)),
    (select count(distinct o.trainer_id)::integer from public.referral_offers o);
end $$;

comment on function public.admin_owner_success() is
  'Admin: the wave-3 success signals for the owner''s statistics: clients with a weekly streak and trainers '
  'with a referral offer. Counts only.';
revoke all on function public.admin_owner_success() from public, anon;
grant execute on function public.admin_owner_success() to authenticated;
