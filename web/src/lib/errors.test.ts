import { describe, expect, it } from 'vitest'
import { mapError } from './errors.ts'

describe('mapError', () => {
  it('maps permission errors', () => {
    const mapped = mapError({ code: '42501', message: 'permission denied' })
    expect(mapped.title).toBe("You don't have permission to do that.")
  })

  it('maps last-admin errors in plain language', () => {
    const mapped = mapError({
      code: '42501',
      message: 'cannot remove the last admin',
    })
    expect(mapped.title).toContain('at least one parent')
  })

  it('maps network failures', () => {
    const mapped = mapError(new Error('Failed to fetch'))
    expect(mapped.title).toContain('offline')
    expect(mapped.retryable).toBe(true)
  })
})
