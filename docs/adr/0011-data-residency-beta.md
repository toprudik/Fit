# 11. Beta data lives in Supabase us-east-1; Russian data contour before an official Russian launch

- Status: accepted (risk knowingly accepted by the product owner)
- Date: 2026-10-13

Russian law 152-FZ requires personal data of Russian citizens to be first recorded in databases located in Russia. The closed beta (≈30 testers, mostly in Russia) runs on Supabase in the US with an explicit beta consent, because the beta budget is zero and the hosted stack (Supabase Auth, Storage, RLS) saves weeks. **This is a known compliance gap accepted by the product owner for a closed, non-public test.** Before any public launch to Russian users: a Russian data contour (e.g. Yandex Cloud / Selectel Postgres, with the app able to route a user's data by region), a lawyer's review, and updated consent/offer documents. Until then we minimise data (no phone numbers, blurred photos only) and keep the schema region-agnostic.
