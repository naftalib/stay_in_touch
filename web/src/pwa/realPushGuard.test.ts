/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const dir = path.join(root, "web/e2e-real-push");

const forbidden = [
  "addInitScript",
  "prototype.subscribe",
  "defineProperty(Notification",
  "deliverPushMessage",
  "waitForTimeout",
  "test.only",
  "describe.only",
];

describe("real push smoke files", () => {
  it("does not stub PushManager or deliver a push through CDP", () => {
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".ts") && name !== "no-stub.spec.ts")
      .map((name) => path.join(dir, name));
    files.push(path.join(root, "web/playwright.real-push.config.ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(text.includes(pattern), `${path.basename(file)} contains ${pattern}`).toBe(false);
      }
    }
    const spec = readFileSync(path.join(dir, "real-push.spec.ts"), "utf8");
    expect(spec).toContain("launchPersistentContext");
    expect(spec).toContain('channel: "chrome"');
    expect(spec).toContain("headless: false");
    expect(spec).toContain('"--disable-background-networking"');
  });
});
