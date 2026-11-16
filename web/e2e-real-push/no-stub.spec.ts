import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "..");

const forbidden = [
  "addInitScript",
  "prototype.subscribe",
  "defineProperty(Notification",
  "deliverPushMessage",
  "waitForTimeout",
  "test.only",
  "describe.only",
];

function sources(): { name: string; text: string }[] {
  const specs = readdirSync(dir)
    .filter((name) => name.endsWith(".ts") && name !== "no-stub.spec.ts")
    .map((name) => path.join(dir, name));
  return [...specs, path.join(root, "playwright.real-push.config.ts")].map((file) => ({
    name: path.basename(file),
    text: readFileSync(file, "utf8"),
  }));
}

test("real push files do not stub the browser push API", () => {
  test.setTimeout(30_000);
  const files = sources();
  expect(files.map((file) => file.name).sort()).toEqual([
    "playwright.real-push.config.ts",
    "real-push.spec.ts",
    "stack.ts",
  ]);
  for (const file of files) {
    for (const pattern of forbidden) {
      expect(file.text.includes(pattern), `${file.name} contains ${pattern}`).toBe(false);
    }
  }
  const spec = files.find((file) => file.name === "real-push.spec.ts")?.text ?? "";
  const config = files.find((file) => file.name === "playwright.real-push.config.ts")?.text ?? "";
  expect(spec).toContain("launchPersistentContext");
  expect(spec).toContain('channel: "chrome"');
  expect(spec).toContain("headless: false");
  expect(spec).toContain('"--disable-background-networking"');
  expect(spec).not.toContain("headless: true");
  expect(config).toContain("retries: 1");
  expect(config).toContain('testDir: "./e2e-real-push"');
  expect(config).not.toContain("headless: true");
});
