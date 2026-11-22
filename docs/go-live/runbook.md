# Go-live runbook

Steps Naftali does are marked **[Naftali]**. Steps the workflows do are marked **[automatic]**. Do them in this order. Secret values are never written in this file, in a commit, or in an Actions log. The names below are the GitHub environment names.

There is no reviewer-less backup environment. Every production backup, including the monthly one, uses the `production` environment and waits for the required reviewer `naftalib`.

## 0. [Naftali] Reconnect Cursor's GitHub account

Reconnect the GitHub integration in Cursor as `naftalib`, so later agents and the repository agree on the owner.

## 1. [Naftali] Two Supabase projects

In the Supabase dashboard, create two free projects in an organization you control. Pick a region near Israel. Frankfurt is the example. Save each database password in a password manager.

On each project, before the first database push, enable the `pg_cron` and `pg_net` extensions. If Realtime's "Allow public access" is on, turn it off. That switch is not a `config.toml` key in CLI 3.1.0, so `config push` does not set it.

Create a Supabase access token (account-wide). It can manage every project on the account. Store it only as the GitHub secret `SUPABASE_ACCESS_TOKEN`.

## 2. [Naftali] Cloudflare

Create a free Cloudflare account. Do not add a card. Choose the workers.dev subdomain once. That name is the permanent address of the app until a custom domain is a later project.

Create an API token with Workers Scripts Edit. Note the account id. The test Worker will be named `stay-in-touch-test` and the production Worker `stay-in-touch`. Preview URLs stay off.

## 3. [Naftali] Gmail

Create or choose a Gmail account. Turn on 2-step verification. Create an app password. The same account may send for both projects. Test invites can use a plus-address of an inbox you read. `breuningapp+mom@gmail.com` arrives in `breuningapp@gmail.com`. Do not send mail to an address you do not read.

Gmail's free limit is roughly 100 to 500 messages a day, and mail may arrive in spam. On the test project, send one invite to your own address first. Tell the family to check spam and to mark the message "not spam".

## 4. [Naftali] Keys, on your computer

From a checkout of `main` after this handoff is merged:

```bash
pnpm push:keys
```

Run it twice, once for the values you will store on `test` and once for `production`. Each run prints a VAPID pair. Also generate a random `PUSH_SEND_SECRET` and a random `MEDIA_CLEANUP_SECRET` for each project (different values).

Generate an age key pair (`age-keygen`). Put the secret identity in a password manager and on offline storage. The public recipient is the production variable `BACKUP_AGE_RECIPIENT`. Also store it on `test` so the restore drill can encrypt a test backup. Never commit the identity file.

## 5. [Naftali] GitHub environments

Create two environments. Deployment branches: `main` only.

| Environment | Required reviewer |
|---|---|
| `test` | none |
| `production` | `naftalib` |

Set these names on **both** environments. Values differ per project. Do not create any other environment for backups.

Secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `CLOUDFLARE_API_TOKEN`
- `VAPID_PRIVATE_KEY`
- `PUSH_SEND_SECRET`
- `MEDIA_CLEANUP_SECRET`
- `GMAIL_SMTP_PASS`

Variables:

- `SUPABASE_PROJECT_REF`
- `SUPABASE_URL` (for example `https://<ref>.supabase.co`)
- `VITE_SUPABASE_URL` (the same URL)
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `APP_URL` (the workers.dev origin, `https://…`)
- `CLOUDFLARE_ACCOUNT_ID`
- `VAPID_PUBLIC_KEY`
- `VAPID_SUBJECT` (`mailto:` your address)
- `VITE_VAPID_PUBLIC_KEY` (the raw key from `pnpm push:keys`, not the JWK)
- `GMAIL_SMTP_USER`
- `EMAIL_FROM` (`Stay In Touch <you@gmail.com>`)

On `production`, and on `test` for the drill, also set the variable `BACKUP_AGE_RECIPIENT` to the age public key.

The deploy script derives `APP_REDIRECT_ALLOW` as `APP_URL` plus `/**`. That is not a separate GitHub variable.

