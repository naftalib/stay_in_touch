import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router'
import { useSpaces } from '../family/useSpaces.ts'
import { isUuid } from '../lib/uuid.ts'
import AudienceLine from './AudienceLine.tsx'
import PlaceholderTab from './PlaceholderTab.tsx'
import SpaceUnavailable from './SpaceUnavailable.tsx'
import Thread from '../messages/Thread.tsx'
import { isSpaceTab } from '../shell/SpaceTabs.tsx'
import styles from './SpacePage.module.css'

export default function SpacePage() {
  const { familyId, spaceId, tab } = useParams<{
    familyId: string
    spaceId: string
    tab: string
  }>()

  const spacesQuery = useSpaces(familyId ?? '')
  const space = spacesQuery.data?.find((s) => s.id === spaceId)

  useEffect(() => {
    if (!space) return
    document.title = `${space.title} · Stay In Touch`
    return () => {
      document.title = 'Stay In Touch'
    }
  }, [space])

  if (!familyId || !spaceId || !isUuid(familyId) || !isUuid(spaceId)) {
    return (
      <SpaceUnavailable
        familyId={familyId && isUuid(familyId) ? familyId : ''}
      />
    )
  }

  if (spacesQuery.isLoading) {
    return (
      <p className={styles.status} role="status" aria-busy="true">
        Loading…
      </p>
    )
  }

  if (spacesQuery.isError) {
    return (
      <p className={styles.status} role="alert">
        Could not load this space. Try again.
      </p>
    )
  }

  if (!space) {
    const general = spacesQuery.data?.find((s) => s.kind === 'general')
    return (
      <SpaceUnavailable
        familyId={familyId}
        generalTo={
          general ? `/f/${familyId}/s/${general.id}/messages` : undefined
        }
      />
    )
  }

  if (!isSpaceTab(tab)) {
    return (
      <Navigate to={`/f/${familyId}/s/${spaceId}/messages`} replace />
    )
  }

  const archived = space.archived_at !== null

  return (
    <article className={styles.article}>
      <header className={styles.spaceHeader}>
        <h1 className={styles.spaceTitle}>{space.title}</h1>
        <AudienceLine spaceId={spaceId} />
      </header>

      {tab === 'messages' ? (
        <Thread
          familyId={familyId}
          spaceId={spaceId}
          spaceTitle={space.title}
          archived={archived}
        />
      ) : tab === 'pics' ? (
        <PlaceholderTab kind="pics" />
      ) : (
        <PlaceholderTab kind="video" />
      )}
    </article>
  )
}
