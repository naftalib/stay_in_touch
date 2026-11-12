# private schema, security definer helpers

## Decision
Access helpers live in `private`, security definer, `search_path = ''`. Schema not in PostgREST `api.schemas`.

## Consequences
Avoids policy recursion; helpers are not Data API endpoints.

## Status
Accepted

## Date
2026-11-12
