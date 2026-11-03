-- «Команда» kept a substitute alive after its session: a pending one said «Ждёт ответа» with «Отозвать» forever
-- once the session had begun, and an accepted one for a cancelled session said «Действует» until the old end
-- (QA bug 34). my_delegations now shows both as ended. Body of 20261017090713_delegations.sql otherwise.

create or replace function public.my_delegations()
returns table (
  id uuid, side text, kind public.delegation_kind, status public.delegation_status, other_id uuid, other_name text,
  session_id uuid, session_starts_at timestamptz, scopes public.delegation_scope[], all_clients boolean,
  clients integer, starts_at timestamptz, ends_at timestamptz, accepted_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id,
         case when d.owner_trainer_id = auth.uid() then 'owner' else 'delegate' end,
         d.kind,
         case when d.status = 'active' and ((d.ends_at is not null and d.ends_at <= pg_catalog.now())
                                            or (d.kind = 'substitute' and (s.ends_at <= pg_catalog.now()
                                                                           or s.status = 'cancelled')))
                then 'expired'::public.delegation_status
              -- Nobody can take a substitute any more once its session has begun or was cancelled.
              when d.status = 'pending' and d.kind = 'substitute'
                   and (s.starts_at <= pg_catalog.now() or s.status = 'cancelled')
                then 'expired'::public.delegation_status
              else d.status end,
         case when d.owner_trainer_id = auth.uid() then d.delegate_trainer_id else d.owner_trainer_id end,
         case when d.owner_trainer_id = auth.uid() then private.delegation_person(d.delegate_trainer_id)
              else private.delegation_person(d.owner_trainer_id) end,
         d.session_id, s.starts_at, d.scopes, d.all_clients,
         (select pg_catalog.count(*)::integer from public.delegation_clients dc where dc.delegation_id = d.id),
         d.starts_at, d.ends_at, d.accepted_at, d.created_at
  from public.delegations d
  left join public.sessions s on s.id = d.session_id
  where auth.uid() is not null
    and (d.owner_trainer_id = auth.uid() or (d.delegate_trainer_id = auth.uid() and d.status <> 'pending'))
  order by d.created_at desc
$$;

