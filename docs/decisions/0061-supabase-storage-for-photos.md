# Supabase Storage for prototype photos

## Context
Family photos need a private bucket before anyone has a card on file. ADR 0006 chose Cloudflare R2. R2 needs a Cloudflare account and has no spending cap. Backblaze B2 has a free 10 GB tier. Supabase Storage is already in the local CLI.

## Options considered
- Supabase Storage Free: 1 GB storage and 5 GB egress shared with the rest of the project, 50 MB max file, no image transformations, no card. Staying over quota can restrict the whole project.
- Backblaze B2: 10 GB free, no card, its own CORS format.
- Cloudflare R2: no egress fee, needs a card, no spending cap.

## Decision
Prototype photos live in a private Supabase Storage bucket named `photos`. This supersedes ADR 0006 for the prototype only. The database still stores keys, never URLs. Moving to R2 or B2 later is a provider-setting change plus a one-time copy (ADR 0062).

## Consequences
No new account and no card. The app stops at 800 MB so it stays under the 1 GB free quota. Egress and the 7-day inactivity pause still apply to the whole project. Image transforms are not available, so the browser makes the JPEG and the thumbnail.

## Status
Accepted

## Date
2026-11-15
