# Schedule orphan cleanup only when the secret is configured

## Context
Handoff 04 schedules invite cleanup with pg_cron when the extension exists. The photo job also needs a URL and a secret that must not be committed.

## Options considered
- Always schedule the job and embed a local secret in the migration.
- Schedule only when Vault already holds `media_cleanup_secret` and `media_cleanup_url`.

## Decision
The migration unschedules any previous `media-cleanup-daily` job, then schedules it only when `pg_cron`, `pg_net`, and both Vault secrets exist. Local and CI call the function directly with `MEDIA_CLEANUP_SECRET=local-cleanup-dev`. Hosted setup creates the two Vault secrets, then re-runs the schedule (see hosted settings). The secret value is never written into the repo.

## Consequences
A fresh local database does not call the function on a timer until those secrets are added. End-to-end tests invoke the function with the header, so the delete path is still covered.

## Status
Accepted

## Date
2026-11-15
