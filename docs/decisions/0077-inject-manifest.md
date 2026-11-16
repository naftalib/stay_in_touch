# Service worker via injectManifest

## Context
The app needs its own push and notification-click handlers. A generated service worker cannot hold that code, and a hand-written precache list would drift from every Vite build.

## Options considered
- `vite-plugin-pwa` `generateSW`.
- A hand-written precache list.
- `vite-plugin-pwa` 2.x `injectManifest` with `web/src/sw.ts` and Workbox 7.

## Decision
Use `injectManifest`. Workbox injects the precache manifest into our service worker. `injectRegister` is null and `devOptions.enabled` is false, so `pnpm dev` does not register a worker.

## Consequences
Push, click, and the navigation fallback live in one TypeScript worker. Production and the PWA Playwright run use `pnpm preview`.

## Status
Accepted

## Date
2026-11-16
