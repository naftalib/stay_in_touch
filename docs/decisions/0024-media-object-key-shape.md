# R2 key shape without PII

## Decision
Store keys only, shape `f/{family}/s/{space}/{media}/original.{ext}` and `thumb.jpg`. URLs expire and must not embed names or emails. `provider` includes `mux`.

## Consequences
Signing happens later at the Edge Function. No URLs in the database.

## Status
Accepted

## Date
2026-11-12
