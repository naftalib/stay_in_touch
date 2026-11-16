# Every production backup waits for the production reviewer

## Context
A backup downloads password hashes. A scheduled job that used its own environment could run with no reviewer. Naftali decided on 17 Nov 2026 that this must not happen. (The handoff was implemented on 16 Nov; the decision date is the one he set.)

## Options considered
- A `production-backup` environment with no required reviewer, so the monthly job never waits.
- The existing `production` environment, required reviewer `naftalib`, for every backup including the monthly one.

## Decision
`backup.yml` uses `environment: production` for the monthly schedule, for `workflow_dispatch`, and for the reusable call from the deploy workflow. There is no reviewer-less backup environment. GitHub emails the reviewer when the monthly job is waiting.

## Consequences
The monthly backup does not run until Naftali approves it. A production deploy asks twice, because the backup and the deploy job each use that environment. The storage check runs inside the same job, after that approval.

## Status
Accepted

## Date
2026-11-17
