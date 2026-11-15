# Photo limits

## Context
The free Storage quota is 1 GB for the whole project. One member should not be able to fill it, and one post should stay readable.

## Options considered
- No app limit, and rely on the platform quota.
- Per-file, per-post, per-member, and app-wide limits enforced in SQL.

## Decision
JPEG only, 5 MB per file (`5242880` bytes) on the bucket and in `reserve_photo_upload`. At most 10 photos on one post. At most 100 media rows per member per rolling 24 hours, counting pending, ready, and failed. An app-wide cap of 800 MB (`838860800`), stored in `private.app_limits`. Ready rows count `size_bytes + expected_thumb_bytes`. Pending rows count `expected_bytes + expected_thumb_bytes`. Failed rows do not count toward the cap. Soft-deleted rows still count, because the objects remain. `reserve_photo_upload` takes `pg_advisory_xact_lock(83427601)` so two reservations cannot both pass the cap.

## Consequences
The cap is deliberately under 1 GB. Raising it is a storage decision, not a constant tweak in the client. pgTAP checks the lock is held until the transaction ends. A separate test races two committed sessions against seed data (`101_photo_cap_race.sql`); the second call waits on the lock and then fails.

## Status
Accepted

## Date
2026-11-15
