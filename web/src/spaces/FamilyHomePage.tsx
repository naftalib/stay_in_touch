import { Navigate, useParams } from 'react-router'
import { useSpaces } from '../family/useSpaces.ts'

export default function FamilyHomePage() {
  const { familyId } = useParams<{ familyId: string }>()
  const spacesQuery = useSpaces(familyId ?? '')

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

  return (
    <Navigate
      to={`/f/${familyId}/spaces/${general.id}`}
      replace
    />
  )
}
