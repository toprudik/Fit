-- Prices on the trainer's public showcase /trainers/<slug> (PRD wave-1 §2.3 rule 1, §2.8 rules 2–3, MONEY-1/2;
-- screens.md §3.1 "Витрина тренера"). The trainer writes packages directly under the existing grants
-- (20261015123400_money_policies.sql); the showcase is open to anyone, so its grid is read through a definer
-- function like get_trainer_showcase: anon gets no table.

-- The rows of price_grid for an open showcase: live packages the trainer shows publicly (is_public), in the
-- trainer's default currency only (rule 3: one currency per grid). Savings are the view's, so a hidden drop-in
-- still sets the savings of the public packs; the badge goes to a public pack. An unknown or closed showcase
-- answers no rows, as does a trainer without packages.
create function public.get_trainer_showcase_prices(p_slug text)
returns table (
  title             text,
  applies_to        public.package_applies_to,
  sessions_count    smallint,
  price_minor       bigint,
  currency          text,
  per_session_minor bigint,
  validity_days     smallint,
  savings_pct       integer,
  is_best_value     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trainer public.trainer_profiles;
begin
  select t.* into v_trainer from public.trainer_profiles t where t.slug = pg_catalog.lower(p_slug);
  if not private.showcase_is_open(v_trainer) then
    return;
  end if;

  -- The badge is given again among the public rows (same rule as the view: highest savings above 0, ties to
  -- the larger pack), so a hidden pack cannot take it away from the grid the visitor sees.
  return query
  select s.title, s.applies_to, s.sessions_count, s.price_minor, s.currency::text, s.per_session_minor, s.validity_days,
         s.savings_pct,
         coalesce(
           s.savings_pct > 0
             and row_number() over (
               partition by s.applies_to order by s.savings_pct desc nulls last, s.sessions_count desc, s.package_id) = 1,
           false)
  from (
    select g.package_id, g.title, g.applies_to, g.sessions_count, g.price_minor, g.currency, g.per_session_minor,
           pk.validity_days, g.savings_pct, pk.sort_order
    from public.price_grid g
    join public.packages pk on pk.id = g.package_id
    where g.trainer_id = v_trainer.user_id and g.currency = v_trainer.default_currency and pk.is_public
  ) s
  order by s.applies_to, s.sessions_count, s.sort_order, s.package_id;
end $$;

comment on function public.get_trainer_showcase_prices(text) is
  'Price grid of the open showcase with this slug, for anyone: live public packages in the trainer''s default '
  'currency with per-session price, savings and best value from price_grid; no rows for an unknown or closed '
  'showcase (R16, Q60).';
revoke all on function public.get_trainer_showcase_prices(text) from public;
grant execute on function public.get_trainer_showcase_prices(text) to anon, authenticated;
