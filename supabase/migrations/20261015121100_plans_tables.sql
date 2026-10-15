-- Plans (data-model §2.1a, decisions Q55-Q59, ADR 0014): plans with their seed, plan_grants, access_requests.
-- Policies: 20261015124000_plans_policies.sql; entitlement functions: 20261015125100_entitlements.sql.

-- plans: reference data. Codes and feature codes are a fixed list shared with the app code.
create table public.plans (
  code        text primary key check (code ~ '^[a-z]+_[a-z]+$'),   -- 'trainer_free', 'trainer_pro', 'client_free', 'client_premium'
  side        public.plan_side not null,
  rank        smallint not null check (rank >= 0),                   -- 0 = free, 1 = paid; a higher rank gives more
  title       jsonb not null check (jsonb_typeof(title) = 'object' and title ? 'ru' and title ? 'en'),
  limits      jsonb not null default '{}' check (jsonb_typeof(limits) = 'object'),
  features    text[] not null default '{}',
  price_minor bigint,                                                -- null during the beta
  currency    public.currency_code,
  constraint plans_price_check check ((price_minor is null) = (currency is null))
);

comment on table public.plans is 'A plan for trainers or clients. Reference data seeded by migrations; everyone signed in reads it.';
comment on column public.plans.rank is 'Order within a side: 0 = free, 1 = paid. effective_plan picks the highest active one.';
comment on column public.plans.title is 'Display name per locale: {"ru": ..., "en": ...}.';
comment on column public.plans.limits is 'Numeric limits of the plan, for example {"max_active_clients": 3}.';
comment on column public.plans.features is 'Feature codes the plan unlocks, checked by has_entitlement.';
comment on column public.plans.price_minor is 'Price in minor units of currency; null while plans are only granted by admins.';

alter table public.plans enable row level security;
revoke all on table public.plans from anon, authenticated;

insert into public.plans (code, side, rank, title, limits, features) values
  ('trainer_free', 'trainer', 0, '{"ru": "Free", "en": "Free"}', '{"max_active_clients": 3}', '{}'),
  ('trainer_pro', 'trainer', 1, '{"ru": "Pro", "en": "Pro"}', '{}',
   array['trainer.unlimited_clients', 'trainer.analytics', 'trainer.finance', 'trainer.groups', 'trainer.broadcasts',
         'trainer.client_nutrition', 'trainer.delegation', 'trainer.referral_offers', 'trainer.showcase_custom',
         'trainer.export']),
  ('client_free', 'client', 0, '{"ru": "Free", "en": "Free"}', '{"progress_photo_sets_per_month": 1}', '{}'),
  ('client_premium', 'client', 1, '{"ru": "Premium", "en": "Premium"}', '{}',
   array['client.trends', 'client.nutrition_advanced', 'client.progress_photos_unlimited', 'client.self_training']);

-- plan_grants: who has which plan and when. In the beta only admins grant; purchases come later.
create table public.plan_grants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  plan_code     text not null references public.plans (code),
  source        public.plan_grant_source not null default 'admin',
  granted_by    uuid references public.profiles (id) on delete set null,  -- the admin
  reason        text not null check (char_length(reason) between 3 and 500),
  starts_at     timestamptz not null default now(),
  expires_at    timestamptz,                                               -- null = no end
  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles (id) on delete set null,
  revoke_reason text,
  created_at    timestamptz not null default now(),
  constraint plan_grants_expires_check check (expires_at is null or expires_at > starts_at),
  constraint plan_grants_revoked_check
    check (revoked_at is null or (revoke_reason is not null and char_length(revoke_reason) between 3 and 500))
);

comment on table public.plan_grants is
  'One grant of a plan to a user. Written only by admin RPCs; append-only except for the revocation columns.';
comment on column public.plan_grants.expires_at is 'Exclusive end of the grant; null = no end. Expiry is checked by time, without a job.';
comment on column public.plan_grants.revoked_at is 'Set when an admin revokes the grant, together with revoked_by and revoke_reason.';

create index plan_grants_active_idx on public.plan_grants (user_id, plan_code) where revoked_at is null;
create index plan_grants_plan_code_idx on public.plan_grants (plan_code);

-- Only a revocation may change a grant; granted_by may be cleared when that admin's account goes; rows leave
-- only by the cascade from profiles.
create trigger plan_grants_append_only
  before update or delete on public.plan_grants
  for each row execute function private.enforce_append_only('{revoked_at,revoked_by,revoke_reason}', '{granted_by}', 'true');

create trigger plan_grants_no_truncate
  before truncate on public.plan_grants
  for each statement execute function private.forbid_truncate();

alter table public.plan_grants enable row level security;
revoke all on table public.plan_grants from anon, authenticated;

-- access_requests: the "Request access" button (PLAN-4); an admin decides through an RPC.
create table public.access_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  plan_code  text not null references public.plans (code),
  feature    text check (char_length(feature) <= 64),
  status     public.access_request_status not null default 'open',
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  constraint access_requests_decided_check check ((status = 'open') = (decided_at is null))
);

comment on table public.access_requests is
  'A user asking for a plan. The user inserts it; an admin RPC sets the decision.';
comment on column public.access_requests.feature is 'Feature code the user tried to open, when the request came from a locked feature.';

-- One open request per user and plan (R57; the data-model index cast timestamptz to date and did not compile).
create unique index access_requests_one_open_uniq on public.access_requests (user_id, plan_code) where status = 'open';
create index access_requests_plan_code_idx on public.access_requests (plan_code);

alter table public.access_requests enable row level security;
revoke all on table public.access_requests from anon, authenticated;
