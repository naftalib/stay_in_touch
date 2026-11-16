# Headed Chrome, persistent profile, xvfb

## Context
Headless Chromium cannot complete a real push registration. Playwright's `browser.newContext()` is an off-the-record profile, and Chrome refuses push there ("Registration failed - permission denied"). Playwright's default Chromium switches include `--disable-background-networking`, which stops the component Chrome uses to register with FCM. Firebase runs its own FCM tests with Google Chrome under `xvfb` on `ubuntu-latest`.

## Options considered
- Keep using headless Chromium and CDP `ServiceWorker.deliverPushMessage`. That never leaves the machine.
- Headed Google Chrome via `launchPersistentContext`, a fresh temporary profile, `xvfb` on Linux, and `ignoreDefaultArgs` so `--disable-background-networking` is not passed.
- A self-hosted runner, Firefox with Mozilla autopush, or a local-only smoke test.

## Decision
The smoke test launches headed Google Chrome (`channel: "chrome"`, `headless: false`) in a new temporary profile, under `xvfb-run -a` on Linux. Notification permission is granted for `http://127.0.0.1:5173` after the Turn on card is on screen, and the test clicks Turn on. `subscribe` may take up to 90 seconds. Delivery may take up to 120 seconds. The test allows one retry. It does not stub `PushManager`, `Notification`, or `subscribe`.

## Consequences
The job needs a display. macOS and Windows can run it without `xvfb`. The first registration in a fresh profile is the slow part. `--disable-background-networking` is removed; whether a run with Playwright's default switch still registers is recorded in the build log. A profile that cannot obtain an `https://fcm.googleapis.com/` endpoint fails the job. There is no stub, no local mock presented as FCM, and no `continue-on-error`.

## Status
Accepted

## Date
2026-11-16
