import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Composer from './Composer.tsx'

describe('Composer', () => {
  it('disables send when empty', () => {
    render(<Composer onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
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
