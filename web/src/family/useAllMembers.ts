import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext.tsx'
import { getSupabase } from '../lib/supabase.ts'
import { queryKeys } from '../lib/queryKeys.ts'
import type { FamilyMember } from '../lib/database.helpers.ts'

async function fetchAllMembers(familyId: string): Promise<FamilyMember[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('family_id', familyId)
    .order('label')

  if (error) throw error
  return data ?? []
}

export function useAllMembers(familyId: string, enabled: boolean) {
  const { session } = useAuth()
  return useQuery({
    queryKey: queryKeys.membersAll(familyId),
    queryFn: () => fetchAllMembers(familyId),
    enabled: Boolean(familyId) && Boolean(session) && enabled,
  })
}