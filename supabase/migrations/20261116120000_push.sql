-- Web push: outbox delivery columns, subscription ownership, and the
-- Vault-gated one-minute sweep. A notification error must never fail a post.

alter table public.push_subscriptions
  add column failure_count integer not null default 0,
  add constraint push_subscriptions_failure_count_check check (failure_count >= 0);

alter table public.notification_outbox
  add column recipient_member_id uuid references public.family_members (id) on delete cascade,
  add column family_id uuid references public.families (id),
  add column actor_member_id uuid references public.family_members (id) on delete set null,
  add column status text not null default 'pending',
  add column attempts integer not null default 0,
  add column next_attempt_at timestamptz not null default pg_catalog.now(),
  add column last_status integer,
  add column skip_reason text,
  add column sent_payload jsonb;

alter table public.notification_outbox
  add constraint notification_outbox_type_message_created check (type = 'message.created'),
  add constraint notification_outbox_status_check
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  add constraint notification_outbox_attempts_check check (attempts >= 0),
  add constraint notification_outbox_last_status_check
    check (last_status is null or (last_status >= 100 and last_status <= 599));

-- The table has no writers yet. Enforce the columns the unique key needs.
do $$
begin
  if exists (
    select 1
    from public.notification_outbox
    where recipient_member_id is null
       or family_id is null
       or ref_id is null
  ) then
    raise exception 'notification_outbox rows are missing delivery columns';
  end if;
end;
$$;

alter table public.notification_outbox
  alter column recipient_member_id set not null,
  alter column family_id set not null,
  alter column ref_id set not null;

alter table public.notification_outbox
  add constraint notification_outbox_recipient_type_ref_key
    unique (recipient_member_id, type, ref_id);

create index notification_outbox_sweep_idx
  on public.notification_outbox (status, next_attempt_at);

-- Recipients are space_viewer_member_ids, minus the author and people who
-- turned push off, muted the space, or paused until a future time.
create or replace function private.enqueue_message_notifications(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_outbox (
    recipient_user_id,
    recipient_member_id,
    family_id,
    space_id,
    actor_member_id,
    type,
    ref_id,
    status
  )
  select
    fm.user_id,
    fm.id,
    msg.family_id,
    msg.space_id,
    msg.author_member_id,
    'message.created',
    msg.id,
    'pending'
  from public.messages msg
  join public.family_members fm
    on fm.id in (select private.space_viewer_member_ids(msg.space_id))
  where msg.id = p_message_id
    and msg.deleted_at is null
    and fm.id <> msg.author_member_id
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
        and pref.space_id = msg.space_id
        and pref.push = false
    )
    and not exists (
      select 1
      from public.notification_prefs pref
      where pref.member_id = fm.id
        and pref.muted_until > pg_catalog.now()
        and (pref.space_id is null or pref.space_id = msg.space_id)
    )
  on conflict (recipient_member_id, type, ref_id) do nothing;
end;
$$;

create or replace function private.notify_push_send()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  target text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'push_send_secret'
  limit 1;

  select decrypted_secret into target
  from vault.decrypted_secrets
  where name = 'push_send_url'
  limit 1;

  if secret is null or target is null
     or char_length(btrim(secret)) = 0
     or char_length(btrim(target)) = 0
  then
    return;
  end if;

  if to_regproc('net.http_post') is null then
    return;
  end if;

  -- Dynamic SQL so lint does not require the net schema when pg_net is absent.
  execute format(
    'select net.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb)',
    target,
    '{}',
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-send-secret', secret
    )::text
  );
exception
  when others then
    raise warning 'push-send notify skipped (%)', sqlstate;
end;
$$;

create or replace function private.messages_enqueue_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;

  begin
    perform private.enqueue_message_notifications(new.id);
  exception
    when others then
      raise warning 'notification enqueue skipped (%)', sqlstate;
  end;

  begin
    perform private.notify_push_send();
  exception
    when others then
      raise warning 'push-send notify skipped (%)', sqlstate;
  end;

  return new;
end;
$$;

create trigger messages_enqueue_notifications
  after insert on public.messages
  for each row
  execute function private.messages_enqueue_notifications();

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
      and fm.id in (select private.space_viewer_member_ids(s.id))
  ) counts
$$;

