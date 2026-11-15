# Pending photos record the configured provider

## Context
`reserve_photo_upload` inserted pending rows with `provider = 'r2'`. This prototype stores bytes in Supabase Storage. `mark_media_ready` rewrote the provider only after a successful finish, so every in-progress upload claimed to live on R2.

## Options considered
- Leave `r2` until finish, because the client insert trigger still assigns `r2` before it rejects the insert.
- Default the column and the reservation to `supabase`.
- Pass `MEDIA_PROVIDER` from `media-upload-url` into the reservation, and reject anything other than `supabase`, `r2`, or `b2`.

## Decision
The column default is `supabase`. `reserve_photo_upload` takes `p_provider` (default `supabase`) and stores that value on the pending row. `media-upload-url` passes the configured `MEDIA_PROVIDER`. `mark_media_ready` still writes the provider that actually accepted the bytes. Direct client inserts stay rejected.

## Consequences
A pending row names the store the signed upload is using. A direct RPC call can pass another allowed provider; finish overwrites it with the store that held the objects. `mux` is not a photo provider.

## Status
Accepted

## Date
2026-11-15
