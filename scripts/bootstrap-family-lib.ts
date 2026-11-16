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
};

export function parseArgs(argv: string[]): BootstrapArgs {
  const values = new Map<string, string>();
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force") {
      force = true;
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
  if (!family.trim() || !email.trim() || !label.trim()) {
    throw new Error("--family, --email, and --label are required");
  }
  return {
    envName,
    family: family.trim(),
    email: email.trim(),
    label: label.trim(),
    force,
  };
}

export function envFilePath(envName: string, root = Deno.cwd()): string {
  return `${root}/.env.${envName}.local`;
}

export async function assertEnvFileAllowed(path: string): Promise<void> {
  if (Deno.env.get("GITHUB_ACTIONS") === "true") {
    throw new Error("bootstrap:family does not run in GitHub Actions");
  }
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
