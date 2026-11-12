import { describe, expect, it } from 'vitest'
import { buildNav, type NavSpace } from './buildNav.ts'

const spaces: NavSpace[] = [
  {
    id: 'general',
    title: 'General',
    kind: 'general',
    sortOrder: 0,
    archivedAt: null,
    unreadCount: 2,
  },
  {
    id: 'kid',
    title: 'Sam',
    kind: 'member',
    sortOrder: 1,
    archivedAt: null,
    unreadCount: 0,
  },
  {
    id: 'archived',
    title: 'Old space',
    kind: 'member',
    sortOrder: 2,
    archivedAt: '2020-01-01T00:00:00Z',
    unreadCount: 0,
  },
]

describe('buildNav', () => {
  it('hides archived spaces from children', () => {
    const items = buildNav('member', spaces)
    expect(items.some((i) => i.type === 'space' && i.spaceId === 'archived')).toBe(
      false,
    )
  })

  it('shows archived spaces to admins', () => {
    const items = buildNav('admin', spaces)
    const archived = items.find(
      (i) => i.type === 'space' && i.spaceId === 'archived',
    )
    expect(archived?.type).toBe('space')
    if (archived?.type === 'space') {
      expect(archived.archived).toBe(true)
    }
  })

  it('includes settings only for admins', () => {
    expect(
      buildNav('member', spaces).some(
        (i) => i.type === 'link' && i.to === 'settings',
      ),
    ).toBe(false)
    expect(
      buildNav('admin', spaces).some(
        (i) => i.type === 'link' && i.to === 'settings',
      ),
    ).toBe(true)
  })
})
