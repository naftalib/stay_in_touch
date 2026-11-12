import { test, expect } from '@playwright/test'

test('sign-in page loads', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(
    page.getByRole('heading', { name: 'Stay In Touch' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Email me a sign-in link' }),
  ).toBeVisible()
})
