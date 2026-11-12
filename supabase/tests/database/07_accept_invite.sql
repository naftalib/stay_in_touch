begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(7);

select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.invite_id',
  public.create_invitation(
    'b0000000-0000-4000-8000-000000000001',
    'cousin@fixture.test',
    'grandparent',
    'Cousin',
    false,
    now() + interval '2 days'
  )::text,
  true
);

select test.login('stranger@fixture.test');

select throws_ok(
  format(
    'select public.accept_invite(%L)',
    current_setting('test.invite_id')
  ),
  '42501',
  NULL,
  'accept_invite fails for a different email'
);

select test.login('cousin@fixture.test');

select lives_ok(
  format(
    'select public.accept_invite(%L)',
    current_setting('test.invite_id')
  ),
  'accept_invite works for the matching email'
);

select is(
  (
    select role::text
    from public.family_members
    where user_id = 'b1000000-0000-4000-8000-00000000000a'
      and family_id = 'b0000000-0000-4000-8000-000000000001'
  ),
  'grandparent',
  'the membership gets the invitation role'
);

select is_empty(
  $$
    select 1
    from public.spaces
    where owner_member_id in (
      select id
      from public.family_members
      where user_id = 'b1000000-0000-4000-8000-00000000000a'
    )
  $$,
  'a grandparent invitation does not create a space'
);

select throws_ok(
  format(
    'select public.accept_invite(%L)',
    current_setting('test.invite_id')
  ),
  '42501',
  NULL,
  'an invitation cannot be accepted twice'
);

select test.login('mom@fixture.test');

select set_config(
  'test.revoked_id',
  public.create_invitation(
    'b0000000-0000-4000-8000-000000000001',
    'stranger@fixture.test',
    'member',
    'Stranger',
    true,
    now() + interval '2 days'
  )::text,
  true
);
select public.revoke_invitation(current_setting('test.revoked_id')::uuid);

select test.login('stranger@fixture.test');

select throws_ok(
  format(
    'select public.accept_invite(%L)',
    current_setting('test.revoked_id')
  ),
  '42501',
  NULL,
  'a revoked invitation cannot be accepted'
);

reset role;

-- postgres owns the tables. The JWT still has to name an admin because
-- create_invitation checks auth.uid(), not the session role.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated","email":"mom@fixture.test"}',
  true
);
select set_config(
  'test.late_id',
  public.create_invitation(
    'b0000000-0000-4000-8000-000000000001',
    'late@fixture.test',
    'member',
    'Late',
    false,
    now() + interval '2 days'
  )::text,
  true
);
update public.invitations
set expires_at = now() - interval '1 minute'
where id = current_setting('test.late_id')::uuid;

select test.login('late@fixture.test');
set local role authenticated;

select throws_ok(
  format(
    'select public.accept_invite(%L)',
    current_setting('test.late_id')
  ),
  '42501',
  NULL,
  'an expired invitation cannot be accepted'
);

select * from finish();
rollback;
