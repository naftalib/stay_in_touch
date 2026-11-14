import { Navigate, useParams } from 'react-router'
import { useSpaces } from '../family/useSpaces.ts'
import { isUuid } from '../lib/uuid.ts'
import SpaceUnavailable from './SpaceUnavailable.tsx'

export default function FamilyHomePage() {
  const { familyId } = useParams<{ familyId: string }>()
  const spacesQuery = useSpaces(familyId ?? '')

  if (!familyId || !isUuid(familyId)) {
    return <Navigate to="/" replace />
  }

  if (spacesQuery.isLoading) {
    return <p role="status">Loading spaces…</p>
  }

  if (spacesQuery.isError || !spacesQuery.data?.length) {
    return (
      <section>
        <h1>No spaces yet</h1>
        <p>This family does not have any spaces you can open.</p>
      </section>
    )
  }

  const general =
    spacesQuery.data.find((s) => s.kind === 'general') ?? spacesQuery.data[0]

  if (!general) {
    return <SpaceUnavailable familyId={familyId} />
  }

  return (
    <Navigate
      to={`/f/${familyId}/s/${general.id}/messages`}
      replace
    />
  )
}
