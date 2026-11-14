# Plain CSS custom property tokens

## Context
Theming for elderly users without a CSS build pipeline.

## Options considered
- Plain CSS variables in `tokens.css`.
- Open Props, Style Dictionary, vanilla-extract.

## Decision
**CSS custom properties** aligned with React Aria starter naming; `prefers-color-scheme` and `[data-theme]`; text scale via `data-text-size`.

## Consequences
No Tailwind; logical properties for future RTL.

## Status
Accepted

## Date
2026-11-12
