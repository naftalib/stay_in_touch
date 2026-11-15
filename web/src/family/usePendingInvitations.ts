import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext.tsx'
import { getSupabase } from '../lib/supabase.ts'
import { queryKeys } from '../lib/queryKeys.ts'

export type PendingInvitation = {
  id: string
  family_name: string
  inviter_name: string
  role: string
  label: string
  expires_at: string
}

export function usePendingInvitations() {
  const { session } = useAuth()
  return useQuery({
    queryKey: queryKeys.myPendingInvitations(),
    queryFn: async (): Promise<PendingInvitation[]> => {
      const { data, error } = await getSupabase().rpc('my_pending_invitations')
      if (error) throw error
      return (data ?? []) as PendingInvitation[]
    },
    enabled: Boolean(session),
  })
}