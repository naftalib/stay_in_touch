begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(2);

select test.login('noa@fixture.test');
set local role authenticated;

select results_eq(
  $$select label from public.nav_child_sibling_labels('b0000000-0000-4000-8000-000000000001')$$,
  $$values ('Ari')$$,
  'child sees sibling labels for nav'
);

select is_empty(
  $$select label from public.nav_child_sibling_labels('b0000000-0000-4000-8000-000000000002')$$,
  'child sees no siblings from another family'
);

select * from finish();
rollback;
