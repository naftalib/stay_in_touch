# Deleted message placeholder in UI

## Context
Soft-deleted rows remain readable to authors and admins under RLS.

## Options considered
- Show placeholder only when SELECT still returns the row (ADR 0021).
- Tombstone RPC so every viewer sees "Message deleted".

## Decision
**Option A:** render "Message deleted" when the row is present with `deleted_at`; absent rows disappear.

## Consequences
No database change; matches 0021.

## Status
Accepted

## Date
2026-11-12
