#!/usr/bin/env bash
# Idempotent Vault pairs and cron schedules. Asserts the three job names.
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"

target="${1:?usage: hosted-setup.sh <local|test|production>}"
cd "$REPO_ROOT"

require_names SUPABASE_URL PUSH_SEND_SECRET MEDIA_CLEANUP_SECRET

if [[ "$target" == "local" ]]; then
  push_url="http://kong:8000/functions/v1/push-send"
  media_url="http://kong:8000/functions/v1/media-cleanup"
else
  base="${SUPABASE_URL%/}"
  push_url="${base}/functions/v1/push-send"
  media_url="${base}/functions/v1/media-cleanup"
fi

umask 077
tmp="$(mktemp)"
trap 'wipe_file "$tmp"' EXIT

cat >"$tmp" <<SQL
do \$do\$
declare
  sid uuid;
begin
  if to_regclass('vault.secrets') is null then
    raise exception 'vault.secrets is missing; enable the vault extension before hosted-setup';
  end if;

  select id into sid from vault.secrets where name = 'push_send_secret';
  if sid is null then
    perform vault.create_secret('$(sql_quote "$PUSH_SEND_SECRET")', 'push_send_secret', 'push-send');
  else
    perform vault.update_secret(sid, '$(sql_quote "$PUSH_SEND_SECRET")', 'push_send_secret', 'push-send');
  end if;

  select id into sid from vault.secrets where name = 'push_send_url';
  if sid is null then
    perform vault.create_secret('$(sql_quote "$push_url")', 'push_send_url', 'push-send url');
  else
    perform vault.update_secret(sid, '$(sql_quote "$push_url")', 'push_send_url', 'push-send url');
  end if;

  select id into sid from vault.secrets where name = 'media_cleanup_secret';
  if sid is null then
    perform vault.create_secret('$(sql_quote "$MEDIA_CLEANUP_SECRET")', 'media_cleanup_secret', 'media-cleanup');
  else
    perform vault.update_secret(sid, '$(sql_quote "$MEDIA_CLEANUP_SECRET")', 'media_cleanup_secret', 'media-cleanup');
  end if;

  select id into sid from vault.secrets where name = 'media_cleanup_url';
  if sid is null then
    perform vault.create_secret('$(sql_quote "$media_url")', 'media_cleanup_url', 'media-cleanup url');
  else
    perform vault.update_secret(sid, '$(sql_quote "$media_url")', 'media_cleanup_url', 'media-cleanup url');
  end if;
end
\$do\$;

select private.schedule_push_send_sweep();
select private.schedule_media_cleanup();
select private.schedule_cleanup_orphan_invite_users();

do \$do\$
declare
  missing text;
begin
  if to_regclass('cron.job') is null then
    raise exception 'cron.job is missing; enable pg_cron before the first db push';
  end if;
  select string_agg(expected.name, ', ' order by expected.name)
    into missing
  from (
    select unnest(array[
      'push-send-sweep',
      'media-cleanup-daily',
      'cleanup-orphan-invite-users'
    ]) as name
  ) expected
  where not exists (
    select 1 from cron.job j where j.jobname = expected.name
  );
  if missing is not null then
    raise exception 'missing cron jobs: %', missing;
  end if;
end
\$do\$;
SQL

if [[ "$target" == "local" ]]; then
  local_psql -f "$tmp"
else
  hosted_psql -f "$tmp"
fi

wipe_file "$tmp"
trap - EXIT
echo "hosted-setup finished"
