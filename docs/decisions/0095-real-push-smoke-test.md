# Real push smoke test on demand

## Context
Handoff 06 proved the worker can render a payload that tests handed it through Chrome DevTools, with `PUSH_TRANSPORT=capture` and a stubbed `PushManager.subscribe`. Those tests stayed green while `push-send` skipped every recipient. A real send — app, outbox, trigger, `webpush`, FCM, Chrome, decrypt — needs its own check, and that check is too slow and too dependent on Google to run on every pull request.

## Options considered
- Add the real send to the pull-request end-to-end job.
- A workflow that runs only when someone starts it (`workflow_dispatch`).
- `workflow_dispatch`, plus a weekly schedule so a Chrome or FCM change is noticed without a pull request.

## Decision
The real send lives in `.github/workflows/push-smoke.yml`. It is not a pull-request check and it does not change the CI workflow. Someone starts it from the Actions tab, on any branch that has the file. A weekly run is included as one removable block: Monday 04:17 UTC (06:17 in Israel in winter). The job uses a standard GitHub-hosted runner, `contents: read`, no repository secrets, and throwaway VAPID keys generated in the job. `PUSH_TRANSPORT=webpush`. The same public key is built into the app.

## Consequences
Scheduled runs happen only on the default branch. GitHub turns a scheduled workflow off after 60 days without repository activity; turn it back on from the Actions tab. Each run creates one throwaway FCM registration and really sends through Google. Failures email the repository owner. The minutes are free because the repository is public. Removing the `schedule` block leaves the manual run intact. The smoke test does not cover Apple Push Notification service, a physical phone, or Firefox.

## Status
Accepted

## Date
2026-11-16
