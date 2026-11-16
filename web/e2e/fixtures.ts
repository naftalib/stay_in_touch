import { test as base, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export type SeedUser = {
  email: string;
  password: string;
  label: string;
};

export const SEED_USERS = {
  mom: {
    email: "mom@example.test",
    password: "local-dev-only",
    label: "Mom",
  },
  grandma: {
    email: "grandma@example.test",
    password: "local-dev-only",
    label: "Grandma",
  },
  noa: {
    email: "mom+noa@example.test",
    password: "local-dev-only",
    label: "Noa",
  },
  dad: {
    email: "dad@example.test",
    password: "local-dev-only",
    label: "Dad",
  },
  grandpa: {
    email: "grandpa@example.test",
    password: "local-dev-only",
    label: "Grandpa",
  },
} satisfies Record<string, SeedUser>;

export const FAMILY_ID = "a0000000-0000-4000-8000-000000000001";

export function resetDatabase() {
  execSync("supabase db reset", { cwd: root, stdio: "inherit" });
}

export async function signInWithPassword(page: import("@playwright/test").Page, user: SeedUser) {
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Sign in with password" }).click();
  const passwordPanel = page.getByRole("tabpanel", {
    name: "Sign in with password",
  });
  await passwordPanel.getByRole("textbox", { name: "Email" }).fill(user.email);
  await passwordPanel.getByRole("textbox", { name: "Password" }).fill(user.password);
  await passwordPanel.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/sign-in/, { timeout: 30_000 });
  // A database reset restarts the API. The first membership fetch can fail
  // and leave the home page on "Try again" until the containers are ready.
  const home = /\/f\/[^/]+\/s\/[^/]+\/messages/;
  await expect
    .poll(
      async () => {
        if (home.test(page.url())) return "ready";
        const retry = page.getByRole("button", { name: "Try again" });
        if (await retry.isVisible()) await retry.click();
        return "waiting";
      },
      { timeout: 30_000, intervals: [500, 1000, 1000] },
    )
    .toBe("ready");
}

/** Aside on wide viewports; Spaces drawer dialog on narrow viewports. */
function spacesDrawer(page: import("@playwright/test").Page) {
  return page
    .getByRole("dialog")
    .filter({ has: page.getByRole("navigation", { name: "Spaces" }) });
}

/** Opens the Spaces drawer on narrow viewports. A second call is a no-op while the drawer is already open; the opener sits behind the modal and is inert. */
export async function ensureSpacesNavOpen(page: import("@playwright/test").Page) {
  const nav = spacesNav(page);
  const drawerOpener = page.getByRole("button", { name: "Spaces" });
  // Right after sign-in the shell may not be painted yet. Returning before
  // either control exists left the drawer closed, so Switch account was absent.
  await expect
    .poll(async () => (await nav.isVisible()) || (await drawerOpener.isVisible()), {
      timeout: 15_000,
    })
    .toBe(true);
  if (await nav.isVisible()) return;

  await drawerOpener.click();
  const dialog = spacesDrawer(page);
  await expect(dialog).toBeVisible();
  const drawerNav = dialog.getByRole("navigation", { name: "Spaces" });
  await expect(drawerNav).toBeVisible();
  await expect(drawerNav.getByRole("link").first()).toBeVisible({ timeout: 15_000 });
}

export function spacesNav(page: import("@playwright/test").Page) {
  return page
    .locator("aside")
    .getByRole("navigation", { name: "Spaces" })
    .or(spacesDrawer(page).getByRole("navigation", { name: "Spaces" }));
}

/** Side nav shell (footer with sign-out) for the current viewport. */
export function spacesShell(page: import("@playwright/test").Page) {
  return page.locator("aside").or(spacesDrawer(page));
}

export async function signOutFromApp(page: import("@playwright/test").Page) {
  await ensureSpacesNavOpen(page);
  const signOut = spacesShell(page).getByRole("button", { name: "Sign out" });
  await signOut.scrollIntoViewIfNeeded();
  await signOut.click({ timeout: 15_000 });
  await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
}

export async function switchAccountFromApp(page: import("@playwright/test").Page) {
  await ensureSpacesNavOpen(page);
  const switchAccount = spacesShell(page).getByRole("button", { name: "Switch account" });
  await switchAccount.scrollIntoViewIfNeeded({ timeout: 15_000 });
  await switchAccount.click({ timeout: 15_000 });
  await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
}

export const test = base.extend<{ seedUser: SeedUser }>({
  seedUser: [SEED_USERS.grandma, { option: true }],
});

export { expect } from "@playwright/test";
