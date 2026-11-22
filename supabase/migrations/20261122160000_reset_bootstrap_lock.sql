-- Hold row locks across the reset so a sign-in or an invite update cannot
-- land after the checks and before the deletes. Lock order is the family
-- row, then its invitations, then its spaces, then the auth user.
-- bootstrap_family, accept_invitation, accept_invite, revoke_invitation,
-- and issue_invitation_token take that same family lock before the
-- invitation. An audit insert needs the family row, so the opposite order
-- deadlocks. The auth user row stays locked from the sign-in read through
-- the delete. The delete itself also refuses a row that has since signed
-- in or gained a session.

create or replace function private.reset_unjoined_bootstrap_family(
  p_family_name text,
  p_email text,
  p_confirm text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text;
  fam uuid;
  name_count integer;
  uid uuid;
  creator uuid;
  invite_by uuid;
  invite_accepted uuid;
  invite_email text;
  invite_status text;
  space_by uuid;
  space_kind text;
  space_title text;
  space_owner uuid;
  invite_count integer;
  space_count integer;
  signed_at timestamptz;
  has_sessions boolean;
  signed_in boolean;
begin
  perform private.assert_service_role();

  if p_confirm is distinct from 'confirm-reset' then
    raise exception 'confirmation is required'
      using errcode = '22023';
  end if;

  if p_family_name is null or char_length(btrim(p_family_name)) = 0 then
    raise exception 'family name is required'
      using errcode = '22023';
  end if;

  normalized := private.normalized_email(p_email);
  if normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email'
      using errcode = '22023';
  end if;

  select count(*)::integer
    into name_count
  from public.families f
  where btrim(f.name) = btrim(p_family_name)
    and f.deleted_at is null;

  if name_count = 0 then
    return false;
  end if;

  if name_count > 1 then
    raise exception 'family name is not unique'
      using errcode = '22023';
  end if;

  -- lock-order: family
  select f.id, f.created_by
    into fam, creator
  from public.families f
  where btrim(f.name) = btrim(p_family_name)
    and f.deleted_at is null
  for update;

  -- The name count above ran before this lock. Count again while the
  -- matching rows are locked.
  select count(*)::integer
    into name_count
  from public.families f
  where btrim(f.name) = btrim(p_family_name)
    and f.deleted_at is null;

  if name_count = 0 then
    return false;
  end if;

  if name_count > 1 then
    raise exception 'family name is not unique'
      using errcode = '22023';
  end if;

  -- Child inserts wait on the family row. Updates of the invite or space
  -- do not, so lock those rows before reading them. The invitation lock
  -- stays after the family lock; see the migration header.
  -- lock-order: invitation
  perform 1
  from public.invitations i
  where i.family_id = fam
  for update;

  perform 1
  from public.spaces s
  where s.family_id = fam
  for update;

  if exists (
    select 1
    from public.family_members fm
    where fm.family_id = fam
  ) then
    raise exception 'this family has members'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.messages m where m.family_id = fam
  ) or exists (
    select 1 from public.media m where m.family_id = fam
  ) or exists (
    select 1 from public.notification_outbox o where o.family_id = fam
  ) or exists (
    select 1
    from public.space_reads sr
    join public.spaces s on s.id = sr.space_id
    where s.family_id = fam
  ) or exists (
    select 1
    from public.notification_prefs np
    join public.spaces s on s.id = np.space_id
    where s.family_id = fam
  ) then
    raise exception 'this family has content'
      using errcode = '22023';
  end if;

  select count(*)::integer
    into invite_count
  from public.invitations i
  where i.family_id = fam;

  select count(*)::integer
    into space_count
  from public.spaces s
  where s.family_id = fam;

  select
    private.normalized_email(i.email),
    i.status::text,
    i.invited_by,
    i.accepted_user_id
    into invite_email, invite_status, invite_by, invite_accepted
  from public.invitations i
  where i.family_id = fam
  limit 1;

  select s.kind::text, s.title, s.owner_member_id, s.created_by
    into space_kind, space_title, space_owner, space_by
  from public.spaces s
  where s.family_id = fam
  limit 1;

  if invite_count <> 1
    or space_count <> 1
    or invite_status is distinct from 'pending'
    or invite_accepted is not null
    or invite_email is distinct from normalized
    or space_kind is distinct from 'general'
    or space_title is distinct from 'General'
    or space_owner is not null
    or invite_by is distinct from creator
    or space_by is distinct from creator
  then
    raise exception 'this family is not an unjoined bootstrap'
      using errcode = '22023';
  end if;

  select u.id, u.last_sign_in_at
    into uid, signed_at
  from auth.users u
  where u.id = creator
    and private.normalized_email(u.email) = normalized
  for update;

  if uid is null then
    raise exception 'this family is not an unjoined bootstrap'
      using errcode = '22023';
  end if;

  if signed_at is not null then
    raise exception 'this family has been signed into'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'sessions'
  ) into has_sessions;

  if has_sessions then
    execute 'select exists (select 1 from auth.sessions where user_id = $1)'
      into signed_in
      using uid;
    if signed_in then
      raise exception 'this family has been signed into'
        using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1
    from public.families f
    where f.created_by = uid
      and f.id <> fam
  ) or exists (
    select 1
    from public.family_members fm
    where fm.user_id = uid
      or fm.invited_by = uid
  ) or exists (
    select 1
    from public.spaces s
    where s.created_by = uid
      and s.family_id <> fam
  ) or exists (
    select 1
    from public.messages m
    where m.created_by = uid
  ) or exists (
    select 1
    from public.media m
    where m.created_by = uid
  ) or exists (
    select 1
    from public.invitations i
    where i.family_id <> fam
      and (
        i.invited_by = uid
        or i.accepted_user_id = uid
        or private.normalized_email(i.email) = normalized
      )
  ) or exists (
    select 1
    from public.audit_log a
    where a.actor_user_id = uid
      and a.family_id <> fam
  ) or exists (
    select 1
    from public.push_subscriptions ps
    where ps.user_id = uid
  ) or exists (
    select 1
    from public.notification_outbox o
    where o.recipient_user_id = uid
  ) then
    raise exception 'the auth user is used outside this family'
      using errcode = '22023';
  end if;

  -- The invite and space locks are still held, so re-read the shape before
  -- deleting. A sign-in that does not touch those rows is checked again
  -- immediately before the auth user delete.
  select
    private.normalized_email(i.email),
    i.status::text,
    i.invited_by,
    i.accepted_user_id
    into invite_email, invite_status, invite_by, invite_accepted
  from public.invitations i
  where i.family_id = fam
  for update;

  select s.kind::text, s.title, s.owner_member_id, s.created_by
    into space_kind, space_title, space_owner, space_by
  from public.spaces s
  where s.family_id = fam
  for update;

  if invite_count <> 1
    or space_count <> 1
    or invite_status is distinct from 'pending'
    or invite_accepted is not null
    or invite_email is distinct from normalized
    or space_kind is distinct from 'general'
    or space_title is distinct from 'General'
    or space_owner is not null
    or invite_by is distinct from creator
    or space_by is distinct from creator
  then
    raise exception 'this family is not an unjoined bootstrap'
      using errcode = '22023';
  end if;

  delete from public.audit_log where family_id = fam;
  delete from public.invitations where family_id = fam;
  delete from public.spaces where family_id = fam;
  delete from public.families where id = fam;

  if exists (
    select 1 from public.families f where f.created_by = uid
  ) or exists (
    select 1
    from public.family_members fm
    where fm.user_id = uid
      or fm.invited_by = uid
  ) or exists (
    select 1 from public.spaces s where s.created_by = uid
  ) or exists (
    select 1 from public.messages m where m.created_by = uid
  ) or exists (
    select 1 from public.media m where m.created_by = uid
  ) or exists (
    select 1
    from public.invitations i
    where i.invited_by = uid
      or i.accepted_user_id = uid
      or private.normalized_email(i.email) = normalized
  ) or exists (
    select 1 from public.audit_log a where a.actor_user_id = uid
  ) or exists (
    select 1 from public.push_subscriptions ps where ps.user_id = uid
  ) or exists (
    select 1 from public.notification_outbox o where o.recipient_user_id = uid
  ) then
    raise exception 'the auth user is used outside this family'
      using errcode = '22023';
  end if;

  select u.last_sign_in_at
    into signed_at
  from auth.users u
  where u.id = uid
  for update;

  if signed_at is not null then
    raise exception 'this family has been signed into'
      using errcode = '22023';
  end if;

  if has_sessions then
    execute 'select exists (select 1 from auth.sessions where user_id = $1)'
      into signed_in
      using uid;
    if signed_in then
      raise exception 'this family has been signed into'
        using errcode = '22023';
    end if;
    execute $del$
      delete from auth.users
      where id = $1
        and last_sign_in_at is null
        and not exists (select 1 from auth.sessions where user_id = $1)
    $del$
      using uid;
  else
    delete from auth.users
    where id = uid
      and last_sign_in_at is null;
  end if;

  if not found then
    raise exception 'this family has been signed into'
      using errcode = '22023';
  end if;

  return true;
end;
$$;

create or replace function public.reset_unjoined_bootstrap_family(
  p_family_name text,
  p_email text,
  p_confirm text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  return private.reset_unjoined_bootstrap_family(p_family_name, p_email, p_confirm);
end;
$$;

revoke all on function private.reset_unjoined_bootstrap_family(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.reset_unjoined_bootstrap_family(text, text, text) from public, anon, authenticated;
grant execute on function public.reset_unjoined_bootstrap_family(text, text, text) to service_role;
