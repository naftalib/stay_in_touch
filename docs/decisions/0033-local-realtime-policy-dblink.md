# Local Realtime policy via dblink

## Decision
Local Realtime select policy is installed via `dblink` inside the migration transaction, then the extension is dropped. Hosted `postgres` is not a superuser.

## Update (2026-11-19)
Hosted `postgres` cannot assume `supabase_realtime_admin`. The hosted repair is [ADR 0111](./0111-session-pooler-for-hosted-sql.md). This ADR still covers the local migration.

## Consequences
See migration `20261112160007_realtime_policy.sql` and [`docs/hosted-settings.md`](../hosted-settings.md).

## Status
Accepted. The hosted path was refined by ADR 0111. The local `dblink` path is unchanged.

## Date
2026-11-12
