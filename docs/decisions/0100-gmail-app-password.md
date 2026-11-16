# Gmail app password for Auth and invite email

## Context
The family does not have a domain yet. Auth sign-in codes and invite email must leave the hosted project. ADR 0007 keeps Resend as the later upgrade.

## Options considered
- Resend on day one, which needs a verified domain.
- One Gmail account with 2-step verification and an app password, used as Auth SMTP and as the Edge Function Gmail transport.
- Different Gmail accounts for test and production.

## Decision
Use `smtp.gmail.com:465` for Auth and `EMAIL_TRANSPORT=gmail` for invite email. The same Gmail address may serve both projects. Test can use plus-addresses. The app password is `GMAIL_SMTP_PASS` and is never committed. A Deno test speaks SMTP to a local fake server with TLS off. That override refuses a host that ends in `gmail.com`.

## Consequences
Gmail's free sending is roughly 100 to 500 messages a day and mail may land in spam. The runbook says to send one test invite to Naftali's own address first, and to tell the family to check spam. Switching to Resend later is still only an environment change.

## Status
Accepted

## Date
2026-11-16
