-- Claim lease, retry backoff, retention, and a concurrent claim.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(8);

insert into public.notification_outbox (
  id, recipient_user_id, recipient_member_id, family_id, space_id, actor_member_id,
  type, ref_id, status, attempts, next_attempt_at, created_at
)
values
  (
    'b8000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000003',
    'message.created',
    'b4000000-0000-4000-8000-000000000180',
    'pending', 0, now(), now()
  ),
  (
    'b8000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000003',
    'message.created',
    'b4000000-0000-4000-8000-000000000181',
    'sent', 1, now(), now() - interval '8 days'
  ),
  (
    'b8000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000004',
    'b2000000-0000-4000-8000-000000000004',
    'b0000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000003',
    'message.created',
    'b4000000-0000-4000-8000-000000000182',
    'sent', 1, now(), now()
  ),
  (
    'b8000000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000005',
    'b2000000-0000-4000-8000-000000000005',
    'b0000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000004',
    'b2000000-0000-4000-8000-000000000003',
    'message.created',
    'b4000000-0000-4000-8000-000000000183',
    'pending', 0, now(), now() - interval '8 days'
  );

update public.notification_outbox
set next_attempt_at = pg_catalog.now() + interval '2 days'
where id <> 'b8000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.claim_push_batch(10) where id = 'b8000000-0000-4000-8000-000000000001'),
  1,
  'claim returns a due row'
);

select is(
  (select count(*)::int from public.claim_push_batch(10) where id = 'b8000000-0000-4000-8000-000000000001'),
  0,
  'a leased row is not claimed again'
);

do $$
begin
  perform public.record_push_result(
    array['b8000000-0000-4000-8000-000000000001']::uuid[],
    'pending',
    503,
    null,
    null,
    true
  );
end;
$$;

select ok(
  (
    select next_attempt_at > pg_catalog.now() + interval '50 seconds'
       and next_attempt_at < pg_catalog.now() + interval '2 minutes'
       and status = 'pending'
       and attempts = 1
    from public.notification_outbox
    where id = 'b8000000-0000-4000-8000-000000000001'
  ),
  'the first failure waits one minute'
);

update public.notification_outbox
set attempts = 4, status = 'pending', next_attempt_at = now()
where id = 'b8000000-0000-4000-8000-000000000001';

do $$
begin
  perform public.record_push_result(
    array['b8000000-0000-4000-8000-000000000001']::uuid[],
    'pending',
    503,
    null,
    null,
    true
  );
end;
$$;

select is(
  (select status from public.notification_outbox where id = 'b8000000-0000-4000-8000-000000000001'),
  'failed',
  'the fourth failure gives up'
);

select is(
  public.prune_notification_outbox() >= 1,
  true,
  'prune deletes rows older than 7 days'
);

select is(
  (select count(*)::int from public.notification_outbox where id = 'b8000000-0000-4000-8000-000000000002'),
  0,
  'an old sent row is gone'
);

select is(
  (select count(*)::int from public.notification_outbox where id in (
    'b8000000-0000-4000-8000-000000000003',
    'b8000000-0000-4000-8000-000000000004'
  )),
  2,
  'a recent sent row and an old pending row stay'
);

select ok(
  position('messages.body' in pg_get_functiondef('public.push_group_facts(uuid[])'::regprocedure)) = 0
  and position('.body' in pg_get_functiondef('public.push_group_facts(uuid[])'::regprocedure)) = 0,
  'push facts do not read message text'
);

select * from finish();
rollback;
