# Soft-deleted unposted photos are orphans

## Context
A member can set `deleted_at` on a pending upload. The daily job only selected rows with `deleted_at` null, so that row kept its reserved bytes in the 800 MB cap forever. Attached photos are different: an admin can restore them, and their objects stay on purpose.

## Options considered
- Ignore `deleted_at` and keep every soft-deleted row until a later hard purge.
- Stop counting soft-deleted pending rows immediately, and leave the objects until a purge.
- Treat a soft-deleted row with no message as an orphan after 24 hours, and keep soft-deleted rows that are still attached.

## Decision
`list_photo_orphans` includes pending, failed, and unattached ready rows older than 24 hours, and also soft-deleted rows older than 24 hours whose `message_id` is null. `media-cleanup` still removes the objects through the Storage API before deleting the rows. Attached rows, including soft-deleted ones, are kept.

## Consequences
An abandoned upload cannot pin the cap after the daily job. Restoring a posted photo still works. Until the job runs, a soft-deleted pending row still counts, because the objects may still be there.

## Status
Accepted

## Date
2026-11-15
