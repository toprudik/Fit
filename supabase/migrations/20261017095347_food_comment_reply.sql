-- «Ответить» under the bot's message about a trainer's comment on the food diary (wave-2 §3.13, Q39): there are
-- no replies inside DaFit, so the button opens the trainer's Telegram chat. The message needs the trainer's
-- username for that, and the pair for the fallback when the trainer has none (the pair screen offers
-- «Попросить связаться»). Same function as in 20261017081733_food_diary.sql, with a richer payload.

create or replace function public.add_food_comment(p_coaching_id uuid, p_day date, p_body text)
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
      'comment_id', v_id, 'coaching_id', v_pair.id, 'day', p_day, 'body', left(btrim(p_body), 300),
      'first_name', v_author.first_name, 'last_name', v_author.last_name, 'display_name', v_author.display_name,
      'username', v_author.username),
    v_pair.client_id);
  return v_id;
end $$;
comment on function public.add_food_comment(uuid, date, text) is
  'The trainer comments a day of the client''s food diary while nutrition is shared; the client gets trainer_comment '
  'with a reply button to the trainer''s Telegram chat.';
