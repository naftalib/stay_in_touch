import { test, expect, signInWithPassword, signOutFromApp, SEED_USERS } from "./fixtures.ts";
import { psql } from "./api.ts";
import { extractMagicLink, extractOtp, latestEmailTo } from "./mailpit.ts";

const MISMATCH = "That email and password don't match.";
const GENERIC_OTP =
  "If this email is on the family list, we've sent a link and a 6-digit code. It works for one hour.";

test("password sign-in and sign-out", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.grandma);
  await signOutFromApp(page);
  await expect(page.getByText("You've been signed out. Please sign in again.")).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/\/f\//);
  await expect(page.getByText("Welcome to the family.", { exact: true })).toHaveCount(0);
});

test("wrong password and unknown email look the same", async ({ page }) => {
  await page.goto("/sign-in");
  const panel = page.getByRole("tabpanel", { name: "Sign in with password" });
  await panel.getByRole("textbox", { name: "Email" }).fill(SEED_USERS.mom.email);
  await panel.getByRole("textbox", { name: "Password" }).fill("not-the-password");
  await panel.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText(MISMATCH);

  await panel.getByRole("textbox", { name: "Email" }).fill("nobody@example.test");
  await panel.getByRole("textbox", { name: "Password" }).fill("not-the-password");
  await panel.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText(MISMATCH);
});

test("unknown email gets the generic confirmation and no account", async ({ page }) => {
  const email = "stranger@example.test";
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Email me a sign-in link" }).click();
  const panel = page.getByRole("tabpanel", { name: "Email me a sign-in link" });
  await panel.getByRole("textbox", { name: "Email" }).fill(email);
  await panel.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(panel.getByRole("status")).toHaveText(GENERIC_OTP);
  expect(psql(`select count(*) from auth.users where email = '${email}'`)).toBe("0");
});

test("magic link signs in the same browser", async ({ page }) => {
  const sentAt = new Date();
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Email me a sign-in link" }).click();
  const panel = page.getByRole("tabpanel", { name: "Email me a sign-in link" });
  await panel.getByRole("textbox", { name: "Email" }).fill(SEED_USERS.grandpa.email);
  await panel.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(panel.getByRole("status")).toBeVisible();

  const mail = await latestEmailTo(SEED_USERS.grandpa.email, sentAt);
  expect(mail?.HTML).toBeTruthy();
  const link = extractMagicLink(mail?.HTML ?? "");
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL(/\/f\/[^/]+\/s\/[^/]+\/messages/, {
    timeout: 20_000,
  });
  await expect(page.getByText("Welcome to the family.", { exact: true })).toBeVisible();
});

test("a 6-digit code signs in", async ({ page }) => {
  const sentAt = new Date();
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Email me a sign-in link" }).click();
  const panel = page.getByRole("tabpanel", { name: "Email me a sign-in link" });
  await panel.getByRole("textbox", { name: "Email" }).fill(SEED_USERS.dad.email);
  await panel.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(panel.getByRole("status")).toBeVisible();

  const mail = await latestEmailTo(SEED_USERS.dad.email, sentAt);
  const code = extractOtp(`${mail?.HTML ?? ""} ${mail?.Text ?? ""}`);
  expect(code).toMatch(/^\d{6}$/);
  await panel.getByRole("textbox", { name: "6-digit code" }).fill(code!);
  await panel.getByRole("button", { name: "Sign in with code" }).click();
  await expect(page).toHaveURL(/\/f\/[^/]+\/s\/[^/]+\/messages/, {
    timeout: 20_000,
  });
});

test("open redirects in next are ignored", async ({ page }) => {
  for (const next of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
    await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
    const panel = page.getByRole("tabpanel", { name: "Sign in with password" });
    await panel.getByRole("textbox", { name: "Email" }).fill(SEED_USERS.grandma.email);
    await panel.getByRole("textbox", { name: "Password" }).fill(SEED_USERS.grandma.password);
    await panel.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:5173\/f\//);
    expect(page.url()).not.toContain("evil.example");
    await signOutFromApp(page);
  }
});
