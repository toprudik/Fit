# 8. Pass balances and debt come from an append-only ledger

- Status: accepted
- Date: 2026-10-13

Sessions remaining, debt and earned revenue are **derived from an append-only `ledger_entries` journal** (grant, charge, waiver, settlement, refund, adjustment) instead of mutable counters on passes. Late cancellations, no-shows, waivers, freezes, expiries and debt settlement all touch the same numbers; counters drift and cannot explain themselves to a trainer disputing a balance, while a ledger is auditable ("why do I have 3 left?") and makes analytics exact. Entries are never updated or deleted. A mistake is reversed with a new entry. Money is stored as integer minor units with an ISO currency; amounts in different currencies are never summed. Rules mapping booking events to entries are in `docs/architecture/data-model.md`.
