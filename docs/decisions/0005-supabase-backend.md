# Supabase for prototype backend

## Context
The prototype needs Postgres, auth, RLS, Realtime, and TypeScript edge functions without running a custom backend fleet.

## Options considered
- Self-managed Postgres + custom auth.
- Supabase (managed Postgres, Auth, RLS, Realtime, Edge Functions).

## Decision
Supabase only for the prototype. Paid Supabase can cover the first scaled deployment.

## Consequences
See [`docs/architecture.md`](../architecture.md) for the current schema and access model. Edge Functions are not written yet.

## Status
Accepted

## Date
2026-11-12
