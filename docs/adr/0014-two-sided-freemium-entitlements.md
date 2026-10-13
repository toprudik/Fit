# 14. Two-sided freemium on one entitlement system; admin grants during the beta

- Status: accepted
- Date: 2026-10-13

DaFit charges both sides: trainers (Free up to 3 clients / Pro) and clients (Free / Premium), with everything tied to working with a trainer free for the client, and clients of a Pro trainer inheriting the Premium features that trainer uses with them (decisions Q55–Q59). Instead of scattering plan checks, there is **one entitlement system from day one**: `plans`, `plan_grants` (admin-issued with optional expiry and a required reason now; purchases later) and a single check `has_entitlement(user, feature[, pair])` used both by the UI and by the database (RLS/RPC). Limits such as "3 clients on Free" are enforced inside the DB functions that create pairs and managed-client cards, so they cannot be bypassed from the client.

Plans and limits are **enforced in the beta, but there is no purchase flow**: admins grant Pro/Premium from the admin panel (audit-logged, user notified), and locked features offer «Запросить доступ» without prices. This lets us test the paywall boundaries with real users; turning on payments later is adding a grant source, not rewriting features.

Access, verification and plan are **independent axes** for a trainer: the trainer zone opens immediately on any valid invite; verification only gates the badge, catalog/map listing and ratings; a rejected trainer keeps access and may be on Pro.
