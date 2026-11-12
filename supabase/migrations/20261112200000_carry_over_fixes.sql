-- Carry-over fixes from handoff 03 review

create or replace function private.space_viewer_member_ids(p_space_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select fm.id
  from public.spaces s
  join public.family_members fm
    on fm.family_id = s.family_id
   and fm.status = 'active'
  join public.families f on f.id = s.family_id
  where s.id = p_space_id
    and f.deleted_at is null
    and s.family_id in (select m.family_id from private.my_memberships() m)
    and (
      fm.role in ('admin', 'grandparent')
      or s.kind = 'general'
      or fm.id = s.owner_member_id
    )
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

  if target.archived_at is not null then
    raise exception 'space is archived'
      using errcode = '42501';
  end if;

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
  reopened_space_id uuid;
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

drop policy if exists media_select on public.media;

create policy media_select on public.media
  for select
  to authenticated
  using (
    space_id in (select private.viewable_space_ids())
    and (
      message_id is null
      or exists (
        select 1
        from public.messages m
        where m.id = media.message_id
      )
    )
    and (
      deleted_at is null
      or private.is_family_admin(family_id)
      or uploader_member_id in (select m.member_id from private.my_memberships() m)
    )
  );
