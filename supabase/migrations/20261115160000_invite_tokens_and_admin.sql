-- Handoff 04: invite tokens, token RPCs, remove_member archives space, orphan auth cleanup

alter table public.invitations
  add column token_hash bytea,
  add column last_sent_at timestamptz,
  add column send_count integer not null default 0;

create unique index invitations_token_hash_key
  on public.invitations (token_hash)
  where token_hash is not null;

revoke select on public.invitations from authenticated;
grant select (
  id,
  family_id,
  email,
  role,
  label,
  create_space,
  invited_by,
  status,
  expires_at,
  accepted_user_id,
  created_at,
  updated_at,
  last_sent_at,
  send_count
) on public.invitations to authenticated;

create or replace function private.base64url_encode(data bytea)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select rtrim(
    replace(replace(encode(data, 'base64'), '+', '-'), '/', '_'),
    '='
  );
$$;

create or replace function private.invitation_token_hash(p_token text)
returns bytea
language sql
immutable
parallel safe
set search_path = ''
as $$
  select extensions.digest(p_token, 'sha256');
$$;

create or replace function private.finish_accept_invitation(
  p_invitation_id uuid,
  actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invitations%rowtype;
  member_id uuid;
  reopened_space_id uuid;
begin
  select * into invite
  from public.invitations
  where id = p_invitation_id
  for update;
  if not found then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

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

  if invite.create_space then
    if exists (
      select 1 from public.spaces s where s.owner_member_id = member_id
    ) then
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
    else
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
  end if;

  update public.invitations
  set status = 'accepted',
      accepted_user_id = actor,
      token_hash = null
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
  if not found or lower(invite.email) <> lower(actor_email) then
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

  member_id := private.finish_accept_invitation(invite.id, actor);
  return member_id;
end;
$$;

create or replace function public.issue_invitation_token(p_invitation_id uuid)
returns table (
  token text,
  email text,
  role public.family_role,
  label text,
  family_name text,
  inviter_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invitations%rowtype;
  raw_token text;
  new_hash bytea;
  fam_name text;
  inviter text;
  renew_expires timestamptz;
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
    raise exception 'invitation is not pending'
      using errcode = '42501';
  end if;

  if invite.last_sent_at is not null
     and invite.last_sent_at > pg_catalog.now() - interval '60 seconds' then
    raise exception 'please wait a minute before sending again'
      using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.audit_log al
    where al.action = 'invitation.sent'
      and al.target = invite.id::text
      and al.created_at > pg_catalog.now() - interval '1 day'
  ) >= 5 then
    raise exception 'too many emails for this invitation today'
      using errcode = '22023';
  end if;

  raw_token := private.base64url_encode(extensions.gen_random_bytes(32));
  new_hash := private.invitation_token_hash(raw_token);

  renew_expires := pg_catalog.now() + interval '14 days';

  update public.invitations
  set token_hash = new_hash,
      last_sent_at = pg_catalog.now(),
      send_count = send_count + 1,
      expires_at = renew_expires
  where id = invite.id;

  select f.name into fam_name
  from public.families f
  where f.id = invite.family_id;

  select p.display_name into inviter
  from public.profiles p
  where p.id = invite.invited_by;

  perform private.write_audit(
    invite.family_id,
    'invitation.sent',
    invite.id::text,
    jsonb_build_object('send_count', invite.send_count + 1)
  );

  return query
  select
    raw_token,
    invite.email,
    invite.role,
    invite.label,
    fam_name,
    coalesce(inviter, 'A family member'),
    renew_expires;
end;
$$;

create or replace function public.invitation_preview(p_token text)
returns table (
  status text,
  email text,
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
  invite public.invitations%rowtype;
  fam_name text;
  inviter text;
  effective_status text;
begin
  if p_token is null or char_length(btrim(p_token)) = 0 then
    return;
  end if;

  select i.* into invite
  from public.invitations i
  where i.token_hash = private.invitation_token_hash(btrim(p_token));

  if not found then
    return;
  end if;

  select f.name into fam_name
  from public.families f
  where f.id = invite.family_id;

  select p.display_name into inviter
  from public.profiles p
  where p.id = invite.invited_by;

  if invite.status = 'pending' and invite.expires_at <= pg_catalog.now() then
    effective_status := 'expired';
  else
    effective_status := invite.status::text;
  end if;

  return query
  select
    effective_status,
    invite.email,
    fam_name,
    coalesce(inviter, 'A family member'),
    invite.role,
    invite.label,
    invite.expires_at;
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

  if not found or lower(invite.email) <> lower(actor_email) then
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

  new_member_id := private.finish_accept_invitation(invite.id, actor);

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
    and lower(i.email) = lower(actor_email);
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
  select * into invite from public.invitations where id = p_invitation_id;
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
  where id = invite.id;

  perform private.write_audit(
    invite.family_id,
    'invitation.revoked',
    invite.id::text,
    jsonb_build_object('email', invite.email)
  );
end;
$$;

create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.family_members%rowtype;
  admin_count integer;
  owned_space public.spaces%rowtype;
begin
  select * into target from public.family_members where id = p_member_id;
  if not found then
    raise exception 'member not found'
      using errcode = '42501';
  end if;

  perform private.assert_family_admin(target.family_id);

  perform 1
  from public.families
  where id = target.family_id
  for update;

  if target.status <> 'active' then
    raise exception 'member is already removed'
      using errcode = '42501';
  end if;

  if target.role = 'admin' then
    select count(*)
      into admin_count
    from public.family_members fm
    where fm.family_id = target.family_id
      and fm.role = 'admin'
      and fm.status = 'active';

    if admin_count <= 1 then
      raise exception 'cannot remove the last admin'
        using errcode = '42501';
    end if;
  end if;

  update public.family_members
  set status = 'removed',
      removed_at = pg_catalog.now()
  where id = target.id;

  select * into owned_space
  from public.spaces s
  where s.owner_member_id = target.id
    and s.archived_at is null
  limit 1;

  if found then
    update public.spaces
    set archived_at = pg_catalog.now()
    where id = owned_space.id;

    perform private.write_audit(
      target.family_id,
      'space.archived',
      owned_space.id::text,
      jsonb_build_object('via', 'remove_member', 'owner_member_id', target.id)
    );
  end if;

  perform private.write_audit(
    target.family_id,
    'member.removed',
    target.id::text,
    jsonb_build_object('user_id', target.user_id, 'role', target.role)
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
begin
  for email_row in
    select distinct lower(i.email) as email
    from public.invitations i
    where i.accepted_user_id is null
      and (
        i.status in ('revoked', 'expired')
        or (i.status = 'pending' and i.expires_at <= pg_catalog.now())
      )
  loop
    select i.family_id into audit_family
    from public.invitations i
  where lower(i.email) = email_row.email
    and i.accepted_user_id is null
    order by i.created_at desc
    limit 1;

    for user_row in
      select u.id as user_id, u.email
      from auth.users u
      where lower(u.email) = email_row.email
        and u.last_sign_in_at is null
        and not exists (
          select 1
          from public.family_members fm
          where fm.user_id = u.id
            and fm.status = 'active'
        )
        and not exists (
          select 1
          from public.invitations pi
          where lower(pi.email) = lower(u.email)
            and pi.status = 'pending'
            and pi.expires_at > pg_catalog.now()
        )
    loop
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

      delete from auth.users where id = user_row.user_id;
      deleted_count := deleted_count + 1;
    end loop;
  end loop;

  return deleted_count;
end;
$$;

revoke all on function public.issue_invitation_token(uuid) from public, anon;
revoke all on function public.invitation_preview(text) from public;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.my_pending_invitations() from public, anon;

grant execute on function public.issue_invitation_token(uuid) to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated, service_role;
grant execute on function public.my_pending_invitations() to authenticated, service_role;

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
end;
$$;