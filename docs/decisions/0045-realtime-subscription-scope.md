# Realtime subscription per viewable space

## Context
Unread badges and open thread need timely updates without trusting broadcast bodies.

## Options considered
- Subscribe to every viewable space in the family (~8 topics).
- Subscribe only to the open space; poll unread elsewhere.

## Decision
**Subscribe to all viewable spaces** in the active family; refetch message rows by id from broadcasts.

## Consequences
Debounced unread invalidation; reconnect refetch of newest page.

## Status
Accepted

## Date
2026-11-12
