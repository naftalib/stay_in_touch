# Two free Supabase projects

## Context
The family needs a place to try the hosted app before the real family is created. One project would mix test families with the real one.

## Options considered
- One Supabase project and a second family inside it.
- Two free projects, test and production, in a region near Israel.
- A paid project so leaked-password protection and longer backups are available.

## Decision
Create two free projects. Test is for plus-address trials and the restore drill. Production is the real family. Both stay on the free plan. The region is chosen at creation (Frankfurt is the example near Israel). Enable `pg_cron` and `pg_net` before the first `db push`.

## Consequences
Each project pauses after a week without activity. The one-minute push sweep is activity once Vault secrets exist. Free-plan quotas are shared inside each project. The same Gmail account may send for both. Test can use plus-addresses.

## Status
Accepted

## Date
2026-11-16
