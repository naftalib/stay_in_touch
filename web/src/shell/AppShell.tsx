import { Link, NavLink, Outlet, useParams } from 'react-router'
import { Button } from 'react-aria-components'
import { useAuth } from '../auth/AuthContext.tsx'
import { useFamily } from '../family/FamilyProvider.tsx'
import { useSpaces } from '../family/useSpaces.ts'
import { useUnreadCounts } from '../family/useUnreadCounts.ts'
import { buildNav, type NavSpace } from './buildNav.ts'
import styles from './AppShell.module.css'

export default function AppShell() {
  const { familyId, spaceId } = useParams<{
    familyId: string
    spaceId?: string
  }>()
  const { role, membership } = useFamily()
  const { signOut } = useAuth()
  const spacesQuery = useSpaces(familyId ?? membership.family_id)
  const unreadQuery = useUnreadCounts(familyId ?? membership.family_id)

  const unreadMap = new Map(
    (unreadQuery.data ?? []).map((row) => [
      row.space_id,
      Number(row.unread_count),
    ]),
  )

  const navSpaces: NavSpace[] = (spacesQuery.data ?? []).map((space) => ({
    id: space.id,
    title: space.title,
    kind: space.kind,
    sortOrder: space.sort_order,
    archivedAt: space.archived_at,
    unreadCount: unreadMap.get(space.id) ?? 0,
  }))

  const navItems = buildNav(role, navSpaces)
  const activeFamilyId = familyId ?? membership.family_id

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Link to={`/f/${activeFamilyId}`} className={styles.brandLink}>
            {membership.family.name}
          </Link>
          <span className={styles.role}>{membership.label}</span>
        </div>
        <Button className={styles.signOut} onPress={() => void signOut()}>
          Sign out
        </Button>
      </header>

      <div className={styles.body}>
        <nav className={styles.nav} aria-label="Spaces">
          <ul className={styles.navList}>
            {navItems.map((item) => {
              if (item.type === 'space') {
                const to = `/f/${activeFamilyId}/spaces/${item.spaceId}`
                const isActive = spaceId === item.spaceId
                return (
                  <li key={item.spaceId}>
                    <NavLink
                      to={to}
                      className={({ isActive: active }) =>
                        [
                          styles.navLink,
                          (active || isActive) && styles.navLinkActive,
                          item.archived && styles.navLinkArchived,
                        ]
                          .filter(Boolean)
                          .join(' ')
                      }
                      end
                    >
                      <span>{item.label}</span>
                      {item.unreadCount > 0 ? (
                        <span className={styles.badge} aria-label={`${item.unreadCount} unread`}>
                          {item.unreadCount}
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                )
              }

              const to = `/f/${activeFamilyId}/${item.to}`
              return (
                <li key={item.to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      [styles.navLink, isActive && styles.navLinkActive]
                        .filter(Boolean)
                        .join(' ')
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        <main className={styles.main} id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
