-- A cancelled invite must still preview as revoked so the recipient sees
-- "This invitation was cancelled." Accept stays blocked because status is not pending.
-- The hash is not a secret once the link was already emailed.

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invitations;
begin
  select * into invite
  from public.invitations
  where id = p_invitation_id
  for update;
  if not found then
    raise exception 'invitation not found'
      using errcode = '42501';
  end if;

  perform private.assert_family_admin(invite.family_id);

  if invite.status <> 'pending' then
    raise exception 'only a pending invitation can be revoked'
      using errcode = '42501';
  end if;

  update public.invitations
  set status = 'revoked'
  where id = invite.id
    and status = 'pending';
  if not found then
    raise exception 'only a pending invitation can be revoked'
      using errcode = '42501';
  end if;

  perform private.write_audit(
    invite.family_id,
    'invitation.revoked',
    invite.id::text,
    jsonb_build_object('email', invite.email)
  );
end;
$$;
