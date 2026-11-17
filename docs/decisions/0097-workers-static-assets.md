# Workers static assets on a workers.dev address

## Context
ADR 0004 chose Cloudflare for the PWA and left the product (Pages or Workers) open. The app is a static Vite build plus a service worker. Preview URLs would be a second origin, which breaks an installed PWA and Web Push.

## Options considered
- Cloudflare Pages, as ADR 0004 sketched.
- A Worker with static assets, one workers.dev name per environment, preview URLs off.
- A custom domain now.

## Decision
Ship the web app as a Workers static-assets site. `web/wrangler.jsonc` has no main script. The test Worker is `stay-in-touch-test` and the production Worker is `stay-in-touch`. Both set `workers_dev: true` and `preview_urls: false`. The workers.dev subdomain Naftali chooses is the permanent address until a custom domain is a later project. Wrangler is pinned in `web/package.json`. This refines ADR 0004. Pages stays the fallback if Workers static assets cannot serve the shell.

## Consequences
Hashed files under `/assets/*` are cached for a year. `/`, `/index.html`, `/sw.js`, and `/manifest.webmanifest` are `no-cache`. Unknown paths return the app HTML with status 200, and existing files such as `/sw.js` are served as themselves. A Content-Security-Policy is not set yet (ADR 0109).

## Status
Accepted

## Date
2026-11-16
