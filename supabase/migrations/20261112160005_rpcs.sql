-- Privileged writes go through these RPCs. Each admin or invite change checks
-- the caller and appends an audit_log row. security definer is required because
-- clients have no insert/update grants on memberships, invitations, spaces, or
-- the audit log.
--
-- space_audience, unread_counts, and mark_space_read are security invoker:
-- RLS already expresses who can read those rows.

create or replace function private.assert_family_admin(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_family_admin(p_family_id) then
    raise exception 'admin only'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.write_audit(
  p_family_id uuid,
  p_action text,
  p_target text,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (family_id, actor_user_id, action, target, details)
  values (
    p_family_id,
    (select auth.uid()),
    p_action,
    p_target,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.assert_family_admin(uuid) from public, anon, authenticated;
revoke all on function private.write_audit(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public.create_invitation(
  p_family_id uuid,
  p_email text,
  p_role public.family_role,
  p_label text,
  p_create_space boolean default false,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  normalized_email text;
  expires_at timestamptz;
begin
  perform private.assert_family_admin(p_family_id);

  normalized_email := lower(btrim(coalesce(p_email, '')));
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email'
      using errcode = '22023';
  end if;

  if p_label is null or char_length(btrim(p_label)) = 0 then
    raise exception 'label is required'
      using errcode = '22023';
  end if;

  if coalesce(p_create_space, false) and p_role = 'grandparent' then
    raise exception 'grandparents do not get a space'
      using errcode = '22023';
  end if;

  expires_at := coalesce(p_expires_at, pg_catalog.now() + interval '14 days');
  if expires_at <= pg_catalog.now() then
    raise exception 'invitation must expire in the future'
      using errcode = '22023';
  end if;

  insert into public.invitations (
    family_id,
    email,
    role,
    label,
    create_space,
    invited_by,
    status,
    expires_at
  )
  values (
    p_family_id,
    normalized_email,
    p_role,
    btrim(p_label),
    coalesce(p_create_space, false),
    (select auth.uid()),
    'pending',
    expires_at
  )
  returning id into new_id;

  perform private.write_audit(
    p_family_id,
    'invitation.created',
    new_id::text,
    jsonb_build_object(
      'email', normalized_email,
      'role', p_role,
      'label', btrim(p_label),
      'create_space', coalesce(p_create_space, false)
    )
  );

  return new_id;
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
  set status = 'revoked'
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
begin
  select * into target from public.family_members where id = p_member_id;
  if not found then
    raise exception 'member not found'
      using errcode = '42501';
  end if;

  perform private.assert_family_admin(target.family_id);

  -- Serialize last-admin checks with a concurrent remove or demote.
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

  perform private.write_audit(
    target.family_id,
    'member.removed',
    target.id::text,
    jsonb_build_object('user_id', target.user_id, 'role', target.role)
  );
end;
$$;

create or replace function public.change_member_role(
  p_member_id uuid,
  p_role public.family_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.family_members%rowtype;
  admin_count integer;
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
    raise exception 'cannot change the role of a removed member'
      using errcode = '42501';
  end if;

  if p_role = 'grandparent' and exists (
    select 1
    from public.spaces s
    where s.owner_member_id = target.id
  ) then
    raise exception 'grandparents do not get a space'
      using errcode = '22023';
  end if;

  if target.role = 'admin' and p_role <> 'admin' then
    select count(*)
      into admin_count
    from public.family_members fm
    where fm.family_id = target.family_id
      and fm.role = 'admin'
      and fm.status = 'active';

    if admin_count <= 1 then
      raise exception 'cannot demote the last admin'
        using errcode = '42501';
    end if;
  end if;

  update public.family_members
  set role = p_role
  where id = target.id;

  perform private.write_audit(
    target.family_id,
    'member.role_changed',
    target.id::text,
    jsonb_build_object('from', target.role, 'to', p_role)
  );
end;
$$;

create or replace function public.create_member_space(
  p_family_id uuid,
  p_owner_member_id uuid,
  p_title text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner public.family_members%rowtype;
  new_id uuid;
begin
  perform private.assert_family_admin(p_family_id);

  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'title is required'
      using errcode = '22023';
  end if;

  select * into owner
  from public.family_members
  where id = p_owner_member_id
    and family_id = p_family_id;

  if not found or owner.status <> 'active' then
    raise exception 'owner must be an active member of the family'
      using errcode = '42501';
  end if;

  if owner.role = 'grandparent' then
    raise exception 'grandparents do not get a space'
      using errcode = '22023';
  end if;

  insert into public.spaces (
    family_id,
    kind,
    owner_member_id,
    title,
    sort_order,
    created_by
  )
  values (
    p_family_id,
    'member',
    owner.id,
    btrim(p_title),
    10,
    (select auth.uid())
  )
  returning id into new_id;

  perform private.write_audit(
    p_family_id,
    'space.created',
    new_id::text,
    jsonb_build_object('owner_member_id', owner.id, 'title', btrim(p_title))
  );

  return new_id;
end;
$$;

create or replace function public.rename_space(p_space_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.spaces%rowtype;
begin
  select * into target from public.spaces where id = p_space_id;
  if not found then
    raise exception 'space not found'
      using errcode = '42501';
  end if;

  perform private.assert_family_admin(target.family_id);

  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'title is required'
      using errcode = '22023';
  end if;

  update public.spaces
  set title = btrim(p_title)
  where id = target.id;

  perform private.write_audit(
    target.family_id,
    'space.renamed',
    target.id::text,
    jsonb_build_object('from', target.title, 'to', btrim(p_title))
  );
end;
$$;

create or replace function public.archive_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.spaces%rowtype;
begin
  select * into target from public.spaces where id = p_space_id;
  if not found then
    raise exception 'space not found'
      using errcode = '42501';
  end if;

  perform private.assert_family_admin(target.family_id);

  if target.archived_at is not null then
    return;
  end if;

  update public.spaces
  set archived_at = pg_catalog.now()
  where id = target.id;

  perform private.write_audit(
    target.family_id,
    'space.archived',
    target.id::text,
    jsonb_build_object('title', target.title)
  );
end;
$$;

create or replace function public.unarchive_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.spaces%rowtype;
begin
  select * into target from public.spaces where id = p_space_id;
  if not found then
    raise exception 'space not found'
      using errcode = '42501';
  end if;

  perform private.assert_family_admin(target.family_id);

  if target.archived_at is null then
    return;
  end if;

  update public.spaces
  set archived_at = null
  where id = target.id;

  perform private.write_audit(
    target.family_id,
    'space.unarchived',
    target.id::text,
    jsonb_build_object('title', target.title)
  );
end;
$$;

-- Matches the signed-in user's confirmed auth.users email, not a client-supplied
-- email or role. A parent cannot accept a child's +alias invite while signed
-- in as the parent: the alias is its own user, and the emails do not match.
-- A removed member accepting a new invite is reactivated in place.
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
        and archived_at is not null;
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

create or replace function public.space_audience(p_space_id uuid)
returns table (
  user_id uuid,
  display_name text,
  label text,
  role public.family_role
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_space_id is null
     or p_space_id not in (select private.viewable_space_ids())
  then
    raise exception 'space not found'
      using errcode = '42501';
  end if;

  return query
  select p.id, p.display_name, fm.label, fm.role
  from public.family_members fm
  join public.profiles p on p.id = fm.user_id
  where fm.id in (select private.space_viewer_member_ids(p_space_id))
  order by fm.label, p.display_name;
end;
$$;

create or replace function public.unread_counts(p_family_id uuid)
returns table (
  space_id uuid,
  unread_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller_member uuid;
begin
  select m.member_id
    into caller_member
  from private.my_memberships() m
  where m.family_id = p_family_id;

  if caller_member is null then
    raise exception 'not a member of this family'
      using errcode = '42501';
  end if;

  return query
  select
    s.id,
    (
      -- One item per message. Attached media does not add another.
      select count(*)::bigint
      from public.messages msg
      where msg.space_id = s.id
        and msg.deleted_at is null
        and (
          (
            msg.author_member_id <> caller_member
            and msg.created_at > read_at.last_read_at
          )
          or exists (
            select 1
            from public.media med
            where med.message_id = msg.id
              and med.space_id = s.id
              and med.deleted_at is null
              and med.uploader_member_id <> caller_member
              and med.created_at > read_at.last_read_at
          )
        )
    )
    + (
      -- Standalone media, not attached to a message, is its own item.
      select count(*)::bigint
      from public.media med
      where med.space_id = s.id
        and med.message_id is null
        and med.deleted_at is null
        and med.uploader_member_id <> caller_member
        and med.created_at > read_at.last_read_at
    )
  from public.spaces s
  cross join lateral (
    select coalesce(
      (
        select sr.last_read_at
        from public.space_reads sr
        where sr.space_id = s.id
          and sr.member_id = caller_member
      ),
      '-infinity'::timestamptz
    ) as last_read_at
  ) read_at
  where s.family_id = p_family_id
    and s.id in (select private.viewable_space_ids())
  order by s.sort_order, s.created_at;
end;
$$;

create or replace function public.mark_space_read(p_space_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_member uuid;
  space_family uuid;
begin
  if p_space_id is null
     or p_space_id not in (select private.viewable_space_ids())
  then
    raise exception 'space not found'
      using errcode = '42501';
  end if;

  select s.family_id into space_family from public.spaces s where s.id = p_space_id;

  select m.member_id
    into caller_member
  from private.my_memberships() m
  where m.family_id = space_family;

  if caller_member is null then
    raise exception 'space not found'
      using errcode = '42501';
  end if;

  insert into public.space_reads as sr (member_id, space_id, last_read_at)
  values (caller_member, p_space_id, pg_catalog.now())
  on conflict (member_id, space_id) do update
    set last_read_at = excluded.last_read_at;
end;
$$;

revoke all on function public.create_invitation(uuid, text, public.family_role, text, boolean, timestamptz) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
revoke all on function public.change_member_role(uuid, public.family_role) from public, anon;
revoke all on function public.create_member_space(uuid, uuid, text) from public, anon;
revoke all on function public.rename_space(uuid, text) from public, anon;
revoke all on function public.archive_space(uuid) from public, anon;
revoke all on function public.unarchive_space(uuid) from public, anon;
revoke all on function public.accept_invite(uuid) from public, anon;
revoke all on function public.space_audience(uuid) from public, anon;
revoke all on function public.unread_counts(uuid) from public, anon;
revoke all on function public.mark_space_read(uuid) from public, anon;

grant execute on function public.create_invitation(uuid, text, public.family_role, text, boolean, timestamptz) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.change_member_role(uuid, public.family_role) to authenticated;
grant execute on function public.create_member_space(uuid, uuid, text) to authenticated;
grant execute on function public.rename_space(uuid, text) to authenticated;
grant execute on function public.archive_space(uuid) to authenticated;
grant execute on function public.unarchive_space(uuid) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.space_audience(uuid) to authenticated;
grant execute on function public.unread_counts(uuid) to authenticated;
grant execute on function public.mark_space_read(uuid) to authenticated;

grant execute on function public.create_invitation(uuid, text, public.family_role, text, boolean, timestamptz) to service_role;
grant execute on function public.revoke_invitation(uuid) to service_role;
grant execute on function public.remove_member(uuid) to service_role;
grant execute on function public.change_member_role(uuid, public.family_role) to service_role;
grant execute on function public.create_member_space(uuid, uuid, text) to service_role;
grant execute on function public.rename_space(uuid, text) to service_role;
grant execute on function public.archive_space(uuid) to service_role;
grant execute on function public.unarchive_space(uuid) to service_role;
grant execute on function public.accept_invite(uuid) to service_role;
grant execute on function public.space_audience(uuid) to service_role;
grant execute on function public.unread_counts(uuid) to service_role;
grant execute on function public.mark_space_read(uuid) to service_role;
