import type { Page } from "@playwright/test";
import {
  test,
  expect,
  signInWithPassword,
  signOutFromApp,
  ensureSpacesNavOpen,
  spacesNav,
  SEED_USERS,
  FAMILY_ID,
} from "./fixtures.ts";
import {
  FAMILY_ID as FAMILY,
  FORBIDDEN_BODIES,
  MESSAGES,
  OTHER_FAMILY_ID,
  SPACES,
  accessToken,
  psql,
  restGet,
  rpc,
} from "./api.ts";

const SPACE_TITLES = ["General", "Mom", "Dad", "Noa", "Ari"] as const;

function watchRest(page: Page): string[] {
  const bodies: string[] = [];
  page.on("response", (response) => {
    if (!response.url().includes("/rest/v1/")) return;
    void response
      .text()
      .then((text) => bodies.push(text))
      .catch(() => undefined);
  });
  return bodies;
}

async function expectUnavailable(page: Page, path: string) {
  const bodies = watchRest(page);
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "This space isn't available" })).toBeVisible();
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  const payload = bodies.join("\n");
  for (const forbidden of FORBIDDEN_BODIES) {
    expect(payload).not.toContain(forbidden);
  }
  const html = await page.content();
  for (const forbidden of FORBIDDEN_BODIES) {
    expect(html).not.toContain(forbidden);
  }
}

test("grandma sees every family space and no grandparent space", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.grandma);
  await ensureSpacesNavOpen(page);
  const nav = spacesNav(page);
  for (const title of SPACE_TITLES) {
    await expect(nav.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: /Grandma|Grandpa/ })).toHaveCount(0);
});

test("noa sees only general, her space, and ari as plain text", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.noa);
  await expect(page.getByText(/can see this space/i)).toBeVisible();
  await ensureSpacesNavOpen(page);
  const nav = spacesNav(page);
  await expect(nav.getByRole("link", { name: /General/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Noa/ })).toBeVisible();
  await expect(nav.getByText("Ari", { exact: true })).toBeVisible();
  await expect(nav.getByText("Private", { exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Ari/ })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /^Mom/ })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /^Dad/ })).toHaveCount(0);

  const html = await page.content();
  expect(html).not.toContain(SPACES.mom);
  expect(html).not.toContain(SPACES.dad);
  expect(html).not.toContain(SPACES.ari);
  expect(html).not.toContain("Notes from Mom.");
  expect(html).not.toContain("Hi from Ari.");
});

test("noa cannot open another space by URL", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.noa);
  const paths = [
    `/f/${FAMILY_ID}/s/${SPACES.ari}/messages`,
    `/f/${FAMILY_ID}/s/${SPACES.mom}/messages`,
    `/f/${FAMILY_ID}/s/${SPACES.dad}/messages`,
    `/f/${FAMILY_ID}/s/${SPACES.mom}/pics`,
    `/f/${FAMILY_ID}/s/${SPACES.dad}/video`,
    `/f/${FAMILY_ID}/s/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/messages`,
    `/f/${FAMILY_ID}/s/not-a-uuid/messages`,
    `/f/${OTHER_FAMILY_ID}/s/${SPACES.general}/messages`,
  ];
  for (const path of paths) {
    await expectUnavailable(page, path);
  }
});

test("deleted seed text stays hidden", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.dad);
  await expect(page.getByText("Message deleted").first()).toBeVisible();
  await expect(page.getByText("This one was deleted.")).toHaveCount(0);

  await signOutFromApp(page);
  await signInWithPassword(page, SEED_USERS.mom);
  await expect(page.getByText("Message deleted").first()).toBeVisible();
  await expect(page.getByText("This one was deleted.")).toHaveCount(0);

  for (const user of [SEED_USERS.grandma, SEED_USERS.noa]) {
    await signOutFromApp(page);
    await signInWithPassword(page, user);
    await expect(page.getByText("Welcome to the family.", { exact: true })).toBeVisible();
    await expect(page.getByText("This one was deleted.")).toHaveCount(0);
  }
});

test("a quote of a hidden message does not reveal its text", async ({ page }) => {
  psql(`
    insert into public.messages (
      id, space_id, family_id, author_member_id, body, reply_to_id, created_by, created_at
    ) values (
      'a4000000-0000-4000-8000-0000000000aa',
      '${SPACES.general}',
      '${FAMILY}',
      'a2000000-0000-4000-8000-000000000001',
      'Reply to a hidden note.',
      '${MESSAGES.deleted}',
      'a1000000-0000-4000-8000-000000000001',
      now()
    ) on conflict (id) do nothing;
  `);
  await signInWithPassword(page, SEED_USERS.grandma);
  await expect(page.getByText("Reply to a hidden note.")).toBeVisible();
  await expect(page.getByText("Original message unavailable").first()).toBeVisible();
  await expect(page.getByText("This one was deleted.")).toHaveCount(0);
});

test("noa cannot edit someone else and grandma cannot rename a space", async () => {
  const update = await restGet(
    SEED_USERS.noa.email,
    `/rest/v1/messages?id=eq.${MESSAGES.welcome}&select=id,body`,
  );
  expect(update.ok).toBeTruthy();
  const rows = (await update.json()) as { body: string }[];
  expect(rows.some((row) => row.body === "Welcome to the family.")).toBeTruthy();

  const patched = await fetch(
    `${process.env.VITE_SUPABASE_URL}/rest/v1/messages?id=eq.${MESSAGES.welcome}`,
    {
      method: "PATCH",
      headers: {
        apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
        Authorization: `Bearer ${await accessToken(SEED_USERS.noa.email)}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ body: "Noa rewrote Mom" }),
    },
  );
  const patchedRows = (await patched.json()) as unknown;
  expect(Array.isArray(patchedRows) ? patchedRows : []).toEqual([]);
  const still = await restGet(
    SEED_USERS.mom.email,
    `/rest/v1/messages?id=eq.${MESSAGES.welcome}&select=body`,
  );
  const stillRows = (await still.json()) as { body: string }[];
  expect(stillRows[0]?.body).toBe("Welcome to the family.");

  const rename = await rpc(SEED_USERS.grandma.email, "rename_space", {
    p_space_id: SPACES.general,
    p_title: "Renamed by grandma",
  });
  expect(rename.ok).toBeFalsy();
  expect(rename.status).toBeGreaterThanOrEqual(400);
  const failure = (await rename.json()) as { code?: string; message?: string };
  expect(failure.code ?? failure.message).toMatch(/42501|admin/);
});
