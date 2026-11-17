# Deploy after CI, production behind a reviewer

## Context
Hosted deploys must not run from a fork pull request, must not print secret values, and must not change production without Naftali. The Supabase access token is account-wide.

## Options considered
- Deploy from `pull_request` using environment protection alone.
- `workflow_run` after CI succeeds on `main`, plus `workflow_dispatch` on `main`.
- A separate reviewer-less environment so backups do not wait.

## Decision
`.github/workflows/deploy.yml` runs when CI completes successfully on a push to `main`, or when someone starts it from the Actions tab on `main`. There is no `pull_request` trigger. The job checks out that CI run's head SHA. Test deploys with the `test` environment (no required reviewer). Production deploys only after test, and only with the `production` environment, whose required reviewer is `naftalib`. A production deploy runs the backup workflow first and stops if the backup fails. The Supabase access token can manage every project on the account. It lives only in the two GitHub environments.

## Consequences
Fork pull requests never receive secrets. A production deploy asks for approval twice: once for the backup workflow and once for the deploy job, because both use the `production` environment. There is no reviewer-less backup environment (ADR 0108). Third-party actions in the new workflows are pinned to commit SHAs.

## Status
Accepted

## Date
2026-11-16
