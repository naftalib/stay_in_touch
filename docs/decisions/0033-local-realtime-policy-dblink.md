# Local Realtime policy via dblink

## Decision
Local Realtime select policy is installed via `dblink` inside the migration transaction, then the extension is dropped. Hosted `postgres` is not a superuser; deploy path requires a role that can assume `supabase_realtime_admin`.

## Consequences
See migration `20261112160007_realtime_policy.sql` and [`docs/hosted-settings.md`](../hosted-settings.md).

## Status
Accepted

## Date
2026-11-12
