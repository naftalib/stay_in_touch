# Realtime repair over the session pooler

**Date:** 2026-11-19

## Goal

Handoff 09: the first hosted deploy's Realtime policy repair connected to the IPv6-only direct database host and failed on a GitHub runner. Make the repair use the IPv4 Supavisor session pooler, keep it safe to re-run on the half-migrated test project, and record what was verified.

## Models

- **Builder:** Grok 4.7
- **Reviewer:** not run in this handoff

## PR

https://github.com/naftalib/stay_in_touch/pull/9 on `cursor/realtime-pooler-repair-d009`.

## What was built

- `hosted_psql` connects as `postgres.<ref>` to the shared pooler on port 5432 with `sslmode=require`. The host comes from `supabase/.temp/pooler-url` after `supabase link`. The Management API pooler config is the fallback. The region is not turned into a hostname. The password and the access token stay off the command line and out of the log.
- The Realtime repair still applies `scripts/deploy/realtime-policy.sql`, marks `20261112160007` applied, and pushes again. The SQL refuses a session that is not `postgres`, then drops and recreates the viewer policy in one transaction.
- Ops CI tests the host derivation and the repair command with fakes. No real network. The local `db push` path does not open a hosted connection.
- Runbook step 6, ADR 0111, and the architecture deployment section describe the pooler. ADR 0033 keeps the local `dblink` path.

## Review findings and how each was resolved

Not yet. No review has run on this handoff.

## Deviations from the plan and why

- The pooler change is in `hosted_psql`, so backup, hosted setup, the storage check, and restore use it too. Those callers hit the same direct host. The storage-check step now has the access token so the API fallback can run when the cache file is missing.
- Migration `20261112160007` was not edited. It is already applied on local databases. The hosted failure is the migration's own closed path, and the supported `create policy` statement is the repair file. See ADR 0111.

## Open questions and decisions made

- Why `pg_has_role(current_user, 'supabase_realtime_admin', 'member')` was false: hosted `postgres` is not a member of that role and is not a superuser. Supabase documents that the membership is reserved. The failed deploy's CLI line was `user=postgres.<ref>`, and the workflow sets `SUPABASE_DB_PASSWORD`, so the session was the password path. `cli_login_postgres` is used when the password is unset. Either role fails the migration's check. `supautils` grants policy creation to the role name `postgres`, which is why the repair connects as that role and refuses any other. ADR 0111.
- The pooler login's database role, and whether `create policy` succeeds on this project, are not confirmed until the test-project re-run.

## Follow-ups carried forward

- Re-run Deploy on the half-migrated test project and confirm all 21 migrations are recorded and the viewer policy exists. If the repair fails, stop and do not approve production.
- The session-pooler repair, backup, restore, and storage check have not been executed against a hosted project.
- Items still open from build log 08 are unchanged, including the phone checks, a live Gmail send, and Content-Security-Policy.

## Versions

- Supabase CLI 3.1.0, the version the deploy workflow pins
- Docs checked 2026-11-19: connecting to Postgres, Realtime authorization, the Realtime "must be owner of table messages" page, and `GET /v1/projects/{ref}/config/database/pooler`
