import { Link, NavLink } from 'react-router'
import { Button } from 'react-aria-components'
import type { NavItem } from './buildNav.ts'
import TextSizeControl from '../settings/TextSizeControl.tsx'
import styles from './SideNav.module.css'

type SideNavProps = {
  items: NavItem[]
  familyId: string
  activeSpaceId?: string
  onNavigate?: () => void
  onSignOut: () => void
  userLabel?: string
  showAdminLinks?: boolean
}

export default function SideNav({
  items,
  familyId,
  activeSpaceId,
  onNavigate,
  onSignOut,
  userLabel,
  showAdminLinks,
}: SideNavProps) {
  return (
    <div className={styles.wrap}>
      <nav className={styles.nav} aria-label="Spaces">
        <ul className={styles.navList}>
          {items.map((item, index) => {
            if (item.type === 'sibling') {
              return (
                <li
                  key={`sibling-${item.label}-${index}`}
                  className={styles.sibling}
                  data-testid={`nav-sibling-${item.label}`}
                >
                  <span className={styles.siblingName}>{item.label}</span>
                  <span className={styles.siblingHint} aria-hidden="true">
                    {item.hint}
                  </span>
                  <span className="sr-only">
                    {item.label}, private space, not available to you
                  </span>
                </li>
              )
            }

            const to = `/f/${familyId}/s/${item.spaceId}/messages`
            return (
              <li key={item.spaceId}>
                <NavLink
                  to={to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    [
                      styles.navLink,
                      (isActive || activeSpaceId === item.spaceId) &&
                        styles.navLinkActive,
                      item.archived && styles.navLinkArchived,
                    ]
                      .filter(Boolean)
                      .join(' ')
                  }
                  end
                  aria-current={
                    activeSpaceId === item.spaceId ? 'page' : undefined
                  }
                >
                  <span className={styles.navLabel}>
                    {item.label}
                    {item.archived ? (
                      <span className={styles.archivedTag}>Archived</span>
                    ) : null}
                  </span>
                  {item.unreadCount > 0 ? (
                    <span
                      className={styles.badge}
                      aria-label={item.badgeA11y}
                    >
                      <span aria-hidden="true">{item.unreadCount}</span>
                    </span>
                  ) : null}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {showAdminLinks ? (
        <div className={styles.adminLinks}>
          <p className={styles.adminHeading}>Family</p>
          <Link className={styles.adminLink} to={`/f/${familyId}/members`} onClick={onNavigate}>
            Members
          </Link>
          <Link className={styles.adminLink} to={`/f/${familyId}/spaces`} onClick={onNavigate}>
            Spaces
          </Link>
        </div>
      ) : null}

      <footer className={styles.footer}>
        {userLabel ? (
          <p className={styles.signedInAs}>Signed in as {userLabel}</p>
        ) : null}
        <TextSizeControl />
        <Link className={styles.switchAccount} to="/sign-in?signedOut=1">
          Switch account
        </Link>
        <Button className={styles.signOut} onPress={onSignOut}>
          Sign out
        </Button>
      </footer>
    </div>
  )
}
