# Children see General and own space only

## Context
Parents and siblings have private rooms; children should not see them.

## Decision
Children see all family **names** on profiles but only **General** and **their own** space (including `spaces` rows). Parents' and siblings' spaces are hidden.

## Consequences
`viewable_space_ids()` enforces visibility. Grandparents see every space.

## Status
Accepted

## Date
2026-11-12
