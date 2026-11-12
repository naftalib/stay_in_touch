import { useQuery } from '@tanstack/react-query'
import { fetchSpaceAudience } from '../family/fetchSpaceAudience.ts'
import { queryKeys } from '../lib/queryKeys.ts'
import styles from './AudienceLine.module.css'

type AudienceLineProps = {
  spaceId: string
}

function formatAudienceList(
  people: { label: string; display_name: string }[],
): string {
  const names = people.map((p) => p.display_name || p.label)
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} can see this space.`
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} can see this space.`
  }
  const rest = names.slice(0, -1).join(', ')
  const last = names.at(-1)
  return `${rest} and ${last} can see this space.`
}

export default function AudienceLine({ spaceId }: AudienceLineProps) {
  const query = useQuery({
    queryKey: queryKeys.audience(spaceId),
    queryFn: () => fetchSpaceAudience(spaceId),
    enabled: Boolean(spaceId),
  })

  if (query.isLoading) {
    return (
      <p className={styles.line} role="status">
        Loading who can see this space…
      </p>
    )
  }

  if (query.isError || !query.data?.length) {
    return null
  }

  return <p className={styles.line}>{formatAudienceList(query.data)}</p>
}
