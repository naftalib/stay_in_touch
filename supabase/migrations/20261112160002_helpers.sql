-- Access helpers. security definer + search_path = '' so policies can read
-- membership without recursing, and callers cannot shadow names.
--
-- Execute is revoked from public and anon. authenticated keeps execute because
-- RLS policies run as the querying role and Postgres checks EXECUTE.
-- The private schema is not in the Data API exposed schemas. Each helper
-- returns only rows derived from auth.uid().

create or replace function private.my_memberships()
returns table (
  family_id uuid,
  member_id uuid,
  role public.family_role
)
language sql
stable
security definer
set search_path = ''
as $$
  select fm.family_id, fm.id, fm.role
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  where fm.user_id = (select auth.uid())
    and fm.status = 'active'
    and f.deleted_at is null
$$;

create or replace function private.is_family_admin(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.my_memberships() m
    where m.family_id = p_family_id
      and m.role = 'admin'
  )
$$;

-- Who may see one space. space_audience and viewable_space_ids both use this
-- so a later role or space_grants change has one place to land.
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
    and (
      fm.role in ('admin', 'grandparent')
      or s.kind = 'general'
      or fm.id = s.owner_member_id
    )
$$;

create or replace function private.viewable_space_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.spaces s
  join private.my_memberships() m on m.family_id = s.family_id
  where m.member_id in (select private.space_viewer_member_ids(s.id))
$$;

-- Visible spaces the caller may still change. An archived space stays in
-- viewable_space_ids() and drops out of this set, including for admins.
create or replace function private.postable_space_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.spaces s
  where s.id in (select private.viewable_space_ids())
    and s.archived_at is null
$$;

create or replace function private.caller_owns_member(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.id = p_member_id
      and fm.user_id = (select auth.uid())
  )
$$;

-- Parses realtime.topic() into a space id, or null when the topic is not one
-- of our space channels. Used by the realtime.messages select policy.
create or replace function private.topic_space_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  topic text := realtime.topic();
  raw_id text;
begin
  if topic is null or split_part(topic, ':', 1) <> 'space' then
    return null;
  end if;

  raw_id := split_part(topic, ':', 2);
  if raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return raw_id::uuid;
  end if;

  return null;
exception
  when others then
    return null;
end;
$$;

revoke all on function private.my_memberships() from public, anon;
revoke all on function private.is_family_admin(uuid) from public, anon;
revoke all on function private.space_viewer_member_ids(uuid) from public, anon;
revoke all on function private.viewable_space_ids() from public, anon;
revoke all on function private.postable_space_ids() from public, anon;
revoke all on function private.caller_owns_member(uuid) from public, anon;
revoke all on function private.topic_space_id() from public, anon;

grant usage on schema private to authenticated, service_role;

grant execute on function private.my_memberships() to authenticated;
grant execute on function private.is_family_admin(uuid) to authenticated;
grant execute on function private.space_viewer_member_ids(uuid) to authenticated;
grant execute on function private.viewable_space_ids() to authenticated;
grant execute on function private.postable_space_ids() to authenticated;
grant execute on function private.caller_owns_member(uuid) to authenticated;
grant execute on function private.topic_space_id() to authenticated;
