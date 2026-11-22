import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  assertActionsTargetAllowed,
  assertEmailConfigured,
  assertEnvFileAllowed,
  assertReadyToBootstrap,
  loadEnvFile,
  parseArgs,
} from "./bootstrap-family-lib.ts";

Deno.test("bootstrap args require env, family, email, and label", () => {
  const args = parseArgs([
    "--env",
    "test",
    "--family",
    "The Breuning Family",
    "--email",
    "mom@example.test",
    "--label",
    "Mom",
    "--force",
  ]);
  assertEquals(args.envName, "test");
  assertEquals(args.force, true);
  assertEquals(args.reset, false);
  assertEquals(args.confirmReset, false);
  assertEquals(args.family, "The Breuning Family");
});

Deno.test("reset is refused for production before other flags are accepted", () => {
  for (const argv of [
    ["--env", "production", "--reset"],
    ["--env", "production", "--reset", "--confirm-reset"],
    ["--env", "production", "--reset", "--confirm-reset", "--force"],
    ["--env", "production", "--reset", "--confirm-reset", "--family", "Test Family"],
  ]) {
    try {
      parseArgs(argv);
      throw new Error("expected production refusal");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      assertEquals(message, "reset is refused for production");
    }
  }
});

Deno.test("reset requires confirmation and does not take force", () => {
  try {
    parseArgs([
      "--env",
      "test",
      "--reset",
      "--family",
      "Test Family",
      "--email",
      "mom@example.test",
    ]);
    throw new Error("expected confirmation refusal");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    assertEquals(message, "reset requires --confirm-reset");
  }
  try {
    parseArgs([
      "--env",
      "test",
      "--reset",
      "--confirm-reset",
      "--force",
      "--family",
      "Test Family",
      "--email",
      "mom@example.test",
    ]);
    throw new Error("expected force refusal");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    assertEquals(message, "reset does not take --force");
  }
  try {
    parseArgs([
      "--env",
      "test",
      "--confirm-reset",
      "--family",
      "Test Family",
      "--email",
      "mom@example.test",
      "--label",
      "Mom",
    ]);
    throw new Error("expected flag refusal");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    assertEquals(message, "--confirm-reset is only valid with --reset");
  }
});

Deno.test("reset names the family and email and does not require a label", () => {
  const args = parseArgs([
    "--env",
    "test",
    "--reset",
    "--confirm-reset",
    "--family",
    "Test Family",
    "--email",
    "mom@example.test",
  ]);
  assertEquals(args.reset, true);
  assertEquals(args.confirmReset, true);
  assertEquals(args.force, false);
  assertEquals(args.label, "");
  assertEquals(args.family, "Test Family");
  try {
    parseArgs(["--env", "test", "--reset", "--confirm-reset", "--family", "Test Family"]);
    throw new Error("expected email refusal");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    assertEquals(message, "--family and --email are required");
  }
});

Deno.test("bootstrap rejects a bad env name", () => {
  try {
    parseArgs([
      "--env",
      "staging",
      "--family",
      "A",
      "--email",
      "a@b.co",
      "--label",
      "Mom",
    ]);
    throw new Error("expected rejection");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    assertEquals(message.includes("test or production"), true);
  }
});

Deno.test("bootstrap refuses a git-tracked env file even in Actions", async () => {
  const prev = Deno.env.get("GITHUB_ACTIONS");
  Deno.env.set("GITHUB_ACTIONS", "true");
  const dir = await Deno.makeTempDir();
  try {
    await new Deno.Command("git", {
      args: ["init"],
      cwd: dir,
      stdout: "null",
      stderr: "null",
    }).output();
    const tracked = `${dir}/.env.test.local`;
    await Deno.writeTextFile(
      tracked,
      "SUPABASE_SECRET_KEY=not-a-real-secret\n",
    );
    await new Deno.Command("git", {
      args: ["add", "-f", ".env.test.local"],
      cwd: dir,
      stdout: "null",
      stderr: "null",
    }).output();
    await assertRejects(
      () => assertEnvFileAllowed(tracked),
      Error,
      "git tracks it",
    );
  } finally {
    if (prev === undefined) Deno.env.delete("GITHUB_ACTIONS");
    else Deno.env.set("GITHUB_ACTIONS", prev);
    await Deno.remove(dir, { recursive: true });
  }
});

