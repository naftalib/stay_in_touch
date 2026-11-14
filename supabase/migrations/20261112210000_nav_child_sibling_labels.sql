-- Labels of other children in the family, for child side nav (non-link siblings).

create or replace function public.nav_child_sibling_labels(p_family_id uuid)
returns table (label text)
language sql
stable
security invoker
set search_path = ''
as $$
  select fm.label
  from public.family_members fm
  join private.my_memberships() mine
    on mine.family_id = fm.family_id
  where p_family_id = fm.family_id
    and fm.family_id = mine.family_id
    and mine.role = 'member'
    and fm.status = 'active'
    and fm.role = 'member'
    and fm.user_id <> (select auth.uid())
  order by fm.label;
$$;

revoke all on function public.nav_child_sibling_labels(uuid) from public, anon;
grant execute on function public.nav_child_sibling_labels(uuid) to authenticated;
grant execute on function public.nav_child_sibling_labels(uuid) to service_role;
