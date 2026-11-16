-- push-send calls these functions with the service role and no auth.uid().
-- A caller-scoped viewer list skips every recipient on that path.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(16);

select test.login('grandma@fixture.test');
set local role authenticated;

select lives_ok(
  $$
    insert into public.messages (id, space_id, family_id, author_member_id, body, created_by)
    values (
      'b4000000-0000-4000-8000-000000000190',
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'marker-zz-service-role',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  'grandma can post in noa space'
);

reset role;

insert into public.notification_outbox (
  id, recipient_user_id, recipient_member_id, family_id, space_id, actor_member_id,
  type, ref_id, status
)
values (
  'b8000000-0000-4000-8000-000000000190',
  'b1000000-0000-4000-8000-000000000006',
  'b2000000-0000-4000-8000-000000000006',
  'b0000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000004',
  'b2000000-0000-4000-8000-000000000003',
  'message.created',
  'b4000000-0000-4000-8000-000000000190',
  'pending'
);

-- The edge function's JWT is the service role. There is no user id.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select ok(
  auth.uid() is null,
  'the service-role path has no auth.uid()'
);

select is(
  (
    select eligible
    from public.push_group_facts(array(
      select o.id
      from public.notification_outbox o
      where o.ref_id = 'b4000000-0000-4000-8000-000000000190'
        and o.recipient_member_id = 'b2000000-0000-4000-8000-000000000001'
    ))
  ),
  true,
  'mom stays eligible when the caller is not a family member'
);

select ok(
  (
    select skip_reason is null
    from public.push_group_facts(array(
      select o.id
      from public.notification_outbox o
      where o.ref_id = 'b4000000-0000-4000-8000-000000000190'
        and o.recipient_member_id = 'b2000000-0000-4000-8000-000000000001'
    ))
  ),
  'mom is not skipped as not_member'
);

select ok(
  (
    select app_badge > 0
    from public.push_group_facts(array(
      select o.id
      from public.notification_outbox o
      where o.ref_id = 'b4000000-0000-4000-8000-000000000190'
        and o.recipient_member_id = 'b2000000-0000-4000-8000-000000000001'
    ))
  ),
  'the badge uses the recipient, not the missing caller'
);

select is(
  (
    select skip_reason
    from public.push_group_facts(array['b8000000-0000-4000-8000-000000000190']::uuid[])
  ),
  'not_member',
  'ari is still excluded when the caller has no membership'
);

reset role;
update public.messages
set deleted_at = pg_catalog.now()
where id = 'b4000000-0000-4000-8000-000000000190';

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select is(
  (
    select eligible
    from public.push_group_facts(array(
      select o.id
      from public.notification_outbox o
      where o.ref_id = 'b4000000-0000-4000-8000-000000000190'
        and o.recipient_member_id = 'b2000000-0000-4000-8000-000000000001'
    ))
  ),
  false,
  'a deleted post is not eligible at send time'
);

select is(
  (
    select skip_reason
    from public.push_group_facts(array(
      select o.id
      from public.notification_outbox o
      where o.ref_id = 'b4000000-0000-4000-8000-000000000190'
        and o.recipient_member_id = 'b2000000-0000-4000-8000-000000000001'
    ))
  ),
  'deleted',
  'a deleted post is skipped as deleted'
);

select lives_ok(
  $$
    select public.record_push_delivery(
      array(
        select o.id
        from public.notification_outbox o
        where o.ref_id = 'b4000000-0000-4000-8000-000000000190'
          and o.recipient_member_id = 'b2000000-0000-4000-8000-000000000001'
      ),
      'b9000000-0000-4000-8000-000000000190'
    )
  $$,
  'the service role can remember a device that already accepted the push'
);

select is(
  (
    select count(*)::int
    from public.delivered_push_subscriptions(array(
      select o.id
      from public.notification_outbox o
      where o.ref_id = 'b4000000-0000-4000-8000-000000000190'
        and o.recipient_member_id = 'b2000000-0000-4000-8000-000000000001'
    ))
  ),
  1,
  'a later attempt can see that device'
);

reset role;

insert into public.notification_outbox (
  id, recipient_user_id, recipient_member_id, family_id, space_id, actor_member_id,
  type, ref_id, status
)
values (
  'b8000000-0000-4000-8000-000000000191',
  'b1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000004',
  'b2000000-0000-4000-8000-000000000003',
  'message.created',
  'b4000000-0000-4000-8000-000000000191',
  'pending'
);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select is(
  (
    select count(*)::int
    from public.delivered_push_subscriptions(array[
      (
        select o.id
        from public.notification_outbox o
        where o.ref_id = 'b4000000-0000-4000-8000-000000000190'
          and o.recipient_member_id = 'b2000000-0000-4000-8000-000000000001'
      ),
      'b8000000-0000-4000-8000-000000000191'
    ]::uuid[])
  ),
  0,
  'a device that accepted one post is still due the newer post in the same claim'
);

select lives_ok(
  $$
    select public.record_push_delivery(
      array['b8000000-0000-4000-8000-000000000191']::uuid[],
      'b9000000-0000-4000-8000-000000000190'
    )
  $$,
  'the service role can record the newer post for that device'
);

select is(
  (
    select count(*)::int
    from public.delivered_push_subscriptions(array[
      (
        select o.id
        from public.notification_outbox o
        where o.ref_id = 'b4000000-0000-4000-8000-000000000190'
          and o.recipient_member_id = 'b2000000-0000-4000-8000-000000000001'
      ),
      'b8000000-0000-4000-8000-000000000191'
    ]::uuid[])
  ),
  1,
  'the device is skipped only after every post in the claim was accepted'
);

reset role;
select test.login('stranger@fixture.test');
set local role authenticated;

select is(
  (select count(*)::int from private.space_viewer_member_ids('b3000000-0000-4000-8000-000000000004')),
  0,
  'a stranger still cannot list another family'
);

select throws_ok(
  $$select private.space_audience_member_ids('b3000000-0000-4000-8000-000000000004')$$,
  '42501',
  NULL,
  'clients cannot call the unscoped audience helper'
);

select throws_ok(
  $$select * from public.push_deliveries$$,
  '42501',
  NULL,
  'clients cannot read push deliveries'
);

select * from finish();
rollback;
