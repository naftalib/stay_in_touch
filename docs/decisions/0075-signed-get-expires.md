# Signed photo GETs are cached with Expires

## Context
Uploads send `cache-control: max-age=31536000`, and storage-api stores that on the object. A signed GET on storage-api v1.90.1 does not send `Cache-Control`. Repeat views were thought to ignore the cache and spend egress every time.

## Options considered
- Proxy the bytes through an Edge Function so the function can set `Cache-Control`. That spends the egress twice.
- Cache the bytes in the browser under a stable media id. The signed response allows cross-origin reads, but a long-lived cache would keep a photo after the one-hour link the spec allows a removed member.
- Keep reusing each signed URL for its lifetime, and record the header the server actually sends.

## Decision
Do not proxy and do not keep a second cache. storage-api's signed route (`getSignedObject`) passes the token expiry into the renderer as `Expires` and does not copy `metadata.cacheControl`. A probe on 15 Nov 2026 showed `Expires` one hour after `Date`, and no `Cache-Control`. The client already reuses the URL for 50 minutes, which is inside that window, so a repeat view of the same URL is a browser cache hit. A new signature is a new cache key. The object's year-long `cacheControl` cannot be reused across signatures because the token is part of the URL.

## Consequences
Repeat views during the reused URL do not download the bytes again. Refreshing the signature, or opening the photo in a new session, does. The upload still stores `max-age=31536000` for a future store that echoes it.

## Status
Accepted

## Date
2026-11-15
