# 7. All personal data is scoped to a coaching pair and gated by the client

- Status: accepted
- Date: 2026-10-13

A client can train with several trainers, a trainer can be someone's client, and admins run the platform. To keep this safe by construction, everything personal lives inside a **pair** (`coaching`) and is enforced in Postgres RLS, not only in the UI:

- A trainer sees only their own pairs. Delegated trainers (assistant/substitute) see only what the delegation scope allows.
- Per pair the client controls **data shares**: nutrition, measurements, steps/activity, self-logged workouts (default on), **progress photos (default off)** and **intake (default off)**. Intake is health data: a trainer never sees the intake of someone who is not their client, and within a pair only after the client explicitly allows it in a consent step shown when the pair is created (no pre-selected answer); the client can change it per trainer later.
- Trainer notes are hidden from the client unless the trainer marks them visible.
- **Admins cannot read client personal data** (nutrition, measurements, photos, intake). Admin analytics read only aggregates. Emergency access is a time-limited, reason-required, audit-logged "break-glass" function that also notifies the user; it has no UI in the beta.

Helper predicates (`is_coaching_trainer`, `can_view(client, category)`, …) are `SECURITY DEFINER` with an empty `search_path`. Every privacy rule has an RLS isolation test. See `docs/architecture/data-model.md`.
