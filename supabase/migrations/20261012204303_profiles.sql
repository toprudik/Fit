-- Profiles: one row per Supabase auth user, keyed to their Telegram account.
-- Written only by the server during Telegram sign-in (secret key); users can read their own row.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  telegram_id bigint not null unique,
  username text,
  first_name text,
  last_name text,
  photo_url text,
  language_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'App profile for each user; telegram_id is the stable external identity.';

alter table public.profiles enable row level security;

create policy "profiles: users read own row"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- No insert/update/delete policies on purpose: only server code using the secret key writes here.

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
