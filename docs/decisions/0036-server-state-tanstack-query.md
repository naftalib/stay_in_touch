# TanStack Query for server state

## Context
Threads, nav, and unread badges need caching, infinite queries, and realtime merge.

## Options considered
- TanStack Query 5.
- Plain `supabase-js` hooks.
- SWR.

## Decision
**@tanstack/react-query 5.107.x** with devtools in development only.

## Consequences
Infinite scroll, dedupe, focus/reconnect refetch, `setQueryData` for broadcast refetch.

## Status
Accepted

## Date
2026-11-12
