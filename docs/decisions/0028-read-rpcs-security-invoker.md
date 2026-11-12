# Read RPCs as security invoker

## Decision
`space_audience`, `unread_counts`, and `mark_space_read` are security invoker.

## Consequences
RLS still governs rows returned. Privileged writes remain security definer.

## Status
Accepted

## Date
2026-11-12
