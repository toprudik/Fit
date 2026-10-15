# 1. Supabase as the backend

- Status: accepted
- Date: 2026-10-12

## Context

Fit is a new web application deployed on Vercel. It needs a Postgres database, user authentication and file storage without running our own servers.

## Decision

Use Supabase (Postgres, Auth, Storage) as the backend.

- Project: `fit` (ref `zxwabddqqtitybtsdeqp`), organization Strax, region `us-east-1`, the same region as Vercel's default functions, to keep latency low.
- API URL: `https://zxwabddqqtitybtsdeqp.supabase.co`.
- Clients use the **publishable key** (`sb_publishable_...`), not the legacy `anon` JWT key.
- The secret / service-role key is server-only: it lives in Vercel environment variables and local `.env.local`, never in the repo or in client bundles.
- Every table in exposed schemas has Row Level Security enabled with explicit policies.
- Schema changes go through versioned migrations (`supabase/migrations/`), not ad-hoc edits in the dashboard.

## Consequences

- Auth, database and storage come from one provider; vendor lock-in is limited because the database is plain Postgres.
- RLS policies are part of the data model and must be reviewed with every schema change; run Supabase security advisors after DDL changes.
- Free-tier projects pause after a period of inactivity; upgrade before launch.
