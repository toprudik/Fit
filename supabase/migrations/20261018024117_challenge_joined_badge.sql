-- The challenge participation badge (PRD wave-3 §2.2 rule 5, "участие/победа в челлендже"): when a challenge
-- finishes, everyone who scored in it gets "challenge_joined", next to "challenge_done" at the goal and
-- "challenge_winner" for the top three. A participant who joined and never scored gets nothing. The rest of
-- finish_challenges is the one of 20261017103914_group_challenges.sql.

insert into public.badges (code, family, threshold, position) values ('challenge_joined', 'challenge', 1, 18);

create or replace function private.finish_challenges()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
  v_done integer := 0;
  r record;
begin
  for v_challenge in
    select * from public.challenges c
    where c.cancelled_at is null and c.finished_at is null and c.ends_on < private.user_today(c.trainer_id)
    for update skip locked
  loop
    perform private.refresh_challenge_scores(v_challenge.id);
    update public.challenges c set finished_at = pg_catalog.now() where c.id = v_challenge.id;
    for r in
      select p.user_id, p.score > 0 as took_part, v_challenge.goal is not null and p.score >= v_challenge.goal as reached,
             v_challenge.leaderboard and p.score > 0 and pg_catalog.rank() over (order by p.score desc) <= 3 as winner
      from public.challenge_participants p
      where p.challenge_id = v_challenge.id
    loop
      if r.took_part then
        perform private.grant_challenge_badge(r.user_id, 'challenge_joined');
      end if;
      if r.reached then
        perform private.grant_challenge_badge(r.user_id, 'challenge_done');
      end if;
      if r.winner then
        perform private.grant_challenge_badge(r.user_id, 'challenge_winner');
      end if;
    end loop;
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;

comment on function private.finish_challenges() is
  'Finishes the challenges whose last day is over and awards challenge_joined, challenge_done and challenge_winner '
  '(wave-3 §2.2-5, §2.3-13).';
