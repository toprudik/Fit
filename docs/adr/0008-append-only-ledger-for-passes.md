# 8. Pass balances and debt come from an append-only ledger

- Status: accepted
- Date: 2026-10-13

Sessions remaining, debt and earned revenue are **derived from an append-only `ledger_entries` journal** (grant, charge, waiver, settlement, refund, adjustment) instead of mutable counters on passes. Late cancellations, no-shows, waivers, freezes, expiries and debt settlement all touch the same numbers; counters drift and cannot explain themselves to a trainer disputing a balance, while a ledger is auditable ("why do I have 3 left?") and makes analytics exact. Entries are never updated or deleted. A mistake is reversed with a new entry. Money is stored as integer minor units with an ISO currency; amounts in different currencies are never summed. Rules mapping booking events to entries are in `docs/architecture/data-model.md`.

## Amendment, 2026-10-15

The wave 1 schema refines "never updated or deleted" in two ways, both needed by decisions Q44 and O1 (data-model.md §2.1.0, R27 and R28):

- An entry keeps its content, but `client_id` and `coaching_id` move with the pair: account deletion reassigns the pair to the deleted-client stub, and merging a card into a real client moves the card's pair. `created_by` may only be cleared, when the author's account is deleted. Every other column is fixed.
- Entries leave only by cascade: when the pair or the trainer is deleted, or when the trainer deletes a pass that has nothing in the ledger but its own `grant` and no payment (the `grant` goes with it). A pass with any other entry is cancelled instead. Direct deletes and `truncate` are refused.

A trigger enforces this for every role, including RPCs. Changes to passes, freezes and payments, which users also write directly, are recorded with their author and reason in the append-only `money_events` table.
