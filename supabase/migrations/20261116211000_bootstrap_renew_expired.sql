-- An expired first invite left the family in place and bootstrap refused
-- to send again ("family name already exists"). There is no admin yet who
-- can use the normal resend. Renew our own pending invite, including one
-- whose expires_at has passed. A different email still cannot take the name.

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

    -- Pending includes an invite whose expires_at has passed. That row is
    -- still the first parent's invite; issue a new token and a new expiry.
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
