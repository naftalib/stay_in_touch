import type { FamilyRole, SpaceKind } from '../lib/database.helpers.ts'

export type NavSpace = {
  id: string
  title: string
  kind: SpaceKind
  sortOrder: number
  archivedAt: string | null
  unreadCount: number
  ownerMemberId: string | null
}

export type NavSibling = {
  label: string
}

export type NavItem =
  | {
      type: 'space'
      spaceId: string
      label: string
      kind: SpaceKind
      unreadCount: number
      archived: boolean
      badgeA11y: string
    }
  | {
      type: 'sibling'
      label: string
      hint: string
    }

function unreadBadgeA11y(label: string, count: number, kind: SpaceKind): string {
  const place = kind === 'general' ? label : `${label}'s space`
  return `${place}, ${count} new message${count === 1 ? '' : 's'}`
}

function sortSpaces(spaces: NavSpace[]): NavSpace[] {
  return [...spaces].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
  )
}

/**
 * Build sidebar navigation for the current family, filtered by role.
 * Children see sibling names as non-interactive labels; parent spaces are omitted.
 */
export function buildNav(
  role: FamilyRole,
  myMemberId: string,
  spaces: NavSpace[],
  siblings: NavSibling[] = [],
): NavItem[] {
  const sorted = sortSpaces(spaces)

  const visibleSpaces =
    role === 'member'
      ? sorted.filter(
          (s) =>
            s.kind === 'general' ||
            (s.ownerMemberId !== null && s.ownerMemberId === myMemberId),
        )
      : sorted

  const spaceItems: NavItem[] = visibleSpaces.map((space) => ({
    type: 'space',
    spaceId: space.id,
    label: space.title,
    kind: space.kind,
    unreadCount: space.unreadCount,
    archived: space.archivedAt !== null,
    badgeA11y: unreadBadgeA11y(space.title, space.unreadCount, space.kind),
  }))

  const siblingItems: NavItem[] =
    role === 'member'
      ? siblings.map((s) => ({
          type: 'sibling' as const,
          label: s.label,
          hint: 'Private',
        }))
      : []

  const combined = [...spaceItems]
  for (const sibling of siblingItems) {
    const insertAt = combined.findIndex(
      (item) => item.type === 'space' && item.kind === 'member',
    )
    if (insertAt === -1) {
      combined.push(sibling)
    } else {
      combined.splice(insertAt + 1, 0, sibling)
    }
  }

  return combined
}

/** Sibling labels for a child member (other member-role children in the family). */
export function siblingLabelsForChild(
  myMemberId: string,
  members: { id: string; label: string; role: FamilyRole }[],
): NavSibling[] {
  return members
    .filter((m) => m.role === 'member' && m.id !== myMemberId)
    .map((m) => ({ label: m.label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
