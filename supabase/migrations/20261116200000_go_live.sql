-- Go-live: first-family bootstrap, media-cleanup schedule function,
-- and a hosted-safe re-assert of the Realtime viewer policy.
-- Does not edit earlier migrations.

-- Parents get a space (handoff 04). The first admin invitation sets
-- create_space so accept_invitation opens that space. General already exists.

create or replace function private.bootstrap_family(
  p_user_id uuid,
  p_family_name text,
  p_email text,
  p_label text
)
returns table (
  family_id uuid,
  invitation_id uuid,
  token text,
  reused boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text;
  user_email text;
  fam uuid;
  invite_id uuid;
  raw_token text;
  new_hash bytea;
  member_id uuid;
begin
  perform private.assert_service_role();

  if p_family_name is null or char_length(btrim(p_family_name)) = 0 then
    raise exception 'family name is required'
      using errcode = '22023';
  end if;

  if p_label is null or char_length(btrim(p_label)) = 0 then
    raise exception 'label is required'
      using errcode = '22023';
  end if;

  normalized := private.normalized_email(p_email);
  if normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email'
      using errcode = '22023';
  end if;

  if p_user_id is null or not exists (
    select 1 from public.profiles where id = p_user_id
  ) then
    raise exception 'auth user has no profile'
      using errcode = '22023';
  end if;

  select private.normalized_email(u.email)
    into user_email
  from auth.users u
  where u.id = p_user_id;

  if user_email is distinct from normalized then
    raise exception 'email does not match the auth user'
      using errcode = '22023';
  end if;

  select f.id
    into fam
  from public.families f
  where btrim(f.name) = btrim(p_family_name)
    and f.deleted_at is null
  order by f.created_at
  limit 1;

  if fam is not null then
    select fm.id
      into member_id
    from public.family_members fm
    where fm.family_id = fam
      and fm.user_id = p_user_id
      and fm.status = 'active';

    if member_id is not null then
      select i.id
        into invite_id
      from public.invitations i
      where i.family_id = fam
        and private.normalized_email(i.email) = normalized
      order by i.created_at desc
      limit 1;

      family_id := fam;
      invitation_id := invite_id;
      token := null;
      reused := true;
      return next;
      return;
    end if;

    select i.id
      into invite_id
    from public.invitations i
    where i.family_id = fam
      and private.normalized_email(i.email) = normalized
      and i.status = 'pending'
      and i.expires_at > pg_catalog.now()
    for update;

    if invite_id is null then
      raise exception 'family name already exists'
        using errcode = '22023';
    end if;

    raw_token := private.base64url_encode(extensions.gen_random_bytes(32));
    new_hash := private.invitation_token_hash(raw_token);

    update public.invitations
    set token_hash = new_hash,
        last_sent_at = pg_catalog.now(),
        send_count = send_count + 1,
        expires_at = pg_catalog.now() + interval '14 days'
    where id = invite_id;

    insert into public.audit_log (family_id, actor_user_id, action, target, details)
    values (
      fam,
      p_user_id,
      'invitation.sent',
      invite_id::text,
      jsonb_build_object('via', 'bootstrap_family')
    );

    family_id := fam;
    invitation_id := invite_id;
    token := raw_token;
    reused := true;
    return next;
    return;
  end if;

  insert into public.families (name, created_by)
  values (btrim(p_family_name), p_user_id)
  returning id into fam;

  insert into public.spaces (family_id, kind, title, sort_order, created_by)
  values (fam, 'general', 'General', 0, p_user_id);

  raw_token := private.base64url_encode(extensions.gen_random_bytes(32));
  new_hash := private.invitation_token_hash(raw_token);

  insert into public.invitations (
    family_id,
    email,
    role,
    label,
    create_space,
    invited_by,
    status,
    expires_at,
    token_hash,
    last_sent_at,
    send_count
  )
  values (
    fam,
    normalized,
    'admin',
    btrim(p_label),
    true,
    p_user_id,
    'pending',
    pg_catalog.now() + interval '14 days',
    new_hash,
    pg_catalog.now(),
    1
  )
  returning id into invite_id;

  insert into public.audit_log (family_id, actor_user_id, action, target, details)
  values (
    fam,
    p_user_id,
    'family.bootstrapped',
    fam::text,
    jsonb_build_object('invitation_id', invite_id, 'create_space', true)
  );

  family_id := fam;
  invitation_id := invite_id;
  token := raw_token;
  reused := false;
  return next;
end;
$$;

create or replace function public.bootstrap_family(
  p_user_id uuid,
  p_family_name text,
  p_email text,
  p_label text
)
returns table (
  family_id uuid,
  invitation_id uuid,
  token text,
  reused boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  return query
  select
    b.family_id,
    b.invitation_id,
    b.token,
    b.reused
  from private.bootstrap_family(p_user_id, p_family_name, p_email, p_label) as b;
end;
$$;

revoke all on function private.bootstrap_family(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.bootstrap_family(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.bootstrap_family(uuid, text, text, text) to service_role;

-- Same shape as private.schedule_push_send_sweep. The photos migration
-- inlined this once; hosted-setup calls it again after Vault is set.
create or replace function private.schedule_media_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  target text;
begin
  if to_regclass('cron.job') is null or to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'media_cleanup_secret'
  limit 1;

  select decrypted_secret into target
  from vault.decrypted_secrets
  where name = 'media_cleanup_url'
  limit 1;

  if secret is null or target is null
     or char_length(btrim(secret)) = 0
     or char_length(btrim(target)) = 0
  then
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'media-cleanup-daily') then
    perform cron.unschedule('media-cleanup-daily');
  end if;

  perform cron.schedule(
    'media-cleanup-daily',
    '40 3 * * *',
    format(
      $cron$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'x-media-cleanup-secret', %L), body := '{}'::jsonb)$cron$,
      target,
      secret
    )
  );
exception
  when undefined_table or undefined_function or invalid_schema_name then
    return;
  when others then
    if sqlerrm not like '%pg_cron%'
       and sqlerrm not like '%cron%'
       and sqlerrm not like '%vault%'
       and sqlerrm not like '%net%'
    then
      raise;
    end if;
end;
$$;

revoke all on function private.schedule_media_cleanup() from public, anon, authenticated;

select private.schedule_media_cleanup();

-- Hosted postgres can create policies on realtime.messages through supautils
-- without assuming supabase_realtime_admin (Supabase docs, Nov 2026).
-- Local CLI postgres cannot, and must not use dblink here. The earlier
-- migration already installed the policy on a local database, so this is a
-- no-op when the policy exists. On a hosted project the earlier migration
-- fails closed; scripts/deploy/db-push.sh installs this statement and marks
-- that migration applied. See docs/go-live/runbook.md.
do $policy$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'viewers can receive space broadcasts'
  ) then
    return;
  end if;

  execute $sql$
    create policy "viewers can receive space broadcasts"
      on realtime.messages
      for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and realtime.messages.topic = realtime.topic()
        and private.topic_space_id() is not null
        and private.topic_space_id() in (select private.viewable_space_ids())
      )
  $sql$;
end
$policy$;
