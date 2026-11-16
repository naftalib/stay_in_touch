# Cache the app shell only

## Context
A family app must not keep message text, photos, or signed URLs in the Cache Storage after someone signs out or a link expires.

## Options considered
- Cache Supabase REST, Auth, Realtime, Functions, and Storage for offline reading.
- Precache only the built shell and fall back to `index.html` for navigations.

## Decision
Precache HTML, JS, CSS, fonts, and icons. Never cache Supabase REST, RPC, Auth, Realtime, Functions, or Storage. Navigation falls back to `index.html`, excluding `/auth/`, `/functions/`, `/rest/`, and `/storage/`. The lazy `heic-to` chunk is not precached.

## Consequences
Offline use is the shell and whatever the screen already loaded. Photos that need the HEIC decoder wait until the network is back.

## Status
Accepted

## Date
2026-11-16
