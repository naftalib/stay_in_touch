# Committed Supabase generated types

## Context
Web typecheck in CI must not require a running database for every job.

## Options considered
- Commit `database.types.ts` + CI drift check.
- Generate only at build time.
- Hand-written types.

## Decision
**Commit `web/src/lib/database.types.ts`** from `pnpm db:types`; E2E job fails on drift.

## Consequences
Editors work offline; migrations must regenerate types.

## Status
Accepted

## Date
2026-11-12
