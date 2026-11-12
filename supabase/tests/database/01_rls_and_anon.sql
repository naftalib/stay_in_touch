begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(14);

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  $$,
  'RLS is enabled on every public table'
);

set local role anon;

select throws_ok(
  'select id from public.profiles',
  '42501',
  NULL,
  'anon cannot read profiles'
);
select throws_ok(
  'select id from public.families',
  '42501',
  NULL,
  'anon cannot read families'
);
select throws_ok(
  'select id from public.family_members',
  '42501',
  NULL,
  'anon cannot read family_members'
);
select throws_ok(
  'select id from public.spaces',
  '42501',
  NULL,
  'anon cannot read spaces'
);
select throws_ok(
  'select id from public.messages',
  '42501',
  NULL,
  'anon cannot read messages'
);
select throws_ok(
  'select id from public.media',
  '42501',
  NULL,
  'anon cannot read media'
);
select throws_ok(
  'select id from public.invitations',
  '42501',
  NULL,
  'anon cannot read invitations'
);
select throws_ok(
  'select member_id from public.space_reads',
  '42501',
  NULL,
  'anon cannot read space_reads'
);
select throws_ok(
  'select id from public.push_subscriptions',
  '42501',
  NULL,
  'anon cannot read push_subscriptions'
);
select throws_ok(
  'select id from public.notification_prefs',
  '42501',
  NULL,
  'anon cannot read notification_prefs'
);
select throws_ok(
  'select id from public.notification_outbox',
  '42501',
  NULL,
  'anon cannot read notification_outbox'
);
select throws_ok(
  'select id from public.audit_log',
  '42501',
  NULL,
  'anon cannot read audit_log'
);
select throws_ok(
  'select private.viewable_space_ids()',
  '42501',
  NULL,
  'anon cannot call private helpers'
);

select * from finish();
rollback;
