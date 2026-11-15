import { test, expect, signInWithPassword, SEED_USERS, FAMILY_ID } from "./fixtures.ts";
import { latestEmailTo, extractOtp } from "./mailpit.ts";
import { accessToken, rpc } from "./api.ts";

test.describe("Invites and admin", () => {
  test("admin members page is hidden from children", async ({ page }) => {
    await signInWithPassword(page, SEED_USERS.noa);
    await page.goto(`/f/${FAMILY_ID}/members`);
    await expect(page.getByRole("heading", { name: /only parents/i })).toBeVisible();
  });

  test("mom can open members admin", async ({ page }) => {
    await signInWithPassword(page, SEED_USERS.mom);
    await page.goto(`/f/${FAMILY_ID}/members`);
    await expect(page.getByRole("heading", { name: "Family members" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite someone" })).toBeVisible();
  });

  test("grandparent invite flow via mail", async ({ browser }, testInfo) => {
    const email = `aunt2+${testInfo.project.name}@example.test`;
    const momToken = await accessToken(SEED_USERS.mom.email);
    const createRes = await rpc(SEED_USERS.mom.email, "create_invitation", {
      p_family_id: FAMILY_ID,
      p_email: email,
      p_role: "grandparent",
      p_label: "Aunt Two",
      p_create_space: false,
    });
    const createBody = await createRes.text();
    expect(createRes.ok, createBody).toBeTruthy();
    const invitationId = JSON.parse(createBody) as string;
    const fnRes = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/invite-send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${momToken}`,
        apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invitation_id: invitationId }),
    });
    const fnBody = await fnRes.text();
    expect(fnRes.ok, fnBody).toBeTruthy();

    const inviteMail = await latestEmailTo(email);
    expect(inviteMail).toBeTruthy();
    const inviteBody = `${inviteMail!.Text ?? ""}\n${inviteMail!.HTML ?? ""}`;
    const link = inviteBody.match(/https?:\/\/[^\s]+invite#[\w-]+/i)?.[0];
    expect(link).toBeTruthy();

    const invitee = await browser.newContext();
    const page = await invitee.newPage();
    await page.goto(link!);
    await expect(page.getByText(/invited you to join/i)).toBeVisible();
    const otpSentAt = new Date();
    await page.getByRole("button", { name: /Email me a sign-in code/i }).click();
    await expect(page.getByRole("textbox", { name: "6-digit code" })).toBeVisible({
      timeout: 30_000,
    });
    const codeMail = await latestEmailTo(email, otpSentAt);
    expect(codeMail).toBeTruthy();
    const code = extractOtp(`${codeMail!.HTML ?? ""} ${codeMail!.Text ?? ""}`);
    expect(code).toBeTruthy();
    await page.getByRole("textbox", { name: "6-digit code" }).fill(code!);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /Join/i }).click();
    await expect(page).toHaveURL(new RegExp(`/f/${FAMILY_ID}`), { timeout: 20_000 });
    await invitee.close();
  });
});