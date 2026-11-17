# Bootstrap in Actions is local-only

## Context
`pnpm bootstrap:family` refused to run whenever `GITHUB_ACTIONS` was set. That kept a hosted email address out of a public log, and it also made the CI bootstrap test fail, because CI sets that variable even when the target is the local Docker stack. The first invite is sent from the operator's computer, which does not have the GitHub environment's Gmail secret unless the gitignored env file contains it.

## Options considered
- Drop the Actions refusal so CI can run the script.
- Keep refusing every Actions run, and stop calling the script from CI.
- Refuse Actions only when `SUPABASE_URL` is not a local address, and require the mail settings in the env file before any row is created.

## Decision
A GitHub Actions run may bootstrap only a local Supabase URL (`127.0.0.1`, `localhost`, or another local Docker host). A hosted URL is still refused. The env file must set `EMAIL_TRANSPORT`, `EMAIL_FROM`, and `APP_URL` before the script creates a user. Gmail also requires `GMAIL_SMTP_USER` and `GMAIL_SMTP_PASS` in that file. An expired pending invite for the same family and email is renewed; a different email still cannot take the family name.

## Consequences
CI can prove the local path, including with `GITHUB_ACTIONS=true`. Naftali's hosted run stays on his computer. A missing mail setting fails before a family is left without its invite. ADR 0105 is refined, not rewritten.

## Status
Accepted

## Date
2026-11-16
