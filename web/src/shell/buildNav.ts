import type { FamilyRole, SpaceKind } from '../lib/database.types.ts'

export type NavSpace = {
  id: string
  title: string
  kind: SpaceKind
  sortOrder: number
  archivedAt: string | null
  unreadCount: number
}

export type NavItem =
  | {
      type: 'space'
      spaceId: string
      label: string
      kind: SpaceKind
      unreadCount: number
      archived: boolean
    }
  | {
      type: 'link'
      to: string
      label: string
      minRole: FamilyRole
    }

const ROLE_RANK: Record<FamilyRole, number> = {
  member: 0,
  grandparent: 1,
  admin: 2,
}

function roleAtLeast(role: FamilyRole, min: FamilyRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min]
}

/** Build sidebar navigation for the current family, filtered by role. */
export function buildNav(role: FamilyRole, spaces: NavSpace[]): NavItem[] {
  const visibleSpaces = spaces.filter((space) => {
    if (space.archivedAt && role !== 'admin') {
      return false
    }
    return true
  })

  const spaceItems: NavItem[] = visibleSpaces
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map((space) => ({
      type: 'space',
      spaceId: space.id,
      label: space.title,
      kind: space.kind,
      unreadCount: space.unreadCount,
      archived: space.archivedAt !== null,
    }))

  const links: NavItem[] = [
    {
      type: 'link',
      to: 'members',
      label: 'Family members',
      minRole: 'member',
    },
  ]

  if (roleAtLeast(role, 'admin')) {
    links.push({
      type: 'link',
      to: 'settings',
      label: 'Family settings',
      minRole: 'admin',
    })
  }

  const allowedLinks = links.filter(
    (item) => item.type === 'link' && roleAtLeast(role, item.minRole),
  )

  return [...spaceItems, ...allowedLinks]
}
