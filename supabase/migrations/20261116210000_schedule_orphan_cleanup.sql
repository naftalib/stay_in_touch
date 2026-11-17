-- Restore unschedules every cron job. hosted-setup must be able to put
-- cleanup-orphan-invite-users back. The original schedule lives in an
-- applied migration and is not edited.

create or replace function private.schedule_cleanup_orphan_invite_users()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  if exists (
    select 1 from cron.job where jobname = 'cleanup-orphan-invite-users'
  ) then
    perform cron.unschedule('cleanup-orphan-invite-users');
  end if;

  perform cron.schedule(
    'cleanup-orphan-invite-users',
    '15 4 * * *',
    $cron$select private.cleanup_orphan_invite_auth_users()$cron$
  );
exception
  when undefined_table or undefined_function or invalid_schema_name then
    return;
  when others then
    if sqlerrm not like '%pg_cron%' and sqlerrm not like '%cron%' then
      raise;
    end if;
end;
$$;

revoke all on function private.schedule_cleanup_orphan_invite_users() from public, anon, authenticated;

select private.schedule_cleanup_orphan_invite_users();
