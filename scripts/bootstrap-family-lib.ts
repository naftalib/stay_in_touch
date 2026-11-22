/**
 * Argument and env-file guards for bootstrap:family.
 * No network imports, so the tests can run without a package install.
 */

export type BootstrapArgs = {
  envName: "test" | "production";
  family: string;
  email: string;
  label: string;
  force: boolean;
  reset: boolean;
  confirmReset: boolean;
};

/**
 * Reset is test-only. Production is refused before the env file is read.
 * `--confirm-reset` is required. `--force` does not widen a reset.
 */
export function assertResetAllowed(args: BootstrapArgs): void {
  if (args.confirmReset && !args.reset) {
    throw new Error("--confirm-reset is only valid with --reset");
  }
  if (!args.reset) return;
  // Production is refused before --force or a missing confirmation flag.
  if (args.envName !== "test") {
    throw new Error("reset is refused for production");
  }
  if (args.force) {
    throw new Error("reset does not take --force");
  }
  if (!args.confirmReset) {
    throw new Error("reset requires --confirm-reset");
  }
}

export function parseArgs(argv: string[]): BootstrapArgs {
  const values = new Map<string, string>();
  let force = false;
  let reset = false;
  let confirmReset = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--reset") {
      reset = true;
      continue;
    }
    if (arg === "--confirm-reset") {
      confirmReset = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`missing value for --${key}`);
      }
      values.set(key, value);
      i++;
    }
  }
  const envName = values.get("env");
  const family = values.get("family") ?? "";
  const email = values.get("email") ?? "";
  const label = values.get("label") ?? "";
  if (envName !== "test" && envName !== "production") {
    throw new Error("--env must be test or production");
  }
  const args: BootstrapArgs = {
    envName,
    family: family.trim(),
    email: email.trim(),
    label: label.trim(),
    force,
    reset,
    confirmReset,
  };
  // Production reset is refused even when the family and email were omitted.
  assertResetAllowed(args);
  if (args.reset) {
    if (!args.family || !args.email) {
      throw new Error("--family and --email are required");
    }
    return args;
  }
  if (!args.family || !args.email || !args.label) {
    throw new Error("--family, --email, and --label are required");
  }
  return args;
}

export function envFilePath(envName: string, root = Deno.cwd()): string {
  return `${root}/.env.${envName}.local`;
}

export async function assertEnvFileAllowed(path: string): Promise<void> {
  const parent = path.slice(0, Math.max(path.lastIndexOf("/"), 0)) || ".";
  const tracked = new Deno.Command("git", {
    args: ["ls-files", "--error-unmatch", "--", path],
    cwd: parent,
    stdout: "null",
    stderr: "null",
  });
  const result = await tracked.output();
  if (result.code === 0) {
    throw new Error(`refusing to read ${path} because git tracks it`);
  }
}

export function loadEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "kong",
  "host.docker.internal",
]);

/** Same local hosts as the Mailpit transport. A hosted project is anything else. */
export function isLocalSupabaseUrl(url: string): boolean {
  let host = "";
  let protocol = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    protocol = parsed.protocol;
  } catch {
    return false;
  }
  if (LOCAL_HOSTS.has(host) || host.includes("supabase_kong")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  return protocol === "http:" && !host.includes(".");
}

/**
 * Real Actions must not bootstrap a hosted project (public logs, public inputs).
 * CI may bootstrap the local Docker stack, whose URL is a loopback address.
 */
export function assertActionsTargetAllowed(url: string): void {
  if (Deno.env.get("GITHUB_ACTIONS") !== "true") return;
  if (isLocalSupabaseUrl(url)) return;
  throw new Error(
    "bootstrap:family does not run in GitHub Actions against a hosted project",
  );
}

function filled(vars: Record<string, string>, key: string): boolean {
  return Boolean(vars[key]?.trim());
}

/**
 * Names that must be in the env file before any auth user or family row is created.
 * Gmail settings live in that file: GitHub environment secrets are not on this computer.
 */
export function assertEmailConfigured(vars: Record<string, string>): void {
  const transport = vars.EMAIL_TRANSPORT?.trim() ?? "";
  const missing: string[] = [];
  if (!transport) missing.push("EMAIL_TRANSPORT");
  if (!filled(vars, "APP_URL")) missing.push("APP_URL");
  if (!filled(vars, "EMAIL_FROM")) missing.push("EMAIL_FROM");
  if (transport === "gmail") {
    if (!filled(vars, "GMAIL_SMTP_USER")) missing.push("GMAIL_SMTP_USER");
    if (!filled(vars, "GMAIL_SMTP_PASS")) missing.push("GMAIL_SMTP_PASS");
  }
  if (transport === "resend" && !filled(vars, "RESEND_API_KEY")) {
    missing.push("RESEND_API_KEY");
  }
  if (missing.length > 0) {
    throw new Error(
      `env file must set ${missing.join(", ")} before creating a family`,
    );
  }
  if (
    transport !== "mailpit" && transport !== "gmail" && transport !== "resend"
  ) {
    throw new Error("EMAIL_TRANSPORT must be mailpit, gmail, or resend");
  }
}

export function assertReadyToBootstrap(
  vars: Record<string, string>,
  url: string,
): void {
  if (!url.trim() || !filled(vars, "SUPABASE_SECRET_KEY")) {
    throw new Error("env file must set SUPABASE_URL and SUPABASE_SECRET_KEY");
  }
  assertEmailConfigured(vars);
  assertActionsTargetAllowed(url);
}
