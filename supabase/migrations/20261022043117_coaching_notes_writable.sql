-- Whether the caller can add a note to the pair now (QA B9): the pair's trainer or an assistant with the notes scope,
-- once the trainer accepted «Поручение для тренеров». The assistant's card asks it before showing the form, since
-- the assistant can't read the trainer's consents and the insert policy refuses without saying why.
create function public.coaching_notes_writable(p_coaching_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_coaching_trainer(p_coaching_id, 'notes') and coalesce(private.coaching_dpa_accepted(p_coaching_id), false)
$$;

comment on function public.coaching_notes_writable(uuid) is
  'The caller may add a note to this pair now: owner or notes assistant, and the owner accepted the trainer agreement.';
revoke all on function public.coaching_notes_writable(uuid) from public, anon;
grant execute on function public.coaching_notes_writable(uuid) to authenticated;
