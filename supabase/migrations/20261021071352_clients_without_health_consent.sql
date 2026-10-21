-- Which of the trainer's clients have not given the health data consent (право 3): the group page marks them, so the
-- trainer knows why their goal, nutrition and progress are missing from the group. Whether a consent was given is not
-- itself health data; the rule is private.health_allowed (20261021003917_health_consent_rls.sql), so a client card
-- without an account counts as allowed. Only the caller's own trial and active pairs, as coaching ids.

create function public.my_clients_without_health_consent()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.coachings c
  where c.trainer_id = (select auth.uid())
    and c.status in ('trial', 'active')
    and not private.health_allowed(c.client_id);
$$;

comment on function public.my_clients_without_health_consent() is
  'Coaching ids of the caller''s trial and active pairs whose client has no health data consent in force.';
revoke all on function public.my_clients_without_health_consent() from public, anon;
grant execute on function public.my_clients_without_health_consent() to authenticated;
