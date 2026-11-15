-- Photos: reservations, attach-once posts, pending hidden, ready-only
-- unread counts, ids-only Realtime, private photos bucket, orphan selector.

alter table public.messages drop constraint messages_body_not_blank;
alter table public.messages
  add constraint messages_body_not_blank check (body is not null);

alter table public.media
  add column expected_bytes integer,
  add column expected_thumb_bytes integer;

alter table public.media
  add constraint media_expected_bytes_range
    check (expected_bytes is null or (expected_bytes >= 1 and expected_bytes <= 5242880)),
  add constraint media_expected_thumb_bytes_range
    check (
      expected_thumb_bytes is null
      or (expected_thumb_bytes >= 1 and expected_thumb_bytes <= 5242880)
    );

create table private.app_limits (
  id boolean primary key default true check (id),
  photo_storage_cap_bytes bigint not null
);

insert into private.app_limits (photo_storage_cap_bytes) values (838860800);

revoke all on table private.app_limits from public, anon, authenticated;

create or replace function private.photo_storage_cap_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select photo_storage_cap_bytes from private.app_limits limit 1
$$;

create or replace function private.assert_service_role()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  -- pgTAP and migrations connect as the database owner. PostgREST sessions
  -- stay `authenticator` and must present a service-role JWT instead.
  if session_user in ('postgres', 'supabase_admin') then
    return;
  end if;
  raise exception 'forbidden'
    using errcode = '42501';
end;
$$;

-- A blank message is allowed only while a photo is attached. When the last
-- photo is removed, the message is soft-deleted so the thread shows
-- "Message deleted" instead of an empty bubble.
create or replace function private.retire_blank_message(
  p_message_id uuid,
  p_except_media uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_message_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.messages m
    where m.id = p_message_id
      and m.deleted_at is null
      and char_length(btrim(m.body)) = 0
  ) and not exists (
    select 1
    from public.media med
    where med.message_id = p_message_id
      and med.deleted_at is null
      and med.id is distinct from p_except_media
  ) then
    update public.messages
    set deleted_at = pg_catalog.now()
    where id = p_message_id
      and deleted_at is null;
  end if;
end;
$$;

create or replace function private.messages_need_text_or_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is null
     and char_length(btrim(new.body)) = 0
     and not exists (
       select 1
       from public.media med
       where med.message_id = new.id
         and med.deleted_at is null
     )
  then
    raise exception 'a message needs text or a photo'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger messages_need_text_or_photo
  after insert or update of body, deleted_at on public.messages
  deferrable initially deferred
  for each row
  execute function private.messages_need_text_or_photo();

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

  if is_client and char_length(btrim(new.body)) = 0 then
    if tg_op = 'INSERT' or not exists (
      select 1
      from public.media med
      where med.message_id = new.id
        and med.deleted_at is null
    ) then
      raise exception 'a message needs text or a photo'
        using errcode = '23514';
    end if;
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

