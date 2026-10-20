-- Separate consents (legal product-changes А1, А2): the user agreement and the privacy policy, the consent to
-- process personal data and the consent on health data are each their own row in consents, plus the "I am 18"
-- confirmation, instead of the single beta_terms (152-FZ art. 9 part 1 as of 01.09.2025, art. 10 for health).
-- Each row keeps the sha256 of the exact text shown, so a later edit of a document under the same version is
-- still told apart. beta_terms stays as it is: its version 2026-11-beta is not re-asked.

alter type public.consent_kind add value if not exists 'terms';
alter type public.consent_kind add value if not exists 'pd_general';
alter type public.consent_kind add value if not exists 'pd_health';
alter type public.consent_kind add value if not exists 'age_confirmed';

alter table public.consents
  add column text_hash text constraint consents_text_hash_check check (text_hash ~ '^[0-9a-f]{64}$');

comment on column public.consents.text_hash is
  'sha256 (hex) of the document text the user accepted; null for beta_terms rows before this column and for '
  'age_confirmed, which is a statement rather than a document.';

-- The user writes the hash along with kind and version; accepted_at stays the insert time. Reading it back is not
-- needed and hashes stay unreadable to users (security sweep), so select becomes a column list.
grant insert (text_hash) on table public.consents to authenticated;
revoke select on table public.consents from authenticated;
grant select (id, user_id, kind, version, accepted_at, revoked_at) on table public.consents to authenticated;

comment on table public.consents is
  'A consent the user accepted, by text version and text hash: beta terms, user agreement, privacy policy, '
  'personal data, health data, the 18+ confirmation, contact sharing. A revocation only stamps revoked_at.';
