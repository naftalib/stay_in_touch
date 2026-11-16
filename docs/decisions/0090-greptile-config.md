# Greptile reviews when a pull request opens

## Context
Greptile can review every push. That would re-review the fix commits that follow its own comments. The config format was checked against Greptile's `.greptile/` docs on 16 Nov 2026.

## Options considered
- Dashboard-only rules.
- A repo `.greptile/config.json` and `files.json` that override the dashboard for the settings they set.

## Decision
`strictness` is 2. `autoReview` is `["open"]`. `triggerOnDrafts`, `triggerOnUpdates`, and `skipReview` are omitted: drafts stay unreviewed because that is Greptile's default, and the current `.greptile/` reference does not document `triggerOnDrafts`. `autoApprove` stays off. `ignorePatterns` is a newline-separated gitignore string. Rules use `id`, `severity`, `rule`, and `scope` where it helps. `files.json` lists files one by one, because the reference does not accept globs there. A Vitest checks that both files parse, `strictness` is 2, and `autoReview` is `["open"]`.

## Consequences
Repo settings win over the dashboard for what this folder sets. Dashboard rules that the folder does not mention still apply. No Greptile key is stored in the repo.

## Status
Accepted

## Date
2026-11-16
