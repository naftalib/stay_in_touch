import { getSupabase } from '../lib/supabase.ts'

export async function sendInvitationEmail(invitationId: string): Promise<void> {
  const { error } = await getSupabase().functions.invoke('invite-send', {
    body: { invitation_id: invitationId },
  })
  if (error) {
    throw new Error(error.message);
  }
}