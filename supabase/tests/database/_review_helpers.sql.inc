-- Review helpers. Include after _fixtures.sql.inc.
--
-- test.rows(sql) runs a statement as the current role (security invoker) and
-- returns the affected row count. An UPDATE blocked by RLS affects 0 rows
-- without raising, so deny cases must assert the count, not just "no error".

create or replace function test.rows(p_sql text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function test.rows(text) from public;
grant execute on function test.rows(text) to anon, authenticated;

-- A user who is admin of Other Family and a child (member) in Fixture Family,
-- with their own space in Fixture Family.
insert into public.family_members (id, family_id, user_id, role, label, invited_by)
values (
  'b2000000-0000-4000-8000-000000000020',
  'b0000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000008',
  'member',
  'Other as child',
  'b1000000-0000-4000-8000-000000000001'
);

insert into public.spaces (id, family_id, kind, owner_member_id, title, sort_order, created_by)
values (
  'b3000000-0000-4000-8000-000000000020',
  'b0000000-0000-4000-8000-000000000001',
  'member',
  'b2000000-0000-4000-8000-000000000020',
  'Other as child',
  50,
  'b1000000-0000-4000-8000-000000000008'
);

insert into public.invitations (id, family_id, email, role, label, invited_by, expires_at)
values
  (
    'b6000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'pending-f1@fixture.test',
    'admin',
    'Pending F1',
    'b1000000-0000-4000-8000-000000000001',
    now() + interval '3 days'
  ),
  (
    'b6000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002',
    'pending-f2@fixture.test',
    'member',
    'Pending F2',
    'b1000000-0000-4000-8000-000000000008',
    now() + interval '3 days'
  );

insert into public.audit_log (family_id, actor_user_id, action)
values
  ('b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'fixture.f1'),
  ('b0000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000008', 'fixture.f2');
