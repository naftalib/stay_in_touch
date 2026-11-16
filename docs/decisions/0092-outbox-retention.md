# Keep finished outbox rows for seven days

## Context
`notification_outbox` is the send log. It must not grow without a bound, and it must not drop rows that are still pending.

## Options considered
- Delete every row as soon as it is sent.
- Delete `sent`, `skipped`, and `failed` rows older than 7 days. Leave `pending`.

## Decision
`prune_notification_outbox` deletes finished rows older than 7 days. The one-minute sweep calls it. Pending rows stay until they are sent, skipped, or failed.

## Consequences
A week of send history is available for debugging. The table is not granted to `anon` or `authenticated`.

## Status
Accepted

## Date
2026-11-16
