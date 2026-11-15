import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext.tsx'
import { getSupabase } from '../lib/supabase.ts'
import { queryKeys } from '../lib/queryKeys.ts'
import type { Tables } from '../lib/database.types.ts'

export type InvitationRow = Tables<'invitations'> & {
  last_sent_at: string | null
  send_count: number
}

async function fetchInvitations(familyId: string): Promise<InvitationRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('invitations')
    .select(
      'id, family_id, email, role, label, create_space, status, expires_at, invited_by, last_sent_at, send_count, created_at, updated_at, accepted_user_id',
    )
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as InvitationRow[]
}

export function useInvitations(familyId: string, enabled: boolean) {
  const { session } = useAuth()
  return useQuery({
    queryKey: queryKeys.invitations(familyId),
    queryFn: () => fetchInvitations(familyId),
    enabled: Boolean(familyId) && Boolean(session) && enabled,
  })
}