import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import MessageItem from './MessageItem.tsx'
import type { ThreadMessage } from './types.ts'

function msg(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: '1',
    space_id: 's',
    family_id: 'f',
    author_member_id: 'm',
    body: 'Hello',
    reply_to_id: null,
    edited_at: null,
    deleted_at: null,
    created_by: 'u',
    created_at: '2020-01-01T12:00:00Z',
    updated_at: '2020-01-01T12:00:00Z',
    authorLabel: 'Grandma',
    ...overrides,
  }
}

describe('MessageItem', () => {
  it('shows deleted placeholder', () => {
    render(
      <MessageItem
        message={msg({ deleted_at: '2020-01-02T00:00:00Z' })}
        isOwn={false}
        role="member"
        archived={false}
        onReply={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('Message deleted')).toBeInTheDocument()
  })

  it('labels own messages as You', () => {
    render(
      <MessageItem
        message={msg()}
        isOwn
        role="member"
        archived={false}
        onReply={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('You')).toBeInTheDocument()
  })

  it('shows edited tag', () => {
    render(
      <MessageItem
        message={msg({ edited_at: '2020-01-02T00:00:00Z' })}
        isOwn={false}
        role="member"
        archived={false}
        onReply={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('(edited)')).toBeInTheDocument()
  })

  it('offers reply from menu', async () => {
    const user = userEvent.setup()
    const onReply = vi.fn()
    render(
      <MessageItem
        message={msg()}
        isOwn={false}
        role="member"
        archived={false}
        onReply={onReply}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reply' }))
    expect(onReply).toHaveBeenCalled()
  })
})
