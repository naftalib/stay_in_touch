# Staged rollout and rollback

## Context
The first real users are Naftali's family. A bad install or a bad migration should have a known way back.

## Options considered
- Invite everyone on the first day.
- Household, then grandparents (with someone present for the first install), then children.
- Treat a database restore as the normal undo.

## Decision
Roll out in that order. Feedback comes back on WhatsApp. There is no in-app feedback button in this handoff. Rollback is: Cloudflare "Rollback to previous version" for the Worker, fix-forward for a migration, and a database restore only as a last resort. Production data is never restored into the test project.

## Consequences
Grandparents get a person beside them for the first Add to Home Screen. A restore does not bring photo bytes back and does not restore Vault secrets.

## Status
Accepted

## Date
2026-11-16
