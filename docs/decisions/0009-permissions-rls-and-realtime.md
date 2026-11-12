# RLS on live membership, Realtime broadcast

## Context
Roles can change while JWTs remain valid. Realtime must scale without exposing other families' data.

## Options considered
- Encode permissions in JWT custom claims.
- Enforce via RLS against `family_members`; Realtime via `realtime.broadcast_changes()` from database triggers on private `space:<id>` channels.

## Decision
Permissions from the live membership table, not JWT claims. Realtime uses broadcast-from-database triggers; clients use private channels and `setAuth()`.

## Consequences
Removal takes effect immediately for REST. Realtime authorizes at subscribe time until token refresh — see architecture and hosted JWT guidance.

## Status
Accepted

## Date
2026-11-12
