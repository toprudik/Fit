-- Food diary (PRD wave-2 §3, data-model §2.2): foods (the Open Food Facts cache and the client's own products and
-- dishes), favorites, diary entries and the trainer's comments on a day.
-- * The diary is one per client, not per pair (§3.1); a trainer reads it while the pair shares nutrition (§3.6).
-- * Entries keep a snapshot of name, kcal and macros, so a later edit of a food changes no past day.
-- * Writes go through functions that check the numbers (§3.10); tables grant select, and favorites and entries
--   also delete, to their owner.
-- * The Open Food Facts cache is written only by the server (service_role) after a search or a barcode lookup;
--   own products are private and never leave DaFit (§3.4).

create type public.food_source as enum ('off', 'custom');
create type public.food_kind as enum ('product', 'dish');
create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

-- =========================================================================================================
-- Tables

create table public.foods (
  id              uuid primary key default gen_random_uuid(),
  source          public.food_source not null,
  kind            public.food_kind not null default 'product',
  owner_id        uuid references public.profiles(id) on delete cascade,
  barcode         text check (barcode ~ '^[0-9]{8,14}$'),
  off_code        text check (char_length(off_code) <= 40),
  name            text not null check (char_length(btrim(name)) between 1 and 200),
  brand           text check (char_length(brand) <= 200),
  kcal_100g       numeric(6,1) not null check (kcal_100g between 0 and 900),
  protein_100g    numeric(5,1) check (protein_100g between 0 and 100),
  fat_100g        numeric(5,1) check (fat_100g between 0 and 100),
  carbs_100g      numeric(5,1) check (carbs_100g between 0 and 100),
  serving_g       numeric(7,1) check (serving_g > 0 and serving_g <= 5000),
  serving_label   text check (char_length(serving_label) <= 80),
  lang            text check (char_length(lang) <= 8),
  off_fetched_at  timestamptz,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((source = 'custom') = (owner_id is not null)),
  check ((source = 'off') = (off_code is not null)),
  check (coalesce(protein_100g, 0) + coalesce(fat_100g, 0) + coalesce(carbs_100g, 0) <= 100),
  check (kind = 'product' or source = 'custom')
);
comment on table public.foods is
  'Foods for the diary (wave-2 §3): the Open Food Facts cache (source off, shared) and own products and dishes (custom, private).';
comment on column public.foods.lang is 'Language of the Open Food Facts name.';
create unique index foods_off_code_key on public.foods (off_code) where source = 'off';
create index foods_barcode_off_idx on public.foods (barcode) where source = 'off';
create unique index foods_owner_barcode_key on public.foods (owner_id, barcode)
  where source = 'custom' and barcode is not null and archived_at is null;
create index foods_owner_id_idx on public.foods (owner_id);
create index foods_name_trgm on public.foods using gin (name extensions.gin_trgm_ops);
create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();
alter table public.foods enable row level security;
revoke all on table public.foods from anon, authenticated;

create table public.food_dish_items (
  dish_id   uuid not null references public.foods(id) on delete cascade,
  position  smallint not null check (position between 0 and 49),
  food_id   uuid not null references public.foods(id) on delete cascade,
  grams     numeric(7,1) not null check (grams > 0 and grams <= 5000),
  primary key (dish_id, position)
);
comment on table public.food_dish_items is 'A dish = products with grams (wave-2 §3.2); the dish keeps its kcal and macros per 100 g.';
create index food_dish_items_food_id_idx on public.food_dish_items (food_id);
alter table public.food_dish_items enable row level security;
revoke all on table public.food_dish_items from anon, authenticated;

create table public.food_favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  food_id    uuid not null references public.foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);
comment on table public.food_favorites is 'Foods a client marked to repeat quickly (wave-2 §3.7).';
create index food_favorites_food_id_idx on public.food_favorites (food_id);
alter table public.food_favorites enable row level security;
revoke all on table public.food_favorites from anon, authenticated;

