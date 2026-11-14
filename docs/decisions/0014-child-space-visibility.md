# Children see General and own space only

## Context
Parents and siblings have private rooms; children should not see them.

## Options considered
- **Chosen (A):** Show member names; children open only General and their own space (siblings' names may appear as non-links).
- **B:** Nothing beyond their own spaces in navigation.
- **C:** Every space name visible but locked.

## Decision
Children see all family **names** on profiles but only **General** and **their own** space (including `spaces` rows). Parents' and siblings' spaces are hidden.

## Consequences
`viewable_space_ids()` enforces visibility. Grandparents see every space.

## Status
Accepted

## Date
2026-11-12