If a name is missing, the script prints `missing required name:` and the name. It does not print the value.

## 6. [automatic] Deploy to test

Merge to `main`. CI runs. When CI succeeds, Deploy runs the test job. Read the post-deploy check in the log. It must say the check passed: no-cache shell, JavaScript service worker, deep link returns HTML.

The first test deploy applied migrations `20261112160000` through `20261112160006`. `20261112160007_realtime_policy.sql` then failed closed: hosted `postgres` cannot assume `supabase_realtime_admin`, and the local `dblink` host does not exist. The repair tried the direct database host `db.<ref>.supabase.co`. On the free plan that host is IPv6-only, and the GitHub runner has no IPv6, so `psql` ended with "Network is unreachable".

The repair now uses the Supavisor session pooler, which is IPv4. The host is the one `supabase link` wrote to `supabase/.temp/pooler-url`. If that file is missing or is not a shared pooler host, the script reads `db_host` from the Management API. The region name is not turned into a hostname. The connection is port 5432, user `postgres.<ref>`, and `sslmode=require`. The script applies `scripts/deploy/realtime-policy.sql` as `postgres`, marks `20261112160007` applied, and pushes again. Re-run Deploy on the test project. It should continue from the migration that is not recorded and finish all 21 migrations. If the repair fails, stop and do not approve production. CI checks the host selection and the repair command with fakes. The pooler repair has not been executed against the test project yet.

## 7. [Naftali] Bootstrap a test family

On your computer, not in Actions. GitHub's copy of the Gmail password is not available here, so the gitignored env file has to carry the mail settings. The command checks them before it creates the user or the family. If the first invite expires before you accept it, run the same command again. It renews that invite and, if that user was left unconfirmed, confirms them so the sign-in code can be sent.

The address has to be an inbox you read. Use a plus-address of that inbox. `<your-gmail>+mom@gmail.com` means: take the part before `@` in the Gmail account you read, add `+mom`, and keep `@gmail.com`. For `breuningapp@gmail.com`, that is `breuningapp+mom@gmail.com`, and the message arrives in the breuningapp mailbox. Do not use `you+test@gmail.com`. That is a stranger's inbox.

```bash
# .env.test.local is gitignored. Never commit it.
cat > .env.test.local <<'EOF'
SUPABASE_URL=https://<test-ref>.supabase.co
SUPABASE_SECRET_KEY=<the test project secret key>
APP_URL=https://stay-in-touch-test.<your-subdomain>.workers.dev
EMAIL_TRANSPORT=gmail
GMAIL_SMTP_USER=<the Gmail address>
GMAIL_SMTP_PASS=<the app password>
EMAIL_FROM=Stay In Touch <the Gmail address>
EOF
pnpm bootstrap:family --env test --family "Test Family" --email "<your-gmail>+mom@gmail.com" --label "Mom"
```

`GMAIL_SMTP_HOST` and `GMAIL_SMTP_PORT` can be omitted. They default to `smtp.gmail.com` and `465`.

Open the invite from Gmail, accept it, and confirm you are an admin with a General space and a space titled Mom. Run the command again. It must not create a second family.

### If test was bootstrapped to you+test@gmail.com

The test project already has "Test Family" pointing at `you+test@gmail.com`. Nobody you know reads that mailbox, so the sign-in code cannot be completed there. Reset deletes that unjoined family, its General space, its pending invite, and the auth user created for that invite. It does not delete any other family. It refuses `--env production` even with `--confirm-reset`. Without `--confirm-reset` it deletes nothing.

PowerShell, from the repo directory, using the `.env.test.local` you already created:

```powershell
pnpm bootstrap:family --env test --reset --confirm-reset --family "Test Family" --email "you+test@gmail.com"
```

The success line is `test family removed`. Then bootstrap again with your own address. For the breuningapp mailbox, the email argument is `breuningapp+mom@gmail.com`.

```powershell
pnpm bootstrap:family --env test --family "Test Family" --email "<your-gmail>+mom@gmail.com" --label "Mom"
```

