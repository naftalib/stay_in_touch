# A shared device follows the signed-in person

## Context
One browser can be used by more than one person. An endpoint is unique, so the previous owner's row would keep receiving the next person's family posts.

## Options considered
- Reject registration when the endpoint already belongs to someone else.
- `register_push_subscription` updates that endpoint and sets `user_id` to `auth.uid()`.

## Decision
The upsert moves ownership, clears `disabled_at` and `failure_count`, and returns the row id. Unregister deletes only the caller's row. Sign-out calls unregister for the current endpoint.

## Consequences
Mom signing out and Noa signing in on the same browser leaves one row, owned by Noa. The previous person's pushes stop.

## Status
Accepted

## Date
2026-11-16
