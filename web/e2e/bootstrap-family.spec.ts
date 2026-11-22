import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureSpacesNavOpen,
  expect,
  resetDatabase,
  spacesShell,
  test,
} from "./fixtures.ts";
import { extractOtp, latestEmailTo, type MailMessage } from "./mailpit.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function mailText(mail: MailMessage | null): string {
  return `${mail?.HTML ?? ""} ${mail?.Text ?? ""}`;
}

function inviteLink(mail: MailMessage | null): string | null {
  const decoded = mailText(mail).replaceAll("&amp;", "&");
  const match = decoded.match(/https?:\/\/[^\s"'<>]+\/invite#[A-Za-z0-9_-]+/);
  return match?.[0] ?? null;
}

function localStatus(): Record<string, string> {
  const text = execFileSync("supabase", ["status", "-o", "env"], {
    cwd: root,
    encoding: "utf8",
  });
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out[line.slice(0, eq)] = line.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return out;
}

let createdFamily = false;

test.describe("First family bootstrap", () => {
  test.afterAll(() => {
    rmSync(path.join(root, ".env.test.local"), { force: true });
    if (createdFamily) resetDatabase();
  });

  test("the first parent accepts and becomes admin", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "bootstrap accept runs once");
    if (browserName !== "chromium") return;
    test.setTimeout(180_000);
    createdFamily = true;

    const status = localStatus();
    const secret = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
    const api = status.API_URL;
    if (!secret || !api) {
      throw new Error("local status is missing the API URL or secret key");
    }

    const dir = mkdtempSync(path.join(tmpdir(), "sit-boot-"));
    writeFileSync(
      path.join(root, ".env.test.local"),
      [
        `SUPABASE_URL=${api}`,
        `SUPABASE_SECRET_KEY=${secret}`,
        "APP_URL=http://127.0.0.1:5173",
        "EMAIL_TRANSPORT=mailpit",
        "EMAIL_FROM=Stay In Touch <no-reply@example.test>",
        "MAILPIT_URL=http://127.0.0.1:54324",
        "",
      ].join("\n"),
    );
    rmSync(dir, { recursive: true, force: true });

    const tracked = execSync("git ls-files -- .env.test.local", {
      cwd: root,
      encoding: "utf8",
    });
    expect(tracked.trim()).toBe("");

    const email = "bootstrap+chromium@example.test";
    const family = "Bootstrap Chromium";
    execFileSync(
      "pnpm",
      [
        "bootstrap:family",
        "--env",
        "test",
        "--force",
        "--family",
        family,
        "--email",
        email,
        "--label",
        "Mom",
      ],
      { cwd: root, stdio: "inherit" },
    );

    const inviteMail = await latestEmailTo(email);
    const link = inviteLink(inviteMail);
    expect(link).toBeTruthy();

    await page.goto(link!);
    await expect(page.getByText(/invited you to join/i)).toBeVisible();
    const otpSentAt = new Date();
    await page.getByRole("button", { name: /Email me a sign-in code/i })
      .click();
    await expect(page.getByRole("textbox", { name: "6-digit code" }))
      .toBeVisible({
        timeout: 30_000,
      });
    const codeMail = await latestEmailTo(
      email,
      otpSentAt,
      (message) =>
        !mailText(message).includes("/invite#") &&
        Boolean(extractOtp(mailText(message))),
    );
    const code = extractOtp(mailText(codeMail));
    expect(code).toMatch(/^\d{6}$/);
    await page.getByRole("textbox", { name: "6-digit code" }).fill(code!);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /Join/i }).click();
    await expect(page).toHaveURL(/\/f\/[0-9a-f-]+/, { timeout: 20_000 });
    await ensureSpacesNavOpen(page);
    const shell = spacesShell(page);
    await expect(shell.getByText("Family", { exact: true })).toBeVisible();
    await expect(shell.getByRole("link", { name: "General" })).toBeVisible();
    await expect(shell.getByRole("link", { name: "Mom" })).toBeVisible();
    await expect(shell.getByRole("link", { name: "Members" })).toBeVisible();

    const families = execFileSync(
      "psql",
      [
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        "-At",
        "-c",
        "select count(*) from public.families where name = 'Bootstrap Chromium'",
      ],
      { encoding: "utf8" },
    ).trim();
    expect(families).toBe("1");

    execFileSync(
      "pnpm",
      [
        "bootstrap:family",
        "--env",
        "test",
        "--force",
        "--family",
        family,
        "--email",
        email,
        "--label",
        "Mom",
      ],
      { cwd: root, stdio: "inherit" },
    );
    const again = execFileSync(
      "psql",
      [
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        "-At",
        "-c",
        "select count(*) from public.families where name = 'Bootstrap Chromium'",
      ],
      { encoding: "utf8" },
    ).trim();
    expect(again).toBe("1");
    expect(readFileSync(path.join(root, ".env.test.local"), "utf8")).toContain(
      "SUPABASE_SECRET_KEY=",
    );
  });
});
