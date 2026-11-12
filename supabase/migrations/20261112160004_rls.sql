-- Grants are explicit. anon receives nothing. authenticated receives only the
-- commands and columns the policies allow. service_role keeps full access for
-- later Edge Functions (outbox, media status) and bypasses RLS.
-- Hard deletes of content are not granted to clients.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant all on all tables in schema public to service_role;

-- Profiles: your row, plus people who have any membership in your families
-- (including removed members, so their posts stay attributed).
grant select on public.profiles to authenticated;
grant update (display_name, avatar_key) on public.profiles to authenticated;

grant select on public.families to authenticated;
grant select on public.family_members to authenticated;
grant select on public.spaces to authenticated;

grant select, insert on public.messages to authenticated;
grant update (body, edited_at, deleted_at) on public.messages to authenticated;

grant select, insert on public.media to authenticated;
grant update (caption, deleted_at) on public.media to authenticated;

grant select on public.invitations to authenticated;

grant select, insert on public.space_reads to authenticated;
grant update (last_read_at) on public.space_reads to authenticated;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

grant select, insert on public.notification_prefs to authenticated;
grant update (push, email, muted_until) on public.notification_prefs to authenticated;

grant select on public.audit_log to authenticated;

-- notification_outbox: no client grants.

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.spaces enable row level security;
alter table public.messages enable row level security;
alter table public.media enable row level security;
alter table public.invitations enable row level security;
alter table public.space_reads enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.family_members theirs
      join private.my_memberships() mine on mine.family_id = theirs.family_id
      where theirs.user_id = profiles.id
    )
  );

create policy profiles_update on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy families_select on public.families
  for select
  to authenticated
  using (
    deleted_at is null
    and id in (select m.family_id from private.my_memberships() m)
  );

create policy family_members_select on public.family_members
  for select
  to authenticated
  using (family_id in (select m.family_id from private.my_memberships() m));

create policy spaces_select on public.spaces
  for select
  to authenticated
  using (id in (select private.viewable_space_ids()));

create policy messages_select on public.messages
  for select
  to authenticated
  using (space_id in (select private.viewable_space_ids()));

create policy messages_insert on public.messages
  for insert
  to authenticated
  with check (
    space_id in (select private.postable_space_ids())
    and author_member_id in (
      select m.member_id
      from private.my_memberships() m
      where m.family_id = messages.family_id
    )
    and created_by = (select auth.uid())
  );

create policy messages_update on public.messages
  for update
  to authenticated
  using (
    space_id in (select private.viewable_space_ids())
    and (
      author_member_id in (select m.member_id from private.my_memberships() m)
      or private.is_family_admin(family_id)
    )
  )
  with check (
    space_id in (select private.viewable_space_ids())
    and (
      author_member_id in (select m.member_id from private.my_memberships() m)
      or private.is_family_admin(family_id)
    )
  );

create policy media_select on public.media
  for select
  to authenticated
  using (space_id in (select private.viewable_space_ids()));

create policy media_insert on public.media
  for insert
  to authenticated
  with check (
    space_id in (select private.postable_space_ids())
    and uploader_member_id in (
      select m.member_id
      from private.my_memberships() m
      where m.family_id = media.family_id
    )
    and created_by = (select auth.uid())
  );

create policy media_update on public.media
  for update
  to authenticated
  using (
    space_id in (select private.viewable_space_ids())
    and (
      uploader_member_id in (select m.member_id from private.my_memberships() m)
      or private.is_family_admin(family_id)
    )
  )
  with check (
    space_id in (select private.viewable_space_ids())
    and (
      uploader_member_id in (select m.member_id from private.my_memberships() m)
      or private.is_family_admin(family_id)
    )
  );

create policy invitations_select on public.invitations
  for select
  to authenticated
  using (private.is_family_admin(family_id));

create policy space_reads_select on public.space_reads
  for select
  to authenticated
  using (member_id in (select m.member_id from private.my_memberships() m));

create policy space_reads_insert on public.space_reads
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from private.my_memberships() m
      join public.spaces s on s.family_id = m.family_id and s.id = space_reads.space_id
      where m.member_id = space_reads.member_id
        and s.id in (select private.viewable_space_ids())
    )
  );

create policy space_reads_update on public.space_reads
  for update
  to authenticated
  using (member_id in (select m.member_id from private.my_memberships() m))
  with check (
    exists (
      select 1
      from private.my_memberships() m
      join public.spaces s on s.family_id = m.family_id and s.id = space_reads.space_id
      where m.member_id = space_reads.member_id
        and s.id in (select private.viewable_space_ids())
    )
  );

create policy push_subscriptions_select on public.push_subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_update on public.push_subscriptions
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_delete on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create policy notification_prefs_select on public.notification_prefs
  for select
  to authenticated
  using (member_id in (select m.member_id from private.my_memberships() m));

create policy notification_prefs_insert on public.notification_prefs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from private.my_memberships() m
      where m.member_id = notification_prefs.member_id
        and (
          notification_prefs.space_id is null
          or exists (
            select 1
            from public.spaces s
            where s.id = notification_prefs.space_id
              and s.family_id = m.family_id
              and s.id in (select private.viewable_space_ids())
          )
        )
    )
  );

create policy notification_prefs_update on public.notification_prefs
  for update
  to authenticated
  using (member_id in (select m.member_id from private.my_memberships() m))
  with check (member_id in (select m.member_id from private.my_memberships() m));

-- Explicit deny. No grants, and a false policy so the table is not "RLS with
-- zero policies" by accident. Server code uses service_role, which bypasses RLS.
create policy notification_outbox_no_client on public.notification_outbox
  for select
  to authenticated
  using (false);

create policy audit_log_select on public.audit_log
  for select
  to authenticated
  using (private.is_family_admin(family_id));
