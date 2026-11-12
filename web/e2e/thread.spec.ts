import { test, expect, signInWithPassword, SEED_USERS, FAMILY_ID } from "./fixtures.ts";
import { MEMBERS, SPACES, psql, rpc } from "./api.ts";

test("post, quote, edit, and delete a message", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.mom);
  const body = `Playwright hello ${Date.now()}`;
  const composer = page.getByRole("main").getByRole("textbox", { name: "Message" });
  await composer.fill(body);
  await page.getByRole("main").getByRole("button", { name: "Send" }).click();
  const mine = page.getByRole("article", { name: new RegExp(body) });
  await expect(mine).toBeVisible();

  await mine.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Reply" }).click();
  const reply = `Quote reply ${Date.now()}`;
  await composer.fill(reply);
  await page.getByRole("main").getByRole("button", { name: "Send" }).click();
  const replyArticle = page.getByRole("article", { name: new RegExp(reply) });
  await expect(replyArticle).toBeVisible();
  await expect(replyArticle.getByRole("button", { name: new RegExp(body) })).toBeVisible();

  await mine.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edited = `${body} edited`;
  await page.getByRole("textbox", { name: "Edit message" }).fill(edited);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(edited, { exact: true })).toBeVisible();
  await expect(page.getByText("(edited)").first()).toBeVisible();

  const editedArticle = page.getByRole("article", {
    name: new RegExp(edited.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  });
  await editedArticle.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { name: "Delete this message?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
  await expect(page.getByText("Message deleted").first()).toBeVisible();
});

test("message html is rendered as text", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.mom);
  const payload = `<img src="x" alt="xss-${Date.now()}">`;
  const composer = page.getByRole("main").getByRole("textbox", { name: "Message" });
  await composer.fill(payload);
  await page.getByRole("main").getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("article", { name: new RegExp(payload) })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});

test("load older messages keeps the current message in place", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.mom);
  await expect(page.getByText("Welcome to the family.", { exact: true })).toBeVisible();
  const before = await page.evaluate(() => {
    const scroller = document.querySelector("[data-thread-scroller]");
    if (!(scroller instanceof HTMLElement)) return null;
    scroller.scrollTop = 280;
    scroller.dispatchEvent(new Event("scroll"));
    const target = [...scroller.querySelectorAll("article")].find((article) => {
      const rect = article.getBoundingClientRect();
      const box = scroller.getBoundingClientRect();
      return rect.top >= box.top && rect.bottom <= box.bottom;
    });
    if (!target) return null;
    return {
      text: target.textContent ?? "",
      top: target.getBoundingClientRect().top,
    };
  });
  expect(before?.text).toBeTruthy();
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("Load older messages"),
    );
    button?.click();
  });
  await expect(page.getByText(/Older family note #/).first()).toBeVisible();
  const after = await page.evaluate((text) => {
    const scroller = document.querySelector("[data-thread-scroller]");
    const target = [...(scroller?.querySelectorAll("article") ?? [])].find(
      (article) => article.textContent === text,
    );
    return target?.getBoundingClientRect().top ?? null;
  }, before?.text);
  expect(after).not.toBeNull();
  expect(Math.abs((after ?? 0) - (before?.top ?? 0))).toBeLessThan(20);

  const older = page.getByRole("button", { name: "Load older messages" });
  await older.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Older family note #/).nth(1)).toBeVisible();

  for (let i = 0; i < 8; i += 1) {
    const done = await page.evaluate(() => {
      const scroller = document.querySelector("[data-thread-scroller]");
      if (!(scroller instanceof HTMLElement)) return false;
      if (scroller.innerText.includes("Beginning of the thread")) return true;
      const button = [...scroller.querySelectorAll("button")].find((item) =>
        item.textContent?.includes("Load older messages"),
      );
      if (button instanceof HTMLButtonElement) button.click();
      return false;
    });
    if (done) break;
    await expect(page.getByRole("button", { name: "Loading older messages…" })).toHaveCount(0);
  }
  await expect(page.getByText("Older family note #1", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Beginning of the thread")).toBeVisible();
});

test("two messages with the same timestamp both appear once", async ({ page }) => {
  const stamp = "2020-01-01T00:00:00+00:00";
  psql(`
    insert into public.messages (
      id, space_id, family_id, author_member_id, body, created_by, created_at
    ) values
      ('a4000000-0000-4000-8000-0000000000a1', '${SPACES.general}', '${FAMILY_ID}', '${MEMBERS.mom}', 'tie-alpha', 'a1000000-0000-4000-8000-000000000001', '${stamp}'),
      ('a4000000-0000-4000-8000-0000000000a2', '${SPACES.general}', '${FAMILY_ID}', '${MEMBERS.mom}', 'tie-beta', 'a1000000-0000-4000-8000-000000000001', '${stamp}')
    on conflict (id) do nothing;
  `);
  await signInWithPassword(page, SEED_USERS.mom);
  for (let i = 0; i < 8; i += 1) {
    const done = await page.evaluate(() => {
      const scroller = document.querySelector("[data-thread-scroller]");
      if (!(scroller instanceof HTMLElement)) return false;
      if (scroller.innerText.includes("Beginning of the thread")) return true;
      const button = [...scroller.querySelectorAll("button")].find((item) =>
        item.textContent?.includes("Load older messages"),
      );
      if (button instanceof HTMLButtonElement) button.click();
      return false;
    });
    if (done) break;
    await expect(page.getByRole("button", { name: "Loading older messages…" })).toHaveCount(0);
  }
  await expect(page.getByText("tie-alpha", { exact: true })).toHaveCount(1);
  await expect(page.getByText("tie-beta", { exact: true })).toHaveCount(1);
});

test("an archived space has no composer", async ({ page }) => {
  const archived = await rpc(SEED_USERS.mom.email, "archive_space", {
    p_space_id: SPACES.mom,
  });
  expect(archived.ok).toBeTruthy();
  try {
    await signInWithPassword(page, SEED_USERS.mom);
    await page.goto(`/f/${FAMILY_ID}/s/${SPACES.mom}/messages`);
    await expect(
      page.getByText("This space is archived. You can read it but not post."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
  } finally {
    await rpc(SEED_USERS.mom.email, "unarchive_space", { p_space_id: SPACES.mom });
  }
});

test("offline keeps loaded messages and disables sending", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.mom);
  await expect(page.getByText("Welcome to the family.", { exact: true })).toBeVisible();
  await page.context().setOffline(true);
  await expect(
    page.getByText(
      "You're offline. You can read messages you've already loaded. New messages will appear when you're back online.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
  await expect(page.getByText("Welcome to the family.", { exact: true })).toBeVisible();

  const body = `While mom was offline ${Date.now()}`;
  psql(`
    insert into public.messages (
      space_id, family_id, author_member_id, body, created_by
    ) values (
      '${SPACES.general}',
      '${FAMILY_ID}',
      'a2000000-0000-4000-8000-000000000003',
      '${body}',
      'a1000000-0000-4000-8000-000000000003'
    );
  `);

  await page.context().setOffline(false);
  await expect(page.getByRole("article", { name: new RegExp(body) })).toBeVisible();
});
