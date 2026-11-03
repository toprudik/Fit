-- After «Объединить» the person's own pair is deleted, so its old links (/client/trainers/<id>,
-- /trainer/clients/<id> and «Открыть клиента» in earlier bot messages) led to «Такой страницы нет» (QA bug 28).
-- When that delete sets the merged claim's new_coaching_id to null, the old id is now kept in
-- merged_from_coaching_id, and merged_pair_id() tells either side of the merge where it went; the pages redirect.

alter table public.managed_client_claims add column merged_from_coaching_id uuid;

comment on column public.managed_client_claims.merged_from_coaching_id is
  'The person''s own pair that the merge deleted (new_coaching_id before it was set null), kept so old links can '
  'be sent to the merged pair. No foreign key: that pair no longer exists.';

create function private.managed_client_claims_keep_merged_pair()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.new_coaching_id is not null and new.new_coaching_id is null and new.status = 'merged' then
    new.merged_from_coaching_id := old.new_coaching_id;
  end if;
  return new;
end $$;

revoke all on function private.managed_client_claims_keep_merged_pair() from public, anon, authenticated;

create trigger managed_client_claims_keep_merged_pair
  before update of new_coaching_id on public.managed_client_claims
  for each row execute function private.managed_client_claims_keep_merged_pair();

create index managed_client_claims_merged_from_idx on public.managed_client_claims (merged_from_coaching_id)
  where merged_from_coaching_id is not null;

create function public.merged_pair_id(p_coaching_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.managed_client_claims m
  join public.coachings c on c.trainer_id = m.trainer_id and c.client_id = m.claimant_id
  where m.merged_from_coaching_id = p_coaching_id
    and (select auth.uid()) in (m.trainer_id, m.claimant_id)
  limit 1
$$;

comment on function public.merged_pair_id(uuid) is
  'The pair a merged-away pair id now lives in (QA bug 28), for the trainer or the person of that merge; null '
  'for anyone else or an id that was never merged.';

revoke all on function public.merged_pair_id(uuid) from public, anon;
grant execute on function public.merged_pair_id(uuid) to authenticated;
