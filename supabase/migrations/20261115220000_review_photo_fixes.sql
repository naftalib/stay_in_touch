-- Review fixes: pending rows record the configured provider, and a
-- soft-deleted upload that was never posted is an orphan.

alter table public.media alter column provider set default 'supabase';

drop function public.reserve_photo_upload(uuid, integer, integer, integer, integer, text);

create function public.reserve_photo_upload(
  p_space_id uuid,
  p_bytes integer,
  p_thumb_bytes integer,
  p_width integer,
  p_height integer,
  p_caption text default null,
  p_provider text default 'supabase'
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
  v_provider text := btrim(coalesce(p_provider, ''));
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

  if v_provider not in ('supabase', 'r2', 'b2') then
    raise exception 'unknown media provider'
      using errcode = '22023';
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
    'image/jpeg', p_width, p_height, 'pending', v_provider::public.media_provider, v_caption,
    p_bytes, p_thumb_bytes, (select auth.uid())
  );

  perform private.write_audit(
    v_family,
    'photo.reserved',
    v_id::text,
    jsonb_build_object(
      'space_id', p_space_id,
      'bytes', p_bytes,
      'thumb_bytes', p_thumb_bytes,
      'provider', v_provider
    )
  );

  media_id := v_id;
  key := v_key;
  thumb_key := v_thumb;
  return next;
end;
$$;

revoke all on function public.reserve_photo_upload(uuid, integer, integer, integer, integer, text, text) from public, anon;
grant execute on function public.reserve_photo_upload(uuid, integer, integer, integer, integer, text, text) to authenticated, service_role;

-- Unattached soft-deletes are abandoned uploads. Attached soft-deletes stay
-- so an admin can restore them. Objects for the abandoned rows are removed
-- by media-cleanup through the Storage API.
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
  where m.created_at < pg_catalog.now() - interval '24 hours'
    and (
      (
        m.deleted_at is null
        and (
          m.status in ('pending', 'failed')
          or (m.status = 'ready' and m.message_id is null)
        )
      )
      or (
        m.deleted_at is not null
        and m.message_id is null
      )
    )
$$;

revoke all on function public.list_photo_orphans() from public, anon, authenticated;
grant execute on function public.list_photo_orphans() to service_role;
