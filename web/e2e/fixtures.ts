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
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/sign-in/)
}

export const test = base.extend<{ seedUser: SeedUser }>({
  seedUser: [SEED_USERS.grandma, { option: true }],
})

export { expect } from '@playwright/test'
