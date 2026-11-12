begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(12);

select test.login('grandma@fixture.test');
set local role authenticated;

select throws_ok(
  $$
    select public.create_invitation(
      'b0000000-0000-4000-8000-000000000001',
      'new@fixture.test',
      'member',
      'New',
      true,
      now() + interval '2 days'
    )
  $$,
  '42501',
  NULL,
  'a grandparent cannot create an invitation'
);
select is_empty(
  $$select 1 from public.invitations$$,
  'a non-admin cannot read invitations'
);
select throws_ok(
  $$
    select public.change_member_role(
      'b2000000-0000-4000-8000-000000000004',
      'member'
    )
  $$,
  '42501',
  NULL,
  'a non-admin cannot change roles'
);
select throws_ok(
  $$
    select public.rename_space(
      'b3000000-0000-4000-8000-000000000001',
      'Renamed'
    )
  $$,
  '42501',
  NULL,
  'a non-admin cannot rename a space'
);
select is_empty(
  $$select 1 from public.audit_log$$,
  'a non-admin cannot read the audit log'
);
select throws_ok(
  $$
    insert into public.family_members (family_id, user_id, role, label)
    values (
      'b0000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-00000000000a',
      'member',
      'Sneaky'
    )
  $$,
  '42501',
  NULL,
  'clients cannot write family_members directly'
);
select throws_ok(
  $$
    insert into public.audit_log (family_id, action)
    values ('b0000000-0000-4000-8000-000000000001', 'fake')
  $$,
  '42501',
  NULL,
  'clients cannot write audit_log directly'
);

select test.login('mom@fixture.test');

select lives_ok(
  $$
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
    )
  $$,
  'an admin can create an invitation'
);

select ok(
  exists (
    select 1
    from public.audit_log
    where family_id = 'b0000000-0000-4000-8000-000000000001'
      and action = 'invitation.created'
  ),
  'creating an invitation writes an audit row'
);

select lives_ok(
  $$
    select public.rename_space(
      'b3000000-0000-4000-8000-000000000001',
      'Family Room'
    )
  $$,
  'an admin can rename a space'
);

select is(
  (select title from public.spaces where id = 'b3000000-0000-4000-8000-000000000001'),
  'Family Room',
  'the renamed title is stored'
);

select lives_ok(
  $$
    select public.remove_member('b2000000-0000-4000-8000-000000000004')
  $$,
  'an admin can remove a member'
);

select * from finish();
rollback;