function withActions<T>(value: string | undefined, run: () => T): T {
  const prev = Deno.env.get("GITHUB_ACTIONS");
  if (value === undefined) Deno.env.delete("GITHUB_ACTIONS");
  else Deno.env.set("GITHUB_ACTIONS", value);
  try {
    return run();
  } finally {
    if (prev === undefined) Deno.env.delete("GITHUB_ACTIONS");
    else Deno.env.set("GITHUB_ACTIONS", prev);
  }
}

Deno.test("bootstrap in Actions allows only a local Supabase URL", () => {
  withActions("true", () => {
    assertActionsTargetAllowed("http://127.0.0.1:54321");
    assertActionsTargetAllowed("http://localhost:54321");
  });
  withActions("true", () => {
    try {
      assertActionsTargetAllowed("https://example.supabase.co");
      throw new Error("expected hosted refusal");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      assertEquals(message.includes("hosted project"), true);
    }
  });
  withActions(undefined, () => {
    assertActionsTargetAllowed("https://example.supabase.co");
  });
});

const mailpitEnv = {
  SUPABASE_SECRET_KEY: "example-only",
  APP_URL: "http://127.0.0.1:5173",
  EMAIL_TRANSPORT: "mailpit",
  EMAIL_FROM: "Stay In Touch <no-reply@example.test>",
};

const gmailEnv = {
  ...mailpitEnv,
  EMAIL_TRANSPORT: "gmail",
  GMAIL_SMTP_USER: "sender@example.test",
  GMAIL_SMTP_PASS: "example-app-password",
  EMAIL_FROM: "Stay In Touch <sender@example.test>",
};

Deno.test("bootstrap names missing email settings and does not echo them", () => {
  try {
    assertEmailConfigured({
      ...gmailEnv,
      GMAIL_SMTP_PASS: "",
      GMAIL_SMTP_USER: "sentinel-user-should-not-print",
    });
    throw new Error("expected missing pass");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    assertEquals(message.includes("GMAIL_SMTP_PASS"), true);
    assertEquals(message.includes("sentinel-user-should-not-print"), false);
    assertEquals(message.includes("example-app-password"), false);
  }
  assertEmailConfigured(mailpitEnv);
  assertEmailConfigured(gmailEnv);
});

Deno.test("bootstrap checks email settings and the hosted URL before creating a user", async () => {
  const source = await Deno.readTextFile(
    new URL("./bootstrap-family.ts", import.meta.url),
  );
  const gate = source.indexOf("assertResetAllowed(");
  const check = source.indexOf("assertReadyToBootstrap(");
  const create = source.indexOf("await findOrCreateUser");
  const rpc = source.indexOf('rpc("bootstrap_family"');
  const resetRpc = source.indexOf('rpc("reset_unjoined_bootstrap_family"');
  assertEquals(gate > 0 && gate < check, true);
  assertEquals(check > 0 && create > check && rpc > check, true);
  assertEquals(resetRpc > gate && create > resetRpc, true);
  assertEquals(source.includes("email_confirm: true"), true);
  assertEquals(source.includes("updateUserById"), true);
  assertEquals(source.includes("email_confirm: false"), false);

  withActions("true", () => {
    try {
      assertReadyToBootstrap(gmailEnv, "https://example.supabase.co");
      throw new Error("expected hosted refusal");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      assertEquals(message.includes("hosted project"), true);
    }
    assertReadyToBootstrap(mailpitEnv, "http://127.0.0.1:54321");
  });

  try {
    assertReadyToBootstrap(
      {
        SUPABASE_SECRET_KEY: "example-only",
        APP_URL: "https://stay-in-touch.example.workers.dev",
      },
      "https://example.supabase.co",
    );
    throw new Error("expected missing transport");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    assertEquals(message.includes("EMAIL_TRANSPORT"), true);
    assertEquals(message.includes("EMAIL_FROM"), true);
  }
});

Deno.test("env loader does not require the secret to be logged", () => {
  const vars = loadEnvFile(
    "SUPABASE_SECRET_KEY=sb_secret_example_only\nAPP_URL=http://127.0.0.1:5173\n",
  );
  assertEquals(vars.APP_URL, "http://127.0.0.1:5173");
  assertEquals(typeof vars.SUPABASE_SECRET_KEY, "string");
});
