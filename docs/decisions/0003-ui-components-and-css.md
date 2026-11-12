# React Aria Components and CSS Modules

## Context
Accessibility matters for elderly grandparents. Styling must stay maintainable without a utility-first CSS framework.

## Options considered
- Tailwind or other utility CSS.
- React Aria Components with plain CSS Modules.

## Decision
React Aria Components + CSS Modules. No Tailwind.

## Consequences
Better default accessibility primitives. Owner preference avoids utility-class sprawl. Agents must not add Tailwind to `web/`.

## Status
Accepted

## Date
2026-11-12
