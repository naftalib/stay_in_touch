import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default function globalSetup() {
  execFileSync("supabase", ["db", "reset"], {
    cwd: root,
    stdio: "inherit",
  });
}
