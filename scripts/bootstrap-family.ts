/**
 * Create the first family and send the admin invite.
 * Run on Naftali's computer. Refuses a git-tracked env file, and refuses
 * GitHub Actions when the project URL is not the local stack.
 *
 * pnpm bootstrap:family --env test|production --family "The Breuning Family" --email person@example.test --label "Mom"
 *
 * Test only, to remove an unjoined family and bootstrap a different address:
 * pnpm bootstrap:family --env test --reset --confirm-reset --family "Test Family" --email person@example.test
 */
import {
  createClient,
  type SupabaseClient,
  type User,
} from "npm:@supabase/supabase-js@2.119.0";
import { sendEmail } from "../supabase/functions/_shared/email.ts";
import { buildInviteUrl } from "../supabase/functions/_shared/inviteLink.ts";
import { buildInviteEmail } from "../supabase/functions/_shared/templates/invite.ts";
import {
  assertActionsTargetAllowed,
  assertEnvFileAllowed,
  assertReadyToBootstrap,
  assertResetAllowed,
  type BootstrapArgs,
  envFilePath,
  loadEnvFile,
  parseArgs,
} from "./bootstrap-family-lib.ts";

export {
  assertEnvFileAllowed,
  assertReadyToBootstrap,
  assertResetAllowed,
  type BootstrapArgs,
  envFilePath,
  loadEnvFile,
  parseArgs,
};

function applyEnv(vars: Record<string, string>): void {
  for (const [key, value] of Object.entries(vars)) {
    Deno.env.set(key, value);
  }
}

async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  for (let page = 1; page <= 20; page++) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw new Error("could not look up the auth user");
    const match = listed.data.users.find((user) =>
      user.email?.toLowerCase() === email.toLowerCase()
    );
    if (match?.id) return match;
    if (listed.data.users.length < 200) break;
  }
  return null;
}

async function confirmUser(admin: SupabaseClient, userId: string): Promise<void> {
  const updated = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });
  if (updated.error) throw new Error("could not confirm the auth user");
}

/**
 * Public signup is closed. GoTrue treats an unconfirmed address as a signup,
 * so the invite code returns signup_disabled unless the user is confirmed
 * (ADR 0060, ADR 0112). A re-run confirms an existing unconfirmed user.
 */
async function findOrCreateUser(
  admin: SupabaseClient,
  email: string,
  label: string,
): Promise<string> {
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: label },
  });
  if (!created.error && created.data.user?.id) {
    if (!created.data.user.email_confirmed_at) {
      await confirmUser(admin, created.data.user.id);
    }
    return created.data.user.id;
  }

  const message = created.error?.message.toLowerCase() ?? "";
  const exists = message.includes("already") ||
    message.includes("registered") ||
    message.includes("exists");
  if (created.error && !exists) {
    throw new Error("could not create the auth user");
  }

  const match = await findUserByEmail(admin, email);
  if (!match?.id) throw new Error("could not find the auth user");
  if (!match.email_confirmed_at) await confirmUser(admin, match.id);
  return match.id;
}

async function runReset(args: BootstrapArgs, root: string): Promise<void> {
  assertResetAllowed(args);
  const path = envFilePath(args.envName, root);
  await assertEnvFileAllowed(path);
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch {
    throw new Error(`missing ${path}`);
  }
  const vars = loadEnvFile(text);
  const url = vars.SUPABASE_URL ?? "";
  const secret = vars.SUPABASE_SECRET_KEY ?? "";
  if (!url.trim() || !secret.trim()) {
    throw new Error("env file must set SUPABASE_URL and SUPABASE_SECRET_KEY");
  }
  assertActionsTargetAllowed(url);

  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("reset_unjoined_bootstrap_family", {
    p_family_name: args.family,
    p_email: args.email,
    p_confirm: "confirm-reset",
  });
  if (error) {
    const detail = error.message.replace(/[\r\n]+/g, " ").slice(0, 240);
    throw new Error(detail ? `reset failed: ${detail}` : "reset failed");
  }
  const removed = data === true ||
    (Array.isArray(data) && data.length === 1 && data[0] === true);
  const absent = data === false ||
    (Array.isArray(data) && data.length === 1 && data[0] === false);
  if (!removed && !absent) throw new Error("reset failed");
  console.log(removed ? "test family removed" : "nothing to reset");
}

export async function runBootstrap(
  args: BootstrapArgs,
  root = Deno.cwd(),
): Promise<void> {
  // Reset never reads a production env file and never creates a user.
  assertResetAllowed(args);
  if (args.reset) {
    await runReset(args, root);
    return;
  }

  const path = envFilePath(args.envName, root);
  await assertEnvFileAllowed(path);
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch {
    throw new Error(`missing ${path}`);
  }
  const vars = loadEnvFile(text);
  const url = vars.SUPABASE_URL ?? "";
  const secret = vars.SUPABASE_SECRET_KEY ?? "";
  // Email settings and the hosted-Actions refusal run before any user or invite exists.
  assertReadyToBootstrap(vars, url);
  applyEnv(vars);

  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!args.force) {
    const existing = await admin
      .from("family_members")
      .select("id")
      .eq("status", "active")
      .limit(1);
    if (existing.error) throw new Error("could not check existing families");
    if ((existing.data ?? []).length > 0) {
      throw new Error(
        "refusing: this project already has a family with members. Pass --force to continue.",
      );
    }
  }

  const userId = await findOrCreateUser(admin, args.email, args.label);
  const { data, error } = await admin.rpc("bootstrap_family", {
    p_user_id: userId,
    p_family_name: args.family,
    p_email: args.email,
    p_label: args.label,
  });
  if (error) {
    const detail = error.message.replace(/[\r\n]+/g, " ").slice(0, 240);
    throw new Error(
      detail ? `bootstrap_family failed: ${detail}` : "bootstrap_family failed",
    );
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    token?: string | null;
    reused?: boolean;
  } | null;
  if (!row) throw new Error("bootstrap_family returned nothing");

  if (!row.token) {
    console.log(
      row.reused
        ? "family already has this admin; nothing sent"
        : "no invite token",
    );
    return;
  }

  const appUrl = Deno.env.get("APP_URL");
  if (!appUrl) throw new Error("APP_URL is not set");
  const inviteUrl = buildInviteUrl(appUrl, row.token);
  const mail = buildInviteEmail({
    familyName: args.family,
    inviterName: args.label,
    label: args.label,
    inviteUrl,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });
  await sendEmail({
    to: args.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  console.log(row.reused ? "invite sent again" : "family ready; invite sent");
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(Deno.args);
    await runBootstrap(args);
  } catch (caught) {
    const message = caught instanceof Error
      ? caught.message
      : "bootstrap failed";
    console.error(message);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
