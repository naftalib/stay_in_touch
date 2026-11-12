# Cloudflare R2 and signed URLs

## Context
Family photos and video need object storage without egress-heavy bills.

## Options considered
- Supabase Storage only.
- Cloudflare R2 with keys in Postgres and short-lived signed URLs from an Edge Function after a permission check.

## Decision
R2 for media. Database stores object keys only. A future Edge Function mints signed URLs after RLS checks. Video processing via Mux or Cloudflare Stream later.

## Consequences
No egress fees on R2. Media upload flow is documented as future work in architecture. `provider` enum already includes `mux`.

## Status
Accepted (storage not wired yet)

## Date
2026-11-12
