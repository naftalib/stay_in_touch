-- Review fixes for handoff 04.
-- Email match is trimmed. Revoke locks the row and clears the token.
-- Accept keeps the hash so the invitee can see "already joined", but a second
-- accept still fails. A re-invite reopens an archived space.
-- Orphan cleanup never deletes someone who signed in, belongs to any family,
-- or still has a pending invitation. Private helpers are not executable by clients.

create or replace function private.normalized_email(p_email text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(btrim(coalesce(p_email, '')));
$$;

revoke all on function private.normalized_email(text) from public, anon, authenticated;

create or replace function private.finish_accept_invitation(
  invite public.invitations,
  actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid;
  reopened_space_id uuid;
begin
  if invite.create_space and invite.role = 'grandparent' then
    raise exception 'grandparents do not get a space'
      using errcode = '22023';
  end if;

  insert into public.family_members (
    family_id,
    user_id,
    role,
    label,
    status,
    invited_by
  )
  values (
    invite.family_id,
    actor,
    invite.role,
    invite.label,
    'active',
    invite.invited_by
  )
  on conflict (family_id, user_id) do update
    set role = excluded.role,
        label = excluded.label,
        status = 'active',
        removed_at = null,
        invited_by = excluded.invited_by
  returning id into member_id;

  -- A re-invite opens the member's archived space again, even when this
  -- invitation does not ask to create a new one.
  update public.spaces
  set archived_at = null
  where owner_member_id = member_id
    and archived_at is not null
  returning id into reopened_space_id;

  if reopened_space_id is not null then
    perform private.write_audit(
      invite.family_id,
      'space.unarchived',
      reopened_space_id::text,
      jsonb_build_object(
        'via', 'accept_invite',
        'invitation_id', invite.id
      )
    );
  end if;

  if invite.create_space and not exists (
    select 1 from public.spaces s where s.owner_member_id = member_id
  ) then
    insert into public.spaces (
      family_id,
      kind,
      owner_member_id,
      title,
      sort_order,
      created_by
    )
    values (
      invite.family_id,
      'member',
      member_id,
      invite.label,
      10,
      actor
    );
  end if;

  -- Keep token_hash so invitation_preview can explain "already joined".
  -- accept_* rejects any row that is no longer pending.
  update public.invitations
  set status = 'accepted',
      accepted_user_id = actor
  where id = invite.id
    and status = 'pending';
  if not found then
    raise exception 'invitation is not pending'
      using errcode = '42501';
  end if;

  perform private.write_audit(
    invite.family_id,
    'invitation.accepted',
    invite.id::text,
    jsonb_build_object(
      'user_id', actor,
      'member_id', member_id,
      'role', invite.role,
      'create_space', invite.create_space
    )
  );

  return member_id;
end;
$$;

create or replace function public.accept_invite(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_email text;
  actor_confirmed timestamptz;
  invite public.invitations%rowtype;
  member_id uuid;
begin
  if actor is null then
    raise exception 'sign in required'
      using errcode = '42501';
  end if;

  select u.email, u.email_confirmed_at
    into actor_email, actor_confirmed
  from auth.users u
  where u.id = actor;
  if actor_email is null or actor_confirmed is null then
    raise exception 'sign in required'
      using errcode = '42501';
  end if;

  select * into invite
  from public.invitations
  where id = p_invitation_id
  for update;
  if not found
     or private.normalized_email(invite.email) <> private.normalized_email(actor_email) then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  if invite.status = 'pending' and invite.expires_at <= pg_catalog.now() then
    raise exception 'invitation has expired'
      using errcode = '42501';
  end if;

  if invite.status <> 'pending' or invite.expires_at <= pg_catalog.now() then
    raise exception 'invitation is not pending'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.family_members fm
    where fm.family_id = invite.family_id
      and fm.user_id = actor
      and fm.status = 'active'
  ) then
    raise exception 'already a member of this family'
      using errcode = '42501';
  end if;

  member_id := private.finish_accept_invitation(invite, actor);
  return member_id;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns table (family_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_email text;
  actor_confirmed timestamptz;
  invite public.invitations%rowtype;
  new_member_id uuid;
begin
  if actor is null then
    raise exception 'sign in required'
      using errcode = '42501';
  end if;

  select u.email, u.email_confirmed_at
    into actor_email, actor_confirmed
  from auth.users u
  where u.id = actor;
  if actor_email is null or actor_confirmed is null then
    raise exception 'sign in required'
      using errcode = '42501';
  end if;

  select * into invite
  from public.invitations
  where token_hash = private.invitation_token_hash(btrim(p_token))
  for update;

  if not found
     or private.normalized_email(invite.email) <> private.normalized_email(actor_email) then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  if invite.status = 'pending' and invite.expires_at <= pg_catalog.now() then
    raise exception 'invitation has expired'
      using errcode = '42501';
  end if;

  if invite.status <> 'pending' or invite.expires_at <= pg_catalog.now() then
    raise exception 'invitation is not pending'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.family_members fm
    where fm.family_id = invite.family_id
      and fm.user_id = actor
      and fm.status = 'active'
  ) then
    raise exception 'already a member of this family'
      using errcode = '42501';
  end if;

  new_member_id := private.finish_accept_invitation(invite, actor);

  return query
  select invite.family_id, new_member_id;
end;
$$;

create or replace function public.my_pending_invitations()
returns table (
  id uuid,
  family_name text,
  inviter_name text,
  role public.family_role,
  label text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_email text;
  actor_confirmed timestamptz;
begin
  if actor is null then
    raise exception 'sign in required'
      using errcode = '42501';
  end if;

  select u.email, u.email_confirmed_at
    into actor_email, actor_confirmed
  from auth.users u
  where u.id = actor;
  if actor_email is null or actor_confirmed is null then
    return;
  end if;

  return query
  select
    i.id,
    f.name,
    coalesce(p.display_name, 'A family member'),
    i.role,
    i.label,
    i.expires_at
  from public.invitations i
  join public.families f on f.id = i.family_id
  left join public.profiles p on p.id = i.invited_by
  where i.status = 'pending'
    and i.expires_at > pg_catalog.now()
    and private.normalized_email(i.email) = private.normalized_email(actor_email);
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invitations%rowtype;
begin
  select * into invite
  from public.invitations
  where id = p_invitation_id
  for update;
  if not found then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  perform private.assert_family_admin(invite.family_id);

  if invite.status <> 'pending' then
    raise exception 'only a pending invitation can be revoked'
      using errcode = '42501';
  end if;

  update public.invitations
  set status = 'revoked',
      token_hash = null
  where id = invite.id
    and status = 'pending';
  if not found then
    raise exception 'only a pending invitation can be revoked'
      using errcode = '42501';
  end if;

  perform private.write_audit(
    invite.family_id,
    'invitation.revoked',
    invite.id::text,
    jsonb_build_object('email', invite.email)
  );
end;
$$;

create or replace function private.cleanup_orphan_invite_auth_users()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_row record;
  user_row record;
  deleted_count integer := 0;
  audit_family uuid;
  has_sessions boolean;
  signed_in boolean;
begin
  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'sessions'
  ) into has_sessions;

  for email_row in
    select distinct private.normalized_email(i.email) as email
    from public.invitations i
    where i.accepted_user_id is null
      and (
        i.status in ('revoked', 'expired')
        or (i.status = 'pending' and i.expires_at <= pg_catalog.now())
      )
  loop
    select i.family_id into audit_family
    from public.invitations i
    where private.normalized_email(i.email) = email_row.email
      and i.accepted_user_id is null
    order by i.created_at desc
    limit 1;

    for user_row in
      select u.id as user_id, u.email, u.last_sign_in_at
      from auth.users u
      where private.normalized_email(u.email) = email_row.email
    loop
      signed_in := user_row.last_sign_in_at is not null;
      if not signed_in and has_sessions then
        execute 'select exists (select 1 from auth.sessions where user_id = $1)'
          into signed_in
          using user_row.user_id;
      end if;

      if signed_in then
        continue;
      end if;

      if exists (
        select 1
        from public.family_members fm
        where fm.user_id = user_row.user_id
      ) then
        continue;
      end if;

      if exists (
        select 1
        from public.invitations pi
        where private.normalized_email(pi.email) = private.normalized_email(user_row.email)
          and pi.status = 'pending'
          and pi.expires_at > pg_catalog.now()
      ) then
        continue;
      end if;

      if exists (
        select 1
        from public.invitations ai
        where ai.accepted_user_id = user_row.user_id
      ) then
        continue;
      end if;

      begin
        delete from auth.users where id = user_row.user_id;
        if audit_family is not null then
          insert into public.audit_log (family_id, actor_user_id, action, target, details)
          values (
            audit_family,
            null,
            'auth_user.deleted',
            user_row.user_id::text,
            jsonb_build_object('email', user_row.email, 'via', 'orphan_invite_cleanup')
          );
        end if;
        deleted_count := deleted_count + 1;
      exception
        when others then
          raise notice 'orphan cleanup skipped %: %', user_row.user_id, sqlerrm;
      end;
    end loop;
  end loop;

  return deleted_count;
end;
$$;

revoke all on function private.finish_accept_invitation(public.invitations, uuid) from public, anon, authenticated;
revoke all on function private.base64url_encode(bytea) from public, anon, authenticated;
revoke all on function private.invitation_token_hash(text) from public, anon, authenticated;
revoke all on function private.cleanup_orphan_invite_auth_users() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
exception
  when others then
    raise notice 'pg_cron unavailable: %', sqlerrm;
end
$$;

do $$
begin
  perform cron.unschedule('cleanup-orphan-invite-users');
exception
  when undefined_table or undefined_function or invalid_schema_name then
    null;
  when others then
    if sqlerrm not like '%job%' and sqlerrm not like '%cron%' then
      raise;
    end if;
end
$$;

do $$
begin
  perform cron.schedule(
    'cleanup-orphan-invite-users',
    '15 4 * * *',
    $cron$select private.cleanup_orphan_invite_auth_users()$cron$
  );
exception
  when undefined_table or undefined_function or invalid_schema_name then
    null;
  when others then
    if sqlerrm not like '%pg_cron%' and sqlerrm not like '%cron%' then
      raise;
    end if;
end
$$;
