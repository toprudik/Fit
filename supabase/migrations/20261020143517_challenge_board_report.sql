-- challenge_board (body from 20261018052219_challenge_board_avatar.sql) also returns report_id: the
-- challenge_participants row a participant reports an alias by (content reports, 20261018201537). The return type
-- changes, so the function is dropped and created again; a photo under an alias stays with its owner and the trainer.
drop function public.challenge_board(uuid);
create function public.challenge_board(p_challenge_id uuid)
returns table (place integer, name text, alias text, score integer, is_me boolean, shown boolean, hidden boolean, photo_url text,
               report_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
  v_trainer boolean;
begin
  select * into v_challenge from public.challenges c where c.id = p_challenge_id;
  if v_challenge.id is null or auth.uid() is null then
    return;
  end if;
  v_trainer := v_challenge.trainer_id = auth.uid();
  if not v_trainer and not exists (
       select 1 from public.challenge_participants p where p.challenge_id = v_challenge.id and p.user_id = auth.uid()) then
    return;
  end if;
  perform private.refresh_challenge_scores(v_challenge.id);
  return query
  select b.place, b.name, b.alias, b.score, b.is_me, b.shown, b.hidden, b.photo_url, b.report_id
  from (
    select (pg_catalog.rank() over (order by p.score desc))::integer as place,
           case when v_trainer
             then coalesce(nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', pr.first_name, pr.last_name)), ''),
                           nullif(pg_catalog.btrim(pr.display_name), ''), '–')
             else coalesce(p.alias, nullif(pg_catalog.btrim(pr.first_name), ''), nullif(pg_catalog.btrim(pr.display_name), ''), '–')
           end as name,
           case when v_trainer then p.alias end as alias,
           p.score, p.user_id = auth.uid() as is_me, p.show_on_leaderboard and v_challenge.leaderboard as shown,
           not private.pair_shares(p.coaching_id, private.challenge_share(v_challenge.metric)) as hidden,
           -- A participant under an alias keeps the photo to themselves and the trainer, or it would give them away.
           case when v_trainer or p.user_id = auth.uid() or p.alias is null then pr.photo_url end as photo_url,
           -- What another participant reports an alias by: the row of this challenge, never the user's id, which
           -- would tie their aliases in different challenges together. Only for an alias on the board.
           case when not v_trainer and p.user_id <> auth.uid() and p.alias is not null and p.show_on_leaderboard
             then p.id end as report_id,
           p.joined_at
    from public.challenge_participants p
    join public.profiles pr on pr.id = p.user_id
    where p.challenge_id = v_challenge.id
  ) b
  where v_trainer or b.is_me or b.shown
  order by b.place, b.joined_at;
end $$;
comment on function public.challenge_board(uuid) is
  'The challenge leaderboard with each participant''s photo: the trainer sees everyone, a participant the ones shown and '
  'themselves (Q40); an alias another participant may report carries its row id.';
revoke all on function public.challenge_board(uuid) from public, anon;
grant execute on function public.challenge_board(uuid) to authenticated;
