# Fit

## Infrastructure

- **Hosting**: Vercel, team `rudiks-projects-1924b04c`. Project not created yet — create it and link `toprudik/Fit` once the app scaffold exists.
- **Backend**: Supabase project `fit` (ref `zxwabddqqtitybtsdeqp`, `us-east-1`). See `docs/adr/0001-supabase-backend.md`.
- **Env**: variable names in `.env.example`. Never read or commit `.env*.local`; the Supabase secret key is server-only.
- **Database rules**: RLS on every exposed table; schema changes only via migrations in `supabase/migrations/`; run Supabase security advisors after DDL changes.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `toprudik/fit`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.
