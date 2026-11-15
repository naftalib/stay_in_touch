# Realtime payloads carry ids only

## Context
Broadcasts used to be able to include message text. A socket that was already open should not receive the body after someone loses access.

## Options considered
- Keep sending the row and rely on the select policy.
- Send only the ids and let the client refetch under RLS.

## Decision
`private.broadcast_space_change` calls `realtime.send` with `table`, `operation`, and `record: { id, space_id }` on `space:<space_id>`, private. The client still reads `record.id` and refetches. A `media` notice also refreshes the Pics query for that space.

## Consequences
`realtime.send` also adds its own top-level `id` for the broadcast row. The record itself has only `id` and `space_id`. pgTAP 10 and 94 assert that shape. Body, caption, and object keys are not in the payload.

## Status
Accepted

## Date
2026-11-15
