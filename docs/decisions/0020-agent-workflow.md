# Builder plus independent reviewer agents

## Context
Handoffs are executed by cloud coding agents; quality needs a second model that does not push to the PR branch.

## Options considered
- Single agent per handoff.
- Builder agent plus independent reviewer (different model), one review comment, reviewer does not push to the PR branch.

## Decision
Use a builder and an independent reviewer per handoff. Handoff 01: Grok 4.7 builder, Claude Opus 5.5 reviewer (high effort). From handoff 02 onward: **Composer 2.5** builder, **Grok 4.7** reviewer (256k context, Fast off) for budget.

## Consequences
Review branches such as `cursor/review-01-tests` may carry extra tests not yet merged.

## Status
Accepted

## Date
2026-11-12
