import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useMatch, useParams } from 'react-router'
import {
  Button,
  Dialog,
  DialogTrigger,
  Modal,
  ModalOverlay,
} from 'react-aria-components'
import { useAuth } from '../auth/AuthContext.tsx'
import { useFamily } from '../family/FamilyProvider.tsx'
import { useSpaceAudience } from '../family/useSpaceAudience.ts'
import { useSpaces } from '../family/useSpaces.ts'
import { useUnreadCounts } from '../family/useUnreadCounts.ts'
import {
  buildNav,
  siblingLabelsFromAudience,
  type NavSpace,
} from './buildNav.ts'
import SideNav from './SideNav.tsx'
import SpaceTabs from './SpaceTabs.tsx'
import ConnectionBanner from './ConnectionBanner.tsx'
import { useOnlineStatus } from './useOnlineStatus.ts'
import { useRealtimeConnection } from './useRealtimeConnection.ts'
import styles from './AppShell.module.css'

const DRAWER_BREAKPOINT = 900

export default function AppShell() {
  const { familyId, spaceId } = useParams<{
    familyId: string
    spaceId?: string
  }>()
  const matchSpace = useMatch('/f/:familyId/s/:spaceId/:tab')
  const activeSpaceId = matchSpace?.params.spaceId ?? spaceId

  const { membership, role, memberId, userId } = useFamily()
  const { signOut, displayName } = useAuth()
  const activeFamilyId = familyId ?? membership.family_id
  const spacesQuery = useSpaces(activeFamilyId)
  const unreadQuery = useUnreadCounts(activeFamilyId)
  const { offline } = useOnlineStatus()
  const { paused } = useRealtimeConnection()

  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(`(max-width: ${DRAWER_BREAKPOINT}px)`).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${DRAWER_BREAKPOINT}px)`)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const unreadMap = useMemo(
    () =>
      new Map(
        (unreadQuery.data ?? []).map((row) => [
          row.space_id,
          Number(row.unread_count),
        ]),
      ),
    [unreadQuery.data],
  )

  const navSpaces: NavSpace[] = useMemo(
    () =>
      (spacesQuery.data ?? []).map((space) => ({
        id: space.id,
        title: space.title,
        kind: space.kind,
        sortOrder: space.sort_order,
        archivedAt: space.archived_at,
        unreadCount: unreadMap.get(space.id) ?? 0,
        ownerMemberId: space.owner_member_id,
      })),
    [spacesQuery.data, unreadMap],
  )

  const generalSpaceId = useMemo(
    () => navSpaces.find((space) => space.kind === 'general')?.id,
    [navSpaces],
  )

  const generalAudienceQuery = useSpaceAudience(
    generalSpaceId,
    role === 'member',
  )

  const siblings = useMemo(() => {
    if (role !== 'member' || !generalAudienceQuery.data) return []
    return siblingLabelsFromAudience(userId, generalAudienceQuery.data)
  }, [generalAudienceQuery.data, role, userId])

  const navItems = buildNav(role, memberId, navSpaces, siblings)
  const activeSpace = spacesQuery.data?.find((s) => s.id === activeSpaceId)

  const totalUnread = useMemo(
    () =>
      (unreadQuery.data ?? []).reduce(
        (sum, row) => sum + Number(row.unread_count),
        0,
      ),
    [unreadQuery.data],
  )

  useEffect(() => {
    const base = 'Stay In Touch'
    document.title =
      totalUnread > 0 ? `(${totalUnread}) ${base}` : base
  }, [totalUnread])

  const handleSignOut = () => {
    void signOut()
  }

  return (
    <div className={styles.root}>
      <a className={styles.skip} href="#main-content">
        Skip to main content
      </a>

      <header className={styles.header}>
        <div className={styles.headerStart}>
          {narrow ? (
            <DialogTrigger>
              <Button className={styles.spacesButton}>Spaces</Button>
              <ModalOverlay className={styles.drawerOverlay} isDismissable>
                <Modal className={styles.drawerModal}>
                  <Dialog className={styles.drawerDialog}>
                    {({ close }) => (
                      <>
                        <header className={styles.drawerHeader}>
                          <h2>Spaces</h2>
                          <Button onPress={close}>Close</Button>
                        </header>
                        <SideNav
                          items={navItems}
                          familyId={activeFamilyId}
                          activeSpaceId={activeSpaceId}
                          onNavigate={close}
                          onSignOut={handleSignOut}
                          userLabel={displayName}
                        />
                      </>
                    )}
                  </Dialog>
                </Modal>
              </ModalOverlay>
            </DialogTrigger>
          ) : null}
          <FamilyBrandLink
            familyId={activeFamilyId}
            name={membership.family.name}
          />
        </div>
        {activeSpaceId && activeSpace ? (
          <SpaceTabs familyId={activeFamilyId} spaceId={activeSpaceId} />
        ) : null}
      </header>

      <ConnectionBanner offline={offline} paused={paused && !offline} />

      <div className={styles.body}>
        {!narrow ? (
          <aside className={styles.aside}>
            <SideNav
              items={navItems}
              familyId={activeFamilyId}
              activeSpaceId={activeSpaceId}
              onSignOut={handleSignOut}
              userLabel={displayName}
            />
          </aside>
        ) : null}

        <main className={styles.main} id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function FamilyBrandLink({
  familyId,
  name,
}: {
  familyId: string
  name: string
}) {
  return (
    <div className={styles.brand}>
      <Link to={`/f/${familyId}`} className={styles.brandLink}>
        {name}
      </Link>
    </div>
  )
}
