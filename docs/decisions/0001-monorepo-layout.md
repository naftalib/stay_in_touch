# One monorepo with strict top-level folders

## Context
Stay In Touch spans a web app, database, edge functions, future API, and docs. The team needs clear boundaries without splitting repos.

## Options considered
- One repository per component (web, database, API).
- A single monorepo with top-level folders: `web/`, `supabase/`, `supabase/functions/`, `api/`, `docs/`.

## Decision
Use one monorepo with strict top-level folders and per-folder Cursor rules for separation of concerns.

## Consequences
Schema, app, and tests can change atomically in one PR and one CI pipeline. Agent handoffs stay simpler. Folder rules carry the ownership model.

## Status
Accepted

## Date
2026-11-12
