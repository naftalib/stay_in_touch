# Storage watch at 80 percent, not on the admin page

## Context
The app stops photo uploads at 800 MB (`private.photo_storage_cap_bytes()`). The free database is 500 MB. Naftali needs a warning before either limit, without putting every family's usage on the family admin page.

## Options considered
- Show the total on the family admin page.
- A script that prints percentages only and fails at 80 percent, run from the monthly backup.
- A paid usage alert.

## Decision
`scripts/storage-check.sh` prints `photo_storage_percent` and `database_percent` and exits non-zero when either is 80 or above. It does not print family names or ids. The monthly backup workflow runs it after the production reviewer approves that job, so a failure emails Naftali. The database cap override works only when `STORAGE_CHECK_ALLOW_CAP_OVERRIDE=1`, which the workflow does not set.

## Consequences
The check is the all-families total, not one family. Local fixtures prove 79 percent passes and 81 percent fails.

## Status
Accepted

## Date
2026-11-16
