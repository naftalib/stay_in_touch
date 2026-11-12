import { test, expect, signInWithPassword, SEED_USERS } from './fixtures.ts'

test('password sign-in and sign-out', async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.grandma)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/sign-in/)
  await page.goBack()
  await expect(page).toHaveURL(/sign-in/)
})
