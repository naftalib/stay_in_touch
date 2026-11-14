# Vitest, Playwright, and axe

## Context
RLS, auth, and realtime only surface against a real local stack.

## Options considered
- Vitest + jsdom + Testing Library; Playwright vs local Supabase; @axe-core/playwright.
- MSW-heavy unit tests without stack E2E.

## Decision
**Vitest 5.1 + jsdom 31 + Testing Library 16.3** for units; **Playwright 1.65** E2E in CI; **axe 4.14** in E2E; no MSW.

## Consequences
E2E job starts Supabase with auth, Realtime, and Mailpit; uploads report on failure.

## Status
Accepted

## Date
2026-11-12
