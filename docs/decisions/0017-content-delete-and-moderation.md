# Soft delete, author and admin rules

## Context
Family moderation must preserve history and attribution.

## Decision
Soft delete only (`deleted_at`); clients have no hard `DELETE` on content. Authors may soft-delete their own content; admins may soft-delete anyone's post and cannot edit bodies. Removed users' posts remain; admins can hide them via soft-delete.

## Consequences
See edit/delete triggers and policies in architecture. [ADR 0021](./0021-deleted-content-visibility.md) covers who can read deleted text.

## Status
Accepted

## Date
2026-11-12
