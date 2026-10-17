-- Declining a delegation invite failed on every invite (PRD wave-3 §1 rule 2): decline_delegation sets 'declined'
-- on a row that has no delegate yet, and delegations_delegate_check (20261017120713_deletion_revokes_delegations.sql)
-- allowed that only for pending, expired and revoked. A declined invite has no delegate either.
alter table public.delegations drop constraint delegations_delegate_check;
alter table public.delegations add constraint delegations_delegate_check
  check (status in ('pending', 'expired', 'revoked', 'declined') or delegate_trainer_id is not null);