create or replace function private.media_before_write()
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
      if new.r2_key is null or new.r2_key !~ (
        '^f/' || new.family_id::text || '/s/' || new.space_id::text
        || '/' || new.id::text || '/original\.[a-z0-9]+$'
      ) then
        raise exception 'media r2_key does not match the row'
          using errcode = '23514';
      end if;
      if new.thumb_key is not null and new.thumb_key is distinct from (
        'f/' || new.family_id::text || '/s/' || new.space_id::text
        || '/' || new.id::text || '/thumb.jpg'
      ) then
        raise exception 'media thumb_key does not match the row'
          using errcode = '23514';
      end if;
      raise exception 'photos are added with reserve_photo_upload'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.space_id is distinct from old.space_id
     or new.family_id is distinct from old.family_id
     or new.uploader_member_id is distinct from old.uploader_member_id
     or new.kind is distinct from old.kind
     or new.r2_key is distinct from old.r2_key
     or new.thumb_key is distinct from old.thumb_key
     or new.content_type is distinct from old.content_type
     or new.provider_asset_id is distinct from old.provider_asset_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
  then
    raise exception 'media identity columns are immutable'
      using errcode = '42501';
  end if;

  if new.message_id is distinct from old.message_id
     and (is_client or old.message_id is not null)
  then
    raise exception 'media identity columns are immutable'
      using errcode = '42501';
  end if;

  if is_client and new.provider is distinct from old.provider then
    raise exception 'media identity columns are immutable'
      using errcode = '42501';
  end if;

  if is_client then
    if old.deleted_at is not null and new.caption is distinct from old.caption then
      raise exception 'deleted media cannot be edited'
        using errcode = '42501';
    end if;

    if new.caption is distinct from old.caption
       and not private.caller_owns_member(old.uploader_member_id)
    then
      raise exception 'only the uploader can edit a media caption'
        using errcode = '42501';
    end if;

    if new.deleted_at is distinct from old.deleted_at then
      if old.deleted_at is null then
        if not private.caller_owns_member(old.uploader_member_id)
           and not private.is_family_admin(old.family_id)
        then
          raise exception 'only the uploader or an admin can delete media'
            using errcode = '42501';
        end if;
        new.deleted_at := pg_catalog.now();
      elsif new.deleted_at is null then
        if not private.is_family_admin(old.family_id) then
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
       or new.expected_bytes is distinct from old.expected_bytes
       or new.expected_thumb_bytes is distinct from old.expected_thumb_bytes
    then
      raise exception 'clients cannot change media file metadata'
        using errcode = '42501';
    end if;
  end if;

  if old.deleted_at is null and new.deleted_at is not null and new.message_id is not null then
    if exists (
      select 1
      from public.messages msg
      where msg.id = new.message_id
        and msg.deleted_at is null
        and char_length(btrim(msg.body)) = 0
    ) and not exists (
      select 1
      from public.media med
      where med.message_id = new.message_id
        and med.deleted_at is null
        and med.id is distinct from new.id
    ) then
      update public.messages
      set deleted_at = pg_catalog.now()
      where id = new.message_id
        and deleted_at is null;
    end if;
  end if;

  return new;
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
    and (
      status = 'ready'
      or uploader_member_id in (select m.member_id from private.my_memberships() m)
    )
  );

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
              and med.status = 'ready'
              and med.uploader_member_id <> caller_member
              and med.created_at > read_at.last_read_at
          )
        )
    )
    + (
      select count(*)::bigint
      from public.media med
      where med.space_id = s.id
        and med.message_id is null
        and med.deleted_at is null
        and med.status = 'ready'
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

create or replace function public.reserve_photo_upload(
  p_space_id uuid,
  p_bytes integer,
  p_thumb_bytes integer,
  p_width integer,
  p_height integer,
  p_caption text default null
)
returns table (
  media_id uuid,
  key text,
  thumb_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_member uuid;
  v_id uuid;
  v_key text;
  v_thumb text;
  v_used bigint;
  v_cap bigint;
  v_today integer;
  v_caption text;
begin
  if p_space_id is null
     or p_space_id not in (select private.postable_space_ids())
  then
    raise exception 'you cannot post in this space'
      using errcode = '42501';
  end if;

  select s.family_id into v_family
  from public.spaces s
  where s.id = p_space_id;

  select m.member_id into v_member
  from private.my_memberships() m
  where m.family_id = v_family;

  if v_member is null or (select auth.uid()) is null then
    raise exception 'you cannot post in this space'
      using errcode = '42501';
  end if;

  if p_bytes is null or p_thumb_bytes is null
     or p_bytes < 1 or p_thumb_bytes < 1
     or p_bytes > 5242880 or p_thumb_bytes > 5242880
  then
    raise exception 'each photo file must be between 1 byte and 5 MB'
      using errcode = '22023';
  end if;

  if p_width is null or p_height is null
     or p_width < 1 or p_height < 1
     or p_width > 2048 or p_height > 2048
  then
    raise exception 'photo dimensions must be between 1 and 2048 pixels on the long edge'
      using errcode = '22023';
  end if;

  select count(*)::integer into v_today
  from public.media med
  where med.uploader_member_id = v_member
    and med.created_at > pg_catalog.now() - interval '24 hours';

  if v_today >= 100 then
    raise exception 'You''ve added 100 photos today. Try again tomorrow.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(83427601);

  select private.photo_storage_cap_bytes() into v_cap;

  select coalesce(sum(
    case
      when med.status = 'ready' then coalesce(med.size_bytes, 0) + coalesce(med.expected_thumb_bytes, 0)
      when med.status = 'pending' then coalesce(med.expected_bytes, 0) + coalesce(med.expected_thumb_bytes, 0)
      else 0
    end
  ), 0) into v_used
  from public.media med;

  if v_used + p_bytes + p_thumb_bytes > v_cap then
    raise exception 'This family has reached its photo storage limit.'
      using errcode = '22023';
  end if;

  v_id := gen_random_uuid();
  v_key := 'f/' || v_family::text || '/s/' || p_space_id::text || '/' || v_id::text || '/original.jpg';
  v_thumb := 'f/' || v_family::text || '/s/' || p_space_id::text || '/' || v_id::text || '/thumb.jpg';
  v_caption := nullif(btrim(p_caption), '');

  insert into public.media (
    id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key,
    content_type, width, height, status, provider, caption,
    expected_bytes, expected_thumb_bytes, created_by
  ) values (
    v_id, p_space_id, v_family, v_member, 'photo', v_key, v_thumb,
    'image/jpeg', p_width, p_height, 'pending', 'r2', v_caption,
    p_bytes, p_thumb_bytes, (select auth.uid())
  );

  perform private.write_audit(
    v_family,
    'photo.reserved',
    v_id::text,
    jsonb_build_object('space_id', p_space_id, 'bytes', p_bytes, 'thumb_bytes', p_thumb_bytes)
  );

  media_id := v_id;
  key := v_key;
  thumb_key := v_thumb;
  return next;
end;
$$;

create or replace function public.mark_media_ready(
  p_media_id uuid,
  p_bytes integer,
  p_thumb_bytes integer,
  p_provider text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();

  if p_provider is null or p_provider not in ('supabase', 'r2', 'b2', 'mux') then
    raise exception 'unknown media provider'
      using errcode = '22023';
  end if;

  update public.media
  set status = 'ready',
      size_bytes = p_bytes,
      expected_thumb_bytes = p_thumb_bytes,
      provider = p_provider::public.media_provider
  where id = p_media_id
    and status = 'pending';
end;
$$;

create or replace function public.mark_media_failed(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();

  update public.media
  set status = 'failed'
  where id = p_media_id
    and status = 'pending';
end;
$$;

create or replace function public.post_message_with_photos(
  p_space_id uuid,
  p_body text,
  p_media_ids uuid[],
  p_reply_to_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_member uuid;
  v_message uuid;
  v_count integer;
  v_wanted integer;
begin
  if p_space_id is null
     or p_space_id not in (select private.postable_space_ids())
  then
    raise exception 'you cannot post in this space'
      using errcode = '42501';
  end if;

  select s.family_id into v_family
  from public.spaces s
  where s.id = p_space_id;

  select m.member_id into v_member
  from private.my_memberships() m
  where m.family_id = v_family;

  if v_member is null or (select auth.uid()) is null then
    raise exception 'you cannot post in this space'
      using errcode = '42501';
  end if;

  if p_body is null then
    raise exception 'a message needs text or a photo'
      using errcode = '22023';
  end if;

  v_wanted := coalesce(cardinality(p_media_ids), 0);
  if v_wanted < 1 or v_wanted > 10
     or exists (select 1 from unnest(p_media_ids) item where item is null)
     or (select count(distinct item) from unnest(p_media_ids) item) <> v_wanted
  then
    raise exception 'choose between 1 and 10 photos'
      using errcode = '22023';
  end if;

  perform 1
  from public.media med
  where med.id = any(p_media_ids)
  for update;

  select count(*)::integer into v_count
  from public.media med
  where med.id = any(p_media_ids)
    and med.space_id = p_space_id
    and med.uploader_member_id = v_member
    and med.status = 'ready'
    and med.kind = 'photo'
    and med.message_id is null
    and med.deleted_at is null;

  if v_count <> v_wanted then
    raise exception 'those photos cannot be posted'
      using errcode = '42501';
  end if;

  insert into public.messages (
    space_id, family_id, author_member_id, body, reply_to_id, created_by
  ) values (
    p_space_id, v_family, v_member, p_body, p_reply_to_id, (select auth.uid())
  )
  returning id into v_message;

  update public.media
  set message_id = v_message
  where id = any(p_media_ids);

  get diagnostics v_count = row_count;
  if v_count <> v_wanted then
    raise exception 'those photos cannot be posted'
      using errcode = '42501';
  end if;

  perform private.write_audit(
    v_family,
    'message.posted',
    v_message::text,
    jsonb_build_object('space_id', p_space_id, 'photo_count', v_wanted)
  );

  return v_message;
end;
$$;

create or replace function public.list_photo_orphans()
returns table (
  media_id uuid,
  object_key text,
  thumb_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.r2_key, m.thumb_key
  from public.media m
  where m.deleted_at is null
    and m.created_at < pg_catalog.now() - interval '24 hours'
    and (
      m.status in ('pending', 'failed')
      or (m.status = 'ready' and m.message_id is null)
    )
$$;

create or replace function public.delete_photo_orphan_rows(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.assert_service_role();

  delete from public.media m
  where m.id = any(coalesce(p_ids, array[]::uuid[]))
    and m.id in (select orphans.media_id from public.list_photo_orphans() orphans);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.photo_storage_cap_bytes() from public, anon, authenticated;
revoke all on function private.assert_service_role() from public, anon, authenticated;
revoke all on function private.retire_blank_message(uuid, uuid) from public, anon, authenticated;
revoke all on function private.messages_need_text_or_photo() from public, anon, authenticated;

revoke all on function public.reserve_photo_upload(uuid, integer, integer, integer, integer, text) from public, anon;
revoke all on function public.mark_media_ready(uuid, integer, integer, text) from public, anon, authenticated;
revoke all on function public.mark_media_failed(uuid) from public, anon, authenticated;
revoke all on function public.post_message_with_photos(uuid, text, uuid[], uuid) from public, anon;
revoke all on function public.list_photo_orphans() from public, anon, authenticated;
revoke all on function public.delete_photo_orphan_rows(uuid[]) from public, anon, authenticated;

grant execute on function public.reserve_photo_upload(uuid, integer, integer, integer, integer, text) to authenticated, service_role;
grant execute on function public.post_message_with_photos(uuid, text, uuid[], uuid) to authenticated, service_role;
grant execute on function public.mark_media_ready(uuid, integer, integer, text) to service_role;
grant execute on function public.mark_media_failed(uuid) to service_role;
grant execute on function public.list_photo_orphans() to service_role;
grant execute on function public.delete_photo_orphan_rows(uuid[]) to service_role;

create or replace function private.broadcast_space_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_id uuid := coalesce(new.id, old.id);
  changed_space uuid := coalesce(new.space_id, old.space_id);
begin
  perform realtime.send(
    jsonb_build_object(
      'table', tg_table_name,
      'operation', tg_op,
      'record', jsonb_build_object(
        'id', changed_id,
        'space_id', changed_space
      )
    ),
    tg_op,
    'space:' || changed_space::text,
    true
  );
  return null;
end;
$$;

revoke all on function private.broadcast_space_change() from public, anon, authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise exception 'storage.buckets is missing; start storage-api before migrating';
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('photos', 'photos', false, 5242880, array['image/jpeg']::text[])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end;
$$;

-- Schedule the cleanup call only when pg_cron, pg_net, and the Vault
-- secrets already exist. The secret is never written into this file.
do $$
declare
  secret text;
  target text;
begin
  if to_regclass('cron.job') is null then
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

  if secret is null or target is null then
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'media-cleanup-daily') then
    perform cron.unschedule('media-cleanup-daily');
  end if;
exception
  when undefined_table or undefined_function or invalid_schema_name then
    return;
  when others then
    if sqlerrm not like '%pg_cron%'
       and sqlerrm not like '%cron%'
       and sqlerrm not like '%vault%'
    then
      raise;
    end if;
    return;
end;
$$;

do $$
declare
  secret text;
  target text;
begin
  if to_regclass('cron.job') is null then
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

  if secret is null or target is null then
    return;
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
    null;
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