If the invite is already on an address you read and the code request failed, skip the reset. Run the bootstrap command again with that same address. The re-run confirms the existing user and sends the invite again.

## 8. [Naftali] Phone tests

Follow [phone-test-plan.md](./phone-test-plan.md) against the test URL. About 20 to 30 minutes per phone.

## 9. [Naftali] Restore drill on test

Once, at go-live, run the same drill the CI job runs, against the **test** project only:

1. Approve a backup of test (the backup workflow uses the `production` environment even for a manual run, because that is the only backup environment). For the test drill, run `scripts/backup.sh test` on your computer with `BACKUP_AGE_RECIPIENT` and a linked test project, so you do not download production.
2. Restore that file onto test with `scripts/restore.sh <file> test` and `AGE_IDENTITY_FILE` pointing at the secret key. Restore opens the database on the same session pooler as the deploy repair, so the checkout has to be linked first.
3. Confirm a known test user can still sign in.
4. Run hosted setup again. Restore deletes every cron job, and Vault secrets are not in the dump. Hosted setup writes the Vault secrets and schedules `push-send-sweep`, `media-cleanup-daily`, and `cleanup-orphan-invite-users`.

Never restore production data into test.

## 10. [Naftali] Approve production

Start Deploy from the Actions tab on `main` and choose `production`, or let the next green CI push offer the production job after test. GitHub asks twice: once for the backup workflow, then again for the deploy job. Approve both. If the backup fails, the deploy stops and does not change the database.

## 11. [Naftali] Bootstrap the real family

Create `.env.production.local` the same way as the test file, with the production URL, secret key, workers.dev address, and the same Gmail settings (`EMAIL_TRANSPORT=gmail`, `GMAIL_SMTP_USER`, `GMAIL_SMTP_PASS`, `EMAIL_FROM`). Do not commit it.

```bash
pnpm bootstrap:family --env production --family "The Breuning Family" --email "<first parent>" --label "Mom"
```

You are the first admin. Accept the invite on your phone. If that invite expires first, run the same command again. It renews it. Do not pass `--force` unless you mean to add this parent to a project that already has members.

## 12. [Naftali] Staged rollout

1. Your household.
2. Grandparents. Be there for the first install.
3. Children.

Feedback comes back on WhatsApp. There is no in-app feedback button.

## 13. [Naftali] Watch

Watch Supabase email about a project pausing. The one-minute push sweep keeps a project awake once Vault secrets exist. A free project with no sweep pauses after 7 days.

On the 1st of each month at 02:00 UTC, GitHub will ask you to approve the monthly backup. Approve it. The same job runs the storage check. If it fails, photo storage or the database is at 80 percent or more. The log shows percentages only.

## 14. [Naftali] Rollback

- Bad web deploy: Cloudflare dashboard, the Worker, Rollback to the previous version.
- Bad migration: fix forward with a new migration. Do not edit a migration that already ran.
- Database restore is the last resort. It needs the age identity. It does not restore photo bytes or Vault secrets. Run hosted setup after a restore. Never restore production into test.

## If notifications stop

1. Confirm the phone still has permission and the app was opened from the home-screen icon.
2. On the project, confirm Vault secrets `push_send_secret` and `push_send_url` exist and cron has `push-send-sweep`.
3. Confirm the function secret `PUSH_SEND_SECRET` matches the Vault secret. Hosted setup writes both.
4. A paused project sends nothing. Restore it from the Supabase dashboard.

## If the project paused

Open the project in the Supabase dashboard and restore it. Then run Deploy for that environment so hosted setup rewrites Vault URLs and reschedules jobs. Tell the family the app will work again after that. A paused project is not data loss.

## Names the scripts expect

Both environments use the secret and variable names in step 5. Production also requires `BACKUP_AGE_RECIPIENT` and, inside the deploy job, `BACKUP_CONFIRMED=1` after the backup workflow succeeds. Local `DEPLOY_TARGET=local` does not call Cloudflare or the Supabase access token.
