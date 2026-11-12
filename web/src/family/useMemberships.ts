import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase.ts'
import type { ActiveMembership } from './types.ts'

async function fetchMemberships(): Promise<ActiveMembership[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('family_members')
    .select('*, families(id, name)')
    .eq('status', 'active')

  if (error) {
    throw error
  }

  type Row = (typeof data)[number] & {
    families: { id: string; name: string } | null
  }

  return ((data ?? []) as Row[]).flatMap((row) => {
    if (!row.families) return []
    const { families, ...member } = row
    return [
      {
        ...member,
        family: { id: families.id, name: families.name },
      } satisfies ActiveMembership,
    ]
  })
}

export function useMemberships() {
  return useQuery({
    queryKey: ['memberships'],
    queryFn: fetchMemberships,
  })
}
