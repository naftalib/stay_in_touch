import { getSupabase } from '../lib/supabase.ts'

export async function sendInvitationEmail(invitationId: string): Promise<void> {
  const { error } = await getSupabase().functions.invoke('invite-send', {
    body: { invitation_id: invitationId },
  })
  if (!error) return

  const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json()
      if (body?.error) throw new Error(body.error)
    } catch (caught) {
      if (caught instanceof Error && !caught.message.startsWith('Unexpected')) throw caught
    }
  }
  throw new Error(error.message)
}
