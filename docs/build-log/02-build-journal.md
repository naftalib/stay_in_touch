# Build journal setup

**Date:** 2026-11-12

## Goal

Docs-only handoff: add `docs/build-log/` with template and backfilled entry 01; split `docs/decisions.md` into ADRs; add a one-page architecture overview with Mermaid; PR template and Cursor rule so future PRs extend the journal.

## Models

- **Builder:** Composer 2.5 (cloud agent)
- **Reviewer:** Grok 4.7 (256k context, Fast off) — planned for this PR per budget; review not run yet at time of writing

## PR

This pull request (branch `cursor/build-journal-0efe`).

## What was built

- `docs/build-log/` — README, `_template.md`, entries `01` and `02`.
- `docs/decisions/` — numbered ADRs; `docs/decisions.md` kept as an index.
- Top of `docs/architecture.md` — system overview diagram and folder map (existing body unchanged below).
- `.github/pull_request_template.md` — checklist for build log and ADRs.
- `.cursor/rules/build-journal.mdc` — always-applied agent rule.
- Root `README.md` — link to the build log.
- Updated `.cursor/rules/docs.mdc` — pointers to ADRs and build log.

No migrations, tests, or application code changed.

## Review findings and how each was resolved

Pending independent review.

## Deviations from the plan and why

None known.

## Open questions and decisions made

- From entry 01 onward, default models are **Composer 2.5** (build) and **Grok 4.7** (review) for budget — recorded in [ADR 0020](../decisions/0020-agent-workflow.md).

## Follow-ups carried forward

All follow-ups listed in [entry 01](./01-repo-skeleton-and-database.md) still apply.
