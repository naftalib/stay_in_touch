# Age-encrypted database backups

## Context
A free Supabase project can be paused or damaged. The dump contains `auth.users` password hashes, so it is a credential. Photo bytes live in Storage and are not inside the database dump.

## Options considered
- Unencrypted artifacts.
- `age` encryption to one recipient, 90-day artifact retention.
- Also copying Storage objects.

## Decision
`scripts/backup.sh` dumps roles, schema, and data (`--use-copy`, excluding vector tables when they exist). It encrypts with `age -r "$BACKUP_AGE_RECIPIENT"` and uploads only the `.tar.age` file. Plaintext is deleted before upload. `scripts/restore.sh` decrypts with `AGE_IDENTITY_FILE`, restores roles, then schema, then data in one transaction with `session_replication_role = replica`, unschedules copied cron jobs, and says to re-run hosted setup because Vault secrets are not in the dump. Production restore requires `--i-mean-production`. Production data is never restored into test.

## Consequences
The age secret key is kept in a password manager and offline. Losing it means the artifacts cannot be read. A database that already has the migrations answers `CREATE TYPE` with "already exists"; restore then loads data into those tables. Photo files are not in the backup.

## Status
Accepted

## Date
2026-11-16
