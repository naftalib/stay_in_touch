# authenticated may execute policy helpers

## Decision
`authenticated` may execute helpers policies call; `anon` may not.

## Consequences
Policies run as the caller; Postgres requires `EXECUTE`. Helpers return only the caller's rows.

## Status
Accepted

## Date
2026-11-12
