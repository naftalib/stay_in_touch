# Enqueue on insert, send immediately, sweep every minute

## Context
The post must succeed even when the push function is down. Leftover rows still need a retry.

## Options considered
- Send only from a cron sweep.
- An `AFTER INSERT` trigger that writes the outbox and calls `push-send` through `pg_net`, plus a one-minute `pg_cron` sweep. Both run only when Vault holds `push_send_secret` and `push_send_url` (the same gate as ADR 0073).

## Decision
The trigger enqueues, then asks `pg_net` to POST the function. Each of those steps is its own subtransaction, so a failure cannot roll back the message. The sweep claims pending rows with `FOR UPDATE SKIP LOCKED`, sends, and prunes. The secret is read from Vault at schedule time and is not written in the migration.

## Consequences
A local database without `pg_net` or those Vault secrets does not call the function on a timer. Tests call the enqueue and the function directly.

## Status
Accepted

## Date
2026-11-16
