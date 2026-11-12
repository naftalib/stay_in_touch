import { useParams } from 'react-router'
import { useSpaces } from '../family/useSpaces.ts'
import Thread from '../messages/Thread.tsx'
import styles from './SpaceThreadPage.module.css'

export default function SpaceThreadPage() {
  const { familyId, spaceId } = useParams<{
    familyId: string
    spaceId: string
  }>()
  const spacesQuery = useSpaces(familyId ?? '')

  const space = spacesQuery.data?.find((s) => s.id === spaceId)

  if (spacesQuery.isLoading) {
    return <p role="status">Loading space…</p>
  }

  if (!space || !spaceId || !familyId) {
    return (
      <section className={styles.unavailable}>
        <h1>This space is not available</h1>
        <p>
          You may not have permission to view it, or it may have been removed.
        </p>
      </section>
    )
  }

  return (
  <Thread
      familyId={familyId}
      spaceId={spaceId}
      spaceTitle={space.title}
      archived={space.archived_at !== null}
    />
  )
}
