import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.ts'

test('sign-in has no serious axe violations', async ({ page }) => {
  await page.goto('/sign-in')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
