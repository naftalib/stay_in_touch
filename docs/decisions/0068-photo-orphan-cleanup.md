# Daily cleanup of unposted photos

## Context
A reserved photo that never becomes a post still holds a row and two objects.

## Options considered
- Leave them until a person deletes them.
- A daily job deletes pending, failed, and unattached ready photos older than 24 hours.

## Decision
`list_photo_orphans` selects those rows. `media-cleanup` deletes the objects through the Storage API, then `delete_photo_orphan_rows` removes the rows. Soft-deleted photos that are still attached to a message are kept so an admin can restore them. The function refuses calls that do not send `x-media-cleanup-secret`. `verify_jwt` is off for that function. The secret is not in the repo.

## Consequences
A photo left in the composer overnight can disappear. Attached photos, including soft-deleted ones, stay. Hard-deleting soft-deleted objects is a follow-up.

## Status
Accepted

## Date
2026-11-15
