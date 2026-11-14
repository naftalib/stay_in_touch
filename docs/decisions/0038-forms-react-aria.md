# React Aria forms without a form library

## Context
Only sign-in, OTP, and composer forms in this handoff.

## Options considered
- React Aria `Form` + native constraint validation.
- React Hook Form + zod via resolvers.

## Decision
**React Aria `Form`, `TextField`, `TextArea`, `FieldError`** with server errors in `validationErrors`.

## Consequences
Accessible labels and errors without `Controller` wrappers.

## Status
Accepted

## Date
2026-11-12
