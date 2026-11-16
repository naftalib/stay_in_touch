-- Send-time checks run as the service role, which has no auth.uid().
-- space_viewer_member_ids stays caller-scoped so a stranger still cannot
-- list another family's members. Server paths use the audience rule directly.
-- A deleted post is skipped. A device that already accepted the push is not
-- sent the same row again when another device is retried.

create or replace function private.space_audience_member_ids(p_space_id uuid)
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

create or replace function private.space_viewer_member_ids(p_space_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select audience.id
  from private.space_audience_member_ids(p_space_id) as audience(id)
  where exists (
    select 1
    from public.spaces s
    where s.id = p_space_id
      and s.family_id in (select m.family_id from private.my_memberships() m)
  )
$$;

create or replace function private.unread_total(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(item_count), 0)::integer
  from (
    select
      (
        select count(*)::integer
        from public.messages msg
        where msg.space_id = s.id
          and msg.deleted_at is null
          and (
            (
              msg.author_member_id <> fm.id
              and msg.created_at > read_at.last_read_at
            )
            or exists (
              select 1
              from public.media med
              where med.message_id = msg.id
                and med.space_id = s.id
                and med.deleted_at is null
                and med.status = 'ready'
                and med.uploader_member_id <> fm.id
                and med.created_at > read_at.last_read_at
            )
          )
      )
      + (
        select count(*)::integer
        from public.media med
        where med.space_id = s.id
          and med.message_id is null
          and med.deleted_at is null
          and med.status = 'ready'
          and med.uploader_member_id <> fm.id
          and med.created_at > read_at.last_read_at
      ) as item_count
    from public.family_members fm
    join public.families f
      on f.id = fm.family_id
     and f.deleted_at is null
    join public.spaces s on s.family_id = fm.family_id
    cross join lateral (
      select coalesce(
        (
          select sr.last_read_at
          from public.space_reads sr
          where sr.space_id = s.id
            and sr.member_id = fm.id
        ),
        '-infinity'::timestamptz
      ) as last_read_at
    ) read_at
    where fm.user_id = p_user_id
      and fm.status = 'active'
      and fm.id in (select private.space_audience_member_ids(s.id))
  ) counts
$$;

create or replace function public.push_group_facts(p_ids uuid[])
returns table (
  id uuid,
  recipient_user_id uuid,
  recipient_member_id uuid,
  family_id uuid,
  space_id uuid,
  space_title text,
  actor_label text,
  created_at timestamptz,
  attempts integer,
  eligible boolean,
  skip_reason text,
  app_badge integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();

  return query
  select
    o.id,
    o.recipient_user_id,
    o.recipient_member_id,
    o.family_id,
    o.space_id,
    s.title,
    coalesce(nullif(btrim(actor.label), ''), 'Someone'),
    o.created_at,
    o.attempts,
    (
      fm.status = 'active'
      and f.deleted_at is null
      and msg.id is not null
      and msg.deleted_at is null
      and fm.id in (select private.space_audience_member_ids(o.space_id))
      and not exists (
        select 1
        from public.notification_prefs pref
        where pref.member_id = fm.id
          and pref.space_id is null
          and pref.push = false
      )
      and not exists (
        select 1
        from public.notification_prefs pref
        where pref.member_id = fm.id
          and pref.space_id = o.space_id
          and pref.push = false
      )
      and not exists (
        select 1
        from public.notification_prefs pref
        where pref.member_id = fm.id
          and pref.muted_until > pg_catalog.now()
          and (pref.space_id is null or pref.space_id = o.space_id)
      )
    ) as eligible,
    case
      when fm.status is distinct from 'active'
        or f.deleted_at is not null
        or fm.id not in (select private.space_audience_member_ids(o.space_id))
        then 'not_member'
      when msg.id is null or msg.deleted_at is not null then 'deleted'
      when exists (
        select 1
        from public.notification_prefs pref
        where pref.member_id = fm.id
          and pref.space_id is null
          and pref.push = false
      ) then 'disabled'
      when exists (
        select 1
        from public.notification_prefs pref
        where pref.member_id = fm.id
          and pref.space_id = o.space_id
          and pref.push = false
      ) then 'muted'
      when exists (
        select 1
        from public.notification_prefs pref
        where pref.member_id = fm.id
          and pref.muted_until > pg_catalog.now()
          and (pref.space_id is null or pref.space_id = o.space_id)
      ) then 'paused'
      else null
    end as skip_reason,
    private.unread_total(o.recipient_user_id) as app_badge
  from public.notification_outbox o
  join public.family_members fm on fm.id = o.recipient_member_id
  join public.families f on f.id = o.family_id
  join public.spaces s on s.id = o.space_id
  left join public.family_members actor on actor.id = o.actor_member_id
  left join public.messages msg on msg.id = o.ref_id
  where o.id = any(coalesce(p_ids, array[]::uuid[]));
end;
$$;

create table public.push_deliveries (
  outbox_id uuid not null references public.notification_outbox (id) on delete cascade,
  subscription_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (outbox_id, subscription_id)
);

alter table public.push_deliveries enable row level security;

create policy push_deliveries_no_client on public.push_deliveries
  for select
  to authenticated
  using (false);

revoke all on table public.push_deliveries from public, anon, authenticated;
grant select, insert, delete on table public.push_deliveries to service_role;

create or replace function public.record_push_delivery(
  p_outbox_ids uuid[],
  p_subscription_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  if p_subscription_id is null then
    return;
  end if;

  insert into public.push_deliveries (outbox_id, subscription_id)
  select o.id, p_subscription_id
  from public.notification_outbox o
  where o.id = any(coalesce(p_outbox_ids, array[]::uuid[]))
  on conflict (outbox_id, subscription_id) do nothing;
end;
$$;

create or replace function public.delivered_push_subscriptions(p_outbox_ids uuid[])
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();

  -- A device is done only when every row in this claim was accepted.
  -- A newer post grouped with a retry must still reach that device.
  return query
  select d.subscription_id
  from public.push_deliveries d
  where d.outbox_id = any(coalesce(p_outbox_ids, array[]::uuid[]))
  group by d.subscription_id
  having count(distinct d.outbox_id) = (
    select count(distinct requested.id)
    from unnest(coalesce(p_outbox_ids, array[]::uuid[])) as requested(id)
    where requested.id is not null
  );
end;
$$;

revoke all on function private.space_audience_member_ids(uuid) from public, anon, authenticated, service_role;

revoke all on function public.record_push_delivery(uuid[], uuid) from public, anon, authenticated;
revoke all on function public.delivered_push_subscriptions(uuid[]) from public, anon, authenticated;

grant execute on function public.record_push_delivery(uuid[], uuid) to service_role;
grant execute on function public.delivered_push_subscriptions(uuid[]) to service_role;
