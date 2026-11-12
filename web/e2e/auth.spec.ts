import {
  test,
  expect,
  signInWithPassword,
  signOutFromApp,
  SEED_USERS,
} from './fixtures.ts'

test('password sign-in and sign-out', async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.grandma)
  await signOutFromApp(page)
  await page.goBack()
  await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 })
})
