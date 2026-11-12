import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { Navigate, Outlet, useParams } from 'react-router'
import { useMemberships } from './useMemberships.ts'
import type { MembershipContext } from './types.ts'
import styles from './FamilyProvider.module.css'

const FamilyContext = createContext<MembershipContext | null>(null)

export function useFamily(): MembershipContext {
  const ctx = useContext(FamilyContext)
  if (!ctx) {
    throw new Error('useFamily must be used within an active family route')
  }
  return ctx
}

export function FamilyGate() {
  const { familyId } = useParams<{ familyId: string }>()
  const membershipsQuery = useMemberships()

  const membership = useMemo(() => {
    if (!familyId || !membershipsQuery.data) return undefined
    return membershipsQuery.data.find((m) => m.family_id === familyId)
  }, [familyId, membershipsQuery.data])

  if (membershipsQuery.isLoading) {
    return (
      <div className={styles.loading} role="status">
        Loading your family…
      </div>
    )
  }

  if (membershipsQuery.isError) {
    return (
      <div className={styles.error} role="alert">
        Could not load memberships.
      </div>
    )
  }

  if (!membership) {
    return <Navigate to="/" replace />
  }

  const value: MembershipContext = {
    membership,
    role: membership.role,
    memberId: membership.id,
    familyId: membership.family_id,
    userId: membership.user_id,
  }

  return (
    <FamilyContext.Provider value={value}>
      <Outlet />
    </FamilyContext.Provider>
  )
}

export function FamilyPicker({ children }: { children?: ReactNode }) {
  const membershipsQuery = useMemberships()

  if (membershipsQuery.isLoading) {
    return (
      <div className={styles.loading} role="status">
        Loading…
      </div>
    )
  }

  const first = membershipsQuery.data?.[0]
  if (first) {
    return <Navigate to={`/f/${first.family_id}`} replace />
  }

  return children ?? (
    <main className={styles.empty}>
      <h1>No family yet</h1>
      <p>When a parent adds you, your spaces will show up here.</p>
    </main>
  )
}
