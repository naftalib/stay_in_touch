# The photos bucket is created by a migration

## Context
The bucket has to exist locally, in the CI database job, in the CI end-to-end job, and on a future hosted project.

## Options considered
- `[storage.buckets.photos]` in `config.toml`, which applies only to the local CLI.
- An insert into `storage.buckets` in a migration, which also runs on hosted.

## Decision
Migration `20261115201000_photos.sql` inserts the private `photos` bucket (5 MB, `image/jpeg`) when `storage.buckets` exists, and fails the migration if the storage schema is missing. CI starts `storage-api` for the database job and the end-to-end job. `imgproxy` stays excluded. There are no policies on `storage.objects` for this bucket.

## Consequences
Hosted deploys get the bucket from the migration. The database job must keep `storage-api` running. `anon` and `authenticated` have table grants from the storage schema and no policies, so RLS hides every row. Direct deletes are also rejected by `storage.protect_delete`.

## Status
Accepted

## Date
2026-11-15
