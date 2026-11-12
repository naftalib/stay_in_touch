-- Row integrity and the author / admin edit rules.
-- Identity columns cannot change after insert.
-- Authors can edit their own body or caption and soft-delete.
-- Admins can soft-delete but cannot change the body or caption.
-- These triggers are security invoker so current_user is the session role.
-- Postgres and service_role (seeds, future Edge Functions) skip the
-- authorisation checks and still cannot move a row to another space.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      -- A plus-alias such as mom+noa is not a display name.
      case
        when split_part(coalesce(new.email, ''), '@', 1) like '%+%' then null
        else nullif(split_part(coalesce(new.email, ''), '@', 1), '')
      end,
      'Member'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();

revoke all on function private.handle_new_user() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function private.handle_new_user() to supabase_auth_admin;
  end if;
end;
$$;

create or replace function private.messages_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  space_family uuid;
  is_client boolean := current_user in ('authenticated', 'anon');
begin
  select s.family_id
    into space_family
  from public.spaces s
  where s.id = new.space_id;

  if space_family is null then
    raise exception 'space % does not exist', new.space_id
      using errcode = '23503';
  end if;

  if new.family_id is distinct from space_family then
    raise exception 'family_id does not match the space'
      using errcode = '23514';
  end if;

  if new.reply_to_id is not null and not exists (
    select 1
    from public.messages existing
    where existing.id = new.reply_to_id
      and existing.space_id = new.space_id
  ) then
    raise exception 'reply_to_id must reference a message in the same space'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if is_client then
      new.created_at := pg_catalog.now();
      new.edited_at := null;
      new.deleted_at := null;
      if not exists (
        select 1
        from private.my_memberships() m
        where m.member_id = new.author_member_id
          and m.family_id = new.family_id
      ) then
        raise exception 'author_member_id must be your active membership'
          using errcode = '42501';
      end if;
      if new.created_by is distinct from (select auth.uid()) then
        raise exception 'created_by must be the signed-in user'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.space_id is distinct from old.space_id
     or new.family_id is distinct from old.family_id
     or new.author_member_id is distinct from old.author_member_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.reply_to_id is distinct from old.reply_to_id
  then
    raise exception 'message identity columns are immutable'
      using errcode = '42501';
  end if;

  if is_client and old.deleted_at is not null and new.body is distinct from old.body then
    raise exception 'a deleted message cannot be edited'
      using errcode = '42501';
  end if;

  if new.body is distinct from old.body then
    if is_client and not private.caller_owns_member(old.author_member_id) then
      raise exception 'only the author can edit a message'
        using errcode = '42501';
    end if;
    new.edited_at := pg_catalog.now();
  else
    new.edited_at := old.edited_at;
  end if;

  if is_client and new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is null then
      if not private.caller_owns_member(old.author_member_id)
         and not private.is_family_admin(old.family_id)
      then
        raise exception 'only the author or an admin can delete a message'
          using errcode = '42501';
      end if;
      new.deleted_at := pg_catalog.now();
    elsif new.deleted_at is null then
      if not private.is_family_admin(old.family_id) then
        raise exception 'only an admin can restore a deleted message'
          using errcode = '42501';
      end if;
    else
      raise exception 'deleted_at cannot be changed'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger messages_before_write
  before insert or update on public.messages
  for each row
  execute function private.messages_before_write();

create or replace function private.media_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  space_family uuid;
  is_client boolean := current_user in ('authenticated', 'anon');
  is_uploader boolean;
  is_admin boolean;
begin
  select s.family_id
    into space_family
  from public.spaces s
  where s.id = new.space_id;

  if space_family is null then
    raise exception 'space % does not exist', new.space_id
      using errcode = '23503';
  end if;

  if new.family_id is distinct from space_family then
    raise exception 'family_id does not match the space'
      using errcode = '23514';
  end if;

  if new.message_id is not null and not exists (
    select 1
    from public.messages existing
    where existing.id = new.message_id
      and existing.space_id = new.space_id
      and existing.family_id = new.family_id
  ) then
    raise exception 'message_id must reference a message in the same space'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if is_client then
      new.created_at := pg_catalog.now();
      new.deleted_at := null;
      new.status := 'pending';
      new.provider := 'r2';
      new.provider_asset_id := null;
      new.size_bytes := null;
      new.width := null;
      new.height := null;
      new.duration_s := null;
      if not exists (
        select 1
        from private.my_memberships() m
        where m.member_id = new.uploader_member_id
          and m.family_id = new.family_id
      ) then
        raise exception 'uploader_member_id must be your active membership'
          using errcode = '42501';
      end if;
      if new.created_by is distinct from (select auth.uid()) then
        raise exception 'created_by must be the signed-in user'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.space_id is distinct from old.space_id
     or new.family_id is distinct from old.family_id
     or new.uploader_member_id is distinct from old.uploader_member_id
     or new.message_id is distinct from old.message_id
     or new.kind is distinct from old.kind
     or new.r2_key is distinct from old.r2_key
     or new.thumb_key is distinct from old.thumb_key
     or new.content_type is distinct from old.content_type
     or new.provider is distinct from old.provider
     or new.provider_asset_id is distinct from old.provider_asset_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
  then
    raise exception 'media identity columns are immutable'
      using errcode = '42501';
  end if;

  if is_client then
    is_uploader := private.caller_owns_member(old.uploader_member_id);
    is_admin := private.is_family_admin(old.family_id);

    if old.deleted_at is not null and new.caption is distinct from old.caption then
      raise exception 'deleted media cannot be edited'
        using errcode = '42501';
    end if;

    if new.caption is distinct from old.caption and not is_uploader then
      raise exception 'only the uploader can edit a media caption'
        using errcode = '42501';
    end if;

    if new.deleted_at is distinct from old.deleted_at then
      if old.deleted_at is null then
        if not is_uploader and not is_admin then
          raise exception 'only the uploader or an admin can delete media'
            using errcode = '42501';
        end if;
        new.deleted_at := pg_catalog.now();
      elsif new.deleted_at is null then
        if not is_admin then
          raise exception 'only an admin can restore deleted media'
            using errcode = '42501';
        end if;
      else
        raise exception 'deleted_at cannot be changed'
          using errcode = '42501';
      end if;
    end if;

    if new.status is distinct from old.status
       or new.size_bytes is distinct from old.size_bytes
       or new.width is distinct from old.width
       or new.height is distinct from old.height
       or new.duration_s is distinct from old.duration_s
    then
      raise exception 'clients cannot change media file metadata'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger media_before_write
  before insert or update on public.media
  for each row
  execute function private.media_before_write();

create or replace function private.space_reads_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.family_members fm
    join public.spaces s on s.family_id = fm.family_id
    where fm.id = new.member_id
      and s.id = new.space_id
  ) then
    raise exception 'space read member and space must belong to the same family'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger space_reads_before_write
  before insert or update on public.space_reads
  for each row
  execute function private.space_reads_before_write();

create or replace function private.notification_prefs_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.space_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.family_members fm
    join public.spaces s on s.family_id = fm.family_id
    where fm.id = new.member_id
      and s.id = new.space_id
  ) then
    raise exception 'notification preference space must belong to the member family'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger notification_prefs_before_write
  before insert or update on public.notification_prefs
  for each row
  execute function private.notification_prefs_before_write();

revoke all on function private.messages_before_write() from public, anon, authenticated;
revoke all on function private.media_before_write() from public, anon, authenticated;
revoke all on function private.space_reads_before_write() from public, anon, authenticated;
revoke all on function private.notification_prefs_before_write() from public, anon, authenticated;
