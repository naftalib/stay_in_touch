import AxeBuilder from "@axe-core/playwright";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  signInWithPassword,
  signOutFromApp,
  ensureSpacesNavOpen,
  spacesNav,
  spacesShell,
  SEED_USERS,
  FAMILY_ID,
  resetDatabase,
} from "./fixtures.ts";
import { latestEmailTo, extractOtp, type MailMessage } from "./mailpit.ts";
import { accessToken, psql, rpc, SPACES } from "./api.ts";

const COUSINS_ID = "c0000000-0000-4000-8000-000000000002";
const ARI = {
  email: "mom+ari@example.test",
  password: "local-dev-only",
  label: "Ari",
};
const ARI_MEMBER = "a2000000-0000-4000-8000-000000000006";

test.describe("Invites and admin", () => {
  test.afterAll(() => {
    resetDatabase();
  });

  test("non-admins do not see family tools and cannot call them", async ({ browser }) => {
    for (const user of [SEED_USERS.noa, SEED_USERS.grandma]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await signInWithPassword(page, user);
      await ensureSpacesNavOpen(page);
      await expect(spacesNav(page).getByText("Family")).toHaveCount(0);
      await page.goto(`/f/${FAMILY_ID}/members`);
      await expect(page.getByRole("heading", { name: /only parents/i })).toBeVisible();
      await page.goto(`/f/${FAMILY_ID}/spaces`);
      await expect(page.getByRole("heading", { name: /only parents/i })).toBeVisible();
      await context.close();
    }

    const invite = await rpc(SEED_USERS.noa.email, "create_invitation", {
      p_family_id: FAMILY_ID,
      p_email: "blocked@example.test",
      p_role: "member",
      p_label: "Blocked",
      p_create_space: false,
    });
    expect(invite.status).toBe(403);
    const token = await accessToken(SEED_USERS.noa.email);
    const sent = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/invite-send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invitation_id: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(sent.ok).toBeFalsy();
    expect(await sent.text()).not.toMatch(/token/i);
  });

  test("new grandparent joins from the invite email", async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const email = `aunt2+${testInfo.project.name}@example.test`;
    const mom = await browser.newContext();
    const momPage = await mom.newPage();
    await signInWithPassword(momPage, SEED_USERS.mom);
    await momPage.goto(`/f/${FAMILY_ID}/members`);
    await momPage.getByRole("button", { name: "Invite someone" }).click();
    const dialog = momPage.getByRole("dialog", { name: "Invite someone" });
    await dialog.getByRole("textbox", { name: "Email" }).fill(email);
    await dialog.getByRole("textbox", { name: "Name in the app" }).fill("Aunt Two");
    await dialog.locator("select").selectOption("grandparent");
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    await expect(momPage.getByRole("status")).toContainText(/sent/i);

    const inviteMail = await latestEmailTo(email);
    const link = inviteLink(inviteMail);
    expect(link).toBeTruthy();

    const invitee = await browser.newContext();
    const page = await invitee.newPage();
    await page.goto(link!);
    await expect(page.getByText(/invited you to join/i)).toBeVisible();
    await expect(page.getByText("Aunt Two")).toBeVisible();
    const otpSentAt = new Date();
    await page.getByRole("button", { name: /Email me a sign-in code/i }).click();
    await expect(page.getByRole("textbox", { name: "6-digit code" })).toBeVisible({
      timeout: 30_000,
    });
    const codeMail = await latestEmailTo(
      email,
      otpSentAt,
      (message) => !mailText(message).includes("/invite#") && Boolean(extractOtp(mailText(message))),
    );
    const code = extractOtp(mailText(codeMail));
    expect(code).toMatch(/^\d{6}$/);
    await page.getByRole("textbox", { name: "6-digit code" }).fill(code!);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /Join/i }).click();
    await expect(page).toHaveURL(new RegExp(`/f/${FAMILY_ID}/s/`), { timeout: 20_000 });
    await ensureSpacesNavOpen(page);
    await expect(spacesNav(page).getByRole("link", { name: /Mom/ })).toBeVisible();
    await expect(spacesNav(page).getByRole("link", { name: /Dad/ })).toBeVisible();
    await mom.close();
    await invitee.close();
  });

  test("child alias sets a password and can switch back", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const email = `mom+lia-${testInfo.project.name}@example.test`;
    await signInWithPassword(page, SEED_USERS.mom);
    await page.goto(`/f/${FAMILY_ID}/members`);
    await page.getByRole("button", { name: "Invite someone" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite someone" });
    await dialog.getByRole("textbox", { name: "Email" }).fill(email);
    await dialog.getByRole("textbox", { name: "Name in the app" }).fill("Lia");
    await dialog.locator("select").selectOption("member");
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status")).toContainText(/sent/i);

    const inviteMail = await latestEmailTo(email);
    const link = inviteLink(inviteMail);
    expect(link).toBeTruthy();
    await page.goto(link!);
    await expect(page.getByRole("button", { name: /Continue as Lia/i })).toBeVisible();
    await page.getByRole("button", { name: /Continue as Lia/i }).click();
    const otpSentAt = new Date();
    await page.getByRole("button", { name: /Email me a sign-in code/i }).click();
    await expect(page.getByRole("textbox", { name: "6-digit code" })).toBeVisible({
      timeout: 30_000,
    });
    const codeMail = await latestEmailTo(
      email,
      otpSentAt,
      (message) => !mailText(message).includes("/invite#") && Boolean(extractOtp(mailText(message))),
    );
    const code = extractOtp(mailText(codeMail));
    expect(code).toMatch(/^\d{6}$/);
    await page.getByRole("textbox", { name: "6-digit code" }).fill(code!);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /Join/i }).click();
    await expect(page.getByRole("heading", { name: "Choose a password for Lia" })).toBeVisible();
    await expectAxeModes(page);
    await page.getByLabel("Password (at least 8 characters)").fill("lia-pass-1");
    await page.getByRole("button", { name: "Show password" }).click();
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByRole("heading", { name: "Lia is ready" })).toBeVisible();
    await page.getByRole("button", { name: "Stay signed in as Lia" }).click();
    await expect(page).toHaveURL(new RegExp(`/f/${FAMILY_ID}/s/`), { timeout: 20_000 });
    await ensureSpacesNavOpen(page);
    const nav = spacesNav(page);
    await expect(nav.getByRole("link", { name: /General/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Lia/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Mom/ })).toHaveCount(0);

    await signOutFromApp(page);
    await page.getByRole("tab", { name: "Sign in with password" }).click();
    const panel = page.getByRole("tabpanel", { name: "Sign in with password" });
    await panel.getByRole("textbox", { name: "Email" }).fill(email);
    await panel.getByRole("textbox", { name: "Password" }).fill("lia-pass-1");
    await panel.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(new RegExp(`/f/${FAMILY_ID}/s/`), { timeout: 20_000 });
    await ensureSpacesNavOpen(page);
    await spacesShell(page).getByRole("button", { name: "Switch account" }).click();
    await expect(page).toHaveURL(/sign-in/);
    await expect(page.getByRole("button", { name: "Mom", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Mom", exact: true }).click();
    await page.getByRole("tab", { name: "Sign in with password" }).click();
    const momPanel = page.getByRole("tabpanel", { name: "Sign in with password" });
    await momPanel.getByRole("textbox", { name: "Password" }).fill(SEED_USERS.mom.password);
    await momPanel.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(new RegExp(`/f/${FAMILY_ID}/s/`), { timeout: 20_000 });
  });

  test("wrong account cannot accept someone else's invite", async ({ page }) => {
    test.setTimeout(90_000);
    const email = "aunt-wrong@example.test";
    const id = await createAndSend(email, "grandparent", "Aunt Wrong", false);
    expect(id).toBeTruthy();
    const link = inviteLink(await latestEmailTo(email));
    await signInWithPassword(page, SEED_USERS.grandpa);
    await page.goto(link!);
    await expect(page.getByText(/signed in as grandpa@example.test/i)).toBeVisible();
    await page.getByRole("button", { name: /Continue as Aunt Wrong/i }).click();
    await expect(page).toHaveURL(/sign-in|invite/);
    await expect(page.getByRole("button", { name: /Join/i })).toHaveCount(0);
  });

  test("resend rotates the link and cancel stops it", async ({ page }) => {
    test.setTimeout(120_000);
    const email = "resend@example.test";
    await createAndSend(email, "grandparent", "Resend", false);
    const first = inviteLink(await latestEmailTo(email));
    expect(first).toBeTruthy();
    psql(
      `update public.invitations set last_sent_at = now() - interval '2 minutes' where email = '${email}'`,
    );
    await signInWithPassword(page, SEED_USERS.mom);
    await page.goto(`/f/${FAMILY_ID}/members`);
    const row = page.getByRole("main").getByRole("listitem").filter({ hasText: email });
    await row.getByRole("button", { name: "Send again" }).click();
    await expect(page.getByRole("status")).toContainText(/sent/i);
    const second = inviteLink(await latestEmailTo(email, new Date(Date.now() - 5_000)));
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    await page.goto(first!);
    await expect(page.getByRole("heading", { name: /isn't valid/i })).toBeVisible();
    await page.goto(second!);
    await expect(page.getByText(/invited you to join/i)).toBeVisible();

    await page.goto(`/f/${FAMILY_ID}/members`);
    const pending = page.getByRole("main").getByRole("listitem").filter({ hasText: email });
    await pending.getByRole("button", { name: "Cancel invitation" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel invitation" }).click();
    await expect(page.getByRole("status")).toContainText(/cancelled/i);
    await page.goto("about:blank");
    await page.goto(second!);
    await expect(page.getByRole("heading", { name: /cancelled/i })).toBeVisible();
  });

  test("expired invite can be sent again", async ({ page }) => {
    test.setTimeout(90_000);
    const email = "expired@example.test";
    await createAndSend(email, "grandparent", "Expired", false);
    psql(`update public.invitations set expires_at = now() - interval '1 hour' where email = '${email}'`);
    const link = inviteLink(await latestEmailTo(email));
    await page.goto(link!);
    await expect(page.getByRole("heading", { name: /expired/i })).toBeVisible();
    await signInWithPassword(page, SEED_USERS.mom);
    await page.goto(`/f/${FAMILY_ID}/members`);
    const row = page.getByRole("main").getByRole("listitem").filter({ hasText: email });
    await expect(row).toBeVisible();
    psql(
      `update public.invitations set last_sent_at = now() - interval '2 minutes' where email = '${email}'`,
    );
    await row.getByRole("button", { name: "Send again" }).click();
    await expect(page.getByRole("status")).toContainText(/sent/i);
    const renewed = inviteLink(await latestEmailTo(email, new Date(Date.now() - 5_000)));
    await page.goto(renewed!);
    await expect(page.getByText(/invited you to join/i)).toBeVisible();
  });

  test("grandma joins a second family from the pending banner", async ({ page }) => {
    test.setTimeout(120_000);
    psql(`
      insert into public.families (id, name, created_by)
      values ('${COUSINS_ID}', 'Cousins', 'a1000000-0000-4000-8000-000000000001');
      insert into public.family_members (id, family_id, user_id, role, label, status)
      values (
        'c2000000-0000-4000-8000-000000000001',
        '${COUSINS_ID}',
        'a1000000-0000-4000-8000-000000000001',
        'admin',
        'Mom',
        'active'
      );
      insert into public.spaces (id, family_id, kind, owner_member_id, title, sort_order, created_by)
      values (
        'c3000000-0000-4000-8000-000000000001',
        '${COUSINS_ID}',
        'general',
        null,
        'General',
        0,
        'a1000000-0000-4000-8000-000000000001'
      );
    `);
    await createAndSend(SEED_USERS.grandma.email, "grandparent", "Grandma", false, COUSINS_ID);
    await signInWithPassword(page, SEED_USERS.grandma);
    await expect(page.getByRole("heading", { name: /invitation to Cousins/i })).toBeVisible();
    const before = psql(
      `select count(*) from public.family_members where user_id = 'a1000000-0000-4000-8000-000000000003' and status = 'active' and family_id = '${FAMILY_ID}'`,
    );
    expect(before).toBe("1");
    await page.getByRole("button", { name: "Join Cousins" }).click();
    await expect(page.getByRole("heading", { name: "Your families" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("link", { name: "The Example Family" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cousins" })).toBeVisible();
    const after = psql(
      `select count(*) from public.family_members where user_id = 'a1000000-0000-4000-8000-000000000003' and status = 'active' and family_id = '${FAMILY_ID}'`,
    );
    expect(after).toBe("1");
    psql(`
      delete from public.messages where family_id = '${COUSINS_ID}';
      delete from public.spaces where family_id = '${COUSINS_ID}';
      delete from public.family_members where family_id = '${COUSINS_ID}';
      delete from public.invitations where family_id = '${COUSINS_ID}';
      delete from public.audit_log where family_id = '${COUSINS_ID}';
      delete from public.families where id = '${COUSINS_ID}';
    `);
  });

  test("admin can change roles and manage spaces", async ({ page }) => {
    test.setTimeout(150_000);
    const email = "newparent@example.test";
    await createAndSend(email, "member", "New Parent", false);
    psql(
      `update auth.users set encrypted_password = extensions.crypt('local-dev-only', extensions.gen_salt('bf')), email_confirmed_at = now() where email = '${email}'`,
    );
    const link = inviteLink(await latestEmailTo(email));
    const token = new URL(link!).hash.slice(1);
    const accept = await rpc(email, "accept_invitation", { p_token: token });
    expect(accept.ok, await accept.clone().text()).toBeTruthy();

    await signInWithPassword(page, SEED_USERS.mom);
    await page.goto(`/f/${FAMILY_ID}/members`);
    const noa = page.getByRole("main").getByRole("listitem").filter({ hasText: "Noa" }).first();
    await noa.getByRole("button", { name: "Change role" }).click();
    const roleDialog = page.getByRole("dialog", { name: /Change role for Noa/ });
    await roleDialog.locator("select").selectOption("admin");
    await roleDialog.getByRole("button", { name: "Save" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Change role" }).click();
    await expect(page.getByRole("status")).toContainText(/role updated/i);
    await noa.getByRole("button", { name: "Change role" }).click();
    const back = page.getByRole("dialog", { name: /Change role for Noa/ });
    await back.locator("select").selectOption("member");
    await back.getByRole("button", { name: "Save" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Change role" }).click();
    await expect(page.getByRole("status")).toContainText(/role updated/i);

    const dad = page.getByRole("main").getByRole("listitem").filter({ hasText: "Dad" }).first();
    await dad.getByRole("button", { name: "Change role" }).click();
    const dadDialog = page.getByRole("dialog", { name: /Change role for Dad/ });
    await dadDialog.locator("select").selectOption("member");
    await dadDialog.getByRole("button", { name: "Save" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Change role" }).click();
    await expect(page.getByRole("status")).toContainText(/role updated/i);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const momRow = page.getByRole("main").getByRole("listitem").filter({ hasText: "Mom" }).first();
    await momRow.getByRole("button", { name: "Change role" }).click();
    const momDialog = page.getByRole("dialog", { name: /Change role for Mom/ });
    await momDialog.locator("select").selectOption("member");
    await momDialog.getByRole("button", { name: "Save" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Change role" }).click();
    await expect(page.getByRole("alert")).toContainText(/at least one parent/i);
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    const restore = await rpc(SEED_USERS.mom.email, "change_member_role", {
      p_member_id: "a2000000-0000-4000-8000-000000000002",
      p_role: "admin",
    });
    expect(restore.ok, await restore.text()).toBeTruthy();

    await page.goto(`/f/${FAMILY_ID}/spaces`);
    await page.locator("select").selectOption({ label: "New Parent" });
    await page.getByRole("textbox", { name: "Space title" }).fill("New Parent");
    await page.getByRole("button", { name: "Create space" }).click();
    await expect(page.getByRole("status")).toContainText(/created/i);
    const general = page.getByRole("main").getByRole("listitem").filter({ hasText: "General" }).first();
    await general.getByRole("button", { name: "Rename" }).click();
    await general.getByRole("textbox", { name: "Title" }).fill("Everyone");
    await general.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Everyone" })).toBeVisible();
    const momSpace = page.getByRole("main").getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Mom" }) });
    await momSpace.getByRole("button", { name: "Archive" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
    await expect(momSpace).toContainText("Archived");
    await momSpace.getByRole("button", { name: "Unarchive" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Unarchive" }).click();
    await expect(momSpace).not.toContainText("Archived");
  });

  test("removing Ari archives the space and drops access", async ({ browser }) => {
    test.setTimeout(120_000);
    const momContext = await browser.newContext();
    const ariContext = await browser.newContext();
    const mom = await momContext.newPage();
    const ari = await ariContext.newPage();
    await signInWithPassword(mom, SEED_USERS.mom);
    await signInWithPassword(ari, ARI);
    await mom.goto(`/f/${FAMILY_ID}/s/${SPACES.ari}/messages`);
    await expect(mom.getByText("Hi from Ari.", { exact: true })).toBeVisible();

    await mom.goto(`/f/${FAMILY_ID}/members`);
    const row = mom.getByRole("main").getByRole("listitem").filter({ hasText: "Ari" }).first();
    await row.getByRole("button", { name: "Remove from family" }).click();
    await mom.getByRole("alertdialog").getByRole("button", { name: "Remove from family" }).click();
    await expect(mom.getByRole("status")).toContainText(/removed/i);

    await mom.goto(`/f/${FAMILY_ID}/s/${SPACES.ari}/messages`);
    await expect(mom.getByText("Hi from Ari.", { exact: true })).toBeVisible();
    await mom.goto(`/f/${FAMILY_ID}/spaces`);
    await expect(mom.getByRole("main").getByText("Owner: Ari · Archived")).toBeVisible();

    await ari.reload();
    await expect(ari.getByRole("heading", { name: /no longer have access/i })).toBeVisible({
      timeout: 20_000,
    });
    await momContext.close();
    await ariContext.close();

    const archived = psql(
      `select archived_at is not null from public.spaces where id = '${SPACES.ari}'`,
    );
    expect(archived).toBe("t");
    void ARI_MEMBER;
  });

  test("removed member stops receiving realtime after a token refresh", async () => {
    test.setTimeout(90_000);
    const url = process.env.VITE_SUPABASE_URL ?? "";
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
    const noa = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const mom = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const noaSign = await noa.auth.signInWithPassword({
      email: SEED_USERS.noa.email,
      password: SEED_USERS.noa.password,
    });
    expect(noaSign.error).toBeNull();
    const momSign = await mom.auth.signInWithPassword({
      email: SEED_USERS.mom.email,
      password: SEED_USERS.mom.password,
    });
    expect(momSign.error).toBeNull();

    let received = 0;
    const channel = noa
      .channel(`space:${SPACES.general}`, { config: { private: true } })
      .on("broadcast", { event: "INSERT" }, () => {
        received += 1;
      });
    const status = await subscribed(channel);
    expect(status).toBe("SUBSCRIBED");

    const before = received;
    const control = await mom.from("messages").insert({
      space_id: SPACES.general,
      family_id: FAMILY_ID,
      author_member_id: "a2000000-0000-4000-8000-000000000001",
      body: `Control ${Date.now()}`,
      created_by: "a1000000-0000-4000-8000-000000000001",
    });
    expect(control.error).toBeNull();
    await waitFor(() => received > before, 8_000);
    expect(received).toBeGreaterThan(before);

    const removed = await rpc(SEED_USERS.mom.email, "remove_member", {
      p_member_id: "a2000000-0000-4000-8000-000000000005",
    });
    expect(removed.ok, await removed.clone().text()).toBeTruthy();
    const refreshed = await noa.auth.refreshSession();
    expect(refreshed.error).toBeNull();
    await noa.realtime.setAuth(refreshed.data.session?.access_token ?? "");

    const afterRemoval = received;
    const probe = await mom.from("messages").insert({
      space_id: SPACES.general,
      family_id: FAMILY_ID,
      author_member_id: "a2000000-0000-4000-8000-000000000001",
      body: `After removal ${Date.now()}`,
      created_by: "a1000000-0000-4000-8000-000000000001",
    });
    expect(probe.error).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    expect(received).toBe(afterRemoval);

    const rest = await fetch(
      `${url}/rest/v1/messages?space_id=eq.${SPACES.general}&select=id`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${refreshed.data.session?.access_token ?? ""}`,
        },
      },
    );
    const rows = (await rest.json()) as unknown[];
    expect(Array.isArray(rows) ? rows.length : 0).toBe(0);
    await noa.removeChannel(channel);
  });

  test("axe on invite, members, dialogs, and spaces", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      localStorage.setItem("stay-text-size", "extraLarge");
    });
    await page.goto("/invite#not-a-real-token");
    await expect(page.getByRole("heading", { name: /isn't valid/i })).toBeVisible();
    await expectAxeModes(page);

    await signInWithPassword(page, SEED_USERS.mom);
    await page.goto(`/f/${FAMILY_ID}/members`);
    await expect(page.getByRole("heading", { name: "Family members" })).toBeVisible();
    await expectAxeModes(page);

    await page.getByRole("button", { name: "Invite someone" }).click();
    await expect(page.getByRole("dialog", { name: "Invite someone" })).toBeVisible();
    await expectAxeModes(page);
    await page.keyboard.press("Escape");

    await page.getByRole("main").getByRole("listitem").filter({ hasText: "Dad" }).getByRole("button", { name: "Change role" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expectAxeModes(page);
    await page.getByRole("alertdialog").getByRole("button", { name: "Go back" }).click();

    await page.goto(`/f/${FAMILY_ID}/spaces`);
    await expect(page.getByRole("heading", { name: "Family spaces" })).toBeVisible();
    await expectAxeModes(page);
  });
});

function mailText(mail: MailMessage | null): string {
  return `${mail?.HTML ?? ""} ${mail?.Text ?? ""}`;
}

function inviteLink(mail: MailMessage | null): string | null {
  const decoded = mailText(mail).replaceAll("&amp;", "&");
  const match = decoded.match(/https?:\/\/[^\s"'<>]+\/invite#[A-Za-z0-9_-]+/);
  return match?.[0] ?? null;
}

async function createAndSend(
  email: string,
  role: "admin" | "grandparent" | "member",
  label: string,
  createSpace: boolean,
  familyId = FAMILY_ID,
): Promise<string> {
  const createRes = await rpc(SEED_USERS.mom.email, "create_invitation", {
    p_family_id: familyId,
    p_email: email,
    p_role: role,
    p_label: label,
    p_create_space: createSpace,
  });
  expect(createRes.ok, await createRes.clone().text()).toBeTruthy();
  const invitationId = (await createRes.json()) as string;
  const token = await accessToken(SEED_USERS.mom.email);
  const fnRes = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/invite-send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ invitation_id: invitationId }),
  });
  expect(fnRes.ok, await fnRes.text()).toBeTruthy();
  return invitationId;
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function expectAxeModes(page: Page) {
  await page.emulateMedia({ colorScheme: "light" });
  await expectNoAxeViolations(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoAxeViolations(page);
  await page.emulateMedia({ colorScheme: "light" });
}

function subscribed(channel: ReturnType<SupabaseClient["channel"]>): Promise<string> {
  return new Promise((resolve) => {
    void channel.subscribe((next) => {
      if (next === "SUBSCRIBED" || next === "CHANNEL_ERROR" || next === "TIMED_OUT") {
        resolve(next);
      }
    });
  });
}

async function waitFor(check: () => boolean, timeoutMs: number) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
