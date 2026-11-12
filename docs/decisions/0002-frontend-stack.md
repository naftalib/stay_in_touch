# Vite, React, TypeScript strict, PWA

## Context
The client is a private family app with no public SEO requirement.

## Options considered
- Next.js (SSR/SEO).
- Vite + React + TypeScript with `strict` mode, deployed as a static SPA/PWA.

## Decision
Vite + React + TypeScript (`strict`). The app will become a PWA hosted on Cloudflare.

## Consequences
Free static hosting fits the cost model. No server-rendered pages are needed for invite-only use.

## Status
Accepted

## Date
2026-11-12
