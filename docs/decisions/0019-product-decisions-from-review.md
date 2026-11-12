# Four product decisions from PR #1 review

## Context
The independent review surfaced gaps between schema behavior and family product intent.

## Decision
1. **Archived spaces** stay visible and are read-only for everyone (including admin) until `unarchive_space`.
2. **Unread counts**: one message plus attached media = one item; standalone media = one item; soft-deleted message drops the item.
3. **+alias child** is a separate login; parent cannot accept child's invite while signed in as parent.
4. **Deleted text** visible only to author and admins; Realtime payloads omit sensitive fields so others refetch under RLS.

Hosted **JWT expiry** should be shorter than the local default hour — see [`docs/hosted-settings.md`](../hosted-settings.md).

## Consequences
Implemented in migrations and `supabase/tests/database/12_product_decisions.sql`. Build log [01](../build-log/01-repo-skeleton-and-database.md) records the review narrative.

## Status
Accepted

## Date
2026-11-12
