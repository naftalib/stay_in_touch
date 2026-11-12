import { test, expect, signInWithPassword, SEED_USERS } from './fixtures.ts'

test.skip('realtime between two users', async () => {
  expect(true).toBe(true)
})

test('realtime placeholder skips without stack', () => {
  test.skip(!process.env.VITE_SUPABASE_URL, 'Requires local Supabase')
})
