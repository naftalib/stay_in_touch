-- Reset locks the family row and then the invitation. These paths used to
-- lock the invitation first and then insert an audit or membership row,
-- which takes FOR KEY SHARE on the family. If reset ran in between, each
-- side waited for the other and PostgreSQL cancelled one. Take the family
-- row first, then the invitation, on every path that does both.

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

  -- lock-order: family
  select f.id
    into fam
  from public.families f
  where btrim(f.name) = btrim(p_family_name)
    and f.deleted_at is null
  order by f.created_at
  limit 1
  for update;

  -- The profile and email checks above ran before this lock. Read them again
  -- before any invite row is written.
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

    -- Pending includes an invite whose expires_at has passed. That row is
    -- still the first parent's invite; issue a new token and a new expiry.
    -- lock-order: invitation
    select i.id
      into invite_id
    from public.invitations i
    where i.family_id = fam
      and private.normalized_email(i.email) = normalized
      and i.status = 'pending'
    order by i.created_at desc
    limit 1
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
  peeked public.invitations%rowtype;
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

  select * into peeked
  from public.invitations
  where id = p_invitation_id;
  if not found
     or private.normalized_email(peeked.email) <> private.normalized_email(actor_email) then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  -- lock-order: family
  perform 1
  from public.families f
  where f.id = peeked.family_id
  for update;
  if not found then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  -- lock-order: invitation
  select * into invite
  from public.invitations
  where id = peeked.id
  for update;
  if not found
     or private.normalized_email(invite.email) <> private.normalized_email(actor_email)
     or invite.family_id is distinct from peeked.family_id then
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
  peeked public.invitations%rowtype;
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

  select * into peeked
  from public.invitations
  where token_hash = private.invitation_token_hash(btrim(p_token));

  if not found
     or private.normalized_email(peeked.email) <> private.normalized_email(actor_email) then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  -- lock-order: family
  perform 1
  from public.families f
  where f.id = peeked.family_id
  for update;
  if not found then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  -- lock-order: invitation
  select * into invite
  from public.invitations
  where id = peeked.id
  for update;

  if not found
     or private.normalized_email(invite.email) <> private.normalized_email(actor_email)
     or invite.family_id is distinct from peeked.family_id then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  -- The peek matched this token. A resend can rotate token_hash while this
  -- transaction waits on the family row. The locked row has to still match.
  if invite.token_hash is distinct from private.invitation_token_hash(btrim(p_token)) then
    raise exception 'invitation token is no longer valid'
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

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  peeked public.invitations;
  invite public.invitations;
begin
  select * into peeked
  from public.invitations
  where id = p_invitation_id;
  if not found then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  -- lock-order: family
  perform 1
  from public.families f
  where f.id = peeked.family_id
  for update;
  if not found then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  -- lock-order: invitation
  select * into invite
  from public.invitations
  where id = peeked.id
  for update;
  if not found or invite.family_id is distinct from peeked.family_id then
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
  peeked public.invitations%rowtype;
  invite public.invitations%rowtype;
  raw_token text;
  new_hash bytea;
  fam_name text;
  inviter text;
  renew_expires timestamptz;
begin
  select * into peeked
  from public.invitations
  where id = p_invitation_id;
  if not found then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  -- lock-order: family
  perform 1
  from public.families f
  where f.id = peeked.family_id
  for update;
  if not found then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  -- lock-order: invitation
  select * into invite
  from public.invitations
  where id = peeked.id
  for update;
  if not found or invite.family_id is distinct from peeked.family_id then
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
