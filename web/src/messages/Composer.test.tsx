import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { clearAllDrafts, draftStorageKey, readDraft, resumeDraftWrites, suspendDraftWrites } from '../pwa/drafts.ts'
import Composer from './Composer.tsx'

describe('Composer', () => {
  it('disables send when empty', () => {
    render(<Composer onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('keeps the composer while offline and explains that the draft is saved', () => {
    render(<Composer onSend={vi.fn()} offline userId="mom" spaceId="general" />)
    expect(
      screen.getByText(
        "You're offline. Your message is saved and you can send it when you're back online.",
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByPlaceholderText('Write a message…')).toBeVisible()
  })

  it('saves the outgoing draft when the space changes and on unmount', async () => {
    resumeDraftWrites()
    clearAllDrafts()
    resumeDraftWrites()
    const general = draftStorageKey('mom', 'general')
    const noa = draftStorageKey('mom', 'noa')
    localStorage.setItem(noa, 'keep noa')
    const user = userEvent.setup()
    const view = render(<Composer onSend={vi.fn()} userId="mom" spaceId="general" />)
    await user.type(screen.getByPlaceholderText('Write a message…'), 'mom text')
    view.rerender(<Composer onSend={vi.fn()} userId="mom" spaceId="noa" />)
    expect(readDraft(general)).toBe('mom text')
    expect(screen.getByPlaceholderText('Write a message…')).toHaveValue('keep noa')
    await user.clear(screen.getByPlaceholderText('Write a message…'))
    await user.type(screen.getByPlaceholderText('Write a message…'), 'left quickly')
    view.unmount()
    expect(readDraft(noa)).toBe('left quickly')
    const again = render(<Composer onSend={vi.fn()} userId="mom" spaceId="general" />)
    await user.type(screen.getByPlaceholderText('Write a message…'), 'should not stick')
    suspendDraftWrites()
    clearAllDrafts()
    again.unmount()
    expect(readDraft(general)).toBe('')
    resumeDraftWrites()
  })

  it('sends with ctrl+enter', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<Composer onSend={onSend} />)
    const area = screen.getByPlaceholderText('Write a message…')
    await user.type(area, 'Hi{Control>}{Enter}{/Control}')
    expect(onSend).toHaveBeenCalledWith('Hi', null)
  })
})
