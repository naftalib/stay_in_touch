import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import { queryKeys } from '../lib/queryKeys.ts'

export type UnreadCountRow = { space_id: string; unread_count: number }

async function fetchUnreadCounts(familyId: string): Promise<UnreadCountRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('unread_counts', {
    p_family_id: familyId,
  })

  if (error) throw error
  return (data ?? []) as UnreadCountRow[]
}

export function useUnreadCounts(familyId: string) {
  return useQuery({
    queryKey: queryKeys.unread(familyId),
    queryFn: () => fetchUnreadCounts(familyId),
    enabled: Boolean(familyId),
    refetchInterval: 60_000,
  })
}