create table public.food_diary_entries (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles(id) on delete cascade,
  local_date  date not null,
  meal        public.meal_type not null,
  food_id     uuid references public.foods(id) on delete set null,
  title       text check (char_length(title) <= 200),
  grams       numeric(7,1) check (grams > 0 and grams <= 5000),
  servings    numeric(5,2) check (servings > 0 and servings <= 100),
  kcal        numeric(6,1) not null check (kcal between 0 and 5000),
  protein_g   numeric(6,1) check (protein_g >= 0),
  fat_g       numeric(6,1) check (fat_g >= 0),
  carbs_g     numeric(6,1) check (carbs_g >= 0),
  logged_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.food_diary_entries is
  'What the client ate (wave-2 §3): a food with grams or servings, or a quick kcal entry (no food); values are a snapshot.';
create index food_diary_entries_client_date_idx on public.food_diary_entries (client_id, local_date);
create index food_diary_entries_food_id_idx on public.food_diary_entries (food_id);
create trigger food_diary_entries_set_updated_at
  before update on public.food_diary_entries
  for each row execute function public.set_updated_at();
alter table public.food_diary_entries enable row level security;
revoke all on table public.food_diary_entries from anon, authenticated;

create table public.food_day_comments (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.profiles(id) on delete cascade,
  coaching_id         uuid not null references public.coachings(id) on delete cascade,
  author_id           uuid references public.profiles(id) on delete set null,
  local_date          date not null,
  body                text not null check (char_length(btrim(body)) between 1 and 1000),
  hidden_by_client_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.food_day_comments is 'A trainer''s comment on a day of the client''s food diary (wave-2 §3.11–3.14).';
create index food_day_comments_client_date_idx on public.food_day_comments (client_id, local_date);
create index food_day_comments_coaching_id_idx on public.food_day_comments (coaching_id);
create index food_day_comments_author_id_idx on public.food_day_comments (author_id);
create trigger food_day_comments_set_updated_at
  before update on public.food_day_comments
  for each row execute function public.set_updated_at();
alter table public.food_day_comments enable row level security;
revoke all on table public.food_day_comments from anon, authenticated;

-- =========================================================================================================
-- Policies

create policy "foods: the catalog and own foods"
  on public.foods for select
  to authenticated
  using (source = 'off' or owner_id = (select auth.uid()));

create policy "food_dish_items: own dishes"
  on public.food_dish_items for select
  to authenticated
  using (exists (select 1 from public.foods f where f.id = dish_id and f.owner_id = (select auth.uid())));

create policy "food_favorites: own select"
  on public.food_favorites for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "food_favorites: own delete"
  on public.food_favorites for delete
  to authenticated
  using (user_id = (select auth.uid()));

create policy "food_diary_entries: client and nutrition-sharing trainers read"
  on public.food_diary_entries for select
  to authenticated
  using (client_id = any ((select private.viewable_client_ids('nutrition'))::uuid[]));

create policy "food_diary_entries: client deletes own"
  on public.food_diary_entries for delete
  to authenticated
  using (client_id = (select auth.uid()));

create policy "food_day_comments: the client and the pair's trainer while nutrition is shared"
  on public.food_day_comments for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or (exists (select 1 from public.coachings c where c.id = coaching_id and c.trainer_id = (select auth.uid()))
        and private.can_view(client_id, 'nutrition')));

grant select on table public.foods, public.food_dish_items, public.food_favorites, public.food_diary_entries,
  public.food_day_comments to authenticated;
grant delete on table public.food_favorites, public.food_diary_entries to authenticated;
grant select, insert, update on table public.foods to service_role;

-- =========================================================================================================
-- Helpers

-- The nutrients of an amount of a food: grams × per-100 g, rounded to tenths.
create function private.food_amount(p_food public.foods, p_grams numeric)
returns table (kcal numeric, protein_g numeric, fat_g numeric, carbs_g numeric)
language sql
immutable
set search_path = ''
as $$
  select round(p_food.kcal_100g * p_grams / 100, 1),
         round(p_food.protein_100g * p_grams / 100, 1),
         round(p_food.fat_100g * p_grams / 100, 1),
         round(p_food.carbs_100g * p_grams / 100, 1)
$$;
comment on function private.food_amount(public.foods, numeric) is 'Kcal and macros of p_grams of a food.';
revoke all on function private.food_amount(public.foods, numeric) from public;

-- A diary day may be any past day and at most tomorrow (the client's day can be ahead of the server's).
create function private.check_diary_day(p_day date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_day is null or p_day > (pg_catalog.now() at time zone 'UTC')::date + 1 or p_day < date '2000-01-01' then
    raise exception 'invalid_day' using errcode = '22023';
  end if;
end $$;
comment on function private.check_diary_day(date) is 'Refuses a diary day in the future beyond tomorrow (UTC) or before 2000.';
revoke all on function private.check_diary_day(date) from public;

-- Checks the per-100 g values of an own product (§3.10).
create function private.check_food_values(p_kcal numeric, p_protein numeric, p_fat numeric, p_carbs numeric)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_kcal is null or p_kcal < 0 or p_kcal > 900
     or p_protein < 0 or p_fat < 0 or p_carbs < 0
     or coalesce(p_protein, 0) + coalesce(p_fat, 0) + coalesce(p_carbs, 0) > 100 then
    raise exception 'invalid_food_values' using errcode = '22023';
  end if;
end $$;
comment on function private.check_food_values(numeric, numeric, numeric, numeric) is
  'Own product per 100 g: kcal 0–900, macros not negative and together at most 100 g (wave-2 §3.10).';
revoke all on function private.check_food_values(numeric, numeric, numeric, numeric) from public;

-- =========================================================================================================
-- The Open Food Facts cache (server only)

-- Upserts products from Open Food Facts and returns their ids by code. Products without kcal are skipped.
create function public.cache_off_foods(p_items jsonb)
returns table (off_code text, id uuid)
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.foods as f
    (source, off_code, barcode, name, brand, kcal_100g, protein_100g, fat_100g, carbs_100g, serving_g, serving_label,
     lang, off_fetched_at)
  select 'off', i.code, case when i.code ~ '^[0-9]{8,14}$' then i.code end,
         left(btrim(i.name), 200), nullif(left(btrim(i.brand), 200), ''),
         i.kcal, i.protein, i.fat, i.carbs, i.serving_g, nullif(left(btrim(i.serving_label), 80), ''),
         nullif(left(i.lang, 8), ''), pg_catalog.now()
  from pg_catalog.jsonb_to_recordset(coalesce(p_items, '[]')) as i(
    code text, name text, brand text, kcal numeric, protein numeric, fat numeric, carbs numeric,
    serving_g numeric, serving_label text, lang text)
  where i.code is not null and char_length(i.code) <= 40 and btrim(coalesce(i.name, '')) <> ''
    and i.kcal between 0 and 900
    and (i.protein is null or i.protein between 0 and 100)
    and (i.fat is null or i.fat between 0 and 100)
    and (i.carbs is null or i.carbs between 0 and 100)
    and coalesce(i.protein, 0) + coalesce(i.fat, 0) + coalesce(i.carbs, 0) <= 100
    and (i.serving_g is null or (i.serving_g > 0 and i.serving_g <= 5000))
  on conflict (off_code) where source = 'off' do update
    set name = excluded.name, brand = excluded.brand, barcode = excluded.barcode,
        kcal_100g = excluded.kcal_100g, protein_100g = excluded.protein_100g, fat_100g = excluded.fat_100g,
        carbs_100g = excluded.carbs_100g, serving_g = excluded.serving_g, serving_label = excluded.serving_label,
        lang = excluded.lang, off_fetched_at = excluded.off_fetched_at
  returning f.off_code, f.id
$$;
comment on function public.cache_off_foods(jsonb) is
  'Server: caches Open Food Facts products (wave-2 §3.5) and returns their ids. Values out of range are skipped.';
revoke all on function public.cache_off_foods(jsonb) from public, anon, authenticated;
grant execute on function public.cache_off_foods(jsonb) to service_role;

-- =========================================================================================================
-- Search and barcode (client)

-- Own products and dishes and cached catalog products whose name looks like the query; own first.
create function public.search_foods(p_query text, p_limit integer default 20)
returns setof public.foods
language sql
stable
security invoker
set search_path = ''
as $$
  select f.*
  from public.foods f
  where f.archived_at is null
    and (f.owner_id = (select auth.uid()) or f.source = 'off')
    and char_length(btrim(coalesce(p_query, ''))) >= 2
    and (f.name operator(extensions.%>) btrim(p_query) or f.name ilike '%' || btrim(p_query) || '%'
         or f.brand ilike '%' || btrim(p_query) || '%')
  order by (f.source = 'custom') desc,
           extensions.word_similarity(btrim(p_query), f.name) desc,
           f.name
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;
comment on function public.search_foods(text, integer) is
  'Own foods and the cached catalog by name or brand (wave-2 §3.8: the search that works while the catalog is down).';
revoke all on function public.search_foods(text, integer) from public, anon;
grant execute on function public.search_foods(text, integer) to authenticated;

-- A barcode: the client's own product first (§3.3), then the cached catalog product.
create function public.food_by_barcode(p_barcode text)
returns setof public.foods
language sql
stable
security invoker
set search_path = ''
as $$
  select f.*
  from public.foods f
  where f.barcode = p_barcode and f.archived_at is null
    and (f.owner_id = (select auth.uid()) or f.source = 'off')
  order by (f.source = 'custom') desc
  limit 1
$$;
comment on function public.food_by_barcode(text) is 'The food with this barcode: own product first, then the catalog (wave-2 §3.3).';
revoke all on function public.food_by_barcode(text) from public, anon;
grant execute on function public.food_by_barcode(text) to authenticated;

-- =========================================================================================================
-- Own products and dishes

create function public.save_food(
  p_id uuid,
  p_name text,
  p_kcal numeric,
  p_protein numeric default null,
  p_fat numeric default null,
  p_carbs numeric default null,
  p_serving_g numeric default null,
  p_serving_label text default null,
  p_barcode text default null,
  p_brand text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_barcode text := nullif(btrim(coalesce(p_barcode, '')), '');
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 200 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  perform private.check_food_values(p_kcal, p_protein, p_fat, p_carbs);
  if p_serving_g is not null and (p_serving_g <= 0 or p_serving_g > 5000) then
    raise exception 'invalid_serving' using errcode = '22023';
  end if;
  if v_barcode is not null and v_barcode !~ '^[0-9]{8,14}$' then
    raise exception 'invalid_barcode' using errcode = '22023';
  end if;
  if v_barcode is not null and exists (
    select 1 from public.foods f
    where f.owner_id = v_user and f.barcode = v_barcode and f.archived_at is null and f.id is distinct from p_id
  ) then
    raise exception 'barcode_taken' using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.foods (source, kind, owner_id, barcode, name, brand, kcal_100g, protein_100g, fat_100g,
                              carbs_100g, serving_g, serving_label)
    values ('custom', 'product', v_user, v_barcode, btrim(p_name), nullif(btrim(coalesce(p_brand, '')), ''),
            p_kcal, p_protein, p_fat, p_carbs, p_serving_g, nullif(btrim(coalesce(p_serving_label, '')), ''))
    returning id into v_id;
  else
    update public.foods f
    set name = btrim(p_name), brand = nullif(btrim(coalesce(p_brand, '')), ''), barcode = v_barcode,
        kcal_100g = p_kcal, protein_100g = p_protein, fat_100g = p_fat, carbs_100g = p_carbs,
        serving_g = p_serving_g, serving_label = nullif(btrim(coalesce(p_serving_label, '')), '')
    where f.id = p_id and f.owner_id = v_user and f.kind = 'product' and f.archived_at is null
    returning f.id into v_id;
    if v_id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end $$;
comment on function public.save_food(uuid, text, numeric, numeric, numeric, numeric, numeric, text, text, text) is
  'Creates (p_id null) or edits an own product with values per 100 g (wave-2 §3.2, §3.10); private to the client.';
revoke all on function public.save_food(uuid, text, numeric, numeric, numeric, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.save_food(uuid, text, numeric, numeric, numeric, numeric, numeric, text, text, text) to authenticated;

-- The items of a dish as sent: [{food_id, grams}] in order.
create function private.dish_items(p_items jsonb)
returns table (item_position smallint, food_id uuid, grams numeric)
language sql
immutable
set search_path = ''
as $$
  select (i.ordinality - 1)::smallint, (i.value ->> 'food_id')::uuid, (i.value ->> 'grams')::numeric
  from pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(p_items) = 'array' then p_items else '[]' end)
       with ordinality as i(value, ordinality)
$$;
comment on function private.dish_items(jsonb) is 'Reads the [{food_id, grams}] of save_dish.';
revoke all on function private.dish_items(jsonb) from public;

-- A dish from products with grams: kcal and macros per 100 g of the cooked weight (or the sum of the grams).
create function public.save_dish(p_id uuid, p_name text, p_items jsonb, p_total_g numeric default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_count integer;
  v_bad integer;
  v_sum_g numeric;
  v_weight numeric;
  v_kcal numeric;
  v_protein numeric;
  v_fat numeric;
  v_carbs numeric;
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 200 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  select count(*), sum(i.grams),
         count(*) filter (where i.grams is null or i.grams <= 0 or i.grams > 5000 or f.id is null)
  into v_count, v_sum_g, v_bad
  from private.dish_items(p_items) i
  left join public.foods f on f.id = i.food_id and f.kind = 'product' and f.archived_at is null
                          and (f.source = 'off' or f.owner_id = v_user);
  if v_count = 0 or v_count > 50 or v_bad > 0 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  v_weight := coalesce(p_total_g, v_sum_g);
  if v_weight <= 0 or v_weight > 50000 then
    raise exception 'invalid_serving' using errcode = '22023';
  end if;

  select sum(f.kcal_100g * d.grams / 100), sum(coalesce(f.protein_100g, 0) * d.grams / 100),
         sum(coalesce(f.fat_100g, 0) * d.grams / 100), sum(coalesce(f.carbs_100g, 0) * d.grams / 100)
  into v_kcal, v_protein, v_fat, v_carbs
  from private.dish_items(p_items) d join public.foods f on f.id = d.food_id;
  -- Per 100 g of the dish; a dish boiled down can pass 900 kcal or 100 g per 100 g only by a typo in the weight.
  v_kcal := round(v_kcal * 100 / v_weight, 1);
  v_protein := round(v_protein * 100 / v_weight, 1);
  v_fat := round(v_fat * 100 / v_weight, 1);
  v_carbs := round(v_carbs * 100 / v_weight, 1);
  if v_kcal > 900 or v_protein + v_fat + v_carbs > 100 then
    raise exception 'invalid_serving' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.foods (source, kind, owner_id, name, kcal_100g, protein_100g, fat_100g, carbs_100g, serving_g)
    values ('custom', 'dish', v_user, btrim(p_name), v_kcal, v_protein, v_fat, v_carbs, v_weight)
    returning id into v_id;
  else
    update public.foods f
    set name = btrim(p_name), kcal_100g = v_kcal, protein_100g = v_protein, fat_100g = v_fat, carbs_100g = v_carbs,
        serving_g = v_weight
    where f.id = p_id and f.owner_id = v_user and f.kind = 'dish' and f.archived_at is null
    returning f.id into v_id;
    if v_id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    delete from public.food_dish_items i where i.dish_id = v_id;
  end if;
  insert into public.food_dish_items (dish_id, position, food_id, grams)
  select v_id, d.item_position, d.food_id, d.grams from private.dish_items(p_items) d;
  return v_id;
end $$;
comment on function public.save_dish(uuid, text, jsonb, numeric) is
  'Creates or edits an own dish from [{food_id, grams}] (wave-2 §3.2); per 100 g is computed, the whole dish is one serving.';
revoke all on function public.save_dish(uuid, text, jsonb, numeric) from public, anon;
grant execute on function public.save_dish(uuid, text, jsonb, numeric) to authenticated;

-- Removes an own food from the lists; past entries keep their snapshot.
create function public.archive_food(p_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with archived as (
    update public.foods f set archived_at = pg_catalog.now()
    where f.id = p_id and f.owner_id = (select auth.uid()) and f.archived_at is null
    returning f.id
  ), unfavored as (
    delete from public.food_favorites fv where fv.food_id in (select a.id from archived a)
  )
  select exists (select 1 from archived)
$$;
comment on function public.archive_food(uuid) is 'Hides an own product or dish; the diary keeps what was written.';
revoke all on function public.archive_food(uuid) from public, anon;
grant execute on function public.archive_food(uuid) to authenticated;

create function public.set_food_favorite(p_food_id uuid, p_favorite boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not p_favorite then
    delete from public.food_favorites fv where fv.user_id = v_user and fv.food_id = p_food_id;
    return false;
  end if;
  if not exists (select 1 from public.foods f
                 where f.id = p_food_id and f.archived_at is null and (f.source = 'off' or f.owner_id = v_user)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.food_favorites (user_id, food_id) values (v_user, p_food_id) on conflict do nothing;
  return true;
end $$;
comment on function public.set_food_favorite(uuid, boolean) is 'Marks or unmarks a food as a favorite (wave-2 §3.7).';
revoke all on function public.set_food_favorite(uuid, boolean) from public, anon;
grant execute on function public.set_food_favorite(uuid, boolean) to authenticated;

-- =========================================================================================================
-- Diary entries

-- Adds an entry: a food with grams or servings (kcal and macros computed here), or a quick kcal entry (§3.2).
create function public.add_food_entry(
  p_day date,
  p_meal public.meal_type,
  p_food_id uuid default null,
  p_grams numeric default null,
  p_servings numeric default null,
  p_kcal numeric default null,
  p_protein numeric default null,
  p_fat numeric default null,
  p_carbs numeric default null,
  p_title text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_food public.foods;
  v_grams numeric;
  v_amount record;
  v_id uuid;
begin
  if v_user is null or p_meal is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.check_diary_day(p_day);

  if p_food_id is null then
    if p_kcal is null or p_kcal <= 0 or p_kcal > 5000
       or p_protein < 0 or p_fat < 0 or p_carbs < 0
       or p_protein > 1000 or p_fat > 1000 or p_carbs > 1000 then
      raise exception 'invalid_kcal' using errcode = '22023';
    end if;
    insert into public.food_diary_entries (client_id, local_date, meal, title, kcal, protein_g, fat_g, carbs_g)
    values (v_user, p_day, p_meal, nullif(left(btrim(coalesce(p_title, '')), 200), ''), round(p_kcal, 1),
            round(p_protein, 1), round(p_fat, 1), round(p_carbs, 1))
    returning id into v_id;
    return v_id;
  end if;

  select * into v_food from public.foods f
  where f.id = p_food_id and f.archived_at is null and (f.source = 'off' or f.owner_id = v_user);
  if v_food.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_servings is not null then
    if v_food.serving_g is null or p_servings <= 0 or p_servings > 100 then
      raise exception 'invalid_amount' using errcode = '22023';
    end if;
    v_grams := round(v_food.serving_g * p_servings, 1);
  else
    v_grams := p_grams;
  end if;
  if v_grams is null or v_grams <= 0 or v_grams > 5000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  select * into v_amount from private.food_amount(v_food, v_grams);
  if v_amount.kcal > 5000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  insert into public.food_diary_entries
    (client_id, local_date, meal, food_id, title, grams, servings, kcal, protein_g, fat_g, carbs_g)
  values (v_user, p_day, p_meal, v_food.id, v_food.name, v_grams, p_servings, v_amount.kcal, v_amount.protein_g,
          v_amount.fat_g, v_amount.carbs_g)
  returning id into v_id;
  return v_id;
end $$;
comment on function public.add_food_entry(date, public.meal_type, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text) is
  'The client logs a food (grams or servings; values from the food) or quick kcal (wave-2 §3.2–3.4, §3.10).';
revoke all on function public.add_food_entry(date, public.meal_type, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.add_food_entry(date, public.meal_type, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;

-- Changes the meal or the amount of an own entry; a food entry is recomputed from the food when it still exists,
-- otherwise scaled from its own snapshot.
create function public.update_food_entry(
  p_id uuid,
  p_meal public.meal_type,
  p_grams numeric default null,
  p_servings numeric default null,
  p_kcal numeric default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_entry public.food_diary_entries;
  v_food public.foods;
  v_grams numeric;
  v_ratio numeric;
  v_amount record;
begin
  select * into v_entry from public.food_diary_entries e where e.id = p_id and e.client_id = v_user;
  if v_entry.id is null or p_meal is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_entry.grams is null then
    -- A quick kcal entry: the kcal changes, the macros stay as typed.
    if p_kcal is null or p_kcal <= 0 or p_kcal > 5000 then
      raise exception 'invalid_kcal' using errcode = '22023';
    end if;
    update public.food_diary_entries e set meal = p_meal, kcal = round(p_kcal, 1) where e.id = p_id;
    return true;
  end if;

  select * into v_food from public.foods f where f.id = v_entry.food_id;
  if p_servings is not null then
    if coalesce(v_food.serving_g, v_entry.grams / v_entry.servings) is null or p_servings <= 0 or p_servings > 100 then
      raise exception 'invalid_amount' using errcode = '22023';
    end if;
    v_grams := round(coalesce(v_food.serving_g, v_entry.grams / v_entry.servings) * p_servings, 1);
  else
    v_grams := p_grams;
  end if;
  if v_grams is null or v_grams <= 0 or v_grams > 5000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  if v_food.id is not null then
    select * into v_amount from private.food_amount(v_food, v_grams);
  else
    v_ratio := v_grams / v_entry.grams;
    select round(v_entry.kcal * v_ratio, 1) as kcal, round(v_entry.protein_g * v_ratio, 1) as protein_g,
           round(v_entry.fat_g * v_ratio, 1) as fat_g, round(v_entry.carbs_g * v_ratio, 1) as carbs_g
    into v_amount;
  end if;
  if v_amount.kcal > 5000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  update public.food_diary_entries e
  set meal = p_meal, grams = v_grams, servings = p_servings, kcal = v_amount.kcal, protein_g = v_amount.protein_g,
      fat_g = v_amount.fat_g, carbs_g = v_amount.carbs_g
  where e.id = p_id;
  return true;
end $$;
comment on function public.update_food_entry(uuid, public.meal_type, numeric, numeric, numeric) is
  'The client edits an own entry on any day (wave-2 §3.8): the meal and the grams, servings or quick kcal.';
revoke all on function public.update_food_entry(uuid, public.meal_type, numeric, numeric, numeric) from public, anon;
grant execute on function public.update_food_entry(uuid, public.meal_type, numeric, numeric, numeric) to authenticated;

-- "Скопировать вчерашний приём" (§3.7): copies the entries of a meal of one day to a meal of another day.
create function public.copy_food_meal(p_from date, p_meal public.meal_type, p_to date, p_to_meal public.meal_type default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null or p_meal is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.check_diary_day(p_from);
  perform private.check_diary_day(p_to);
  insert into public.food_diary_entries
    (client_id, local_date, meal, food_id, title, grams, servings, kcal, protein_g, fat_g, carbs_g)
  select v_user, p_to, coalesce(p_to_meal, p_meal), e.food_id, e.title, e.grams, e.servings, e.kcal, e.protein_g,
         e.fat_g, e.carbs_g
  from public.food_diary_entries e
  where e.client_id = v_user and e.local_date = p_from and e.meal = p_meal
  order by e.logged_at;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
comment on function public.copy_food_meal(date, public.meal_type, date, public.meal_type) is
  'Copies a meal of one day into another day (wave-2 §3.7); returns how many entries were copied.';
revoke all on function public.copy_food_meal(date, public.meal_type, date, public.meal_type) from public, anon;
grant execute on function public.copy_food_meal(date, public.meal_type, date, public.meal_type) to authenticated;

-- =========================================================================================================
-- The trainer's comments on a day (§3.11–3.14)

create function public.add_food_comment(p_coaching_id uuid, p_day date, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pair public.coachings;
  v_author public.profiles;
  v_id uuid;
begin
  select * into v_pair from public.coachings c where c.id = p_coaching_id and c.trainer_id = v_user;
  if v_pair.id is null or not private.can_view(v_pair.client_id, 'nutrition') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.check_diary_day(p_day);
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  insert into public.food_day_comments (client_id, coaching_id, author_id, local_date, body)
  values (v_pair.client_id, v_pair.id, v_user, p_day, btrim(p_body))
  returning id into v_id;

  select * into v_author from public.profiles p where p.id = v_user;
  perform private.enqueue_notification(
    'trainer_comment',
    'trainer_comment:' || v_id::text,
    pg_catalog.jsonb_build_object(
      'comment_id', v_id, 'day', p_day, 'body', left(btrim(p_body), 300),
      'first_name', v_author.first_name, 'last_name', v_author.last_name, 'display_name', v_author.display_name),
    v_pair.client_id);
  return v_id;
end $$;
comment on function public.add_food_comment(uuid, date, text) is
  'The trainer comments a day of the client''s food diary while nutrition is shared; the client gets trainer_comment.';
revoke all on function public.add_food_comment(uuid, date, text) from public, anon;
grant execute on function public.add_food_comment(uuid, date, text) to authenticated;

create function public.edit_food_comment(p_id uuid, p_body text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  update public.food_day_comments m set body = btrim(p_body)
  where m.id = p_id and m.author_id = (select auth.uid()) and private.can_view(m.client_id, 'nutrition')
    and exists (select 1 from public.coachings c where c.id = m.coaching_id and c.trainer_id = (select auth.uid()));
  return found;
end $$;
comment on function public.edit_food_comment(uuid, text) is 'The author edits their comment while the pair shares nutrition (wave-2 §3.14).';
revoke all on function public.edit_food_comment(uuid, text) from public, anon;
grant execute on function public.edit_food_comment(uuid, text) to authenticated;

create function public.delete_food_comment(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.food_day_comments m
  where m.id = p_id and m.author_id = (select auth.uid())
    and exists (select 1 from public.coachings c where c.id = m.coaching_id and c.trainer_id = (select auth.uid()));
  return found;
end $$;
comment on function public.delete_food_comment(uuid) is 'The author deletes their comment (wave-2 §3.14).';
revoke all on function public.delete_food_comment(uuid) from public, anon;
grant execute on function public.delete_food_comment(uuid) to authenticated;

create function public.hide_food_comment(p_id uuid, p_hidden boolean default true)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.food_day_comments m
  set hidden_by_client_at = case when p_hidden then coalesce(m.hidden_by_client_at, pg_catalog.now()) end
  where m.id = p_id and m.client_id = (select auth.uid());
  return found;
end $$;
comment on function public.hide_food_comment(uuid, boolean) is 'The client hides (or shows again) a comment on their side (wave-2 §3.14).';
revoke all on function public.hide_food_comment(uuid, boolean) from public, anon;
grant execute on function public.hide_food_comment(uuid, boolean) to authenticated;

-- =========================================================================================================
-- The target of a diary day (§3.9)

-- The target in force on a day of the client's diary. A trainer gets their own target or the calculator's, never
-- another trainer's values (§2.8): then the row says only that another trainer's target is active.
create function public.nutrition_target_on(p_client_id uuid, p_day date)
returns table (source public.target_source, kcal integer, protein_g integer, fat_g integer, carbs_g integer, other_trainer boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_target public.nutrition_targets;
begin
  if v_user is null or p_client_id is null or p_day is null or not private.can_view(p_client_id, 'nutrition') then
    return;
  end if;
  select * into v_target from public.nutrition_targets t where t.id = private.active_nutrition_target(p_client_id, p_day);
  if v_target.id is null then
    return;
  end if;
  if v_user <> p_client_id and v_target.source = 'trainer'
     and not exists (select 1 from public.coachings c where c.id = v_target.coaching_id and c.trainer_id = v_user) then
    return query select v_target.source, null::integer, null::integer, null::integer, null::integer, true;
    return;
  end if;
  return query select v_target.source, v_target.kcal::integer, v_target.protein_g::integer, v_target.fat_g::integer,
                      v_target.carbs_g::integer, false;
end $$;
comment on function public.nutrition_target_on(uuid, date) is
  'The target of a diary day for the client or a nutrition-sharing trainer; another trainer''s values stay hidden (wave-2 §2.8, §3.9).';
revoke all on function public.nutrition_target_on(uuid, date) from public, anon;
grant execute on function public.nutrition_target_on(uuid, date) to authenticated;
