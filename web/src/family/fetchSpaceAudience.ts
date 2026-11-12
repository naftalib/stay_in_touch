import { getSupabase } from '../lib/supabase.ts'
import type { FamilyRole } from '../lib/database.helpers.ts'

export type SpaceAudienceMember = {
  user_id: string
  display_name: string
  label: string
  role: FamilyRole
}

export async function fetchSpaceAudience(
  spaceId: string,
): Promise<SpaceAudienceMember[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('space_audience', {
    p_space_id: spaceId,
  })
  if (error) throw error
  return data ?? []
}
