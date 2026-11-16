# PushSender in front of @negrel/webpush

## Context
The Edge Function runs on Deno. The npm `web-push` package is a poor fit there. `@negrel/webpush` is built for Web Crypto and has no formal crypto audit.

## Options considered
- Call `@negrel/webpush` from the handler.
- A `PushSender` interface with `webpush` and `capture` transports.

## Decision
`getPushSender` selects the transport from `PUSH_TRANSPORT`. `webpush` signs with `@negrel/webpush`. `capture` records the payload for tests and local runs. Missing or unknown transport throws. The interface is the place to swap in another library.

## Consequences
Tests never open a network connection to a push service. Rotating the VAPID pair still invalidates every subscription, whichever library signs.

## Status
Accepted

## Date
2026-11-16
