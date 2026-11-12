import { test, expect, signInWithPassword, SEED_USERS } from './fixtures.ts'

test('post a message in general', async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.mom)
  const body = `Playwright hello ${Date.now()}`
  await page.getByLabel('Message').fill(body)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText(body)).toBeVisible()
})
