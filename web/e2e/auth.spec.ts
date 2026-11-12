import {
  test,
  expect,
  signInWithPassword,
  signOutFromApp,
  SEED_USERS,
} from './fixtures.ts'

test('password sign-in and sign-out', async ({ page }) => {
  test.setTimeout(60_000)
  await signInWithPassword(page, SEED_USERS.grandma)
  await signOutFromApp(page)
  await page.goBack()
  // History may be empty (about:blank); must not return to a cached thread.
  await expect(page).not.toHaveURL(/\/f\//)
})
