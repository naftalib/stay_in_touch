# Content-Security-Policy is deferred

## Context
The shell should send a Content-Security-Policy. A useful policy has to name the Supabase origin, and that origin is different for test and production. A wrong policy breaks the app, Realtime (`wss`), and signed Storage URLs.

## Options considered
- Bake a policy into `_headers` now, with the origin from the build.
- Ship the other security headers now and add the policy after the first hosted deploy is watched.

## Decision
`web/public/_headers` sets `X-Content-Type-Options`, `Referrer-Policy`, and a Permissions-Policy that denies camera, microphone, and geolocation and does not mention notifications. It does not set Content-Security-Policy.

## Consequences
The follow-up is a policy generated at build time for that environment, checked against the local app and the hosted project before it is required.

## Status
Accepted

## Date
2026-11-16
