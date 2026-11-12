import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect, signInWithPassword, SEED_USERS } from "./fixtures.ts";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("sign-in has no axe violations", async ({ page }) => {
  await page.goto("/sign-in");
  await expectNoAxeViolations(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoAxeViolations(page);
});

test("general thread has no axe violations in light and dark", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.grandma);
  await expect(page.getByText("Welcome to the family.", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoAxeViolations(page);
});

test("unavailable space and the delete dialog have no axe violations", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.noa);
  await page.goto(
    "/f/a0000000-0000-4000-8000-000000000001/s/a3000000-0000-4000-8000-000000000005/messages",
  );
  await expect(page.getByRole("heading", { name: "This space isn't available" })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto("/");
  await expect(page.getByText("Welcome to the family.", { exact: true })).toBeVisible();
  const mine = page.getByRole("article", { name: /Hi Mom!/ });
  await mine.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("extra large text at 320px does not scroll sideways", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("stay-text-size", "extraLarge");
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await signInWithPassword(page, SEED_USERS.grandma);
  await expect(page.getByText("Welcome to the family.", { exact: true })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBeTruthy();
  await expectNoAxeViolations(page);
});

test("keyboard opens and closes the spaces drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await signInWithPassword(page, SEED_USERS.grandma);
  const spaces = page.getByRole("button", { name: "Spaces" });
  await spaces.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(spaces).toBeFocused();
});

test("keyboard can post a message", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.mom);
  const body = `Keyboard ${Date.now()}`;
  const composer = page.getByRole("main").getByRole("textbox", { name: "Message" });
  await composer.focus();
  await page.keyboard.type(body);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article", { name: new RegExp(body) })).toBeVisible();
});

test("sign-in fields are reachable from the keyboard", async ({ page }) => {
  await page.goto("/sign-in");
  const email = page.getByRole("textbox", { name: "Email" });
  for (let i = 0; i < 8 && !(await email.evaluate((el) => el === document.activeElement)); i += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(email).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Password" })).toBeFocused();
});
