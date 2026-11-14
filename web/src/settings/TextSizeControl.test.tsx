import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import TextSizeControl from './TextSizeControl.tsx'

describe('TextSizeControl', () => {
  it('sets data-text-size on change', async () => {
    const user = userEvent.setup()
    render(<TextSizeControl />)
    await user.click(screen.getByRole('radio', { name: 'Large' }))
    expect(document.documentElement.dataset.textSize).toBe('large')
  })
})
