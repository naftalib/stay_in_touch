# Explicitly not built at go-live

## Context
Go-live is hosting, the first family, email, and backups. Several product ideas were in earlier follow-ups.

## Options considered
- Build the remaining follow-ups in this handoff.
- Name them and leave them.

## Decision
This handoff does not add leaked-password checks, a hard purge of soft-deleted photos, an audit-log viewer, email notifications, an in-app feedback button, a hosted push smoke test, a custom domain, Resend, paid Supabase features, or other app features. The exceptions are the bootstrap RPC and the hosted-safe Realtime policy re-assert.

## Consequences
Those items stay in the build log follow-ups. The weekly push smoke workflow is unchanged.

## Status
Accepted

## Date
2026-11-16
