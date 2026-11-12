begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(4);

-- Policies run as the caller, so authenticated must be able to execute the
-- helpers. They are security definer and only return the caller's own rows.
-- private is not in api.schemas, so PostgREST does not expose them.
select test.login('noa@fixture.test');
set local role authenticated;

select results_eq(
  $$select viewable_space_ids::text from private.viewable_space_ids() order by 1$$,
  $$values
    ('b3000000-0000-4000-8000-000000000001'),
    ('b3000000-0000-4000-8000-000000000004')$$,
  'authenticated can call viewable_space_ids and only sees their spaces'
);

select throws_ok(
  $$select private.write_audit('b0000000-0000-4000-8000-000000000001', 'x', null, '{}')$$,
  '42501',
  NULL,
  'authenticated cannot call private.write_audit'
);

select throws_ok(
  $$select private.assert_family_admin('b0000000-0000-4000-8000-000000000001')$$,
  '42501',
  NULL,
  'authenticated cannot call private.assert_family_admin'
);

set local role anon;

select throws_ok(
  'select private.my_memberships()',
  '42501',
  NULL,
  'anon cannot call private.my_memberships'
);

select * from finish();
rollback;
