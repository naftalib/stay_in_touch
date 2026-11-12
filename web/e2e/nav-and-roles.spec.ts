import {
  test,
  expect,
  signInWithPassword,
  ensureSpacesNavOpen,
  spacesNav,
  SEED_USERS,
  FAMILY_ID,
} from './fixtures.ts'

test('grandma sees all spaces', async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.grandma)
  await ensureSpacesNavOpen(page)
  const nav = spacesNav(page)
  await expect(nav.getByRole('link', { name: 'General' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Mom' })).toBeVisible()
})

test('noa sees limited nav', async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.noa)
  await ensureSpacesNavOpen(page)
  const nav = spacesNav(page)
  await expect(nav.getByRole('link', { name: 'General' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Noa' })).toBeVisible()
  await expect(nav.getByText('Ari', { exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Mom' })).toHaveCount(0)
})

test('unavailable space for noa', async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.noa)
  await page.goto(
    `/f/${FAMILY_ID}/s/a3000000-0000-4000-8000-000000000005/messages`,
  )
  await expect(
    page.getByRole('heading', { name: "This space isn't available" }),
  ).toBeVisible()
})
