import { createClient } from "@supabase/supabase-js";
import {
  test,
  expect,
  signInWithPassword,
  ensureSpacesNavOpen,
  spacesNav,
  SEED_USERS,
  FAMILY_ID,
} from "./fixtures.ts";
import { SPACES, accessToken } from "./api.ts";

test("two people see inserts, edits, and deletes live", async ({ browser }) => {
  test.setTimeout(90_000);
  const grandmaContext = await browser.newContext();
  const noaContext = await browser.newContext();
  const grandma = await grandmaContext.newPage();
  const noa = await noaContext.newPage();

  await signInWithPassword(grandma, SEED_USERS.grandma);
  await signInWithPassword(noa, SEED_USERS.noa);
  await expect(noa.getByText("Welcome to the family.", { exact: true })).toBeVisible();

  const body = `Live hello ${Date.now()}`;
  await grandma.getByRole("main").getByRole("textbox", { name: "Message" }).fill(body);
  await grandma.getByRole("main").getByRole("button", { name: "Send" }).click();
  await expect(noa.getByText(body, { exact: true })).toBeVisible();

  const article = grandma.getByRole("article", { name: new RegExp(body) });
  await article.getByRole("button", { name: "More actions" }).click();
  await grandma.getByRole("menuitem", { name: "Edit" }).click();
  const edited = `${body} edited`;
  await grandma.getByRole("textbox", { name: "Edit message" }).fill(edited);
  await grandma.getByRole("button", { name: "Save" }).click();
  await expect(noa.getByText(edited, { exact: true })).toBeVisible();

  await grandma
    .getByRole("article", { name: new RegExp(`${body} edited`) })
    .getByRole("button", { name: "More actions" })
    .click();
  await grandma.getByRole("menuitem", { name: "Delete" }).click();
  await grandma.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(noa.getByText(edited, { exact: true })).toHaveCount(0);

  await noaContext.close();
  await grandmaContext.close();
});

test("unread badges follow other spaces and hidden spaces stay hidden", async ({ browser }) => {
  test.setTimeout(90_000);
  const grandmaContext = await browser.newContext();
  const noaContext = await browser.newContext();
  const grandma = await grandmaContext.newPage();
  const noa = await noaContext.newPage();

  await signInWithPassword(noa, SEED_USERS.noa);
  await signInWithPassword(grandma, SEED_USERS.grandma);
  await ensureSpacesNavOpen(noa);
  await spacesNav(noa).getByRole("link", { name: /Noa/ }).click();
  await expect(noa.getByText("This is my space.")).toBeVisible();
  await ensureSpacesNavOpen(noa);
  await expect(
    spacesNav(noa).getByRole("link", { name: /Noa's space, \d+ new message/ }),
  ).toHaveCount(0);
  await spacesNav(noa)
    .getByRole("link", { name: /General/ })
    .click();
  await expect(noa.getByText("Welcome to the family.", { exact: true })).toBeVisible();

  await grandma.goto(`/f/${FAMILY_ID}/s/${SPACES.noa}/messages`);
  const privateBody = `For Noa ${Date.now()}`;
  await grandma.getByRole("main").getByRole("textbox", { name: "Message" }).fill(privateBody);
  await grandma.getByRole("main").getByRole("button", { name: "Send" }).click();
  await expect(grandma.getByRole("article", { name: new RegExp(privateBody) })).toBeVisible();

  await ensureSpacesNavOpen(noa);
  const nav = spacesNav(noa);
  await expect(nav.getByRole("link", { name: /Noa's space, 1 new message/ })).toBeVisible();

  await nav.getByRole("link", { name: /Noa/ }).click();
  await expect(noa.getByText(privateBody, { exact: true })).toBeVisible();
  await ensureSpacesNavOpen(noa);
  await expect(
    spacesNav(noa).getByRole("link", { name: /Noa's space, \d+ new message/ }),
  ).toHaveCount(0);

  const hidden = `Mom only ${Date.now()}`;
  await grandma.goto(`/f/${FAMILY_ID}/s/${SPACES.mom}/messages`);
  await grandma.getByRole("main").getByRole("textbox", { name: "Message" }).fill(hidden);
  await grandma.getByRole("main").getByRole("button", { name: "Send" }).click();
  await expect(grandma.getByRole("article", { name: new RegExp(hidden) })).toBeVisible();
  await expect(noa.getByText(hidden)).toHaveCount(0);

  const token = await accessToken(SEED_USERS.noa.email);
  const client = createClient(
    process.env.VITE_SUPABASE_URL ?? "",
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
  );
  await client.realtime.setAuth(token);
  let received = 0;
  const channel = client
    .channel(`space:${SPACES.mom}`, { config: { private: true } })
    .on("broadcast", { event: "INSERT" }, () => {
      received += 1;
    });
  const status = await new Promise<string>((resolve) => {
    void channel.subscribe((next) => {
      if (next === "SUBSCRIBED" || next === "CHANNEL_ERROR" || next === "TIMED_OUT") {
        resolve(next);
      }
    });
  });
  const probe = `Probe ${Date.now()}`;
  await grandma.getByRole("main").getByRole("textbox", { name: "Message" }).fill(probe);
  await grandma.getByRole("main").getByRole("button", { name: "Send" }).click();
  await expect(grandma.getByRole("article", { name: new RegExp(probe) })).toBeVisible();
  expect(received).toBe(0);
  expect(["CHANNEL_ERROR", "TIMED_OUT", "SUBSCRIBED"]).toContain(status);
  await client.removeChannel(channel);

  await noaContext.close();
  await grandmaContext.close();
});
