import { NavLink, useParams } from 'react-router'
import styles from './SpaceTabs.module.css'

export type SpaceTab = 'messages' | 'pics' | 'video'

export const SPACE_TABS: { tab: SpaceTab; label: string }[] = [
  { tab: 'messages', label: 'Messages' },
  { tab: 'pics', label: 'Pics' },
  { tab: 'video', label: 'Video' },
]

export function isSpaceTab(value: string | undefined): value is SpaceTab {
  return value === 'messages' || value === 'pics' || value === 'video'
}

type SpaceTabsProps = {
  familyId: string
  spaceId: string
}

export default function SpaceTabs({ familyId, spaceId }: SpaceTabsProps) {
  const { tab } = useParams<{ tab?: string }>()
  const base = `/f/${familyId}/s/${spaceId}`

  return (
    <nav className={styles.tabs} aria-label="Space sections">
      <ul className={styles.list}>
        {SPACE_TABS.map(({ tab: t, label }) => (
          <li key={t}>
            <NavLink
              to={`${base}/${t}`}
              className={({ isActive }) =>
                [styles.tab, (isActive || tab === t) && styles.tabActive]
                  .filter(Boolean)
                  .join(' ')
              }
              aria-current={tab === t ? 'page' : undefined}
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
