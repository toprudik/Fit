-- An account deletion ends delegations at once (PRD wave-3 §1 rule 7, data-model §1.6): when a trainer asks to
-- delete the account, every delegation it gave or took is revoked, so nobody acts for it or through it during the
-- 30 days before the purge. A cancelled deletion does not bring them back; the owner hands them out again.
--
-- An invite nobody accepted has no delegate, and revoking it (revoke_delegation or here) broke the delegate check:
-- a revoked row may now stay without one.
alter table public.delegations drop constraint delegations_delegate_check;
alter table public.delegations add constraint delegations_delegate_check
  check (status in ('pending', 'expired', 'revoked') or delegate_trainer_id is not null);

create function private.revoke_delegations_on_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cancelled_at is not null then
    return new;
  end if;
  with revoked as (
    update public.delegations d
    set status = 'revoked', revoked_at = pg_catalog.now(), invite_hash = null
    where (d.owner_trainer_id = new.user_id or d.delegate_trainer_id = new.user_id)
      and d.status in ('pending', 'active')
    returning d.kind, d.session_id, d.delegate_trainer_id
  )
  update public.sessions s set conducted_by = null
  from revoked r
  where r.kind = 'substitute' and s.id = r.session_id and s.conducted_by = r.delegate_trainer_id;
  return new;
end $$;

revoke all on function private.revoke_delegations_on_deletion() from public, anon, authenticated;

create trigger account_deletions_revoke_delegations
after insert or update of cancelled_at on public.account_deletions
for each row execute function private.revoke_delegations_on_deletion();
