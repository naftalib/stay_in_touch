# FastAPI on Cloud Run in api/

## Context
Later AI features need Python and a separate compute surface.

## Options considered
- Implement AI in Edge Functions (Deno).
- FastAPI on Google Cloud Run in `api/` (owner knows Python; Python AI ecosystem).

## Decision
Reserve `api/` for a future FastAPI service. Folder is README-only for now.

## Consequences
No API code in this repo yet. Monorepo keeps the option open without blocking the Supabase prototype.

## Status
Accepted

## Date
2026-11-12
