import { test, expect, signInWithPassword, SEED_USERS } from './fixtures.ts'

test('post a message in general', async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.mom)
  const body = `Playwright hello ${Date.now()}`
  const composer = page.getByRole('main').getByRole('textbox', {
    name: 'Message',
  })
  await expect(composer).toBeVisible({ timeout: 15_000 })
  await composer.fill(body)
  await page.getByRole('main').getByRole('button', { name: 'Send' }).click()
  await expect(
    page.getByRole('main').getByText(body, { exact: true }).first(),
  ).toBeVisible({ timeout: 15_000 })
})
