import { test as base, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export type SeedUser = {
  email: string
  password: string
  label: string
}

export const SEED_USERS = {
  mom: {
    email: 'mom@example.test',
    password: 'local-dev-only',
    label: 'Mom',
  },
  grandma: {
    email: 'grandma@example.test',
    password: 'local-dev-only',
    label: 'Grandma',
  },
  noa: {
    email: 'mom+noa@example.test',
    password: 'local-dev-only',
    label: 'Noa',
  },
} satisfies Record<string, SeedUser>

export const FAMILY_ID = 'a0000000-0000-4000-8000-000000000001'

export function resetDatabase() {
  execSync('supabase db reset', { cwd: root, stdio: 'inherit' })
}

export async function signInWithPassword(
  page: import('@playwright/test').Page,
  user: SeedUser,
) {
  await page.goto('/sign-in')
  await page.getByRole('tab', { name: 'Sign in with password' }).click()
  const passwordPanel = page.getByRole('tabpanel', {
    name: 'Sign in with password',
  })
  await passwordPanel.getByRole('textbox', { name: 'Email' }).fill(user.email)
  await passwordPanel.getByRole('textbox', { name: 'Password' }).fill(
    user.password,
  )
  await passwordPanel.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/sign-in/, { timeout: 15_000 })
  await expect(page).toHaveURL(/\/f\/[^/]+\/s\/[^/]+\/messages/, {
    timeout: 15_000,
  })
}

/** Opens the Spaces drawer on narrow viewports. */
export async function ensureSpacesNavOpen(
  page: import('@playwright/test').Page,
) {
  const drawerOpener = page.getByRole('button', { name: 'Spaces' })
  if (await drawerOpener.isVisible()) {
    await drawerOpener.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const nav = dialog.getByRole('navigation', { name: 'Spaces' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link').first()).toBeVisible({ timeout: 15_000 })
  }
}

export function spacesNav(page: import('@playwright/test').Page) {
  return page
    .locator('aside, [role="dialog"]')
    .getByRole('navigation', { name: 'Spaces' })
}

/** Side nav shell (footer with sign-out) for the current viewport. */
export function spacesShell(page: import('@playwright/test').Page) {
  return page.locator('aside, [role="dialog"]')
}

export async function signOutFromApp(page: import('@playwright/test').Page) {
  await ensureSpacesNavOpen(page)
  const signOut = spacesShell(page).getByRole('button', { name: 'Sign out' })
  await signOut.scrollIntoViewIfNeeded()
  await signOut.click({ timeout: 15_000 })
  await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 })
}

export const test = base.extend<{ seedUser: SeedUser }>({
  seedUser: [SEED_USERS.grandma, { option: true }],
})

export { expect } from '@playwright/test'
