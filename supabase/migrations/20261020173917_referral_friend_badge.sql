-- The client badge "Друг по приглашению" (marketing 15, viral §2.6): a client gets it when a friend who came by
-- their referral link makes the first payment that counts for the trainer's offer, which is when the referral
-- becomes qualified. A voided payment takes the badge back unless another referral of that client still counts,
-- the way session badges follow the attended count. Clients who already brought a friend get it now, silently.

alter table public.badges drop constraint badges_family_check;
alter table public.badges add constraint badges_family_check
  check (family in ('sessions', 'workout_streak', 'diary', 'records', 'homework', 'challenge', 'referral'));

insert into public.badges (code, family, threshold, position) values ('referral_friend', 'referral', 1, 19);

create function private.referrals_award_friend_badge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'client_to_client' then
    return null;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('badges:' || new.referrer_id::text, 0));
  if new.status = 'qualified' and old.status is distinct from 'qualified' then
    insert into public.user_badges (user_id, badge_code) values (new.referrer_id, 'referral_friend')
    on conflict (user_id, badge_code) do nothing;
    if found then
      perform private.enqueue_notification(
        'badge', 'badge:' || new.referrer_id::text || ':referral_friend',
        pg_catalog.jsonb_build_object('badge', 'referral_friend'), new.referrer_id);
    end if;
  elsif old.status = 'qualified' and new.status <> 'qualified'
        and not exists (select 1 from public.referrals r
                        where r.referrer_id = new.referrer_id and r.kind = 'client_to_client'
                          and r.status = 'qualified' and r.id <> new.id) then
    delete from public.user_badges u where u.user_id = new.referrer_id and u.badge_code = 'referral_friend';
  end if;
  return null;
end $$;

comment on function private.referrals_award_friend_badge() is
  'Trigger: a client referral became qualified (the friend paid) and gives the referrer "referral_friend", or stopped '
  'being qualified and takes it back when no other referral of theirs counts (marketing 15).';
revoke all on function private.referrals_award_friend_badge() from public;

create trigger referrals_award_friend_badge
  after update of status on public.referrals
  for each row execute function private.referrals_award_friend_badge();

insert into public.user_badges (user_id, badge_code)
select distinct r.referrer_id, 'referral_friend'
from public.referrals r
where r.kind = 'client_to_client' and r.status = 'qualified'
on conflict (user_id, badge_code) do nothing;
