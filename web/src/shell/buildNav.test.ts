import { describe, expect, it } from 'vitest'
import {
  buildNav,
  siblingLabelsForChild,
  siblingLabelsFromAudience,
  type NavSpace,
} from './buildNav.ts'

const spaces: NavSpace[] = [
  {
    id: 'general',
    title: 'General',
    kind: 'general',
    sortOrder: 0,
    archivedAt: null,
    unreadCount: 2,
    ownerMemberId: null,
  },
  {
    id: 'mom',
    title: 'Mom',
    kind: 'member',
    sortOrder: 1,
    archivedAt: null,
    unreadCount: 0,
    ownerMemberId: 'mom-member',
  },
  {
    id: 'noa',
    title: 'Noa',
    kind: 'member',
    sortOrder: 2,
    archivedAt: null,
    unreadCount: 0,
    ownerMemberId: 'noa-member',
  },
  {
    id: 'ari',
    title: 'Ari',
    kind: 'member',
    sortOrder: 3,
    archivedAt: null,
    unreadCount: 0,
    ownerMemberId: 'ari-member',
  },
  {
    id: 'archived',
    title: 'Old space',
    kind: 'member',
    sortOrder: 4,
    archivedAt: '2020-01-01T00:00:00Z',
    unreadCount: 0,
    ownerMemberId: 'old-member',
  },
]

describe('buildNav', () => {
  it('shows all spaces for admin', () => {
    const items = buildNav('admin', 'mom-member', spaces)
    expect(items.filter((i) => i.type === 'space')).toHaveLength(5)
  })

  it('shows archived tag for members too', () => {
    const items = buildNav('member', 'noa-member', spaces)
    const archived = items.find(
      (i) => i.type === 'space' && i.spaceId === 'archived',
    )
    expect(archived).toBeUndefined()
    const adminItems = buildNav('admin', 'mom-member', spaces)
    const archivedAdmin = adminItems.find(
      (i) => i.type === 'space' && i.spaceId === 'archived',
    )
    expect(archivedAdmin?.type).toBe('space')
    if (archivedAdmin?.type === 'space') {
      expect(archivedAdmin.archived).toBe(true)
    }
  })

  it('limits child to general and own space with sibling labels', () => {
    const siblings = siblingLabelsForChild('noa-member', [
      { id: 'noa-member', label: 'Noa', role: 'member' },
      { id: 'ari-member', label: 'Ari', role: 'member' },
      { id: 'mom-member', label: 'Mom', role: 'admin' },
    ])
    const items = buildNav('member', 'noa-member', spaces, siblings)
    const spaceIds = items
      .filter((i) => i.type === 'space')
      .map((i) => (i.type === 'space' ? i.spaceId : ''))
    expect(spaceIds).toEqual(['general', 'noa'])
    expect(
      items.some((i) => i.type === 'sibling' && i.label === 'Ari'),
    ).toBe(true)
    expect(spaceIds).not.toContain('mom')
  })

  it('includes unread a11y text', () => {
    const items = buildNav('admin', 'x', spaces)
    const general = items.find(
      (i) => i.type === 'space' && i.spaceId === 'general',
    )
    expect(general?.type).toBe('space')
    if (general?.type === 'space') {
      expect(general.badgeA11y).toBe('General, 2 new messages')
    }
  })

  it('returns only space and sibling nav items', () => {
    const items = buildNav('admin', 'mom-member', spaces)
    expect(items.every((i) => i.type === 'space' || i.type === 'sibling')).toBe(
      true,
    )
  })

  it('derives sibling labels from general audience', () => {
    const siblings = siblingLabelsFromAudience('Noa', [
      { label: 'Noa', role: 'member' },
      { label: 'Ari', role: 'member' },
      { label: 'Mom', role: 'admin' },
    ])
    expect(siblings).toEqual([{ label: 'Ari' }])
  })
})
