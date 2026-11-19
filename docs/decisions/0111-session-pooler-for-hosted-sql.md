# Hosted SQL uses the Supavisor session pooler

## Context
The first deploy to the hosted test project applied migrations `20261112160000` through `20261112160006`. `20261112160007_realtime_policy.sql` then failed closed, and the repair connected to `db.<ref>.supabase.co:5432`. That connection ended with "Network is unreachable". Supabase documents the direct host as IPv6-only on the free plan. GitHub-hosted runners have no IPv6. The CLI itself had connected through the shared pooler (`host=aws-1-<region>.pooler.supabase.com`, `user=postgres.<ref>`), which is IPv4 on every plan.

The same `hosted_psql` helper is used for the Realtime repair, backup, hosted setup, the storage check, and restore. Leaving those on the direct host would fail the same way on a GitHub runner.

## Options considered
- Keep the direct host and enable the paid IPv4 add-on. The project stays on the free plan.
- Build `aws-<index>-<region>.pooler.supabase.com` from the project's region. Supabase documents that the index is a cluster index, and one region can have more than one, so the region is not a hostname.
- Read `supabase/.temp/pooler-url`, the cache `supabase link` writes, and use it as the connection string. That file is the host the CLI just used. It is also an unstable cache: some CLI versions store port 6543 and `[YOUR-PASSWORD]`, and later versions rewrite it to port 5432 and strip the password. `--skip-pooler` removes it.
- Call `GET /v1/projects/{ref}/config/database/pooler` and use `connection_string`. The documented response includes `db_host`, `pool_mode`, and `database_type`. `connection_string` embeds a password placeholder, so it cannot be passed to `psql` or written to a log.

## Decision
Hosted `psql` connects through the Supavisor session pooler: port 5432, user `postgres.<project ref>`, `sslmode=require`, password in `PGPASSWORD`. The hostname is taken from `supabase/.temp/pooler-url` when that host ends in `.pooler.supabase.com`. Tests point `SUPABASE_POOLER_URL_FILE` at a fixture. If the file is missing or the host is not the shared pooler, the script calls the Management API and uses `db_host` from the primary session entry, or from the primary entry when the API lists only transaction mode. Session and transaction mode share a host; the port selects the mode, so a transaction-mode `db_port` of 6543 is not used. Read replicas are ignored. `connection_string` is ignored. The access token is passed to `curl` in a config file that is deleted, not on the command line. The script does not enable xtrace.

The Realtime repair stays outside migration `20261112160007`. That file is already applied on local databases. On the host it fails closed, which is what the first deploy did. The role check in that migration is false for hosted `postgres`: it is not a superuser, and `supabase_realtime_admin` membership is reserved (`grant` is refused). The deploy sets `SUPABASE_DB_PASSWORD`, and the CLI logged `user=postgres.<ref>`, so this failure was the password path. `cli_login_postgres` is the role the CLI creates when the password is unset. It is a member of `postgres`, and `supautils` policy grants are named for `postgres`, so that role would also be unable to create the policy. The supported statement is `create policy` / `drop policy` as `postgres`, which is `scripts/deploy/realtime-policy.sql`. It refuses any session whose `session_user` or `current_user` is not `postgres`, then drops and recreates the policy in one transaction. `supabase migration repair` marks `20261112160007` applied, and `db push` runs again. Migration `20261116200000` creates the same policy only when it is missing, so it is a no-op after the repair.

## What was verified, and what was not
Verified from Supabase's current docs (connecting to Postgres, Realtime authorization, the "must be owner of table messages" troubleshooting page, and the pooler Management API): the direct host is IPv6 on the free plan; the shared pooler is IPv4; session mode is port 5432 and user `postgres.<ref>`; `postgres` can create and drop policies on `realtime.messages` through `supautils` and cannot `alter table` or assume `supabase_realtime_admin`; `db push` with a database password connects as `postgres`.

Verified in CI with fakes and no network: host parsing (including a password that contains `@`), rejection of the direct host, file-over-API preference, session primary over a replica and a transaction primary, forcing port 5432, the repair command `supabase migration repair 20261112160007 --status applied --remote --yes`, and the absence of the password, the access token, and `connection_string` from the command and the log. A local `db push` failure does not open a hosted connection.

Not executed against the test project: the session-pooler repair, `current_user` during that repair, and the rest of the 21 migrations on the half-migrated database. The re-run has to confirm that the pooler login is the database role `postgres` and that `create policy` succeeds there.

## Consequences
ADR 0033 still describes the local `dblink` path. A half-migrated database (versions `20261112160000`–`20261112160006` recorded, `20261112160007` not recorded) is the case the repair handles. Re-running Deploy applies the policy, records that version, and pushes the remaining migrations. Backup, hosted setup, the storage check, and restore use the same session pooler. The storage-check step has the access token so the API fallback works when the cache file is missing.

## Status
Accepted

## Date
2026-11-19
