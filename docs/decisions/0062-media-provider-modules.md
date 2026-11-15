# Storage provider modules

## Context
The prototype uses Supabase Storage. A later move to R2 or B2 should not rewrite the upload functions.

## Options considered
- Call the Supabase Storage API directly from each function.
- One module per provider, chosen by `MEDIA_PROVIDER`.

## Decision
`getMediaStore()` reads `MEDIA_PROVIDER`. `supabase` is implemented and covered end to end. `r2` and `b2` share `s3.ts` (path-style URLs, `aws4fetch` 1.0.20). A missing or unknown provider throws. There is no silent fallback.

## Consequences
The S3 module is unit-tested only. It is untested against a real bucket. R2 and B2 still need their own CORS rules before a switch (see hosted settings).

## Status
Accepted

## Date
2026-11-15