create or replace function public.unread_total(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  return private.unread_total(p_user_id);
end;
$$;

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_agent text;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in required'
      using errcode = '42501';
  end if;

  if p_endpoint is null
     or p_endpoint !~ '^https://'
     or char_length(p_endpoint) < 12
     or char_length(p_endpoint) > 2000
     or position(' ' in p_endpoint) > 0
  then
    raise exception 'endpoint must be an https URL'
      using errcode = '22023';
  end if;

  if p_p256dh is null
     or char_length(btrim(p_p256dh)) = 0
     or char_length(p_p256dh) > 200
     or p_auth is null
     or char_length(btrim(p_auth)) = 0
     or char_length(p_auth) > 200
  then
    raise exception 'subscription keys are invalid'
      using errcode = '22023';
  end if;

  v_agent := left(p_user_agent, 400);

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    disabled_at,
    failure_count
  )
  values (
    (select auth.uid()),
    p_endpoint,
    p_p256dh,
    p_auth,
    v_agent,
    null,
    0
  )
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        disabled_at = null,
        failure_count = 0
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_endpoint is null then
    return;
  end if;

  delete from public.push_subscriptions
  where endpoint = p_endpoint
    and user_id = (select auth.uid());
end;
$$;

create or replace function public.set_space_muted(p_space_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_family uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in required'
      using errcode = '42501';
  end if;

  if p_space_id is null
     or p_space_id not in (select private.viewable_space_ids())
  then
    raise exception 'space not found'
      using errcode = '42501';
  end if;

  select s.family_id into v_family
  from public.spaces s
  where s.id = p_space_id;

  select m.member_id into v_member
  from private.my_memberships() m
  where m.family_id = v_family;

  if v_member is null then
    raise exception 'space not found'
      using errcode = '42501';
  end if;

  insert into public.notification_prefs (member_id, space_id, push)
  values (v_member, p_space_id, not coalesce(p_muted, false))
  on conflict (member_id, space_id) where space_id is not null
  do update set push = excluded.push;
end;
$$;

create or replace function public.set_notifications_enabled(
  p_family_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in required'
      using errcode = '42501';
  end if;

  select m.member_id into v_member
  from private.my_memberships() m
  where m.family_id = p_family_id;

  if v_member is null then
    raise exception 'not a member of this family'
      using errcode = '42501';
  end if;

  insert into public.notification_prefs (member_id, space_id, push)
  values (v_member, null, coalesce(p_enabled, false))
  on conflict (member_id) where space_id is null
  do update set push = excluded.push;
end;
$$;

create or replace function public.set_notifications_paused(
  p_family_id uuid,
  p_until timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in required'
      using errcode = '42501';
  end if;

  if p_until is not null and (
    p_until <= pg_catalog.now()
    or p_until > pg_catalog.now() + interval '7 days'
  ) then
    raise exception 'pause must be in the future and within 7 days'
      using errcode = '22023';
  end if;

  select m.member_id into v_member
  from private.my_memberships() m
  where m.family_id = p_family_id;

  if v_member is null then
    raise exception 'not a member of this family'
      using errcode = '42501';
  end if;

  insert into public.notification_prefs (member_id, space_id, push, muted_until)
  values (v_member, null, true, p_until)
  on conflict (member_id) where space_id is null
  do update set muted_until = excluded.muted_until;
end;
$$;

create or replace function public.my_notification_settings(p_family_id uuid)
returns table (
  member_id uuid,
  space_id uuid,
  space_title text,
  push boolean,
  muted_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in required'
      using errcode = '42501';
  end if;

  select m.member_id into v_member
  from private.my_memberships() m
  where m.family_id = p_family_id;

  if v_member is null then
    raise exception 'not a member of this family'
      using errcode = '42501';
  end if;

  return query
  select
    v_member,
    null::uuid,
    null::text,
    coalesce(def.push, true),
    def.muted_until
  from (select 1) anchor
  left join public.notification_prefs def
    on def.member_id = v_member
   and def.space_id is null;

  return query
  select
    v_member,
    s.id,
    s.title,
    coalesce(pref.push, true),
    pref.muted_until
  from public.spaces s
  left join public.notification_prefs pref
    on pref.member_id = v_member
   and pref.space_id = s.id
  where s.family_id = p_family_id
    and s.id in (select private.viewable_space_ids())
  order by s.sort_order, s.created_at;
end;
$$;

-- Lease due rows so a second worker skips them. Status stays pending until
-- record_push_result. next_attempt_at moves forward so a crash retries later.
create or replace function public.claim_push_batch(p_limit integer)
returns table (
  id uuid,
  recipient_user_id uuid,
  recipient_member_id uuid,
  family_id uuid,
  space_id uuid,
  actor_member_id uuid,
  ref_id uuid,
  attempts integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  perform private.assert_service_role();
  v_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  return query
  with due as (
    select o.id
    from public.notification_outbox o
    where o.status = 'pending'
      and o.next_attempt_at <= pg_catalog.now()
    order by o.next_attempt_at, o.id
    limit v_limit
    for update skip locked
  )
  update public.notification_outbox o
  set attempts = o.attempts + 1,
      next_attempt_at = pg_catalog.now() + interval '5 minutes'
  from due
  where o.id = due.id
  returning
    o.id,
    o.recipient_user_id,
    o.recipient_member_id,
    o.family_id,
    o.space_id,
    o.actor_member_id,
    o.ref_id,
    o.attempts,
    o.created_at;
end;
$$;

-- Labels and titles only. This function does not read message text.
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
      and fm.id in (select private.space_viewer_member_ids(o.space_id))
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
        or fm.id not in (select private.space_viewer_member_ids(o.space_id))
        then 'not_member'
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
  where o.id = any(coalesce(p_ids, array[]::uuid[]));
end;
$$;

create or replace function public.record_push_result(
  p_ids uuid[],
  p_status text,
  p_last_status integer,
  p_skip_reason text,
  p_sent_payload jsonb,
  p_retry boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_outbox%rowtype;
  v_status text;
  v_next timestamptz;
begin
  perform private.assert_service_role();

  if p_status is null
     or p_status not in ('pending', 'sent', 'skipped', 'failed')
  then
    raise exception 'invalid push status'
      using errcode = '22023';
  end if;

  for v_row in
    select o.*
    from public.notification_outbox o
    where o.id = any(coalesce(p_ids, array[]::uuid[]))
  loop
    v_status := p_status;
    v_next := v_row.next_attempt_at;

    if coalesce(p_retry, false) then
      if v_row.attempts >= 4 then
        v_status := 'failed';
      else
        v_status := 'pending';
        v_next := pg_catalog.now() + case v_row.attempts
          when 1 then interval '1 minute'
          when 2 then interval '5 minutes'
          else interval '15 minutes'
        end;
      end if;
    end if;

    update public.notification_outbox o
    set status = v_status,
        last_status = p_last_status,
        skip_reason = case when v_status = 'sent' then null else p_skip_reason end,
        sent_payload = case when v_status = 'sent' then p_sent_payload else o.sent_payload end,
        push_sent_at = case
          when v_status = 'sent' then pg_catalog.now()
          else o.push_sent_at
        end,
        next_attempt_at = v_next
    where o.id = v_row.id;
  end loop;
end;
$$;

create or replace function public.prune_notification_outbox()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.assert_service_role();

  delete from public.notification_outbox o
  where o.status in ('sent', 'skipped', 'failed')
    and o.created_at < pg_catalog.now() - interval '7 days';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Schedule only when Vault already holds the secret and the URL.
create or replace function private.schedule_push_send_sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  target text;
begin
  if to_regclass('cron.job') is null or to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'push_send_secret'
  limit 1;

  select decrypted_secret into target
  from vault.decrypted_secrets
  where name = 'push_send_url'
  limit 1;

  if secret is null or target is null
     or char_length(btrim(secret)) = 0
     or char_length(btrim(target)) = 0
  then
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'push-send-sweep') then
    perform cron.unschedule('push-send-sweep');
  end if;

  perform cron.schedule(
    'push-send-sweep',
    '* * * * *',
    format(
      $cron$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-send-secret', %L), body := '{"sweep":true}'::jsonb)$cron$,
      target,
      secret
    )
  );
exception
  when undefined_table or undefined_function or invalid_schema_name then
    return;
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

select private.schedule_push_send_sweep();

revoke all on function private.enqueue_message_notifications(uuid) from public, anon, authenticated;
revoke all on function private.notify_push_send() from public, anon, authenticated;
revoke all on function private.messages_enqueue_notifications() from public, anon, authenticated;
revoke all on function private.unread_total(uuid) from public, anon, authenticated;
revoke all on function private.schedule_push_send_sweep() from public, anon, authenticated;

revoke all on function public.unread_total(uuid) from public, anon, authenticated;
revoke all on function public.claim_push_batch(integer) from public, anon, authenticated;
revoke all on function public.push_group_facts(uuid[]) from public, anon, authenticated;
revoke all on function public.record_push_result(uuid[], text, integer, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.prune_notification_outbox() from public, anon, authenticated;

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.unregister_push_subscription(text) from public, anon;
revoke all on function public.set_space_muted(uuid, boolean) from public, anon;
revoke all on function public.set_notifications_enabled(uuid, boolean) from public, anon;
revoke all on function public.set_notifications_paused(uuid, timestamptz) from public, anon;
revoke all on function public.my_notification_settings(uuid) from public, anon;

grant execute on function public.register_push_subscription(text, text, text, text) to authenticated, service_role;
grant execute on function public.unregister_push_subscription(text) to authenticated, service_role;
grant execute on function public.set_space_muted(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_notifications_enabled(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_notifications_paused(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.my_notification_settings(uuid) to authenticated, service_role;

grant execute on function public.unread_total(uuid) to service_role;
grant execute on function public.claim_push_batch(integer) to service_role;
grant execute on function public.push_group_facts(uuid[]) to service_role;
grant execute on function public.record_push_result(uuid[], text, integer, text, jsonb, boolean) to service_role;
grant execute on function public.prune_notification_outbox() to service_role;
