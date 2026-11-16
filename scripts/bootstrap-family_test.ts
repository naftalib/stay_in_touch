import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  assertEnvFileAllowed,
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
  assertEquals(args.family, "The Breuning Family");
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

Deno.test("bootstrap refuses a git-tracked env file", async () => {
  const dir = await Deno.makeTempDir();
  await new Deno.Command("git", {
    args: ["init"],
    cwd: dir,
    stdout: "null",
    stderr: "null",
  })
    .output();
  const tracked = `${dir}/.env.test.local`;
  await Deno.writeTextFile(tracked, "SUPABASE_SECRET_KEY=not-a-real-secret\n");
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
});

Deno.test("bootstrap refuses to run in GitHub Actions", async () => {
  const prev = Deno.env.get("GITHUB_ACTIONS");
  Deno.env.set("GITHUB_ACTIONS", "true");
  try {
    await assertRejects(
      () => assertEnvFileAllowed("/tmp/does-not-need-to-exist.env"),
      Error,
      "GitHub Actions",
    );
  } finally {
    if (prev) Deno.env.set("GITHUB_ACTIONS", prev);
    else Deno.env.delete("GITHUB_ACTIONS");
  }
});

Deno.test("env loader does not require the secret to be logged", () => {
  const vars = loadEnvFile(
    "SUPABASE_SECRET_KEY=sb_secret_example_only\nAPP_URL=http://127.0.0.1:5173\n",
  );
  assertEquals(vars.APP_URL, "http://127.0.0.1:5173");
  assertEquals(typeof vars.SUPABASE_SECRET_KEY, "string");
});
