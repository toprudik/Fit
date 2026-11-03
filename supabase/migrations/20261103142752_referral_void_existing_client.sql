-- A friend who came by «Приведи друга» and turned out to be the trainer's client already, kept as a card, is not a
-- new client: once the trainer merges them («Объединить»), the invite is void with this reason (Rudik, 03.11).
alter type public.referral_void_reason add value 'existing_client';
