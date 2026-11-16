# Push payload is who and where only

## Context
A push body is stored by the browser and the push service. Message text, captions, and photo URLs must not leave the database that way.

## Options considered
- Include a snippet of the message.
- Title "Stay In Touch" and a body that names the author label and the space title only.

## Decision
The body is "{who} posted in {title}", "{A} and {B} posted in {title}", or "{N} new posts in {title}". Who is `family_members.label`, never an email. Where is `spaces.title`. The JSON is Apple's Declarative Web Push shape (`web_push` 8030, `notification.title`, `body`, `navigate`, `tag`, `lang`, `dir`, and `app_badge`) so iOS 18.4+ can show it when the worker is not running. `navigate` uses `APP_URL`, never the in-network Kong host. Logs and responses record subscription ids and HTTP status only.

## Consequences
The seed space titled "Noa" reads "Grandma posted in Noa". Opening the notification is what reveals the message, under RLS.

## Status
Accepted

## Date
2026-11-16
