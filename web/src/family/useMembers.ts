import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import { queryKeys } from '../lib/queryKeys.ts'
import type { FamilyMember } from '../lib/database.helpers.ts'

async function fetchMembers(familyId: string): Promise<FamilyMember[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('family_id', familyId)
    .eq('status', 'active')
    .order('label')

  if (error) throw error
  return data ?? []
}

export function useMembers(familyId: string) {
  return useQuery({
    queryKey: queryKeys.members(familyId),
    queryFn: () => fetchMembers(familyId),
    enabled: Boolean(familyId),
  })
}
