import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import type { Space } from '../lib/database.types.ts'

async function fetchSpaces(familyId: string): Promise<Space[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('spaces')
    .select('*')
    .eq('family_id', familyId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data ?? []
}

export function useSpaces(familyId: string) {
  return useQuery({
    queryKey: ['spaces', familyId],
    queryFn: () => fetchSpaces(familyId),
    enabled: Boolean(familyId),
  })
}
