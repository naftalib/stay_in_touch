# Signed upload links

## Context
The browser must not hold the service-role key, and there are no client policies on `storage.objects`.

## Options considered
- The Edge Function accepts the bytes and writes them with the service key.
- The function reserves a row, then returns a short-lived signed upload URL. The browser PUTs the JPEG itself.

## Decision
`media-upload-url` calls `reserve_photo_upload` as the signed-in user, then returns signed PUT targets for the original and the thumbnail. The service-role key stays inside the storage module. Signed URLs are rewritten to `MEDIA_PUBLIC_BASE_URL` and never returned as `kong:8000`.

## Consequences
Local observation (15 Nov 2026, storage-api v1.90.1): the upload token is a JWT in the query string, valid for 7200 seconds (2 hours). A raw PUT with `content-type: image/jpeg`, `cache-control: max-age=31536000`, and `x-upsert: false` returns 200 and a JSON body naming the object key. The link cannot be revoked before it expires. Each link is for one reserved path.

## Status
Accepted

## Date
2026-11-15
