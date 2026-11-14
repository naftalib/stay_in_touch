# Broadcast trigger function in private

## Context
Live updates must respect space visibility without exposing rows through a public RPC.

## Options considered
- **Chosen:** Postgres trigger calling `realtime.broadcast_changes` on private topics (payload minimized over time).
- **Alternative:** Supabase Postgres Changes subscriptions on `messages`/`media` tables.

## Decision
The function that calls `realtime.broadcast_changes()` lives in `private`, not `public`.

## Consequences
A public function would appear as a Data API endpoint.

## Status
Accepted

## Date
2026-11-12
