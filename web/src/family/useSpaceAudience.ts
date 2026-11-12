import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys.ts'
import { fetchSpaceAudience } from './fetchSpaceAudience.ts'

export function useSpaceAudience(
  spaceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.audience(spaceId ?? 'none'),
    queryFn: () => fetchSpaceAudience(spaceId!),
    enabled: enabled && Boolean(spaceId),
  })
}
