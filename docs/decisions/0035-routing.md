# React Router 8 declarative mode

## Context
First screens need client routing without a framework build plugin.

## Options considered
- React Router 8 declarative mode (`BrowserRouter`, `Routes`).
- React Router 8 data mode / loaders.
- TanStack Router 1.170.
- wouter 3.13.

## Decision
**React Router 8.5.x, declarative mode.** Data lives in TanStack Query; no `@react-router/dev`.

## Consequences
Familiar routing; React Aria `RouterProvider` wires client-side navigation.

## Status
Accepted

## Date
2026-11-12
