import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import { queryKeys } from '../lib/queryKeys.ts'
import type { NavSibling } from '../shell/buildNav.ts'
import type { FamilyRole } from '../lib/database.helpers.ts'

export async function fetchChildSiblingLabels(
  familyId: string,
): Promise<NavSibling[]> {
  const supabase = getSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('family_members')
    .select('label, role, user_id')
    .eq('family_id', familyId)
    .eq('status', 'active')
    .eq('role', 'member')

  if (error) throw error

  return (data ?? [])
    .filter((row) => row.user_id !== user.id)
    .map((row) => ({ label: row.label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function useChildSiblingLabels(
  familyId: string,
  role: FamilyRole,
) {
  return useQuery({
    queryKey: [...queryKeys.members(familyId), 'child-siblings'] as const,
    queryFn: () => fetchChildSiblingLabels(familyId),
    enabled: Boolean(familyId) && role === 'member',
    staleTime: 0,
  })
}
